# 顶栏全局模糊搜索与平滑刷新设计

**日期**：2026-05-21  
**分支**：concept  
**范围**：任务列表搜索字段扩展、搜索刷新过渡动效

## 背景

当前顶栏搜索框已经能把关键词写入 `taskFilterParams.search` 并调用 `fetchTasks()`，但后端 `/api/tasks` 的搜索范围只包含 `realFolderName`、`remark`、`account.username`。因此用户输入任务标题、TMDB 标题或分享链接时不会匹配到任务。

同时，搜索刷新会调用全局 `loading.show()`，并在结果回来后直接重建 `#taskTable tbody`，视觉上会出现列表闪烁。

## 目标

1. 将搜索能力升级为任务维度的全局模糊搜索。
2. 搜索刷新期间保留当前列表，使用局部过渡状态，避免空白闪烁。
3. 保持现有状态筛选与关键词搜索的组合逻辑。
4. 顶栏搜索与任务页搜索框共享同一过滤状态。

## 搜索范围

`/api/tasks?search=<keyword>` 应模糊匹配以下字段：

- `resourceName`：任务标题 / 资源名称
- `shareFolderName`：分享目录名
- `tmdbTitle`：TMDB 绑定或识别标题
- `shareLink`：分享链接
- `realFolderName`：更新目录
- `remark`：备注
- `lastSavedDisplayText`：最新转存展示名
- `lastSavedFileName`：最新转存文件名
- `account.username`：账号用户名

如果 `status` 不为 `all`，搜索条件需与状态条件共同生效：即只在指定状态范围内搜索。

## 前端交互设计

### 顶栏搜索

- 输入触发防抖搜索，延迟 500ms。
- 按 Enter 立即搜索。
- 清空输入后恢复当前状态筛选下的全部任务。

### 平滑刷新

`fetchTasks()` 增加可选参数：

```js
fetchTasks({ silent: true })
```

语义：

- `silent: false` 或默认：保留原有全局 loading，用于页面首次加载、手动刷新、删除后刷新等明确操作。
- `silent: true`：搜索场景使用，不展示全局 loading，而是在任务表格容器上添加局部 `is-searching` 类。

搜索刷新流程：

1. 请求开始：任务列表容器添加 `is-searching`。
2. 当前内容保持在页面上，透明度轻微降低。
3. 请求成功：重建列表内容。
4. 下一帧移除 `is-searching`，新内容淡入。
5. 请求失败：保留旧结果，提示错误，不清空列表。

## 样式设计

在任务表格容器上增加过渡样式：

```css
.table-container {
  transition: opacity 0.18s ease, transform 0.18s ease, filter 0.18s ease;
}

.table-container.is-searching {
  opacity: 0.62;
  transform: translateY(2px);
  filter: saturate(0.9);
}
```

该动效适用于当前表格视图和媒体墙视图，因为两者都渲染在 `#taskTable` 所在的 `.table-container` 内。

## 数据流

```text
用户输入关键词
  ↓
globalSearch input / Enter
  ↓
taskFilterParams.search = keyword
  ↓
fetchTasks({ silent: true })
  ↓
GET /api/tasks?status=<status>&search=<keyword>
  ↓
后端按全局字段模糊查询
  ↓
前端局部过渡刷新任务列表
```

## 错误处理

- 网络或接口异常时，不清空当前任务列表。
- 搜索失败时调用 `message.warning()` 提示用户。
- 后端查询保持现有 `success: true/false` 响应结构。

## 测试要点

1. 输入任务标题关键字，可以匹配任务。
2. 输入 TMDB 标题，可以匹配任务。
3. 输入分享链接片段，可以匹配任务。
4. 输入目录、备注、账号名仍可匹配。
5. 状态筛选与关键词同时生效。
6. 快速输入时列表不出现明显空白闪烁。
7. 按 Enter 能立即搜索。
8. 清空搜索框后恢复任务列表。

## 非目标

- 不做前端全量缓存搜索。
- 不引入复杂搜索语法。
- 不改任务排序规则。
- 不改版本号。
