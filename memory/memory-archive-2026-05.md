## 2026-05-27 开发记录

### 1. 修复定时任务通知顺序错乱问题

**问题描述：**
定时任务执行后，通知消息顺序错乱：
- 错误顺序：Emby入库成功 → 重命名完成 → 转存成功（或CAS秒传成功）
- 期望顺序：转存成功 → 重命名完成 → 入库通知

**根本原因：**
- `task.js` 的 `processTask` 方法通过 `process.nextTick` 异步发射 `taskComplete` 事件
- `scheduler.js` 在 `processTask` 返回后立即发送"转存成功"通知
- 由于异步操作执行顺序不确定，导致通知顺序混乱

**解决方案：**
将所有通知的发送统一到 `taskEventHandler.js` 中，确保按正确顺序依次发送。

**修改文件：**
| 文件 | 修改内容 |
|------|----------|
| `src/dto/TaskCompleteEventDto.js` | 新增 `saveResults` 字段，传递转存通知内容 |
| `src/services/task.js` | 将 `saveResults` 传递给事件，有新增文件时返回空字符串避免重复发送 |
| `src/services/taskEventHandler.js` | 新增 `_handleSaveSuccessNotification` 方法，调整处理顺序确保通知顺序正确 |

**通知顺序（修改后）：**
1. 转存成功/CAS秒传成功（`_handleSaveSuccessNotification`）
2. 重命名完成（`_handleAutoRename`）
3. Emby入库成功（`_handleEmbyNotification`）

**提交：** `5797b20` - `fix: 修复定时任务通知顺序错乱问题`

### 2. 创建 CLAUDE.md 文件

为 Claude Code 提供项目上下文，包含：
- 常用命令（安装、编译、运行、开发模式）
- 核心架构（数据层、服务层、通知层、前端）
- 关键数据流（任务执行、CAS秒传、SmartStrm webhook）
- TMDB 匹配优先级
- API 认证方式
- 注意事项

### 3. 添加手机浏览器适配

**需求：** 适配移动端浏览器，支持明亮和影院两种主题

**新增文件：**
- `src/public/css/mobile.css` - 移动端专用样式

**修改文件：**
- `src/public/index.html` - 添加 mobile.css 引用和侧边栏遮罩层
- `src/public/js/main.js` - 添加遮罩层交互逻辑
- `src/public/js/tabs.js` - 点击导航后自动关闭侧边栏

**适配内容：**

| 断点 | 适配项 |
|------|--------|
| 768px 以下 | 侧边栏覆盖模式、顶栏紧凑、单列卡片、模态框 95% 宽度 |
| 480px 以下 | 更紧凑布局、仪表盘单列、模态框全屏 |
| 横屏模式 | 顶栏高度减小、统计卡片四列 |
| 触摸设备 | 触摸目标 44px 最小高度、移除 hover 效果 |
| 安全区域 | 刘海屏、底部横条适配 |

**主题适配：**
- 明亮模式：浅色遮罩层 `rgba(0, 0, 0, 0.3)`
- 影院模式：深色半透明遮罩 `rgba(0, 0, 0, 0.7)`，保持紫色渐变风格

**提交：** `f25167b`

---

## 2026-05-27 移动端适配修复

### 问题列表与修复方案

| # | 问题 | 修复方案 | 修改文件 |
|---|------|----------|----------|
| 1 | 顶栏右侧显示不全，主题按钮被截断 | 调整顶栏padding、搜索框max-width、按钮flex-shrink | `mobile.css`, `layout.css`, `ui-themes.css` |
| 2 | 影院主题顶栏背景不透明 | 移动端影院模式顶栏设为 `transparent` | `mobile.css` |
| 3 | 可左右滑动但无法上下滑动 | 添加 `overflow-x: hidden`，确保垂直滚动正常 | `mobile.css` |
| 4 | 手机端显示影院主题 | 主题初始化逻辑正确，可能是localStorage保存了cinema | 无需修改 |
| 5 | 点击卡片后无法切换回海报 | 添加移动端点击切换简介逻辑 | `cinema-background.js`, `mobile.css` |
| 6 | 卡片一行展示一个 | 强制单列flex布局，禁止水平滚动 | `mobile.css`, `ui-themes.css` |
| 7 | 锁定信息不消失且挡住更多按钮 | 调整锁定指示器位置，添加点击关闭功能 | `cinema-theme.css`, `cinema-background.js`, `mobile.css` |

### 关键代码修改

#### 1. 顶栏布局优化
```css
/* mobile.css */
.topbar {
    padding: 0 12px 0 8px;
    overflow: visible;
}
.topbar-search {
    max-width: calc(100vw - 180px);
    flex-shrink: 0;
}
.topbar-actions {
    gap: 6px;
    flex-shrink: 0;
}
```

#### 2. 禁止水平滚动
```css
/* mobile.css */
.app-layout, body, .page-container {
    overflow-x: hidden;
}
.page-container {
    overflow-y: auto;
}
```

#### 3. 单列卡片布局
```css
/* mobile.css */
[data-ui-style="media"] #taskTable tbody {
    display: flex !important;
    flex-direction: column;
}
```

#### 4. 移动端点击切换简介
```javascript
// cinema-background.js
toggleCardOverview(card) {
    const overview = card.querySelector('.media-card-hover-overview');
    card.classList.toggle('overview-expanded');
    overview.style.opacity = isExpanded ? '1' : '0';
}
```

#### 5. 锁定指示器优化
```css
/* cinema-theme.css */
.cinema-locked-indicator {
    pointer-events: auto;
    cursor: pointer;
}
.cinema-locked-indicator::after {
    content: "×"; /* 关闭按钮 */
}
```

