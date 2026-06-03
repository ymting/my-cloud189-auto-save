"use strict";
/**
 * 影巢 (HDHive) 资源搜索前端逻辑
 * 支持 OAuth 用户授权
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// 状态管理
let hdhiveState = {
    currentMedia: null, // 当前选中的影视信息
    currentType: null, // 当前影视类型 (movie/tv)
    currentTmdbId: null, // 当前 TMDB ID
    resources: [], // 当前资源列表
    selectedResource: null, // 选中的资源（用于解锁）
    unlockedData: null, // 解锁后的数据
    config: null, // 影巢配置
    authStatus: null // 授权状态
};
/**
 * 初始化影巢功能（页面加载时调用）
 */
function initHDHiveFeature() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const response = yield fetch('/api/settings');
            const data = yield response.json();
            if (data.success && ((_a = data.data) === null || _a === void 0 ? void 0 : _a.hdhive)) {
                hdhiveState.config = data.data.hdhive;
                const hdhiveBtn = document.querySelector('.hdhive-btn');
                // 只有启用影巢功能时才显示入口按钮
                if (hdhiveState.config.enabled) {
                    if (hdhiveBtn)
                        hdhiveBtn.style.display = 'flex';
                }
                else {
                    if (hdhiveBtn)
                        hdhiveBtn.style.display = 'none';
                }
            }
        }
        catch (error) {
            console.error('初始化影巢功能失败:', error);
            const hdhiveBtn = document.querySelector('.hdhive-btn');
            if (hdhiveBtn)
                hdhiveBtn.style.display = 'none';
        }
    });
}
/**
 * 打开影巢搜索模态框
 */
function openHDHiveModal() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        // 检查是否配置了 API Key
        if (!((_a = hdhiveState.config) === null || _a === void 0 ? void 0 : _a.apiKey)) {
            message.warning('请先在系统设置中配置影巢 API Key');
            return;
        }
        const modal = document.getElementById('hdhiveModal');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        // 检查授权状态
        yield checkHDHiveAuthStatus();
        // 加载积分信息
        loadHDHiveQuota();
        // 重置状态
        resetHDHiveState();
    });
}
/**
 * 关闭影巢搜索模态框
 */
function closeHDHiveModal() {
    const modal = document.getElementById('hdhiveModal');
    modal.style.display = 'none';
    document.body.overflow = '';
}
/**
 * 检查授权状态
 */
function checkHDHiveAuthStatus() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch('/api/hdhive/auth/status');
            const data = yield response.json();
            if (data.success) {
                hdhiveState.authStatus = data.data;
                updateAuthUI();
            }
        }
        catch (error) {
            console.error('检查授权状态失败:', error);
        }
    });
}
/**
 * 更新授权状态 UI
 */
function updateAuthUI() {
    const statusEl = document.getElementById('hdhiveAuthStatus');
    const authBtn = document.getElementById('hdhiveAuthBtn');
    const revokeBtn = document.getElementById('hdhiveRevokeBtn');
    if (!statusEl || !authBtn)
        return;
    const status = hdhiveState.authStatus;
    if (status === null || status === void 0 ? void 0 : status.needsOAuth) {
        // 需要授权
        statusEl.innerHTML = '<span style="color: #e74c3c;">⚠️ 未授权</span>';
        authBtn.style.display = 'inline-block';
        authBtn.textContent = 'OAuth 授权';
        if (revokeBtn)
            revokeBtn.style.display = 'none';
    }
    else if (status === null || status === void 0 ? void 0 : status.isAuthorized) {
        // 已授权
        const expiresAt = status.tokenExpiresAt;
        const expiresText = expiresAt ? `，有效期至 ${new Date(expiresAt).toLocaleString()}` : '';
        statusEl.innerHTML = `<span style="color: #27ae60;">✅ 已授权${expiresText}</span>`;
        authBtn.style.display = 'none';
        if (revokeBtn)
            revokeBtn.style.display = 'inline-block';
    }
    else {
        // 无需 OAuth（可能是旧版 API Key）
        statusEl.innerHTML = '<span style="color: #27ae60;">✅ 已配置</span>';
        authBtn.style.display = 'none';
        if (revokeBtn)
            revokeBtn.style.display = 'none';
    }
}
/**
 * 发起 OAuth 授权
 */
