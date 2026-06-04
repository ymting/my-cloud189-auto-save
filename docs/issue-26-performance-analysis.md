# Issue #26 性能问题分析报告

## 问题描述

用户反馈：600+ 任务时，新版网页打开加载速度极其慢，海报墙模式卡顿，日志报 I/O 错误，SQLite 数据库扛不住。

日志显示单次查询执行时间达到 **1278ms** 和 **1688ms**。

## 问题根因分析

### 1. 数据库层面问题

#### 1.1 查询全字段返回
Task 实体包含 **47 个字段**，每次查询都返回所有字段：

```typescript
// src/entities/index.ts - Task 实体字段数量
@Entity()
export class Task {
    // 47 个字段，包括：
    // id, accountId, shareLink, targetFolderId, videoType, status,
    // lastError, lastCheckTime, lastFileUpdateTime, processingStartTime,
    // resourceName, totalEpisodes, currentEpisodes, lastSavedFileName,
    // lastSavedDisplayText, missingEpisodes, realFolderId, realFolderName,
    // ... (共47个字段)
}
```

#### 1.2 缺少关键索引
从慢查询日志可以看到，WHERE 条件使用了 `enableSystemProxy` 字段，但该字段**没有索引**：

```sql
WHERE (((\"Task\".\"enableSystemProxy\" IS NULL OR \"Task\".\"enableSystemProxy\" = ?)))
ORDER BY \"Task\".\"id\" DESC
```

#### 1.3 SQLite 性能瓶颈
- SQLite 是嵌入式数据库，高并发读写性能有限
- 600+ 条记录的 LEFT JOIN + 全字段查询，在无索引情况下性能急剧下降
- I/O 错误可能是因为并发查询或 WAL 模式下的锁竞争

### 2. API 层面问题

#### 2.1 一次性返回全部数据
```javascript
// src/index.js:535
app.get('/api/tasks', async (req, res) => {
    // 没有分页，一次性返回所有 600+ 任务
    const tasks = await taskRepo.find({
        order: { id: 'DESC' },
        relations: { account: true },
        // ...
    });
    // 返回所有数据，数据量巨大
    res.json({ success: true, data: tasks });
});
```

#### 2.2 查询后额外处理循环
```javascript
// src/index.js:606-629
for (const task of tasks) {
    // 对每个任务进行额外处理
    // 包括：查找账号、获取文件列表、更新任务
    const taskFiles = await taskService.getFilesByTask(task);
    // 这会触发对天翼云盘 API 的调用，极其耗时！
}
```

这个循环在 600+ 任务情况下会：
- 触发 600+ 次数据库查询
- 可能触发 600+ 次天翼云盘 API 调用

#### 2.3 响应数据冗余
返回的每个任务包含 47 个字段，但前端实际只需要约 15 个字段用于列表展示。

### 3. 前端层面问题

#### 3.1 海报墙模式无分页
```javascript
// src/public/js/cinema-background.js:204
const response = await fetch('/api/tasks?status=all&search=');
// 一次性加载所有任务，然后过滤
this.posters = data.data.filter(task => task.tmdbContent).map(...)
```

#### 3.2 每个任务异步请求 TMDB
```javascript
// src/public/js/tasks.js:180-224
async function enrichTaskTmdb(task) {
    // 每个任务都会发起 1-2 次 TMDB API 请求
    const searchResponse = await fetch(`/api/tmdb/search?...`);
    const detailResponse = await fetch(`/api/tmdb/detail?...`);
}
```

600+ 任务 × 2 次 TMDB API = **1200+ 次网络请求**

#### 3.3 无虚拟滚动
媒体墙模式使用传统 DOM 渲染，600+ 任务会创建 600+ 个 DOM 节点，导致：
- 首次渲染时间长
- 滚动卡顿
- 内存占用高

## 性能影响评估

| 问题类型 | 影响程度 | 单次操作耗时估算 |
|---------|---------|----------------|
| 数据库全字段查询 | 高 | 1.2-1.7s |
| 缺少索引 | 高 | 增加 50-100% 查询时间 |
| 查询后循环处理 | 极高 | 600+ × (DB查询 + API调用) |
| 前端 TMDB 请求 | 高 | 600+ × 2 × 网络 RTT |
| DOM 节点过多 | 中 | 渲染 + 滚动性能下降 |

## 修复方案

### 方案一：数据库优化（立即可实施）

#### 1.1 添加数据库索引
```typescript
// src/entities/index.ts
import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['enableSystemProxy'])  // 新增索引
@Index(['status'])              // 新增索引
@Index(['accountId'])           // 新增索引
export class Task {
    // ...
}
```

#### 1.2 优化数据库配置
```javascript
// src/database/index.js
const AppDataSource = new DataSource({
    type: 'sqlite',
    database: path.join(__dirname, '../../data/database.sqlite'),
    synchronize: true,
    logging: ['error'],  // 只记录错误日志
    maxQueryExecutionTime: 500,  // 降低阈值
    enableWAL: true,
    busyTimeout: 5000,  // 增加超时
    // ...
});
```

### 方案二：API 分页改造（推荐）