```javascript
// cinema-background.js
this.lockedIndicator.addEventListener('click', (e) => {
    this.unlock();
});
```

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/css/mobile.css` | 顶栏布局、滚动控制、单列卡片、影院模式适配、锁定指示器位置、点击切换简介样式 |
| `src/public/css/layout.css` | 移动端顶栏操作区样式 |
| `src/public/css/ui-themes.css` | 移动端主题按钮定位、媒体墙单列布局 |
| `src/public/css/cinema-theme.css` | 锁定指示器点击关闭样式 |
| `src/public/js/cinema-background.js` | 移动端检测、点击切换简介、锁定指示器点击关闭 |

### 主题调整

- **默认主题**：桌面端和手机端统一默认显示影院主题
- **主题选项顺序**：调整为影院 → 明亮

**提交：** `9fdd5f3` - `fix: 修复手机端适配问题并调整默认主题`

---

## 2026-05-27 手机端影院模式UI修复（第二轮）

### 问题反馈

用户反馈手机端影院模式存在多项问题，需要修复：
1. 顶栏右侧显示不全，主题切换按钮右侧被截断
2. 顶栏在影院主题下的背景需要改成透明（已修复）
3. 两个主题下均可左右滑动但无法上下滑动
4. 手机端模式显示影院主题（已完成）
5. 手机端点击一次卡片后展示简介，再次点击无法切换回海报
6. 手机端卡片一行展示一个任务卡片即可，不需要左右滑动
7. 锁定信息一直显示且挡住更多按钮

### 修复方案

| # | 问题 | 修复方案 | 状态 |
|---|------|----------|------|
| 1 | 顶栏右侧显示不全 | 调整 `.topbar` padding 为 `0 60px 0 8px`，为绝对定位的主题按钮留出空间 | ✅ |
| 2 | 影院主题顶栏背景 | 移动端影院模式顶栏设为 `transparent` | ✅ 已修复 |
| 3 | 水平滚动问题 | 移除 `body` padding，确保 `app-layout`、`main-content`、`page-container` 都禁止水平滚动 | ✅ |
| 4 | 手机端显示影院主题 | 主题初始化逻辑正确 | ✅ 已完成 |
| 5 | 点击卡片无法切换简介 | 修改 `handleClick` 逻辑，移动端只切换简介，不触发锁定海报 | ✅ |
| 6 | 卡片单列布局 | 添加 `!important` 确保移动端样式覆盖桌面端 380px 高度 | ✅ |
| 7 | 锁定信息挡住按钮 | 将锁定指示器移至左下角，避免挡住右下角更多按钮 | ✅ |

### 关键代码修改

#### 1. 顶栏布局修复（mobile.css）
```css
.topbar {
    padding: 0 60px 0 8px; /* 右侧留出主题按钮绝对定位空间 */
    overflow: visible !important;
}
.topbar .theme-switch {
    position: absolute;
    right: 12px;
    transform: translateY(-50%);
}
```

#### 2. 禁止水平滚动（mobile.css + ui-themes.css）
```css
/* mobile.css */
.app-layout { overflow: hidden; }
body { overflow: hidden; width: 100%; max-width: 100vw; }
.main-content { overflow: hidden; width: 100%; max-width: 100%; }
.page-container { overflow-x: hidden; overflow-y: auto; }

/* ui-themes.css */
@media (max-width: 900px) {
    body { padding: 0; margin: 0; } /* 移除 padding 避免水平滚动 */
}
```

#### 3. 移动端点击逻辑修改（cinema-background.js）
```javascript
handleClick(e) {
    if (taskCard && taskCard.dataset.taskId) {
        // 移动端：只切换简介显示，不锁定海报
        if (this.isMobile()) {
            this.toggleCardOverview(taskCard);
            return;
        }
        // 桌面端：锁定/解锁逻辑
        if (this.lockedTaskId == clickedTaskId) {
            this.unlock();
            return;
        }
        this.lockToTask(clickedTaskId);
    }
}
```

#### 4. 锁定指示器位置调整（mobile.css）
```css
.cinema-locked-indicator {
    bottom: 20px;
    left: 12px;           /* 移至左下角 */
    right: auto;
    max-width: 200px;
}
```

#### 5. 影院模式卡片高度覆盖（mobile.css + ui-themes.css）
```css
[data-theme="cinema"][data-ui-style="media"] #taskTable tr.media-wall-card {
    height: auto !important;
    min-height: 220px !important;
}
```

#### 6. 任务选择与锁定联动（tasks.js）
```javascript
// 任务取消选择时自动解除锁定
if (wasSelected && !row.classList.contains('selected')) {
    const cinemaBg = getCinemaBackground();
    if (cinemaBg && cinemaBg.lockedTaskId == taskId) {
        cinemaBg.unlock();
    }
}

// 取消全选时解除锁定
if (!wasChecked) {
    const cinemaBg = getCinemaBackground();
    if (cinemaBg && cinemaBg.lockedTaskId) {
        cinemaBg.unlock();
    }
}
```

### 行为对比

| 操作 | 移动端 | 桌面端 |
|------|--------|--------|
| 点击任务卡片 | 切换简介显示/隐藏 | 锁定海报 |
| 点击已锁定卡片 | 切换简介显示/隐藏 | 解除锁定 |
| 点击空白区域 | 解除锁定 | 解除锁定 |
| 取消任务选择 | 自动解除锁定 | 自动解除锁定 |

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/css/mobile.css` | 顶栏布局、滚动控制、单列卡片、影院模式适配、锁定指示器位置 |
| `src/public/css/ui-themes.css` | 移除 body padding、媒体墙单列布局、影院模式卡片高度 |
| `src/public/js/cinema-background.js` | 移动端点击只切换简介、不触发锁定 |
| `src/public/js/tasks.js` | 任务选择与锁定联动、取消选择时自动解锁 |

**提交：** `854ed77` - `fix: 修复手机端影院模式多项UI问题`

---

## 2026-05-27 手机端样式恢复

### 问题反馈

用户反馈：
1. f1179b3 版本时手机端影院模式UI的任务卡片显示效果正常
2. 现在版本的影院模式UI下显示不对
3. 手机端两个UI模式下都不显示通知按钮了
4. 可以上下滑动了（有进步）
5. 不要动电脑端的展示效果

### 解决方案

恢复到 f1179b3 版本的样式基础，只保留必要的移动端适配：

1. **mobile.css**：恢复到基于 f1179b3 的样式
   - 顶栏布局保持简单：`padding: 0 12px`
   - 通知按钮正常显示
   - 影院模式卡片使用 grid 布局

2. **ui-themes.css**：恢复原有的移动端媒体查询
   - 移除之前添加的 `display: flex` 强制覆盖
   - 保持原有的 grid 布局