function startHDHiveOAuth() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            // 获取系统基础 URL
            const settingsResponse = yield fetch('/api/settings');
            const settingsData = yield settingsResponse.json();
            const baseUrl = ((_b = (_a = settingsData.data) === null || _a === void 0 ? void 0 : _a.system) === null || _b === void 0 ? void 0 : _b.baseUrl) || '';
            if (!baseUrl) {
                message.error('请先在系统设置中配置基础 URL（系统对外访问地址）');
                return;
            }
            const redirectUri = `${baseUrl}/api/hdhive/oauth/callback`;
            // 获取授权 URL
            const response = yield fetch(`/api/hdhive/oauth/url?redirect_uri=${encodeURIComponent(redirectUri)}`);
            const data = yield response.json();
            if (data.success && ((_c = data.data) === null || _c === void 0 ? void 0 : _c.url)) {
                // 打开授权窗口
                const width = 600;
                const height = 700;
                const left = (window.innerWidth - width) / 2;
                const top = (window.innerHeight - height) / 2;
                const authWindow = window.open(data.data.url, 'hdhive_oauth', `width=${width},height=${height},left=${left},top=${top}`);
                // 监听授权成功消息
                window.addEventListener('message', function handler(e) {
                    var _a;
                    if (((_a = e.data) === null || _a === void 0 ? void 0 : _a.type) === 'hdhive_oauth_success') {
                        window.removeEventListener('message', handler);
                        message.success('授权成功');
                        checkHDHiveAuthStatus();
                        loadHDHiveQuota();
                    }
                });
                // 轮询检查窗口是否关闭
                const checkClosed = setInterval(() => {
                    if (authWindow === null || authWindow === void 0 ? void 0 : authWindow.closed) {
                        clearInterval(checkClosed);
                        // 刷新授权状态
                        checkHDHiveAuthStatus();
                    }
                }, 1000);
            }
            else {
                message.error(data.error || '获取授权链接失败');
            }
        }
        catch (error) {
            console.error('发起 OAuth 授权失败:', error);
            message.error('发起授权失败: ' + error.message);
        }
    });
}
/**
 * 撤销授权
 */
function revokeHDHiveAuth() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!confirm('确定要撤销影巢授权吗？撤销后需要重新授权才能使用资源查询和解锁功能。')) {
            return;
        }
        try {
            const response = yield fetch('/api/hdhive/oauth/revoke', { method: 'POST' });
            const data = yield response.json();
            if (data.success) {
                message.success('授权已撤销');
                checkHDHiveAuthStatus();
            }
            else {
                message.error(data.error || '撤销失败');
            }
        }
        catch (error) {
            console.error('撤销授权失败:', error);
            message.error('撤销失败: ' + error.message);
        }
    });
}
/**
 * 重置影巢状态
 */
function resetHDHiveState() {
    hdhiveState.currentMedia = null;
    hdhiveState.currentType = null;
    hdhiveState.currentTmdbId = null;
    hdhiveState.resources = [];
    hdhiveState.selectedResource = null;
    hdhiveState.unlockedData = null;
    // 重置 UI
    document.getElementById('hdhiveSearchInput').value = '';
    document.getElementById('hdhiveTmdbResults').style.display = 'none';
    document.getElementById('hdhiveResourceSection').style.display = 'none';
    document.getElementById('hdhiveEmpty').style.display = 'flex';
    document.getElementById('hdhiveResultsGrid').innerHTML = '';
}
/**
 * 加载影巢积分
 */
function loadHDHiveQuota() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const response = yield fetch('/api/hdhive/quota');
            const data = yield response.json();
            const quotaEl = document.getElementById('hdhiveQuota');
            const pointsEl = document.getElementById('hdhivePoints');
            if (data.success && data.data) {
                quotaEl.style.display = 'flex';
                pointsEl.textContent = (_a = data.data.points) !== null && _a !== void 0 ? _a : '--';
            }
            else {
                quotaEl.style.display = 'none';
            }
        }
        catch (error) {
            console.error('加载积分失败:', error);
            document.getElementById('hdhiveQuota').style.display = 'none';
        }
    });
}
/**
 * 搜索 TMDB 影视
 */