#### 2.1 后端分页接口
```javascript
// src/index.js
app.get('/api/tasks', async (req, res) => {
    const { status, search, page = 1, pageSize = 50 } = req.query;
    const skip = (page - 1) * pageSize;

    // 构建查询条件
    const whereClause = buildWhereClause(status, search);

    // 分页查询
    const [tasks, total] = await taskRepo.findAndCount({
        where: whereClause,
        order: { id: 'DESC' },
        relations: { account: true },
        select: {
            // 只选择列表展示需要的字段
            id: true,
            resourceName: true,
            shareFolderName: true,
            shareLink: true,
            status: true,
            videoType: true,
            tmdbId: true,
            tmdbTitle: true,
            tmdbContent: true,
            manualTmdbBound: true,
            manualSeason: true,
            realFolderId: true,
            realFolderName: true,
            lastSavedDisplayText: true,
            lastSavedFileName: true,
            missingEpisodes: true,
            lastFileUpdateTime: true,
            remark: true,
            lastError: true,
            enableCron: true,
            currentEpisodes: true,
            totalEpisodes: true,
            account: { username: true }
        },
        skip,
        take: pageSize
    });

    res.json({
        success: true,
        data: tasks,
        pagination: {
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            total,
            totalPages: Math.ceil(total / pageSize)
        }
    });
});
```

#### 2.2 前端分页加载
```javascript
// src/public/js/tasks.js
let currentPage = 1;
let totalPages = 1;
const PAGE_SIZE = 50;

async function fetchTasks(options = {}) {
    const { page = currentPage, append = false } = options;

    const response = await fetch(
        `/api/tasks?status=${taskFilterParams.status}&search=${encodeURIComponent(taskFilterParams.search)}&page=${page}&pageSize=${PAGE_SIZE}`
    );
    const data = await response.json();

    if (data.success) {
        if (!append) {
            taskList = [];
            tbody.innerHTML = '';
        }
        // 渲染任务...
        currentPage = data.pagination.page;
        totalPages = data.pagination.totalPages;
    }
}

// 无限滚动加载
function setupInfiniteScroll() {
    const container = document.querySelector('.table-container');
    container.addEventListener('scroll', () => {
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 100) {
            if (currentPage < totalPages) {
                fetchTasks({ page: currentPage + 1, append: true });
            }
        }
    });
}
```

### 方案三：移除查询后循环处理

```javascript
// src/index.js - 移除或异步化循环处理
app.get('/api/tasks', async (req, res) => {
    // ... 查询任务

    // 移除同步循环处理，改为：
    // 1. 返回原始数据
    res.json({ success: true, data: tasks });

    // 2. 后台异步更新缓存（可选）
    setImmediate(() => {
        updateTaskDisplayCache(tasks).catch(console.error);
    });
});
```

### 方案四：前端虚拟滚动

```javascript
// 使用虚拟滚动库（如 react-window 或自实现）
class VirtualScroller {
    constructor(container, itemHeight, renderItem) {
        this.container = container;
        this.itemHeight = itemHeight;
        this.renderItem = renderItem;
        this.items = [];
        this.visibleStart = 0;
        this.visibleEnd = 0;
        this.init();
    }

    init() {
        this.container.addEventListener('scroll', () => this.onScroll());
        this.onScroll();
    }

    onScroll() {
        const scrollTop = this.container.scrollTop;
        const viewportHeight = this.container.clientHeight;

        this.visibleStart = Math.floor(scrollTop / this.itemHeight);
        this.visibleEnd = Math.min(
            this.visibleStart + Math.ceil(viewportHeight / this.itemHeight) + 2,
            this.items.length
        );

        this.render();
    }

    render() {
        // 只渲染可见区域的项目
        const fragment = document.createDocumentFragment();
        for (let i = this.visibleStart; i < this.visibleEnd; i++) {
            const element = this.renderItem(this.items[i], i);
            element.style.transform = `translateY(${i * this.itemHeight}px)`;
            fragment.appendChild(element);
        }
        this.container.innerHTML = '';
        this.container.appendChild(fragment);
    }

    setItems(items) {
        this.items = items;
        this.container.style.height = `${items.length * this.itemHeight}px`;
        this.onScroll();
    }
}
```

### 方案五：TMDB 批量预加载

```javascript
// 后端新增批量预加载接口
app.get('/api/tasks/tmdb-preview', async (req, res) => {
    const tasks = await taskRepo.find({
        select: ['id', 'tmdbId', 'tmdbContent', 'videoType', 'resourceName'],
        where: { enableSystemProxy: Or(IsNull(), false) }
    });

    // 批量加载缺失的 TMDB 信息
    const tasksNeedingTmdb = tasks.filter(t => !t.tmdbContent && t.tmdbId);
    // ... 批量调用 TMDB API

    res.json({ success: true, data: tasks });
});
```

## 推荐实施优先级

| 优先级 | 方案 | 预期效果 | 实施复杂度 |
|-------|------|---------|-----------|
| P0 | 移除查询后循环处理 | 首屏加载时间减少 80% | 低 |
| P0 | API 分页改造 | 数据传输量减少 90% | 中 |
| P1 | 添加数据库索引 | 查询时间减少 50% | 低 |
| P1 | 字段选择优化 | 数据传输量减少 60% | 低 |
| P2 | 前端虚拟滚动 | 滚动流畅度提升 | 中 |
| P3 | TMDB 批量预加载 | 减少网络请求数 | 中 |

## 快速修复清单

1. **立即修复**：移除 `/api/tasks` 中的循环处理逻辑
2. **短期修复**：实现分页 API + 前端分页加载
3. **中期优化**：添加数据库索引，优化字段选择
4. **长期优化**：引入虚拟滚动，TMDB 批量预加载
