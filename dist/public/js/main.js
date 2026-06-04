"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const VERSION_STORAGE_KEY = 'lastSeenVersion';
// 版本更新通知弹窗
function showVersionUpdateModal(version, changelog = []) {
    // 检查是否已经显示过弹窗
    const lastSeenVersion = localStorage.getItem(VERSION_STORAGE_KEY);
    if (lastSeenVersion === version)
        return;
    // 生成更新日志列表
    const changelogHtml = changelog.length > 0
        ? changelog.map(item => `<li>${item}</li>`).join('')
        : '<li>暂无更新说明</li>';
    // 创建弹窗
    const modal = document.createElement('div');
    modal.id = 'versionUpdateModal';
    modal.innerHTML = `
        <div class="version-modal-overlay"></div>
        <div class="version-modal-content">
            <div class="version-modal-header">
                <span class="version-modal-icon">🎉</span>
                <h3>新版本通知</h3>
            </div>
            <div class="version-modal-body">
                <div class="version-modal-version">v${version}</div>
                <div class="version-modal-changes">
                    <h4>本次更新内容：</h4>
                    <ul>${changelogHtml}</ul>
                </div>
            </div>
            <div class="version-modal-footer">
                <button class="btn-primary version-modal-btn" onclick="closeVersionModal('${version}')">朕已阅</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}
// 关闭版本弹窗
window.closeVersionModal = function (version) {
    const modal = document.getElementById('versionUpdateModal');
    if (modal) {
        modal.classList.add('fade-out');
        setTimeout(() => modal.remove(), 300);
    }
    localStorage.setItem(VERSION_STORAGE_KEY, version);
};
function loadVersion() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch('/api/system/version');
            const data = yield response.json();
            if (!data.success || !data.data)
                return;
            const versionStr = data.data.version || 'unknown';
            const changelog = data.data.changelog || [];
            const versionEl = document.getElementById('version');
            if (!versionEl)
                return;
            // dev 版本添加特殊标识
            if (versionStr.includes('-dev')) {
                versionEl.innerText = `v${versionStr}`;
                versionEl.style.color = '#ff9800'; // 开发版用橙色
                versionEl.title = '开发测试版本';
            }
            else {
                versionEl.innerText = `v${versionStr}`;
            }
            // 显示版本更新通知弹窗
            showVersionUpdateModal(versionStr, changelog);
        }
        catch (error) {
            console.error('Failed to load version:', error);
        }
    });
}
function loadDashboardStats() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch('/api/tasks?status=all&search=');
            const data = yield response.json();
            if (!data.success) {
                return;
            }
            const tasks = data.data || [];
            // 追剧中：processing状态 + pending状态但已有集数的任务
            const watchingCount = tasks.filter(task => task.status === 'processing' ||
                (task.status === 'pending' && task.currentEpisodes > 0)).length;
            const stats = {
                total: tasks.length,
                processing: watchingCount,
                completed: tasks.filter(task => task.status === 'completed').length,
                failed: tasks.filter(task => task.status === 'failed' || task.status === 'error').length
            };
            Object.entries(stats).forEach(([key, value]) => {
                const element = document.querySelector(`[data-stat="${key}"]`);
                if (element) {
                    element.textContent = value;
                }
            });
            const dashRecentTasks = document.getElementById('dashRecentTasks');
            if (dashRecentTasks && tasks.length > 0) {
                const recent = tasks.sort((a, b) => b.id - a.id); // 移除slice限制，显示所有任务
                const formatStatus = (task) => {
                    if (task.status === 'completed')
                        return '已完结';
                    if (task.status === 'failed')
                        return '失败';
                    if (task.status === 'processing')
                        return '追剧中';
                    if (task.status === 'pending') {
                        if (task.currentEpisodes > 0)
                            return '追剧中';
                        return '等待中';
                    }
                    return task.status || '未知';
                };
                const getStatusStyle = (task) => {
                    if (task.status === 'completed')
                        return 'status-dash-completed';
                    if (task.status === 'failed')
                        return 'status-dash-failed';
                    if (task.status === 'processing')
                        return 'status-dash-processing';
                    if (task.status === 'pending') {
                        if (task.currentEpisodes > 0)
                            return 'status-dash-processing';
                        return 'status-dash-pending';
                    }
                    return 'status-dash-' + (task.status || 'unknown');
                };
                dashRecentTasks.innerHTML = recent.map(task => {
                    const taskName = task.shareFolderName ? (task.resourceName + '/' + task.shareFolderName) : task.resourceName || '未命名任务';
                    return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-radius: 6px; background: var(--bg-main);">
                    <div style="display: flex; flex-direction: column; gap: 4px; overflow: hidden;">
                        <span style="font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${taskName}</span>
                        <span style="font-size: 11px; color: var(--text-muted);">${new Date(task.createdAt || Date.now()).toLocaleString()}</span>
                    </div>
                    <span class="status-badge ${getStatusStyle(task)}" style="font-size: 11px; padding: 4px 8px;">${formatStatus(task)}</span>
                </div>
            `;
                }).join('');
            }
            else if (dashRecentTasks) {
                dashRecentTasks.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">暂无任务</div>';
            }
        }
        catch (error) {
            console.error('Failed to load dashboard stats:', error);
        }
    });
}
function loadStorageSummary() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const settingsRes = yield fetch('/api/settings');
            const settingsData = yield settingsRes.json();
            if (!settingsData.success)
                return;
            const enableStorageAggregation = (_b = (_a = settingsData.data.task) === null || _a === void 0 ? void 0 : _a.enableStorageAggregation) !== null && _b !== void 0 ? _b : true;
            const storageCard = document.getElementById('storageSummaryCard');
            if (!storageCard)
                return;
            if (!enableStorageAggregation) {
                storageCard.style.display = 'none';
                return;
            }
            const summaryRes = yield fetch('/api/accounts/storage-summary');
            const summaryData = yield summaryRes.json();
            if (!summaryData.success || !summaryData.data) {
                storageCard.style.display = 'none';
                return;
            }
            const data = summaryData.data;
            const cloudTotal = data.cloud.total || 0; // 字节
            const cloudUsed = data.cloud.used || 0; // 字节
            if (cloudTotal === 0) {
                storageCard.style.display = 'none';
                return;
            }
            storageCard.style.display = 'block';
            // 统一使用 TB 单位显示（数据源单位为字节）
            const formatSize = (bytes) => {
                const tb = bytes / Math.pow(1024, 4); // B -> TB
                return tb.toFixed(2) + ' TB';
            };
            const percent = ((cloudUsed / cloudTotal) * 100).toFixed(2);
            document.getElementById('storageTotalText').textContent = `${formatSize(cloudUsed)} / ${formatSize(cloudTotal)} (${percent}%)`;
            document.getElementById('storageProgressBar').style.width = `${percent}%`;
            const accountsListEl = document.getElementById('storageAccountsList');
            if (accountsListEl) {
                if (data.accounts && data.accounts.length > 0) {
                    accountsListEl.innerHTML = data.accounts.map(acc => {
                        const accTotal = acc.cloudTotal || 0;
                        const accUsed = acc.cloudUsed || 0;
                        const accPercent = accTotal > 0 ? ((accUsed / accTotal) * 100).toFixed(1) : '0.0';
                        const displayName = acc.alias ? `${acc.alias} (${acc.username})` : acc.username;
                        return `
                        <div class="storage-account-item">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                                <span style="font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;" title="${displayName}">${displayName}</span>
                                <span style="font-size: 12px; font-weight: 600; color: var(--accent-strong);">${accPercent}%</span>
                            </div>
                            <div class="storage-progress-bar-bg" style="height: 6px; margin: 4px 0;">
                                <div class="storage-progress-bar-fill" style="width: ${accPercent}%; height: 100%;"></div>
                            </div>
                            <div style="font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between;">
                                <span>已用: ${formatSize(accUsed)}</span>
                                <span>总量: ${formatSize(accTotal)}</span>
                            </div>
                        </div>
                    `;
                    }).join('');
                }
                else {
                    accountsListEl.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">暂无云盘账号容量信息</div>';
                }
            }
        }
        catch (error) {
            console.error('Failed to load storage summary:', error);
        }
    });
}
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
// 主入口文件
document.addEventListener('DOMContentLoaded', () => {
    // 初始化macos样式
    const appTitle = document.getElementById('appTitle');
    if (appTitle) {
        if (localStorage.getItem('_currentTheme') === 'macos') {
            // 插入新的css
            const newCss = document.createElement('link');
            newCss.rel = 'stylesheet';
            newCss.href = '/css/macos.css';
            document.head.appendChild(newCss);
        }
        appTitle.addEventListener('click', (e) => {
            e.preventDefault();
            const currentTheme = localStorage.getItem('_currentTheme');
            if (currentTheme === 'macos') {
                localStorage.setItem('_currentTheme', '');
                // 移除macos样式
                const macosCss = document.querySelector('link[href="/css/macos.css"]');
                if (macosCss) {
                    document.head.removeChild(macosCss);
                }
            }
            else {
                localStorage.setItem('_currentTheme', 'macos');
                // 插入新的css
                const newCss = document.createElement('link');
                newCss.rel = 'stylesheet';
                newCss.href = '/css/macos.css';
                document.head.appendChild(newCss);
            }
        });
    }
    // 侧边栏切换逻辑
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarPin = document.getElementById('sidebarPin');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    // 显示遮罩层
    const showOverlay = () => {
        if (sidebarOverlay) {
            sidebarOverlay.classList.add('show');
        }
    };
    // 隐藏遮罩层
    const hideOverlay = () => {
        if (sidebarOverlay) {
            sidebarOverlay.classList.remove('show');
        }
    };
    // 关闭侧边栏（移动端）
    const closeSidebar = () => {
        if (sidebar && window.innerWidth <= 768) {
            sidebar.classList.remove('open');
            hideOverlay();
        }
    };
    if (sidebarToggle && sidebar) {
        // 切换按钮：展开/收起侧边栏
        sidebarToggle.addEventListener('click', () => {
            if (sidebar.classList.contains('pinned')) {
                // 如果已固定，取消固定并收起
                sidebar.classList.remove('pinned', 'open');
                hideOverlay();
            }
            else {
                // 否则切换展开状态
                const isOpening = !sidebar.classList.contains('open');
                sidebar.classList.toggle('open');
                // 移动端：显示/隐藏遮罩层
                if (window.innerWidth <= 768) {
                    if (isOpening) {
                        showOverlay();
                    }
                    else {
                        hideOverlay();
                    }
                }
            }
        });
        // 点击遮罩层关闭侧边栏（移动端）
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', closeSidebar);
        }
        // 点击侧边栏外部关闭（仅在展开且未固定时）
        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('open') &&
                !sidebar.classList.contains('pinned') &&
                !sidebar.contains(e.target) &&
                !sidebarToggle.contains(e.target) &&
                !(sidebarOverlay && sidebarOverlay.contains(e.target))) {
                sidebar.classList.remove('open');
                hideOverlay();
            }
        });
        // 窗口大小改变时处理遮罩层
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                hideOverlay();
            }
            else if (sidebar.classList.contains('open') && !sidebar.classList.contains('pinned')) {
                showOverlay();
            }
        });
    }
    if (sidebarPin && sidebar) {
        // 固定按钮：切换固定状态
        sidebarPin.addEventListener('click', (e) => {
            e.stopPropagation();
            const isPinned = sidebar.classList.toggle('pinned');
            if (isPinned) {
                // 固定时确保侧边栏展开
                sidebar.classList.add('open');
                localStorage.setItem('sidebarPinned', 'true');
            }
            else {
                localStorage.removeItem('sidebarPinned');
            }
        });
        // 恢复固定状态
        if (localStorage.getItem('sidebarPinned') === 'true') {
            sidebar.classList.add('pinned', 'open');
        }
    }
    // 版本号点击打开GitHub
    const versionBadge = document.querySelector('.sidebar-version .version-badge');
    if (versionBadge) {
        versionBadge.style.cursor = 'pointer';
        versionBadge.addEventListener('click', () => {
            window.open('https://github.com/ymting/my-cloud189-auto-save', '_blank');
        });
    }
    // 初始化通知图标
    const notificationBtn = document.querySelector('.notification-btn');
    if (notificationBtn) {
        notificationBtn.style.cursor = 'pointer';
        notificationBtn.addEventListener('click', () => __awaiter(void 0, void 0, void 0, function* () {
            // 创建通知弹窗
            const existing = document.querySelector('.notification-dropdown');
            if (existing) {
                existing.remove();
                return;
            }
            let uptimeStr = '获取中...';
            try {
                const res = yield fetch('/api/version');
                const data = yield res.json();
                if (data && typeof data.uptime === 'number') {
                    const seconds = data.uptime;
                    const d = Math.floor(seconds / (3600 * 24));
                    const h = Math.floor((seconds % (3600 * 24)) / 3600);
                    const m = Math.floor((seconds % 3600) / 60);
                    const s = Math.floor(seconds % 60);
                    let parts = [];
                    if (d > 0)
                        parts.push(`${d} 天`);
                    if (h > 0 || d > 0)
                        parts.push(`${h} 小时`);
                    if (m > 0 || h > 0 || d > 0)
                        parts.push(`${m} 分钟`);
                    if (parts.length === 0) {
                        parts.push(`${s} 秒`);
                    }
                    uptimeStr = parts.join(' ');
                }
                else {
                    uptimeStr = '未知';
                }
            }
            catch (err) {
                console.error('Failed to fetch uptime:', err);
                uptimeStr = '获取失败';
            }
            const dropdown = document.createElement('div');
            dropdown.className = 'notification-dropdown';
            dropdown.innerHTML = `
                <div class="notification-header" style="display: flex; align-items: center; justify-content: space-between;">
                    <h3 style="margin: 0; font-size: 15px; font-weight: 600;">系统状态</h3>
                    <span class="notification-close" style="cursor: pointer; font-size: 20px; line-height: 1;">&times;</span>
                </div>
                <div class="notification-body" style="padding: 16px; display: flex; flex-direction: column; gap: 16px;">
                    <div style="display: flex; align-items: center; gap: 10px; background: rgba(75, 75, 250, 0.1); padding: 12px 14px; border-radius: 8px; border: 1px solid rgba(75, 75, 250, 0.2);">
                        <i class="ph ph-clock" style="font-size: 20px; color: #4B4BFA;"></i>
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            <span style="font-size: 12px; color: var(--text-muted);">运行时长</span>
                            <span class="uptime-text" style="font-size: 14px; font-weight: 600; color: var(--text-main);">${uptimeStr}</span>
                        </div>
                    </div>
                    <div style="border-top: 1px solid var(--border-color); padding-top: 12px;">
                        <button onclick="document.getElementById('logsModal').style.display='flex'; document.querySelector('.notification-dropdown').remove();" style="width: 100%; padding: 10px 12px; background: #4B4BFA; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s ease;">
                            <i class="ph ph-file-text" style="font-size: 16px;"></i>查看系统日志
                        </button>
                    </div>
                </div>
            `;
            const rect = notificationBtn.getBoundingClientRect();
            dropdown.style.position = 'fixed';
            dropdown.style.right = `${window.innerWidth - rect.right}px`;
            dropdown.style.top = `${rect.bottom + 8}px`;
            dropdown.style.zIndex = '2000';
            document.body.appendChild(dropdown);
            dropdown.querySelector('.notification-close').addEventListener('click', () => {
                dropdown.remove();
            });
            setTimeout(() => {
                document.addEventListener('click', function closeDropdown(e) {
                    if (!dropdown.contains(e.target) && !notificationBtn.contains(e.target)) {
                        dropdown.remove();
                        document.removeEventListener('click', closeDropdown);
                    }
                });
            }, 0);
        }));
    }
    // 搜索框交互：输入时隐藏图标和快捷键提示
    const topbarSearch = document.querySelector('.topbar-search');
    const searchInput = document.getElementById('globalSearch');
    const searchIcon = topbarSearch === null || topbarSearch === void 0 ? void 0 : topbarSearch.querySelector('i');
    const searchShortcut = topbarSearch === null || topbarSearch === void 0 ? void 0 : topbarSearch.querySelector('.search-shortcut');
    if (searchInput && topbarSearch) {
        const updateSearchUI = () => {
            const hasValue = searchInput.value.length > 0;
            const isFocused = document.activeElement === searchInput;
            // 有内容或聚焦时，隐藏图标和快捷键
            if (hasValue || isFocused) {
                topbarSearch.classList.add('searching');
            }
            else {
                topbarSearch.classList.remove('searching');
            }
        };
        searchInput.addEventListener('focus', updateSearchUI);
        searchInput.addEventListener('blur', updateSearchUI);
        searchInput.addEventListener('input', updateSearchUI);
        // ⌘K / Ctrl+K 快捷键聚焦搜索框
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchInput.focus();
            }
        });
        // 全局搜索框过滤任务功能
        const performGlobalSearch = debounce(() => {
            const searchValue = searchInput.value.trim();
            // 更新任务过滤参数并刷新任务列表
            if (typeof taskFilterParams !== 'undefined') {
                taskFilterParams.search = searchValue;
                const taskSearch = document.getElementById('taskSearch');
                if (taskSearch && taskSearch.value !== searchValue) {
                    taskSearch.value = searchValue;
                }
                if (typeof fetchTasks === 'function') {
                    fetchTasks({ silent: true });
                }
            }
        }, 500);
        // 输入时触发搜索（防抖）
        searchInput.addEventListener('input', performGlobalSearch);
        // 回车键立即搜索
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const searchValue = searchInput.value.trim();
                if (typeof taskFilterParams !== 'undefined') {
                    taskFilterParams.search = searchValue;
                    const taskSearch = document.getElementById('taskSearch');
                    if (taskSearch && taskSearch.value !== searchValue) {
                        taskSearch.value = searchValue;
                    }
                    if (typeof fetchTasks === 'function') {
                        fetchTasks({ silent: true });
                    }
                }
            }
        });
    }
    // 主题切换由 theme.js 的 initTheme() 统一处理
    // 加载版本号和仪表盘
    loadVersion();
    loadDashboardStats();
    loadStorageSummary();
    // 初始化所有功能
    initTabs();
    initAccountForm();
    initTaskForm();
    initEditTaskForm();
    // 初始化主题
    initTheme();
    // 初始化影院背景（如果当前是影院模式）
    if (localStorage.getItem('theme') === 'cinema' && typeof initCinemaBackground === 'function') {
        initCinemaBackground();
    }
    // 初始化日志
    initLogs();
    // 初始化目录选择器
    const folderSelector = new FolderSelector({
        enableFavorites: true,
        favoritesKey: 'createTaskFavorites',
        onSelect: ({ id, name, path }) => {
            document.getElementById('targetFolder').value = path;
            document.getElementById('targetFolderId').value = id;
            if (typeof autoDetectVideoType === 'function')
                autoDetectVideoType();
        }
    });
    // 修改目录选择触发方式
    document.getElementById('targetFolder').addEventListener('click', (e) => {
        e.preventDefault();
        const accountId = document.getElementById('accountId').value;
        if (!accountId) {
            message.warning('请先选择账号');
            return;
        }
        folderSelector.show(accountId);
    });
    // 添加常用目录按钮点击事件
    document.getElementById('favoriteFolderBtn').addEventListener('click', (e) => {
        e.preventDefault();
        const accountId = document.getElementById('accountId').value;
        if (!accountId) {
            message.warning('请先选择账号');
            return;
        }
        folderSelector.showFavorites(accountId);
    });
    // 初始化数据
    fetchAccounts(true);
    fetchTasks();
    loadDashboardStats();
    loadStorageSummary();
    // 定时刷新数据
    // setInterval(() => {
    //     fetchTasks();
    // }, 30000);
});
// 从缓存获取数据
function getFromCache(key) {
    // 拼接用户 ID
    const userId = document.getElementById('accountId').value;
    return localStorage.getItem(key + '_' + userId);
}
// 保存数据到缓存
function saveToCache(key, value) {
    const userId = document.getElementById('accountId').value;
    localStorage.setItem(key + '_' + userId, value);
}
document.addEventListener('DOMContentLoaded', function () {
    const tooltip = document.getElementById('regexTooltip');
    // 使用事件委托，监听整个文档的点击事件
    document.addEventListener('click', function (e) {
        // 检查点击的是否是帮助图标
        if (e.target.classList.contains('help-icon')) {
            e.stopPropagation();
            const helpIcon = e.target;
            const rect = helpIcon.getBoundingClientRect();
            const isVisible = tooltip.style.display === 'block';
            // 关闭弹窗
            if (isVisible && tooltip._currentIcon === helpIcon) {
                tooltip.style.display = 'none';
                return;
            }
            // 显示弹窗
            tooltip.style.display = 'block';
            tooltip._currentIcon = helpIcon;
            tooltip.style.zIndex = 9999;
            // 计算位置
            const viewportWidth = window.innerWidth;
            const tooltipWidth = tooltip.offsetWidth;
            // 移动端适配
            if (viewportWidth <= 768) {
                tooltip.style.left = '50%';
                tooltip.style.top = '50%';
                tooltip.style.transform = 'translate(-50%, -50%)';
                tooltip.style.maxWidth = '90vw';
                tooltip.style.maxHeight = '80vh';
                tooltip.style.overflow = 'auto';
            }
            else {
                let left = rect.left;
                if (left + tooltipWidth > viewportWidth) {
                    left = viewportWidth - tooltipWidth - 10;
                }
                tooltip.style.top = `${rect.bottom + 5}px`;
                tooltip.style.left = `${left}px`;
                tooltip.style.transform = 'none';
            }
        }
        else if (!tooltip.contains(e.target)) {
            // 点击其他地方关闭弹窗
            tooltip.style.display = 'none';
        }
    });
    // 添加 ESC 键关闭
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            tooltip.style.display = 'none';
        }
    });
});
function toggleFloatingBtns() {
    const container = document.getElementById('floatingBtnsContainer');
    const icon = document.getElementById('toggleIcon');
    container.classList.toggle('collapsed');
    icon.classList.toggle('expanded');
}
function toggleHelpText(button) {
    const helpText = button.nextElementSibling;
    if (helpText.style.display === 'block') {
        helpText.style.display = 'none';
        button.textContent = '显示帮助';
    }
    else {
        helpText.style.display = 'block';
        button.textContent = '隐藏帮助';
    }
}