3. **cinema-background.js**：恢复原有的点击逻辑
   - 移动端点击卡片时既切换简介又锁定海报
   - 保持桌面端行为不变

4. **tasks.js**：恢复原有的任务选择逻辑
   - 移除与影院模式锁定的联动代码
   - 保持原有行为

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/css/mobile.css` | 恢复到基于 f1179b3 的样式 |
| `src/public/css/ui-themes.css` | 恢复原有的移动端媒体查询 |
| `src/public/js/cinema-background.js` | 恢复原有的点击逻辑 |
| `src/public/js/tasks.js` | 恢复原有的任务选择逻辑 |

**提交：** `fa698b0` - `fix: 恢复手机端样式到f1179b3基础版本`

---

## 2026-05-27 手机端适配修复（第三轮）

### 问题反馈

用户反馈手机端仍存在5个问题：
1. 顶栏右侧显示不全，主题切换按钮右侧被截断
2. 两个主题下均可以左右滑动但无法上下滑动
3. 手机端模式显示影院主题（已默认完成）
4. 手机端点击一次卡片后展示简介，再次点击无法切换回海报
5. 手机端卡片一行展示一个任务卡片

### 根本原因分析

| # | 问题 | 根本原因 |
|---|------|----------|
| 1 | 顶栏截断 | 搜索框使用固定宽度 `var(--topbar-search-width)` 挤出了右侧按钮，`topbar-actions` 在桌面端有 `padding-right` 预留绝对定位主题按钮空间 |
| 2 | 左右滑动无法上下 | `body` 有 `padding: var(--page-padding)=28px`（ui-themes.css），导致内容超出视口；`app-layout/main-content` 都设 `overflow: hidden` 但 `page-container` 的 `overflow-y: auto` 被父元素阻断 |
| 4 | 点击无法切回海报 | `handleClick` 中锁定判断在移动端切换之前执行——点击已锁定卡片时 `unlock(); return;` 直接返回，永远不会调用 `toggleCardOverview` |
| 5 | 多列卡片 | 影院模式 `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))` 在手机宽度下仍会产生多列 |

### 修复方案

#### 1. 顶栏布局修复（mobile.css + layout.css + cinema-theme.css）
```css
/* mobile.css - 搜索框弹性收缩，按钮不收缩 */
.topbar-search { flex: 1 1 0; min-width: 0; }
.topbar-actions { flex-shrink: 0; padding-right: 0 !important; }
.topbar .theme-switch { position: static !important; }
.notification-btn, .theme-toggle-btn { flex-shrink: 0; }

/* layout.css + cinema-theme.css - 移动端搜索框统一flex */
@media (max-width: 768px) {
  ### 解决方案
- 移除 `src/public/css/ui-themes.css` 中明亮模式和影院模式下 `.media-wall-card` 定义的 `backdrop-filter: blur(8px)`、`backdrop-filter: blur(20px)` 等属性。
- 移除 `src/public/css/cinema-theme.css` 中影院模式下 `.media-wall-card` 重复定义的 `backdrop-filter` 及其 Webkit 兼容前缀。
- **影院模式额外覆盖**：
  1. 在 `cinema-theme.css` 中，由于 `.media-wall-card` 同样是 `#taskTable tr` 元素，受到 `#taskTable tr` 上 `backdrop-filter` 样式的层叠匹配。我们特别针对 `.media-wall-card` 的样式规则添加了 `backdrop-filter: none !important` 进行覆盖。
  2. 为了从根本上解决层叠，在 `cinema-theme.css` 中将通用的 `#taskTable tr` 样式规则限制在 `classic` 列表布局下（即 `[data-ui-style="classic"]`），使其不触碰 `media` 壁面下的卡片元素。
  3. 彻底移除了 `card-view.css` 中 `[data-theme="cinema"] #taskTable tr` 与 `#accountTable tr` 上声明的 `backdrop-filter: blur(8px)` 属性，杜绝了卡片视图下的漏光瑕疵。
- 更新 `src/public/index.html` 与 `dist/public/index.html` 中所有本地 CSS 及 JS 资源引用的版本号参数 `?v=3.0.0_1500`，彻底强刷浏览器缓存，使新样式立刻生效。
- 将全部最新的前端静态资源完整同步覆盖至 `dist/public`，编译验证项目无错。age-container { overflow-x: hidden !important; overflow-y: auto !important; }

/* ui-themes.css - 移除 body padding 防止水平溢出 */
@media (max-width: 768px) {
    body { padding: 0 !important; margin: 0 !important; }
}
```

#### 2. 滚动体系修复（mobile.css + ui-themes.css）
```css
/* 滚动链：html/body/app-layout/main-content 都禁止水平滚动且 overflow-y: hidden */
/* 唯一允许垂直滚动的节点是 page-container */
html { overflow-x: hidden; }
body { overflow-x: hidden; overflow-y: hidden; width: 100%; max-width: 100vw; }
.app-layout { overflow-x: hidden; overflow-y: hidden; }
.main-content { overflow: hidden; flex: 1; min-height: 0; }
.page-container { overflow-x: hidden !important; overflow-y: auto !important; }

/* ui-themes.css - 移除 body padding 防止水平溢出 */
@media (max-width: 768px) {
    body { padding: 0 !important; margin: 0 !important; }
}
```

#### 3. 移动端点击切换简介（cinema-background.js）
```javascript
// 修复：移动端完全跳过锁定逻辑，只切换简介显示
handleClick(e) {
    if (taskCard) {
        if (this.isMobile()) {
            this.toggleCardOverview(taskCard);  // 只切换简介
            return;                              // 立即返回，不处理锁定
        }
        // 桌面端保持原有锁定/解锁逻辑
    } else {
        this.unlock();
        // 移动端同时清除所有卡片简介展开状态
    }
}
```

#### 4. 影院模式单列卡片（mobile.css）
```css
[data-theme="cinema"][data-ui-style="media"] #taskTable tbody {
    grid-template-columns: 1fr !important;
}
[data-theme="cinema"][data-ui-style="media"] #taskTable tr.media-wall-card {
    height: auto !important;
    min-height: 260px !important;
    max-height: 320px !important;
}
```

#### 5. 简介展开CSS控制（mobile.css）
```css
/* 禁用hover触发，只允许click toggle控制 */
[data-theme="cinema"] tr.media-wall-card.overview-expanded .media-card-hover-overview {
    opacity: 1 !important;
}
[data-theme="cinema"] tr.media-wall-card:not(.overview-expanded) .media-card-hover-overview {
    opacity: 0 !important;
}
```

### 行为对比（修复后）

| 操作 | 移动端 | 桌面端 |
|------|--------|--------|
| 点击任务卡片 | 切换简介显示/隐藏 | 锁定海报 |
| 再次点击同一卡片 | 切换简介隐藏/显示 | 解除锁定 |
| 点击空白区域 | 清除所有简介展开 | 解除锁定 |

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/css/mobile.css` | 滚动体系重建、顶栏flex布局、搜索框弹性收缩、影院模式单列卡片、简介展开样式 |
| `src/public/css/layout.css` | 移动端搜索框flex覆盖 |
| `src/public/css/cinema-theme.css` | 移动端影院搜索框flex覆盖 |
| `src/public/css/ui-themes.css` | 移动端body padding移除 |
| `src/public/js/cinema-background.js` | 移动端点击只切换简介不处理锁定，点击空白清除展开状态 |