function searchHDHiveTMDB() {
    return __awaiter(this, void 0, void 0, function* () {
        const keyword = document.getElementById('hdhiveSearchInput').value.trim();
        if (!keyword) {
            message.warning('请输入搜索关键词');
            return;
        }
        // 显示加载状态
        document.getElementById('hdhiveEmpty').style.display = 'none';
        document.getElementById('hdhiveResourceSection').style.display = 'none';
        document.getElementById('hdhiveTmdbResults').style.display = 'block';
        const grid = document.getElementById('hdhiveResultsGrid');
        grid.innerHTML = '<div class="hdhive-loading"><div class="spinner"></div><span>搜索中...</span></div>';
        try {
            // 调用本地 TMDB 搜索接口
            const response = yield fetch(`/api/tmdb/search?query=${encodeURIComponent(keyword)}`);
            const data = yield response.json();
            if (data.success && data.data && data.data.length > 0) {
                renderTMDBResults(data.data);
            }
            else {
                grid.innerHTML = `
                <div class="hdhive-empty" style="grid-column: 1 / -1;">
                    <div class="hdhive-empty-icon">🔍</div>
                    <p>未找到相关影视</p>
                    <small>尝试使用其他关键词搜索</small>
                </div>
            `;
            }
        }
        catch (error) {
            console.error('TMDB 搜索失败:', error);
            grid.innerHTML = `
            <div class="hdhive-empty" style="grid-column: 1 / -1;">
                <div class="hdhive-empty-icon">❌</div>
                <p>搜索失败</p>
                <small>${error.message}</small>
            </div>
        `;
        }
    });
}
/**
 * 渲染 TMDB 搜索结果
 */
