# 天翼云盘自动转存系统 (cloud189-auto-save)

> ⚠️ **特别声明**：`memory` 目录及本文件仅用于本地记录项目结构与 AI 辅助开发上下文，**请勿推送到 GitHub 远端仓库**。该目录已被添加到 `.gitignore` 中。

> 🚨 **AI 操作规范（必须遵守）**
> - 如需更新memory，应先读取原文内容，再追加或合并新内容，而非直接覆盖
> - 此规则来源于 2026-05-21 的教训：AI 错误覆盖了详细的 memory.md，导致大量文档内容丢失

## 近期开发记录

- 2026-06-15：**发布 v3.0.4 Release 并修复 Issue #27** - 取消勾选"处理后删除 .cas 文件"后 .cas 仍被删除进回收站。原因：CAS 处理流程 4 处无条件调用 `cloud189.deleteFile(casFile.id)` 未检查 `task.enableDeleteCasFile`。修复位置：`task.js` 批次清理、`CasSmartDedupService.js` 的 `_deleteExistingCas` 与 `_uploadMissingFiles`（家庭中转+个人秒传成功分支）。取消勾选时不删除但仍加入缓存避免重复处理。dev → main 合并后创建 GitHub Release v3.0.4，已通知 Issue #27 提出者 ywmm3951 升级。提交 5dd16a9 已发布到 main。dev 分支版本号本地升级到 3.0.5（未提交）。
- 2026-06-15：**初始化 AGENTS.md** - 将 Codex 协作规范补齐为长期项目规则文件，覆盖 Vibe Coding 角色定位、启动上下文流程、项目架构、关键数据流、代码一致性审查、中文注释、docs/memory 管理、md 转 html 规则以及 GitHub 推送注意事项；并通过 `/huashu-md-html` 流程生成 `docs/AGENTS.html` 阅读版。
- 2026-06-09：**初始化 AGENTS.md** - 将 Codex 协作规范补齐为长期项目规则文件，覆盖 Vibe Coding 角色定位、启动上下文流程、项目架构、关键数据流、代码一致性审查、中文注释、docs/memory 管理、md 转 html 规则以及 GitHub 推送注意事项；并通过 `/huashu-md-html` 流程生成 `docs/AGENTS.html` 阅读版。
- 2026-06-04：**发布 v3.0.2 Release** - 将 dev 分支合并到 main，创建 GitHub Release v3.0.2。主要更新：性能优化（解决 600+ 任务加载慢问题）、TMDB 后台补全服务、版本更新通知弹窗、影院模式弹窗透明问题修复。
- 2026-06-03：**修复天翼云盘每日签到 400 错误** - 签到接口缺少必要参数导致失败。添加 SSO 登录步骤获取 COOKIE_LOGIN_USER cookie、activityId 参数 (ACT_SIGNIN)、正确的请求头 (X-Requested-With, Referer)。参考 [cloud189app-action-simplify](https://github.com/monSteRhhe/cloud189app-action-simplify) 项目实现。
- 2026-06-04：**修复 GitHub Issue #26 性能问题** - 600+ 任务时数据库查询慢(1.5s)、前端卡顿。整改：添加 3 个数据库索引(`IDX_TASK_ACCOUNT_ID`, `IDX_TASK_STATUS`, `IDX_TASK_ENABLE_SYSTEM_PROXY`)，API 增加分页(page/pageSize, 默认每页100条)，移除冗余 N+1 查询，限制后处理批量(MAX_INIT_BATCH=20)，前端分页控件 + TMDB 富化并发控制(最大5并发)。
- 2026-06-04：**修复影院模式更新日志弹窗透明问题及还原通知框暗色毛玻璃样式** - 修复了由于影院模式下 `--bg-main` 为透明导致更新日志弹窗（`#changelogModal`）无背景的问题，并还原了右上角系统状态下拉框（`.notification-dropdown`）的深色毛玻璃微光霓虹样式。另外，将 `.message-info` 的背景改为了不透明淡蓝色。
- 2026-06-02：**HDHive 影巢功能集成开发评估** - 经审查，影巢资源搜索、积分类解锁、防抖防重复扣分、网盘筛选、以及一键转存任务创建闭环逻辑已 100% 全量开发完成，前后端代码、样式表和配置项全部就绪。
- 2026-06-02：**Git 分支同步操作** - 将 concept 分支全量强制推送到 dev 分支（覆盖模式），dev 分支从 27aa528 更新至 913f932。
- 2026-06-02：完成 **HDHive（影巢）OpenAPI 集成设计方案**。分析了在系统中集成 HDHive 资源搜索功能的技术可行性。报告文档：`docs/hdhive-openapi-integration-design.md`。
- 2026-06-02：新增系统日志自动控制与滚动清理机制（5MB 自动截断）。
- 2026-06-02：增加 AI 助手后台日志输出，覆盖消息接收、意图识别、函数触发等关键事件。
- 2026-06-02：修复 AI 助手流式响应 JSON 解析错误问题。
- 2026-06-02：实现任务完结通知功能（剧集完结/电影完结/剧集过期）。
- 2026-06-02：修复弹窗层级穿透问题，`.modal` z-index 提升至 5000。
- 2026-06-02：重新设计任务卡片"更多"操作弹出菜单，毛玻璃+霓虹配色。
- 2026-06-02：修复悬浮按钮"更多"点击无响应问题，添加 `user-select: none` 和 `pointer-events: none`。
- 2026-06-02：优化创建任务时视频类型自动切换逻辑，直接使用 TMDB 解析结果。
- 2026-06-02：修复 TMDB 绑定后自动重命名报错 `messageUtil.sendWebhookMessage is not a function`。
- 2026-06-02：回复 GitHub Issue #20 告知扫码登录功能已在 v3.0.0 上线。
- 2026-06-02：更新 HDHive 影巢集成评估文档，添加凭证配置说明。
- 2026-06-02：创建 GitHub Release v3.0.0，包含详细 Release Notes。
- 2026-06-01：实现天翼云盘**扫码登录**功能，支持双选项卡切换、激光扫描动画、状态轮询。
- 2026-06-01：修复 GitHub Actions 镜像构建失败问题，将 cloud189-sdk 子模块转换为普通目录。
- 2026-06-01：修复扫码登录二维码无法展示问题，使用 `image.do` 接口。
- 2026-06-01：实现每日自动签到扩容、多账号容量聚合看板、账号强保活与 Token 静默刷新。
- 2026-06-01：修复家庭中转秒传 403 Forbidden 问题，增加自动删除和重试机制。
- 2026-06-01：实现家庭空间容量响应式自愈清理方案。

## 项目概述

天翼云盘自动转存系统是一个基于 Node.js 开发的自动化云盘资源管理工具，主要用于自动化处理天翼云盘的分享链接转存任务。该项目在原版系统基础上进行了深度二次开发，核心功能围绕**CAS家庭中转秒传**、**AI智能重命名**、**TMDB自动刮削**等特性展开。

## 核心功能模块

### 1. CAS 家庭中转秒传系统（核心功能）

突破天翼云盘403版权管控限制，实现家庭空间中转秒传方案。

**工作流程**：
```
.cas 文件转存 → 解析元数据 → 家庭空间秒传 → COPY转存个人目录 → 清理临时文件
```

**关键技巧：COPY任务参数签名**（`src/services/cloud189.js:479-487`）：
```javascript
const formParams = {
    type: 'COPY',
    taskInfos: taskInfos,
    targetFolderId: String(personalFolderId),
    familyId: String(familyId),
    groupId: 'null',    // 字符串 'null'，不是 null
    copyType: '2',
    shareId: 'null'     // 字符串 'null'，不是 null
};
```

**容量自愈机制**：遇到 403 空间超限时自动清空中转目录和回收站，1.5s 延迟后自动重试。

### 2. TMDB 智能识别与级联绑定

- **连坐功能**：手动绑定某一季 TMDB 后，自动同步绑定同剧其他季任务
- **搜索优化**：支持中英文双语搜索、年份分离、Got 10s 超时 + 3 次重试

### 3. 多账号保活

- 每 4 小时心跳探测，Token 静默刷新
- 每天凌晨 2 点自动刷新未完结剧集总集数

### 4. SmartStrm Webhook

- 仅在重命名完成后触发（处理包含 `📁` 路径的消息）
- 支持 `{savePath}` 和 `{videoType}` 占位符

## 关键数据流

```
scheduler.processTask()
  → task.processTask()           # 转存/CAS秒传
  → eventService.emit('taskComplete')
  → taskEventHandler.handle()    # 统一事件处理
      1. _handleSaveSuccessNotification()  # 转存成功通知
      2. _handleAutoRename()               # AI/TMDB 重命名
      3. _handleStrmGeneration()           # STRM 生成
      4. _handleMediaScraping()            # TMDB 刮削
      5. _handleEmbyNotification()         # Emby 入库通知
```

## TMDB 匹配优先级

1. 手动绑定 TMDB (Web/TG/企微)
2. 任务已有 `tmdbId + videoType`
3. 任务名中的 `{tmdb-xxx}` 提取
4. TMDB 搜索 (中英文)
5. 正则/AI 重命名兜底

## API 认证

所有 `/api/*` 接口需要 Session 登录或请求头携带 `x-api-key`。

## 重要配置路径

| 路径 | 说明 |
|------|------|
| `data/config.json` | 系统配置（API Keys、Cron 表达式等） |
| `data/*.json` | 各账号 Token 缓存文件 |
| `data/session/` | Express Session 存储 |
| `vender/cloud189-sdk/` | 天翼云盘 SDK（已内嵌为普通目录） |
| `memory/hdhive-credentials.md` | HDHive 影巢凭证（本地存储，不提交 git） |

## 归档记录

### 归档文件命名规则

| 文件名 | 内容时间段 | 说明 |
|--------|-----------|------|
| `memory-archive-2026-05.md` | 2026-05-27 ~ 2026-05-29 | 5 月开发记录归档 |
| `memory-archive-YYYY-MM.md` | YYYY-MM | 按月归档，后续依此规则追加 |

### 归档内容范围

- 详细的代码修改清单
- 完整的错误诊断过程
- 详细的解决方案代码片段
- Git 提交记录

### 保留在 memory.md 的内容

- 项目概述和核心架构
- 近期开发记录摘要（列表形式）
- 关键配置路径
- 归档索引

### 查阅归档

```bash
# 查看归档文件列表
ls memory/memory-archive-*.md

# 搜索特定日期的记录
grep "2026-05-27" memory/memory-archive-2026-05.md
```