---

## 2026-05-27 手机端卡片竖向展示

### 需求
手机端任务卡片从横向（海报左+信息右）改为竖向（海报在上、信息在下），消除左右滑动需求。

### 修改（mobile.css）

**明亮模式卡片**：
```css
/* 卡片改为单列竖向 */
[data-ui-style="media"] #taskTable tr.media-wall-card {
    grid-template-columns: 1fr !important;  /* 从 100px 1fr → 单列 */
    padding: 0;
    overflow: hidden;
}

/* 海报全宽展示 */
.media-wall-poster {
    width: 100% !important;
    min-height: 200px !important;
    max-height: 260px !important;
    border-radius: 0 !important;
    aspect-ratio: 2 / 3;
}

/* 信息区在海报下方 */
.media-wall-info-cell {
    padding: 14px !important;
}
```

**影院模式卡片**：保持已有的竖向布局，移除 `max-height: 320px` 限制，让内容自然撑高。

**提交：** `e01695e` - `fix: 手机端任务卡片改为竖向展示（海报在上、信息在下）`

---

## 2026-05-27 手机端样式回退与影院模式优化

### 问题与反馈

用户反馈：
1. 明亮模式的手机端任务卡片样式需要回退到上一版（保留原先的横向布局：海报在左，信息在右），先不要动明亮模式的布局。
2. 影院模式的任务卡片在手机端需要保持竖向排列，上下滑动。

### 解决方案

1. **样式回退 (mobile.css)**：
   - 将 `mobile.css` 中明亮模式（`[data-ui-style="media"]`）的移动端卡片布局回退到 `e01695e` 之前的横向布局版本。
   - 恢复 `grid-template-columns: 100px minmax(0, 1fr)`、`gap: 12px`、`padding: 14px`。
   - 恢复 `.media-wall-poster` 的宽度为 `100px`、最小高度为 `150px`。
   - 移除在 `e01695e` 中临时添加的明亮模式 `.media-wall-poster-cell`、`.media-wall-info-cell` 等全宽垂直布局相关的 CSS 样式。

2. **保留并确认影院模式布局**：
   - 保持影院模式移动端的 `tbody` 为 `display: grid; grid-template-columns: 1fr` 单列垂直布局，以及 `tr.media-wall-card` 的 `height: auto; min-height: 300px; max-height: none` 规则，使得卡片在移动端仍呈现坚挺的竖向展示，并且完全支持上下滑动。

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/css/mobile.css` | 回退明亮模式移动端卡片样式至横向，保留影院模式单列竖向卡片布局 |

**提交：** `787b926` - `fix: 回退明亮模式移动端卡片样式，保留影院模式竖向布局`

---

## 2026-05-27 手机端影院模式双列等比例缩小布局优化

### 问题与反馈

用户指出在手机屏幕展示空间有限的情况下，单列的影院模式卡片太大（宽度占满），不能在当前屏幕完整且舒适地展示单个卡片的所有信息。希望将影院模式卡片做成适配屏幕的竖向展示，像把单个任务卡片等比例缩小展示到手机屏幕一样，从而展示更多完整卡片。

### 解决方案

1. **影院模式卡片双列排布 (mobile.css)**：
   - 将 `tbody` 的 `grid-template-columns` 设为 `repeat(2, 1fr) !important`，实现双列并排的电影海报墙效果。
   - 卡片高度及最小/最大高度强制设为 `320px`，边距减少为 `padding: 10px`，四角设为 `border-radius: 12px`，形成规整的小卡片比例。

2. **等比例缩减卡片内元素尺寸 (mobile.css)**：
   - **顶部状态胶囊**：缩短胶囊高度（`min-height: 18px`），缩小图标（`8px`）与文字（`9px`）。
   - **简介浮层**：减小内边距，减少 padding-bottom 为 `95px`，以防遮挡底部；调节行高和字体，并最大限制展示为 7 行，可容纳全部简介。
   - **信息区**：标题字号降为 `13px`，Meta 信息降为 `10px`，更新进度文字与日期降为 `10px`。
   - **底部按钮与标签**：由于双列宽度太窄，隐去非必要的电影/剧集和账号标签（`.media-tags { display: none !important }`），为操作按钮腾出空间；将 3 个操作按钮设为 `width: 100% !important; justify-content: space-between !important` 占满两端，且直径缩减为 `28px`，图标缩减为 `14px`。
   - **添加任务占位卡片**：等比例调低加号图标（`48px`）及文本字号，使整块占位符在双列中完美对齐。

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/css/mobile.css` | 实现移动端影院模式卡片双列等比例缩小布局，调优所有子元素字体与间距 |

**提交：** `b9ed6f7` - `ui: 手机端影院模式卡片设为双列布局，等比例缩小卡片内所有元素尺寸`

---

## 2026-05-27 手机端影院模式单列高适配与按钮右对齐优化

### 问题与反馈