function renderTMDBResults(results) {
    const grid = document.getElementById('hdhiveResultsGrid');
    grid.innerHTML = '';
    results.forEach(item => {
        var _a, _b;
        const card = document.createElement('div');
        card.className = 'hdhive-media-card';
        card.onclick = () => selectHDHiveMedia(item);
        const posterUrl = item.poster_path
            ? `https://image.tmdb.org/t/p/w300${item.poster_path}`
            : '/icons/no-poster.svg';
        const year = ((_a = item.release_date) === null || _a === void 0 ? void 0 : _a.split('-')[0]) || ((_b = item.first_air_date) === null || _b === void 0 ? void 0 : _b.split('-')[0]) || '--';
        const type = item.media_type || (item.first_air_date ? 'tv' : 'movie');
        const title = item.title || item.name;
        card.innerHTML = `
            <img src="${posterUrl}" alt="${title}" loading="lazy" onerror="this.src='/icons/no-poster.svg'">
            <div class="hdhive-media-card-info">
                <div class="hdhive-media-card-title" title="${title}">${title}</div>
                <div class="hdhive-media-card-meta">
                    <span class="hdhive-media-card-year">${year}</span>
                    <span class="hdhive-media-card-type ${type}">${type === 'movie' ? '电影' : '剧集'}</span>
                    ${item.vote_average ? `
                        <span class="hdhive-media-card-rating">
                            <span>⭐</span>
                            <span>${item.vote_average.toFixed(1)}</span>
                        </span>
                    ` : ''}
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}
/**
 * 选择影视，加载资源列表
 */
function selectHDHiveMedia(media) {
    return __awaiter(this, void 0, void 0, function* () {
        hdhiveState.currentMedia = media;
        hdhiveState.currentType = media.media_type || (media.first_air_date ? 'tv' : 'movie');
        hdhiveState.currentTmdbId = media.id;
        // 切换到资源详情视图
        document.getElementById('hdhiveTmdbResults').style.display = 'none';
        document.getElementById('hdhiveResourceSection').style.display = 'block';
        // 渲染影视信息
        renderMediaInfo(media);
        // 加载资源列表
        yield loadHDHiveResources();
    });
}
/**
 * 渲染选中的影视信息
 */
function renderMediaInfo(media) {
    var _a, _b;
    const posterUrl = media.poster_path
        ? `https://image.tmdb.org/t/p/w200${media.poster_path}`
        : '/icons/no-poster.svg';
    document.getElementById('hdhivePoster').src = posterUrl;
    document.getElementById('hdhiveMediaTitle').textContent = media.title || media.name;
    const year = ((_a = media.release_date) === null || _a === void 0 ? void 0 : _a.split('-')[0]) || ((_b = media.first_air_date) === null || _b === void 0 ? void 0 : _b.split('-')[0]) || '';
    document.getElementById('hdhiveMediaYear').textContent = year ? `${year}年` : '';
    const overview = media.overview || '暂无简介';
    document.getElementById('hdhiveMediaOverview').textContent =
        overview.length > 100 ? overview.substring(0, 100) + '...' : overview;
}
/**
 * 加载影巢资源列表
 */
function loadHDHiveResources() {
    return __awaiter(this, void 0, void 0, function* () {
        const listEl = document.getElementById('hdhiveResourceList');
        listEl.innerHTML = '<div class="hdhive-loading"><div class="spinner"></div><span>加载资源中...</span></div>';
        try {
            const response = yield fetch(`/api/hdhive/resources?type=${hdhiveState.currentType}&tmdbId=${hdhiveState.currentTmdbId}`);
            const data = yield response.json();
            // 检查是否需要 OAuth 授权
            if (data.needsOAuth) {
                listEl.innerHTML = `
                <div class="hdhive-empty">
                    <div class="hdhive-empty-icon">🔐</div>
                    <p>需要 OAuth 授权</p>
                    <small>${data.error || '请先进行 OAuth 授权'}</small>
                    <button class="hdhive-auth-btn" onclick="startHDHiveOAuth()" style="margin-top: 16px; padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        前往授权
                    </button>
                </div>
            `;
                return;
            }
            if (data.success && data.data) {
                // 只过滤天翼云盘资源
                hdhiveState.resources = data.data.filter(r => r.cloudType === 'cloud189');
                renderResourceList();
            }
            else {
                listEl.innerHTML = `
                <div class="hdhive-empty">
                    <div class="hdhive-empty-icon">📭</div>
                    <p>暂无天翼云盘资源</p>
                    <small>${data.error || '该影视暂无天翼云盘资源'}</small>
                </div>
            `;
            }
        }
        catch (error) {
            console.error('加载资源失败:', error);
            listEl.innerHTML = `
            <div class="hdhive-empty">
                <div class="hdhive-empty-icon">❌</div>
                <p>加载失败</p>
                <small>${error.message}</small>
            </div>
        `;
        }
    });
}
/**
 * 渲染资源列表
 */
function renderResourceList() {
    const listEl = document.getElementById('hdhiveResourceList');
    const resources = hdhiveState.resources;
    if (resources.length === 0) {
        listEl.innerHTML = `
            <div class="hdhive-empty">
                <div class="hdhive-empty-icon">📭</div>
                <p>暂无天翼云盘资源</p>
                <small>该影视暂无天翼云盘资源</small>
            </div>
        `;
        return;
    }
    listEl.innerHTML = resources.map(resource => createResourceItemHTML(resource)).join('');
}
/**
 * 生成资源项 HTML
 */
function createResourceItemHTML(resource) {
    var _a;
    const expiredClass = resource.expired ? 'expired' : '';
    const pointsTag = resource.isFree
        ? '<span class="hdhive-tag free">免费</span>'
        : `<span class="hdhive-tag points">${resource.points} 积分</span>`;
    const expiredTag = resource.expired
        ? '<span class="hdhive-tag expired">疑似失效</span>'
        : '';
    const qualityTags = (resource.quality || [])
        .slice(0, 3)
        .map(q => `<span class="hdhive-tag quality">${q}</span>`)
        .join('');
    const unlockBtnDisabled = resource.expired ? 'disabled' : '';
    const unlockBtnText = resource.expired ? '已失效' : (resource.isFree ? '免费解锁' : '解锁');
    return `
        <div class="hdhive-resource-item ${expiredClass}" onclick="showUnlockConfirm('${resource.slug || resource.id}')">
            <div class="hdhive-resource-icon" data-cloud="cloud189">
                天翼
            </div>
            <div class="hdhive-resource-content">
                <div class="hdhive-resource-title" title="${resource.title}">${resource.title}</div>
                <div class="hdhive-resource-meta">
                    <span>📦 ${resource.sizeFormatted}</span>
                    ${((_a = resource.uploader) === null || _a === void 0 ? void 0 : _a.username) ? `<span>👤 ${resource.uploader.username}</span>` : ''}
                </div>
                <div class="hdhive-resource-tags">
                    ${pointsTag}
                    ${expiredTag}
                    ${qualityTags}
                </div>
            </div>
            <div class="hdhive-resource-actions">
                <button class="hdhive-unlock-btn" ${unlockBtnDisabled} onclick="event.stopPropagation(); showUnlockConfirm('${resource.slug || resource.id}')">
                    ${unlockBtnText}
                </button>
            </div>
        </div>
    `;
}
/**
 * 返回 TMDB 搜索结果
 */
function backToTMDBResults() {
    document.getElementById('hdhiveResourceSection').style.display = 'none';
    document.getElementById('hdhiveTmdbResults').style.display = 'block';
}
/**
 * 显示解锁确认弹窗
 */
function showUnlockConfirm(resourceSlug) {
    const resource = hdhiveState.resources.find(r => (r.slug || r.id) === resourceSlug);
    if (!resource)
        return;
    if (resource.expired) {
        message.warning('该资源已失效，无法解锁');
        return;
    }
    hdhiveState.selectedResource = resource;
    // 设置弹窗内容
    document.getElementById('hdhiveUnlockTitle').textContent = resource.title;
    const warningEl = document.getElementById('hdhiveUnlockWarning');
    const pointsEl = document.getElementById('hdhiveUnlockPoints');
    if (resource.isFree) {
        warningEl.style.display = 'none';
    }
    else {
        warningEl.style.display = 'flex';
        pointsEl.textContent = resource.points;
    }
    // 显示弹窗
    document.getElementById('hdhiveUnlockModal').style.display = 'flex';
}
/**
 * 关闭解锁确认弹窗
 */
function closeHDHiveUnlockModal() {
    document.getElementById('hdhiveUnlockModal').style.display = 'none';
}
/**
 * 确认解锁
 */
function confirmUnlock() {
    return __awaiter(this, void 0, void 0, function* () {
        const resource = hdhiveState.selectedResource;
        if (!resource)
            return;
        const confirmBtn = document.getElementById('hdhiveUnlockConfirmBtn');
        confirmBtn.disabled = true;
        confirmBtn.textContent = '解锁中...';
        try {
            const response = yield fetch('/api/hdhive/unlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug: resource.slug || resource.id })
            });
            const data = yield response.json();
            // 检查是否需要 OAuth 授权
            if (data.needsOAuth) {
                closeHDHiveUnlockModal();
                message.warning(data.error || '需要 OAuth 授权');
                startHDHiveOAuth();
                return;
            }
            if (data.success && data.data) {
                hdhiveState.unlockedData = data.data;
                // 关闭确认弹窗，显示成功弹窗
                closeHDHiveUnlockModal();
                showUnlockSuccess(data.data);
                // 刷新积分
                loadHDHiveQuota();
            }
            else {
                message.error(data.error || '解锁失败');
            }
        }
        catch (error) {
            console.error('解锁失败:', error);
            message.error('解锁失败: ' + error.message);
        }
        finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = '确认解锁';
        }
    });
}
/**
 * 显示解锁成功弹窗
 */
