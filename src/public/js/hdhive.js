/**
 * 影巢 (HDHive) 资源搜索前端逻辑
 */

// 状态管理
let hdhiveState = {
    currentMedia: null,      // 当前选中的影视信息
    currentType: null,       // 当前影视类型 (movie/tv)
    currentTmdbId: null,     // 当前 TMDB ID
    resources: [],           // 当前资源列表
    selectedResource: null,  // 选中的资源（用于解锁）
    unlockedData: null,      // 解锁后的数据
    config: null             // 影巢配置
};

/**
 * 初始化影巢功能（页面加载时调用）
 * 根据配置显示/隐藏影巢入口按钮
 */
async function initHDHiveFeature() {
    try {
        const response = await fetch('/api/settings');
        const data = await response.json();

        if (data.success && data.data?.hdhive) {
            hdhiveState.config = data.data.hdhive;
            const hdhiveBtn = document.querySelector('.hdhive-btn');

            // 只有启用影巢功能时才显示入口按钮
            if (hdhiveState.config.enabled) {
                if (hdhiveBtn) hdhiveBtn.style.display = 'flex';
            } else {
                if (hdhiveBtn) hdhiveBtn.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('初始化影巢功能失败:', error);
        const hdhiveBtn = document.querySelector('.hdhive-btn');
        if (hdhiveBtn) hdhiveBtn.style.display = 'none';
    }
}

/**
 * 打开影巢搜索模态框
 */
async function openHDHiveModal() {
    // 检查是否配置了 API Key
    if (!hdhiveState.config?.apiKey) {
        message.warning('请先在系统设置中配置影巢 API Key');
        return;
    }

    const modal = document.getElementById('hdhiveModal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // 加载积分信息
    loadHDHiveQuota();

    // 重置状态
    resetHDHiveState();
}

/**
 * 关闭影巢搜索模态框
 */
function closeHDHiveModal() {
    const modal = document.getElementById('hdhiveModal');
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

/**
 * 重置影巢状态
 */
function resetHDHiveState() {
    hdhiveState = {
        currentMedia: null,
        currentType: null,
        currentTmdbId: null,
        resources: [],
        currentCloudFilter: 'all',
        selectedResource: null,
        unlockedData: null
    };

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
async function loadHDHiveQuota() {
    try {
        const response = await fetch('/api/hdhive/quota');
        const data = await response.json();

        const quotaEl = document.getElementById('hdhiveQuota');
        const pointsEl = document.getElementById('hdhivePoints');

        if (data.success && data.data) {
            quotaEl.style.display = 'flex';
            pointsEl.textContent = data.data.points ?? '--';
        } else {
            quotaEl.style.display = 'none';
        }
    } catch (error) {
        console.error('加载积分失败:', error);
        document.getElementById('hdhiveQuota').style.display = 'none';
    }
}

/**
 * 搜索 TMDB 影视
 */
async function searchHDHiveTMDB() {
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
        const response = await fetch(`/api/tmdb/search?query=${encodeURIComponent(keyword)}`);
        const data = await response.json();

        if (data.success && data.data && data.data.length > 0) {
            renderTMDBResults(data.data);
        } else {
            grid.innerHTML = `
                <div class="hdhive-empty" style="grid-column: 1 / -1;">
                    <div class="hdhive-empty-icon">🔍</div>
                    <p>未找到相关影视</p>
                    <small>尝试使用其他关键词搜索</small>
                </div>
            `;
        }
    } catch (error) {
        console.error('TMDB 搜索失败:', error);
        grid.innerHTML = `
            <div class="hdhive-empty" style="grid-column: 1 / -1;">
                <div class="hdhive-empty-icon">❌</div>
                <p>搜索失败</p>
                <small>${error.message}</small>
            </div>
        `;
    }
}

/**
 * 渲染 TMDB 搜索结果
 */
function renderTMDBResults(results) {
    const grid = document.getElementById('hdhiveResultsGrid');
    grid.innerHTML = '';

    results.forEach(item => {
        const card = document.createElement('div');
        card.className = 'hdhive-media-card';
        card.onclick = () => selectHDHiveMedia(item);

        const posterUrl = item.poster_path
            ? `https://image.tmdb.org/t/p/w300${item.poster_path}`
            : '/icons/no-poster.svg';

        const year = item.release_date?.split('-')[0] || item.first_air_date?.split('-')[0] || '--';
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
async function selectHDHiveMedia(media) {
    hdhiveState.currentMedia = media;
    hdhiveState.currentType = media.media_type || (media.first_air_date ? 'tv' : 'movie');
    hdhiveState.currentTmdbId = media.id;

    // 切换到资源详情视图
    document.getElementById('hdhiveTmdbResults').style.display = 'none';
    document.getElementById('hdhiveResourceSection').style.display = 'block';

    // 渲染影视信息
    renderMediaInfo(media);

    // 加载资源列表
    await loadHDHiveResources();
}

/**
 * 渲染选中的影视信息
 */
function renderMediaInfo(media) {
    const posterUrl = media.poster_path
        ? `https://image.tmdb.org/t/p/w200${media.poster_path}`
        : '/icons/no-poster.svg';

    document.getElementById('hdhivePoster').src = posterUrl;
    document.getElementById('hdhiveMediaTitle').textContent = media.title || media.name;

    const year = media.release_date?.split('-')[0] || media.first_air_date?.split('-')[0] || '';
    document.getElementById('hdhiveMediaYear').textContent = year ? `${year}年` : '';

    const overview = media.overview || '暂无简介';
    document.getElementById('hdhiveMediaOverview').textContent =
        overview.length > 100 ? overview.substring(0, 100) + '...' : overview;
}

/**
 * 加载影巢资源列表
 */
async function loadHDHiveResources() {
    const listEl = document.getElementById('hdhiveResourceList');
    listEl.innerHTML = '<div class="hdhive-loading"><div class="spinner"></div><span>加载资源中...</span></div>';

    try {
        const response = await fetch(
            `/api/hdhive/resources?type=${hdhiveState.currentType}&tmdbId=${hdhiveState.currentTmdbId}`
        );
        const data = await response.json();

        if (data.success && data.data) {
            // 只过滤天翼云盘资源
            hdhiveState.resources = data.data.filter(r => r.cloudType === 'cloud189');
            renderResourceList();
        } else {
            listEl.innerHTML = `
                <div class="hdhive-empty">
                    <div class="hdhive-empty-icon">📭</div>
                    <p>暂无天翼云盘资源</p>
                    <small>${data.error || '该影视暂无天翼云盘资源'}</small>
                </div>
            `;
        }
    } catch (error) {
        console.error('加载资源失败:', error);
        listEl.innerHTML = `
            <div class="hdhive-empty">
                <div class="hdhive-empty-icon">❌</div>
                <p>加载失败</p>
                <small>${error.message}</small>
            </div>
        `;
    }
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
        <div class="hdhive-resource-item ${expiredClass}" onclick="showUnlockConfirm('${resource.id}')">
            <div class="hdhive-resource-icon" data-cloud="cloud189">
                天翼
            </div>
            <div class="hdhive-resource-content">
                <div class="hdhive-resource-title" title="${resource.title}">${resource.title}</div>
                <div class="hdhive-resource-meta">
                    <span>📦 ${resource.sizeFormatted}</span>
                    ${resource.uploader?.name ? `<span>👤 ${resource.uploader.name}</span>` : ''}
                </div>
                <div class="hdhive-resource-tags">
                    ${pointsTag}
                    ${expiredTag}
                    ${qualityTags}
                </div>
            </div>
            <div class="hdhive-resource-actions">
                <button class="hdhive-unlock-btn" ${unlockBtnDisabled} onclick="event.stopPropagation(); showUnlockConfirm('${resource.id}')">
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
function showUnlockConfirm(resourceId) {
    const resource = hdhiveState.resources.find(r => r.id === resourceId);
    if (!resource) return;

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
    } else {
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
async function confirmUnlock() {
    const resource = hdhiveState.selectedResource;
    if (!resource) return;

    const confirmBtn = document.getElementById('hdhiveUnlockConfirmBtn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = '解锁中...';

    try {
        const response = await fetch('/api/hdhive/unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resourceId: resource.id })
        });

        const data = await response.json();

        if (data.success && data.data) {
            hdhiveState.unlockedData = data.data;

            // 关闭确认弹窗，显示成功弹窗
            closeHDHiveUnlockModal();
            showUnlockSuccess(data.data);

            // 刷新积分
            loadHDHiveQuota();
        } else {
            message.error(data.error || '解锁失败');
        }
    } catch (error) {
        console.error('解锁失败:', error);
        message.error('解锁失败: ' + error.message);
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = '确认解锁';
    }
}

/**
 * 显示解锁成功弹窗
 */
function showUnlockSuccess(data) {
    document.getElementById('hdhiveUnlockedLink').value = data.link;

    const codeBox = document.getElementById('hdhiveCodeBox');
    const codeInput = document.getElementById('hdhiveUnlockedCode');

    if (data.code) {
        codeBox.style.display = 'flex';
        codeInput.value = data.code;
    } else {
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
    if (!data || !data.link) {
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
            linkInput.value = data.link;
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