用户在实测中发现：
1. 手机端屏幕双列展示时显示不全，第二列仅能看到卡片左侧约五分之一的内容，需要左滑才能看全。
2. 决定改回单列展示（`grid-template-columns: 1fr`）。
3. 单个卡片的高度需增加约 10%（由 320px 增加至 350px），以便在 iPhone 12 Pro (844px 高) 等设备上一个屏幕能完整容纳单列上下两个任务卡片的信息。
4. 底部操作按钮改为右对齐，且按钮之间保持合适的紧凑间距，避免之前双列拉伸导致的间距过大问题。

### 解决方案

1. **结构回退与高度调整 (mobile.css)**：
   - 将 `tbody` 网格列数恢复为 `1fr !important`。
   - `tr.media-wall-card` 高度、最小高度、最大高度统一设为 `350px !important`，并恢复舒适的 `padding: 12px`。
   - `add-task-placeholder` 占位符高度也同步跟进至 `350px !important`，并调大加号图标尺寸至 `60px` 配合单栏宽度。

2. **信息与按钮对齐调优 (mobile.css)**：
   - **文字与比例**：适度调回文字大小（标题 `15px`，Meta `11px`，进度 `11px`），以配合变宽后的单栏卡片。
   - **底部按钮右对齐**：操作按钮区 `.media-actions` 宽度设为 `auto` 防止拉伸，通过 `gap: 12px !important` 保持按钮间距紧凑。
   - **容器定位**：卡片底部容器 `.media-card-footer` 采用 `justify-content: flex-end !important`，迫使隐藏标签后的单组操作按钮整体靠右对齐。

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/css/mobile.css` | 影院卡片恢复为单列，调整高度至 350px，右对齐操作按钮并收紧其间隙 |

**提交：** `c57755f` - `ui: 影院模式卡片在手机端改回单列，高度调至350px，右对齐操作按钮并收紧间距`

---

## 2026-05-27 手机端影院模式等比例缩小风格单列适配

### 问题与反馈

上一版（c57755f）将子元素文字字号调回了粗大尺寸，破坏了用户中意的“等比例缩小的精美紧凑比例”，导致卡片看起来不对。
因此，需要在保留 `b9ed6f7` 版本的“等比例缩小”精美比例（13px 标题、28px 按钮、10px 字体等）的前提下：
1. 采用单列布局（`grid-template-columns: 1fr`）。
2. 高度微增至 `350px`，确保在 iPhone 12 Pro (844px 视口高) 设备上能在一屏中整齐地看清上下两个完整卡片的信息。
3. 底部按钮右对齐，且按钮之间保留 8px 的紧凑间距，消除拉伸。

### 解决方案

1. **单列与 350px 高度 (mobile.css)**：
   - 保持 `grid-template-columns: 1fr !important` 单列。
   - 卡片高度、最小高度、最大高度统一为 `350px !important`。
   - 恢复 `b9ed6f7` 版的紧凑内边距 `padding: 10px !important`。
   - `add-task-placeholder` 高度同步为 `350px`，内边距及图标尺寸恢复为紧凑版（48px 图标、24px 字体），确保视觉一致性。

2. **恢复精细的等比例缩小比例 (mobile.css)**：
   - **文字尺寸**：标题字号恢复为 `13px`，Meta 为 `10px`，进度文本为 `10px`。
   - **浮层与状态 capsule**：浮层 padding-bottom 维持 `95px`，`-webkit-line-clamp: 7`。状态胶囊维持 18px 高与 9px 文字。
   - **操作按钮右对齐**：`.media-card-footer` 依然采用 `justify-content: flex-end !important` 右对齐；按钮区 `.media-actions` 为 `width: auto` 右对齐，且 gap 降为 `8px !important`，保持精致的紧凑感。
   - **圆形按钮**：直径恢复为 `28px`，图标字号降为 `14px`。

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/css/mobile.css` | 恢复等比例缩小的高比例紧凑视觉样式，使用单列 350px 高度，并优化按钮右对齐与 8px 间距 |

**提交：** `0290f31` - `ui: 恢复等比例缩小卡片风格，设为单列布局并微调高度与按钮紧凑右对齐`

---

## 2026-05-27 手机端静态文件缓存强刷优化

### 问题与反馈

用户在测试时未发现样式有任何变化，判定其手机端浏览器缓存了旧版本的 `mobile.css` 等静态样式文件，导致没有即时加载最新样式。

### 解决方案

1. **引入版本号消除缓存 (index.html)**：
   - 在 `src/public/index.html` 的 CSS 引用中，为 `ui-themes.css`、`cinema-theme.css` 和 `mobile.css` 强行追加 `?v=3.0.0_1540` 缓存控制后缀。
   - 这样能迫使手机端浏览器跳过本地缓存，强制从服务端重新拉取最新的 CSS 文件。

2. **同步编译产物 (dist/public)**：
   - 手动执行复制操作将整个 `src/public` 覆盖至 `dist/public`，确保不管运行在 dev 环境还是 production（`dist` 目录）环境，修改均能即刻生效。

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/index.html` | 给关键 CSS 链接增加 `?v=3.0.0_1540` 参数进行强力破除缓存 |

**提交：** `7bec092` - `fix: 为静态样式引用添加版本号参数以清除浏览器缓存`

---

## 2026-05-27 手机端影院卡片等比例缩小的单列居中展示

### 问题与反馈

上一版（0290f31）在单列展示时，任务卡片的宽度占满了手机屏幕。因为宽度拉宽，导致高度 350px 显得非常宽扁，失去了“等比例缩小”的精美竖向海报形态。
用户期望：将卡片做成适配屏幕的单列竖向展示，并且在当前屏幕能够完整展示单个卡片的所有信息，类似把单个卡片等比例缩小放置。

### 解决方案

1. **设定固定宽度与网格居中 (mobile.css)**：
   - 保持单列布局 `grid-template-columns: 1fr !important`。
   - 在 `tbody` 级配置 `justify-items: center !important`，使所有任务卡片在手机端单列中水平完美居中对齐。
   - 将卡片 `tr.media-wall-card` 和占位卡片宽度锁死在 `220px !important`。搭配高度 `350px !important`，卡片的宽高比完美回缩为 `220:350 = 0.63`，与桌面端（240x380 = 0.63）比例完全一致，成功实现完美的等比例缩小竖向显示，并在 iPhone 12 Pro 上一屏整齐地容纳两张完整卡片。

2. **强刷浏览器缓存 (index.html)**：
   - 在 `index.html` 中将 CSS 缓存清除后缀升级为 `?v=3.0.0_1555`，强制手机浏览器重新拉取最新的居中单列样式。
   - 再次同步编译了 `dist/public` 目录，确保生产环境立刻更新。

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/css/mobile.css` | 将影院卡片设定为 220px 宽，并配置 grid 容器居中，实现完美的单栏等比例缩小竖向展示 |
| `src/public/index.html` | 更新破缓存后缀至 `?v=3.0.0_1555`，强制重载样式 |