function showUnlockSuccess(data) {
    document.getElementById('hdhiveUnlockedLink').value = data.link || data.fullUrl || '';
    const codeBox = document.getElementById('hdhiveCodeBox');
    const codeInput = document.getElementById('hdhiveUnlockedCode');
    if (data.code) {
        codeBox.style.display = 'flex';
        codeInput.value = data.code;
    }
    else {
        codeBox.style.display = 'none';
    }
    document.getElementById('hdhiveSuccessModal').style.display = 'flex';
}
/**
 * 关闭解锁成功弹窗
 */
function closeHDHiveSuccessModal() {
    document.getElementById('hdhiveSuccessModal').style.display = 'none';
}
/**
 * 复制链接
 */
function copyHDHiveLink() {
    const link = document.getElementById('hdhiveUnlockedLink').value;
    navigator.clipboard.writeText(link).then(() => {
        message.success('链接已复制');
    }).catch(() => {
        message.error('复制失败');
    });
}
/**
 * 复制提取码
 */
function copyHDHiveCode() {
    const code = document.getElementById('hdhiveUnlockedCode').value;
    navigator.clipboard.writeText(code).then(() => {
        message.success('提取码已复制');
    }).catch(() => {
        message.error('复制失败');
    });
}
/**
 * 一键创建转存任务
 */
function createTaskFromHDHive() {
    const data = hdhiveState.unlockedData;
    if (!data || !(data.link || data.fullUrl)) {
        message.error('无法获取解锁链接');
        return;
    }
    // 关闭所有影巢相关弹窗
    closeHDHiveSuccessModal();
    closeHDHiveModal();
    // 打开新建任务弹窗并填充链接
    openCreateTaskModal();
    // 填充链接和提取码
    setTimeout(() => {
        const linkInput = document.getElementById('taskLink');
        if (linkInput) {
            linkInput.value = data.link || data.fullUrl;
            // 触发解析
            if (typeof parseTaskLink === 'function') {
                parseTaskLink();
            }
        }
        // 如果有提取码，填充提取码
        if (data.code) {
            const codeInput = document.getElementById('taskCode');
            if (codeInput) {
                codeInput.value = data.code;
            }
        }
    }, 300);
}
// 页面加载初始化
document.addEventListener('DOMContentLoaded', () => {
    // 初始化影巢功能（根据配置显示/隐藏入口）
    initHDHiveFeature();
    // 回车搜索
    const searchInput = document.getElementById('hdhiveSearchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchHDHiveTMDB();
            }
        });
    }
});
