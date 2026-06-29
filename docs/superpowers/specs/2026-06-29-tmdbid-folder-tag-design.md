# 剧集文件夹名追加 [tmdb-xxx] 标记 — 设计文档

**日期**：2026-06-29
**关联 Issue**：[#28 能增加自动填写总集数吗](https://github.com/ymting/my-cloud189-auto-save/issues/28)
**状态**：设计中（待用户审阅）
**目标版本**：v3.0.5

## TL;DR

为已绑定 TMDB ID 的任务，在其云盘文件夹名末尾追加 `[tmdb-{id}]` 标记（如 `狂飙 (2023)[tmdb-131887]`），方便 **Emby / Jellyfin / Plex** 等媒体管理工具通过 TMDB ID **直接精准匹配** 影视条目，避免因标题翻译、别名、年份不同导致的刮削歧义或失败。

**默认关闭**（不破坏现有 Emby 库），用户在设置页面主动开启后才生效。提供"一键迁移历史任务"按钮让用户手动决定是否给历史任务补加标记。

## 背景

Issue #28 作者反馈：

> 追更的时候不知道一共有多少集，但是还要去 TMDB 查看很麻烦，既然能和 tmdb 绑定，能不能自动查找多少集并添加进去或者直接在页面给个提示。
>
> 剧集文件夹不知道能不能加个 [tmdbid-xxx]，这样都不用整理了。

虽然 issue 主诉求是"总集数自动填写"（这部分已有后端实现，但前端不会自动填），评论里又提出了"剧集文件夹名追加 [tmdbid-xxx] 标记"作为强需求。

本设计文档专门处理**文件夹名追加 TMDB ID 标记**这个需求。"总集数自动填"将在后续设计中处理。

### 现状

- 项目已有从任务名/文件名清理 `{tmdb-xxx}` / `[tmdb-xxx]` / `(tmdb-xxx)` 标记的逻辑（`src/services/task.js:475-477`），用于从 TMDB 标记中提取 ID
- 但**没有反向追加**标记到文件夹名的逻辑
- 用户管理云盘剧集时，文件夹名纯粹是中文/英文标题，Emby 等刮削工具需要靠标题二次匹配，效率低

## 目标

为已绑定 TMDB ID 的任务，在云盘上的目标保存根目录（`realFolderName`）末尾追加 `[tmdb-{id}]` 标记，方便 Emby 等工具直接通过 TMDB ID 准确刮削，避免歧义。

**默认关闭**，用户需在设置页面主动开启。

## 范围

### 包含

- 全局配置开关 `task.appendTmdbIdToFolder`（默认 `false`）
- 设置页面 UI 开关
- 任务创建/绑定/重命名时的文件夹名追加
- 一键迁移历史任务接口
- 设置页面"迁移历史任务"按钮
- 单元测试 + 集成测试
- 用户文档 + 发布说明

### 不包含

- 电影/剧集类型区分（只要有 TMDB ID 都追加，与 issue 作者明确偏好一致）
- 自定义格式（固定 `[tmdb-{id}]`）
- 自动迁移历史任务（提供按钮，用户主动触发）
- `resourceName`（任务名）也加标记 —— 暂不加，避免影响 TMDB 匹配
- `shareFolderName`（分享内子目录）加标记 —— 分享方控制，无法修改

## 设计

### 1. 核心函数

**文件**：`src/utils/folderNameUtils.js`（新建）

```javascript
/**
 * 在文件夹名末尾追加 [tmdb-xxx] 标记
 * @param {string} folderName 原文件夹名
 * @param {number|string} tmdbId TMDB ID
 * @returns {string} 处理后的文件夹名（若已含标记则返回原名）
 */
function appendTmdbIdToFolderName(folderName, tmdbId) {
    if (!folderName || !tmdbId) return folderName;
    // 防御：已含 [tmdb-xxx] 标记则不重复追加
    if (/\s*\[tmdb-\d+\]\s*$/i.test(folderName)) return folderName;
    return `${folderName}[tmdb-${tmdbId}]`;
}

module.exports = { appendTmdbIdToFolderName };
```

**关键设计点**：
- 纯函数，无副作用
- 5 行核心代码
- 防御性编程：空值/已含标记 不重复
- 大小写不敏感（`[TMDB-xxx]` 也算已含）
- 标记必须位于**字符串末尾**才去重

### 2. 配置项

**文件**：`data/config.json`

```json
{
  "task": {
    "appendTmdbIdToFolder": false
  }
}
```

**默认值**：`false`（默认关闭，遵循"不破坏现有行为"原则）

### 3. 调用点集成

| # | 位置 | 文件 | 行号 | 触发场景 |
|---|------|------|------|----------|
| 1 | `_createTaskConfig` | `src/services/task.js` | 51-92 | 新任务创建 |
| 2 | 手动绑定 TMDB 同步兄弟任务 | `src/services/task.js` | 919-923 | 手动绑定 TMDB 后同步 |
| 3 | AI 重命名完成 | `src/services/task.js` | 待定位 | AI 重命名后回写 realFolderName |

**集成模式**（伪代码）：

```javascript
// 在 _createTaskConfig 中
const appendEnabled = ConfigService.getConfigValue('task.appendTmdbIdToFolder');
const folderName = appendEnabled && config.tmdbId 
    ? appendTmdbIdToFolderName(realFolder.name, config.tmdbId)
    : realFolder.name;

const config = {
    // ...
    realFolderName: folderName,
    // ...
};
```

**注意**：仅当开关**开启**且任务**有 TMDB ID**时才追加。

### 4. 一键迁移历史任务

#### API 设计

**端点**：`POST /api/tasks/migrate-folder-tmdbid`

**权限**：需要登录态或 API Key

**请求体**：
```json
{
  "dryRun": true  // true=预览；false=执行
}
```

**响应**（`dryRun=true`）：
```json
{
  "success": true,
  "data": {
    "totalTasks": 15,
    "toMigrate": [
      {
        "taskId": 1,
        "oldName": "狂飙 (2023)",
        "newName": "狂飙 (2023)[tmdb-131887]",
        "tmdbId": 131887,
        "accountId": 1
      }
    ],
    "skipped": [
      { "taskId": 2, "reason": "无 TMDB ID" },
      { "taskId": 3, "reason": "已含 [tmdb-xxx] 标记" }
    ]
  }
}
```

**响应**（`dryRun=false`）：
```json
{
  "success": true,
  "data": {
    "migrated": 12,
    "failed": 1,
    "results": [
      { "taskId": 1, "status": "ok", "oldName": "...", "newName": "..." },
      { "taskId": 5, "status": "failed", "error": "云盘重命名失败：..." }
    ]
  }
}
```

#### 后端实现要点

- 查询：`SELECT * FROM task WHERE tmdbId IS NOT NULL AND realFolderName NOT LIKE '%[tmdb-%'`
- 对每个任务：
  1. 构造新名称 `appendTmdbIdToFolderName(task.realFolderName, task.tmdbId)`
  2. 调用 `cloud189.renameFolder(task.realFolderId, newName)`
  3. 更新数据库 `task.realFolderName = newName`
- 失败处理：单个任务失败不影响其他任务，错误信息写入日志

#### 前端交互

设置页面"迁移历史任务"按钮 → 点击触发：

1. 第一次调用 `dryRun=true` → 展示"将迁移 N 个任务，跳过 M 个"列表
2. 用户在确认弹窗中**输入"确认迁移"**（防误操作）
3. 调用 `dryRun=false` → 进度条 + 实时结果
4. 完成后展示"成功 N 个，失败 M 个"汇总

### 5. UI 设计

#### 设置页面（`src/public/index.html`）

在"任务"分类下新增：

```
┌─────────────────────────────────────────────────────┐
│ ☐ 任务文件夹名追加 [tmdb-xxx] 标记  ❓               │
│                                                     │
│   为已绑定 TMDB 的任务，在其云盘文件夹名末尾追加      │
│   [tmdb-{id}] 标记（如"狂飙 (2023)[tmdb-131887]"）， │
│   方便 Emby / Jellyfin / Plex 等媒体管理工具         │
│   通过 TMDB ID 直接精准匹配影视条目，                │
│   避免标题翻译/别名/年份不同导致的刮削歧义。          │
│                                                     │
│   开启后：                                          │
│   • 新任务自动追加标记                               │
│   • 历史任务需点击下方按钮手动迁移                   │
│                                                     │
│   [迁移历史任务 →]  (开关关闭时禁用)                  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**说明元素**：

- 标题右侧 `❓` 帮助图标：鼠标悬停弹出**完整功能说明**（覆盖开关下方的描述）
- 开关下方描述：功能摘要 + 关键样例
- "开/关行为说明"区域：明确开启后的行为
- "迁移历史任务"按钮：
  - 开关关闭时：禁用 + tooltip "请先开启开关"
  - 开关开启时：可点击
- 迁移按钮点击 → 触发前端 `migrateTasksFolder()` 函数

#### Tooltip 内容（悬停 ❓ 时弹出）

```
┌─────────────────────────────────────────────────┐
│  ℹ️ 任务文件夹追加 [tmdb-xxx] 标记                │
├─────────────────────────────────────────────────┤
│ 为已绑定 TMDB 的任务，在其云盘文件夹名末尾       │
│ 追加 [tmdb-{id}] 标记，方便 Emby / Jellyfin /    │
│ Plex 等媒体管理工具通过 TMDB ID 直接精准匹配      │
│ 影视条目，避免标题翻译/别名/年份不同导致的刮削    │
│ 歧义或失败。                                      │
│                                                 │
│ 示例：                                          │
│   关闭时：狂飙 (2023)                            │
│   开启时：狂飙 (2023)[tmdb-131887]              │
│                                                 │
│ 注意：                                          │
│   • 默认关闭（不影响现有 Emby 库）               │
│   • 开启后只对新任务生效                         │
│   • 历史任务需点击"迁移历史任务"按钮手动迁移      │
│   • 已含 [tmdb-xxx] 标记的任务不会重复追加        │
└─────────────────────────────────────────────────┘
```

### 6. 边界条件 & 错误处理

| 场景 | 处理 |
|------|------|
| `folderName` 为空/undefined | 返回原值，不追加 |
| `tmdbId` 为空/null/0 | 返回原名，不追加 |
| `folderName` 已含 `[tmdb-xxx]` 标记 | 不重复追加（正则大小写不敏感） |
| 标记不在末尾（如 `狂飙[tmdb-1] S2`） | **仍追加**（视为不同任务） |
| 开关关闭 | 不调用工具函数 |
| 开关开启但任务无 TMDB ID | 跳过该任务（日志记录） |
| 云盘重命名失败 | 该任务标记 failed，继续其他 |
| 用户中途取消迁移 | 已迁移的保留，未迁移的不动 |
| 同名冲突（云盘已有同名文件夹） | 天翼云盘 API 返回错误，标记 failed |
| 任务名包含特殊字符 `[]` | 按原字符追加，工具函数不处理 |

### 7. 测试策略

#### 单元测试（`test/utils/folderNameUtils.spec.js`）

- ✅ 空 folderName → 返回 `''`
- ✅ undefined folderName → 返回 `undefined`
- ✅ 空 tmdbId → 返回原名
- ✅ 数字 0 tmdbId → 返回原名（视为空）
- ✅ 正常追加 → `狂飙` + `131887` → `狂飙[tmdb-131887]`
- ✅ 已含 `[tmdb-131887]` → 不重复
- ✅ 已含 `[TMDB-131887]` 大小写 → 不重复
- ✅ 标记在中间（`狂飙[tmdb-1] S2`）→ 仍追加 → `狂飙[tmdb-1] S2[tmdb-1]`
- ✅ 中文任务名 → 正常追加
- ✅ 带年份任务名 → `狂飙 (2023)[tmdb-131887]`

#### 集成测试

- ✅ 创建任务（开关关）→ 数据库 `realFolderName` 不变
- ✅ 创建任务（开关开）→ 数据库 `realFolderName` 包含标记
- ✅ 创建任务（开关开 + 无 TMDB ID）→ `realFolderName` 不变
- ✅ 开关切换 → 行为变化
- ✅ 迁移接口 dryRun=true → 不写数据库
- ✅ 迁移接口 dryRun=false → 写数据库 + 云盘操作
- ✅ 迁移部分失败 → 不影响其他任务

### 8. 文档 & 发布

**新增文档**：

- `docs/issue-28-tmdbid-folder-tag-user-guide.md` — 用户使用指南
- `docs/release-notes-v3.0.5.md` — 版本发布说明

**更新文档**：

- `README.md` — 功能列表（如果存在）
- `memory/MEMORY.md` — 添加本设计摘要 + Issue #28 关闭记录

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/utils/folderNameUtils.js` | 新建 | 核心函数 |
| `test/utils/folderNameUtils.spec.js` | 新建 | 单元测试 |
| `src/services/task.js` | 修改 | 3 个调用点集成 |
| `src/index.js` | 修改 | 迁移接口 |
| `src/public/index.html` | 修改 | 设置页面 UI |
| `src/public/js/settings.js` | 修改 | 配置项读写 |
| `src/public/js/tasks.js` | 修改 | 迁移按钮 + 弹窗 |
| `docs/issue-28-tmdbid-folder-tag-user-guide.md` | 新建 | 用户文档 |
| `docs/release-notes-v3.0.5.md` | 新建 | 发布说明 |
| `memory/MEMORY.md` | 修改 | 添加记录 |

## 数据迁移

**不影响历史任务**：开关关闭时所有现有任务保持原样。开启开关后：
- 新创建的任务：自动追加标记
- 历史任务：通过"迁移历史任务"按钮手动触发

**回退方案**：用户关闭开关后，新创建的任务不再追加。已迁移的任务不会自动还原（避免误操作）。

## 兼容性

- **API 兼容**：新增端点，不影响现有接口
- **数据兼容**：`realFolderName` 字段类型不变（string）
- **配置兼容**：`config.json` 新增字段，已有配置无需修改
- **升级路径**：用户升级后默认关闭，需手动开启

## 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 用户误开启导致 Emby 库混乱 | 中 | 默认关闭 + 用户文档明确说明 |
| 历史任务迁移失败 | 低 | dryRun 预览 + 单任务失败隔离 |
| 标记格式影响其他工具 | 低 | 标记位于末尾，可被正则过滤 |
| 云盘 API 限流 | 低 | 迁移接口内置限流（每秒 1 个） |
| 重复追加标记 | 中 | 正则去重防御 |

## 验收标准

1. ✅ 设置页面开关可正常切换
2. ✅ 开启后创建任务，数据库 `realFolderName` 包含 `[tmdb-{id}]`
3. ✅ 关闭后创建任务，数据库 `realFolderName` 不含标记
4. ✅ 任务无 TMDB ID 时不追加（无论开关状态）
5. ✅ 已有 `[tmdb-xxx]` 标记的任务不会被重复追加
6. ✅ "迁移历史任务"按钮：dryRun 预览正确
7. ✅ "迁移历史任务"按钮：执行后数据库 + 云盘同步更新
8. ✅ 单元测试覆盖率 100%
9. ✅ 用户文档清晰
10. ✅ 提交到 dev 分支 + Issue #28 关闭回复

## 后续计划（不在本次范围）

- 任务创建时**自动填写总集数**到表单（issue #28 主诉求）
- 命名规则扩展（`{title}.{year}.S{season:02d}E{episode:02d}.{quality}.{hdr}.{source}.{format}.{audio}.{extension}`）
- `resourceName` 是否加标记（需进一步讨论）