**提交：** `3699a8c` - `ui: 实现等比例缩小电影卡片在手机端单列居中展示，强刷浏览器缓存`

---

## 2026-05-27 手机端影院卡片无左右溢出及等比例放大适配

### 问题与反馈

用户在实测中指出：
1. 页面虽然已经是单列，但依然可以左右滑动（存在横向溢出问题）。这是由于移动端全局的 `table { min-width: 600px; }` 样式污染导致的，即使是媒体墙布局，表格依然宽达 600px 造成溢出。
2. 220px 的宽度在手机上显得两侧留白过多，应当在保持黄金比例的前提下把比例放大一点。

### 解决方案

1. **彻底解决横向溢出 (mobile.css)**：
   - 增加了特定于 `.media-container` 或是 `data-ui-style="media"` 下的 table 覆盖规则：
     ```css
     [data-ui-style="media"] .table-container { overflow-x: hidden !important; }
     [data-ui-style="media"] #taskTable { min-width: 0 !important; width: 100% !important; }
     ```
     彻底屏蔽媒体墙模式下的任何横向溢出与左右滑动现象，但仍能保留表格视图的正常横向滚动。

2. **等比例放大卡片大小，填补两侧空白 (mobile.css)**：
   - 将卡片 `tr.media-wall-card` 及添加卡片的宽度放大为 **`260px !important`**，高度相应按比例扩展至 **`410px !important`**。
   - 宽高比调整为 `260:410 = 0.634`，继续完美维持与桌面端（`240:380 = 0.63`）完全一致的纵向电影卡片黄金比例。两侧的视觉白边被大大缩减，视觉丰满高级。
   - 占位卡片内部图标尺寸按比例微调为 `52px`，字体微调为 `12px`，保证美观协调。

3. **版本参数更新破除缓存 (index.html)**：
   - 在 `src/public/index.html` 中，破缓存的版本标识更新为 `?v=3.0.0_1625`，确保手机浏览器绝对能加载到最新的排版配置。

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/css/mobile.css` | 屏蔽媒体视图的 table 最小宽度与水平滚动；将影院模式卡片等比例放大至 260px x 410px 居中展示 |
| `src/public/index.html` | 更新破缓存参数至 `?v=3.0.0_1625` |

**提交：** `4b05dea` - `fix: 解决手机端影院模式左右滑动溢出问题，卡片尺寸等比例放大至 260px x 410px`

---

## 2026-05-27 手机端影院卡片尺寸优化至 300px 填满两侧

### 问题与反馈

上一版（4b05dea）虽然解决了左右滑动并把宽度提升到了 260px，但是在手机屏幕实测中，卡片两侧依然有相对明显的黑色背景空白留白。
用户期望：任务卡片能够再等比例放大一些，使留白更少、卡片看起来更加壮观丰满。

### 解决方案

1. **等比例放大卡片大小至 300px (mobile.css)**：
   - 将卡片 `tr.media-wall-card` 及添加卡片的宽度再次放大为 **`300px !important`**。
   - 高度按比例等比扩展至 **`470px !important`**。宽高比维持在 `300:470 = 0.638`，牢牢锁定与桌面端一致的海报黄金比例。
   - 两侧白边大幅缩小到理想的紧凑宽度，卡片信息更加突出。
   - 适当拉大上下卡片 gap 间隙至 `20px`。
   - 占位符卡片内边距调为 `16px`，图标增大到 `60px`，加号字号调到 `30px`，使内部格局更加协调。

2. **等比例适配字体和按钮大小 (mobile.css)**：
   - 卡片标题字号设为 `15px`，Meta、进度、缺失文字均调大为 `11px`，以匹配更大的卡片底座。
   - 悬浮简介 overlay 的 clamp 恢复到 `10` 行，底部留空设定为 `110px`，让长简介能够完整精致地显示出来。
   - 底部三个动作按钮直径设定为 `32px`，图标大小设定为 `16px`，按钮之间的 Gap 改为 `10px`，保持精致、右对齐且方便点击。

3. **静态文件版本后缀破缓存 (index.html)**：
   - 将版本参数升级为 `?v=3.0.0_1638` 强制打破客户端浏览器缓存。
   - 再次将 `src/public` 同步覆盖至 `dist/public`。

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/css/mobile.css` | 影院模式卡片放宽为 300px、增高为 470px，相应调大字号和按钮规格 |
| `src/public/index.html` | 更新破缓存后缀至 `?v=3.0.0_1638` |

**提交：** `e23f741` - `ui: 进一步放大影院模式卡片至 300px x 470px，减少两侧空白并微调字体按钮尺寸`

---

## 2026-05-27 全端指定 TMDB 遮挡问题修复

### 问题描述
点击文件列表界面（`.files-list-modal`）中的 "指定TMDB" 按钮后，弹出的手动指定 TMDB 窗口（`#manualTmdbModal`）被文件列表弹窗遮挡。

### 根本原因
- `.files-list-modal` 是通过 `tasks.js` 动态创建并直接作为 `document.body` 的子元素挂载的，其 `z-index` 设为 `1005`。
- `#manualTmdbModal` 静态定义在 `index.html` 中，但之前被嵌套在 `.page-container` 内部。
- `.page-container` 拥有 `position: relative` 和 `z-index: 1`，从而形成了一个独立的 Stacking Context（堆叠上下文）。
- 因此，尽管在 `tasks.js` 中将 `#manualTmdbModal` 的 `z-index` 设为了 `2000`（或行内设为 `1100`），它依然被限制在 `.page-container` 的层级之下，无法穿透并置于直接挂载在 `body` 上的 `.files-list-modal` 之上。

