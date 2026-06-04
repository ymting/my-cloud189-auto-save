# Issue #26 性能优化方案

> 版本：v3.0.2
> 日期：2026-06-04

## 一、问题背景

用户反馈：600+ 任务时，网页加载慢、海报墙卡顿、SQLite I/O 错误。

### 根因分析

| 问题 | 影响 | 严重程度 |
|-----|------|---------|
| 数据库缺少索引 | 查询慢 1.2-1.7s | 高 |
| API 无分页 | 一次性返回 600+ 任务 | 高 |
| 查询后循环调用云盘 API | 阻塞加载，最多 20 次 | 极高 |
| TMDB 信息未缓存到数据库 | 每次打开都请求 TMDB API | 中 |
| 无版本更新通知 | 用户不知道新功能 | 低 |

### 已修复项（其他 AI 完成）

- ✅ 数据库索引：`accountId`、`status`、`enableSystemProxy`
- ✅ API 分页：默认 100 条/页
- ✅ TMDB 并发控制：最多 5 个并发请求
- ✅ 前端分页 UI

---

## 二、实施方案

### 方案 A：移除云盘 API 循环调用

**目标：** 彻底消除 `/api/tasks` 接口中的阻塞

**改动文件：** `src/index.js`

**改动内容：** 删除第 610-634 行的循环处理代码

**原代码逻辑：**
```javascript
// 小批量初始化最新转存信息（仅处理前20个需要初始化的任务）
for (const task of tasks) {
    if (initCount >= MAX_INIT_BATCH) break;
    const taskFiles = await taskService.getFilesByTask(task);  // 云盘 API
    // ...
}
```

**删除理由：**
1. 任务执行时已经会更新这些字段
2. 旧任务缺失信息不影响核心功能
3. 不应该为"补数据"阻塞所有用户请求

---

### 方案 B：系统启动时后台异步补全 TMDB 信息

**目标：** 在不影响前端使用的前提下，补全缺失的 TMDB 信息

**改动文件：**

| 文件 | 改动 |
|-----|------|
| `src/services/TmdbBackfillService.js` | 新增后台补全服务 |
| `src/index.js` | 新增 `POST /api/tasks/tmdb-backfill` 接口 |
| `src/index.js` | 启动时调用后台服务 |

**实现逻辑：**

```
系统启动
    ↓
延迟 30 秒后开始（避免启动竞争）
    ↓
查询缺失 tmdbContent 的任务（WHERE tmdbId IS NOT NULL AND tmdbContent IS NULL）
    ↓
按 tmdbId 去重（多个任务可能同一个 TMDB）
    ↓
每批 5 个并发，批次间隔 2 秒
    ↓
调用 TMDB API 获取详情
    ↓
更新数据库 tmdbContent 字段
    ↓
前端请求 /api/tasks 时数据已就绪
```

**控制参数：**

| 参数 | 值 | 说明 |
|-----|-----|------|
| 启动延迟 | 30 秒 | 避免影响系统启动 |
| 并发数 | 5 个 | 同时处理 5 个 TMDB 请求 |
| 批次间隔 | 2 秒 | 每批之间休息，让出资源 |
| 单次最大处理 | 100 个 | 防止长时间运行 |

---

### 方案 C：前端请求成功后回写数据库

**目标：** 前端 TMDB 请求成功后，写入数据库持久化

**改动文件：**

| 文件 | 改动 |
|-----|------|
| `src/index.js` | 新增 `PATCH /api/tasks/:id/tmdb-content` 接口 |
| `src/public/js/tasks.js` | `_doEnrichTaskTmdb` 成功后调用后端保存 |

**接口设计：**

```
PATCH /api/tasks/:id/tmdb-content
Request Body: { tmdbContent: "{...}" }
Response: { success: true }
```

---

### 方案 D：版本更新通知弹窗

**目标：** 版本更新时通知用户，避免频繁打扰

**改动文件：**

| 文件 | 改动 |
|-----|------|
| `src/index.js` | 新增 `GET /api/system/version` 接口 |
| `src/public/index.html` | 新增通知弹窗组件 |
| `src/public/css/style.css` | 弹窗样式 |
| `src/public/js/main.js` | 版本检测与弹窗逻辑 |
| `package.json` | 维护 version 字段 |

**实现逻辑：**

```
前端页面加载
    ↓
GET /api/system/version
    ↓
对比 localStorage.lastSeenVersion
    ↓
不相同 → 显示通知弹窗
    ↓
用户点击"朕已阅" → POST /api/system/version/ack
    ↓
保存当前版本到 localStorage
    ↓
下次启动不再弹出
```

**弹窗内容：**

- 标题：新版本通知 (v3.0.2)
- 内容：本次更新内容列表
- 按钮："朕已阅"

---

## 三、文件改动清单

| 文件 | 操作 | 说明 |
|-----|------|------|
| `src/index.js` | 修改 | 删除循环调用、新增接口 |
| `src/services/TmdbBackfillService.js` | 新增 | 后台补全服务 |
| `src/public/js/tasks.js` | 修改 | 前端回写逻辑 |
| `src/public/index.html` | 修改 | 新增弹窗组件 |
| `src/public/css/style.css` | 修改 | 弹窗样式 |
| `src/public/js/main.js` | 修改 | 版本检测逻辑 |
| `package.json` | 修改 | 版本号更新为 3.0.2 |

---

## 四、预期效果

| 场景 | 优化前 | 优化后 |
|-----|-------|-------|
| 打开海报墙 | 云盘 API 20 次 + TMDB API N 次 | 0 次请求 |
| 页面加载时间 | 数秒到数十秒 | 秒开 |
| 系统启动 | 无 | 后台静默补全，不影响使用 |
| 版本更新 | 无感知 | 弹窗通知用户 |
| 换浏览器/清缓存 | 重新请求所有 TMDB | 直接使用数据库缓存 |

---

## 五、实施顺序

1. 移除云盘 API 循环调用
2. 新增后台 TMDB 补全服务
3. 前端回写数据库逻辑
4. 版本更新通知弹窗
5. 更新版本号为 3.0.2