### 解决方案
- 将 `src/public/index.html` 中的 `#manualTmdbModal` 和 `#openaiModelsModal` 从 `.page-container` 内部移出，放置在 HTML 结构的尾部，作为 `body` 的直接子元素。
- 移除了由于历史开发遗留导致的 `</body>` 和 `</html>` 标签在文件中间闭合的不规范结构，将它们正确地放到文件最末端。
- 执行同步命令，将静态文件变更复制同步到 `dist/public` 目录中。

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/index.html` | 移动 manualTmdbModal 和 openaiModelsModal 到 body 根部；修复 </body> </html> 标签闭合位置 |

**提交：** `9f51097` - `fix: 解决指定TMDB和选择模型弹窗在文件列表层级之下的遮挡问题`

---

## 2026-05-27 悬浮菜单“更多”中添加“新建任务”入口

### 需求
在全端的“更多”悬浮按钮弹出的子菜单中，增加一个“新建任务”的触发入口，并将其放置于第一位。

### 解决方案
- 在 `src/public/index.html` 的 `.floating-btns-container` 容器顶部添加 `onclick="openCreateTaskModal()"` 属性的“新建任务”触发按钮。
- 将静态文件同步到 `dist/public` 目录中。

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/index.html` | 在“更多”悬浮按钮容器的首位添加“新建任务”按钮 |

**提交：** `60147d4` - `feat: 在全端更多悬浮菜单中增加新建任务入口并排在首位`

---

## 2026-05-27 手机端影院模式点击简介收回海报优化

### 需求
在手机端（移动端）影院模式下，点击卡片后展示简介，再次点击已展示简介的区域时，应当取消简介的展示，恢复成原来的海报展示。

### 根本原因
- 卡片的简介元素 `.media-card-hover-overview` 之前设置了 `onclick="event.stopPropagation();"`，这阻断了点击事件冒泡到外层容器，使得点击简介元素本身不会触发 `cinema-background.js` 中绑定的 `handleClick(e)` 切换逻辑。

### 解决方案
- 将 `src/public/js/tasks.js` 中 `.media-card-hover-overview` 元素的 `onclick` 属性，修改为仅在桌面非触控环境（`window.innerWidth > 768 && !('ontouchstart' in window)`）下才调用 `event.stopPropagation();`。
- 在移动端或触控设备下允许点击事件冒泡，使得点击简介文本时，事件能冒泡并触发外层卡片的 `toggleCardOverview` 逻辑，实现点击收起，恢复海报展示。

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/js/tasks.js` | 调整 media-card-hover-overview 点击事件，使移动端点击不阻断事件冒泡 |

**提交：** `39b0ab7` - `fix: 手机端影院模式点击简介可收回，恢复海报展示`

---

## 2026-05-27 手机端影院模式侧边栏点击无效问题修复

### 需求
在手机端的影院模式下，展开侧边栏并点击“仪表盘”、“任务管理”、“账号管理”、“系统设置”等系统菜单时无任何反应。

### 根本原因
- 侧边栏 `.sidebar` 包含在 `.app-layout` 容器内部。
- 在影院模式下，`cinema-theme.css` 设置了 `[data-theme="cinema"] .app-layout { position: relative; z-index: 1; }`，从而建立了新的堆叠上下文。
- 移动端的遮罩层 `.sidebar-overlay` 是 `body` 的直接子元素（位于 `.app-layout` 之外），并且其 `z-index` 设置为 `3999`。
- 当遮罩层激活显示时，由于 `3999 > 1`，`.sidebar-overlay` 整体覆盖在 `.app-layout`（以及其内部的 `.sidebar`）之上。虽然侧边栏看起来滑出了，但是所有的点击事件都被高层级的 `.sidebar-overlay` 阻挡吞噬，导致菜单项无法响应点击。

### 解决方案
- 将 `src/public/index.html` 中的 `.sidebar-overlay` 元素移入到 `.app-layout` 容器内部。
- 移入后，由于两者共享同一个父堆叠上下文（`.app-layout`），它们的 `z-index` 在同一层级比较：侧边栏的 `z-index: 4000` 大于遮罩层的 `z-index: 3999`。
- 这确保了侧边栏在激活时始终悬浮在遮罩层之上，点击事件可以正确地传递并响应。

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/index.html` | 将 sidebar-overlay 元素移入到 app-layout 内部，调整堆叠顺序 |

**提交：** `4fddcb2` - `fix: 修复手机端影院模式下侧边栏菜单无法点击的问题`

---

## 2026-05-27 简化顶栏通知下拉菜单并修正系统运行时长

### 需求
- 顶栏的通知按钮下拉菜单中，仅保留并显示服务器运行时长（系统运行时长）和“查看系统日志”按钮。
- 解决重启后系统运行时长没有更新的问题，将原来写死的“已运行 12 天 18 小时”文本改为向 `/api/version` 接口动态获取 `uptime` 并格式化展示。

### 解决方案
- 修改 `src/public/js/main.js` 中的通知按钮点击事件监听器：
  - 改为异步请求，并在每次打开下拉框时向后端 `/api/version` 接口获取实时 `uptime`（以秒为单位）。
  - 将 `uptime` 秒数格式化为 `X 天 Y 小时 Z 分钟` / `N 秒` 格式。
  - 重构 `.notification-dropdown` 的 HTML 结构，去除所有多余的任务状态报告、失败警告和完成通知等展示折叠面板，仅保留运行时长卡片和查看系统日志按钮。
  - 删除废弃的全局 `toggleNotificationSection` 函数。
- 运行同步指令，将变更覆盖至 `dist/public/js/main.js`。
- 执行 `npm run build` 确保 TypeScript/后端正常编译。

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/js/main.js` | 动态获取并格式化运行时长，简化通知下拉菜单，删除 unused 函数 |

---

## 2026-05-27 调整全端仪表盘状态颜色

### 需求
在全端的仪表盘中，状态颜色调整为：
- 追剧中 / 执行中：绿色
- 失败 / 异常：绿色
- 已完结：蓝色

### 解决方案
- 修改 `src/public/index.html` 中的 hero stats 卡片样式，将 inline style 中 `processing` 与 `failed` 数字的颜色统一调整为绿色（`#15803d`），而将 `completed` 数字的颜色调整为蓝色（`#3b82f6`）。
- 修改 `src/public/js/main.js` 中的 `getStatusStyle` 函数，为近期活跃任务列表的 Badge 返回仪表盘专用类名（如 `status-dash-processing`, `status-dash-failed`, `status-dash-completed`）。
- 在 `src/public/css/ui-themes.css` 中定义了这些专用类名，在默认主题下将 `processing` 与 `failed` 设为绿色，`completed` 设为蓝色（`#2563eb`）；同时添加了影院模式（`[data-theme="cinema"]`）下的主题适配。
- 运行同步指令将前端文件同步到 `dist/public`。

---

## 2026-05-29 修复任务卡片四角渲染漏光问题

### 需求
用户反馈任务卡片四周边角有些类似于屏幕边缘漏光的白边/异常渲染情况。

### 根本原因
- 在 Chromium 浏览器中，当元素同时具有 `border-radius` (圆角) 和 `overflow: hidden` 时，如果同时应用了 `backdrop-filter: blur(...)`，浏览器渲染层在处理混合背景和模糊计算时会产生边缘亚像素渲染瑕疵，视觉上类似于“漏光”。
- 实际上，任务卡片自身已经拥有半透明背景，不需要模糊背景滤镜。

### 解决方案
- 移除 `src/public/css/ui-themes.css` 中明亮模式和影院模式下 `.media-wall-card` 定义的 `backdrop-filter: blur(8px)`、`backdrop-filter: blur(20px)` 等属性。
- 移除 `src/public/css/cinema-theme.css` 中影院模式下 `.media-wall-card` 重复定义的 `backdrop-filter` 及其 Webkit 兼容前缀。
- **影院模式额外覆盖**：在 `cinema-theme.css` 中，由于 `.media-wall-card` 同样是 `#taskTable tr` 元素，因此会受到 `#taskTable tr` 上 `backdrop-filter` 样式的层叠匹配。我们特别针对 `.media-wall-card` 的样式规则添加了 `backdrop-filter: none !important` 进行绝对覆盖，避免了在影院模式下失效。
- 更新 `src/public/index.html` 与 `dist/public/index.html` 中所有本地 CSS 及 JS 资源引用的版本号参数 `?v=3.0.0_1452`，彻底强刷浏览器缓存，使新样式立刻生效。
- 将全部最新的前端静态资源完整同步覆盖至 `dist/public`，编译验证项目无错。
---

## 2026-05-29 合并 PR #22 并进行 concept 分支适配

### 需求
将 PR #22 (采纳方案的最终 commit `629717d`) 的改动合并至当前 `concept` 分支，仅评估和应用 PR #22 的这部分逻辑，并确保适配 `concept` 分支中经典列表 (`classic`) 与媒体海报墙 (`media`) 两套 UI。

### 解决方案
- 使用 `git cherry-pick -n 629717d` 将 PR #22 的全部功能改动精准应用到当前分支，避免拉入 `dev` 分支的其他非 PR #22 提交。
- **解决 3 个冲突文件**：
  1. `src/index.js`：保留 `HEAD` 分支用于 SmartStrm webhook 的路径前缀及注释，融合重命名信息的展示。
  2. `src/services/emby.js`：采纳向后兼容逻辑，支持老版本的布尔配置（`emby: true`）与新版本的嵌套对象配置。
  3. `src/services/task.js`：引入启发式视频类型推断方法 `_inferVideoType`。在 `concept` 已有的多策略高精度搜索验证机制中，融入 `inferredType` 以优化 `typesToTry` 的搜索顺序；并在验证通过后自动持久化 TMDB 元数据，并计算填充电视剧总集数。
- **双 UI 适配验证**：前端渲染逻辑统一通过 `getStatusMeta(task)` 完成，在 `pending` 状态且已有剧集进度时自动映射为 `status-processing` (追更中) 展示。两套 UI 完美兼容，状态显示完好。
- 执行 `npm run build` 确保 TypeScript/后端项目能够正常编译。

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/index.js` | 融合绑定后的重命名通知详情并保留 webhook 注释 |
| `src/services/emby.js` | 兼容旧格式 emby: true 和新格式配置 |
| `src/services/scheduler.js` | (自动合并成功) 定时任务增加防 TMDB 限流延迟 |
| `src/services/task.js` | 融合启发式类型推断和多策略自动填充元数据及总集数逻辑 |

**提交：** `6fee7b7` - `feat: 合并 PR #22 采纳改动至 concept 分支 (包含 TMDB 启发式优先检测、总集数自动填充、Emby 配置兼容)`
---

## 2026-05-29 修复天翼云盘 Cookie 登录问题

### 需求
根据 `2c47fa0` 提交，解决当前版本天翼云盘 Cookie 登录失效的问题（天翼云当前版本认证 cookie 为 COOKIE_LOGIN_USER，而旧版的 SSON 已被废弃）。

### 解决方案
- 采纳 `2c47fa0` 的修复改动，执行 `git cherry-pick 2c47fa0`。
- **修改文件**：
  1. `src/services/cloud189.js`：如果用户使用 Cookie 登录，从完整 Cookie 字符串中自动提取 `COOKIE_LOGIN_USER` 传给 SDK，而不是直接传整个 Cookie。
  2. `src/public/index.html`：将 Cookie 输入框的类型由 `cookie` 修改为 `text`，并添加占位符及如何从浏览器开发者工具 (F12) 获取完整 Cookie 的指引说明。
- 执行 `xcopy /E /Y /I src\public dist\public` 同步静态资源。
- 运行 `npm run build` 验证 TypeScript 编译通过。

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/public/index.html` | 优化 Cookie 字段为文本框，增加 placeholder 和提示文案 |
| `src/services/cloud189.js` | 提取并支持 COOKIE_LOGIN_USER 传参 |

**提交：** `03f9237` - `fix: Cookie 登录支持 COOKIE_LOGIN_USER，修复天翼云盘 Cookie 登录问题`
---
