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
// 添加全局筛选参数
let taskFilterParams = {
    status: 'all',
    search: '',
    page: 1,
    pageSize: 100
};
let taskTotal = 0;
const taskTmdbCache = new Map();
const taskTmdbPending = new Set();
const tmdbEnrichQueue = [];
let tmdbEnrichActive = 0;
const TMDB_ENRICH_CONCURRENCY = 5;
let mediaWallTasksSnapshot = [];
let mediaWallRefreshTimer = null;
// TMDB缓存存储键名
const TMDB_CACHE_KEY = 'taskTmdbCache_v1';
// 从localStorage加载TMDB缓存（无过期机制，除非手动删除任务）
function loadTmdbCacheFromStorage() {
    try {
        const stored = localStorage.getItem(TMDB_CACHE_KEY);
        if (stored) {
            const data = JSON.parse(stored);
            Object.entries(data).forEach(([taskId, entry]) => {
                taskTmdbCache.set(parseInt(taskId), entry.data);
            });
        }
    }
    catch (e) {
        console.warn('加载TMDB缓存失败:', e);
    }
}
// 保存TMDB缓存到localStorage
function saveTmdbCacheToStorage() {
    try {
        const data = {};
        taskTmdbCache.forEach((value, key) => {
            data[key] = { data: value };
        });
        localStorage.setItem(TMDB_CACHE_KEY, JSON.stringify(data));
    }
    catch (e) {
        console.warn('保存TMDB缓存失败:', e);
    }
}
// 删除单个任务的TMDB缓存
function removeTmdbCache(taskId) {
    taskTmdbCache.delete(taskId);
    saveTmdbCacheToStorage();
}
// 页面加载时初始化缓存
loadTmdbCacheFromStorage();
// 任务相关功能
function createProgressRing(current, total) {
    if (!total)
        return '';
    const radius = 12;
    const circumference = 2 * Math.PI * radius;
    const progress = (current / total) * 100;
    const offset = circumference - (progress / 100) * circumference;
    const percentage = Math.round((current / total) * 100);
    return `
        <div class="progress-ring">
            <svg width="30" height="30">
                <circle
                    stroke="#e8f5e9"
                    stroke-width="3"
                    fill="transparent"
                    r="${radius}"
                    cx="15"
                    cy="15"
                />
                <circle
                    stroke="#52c41a"
                    stroke-width="3"
                    fill="transparent"
                    r="${radius}"
                    cx="15"
                    cy="15"
                    style="stroke-dasharray: ${circumference} ${circumference}; stroke-dashoffset: ${offset}"
                />
            </svg>
            <span class="progress-ring__text">${percentage}%</span>
        </div>
    `;
}
function formatLatestSavedFile(task) {
    return task.lastSavedDisplayText || task.lastSavedFileName || '暂无转存记录';
}
function formatMissingEpisodes(task) {
    if (!task.missingEpisodes) {
        return '';
    }
    try {
        const missingEpisodes = JSON.parse(task.missingEpisodes);
        if (!missingEpisodes.length) {
            return '';
        }
        return `缺失 ${missingEpisodes.length} 集`;
    }
    catch (error) {
        return '';
    }
}
function formatMissingEpisodesTitle(task) {
    if (!task.missingEpisodes) {
        return '';
    }
    try {
        const missingEpisodes = JSON.parse(task.missingEpisodes);
        return missingEpisodes.join(', ');
    }
    catch (error) {
        return '';
    }
}
function getProgressTooltip(task) {
    if (!task.missingEpisodes) {
        return '进度正常 ✓';
    }
    try {
        const missingEpisodes = JSON.parse(task.missingEpisodes);
        if (!missingEpisodes.length) {
            return '进度正常 ✓';
        }
        return `缺失剧集：${missingEpisodes.join(', ')}`;
    }
    catch (error) {
        return '进度正常 ✓';
    }
}
function parseTmdbContent(task) {
    if (!task.tmdbContent) {
        return null;
    }
    try {
        return JSON.parse(task.tmdbContent);
    }
    catch (error) {
        return null;
    }
}
function deriveMediaQuery(task) {
    const candidates = [task.tmdbTitle, task.resourceName, task.lastSavedFileName, task.lastSavedDisplayText]
        .filter(Boolean)
        .map(value => String(value));
    for (const item of candidates) {
        let query = item
            .replace(/\.[a-z0-9]{2,4}$/i, ' ')
            .replace(/S\d{1,2}E\d{1,3}/gi, ' ')
            .replace(/第\s*\d{1,4}\s*[集话]/g, ' ')
            .replace(/\b(EP|E)\s*\d{1,4}\b/gi, ' ')
            .replace(/[\[\]()【】（）{}]/g, ' ')
            .replace(/[._-]+/g, ' ')
            .replace(/\b(19|20)\d{2}\b/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (query.length >= 2) {
            return query.split(' ').slice(0, 6).join(' ');
        }
    }
    return '';
}
function scheduleMediaWallRefresh() {
    if (mediaWallRefreshTimer) {
        clearTimeout(mediaWallRefreshTimer);
    }
    mediaWallRefreshTimer = setTimeout(() => {
        const currentUiStyle = document.documentElement.getAttribute('data-ui-style') || 'classic';
        if (currentUiStyle === 'media') {
            renderTaskMediaWall(mediaWallTasksSnapshot);
        }
    }, 180);
}
// TMDB富化并发控制：同一时间最多 TMDB_ENRICH_CONCURRENCY 个请求
function enqueueTmdbEnrich(task) {
    if (parseTmdbContent(task))
        return;
    if (taskTmdbCache.has(task.id)) {
        task.tmdbContent = JSON.stringify(taskTmdbCache.get(task.id));
        return;
    }
    if (taskTmdbPending.has(task.id))
        return;
    taskTmdbPending.add(task.id);
    tmdbEnrichQueue.push(task);
    processTmdbEnrichQueue();
}
function processTmdbEnrichQueue() {
    return __awaiter(this, void 0, void 0, function* () {
        while (tmdbEnrichQueue.length > 0 && tmdbEnrichActive < TMDB_ENRICH_CONCURRENCY) {
            const task = tmdbEnrichQueue.shift();
            tmdbEnrichActive++;
            _doEnrichTaskTmdb(task).finally(() => {
                tmdbEnrichActive--;
                processTmdbEnrichQueue();
            });
        }
    });
}
function _doEnrichTaskTmdb(task) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let detail = null;
            if (task.tmdbId && task.videoType) {
                const detailResponse = yield fetch(`/api/tmdb/detail?id=${encodeURIComponent(task.tmdbId)}&type=${encodeURIComponent(task.videoType)}`);
                const detailData = yield detailResponse.json();
                if (detailData.success && detailData.data) {
                    detail = detailData.data;
                }
            }
            if (!detail) {
                const query = deriveMediaQuery(task);
                if (query) {
                    const searchType = task.videoType === 'movie' ? 'movie' : 'tv';
                    const searchResponse = yield fetch(`/api/tmdb/search?query=${encodeURIComponent(query)}&type=${encodeURIComponent(searchType)}`);
                    const searchData = yield searchResponse.json();
                    const firstMatch = (searchData === null || searchData === void 0 ? void 0 : searchData.success) && Array.isArray(searchData.data) ? searchData.data[0] : null;
                    if (firstMatch === null || firstMatch === void 0 ? void 0 : firstMatch.id) {
                        const detailType = searchType;
                        const detailResponse = yield fetch(`/api/tmdb/detail?id=${encodeURIComponent(firstMatch.id)}&type=${encodeURIComponent(detailType)}`);
                        const detailData = yield detailResponse.json();
                        if (detailData.success && detailData.data) {
                            detail = detailData.data;
                        }
                    }
                }
            }
            if (detail) {
                taskTmdbCache.set(task.id, detail);
                task.tmdbContent = JSON.stringify(detail);
                saveTmdbCacheToStorage();
                scheduleMediaWallRefresh();
                // 回写到数据库，持久化缓存
                try {
                    yield fetch(`/api/tasks/${task.id}/tmdb-content`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tmdbContent: detail })
                    });
                }
                catch (e) {
                    // 回写失败不影响主流程
                    console.warn(`任务 ${task.id} TMDB 回写数据库失败:`, e.message);
                }
            }
        }
        catch (error) {
            console.warn(`加载任务 ${task.id} 海报信息失败:`, error.message);
        }
        finally {
            taskTmdbPending.delete(task.id);
        }
    });
}
function getTaskPoster(task) {
    const tmdbContent = parseTmdbContent(task);
    return (tmdbContent === null || tmdbContent === void 0 ? void 0 : tmdbContent.posterPath) || (tmdbContent === null || tmdbContent === void 0 ? void 0 : tmdbContent.backdropPath) || '';
}
function getTaskOverview(task) {
    const tmdbContent = parseTmdbContent(task);
    let overview = '';
    if (tmdbContent === null || tmdbContent === void 0 ? void 0 : tmdbContent.overview) {
        overview = tmdbContent.overview;
    }
    else if (task.remark) {
        overview = task.remark;
    }
    else {
        return '暂无简介';
    }
    // 截断简介，避免遮挡卡片功能区（最多80个字符）
    const MAX_LENGTH = 80;
    if (overview.length > MAX_LENGTH) {
        return overview.slice(0, MAX_LENGTH) + '...';
    }
    return overview;
}
function getTaskMetaLine(task) {
    const tmdbContent = parseTmdbContent(task);
    const metaParts = [];
    if (task.videoType === 'movie') {
        metaParts.push('电影');
    }
    else if (task.videoType) {
        metaParts.push('剧集');
    }
    if (tmdbContent === null || tmdbContent === void 0 ? void 0 : tmdbContent.releaseDate) {
        metaParts.push(String(tmdbContent.releaseDate).slice(0, 4));
    }
    if (tmdbContent === null || tmdbContent === void 0 ? void 0 : tmdbContent.voteAverage) {
        metaParts.push(`TMDB ${Number(tmdbContent.voteAverage).toFixed(1)}`);
    }
    return metaParts.join(' · ');
}
function renderTaskMediaWall(tasks) {
    mediaWallTasksSnapshot = tasks;
    const tbody = document.querySelector('#taskTable tbody');
    tbody.innerHTML = '';
    // 检查当前主题
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const isCinemaMode = currentTheme === 'cinema';
    tasks.forEach(task => {
        var _a;
        enqueueTmdbEnrich(task);
        taskList.push(task);
        const taskName = task.shareFolderName ? (task.resourceName + '/' + task.shareFolderName) : task.resourceName || '未知';
        const poster = getTaskPoster(task);
        const overview = getTaskOverview(task);
        const latestSaved = formatLatestSavedFile(task);
        const metaLine = getTaskMetaLine(task);
        const tmdbContent = parseTmdbContent(task);
        let tmdbUrl = '';
        if (tmdbContent && tmdbContent.id) {
            const type = task.videoType === 'movie' ? 'movie' : 'tv';
            tmdbUrl = `https://www.themoviedb.org/${type}/${tmdbContent.id}`;
        }
        if (isCinemaMode) {
            // 影院模式：使用垂直卡片布局（背景图在tr上）
            tbody.innerHTML += `
                <tr class="media-wall-card" data-status='${task.status}' data-task-id='${task.id}' data-name='${taskName}' style="background-image: url('${poster || ''}')">
                    <td class="media-wall-info-cell" style="display: contents;">
                        <div class="media-card-top">
                            ${renderStatusCapsule(task)}
                        </div>

                        <div class="media-card-hover-overview" onclick="if(window.innerWidth > 768 && !('ontouchstart' in window)) event.stopPropagation();">
                            ${overview}
                        </div>

                        <div class="media-card-bottom">
                            <div class="media-wall-title" title="${taskName}" onclick="event.stopPropagation(); window.open('${task.shareLink}', '_blank');" style="cursor: pointer;">${taskName}</div>
                            <div class="media-wall-meta" ${tmdbUrl ? `onclick="event.stopPropagation(); window.open('${tmdbUrl}', '_blank');" style="cursor: pointer;" title="查看TMDB详情"` : ''}>
                                <i class="ph-fill ph-star" style="color: #fbbf24"></i>
                                ${metaLine || '暂无信息'}
                                ${tmdbUrl ? '<span style="margin-left: 8px; padding: 2px 6px; background: rgba(99, 102, 241, 0.2); border-radius: 4px; font-size: 11px; font-weight: 600;">TMDB</span>' : ''}
                            </div>

                            <div class="media-progress-container" onclick="event.stopPropagation(); showFileListModal('${task.id}');" style="cursor: pointer;" title="${getProgressTooltip(task)}">
                                <div class="media-progress-text">
                                    <span>${latestSaved}</span>
                                    <span class="media-progress-date">${formatDateOnly(task.lastFileUpdateTime) || '无'}</span>
                                </div>
                                ${formatMissingEpisodes(task) ? `<div class="media-progress-missing">${formatMissingEpisodes(task)}</div>` : ''}
                            </div>

                            <div class="media-card-footer">
                                <div class="media-tags">
                                    <span class="media-tag">${task.videoType === 'movie' ? '电影' : '剧集'}</span>
                                    <span class="media-tag">${((_a = task.account) === null || _a === void 0 ? void 0 : _a.username) || '账号'}</span>
                                </div>

                                <div class="media-actions">
                                    <div class="media-btn-circle primary execute-btn" onclick="event.stopPropagation(); executeTaskWithAnimation(this, ${task.id})" title="执行任务">
                                        <i class="ph-fill ph-play"></i>
                                    </div>
                                    <div class="media-btn-circle more-actions-btn" onclick="event.stopPropagation(); toggleMoreActions(this, ${task.id})" title="更多操作">
                                        <i class="ph ph-dots-three"></i>
                                    </div>
                                    <div class="media-btn-circle" style="color: #fca5a5; border-color: rgba(252,165,165,0.3);" onclick="event.stopPropagation(); deleteTask(${task.id})" title="删除任务">
                                        <i class="ph ph-trash"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }
        else {
            // 明亮模式：使用主分支的双栏布局（海报+信息）
            tbody.innerHTML += `
                <tr class="media-wall-card" data-status='${task.status}' data-task-id='${task.id}' data-name='${taskName}'>
                    <td data-label="海报" class="media-wall-poster-cell">
                        <div class="media-wall-poster ${poster ? '' : 'is-placeholder'}"
                             style="background-image:url('${poster}') ${tmdbUrl ? '; cursor: pointer;' : ''}"
                             ${tmdbUrl ? `onclick="window.open('${tmdbUrl}', '_blank');"` : ''}>
                            ${poster ? '' : '<span>暂无海报</span>'}
                        </div>
                    </td>
                    <td data-label="信息" class="media-wall-info-cell">
                        <div class="media-wall-topline">
                            <span class="status-badge ${getStatusClass(task)}">${formatTaskStatus(task)}</span>
                            ${metaLine ? `<span class="media-wall-meta">${metaLine}</span>` : ''}
                            ${task.manualTmdbBound ? `<span class="tmdb-bound-badge" style="background:#10b981;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;margin-left:6px;">🎬 ${task.tmdbTitle || task.tmdbId}${task.manualSeason ? ' 第' + task.manualSeason + '季' : ''}</span>` : ''}
                        </div>
                        <a href="${task.shareLink}" target="_blank" class='media-wall-title' title="${taskName}">${taskName}</a>
                        <p class="media-wall-overview" title="${overview}">${overview}</p>
                        <div class="media-wall-latest" title="${latestSaved}">${latestSaved}</div>
                        ${formatMissingEpisodes(task) ? `<div class="media-wall-missing" title="${formatMissingEpisodesTitle(task)}">${formatMissingEpisodes(task)}</div>` : ''}
                        <div class="media-wall-path" title="${task.realFolderName || task.realFolderId}">${task.realFolderName || task.realFolderId}</div>
                        <div class="media-wall-time" style="font-size: 13px; color: #3b82f6; margin-top: 6px; font-weight: 500;">⏱ 更新: ${formatDateTime(task.lastFileUpdateTime) || '无'}</div>
                        <div class="media-wall-actions">
                            <button class="btn-warning" onclick="executeTask(${task.id})">执行</button>
                            <button onclick="showEditTaskModal(${task.id})">修改</button>
                            <button class="btn-danger" onclick="deleteTask(${task.id})">删除</button>
                            <button class="btn-default" onclick="clearTaskCache(${task.id})">清缓存</button>
                            <button class="btn-default" onclick="showFileListModal('${task.id}')">目录</button>
                        </div>
                    </td>
                </tr>
            `;
        }
    });
    // 添加虚拟占位卡片（用于添加新任务）
    if (isCinemaMode) {
        tbody.innerHTML += `
            <tr class="media-wall-card add-task-placeholder" onclick="event.stopPropagation(); openCreateTaskModal()" style="cursor: pointer; background: transparent; border: 2px dashed rgba(99, 102, 241, 0.3); min-height: 380px;">
                <td class="media-wall-info-cell" style="display: contents;">
                    <td style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 40px;">
                        <div class="add-task-icon" style="width: 80px; height: 80px; border-radius: 50%; background: transparent; border: 2px dashed rgba(99, 102, 241, 0.5); display: flex; align-items: center; justify-content: center; margin-bottom: 20px; transition: all 0.3s ease;">
                            <i class="ph ph-plus" style="font-size: 40px; color: #6366f1;"></i>
                        </div>
                        <div style="font-size: 16px; font-weight: 600; color: var(--text-main); margin-bottom: 8px;">添加新任务</div>
                        <div style="font-size: 13px; color: var(--text-muted);">点击创建新的转存任务</div>
                    </td>
                </td>
            </tr>
        `;
    }
    else {
        tbody.innerHTML += `
            <tr class="media-wall-card add-task-placeholder" onclick="event.stopPropagation(); openCreateTaskModal()" style="cursor: pointer;">
                <td data-label="海报" class="media-wall-poster-cell">
                    <div class="media-wall-poster is-placeholder" style="display: flex; align-items: center; justify-content: center;">
                        <i class="ph ph-plus" style="font-size: 40px; color: rgba(120, 53, 15, 0.5);"></i>
                    </div>
                </td>
                <td data-label="信息" class="media-wall-info-cell" style="display: flex; align-items: center; justify-content: center;">
                    <div style="text-align: center;">
                        <div style="font-size: 18px; font-weight: 600; color: var(--text-color); margin-bottom: 4px;">添加新任务</div>
                        <div style="font-size: 13px; color: rgba(100, 116, 139, 0.88);">点击创建新的转存任务</div>
                    </div>
                </td>
            </tr>
        `;
    }
}
var taskList = [];
// 从taskList中获取任务
function getTaskById(id) {
    return taskList.find(task => task.id == id);
}
function updatePaginationUI() {
    const paginationBar = document.getElementById('taskPagination');
    const pageInfo = document.getElementById('taskPageInfo');
    if (!paginationBar || !pageInfo)
        return;
    const totalPages = Math.ceil(taskTotal / taskFilterParams.pageSize) || 1;
    if (totalPages <= 1) {
        paginationBar.style.display = 'none';
        return;
    }
    paginationBar.style.display = '';
    pageInfo.textContent = `第 ${taskFilterParams.page} / ${totalPages} 页（共 ${taskTotal} 条）`;
    const prevBtn = paginationBar.querySelector('.pagination-prev');
    const nextBtn = paginationBar.querySelector('.pagination-next');
    if (prevBtn)
        prevBtn.disabled = taskFilterParams.page <= 1;
    if (nextBtn)
        nextBtn.disabled = taskFilterParams.page >= totalPages;
}
function changeTaskPage(delta) {
    const newPage = taskFilterParams.page + delta;
    const totalPages = Math.ceil(taskTotal / taskFilterParams.pageSize) || 1;
    if (newPage < 1 || newPage > totalPages)
        return;
    taskFilterParams.page = newPage;
    fetchTasks({ silent: true });
}
function fetchTasks() {
    return __awaiter(this, arguments, void 0, function* (options = {}) {
        const { silent = false } = options;
        const tableContainer = document.querySelector('#taskTab .table-container');
        // 搜索输入场景使用局部过渡，避免全局遮罩和列表空白闪烁。
        if (silent && tableContainer) {
            tableContainer.classList.add('is-searching');
        }
        else {
            loading.show();
        }
        try {
            const response = yield fetch(`/api/tasks?status=${taskFilterParams.status}&search=${encodeURIComponent(taskFilterParams.search)}&page=${taskFilterParams.page}&pageSize=${taskFilterParams.pageSize}`);
            const data = yield response.json();
            if (data.success) {
                taskTotal = data.total || 0;
                taskList = [];
                const tbody = document.querySelector('#taskTable tbody');
                tbody.innerHTML = '';
                const currentUiStyle = document.documentElement.getAttribute('data-ui-style') || 'classic';
                if (currentUiStyle === 'media') {
                    renderTaskMediaWall(data.data);
                    updatePaginationUI();
                    return;
                }
                data.data.forEach(task => {
                    taskList.push(task);
                    const taskName = task.shareFolderName ? (task.resourceName + '/' + task.shareFolderName) : task.resourceName || '未知';
                    const cronIcon = task.enableCron ? '<span class="cron-icon" title="已开启自定义定时任务">⏰</span>' : '';
                    tbody.innerHTML += `
                    <tr data-status='${task.status}' data-task-id='${task.id}' data-name='${taskName}'>
                        <td>
                            <button class="btn-warning" onclick="executeTask(${task.id})">执行</button>
                            <button onclick="showEditTaskModal(${task.id})">修改</button>
                            <button class="btn-danger" onclick="deleteTask(${task.id})">删除</button>
                            <button class="btn-default" onclick="clearTaskCache(${task.id})">清缓存</button>
                        </td>
                        <td data-label="资源名称">${cronIcon}<a href="${task.shareLink}" target="_blank" class='ellipsis' title="${taskName}">${taskName}</a>${task.tmdbId ? `<span style="background:${task.manualTmdbBound ? '#10b981' : '#6b7280'};color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:4px;">🎬 ${task.tmdbTitle || task.tmdbId}${task.manualSeason ? ' S' + task.manualSeason : ''}${task.manualTmdbBound ? '' : ' (自动)'}</span>` : ''}</td>
                        <td data-label="账号">${task.account.username}</td>
                        <!--<td data-label="首次保存目录"><a href="https://cloud.189.cn/web/main/file/folder/${task.targetFolderId}" target="_blank">${task.targetFolderId}</a></td>-->
                         <td data-label="更新目录"><a href="javascript:void(0)" onclick="showFileListModal('${task.id}')" class='ellipsis'>${task.realFolderName || task.realFolderId}</a></td>
                        <td data-label="最新转存">
                            <div class='ellipsis' title="${formatLatestSavedFile(task)}">${formatLatestSavedFile(task)}</div>
                            ${formatMissingEpisodes(task) ? `<div class='ellipsis' title="${formatMissingEpisodesTitle(task)}">${formatMissingEpisodes(task)}</div>` : ''}
                        </td>
                        <td data-label="转存时间" style="font-size: 13px; color: #3b82f6; font-weight: 500;">${formatDateTime(task.lastFileUpdateTime)}</td>
                        <td data-label="备注">${task.remark ? task.remark : ''}</td>
                        <td data-label="状态">${renderStatusCapsule(task)}${task.status === 'failed' && task.lastError ? `<span style="color: #ff4d4f; font-size: 11px; margin-left: 5px;">(${task.lastError.slice(0, 30)}${task.lastError.length > 30 ? '...' : ''})</span>` : ''}</td>
                    </tr>
                `;
                });
                updatePaginationUI();
            }
            else if (silent) {
                message.warning('任务搜索失败: ' + (data.error || '未知错误'));
            }
        }
        catch (error) {
            // 静默搜索失败时保留旧列表，避免用户看到空白结果。
            message.warning('任务列表加载失败: ' + error.message);
        }
        finally {
            if (silent && tableContainer) {
                requestAnimationFrame(() => tableContainer.classList.remove('is-searching'));
            }
            else {
                loading.hide();
            }
        }
        // 刷新影院背景海报列表（如果影院模式已激活）
        if (typeof refreshCinemaBackground === 'function') {
            refreshCinemaBackground();
        }
    });
}
// 删除任务
function deleteTask(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const deleteCloud = document.getElementById('deleteCloudOption').checked;
        if (!confirm(deleteCloud ? '确定要删除这个任务并且从网盘中也删除吗？' : '确定要删除这个任务吗？'))
            return;
        loading.show();
        const response = yield fetch(`/api/tasks/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ deleteCloud })
        });
        loading.hide();
        const data = yield response.json();
        if (data.success) {
            removeTmdbCache(id); // 删除任务的TMDB缓存
            message.success('任务删除成功');
            fetchTasks();
        }
        else {
            message.warning('任务删除失败: ' + data.error);
        }
    });
}
function clearTaskCache(id) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!confirm('确定要手动清除该任务的文件过滤缓存吗？'))
            return;
        const cacheBtn = document.querySelector(`button[onclick="clearTaskCache(${id})"]`);
        if (cacheBtn) {
            cacheBtn.classList.add('loading');
            cacheBtn.disabled = true;
        }
        try {
            const response = yield fetch(`/api/tasks/${id}/clear-cache`, { method: 'POST' });
            const data = yield response.json();
            if (data.success) {
                message.success('任务缓存已清除');
                fetchTasks(); // 刷新任务列表，更新前端显示的进度
            }
            else {
                message.warning('任务缓存清除失败: ' + data.error);
            }
        }
        catch (error) {
            message.warning('任务缓存清除失败: ' + error.message);
        }
        finally {
            if (cacheBtn) {
                cacheBtn.classList.remove('loading');
                cacheBtn.disabled = false;
            }
        }
    });
}
function executeTask(id_1) {
    return __awaiter(this, arguments, void 0, function* (id, refresh = true) {
        const executeBtn = document.querySelector(`button[onclick="executeTask(${id})"]`);
        if (executeBtn) {
            executeBtn.classList.add('loading');
            executeBtn.disabled = true;
        }
        message.info('任务开始执行，请查看日志...');
        try {
            const response = yield fetch(`/api/tasks/${id}/execute`, {
                method: 'POST'
            });
            if (response.ok) {
                // 任务执行是异步的，这里只是触发执行请求
                // 刷新任务列表以更新状态
                setTimeout(() => fetchTasks(), 1000);
            }
            else {
                message.warning('任务执行请求失败');
            }
        }
        catch (error) {
            message.warning('任务执行失败: ' + error.message);
        }
        finally {
            if (executeBtn) {
                executeBtn.classList.remove('loading');
                executeBtn.disabled = false;
            }
        }
    });
}
// 带动画效果的执行任务（媒体墙卡片）
function executeTaskWithAnimation(btnElement, id) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!btnElement || btnElement.classList.contains('executing'))
            return;
        // 添加执行动画
        btnElement.classList.add('executing');
        const icon = btnElement.querySelector('i');
        if (icon) {
            icon.style.animation = 'spin 1s linear infinite';
        }
        message.info('任务开始执行，请查看日志...');
        try {
            const response = yield fetch(`/api/tasks/${id}/execute`, {
                method: 'POST'
            });
            if (response.ok) {
                // 任务执行是异步的，刷新任务列表
                setTimeout(() => fetchTasks(), 1000);
            }
            else {
                message.warning('任务执行请求失败');
            }
        }
        catch (error) {
            message.warning('任务执行失败: ' + error.message);
        }
        finally {
            // 移除动画（延迟一点让用户看到反馈）
            setTimeout(() => {
                btnElement.classList.remove('executing');
                if (icon) {
                    icon.style.animation = '';
                }
            }, 500);
        }
    });
}
// 执行所有任务
function executeAllTask() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!confirm('确定要执行所有任务吗？'))
            return;
        const executeAllBtn = document.querySelector('#executeAllBtn');
        if (executeAllBtn) {
            executeAllBtn.classList.add('loading');
            executeAllBtn.disabled = true;
        }
        try {
            const response = yield fetch('/api/tasks/executeAll', {
                method: 'POST'
            });
            if (response.ok) {
                message.success('任务已在后台执行, 请稍后查看结果');
            }
            else {
                message.warning('任务执行失败');
            }
        }
        catch (error) {
            message.warning('任务执行失败:' + error.message);
        }
        finally {
            executeAllBtn.classList.remove('loading');
            executeAllBtn.disabled = false;
        }
    });
}
function openCreateTaskModal() {
    const lastTargetFolder = getFromCache('lastTargetFolder');
    if (lastTargetFolder) {
        const { lastTargetFolderId, lastTargetFolderName } = JSON.parse(lastTargetFolder);
        document.getElementById('targetFolderId').value = lastTargetFolderId;
        document.getElementById('targetFolder').value = lastTargetFolderName;
    }
    document.getElementsByClassName('cronExpression-box')[0].style.display = 'none';
    document.getElementById('createTaskModal').style.display = 'block';
}
function closeCreateTaskModal() {
    document.querySelector('.share-folders-group').style.display = 'none';
    document.getElementById('shareFoldersList').innerHTML = '';
    ;
    document.getElementById('createTaskModal').style.display = 'none';
    document.getElementById('taskName').readOnly = true;
    document.getElementById('taskForm').reset();
    const tmdbInfoEl = document.getElementById('tmdbInfo');
    if (tmdbInfoEl)
        tmdbInfoEl.style.display = 'none';
    window.tempTmdbInfo = null;
}
function showTmdbBindModal() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const modal = document.getElementById('tmdbBindModal');
        const keywordInput = document.getElementById('tmdbSearchKeyword');
        const resultsDiv = document.getElementById('tmdbSearchResults');
        const taskName = ((_a = document.getElementById('taskName')) === null || _a === void 0 ? void 0 : _a.value) || '';
        keywordInput.value = taskName.replace(/\s*\(\d{4}\)\s*$/, '').trim();
        resultsDiv.innerHTML = '';
        modal.style.display = 'block';
    });
}
function closeTmdbBindModal() {
    document.getElementById('tmdbBindModal').style.display = 'none';
    document.getElementById('tmdbSearchResults').innerHTML = '';
}
function searchTmdb() {
    return __awaiter(this, void 0, void 0, function* () {
        const keyword = document.getElementById('tmdbSearchKeyword').value.trim();
        const type = document.getElementById('tmdbSearchType').value;
        const resultsDiv = document.getElementById('tmdbSearchResults');
        if (!keyword) {
            message.warning('请输入搜索关键词');
            return;
        }
        try {
            loading.show();
            const response = yield fetch('/api/tmdb/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword, type })
            });
            loading.hide();
            const data = yield response.json();
            if (data.success && data.data.length > 0) {
                resultsDiv.innerHTML = data.data.map(item => `
                <div class="tmdb-result-item" style="display: flex; gap: 15px; padding: 15px; border: 1px solid var(--border-color); border-radius: 4px; margin-bottom: 10px; cursor: pointer;" onclick="selectTmdbItem(${item.id}, '${item.type}', '${item.title.replace(/'/g, "\\'")}', ${item.year || 'null'})">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; font-size: 14px; margin-bottom: 5px;">
                            ${item.title} ${item.year ? `(${item.year})` : ''}
                        </div>
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">
                            原名: ${item.originalTitle || 'N/A'} | 类型: ${item.type === 'movie' ? '电影' : '剧集'} | 评分: ${item.voteAverage || 'N/A'}
                        </div>
                        ${item.overview ? `<div style="font-size: 11px; color: #999; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${item.overview}</div>` : ''}
                    </div>
                </div>
            `).join('');
            }
            else {
                resultsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">未找到匹配结果</div>';
            }
        }
        catch (error) {
            loading.hide();
            message.warning('搜索失败: ' + error.message);
        }
    });
}
function selectTmdbItem(id, type, title, year) {
    const taskName = document.getElementById('taskName');
    const standardName = year ? `${title} (${year})` : title;
    taskName.value = standardName;
    window.tempTmdbInfo = {
        tmdbId: id,
        videoType: type,
        tmdbTitle: title
    };
    const videoTypeSelect = document.getElementById('videoType');
    videoTypeSelect.value = type;
    const tmdbInfoEl = document.getElementById('tmdbInfo');
    const tmdbInfoText = document.getElementById('tmdbInfoText');
    if (tmdbInfoEl && tmdbInfoText) {
        tmdbInfoText.innerHTML = `
            ✅ 已手动绑定: <strong>${title}</strong> ${year ? `(${year})` : ''} 
            <br><small style="color: #666;">TMDB ID: ${id} | 类型: ${type === 'movie' ? '电影' : '剧集'}</small>
        `;
        tmdbInfoEl.style.display = 'block';
    }
    closeTmdbBindModal();
    message.success('TMDB绑定成功');
}
// 初始化任务表单
function initTaskForm() {
    // 使用防抖包装处理函数
    const debouncedHandleShare = debounce(parseShareLink, 500);
    const shareInputs = document.querySelectorAll('[data-share-input]');
    shareInputs.forEach(input => {
        input.addEventListener('blur', debouncedHandleShare);
    });
    document.getElementById('taskName').addEventListener('input', () => {
        if (typeof autoDetectVideoType === 'function')
            autoDetectVideoType();
    });
    // 修改原有的表单提交处理
    document.getElementById('taskForm').addEventListener('submit', (e) => __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const accountId = document.getElementById('accountId').value;
        const shareLink = document.getElementById('shareLink').value;
        const totalEpisodes = document.getElementById('totalEpisodes').value;
        const targetFolderId = document.getElementById('targetFolderId').value;
        const targetFolder = document.getElementById('targetFolder').value;
        const accessCode = document.getElementById('accessCode').value;
        const matchPattern = document.getElementById('matchPattern').value;
        const matchOperator = document.getElementById('matchOperator').value;
        const matchValue = document.getElementById('matchValue').value;
        const remark = document.getElementById('remark').value;
        const enableCron = document.getElementById('enableCron').checked;
        const cronExpression = document.getElementById('cronExpression').value;
        const sourceRegex = document.getElementById('ctSourceRegex').value;
        const targetRegex = document.getElementById('ctTargetRegex').value;
        const taskName = document.getElementById('taskName').value.trim();
        const enableTaskScraper = document.getElementById('enableTaskScraper').checked;
        const videoType = document.getElementById('videoType').value;
        if (!taskName) {
            message.warning('任务名称不能为空');
            return;
        }
        // 如果填了matchPattern那matchValue就必须填
        if (matchPattern && !matchValue) {
            message.warning('填了匹配模式, 那么匹配值就必须填');
            return;
        }
        if (enableCron && !cronExpression) {
            message.warning('开启了自定义定时任务, 那么定时表达式就必须填');
            return;
        }
        // 如果填了targetRegex 那么sourceRegex也必须填
        if (targetRegex && !sourceRegex) {
            message.warning('填了目标正则, 那么源正则就必须填');
            return;
        }
        // 获取选中的分享目录
        const selectedFolders = Array.from(document.querySelectorAll('input[name="chooseShareFolder"]:checked'))
            .map(cb => cb.value);
        if (selectedFolders.length == 0) {
            message.warning('至少选择一个分享目录');
            return;
        }
        const body = Object.assign({ accountId, shareLink, totalEpisodes, targetFolderId, accessCode,
            matchPattern, matchOperator, matchValue, overwriteFolder: 0, remark, enableCron, cronExpression, targetFolder, selectedFolders,
            sourceRegex, targetRegex, taskName, enableTaskScraper, videoType }, window.tempTmdbInfo);
        yield createTask(e, body);
    }));
    // 监听accountId的变化
    document.getElementById('accountId').addEventListener('change', () => __awaiter(this, void 0, void 0, function* () {
        const lastTargetFolder = getFromCache('lastTargetFolder');
        if (lastTargetFolder) {
            const { lastTargetFolderId, lastTargetFolderName } = JSON.parse(lastTargetFolder);
            document.getElementById('targetFolderId').value = lastTargetFolderId;
            document.getElementById('targetFolder').value = lastTargetFolderName;
            if (typeof autoDetectVideoType === 'function')
                autoDetectVideoType();
        }
        else {
            document.getElementById('targetFolderId').value = '';
            document.getElementById('targetFolder').value = '';
        }
    }));
    function createTask(e, body) {
        return __awaiter(this, void 0, void 0, function* () {
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            try {
                loading.show();
                const response = yield fetch('/api/tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = yield response.json();
                if (data.success) {
                    const targetFolderName = document.getElementById('targetFolder').value;
                    // 存储本次选择的目录
                    saveToCache('lastTargetFolder', JSON.stringify({ lastTargetFolderId: body.targetFolderId, lastTargetFolderName: targetFolderName }));
                    document.getElementById('taskForm').reset();
                    document.getElementById('targetFolderId').value = body.targetFolderId;
                    const ids = data.data.map(item => item.id);
                    // 先关闭弹窗和显示成功消息
                    closeCreateTaskModal();
                    loading.hide(); // 提前隐藏loading，让用户可以操作
                    // 切换到任务tab并立即刷新任务列表
                    const tasksTab = document.querySelector('.tab[data-tab="tasks"]');
                    if (tasksTab) {
                        tasksTab.click();
                    }
                    // 立即刷新任务列表显示新创建的任务
                    yield fetchTasks();
                    message.success('任务创建完成，5秒后开始执行');
                    // 5秒后串行执行任务（后台执行，不阻塞界面）
                    setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                        for (const id of ids) {
                            yield executeTask(id, false);
                        }
                        fetchTasks(); // 执行完成后再次刷新
                    }), 5000);
                }
                else {
                    if (data.error == 'folder already exists') {
                        if (confirm('该目录已经存在, 定要覆盖吗?')) {
                            body.overwriteFolder = 1;
                            yield createTask(e, body);
                        }
                        return;
                    }
                    message.warning('任务创建失败: ' + data.error);
                }
            }
            catch (error) {
                message.warning('任务创建失败: ' + error.message);
            }
            finally {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
                loading.hide();
            }
        });
    }
}
var chooseTask = undefined;
// 文件列表弹窗
function showFileListModal(taskId) {
    return __awaiter(this, void 0, void 0, function* () {
        chooseTask = getTaskById(taskId);
        const accountId = chooseTask.accountId;
        const folderId = chooseTask.realFolderId;
        // 创建弹窗
        const modal = document.createElement('div');
        modal.className = 'modal files-list-modal';
        modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>文件列表</h3>
            </div>
            <div class='modal-body'>
                <button class="batch-rename-btn" onclick="showBatchRenameOptions()">批量重命名</button>
                <button class="ai-rename-btn" onclick="showAIRenameOptions()">AI重命名</button>
                <button class="manual-tmdb-btn btn-warning" onclick="openManualTmdbModal()" style="margin-left: 4px;">指定TMDB</button>
                <button class="delete-files-btn btn-danger" onclick="deleteTaskFiles()">批量删除</button>
                <div class='form-body'>
                <table>
                    <thead>
                        <tr>
                            <th><input type="checkbox" id="selectAll" onclick="toggleSelectAll()"></th>
                            <th>文件名</th>
                            <th>大小</th>
                            <th>修改时间</th>
                        </tr>
                    </thead>
                    <tbody id="fileListBody"></tbody>
                </table>
                </div>
            </div>
            <div class="form-actions">
                <button class="btn-default" onclick="closeFileListModal()">关闭</button>
            </div>
        </div>
    `;
        document.body.appendChild(modal);
        modal.style.display = 'flex';
        // 获取文件列表
        try {
            loading.show();
            const response = yield fetch(`/api/folder/files?accountId=${accountId}&taskId=${chooseTask.id}`);
            const data = yield response.json();
            loading.hide();
            if (data.success) {
                const tbody = document.getElementById('fileListBody');
                data.data.forEach(file => {
                    tbody.innerHTML += `
                    <tr>
                        <td><input type="checkbox" class="file-checkbox" data-filename="${file.name}" data-id="${file.id}"></td>
                        <td>${file.name}</td>
                        <td>${formatFileSize(file.size)}</td>
                        <td>${file.lastOpTime}</td>
                    </tr>
                `;
                });
            }
            else {
                message.error(data.error);
            }
        }
        catch (error) {
            message.warning('获取文件列表失败：' + error.message);
        }
    });
}
// 显示批量重命名选项
function showBatchRenameOptions() {
    var _a, _b;
    const sourceRegex = (_a = escapeHtmlAttr(chooseTask.sourceRegex)) !== null && _a !== void 0 ? _a : '';
    const targetRegex = (_b = escapeHtmlAttr(chooseTask.targetRegex)) !== null && _b !== void 0 ? _b : '';
    const selectedFiles = Array.from(document.querySelectorAll('.file-checkbox:checked')).map(cb => cb.dataset.filename);
    if (selectedFiles.length === 0) {
        message.warning('请选择要重命名的文件');
        return;
    }
    const modal = document.createElement('div');
    modal.className = 'modal rename-options-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>批量重命名</h3>
            </div>
            <div class="form-body">
                <div class="rename-type-selector">
                    <label class="radio-label">
                        <input type="radio" name="renameType" value="regex" checked>
                        正则表达式重命名
                    </label>
                    <label class="radio-label">
                        <input type="radio" name="renameType" value="sequential">
                        顺序重命名
                    </label>
                </div>
                <div id="renameDescription" class="rename-description">
                    正则表达式文件重命名。在第一行输入源文件名正则表达式，并在第二行输入新文件名正则表达式。<span class="help-icon" data-tooltip="常用正则表达式示例">?</span>
                </div>
                <div id="regexInputs" class="rename-inputs">
                    <div class="form-group">
                        <input type="text" id="sourceRegex" class="form-input" placeholder="源文件名正则表达式" value="${sourceRegex}">
                    </div>
                    <div class="form-group">
                        <input type="text" id="targetRegex" class="form-input" placeholder="新文件名正则表达式" value="${targetRegex}">
                    </div>
                </div>
                <div id="sequentialInputs" class="rename-inputs" style="display: none;">
                    <div class="form-group">
                        <input type="text" id="newNameFormat" class="form-input" placeholder="新文件名格式">
                    </div>
                    <div class="form-group">
                        <input type="number" id="startNumber" class="form-input" value="" min="1" placeholder="起始序号">
                    </div>
                </div>
            </div>
            <div class="form-actions">
                <button class="saveAndAutoUpdate btn-warning" onclick="previewRename(true)">确定并自动更新</button>
                <button class="btn-primary" onclick="previewRename(false)">确定</button>
                <button class="btn-default" onclick="closeRenameOptionsModal()">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    // 添加单选框切换事件
    const radioButtons = modal.querySelectorAll('input[name="renameType"]');
    const description = modal.querySelector('#renameDescription');
    const regexInputs = modal.querySelector('#regexInputs');
    const sequentialInputs = modal.querySelector('#sequentialInputs');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', (e) => {
            modal.querySelector('.saveAndAutoUpdate').style.display = 'none';
            if (e.target.value === 'regex') {
                description.textContent = '正则表达式文件重命名。 在第一行输入源文件名正则表达式，并在第二行输入新文件名正则表达式。如果新旧名称相同, 则跳过该文件。';
                regexInputs.style.display = 'block';
                sequentialInputs.style.display = 'none';
                modal.querySelector('.saveAndAutoUpdate').style.display = 'inline-block';
            }
            else {
                description.textContent = '新文件名将有一个数值起始值附加到它， 并且它将通过向起始值添加 1 来按顺序显示。 在第一行输入新的文件名，并在第二行输入起始值。';
                regexInputs.style.display = 'none';
                sequentialInputs.style.display = 'block';
            }
        });
    });
}
// 预览重命名
function previewRename() {
    return __awaiter(this, arguments, void 0, function* (autoUpdate = false) {
        const selectedFiles = Array.from(document.querySelectorAll('.file-checkbox:checked')).map(cb => cb.dataset.filename);
        const renameType = document.querySelector('input[name="renameType"]:checked').value;
        let newNames = [];
        if (renameType === 'regex') {
            const sourceRegex = escapeRegExp(document.getElementById('sourceRegex').value);
            const targetRegex = escapeRegExp(document.getElementById('targetRegex').value);
            newNames = selectedFiles
                .map(filename => {
                const checkbox = document.querySelector(`.file-checkbox[data-filename="${filename}"]`);
                try {
                    const destFileName = filename.replace(new RegExp(sourceRegex), targetRegex);
                    // 如果文件名没有变化，说明没有匹配成功
                    return destFileName !== filename ? {
                        fileId: checkbox.dataset.id,
                        oldName: filename,
                        destFileName
                    } : null;
                }
                catch (e) {
                    return null;
                }
            })
                .filter(Boolean);
        }
        else {
            const nameFormat = document.getElementById('newNameFormat').value;
            const startNum = parseInt(document.getElementById('startNumber').value);
            const padLength = document.getElementById('startNumber').value.length;
            newNames = selectedFiles.map((filename, index) => {
                const checkbox = document.querySelector(`.file-checkbox[data-filename="${filename}"]`);
                const ext = filename.split('.').pop();
                const num = (startNum + index).toString().padStart(padLength, '0');
                return {
                    fileId: checkbox.dataset.id,
                    oldName: filename,
                    destFileName: `${nameFormat}${num}.${ext}`
                };
            });
            autoUpdate = false;
        }
        showRenamePreview(newNames, autoUpdate);
    });
}
function showRenamePreview(newNames, autoUpdate) {
    const modal = document.createElement('div');
    modal.className = 'modal preview-rename-modal';
    modal.style.zIndex = '1010';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>重命名预览</h3>
            </div>
            <div class="form-body">
                <table>
                    <thead>
                        <tr>
                            <th tyle="width: 400px;">原文件名</th>
                            <th tyle="width: 400px;">新文件名</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${newNames.map(file => `
                            <tr data-file-id="${file.fileId}">
                                <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.oldName}</td>
                                <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.destFileName}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="form-actions">
                <button onclick="submitRename(${autoUpdate})">确定</button>
                <button onclick="closeRenamePreviewModal()" class="btn-default">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}
function submitRename(autoUpdate) {
    return __awaiter(this, void 0, void 0, function* () {
        const files = Array.from(document.querySelectorAll('.preview-rename-modal tr[data-file-id]')).map(row => ({
            fileId: row.dataset.fileId,
            oldName: row.querySelector('td:first-child').textContent,
            destFileName: row.querySelector('td:last-child').textContent
        }));
        if (files.length == 0) {
            message.warning('没有需要重命名的文件');
            return;
        }
        if (autoUpdate) {
            if (!confirm('当前选择的是自动更新, 请确认正则表达式是否正确, 否则后续的文件可能无法正确重命名')) {
                return;
            }
        }
        const accountId = chooseTask.accountId;
        const taskId = chooseTask.id;
        const sourceRegex = autoUpdate ? escapeRegExp(document.getElementById('sourceRegex').value) : null;
        const targetRegex = autoUpdate ? escapeRegExp(document.getElementById('targetRegex').value) : null;
        try {
            loading.show();
            const response = yield fetch('/api/files/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId, accountId, files, sourceRegex, targetRegex })
            });
            loading.hide();
            const data = yield response.json();
            if (data.success) {
                if (data.data && data.data.length > 0) {
                    message.warning('部分文件重命名失败:' + data.data.join(', '));
                }
                else {
                    message.info('重命名成功');
                }
                closeRenamePreviewModal();
                closeRenameOptionsModal();
                closeFileListModal();
                chooseTask.sourceRegex = sourceRegex;
                chooseTask.targetRegex = targetRegex;
                // 刷新文件列表
                showFileListModal(taskId);
                fetchTasks();
            }
            else {
                message.warning('重命名失败: ' + data.error);
            }
        }
        catch (error) {
            message.warning('重命名失败: ' + error.message);
        }
        finally {
            loading.hide();
        }
    });
}
// 显示AI重命名选项
function showAIRenameOptions() {
    return __awaiter(this, void 0, void 0, function* () {
        const selectedFiles = Array.from(document.querySelectorAll('.file-checkbox:checked')).map(cb => cb.dataset.filename);
        if (selectedFiles.length === 0) {
            message.warning('请选择要重命名的文件');
            return;
        }
        const tmdbInfoHtml = chooseTask.tmdbId
            ? `<div style="margin-bottom: 15px; padding: 10px; background: #e6f7ff; border: 1px solid #91d5ff; border-radius: 4px; color: #1890ff;">
             <span><i class="fas fa-info-circle"></i> 当前任务${chooseTask.manualTmdbBound ? '已被手动指定' : '已自动识别'}为 <b>TMDB ID: ${chooseTask.tmdbId} ${chooseTask.tmdbTitle ? '(' + chooseTask.tmdbTitle + ')' : ''}</b>${chooseTask.manualSeason != null ? ' &nbsp;<b>强制第 ' + chooseTask.manualSeason + ' 季</b>' : ''}</span>
           </div>`
            : '';
        const modal = document.createElement('div');
        modal.className = 'modal rename-options-modal';
        modal.style.zIndex = '1005';
        modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>AI重命名</h3>
            </div>
            <div class="form-body">
                ${tmdbInfoHtml}
                <div class="rename-description">
                    AI将分析文件名并根据(系统配置与自动捕获的 TMDB 内容)出具智能重命名建议。处理需要一定时间。
                </div>
                <div class="rename-preview">
                    <h4>选中的文件：</h4>
                    <ul>
                        ${selectedFiles.map(file => `<li>${file}</li>`).join('')}
                    </ul>
                </div>
            </div>
            <div class="form-actions">
                <button class="btn-primary" onclick="executeAIRename()">开始分析</button>
                <button class="btn-default" onclick="closeRenameOptionsModal()">取消</button>
            </div>
        </div>
    `;
        document.body.appendChild(modal);
        modal.style.display = 'flex';
    });
}
// 执行AI重命名
function executeAIRename() {
    return __awaiter(this, void 0, void 0, function* () {
        const selectedFiles = Array.from(document.querySelectorAll('.file-checkbox:checked'));
        const fileIds = selectedFiles.map(cb => ({
            id: cb.dataset.id,
            name: cb.dataset.filename
        }));
        try {
            loading.show();
            const response = yield fetch(`/api/files/ai-rename`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    taskId: chooseTask.id,
                    files: fileIds
                })
            });
            const data = yield response.json();
            if (data.success) {
                // 显示预览对话框
                // 根据用户配置的模版
                showRenamePreview(data.data);
            }
            else {
                message.warning('AI分析失败：' + data.error);
            }
        }
        catch (error) {
            message.warning('操作失败：' + error.message);
        }
        finally {
            loading.hide();
        }
    });
}
// 辅助函数
function formatFileSize(bytes) {
    if (bytes === 0)
        return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('.file-checkbox');
    const selectAll = document.getElementById('selectAll');
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
}
// 修改关闭弹窗函数
function closeFileListModal() {
    const modal = document.querySelector('.files-list-modal');
    modal === null || modal === void 0 ? void 0 : modal.remove();
}
function closeRenameOptionsModal() {
    const modal = document.querySelector('.rename-options-modal');
    modal === null || modal === void 0 ? void 0 : modal.remove();
}
function closeRenameModal() {
    const modal = document.querySelector('.regex-rename-modal, .sequential-rename-modal');
    modal === null || modal === void 0 ? void 0 : modal.remove();
}
function closeRenamePreviewModal() {
    const modal = document.querySelector('.preview-rename-modal');
    modal === null || modal === void 0 ? void 0 : modal.remove();
}
// 处理反斜杠
function escapeRegExp(regexStr) {
    // 不再处理
    return regexStr;
}
// 转义HTML属性中的特殊字符
function escapeHtmlAttr(str) {
    // 不再处理
    return str;
}
// 初始化表单展开/隐藏功能
function initFormToggle() {
    const toggleBtn = document.getElementById('toggleFormBtn');
    const taskForm = document.getElementById('taskForm');
    const toggleText = toggleBtn.querySelector('.toggle-text');
    const toggleIcon = toggleBtn.querySelector('.toggle-icon');
    toggleBtn.addEventListener('click', () => {
        const isHidden = taskForm.style.display === 'none';
        taskForm.style.display = isHidden ? 'block' : 'none';
        toggleText.textContent = isHidden ? '隐藏' : '展开';
        toggleIcon.textContent = isHidden ? '▲' : '▼';
    });
}
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'cinema' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}
// ==================== [新增]: 手动关联 TMDB 逻辑 ====================
// 1. 打开弹窗
function openManualTmdbModal() {
    if (!chooseTask) {
        message.warning('无法获取当前任务，请重新打文件列表弹窗');
        return;
    }
    // 回填任务名称到搜索框中
    const taskName = chooseTask.resourceName;
    if (taskName) {
        // 尝试剥离年份等
        const yearMatch = taskName.match(/(.+?)\s*\(?(\d{4})\)?\s*$/);
        document.getElementById('tmdbSearchQuery').value = yearMatch ? yearMatch[1] : taskName;
    }
    document.getElementById('tmdbSearchResultsManual').innerHTML = '';
    const modal = document.getElementById('manualTmdbModal');
    modal.style.zIndex = '2000'; // 确保置顶于文件列表弹窗之上
    modal.style.display = 'block';
}
function closeManualTmdbModal() {
    document.getElementById('manualTmdbModal').style.display = 'none';
    document.getElementById('tmdbSearchQuery').value = '';
    document.getElementById('tmdbSearchResultsManual').innerHTML = '';
    document.getElementById('tmdbManualSeason').value = '';
}
// 2. 搜索 TMDB (手动指定弹窗)
function searchTmdbManual() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const query = document.getElementById('tmdbSearchQuery').value.trim();
        const type = document.getElementById('tmdbSearchTypeManual').value;
        if (!query) {
            message.warning('请输入搜索关键字');
            return;
        }
        const resultsContainer = document.getElementById('tmdbSearchResultsManual');
        resultsContainer.innerHTML = '<div style="text-align:center; padding: 20px;">正在搜索，请稍候...</div>';
        try {
            const response = yield fetch(`/api/tmdb/search?query=${encodeURIComponent(query)}&type=${type}&enableBilingual=true`);
            const data = yield response.json();
            if (data.success) {
                // 显示双语搜索提示
                if (((_b = (_a = data.meta) === null || _a === void 0 ? void 0 : _a.searchedLanguages) === null || _b === void 0 ? void 0 : _b[0]) === 'en-US') {
                    message.info('💡 该资源暂无中文数据，已使用英文搜索结果');
                }
                if (!data.data || data.data.length === 0) {
                    resultsContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: #888;">未找到相关结果</div>';
                    return;
                }
                resultsContainer.innerHTML = data.data.map(item => `
                <div class="tmdb-result-item" style="display: flex; gap: 15px; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; align-items: center; cursor: pointer; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='var(--hover-bg-color)'" onmouseout="this.style.backgroundColor='transparent'">
                    <img src="${item.poster_path ? 'https://image.tmdb.org/t/p/w92' + item.poster_path : '/icons/movie-placeholder.svg'}" alt="poster" style="width: 50px; border-radius: 4px; object-fit: cover;">
                    <div style="flex: 1;">
                        <div style="font-weight: bold; font-size: 14px;">${item.title || item.name} ${item.release_date || item.first_air_date ? '(' + (item.release_date || item.first_air_date).substring(0, 4) + ')' : ''}</div>
                        <div style="font-size: 12px; color: #888; font-family: monospace;">TMDB ID: ${item.id}</div>
                    </div>
                    <div>
                        <button class="btn-primary btn-small" onclick="bindTmdbToTasks('${item.id}', '${type}', '${(item.title || item.name).replace(/'/g, "\\'")}')">绑定所选任务</button>
                    </div>
                </div>
            `).join('');
            }
            else {
                resultsContainer.innerHTML = `<div style="text-align:center; padding: 20px; color: red;">搜索失败: ${data.error}</div>`;
            }
        }
        catch (error) {
            resultsContainer.innerHTML = `<div style="text-align:center; padding: 20px; color: red;">请求错误: ${error.message}</div>`;
        }
    });
}
// 3. 绑定并触发重新执行
function bindTmdbToTasks(tmdbId, videoType, title) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!chooseTask) {
            message.warning('当前未能获取到对应的任务记录!');
            return;
        }
        const manualSeasonVal = document.getElementById('tmdbManualSeason').value;
        const manualSeason = manualSeasonVal !== '' && !isNaN(parseInt(manualSeasonVal)) ? parseInt(manualSeasonVal) : null;
        const confirmMsg = manualSeason
            ? `确定要将任务 [${chooseTask.resourceName}] 绑定为 "${title}" 第${manualSeason}季 吗？\n绑定后将强制为第 ${manualSeason} 季命名。`
            : `确定要将任务 [${chooseTask.resourceName}] 强制绑定为 "${title}" 吗？\n绑定后其后续处理及历史文件将无视默认规则，优先使用此名称。`;
        if (!confirm(confirmMsg)) {
            return;
        }
        loading.show();
        try {
            const taskId = chooseTask.id;
            const resp = yield fetch(`/api/tasks/${taskId}/manual-tmdb`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tmdbId, videoType, title, manualSeason })
            });
            const data = yield resp.json();
            if (data.success) {
                // 绑定完成后，清除旧的 TMDB 缓存（确保刷新后获取新信息）
                removeTmdbCache(taskId);
                // 立即自动触发一次AI重命名和后台任务执行
                yield fetch(`/api/tasks/${taskId}/execute`, { method: 'POST' });
                loading.hide();
                const successMsg = manualSeason ? `成功绑定！并强制设定为第 ${manualSeason} 季。系统已触发重新更新。` : `成功绑定！系统已触发重新更新。`;
                message.success(successMsg);
                closeManualTmdbModal();
                fetchTasks(); // 刷新表格
                // 可选：更新目前的chooseTask以便不刷新网页立刻再点AI重命名也能展示正确
                chooseTask.tmdbId = tmdbId;
                chooseTask.videoType = videoType;
                chooseTask.tmdbTitle = title;
                chooseTask.manualTmdbBound = true;
                chooseTask.manualSeason = manualSeason;
            }
            else {
                loading.hide();
                message.warning('绑定失败: ' + data.error);
            }
        }
        catch (error) {
            loading.hide();
            message.warning('绑定过程中发生错误: ' + error.message);
        }
    });
}
function filterTasks() {
    const taskFilter = document.getElementById('taskFilter');
    const taskSearch = document.getElementById('taskSearch');
    const searchValue = taskSearch.value.trim();
    taskFilterParams.status = taskFilter.value;
    taskFilterParams.search = searchValue;
    taskFilterParams.page = 1;
    // 同步顶部全局搜索框，避免两个搜索入口显示状态不一致。
    const globalSearch = document.getElementById('globalSearch');
    if (globalSearch && globalSearch.value !== searchValue) {
        globalSearch.value = searchValue;
        const topbarSearch = document.querySelector('.topbar-search');
        if (topbarSearch) {
            topbarSearch.classList.toggle('searching', searchValue.length > 0 || document.activeElement === globalSearch);
        }
    }
    fetchTasks({ silent: true });
}
document.addEventListener('DOMContentLoaded', function () {
    const dropdownToggle = document.querySelector('.dropdown-toggle');
    const dropdownGroup = document.querySelector('.dropdown-button-group');
    dropdownToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        dropdownGroup.classList.toggle('active');
    });
    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', function (e) {
        if (!dropdownGroup.contains(e.target)) {
            dropdownGroup.classList.remove('active');
        }
    });
    const debouncedFilterTasks = debounce(filterTasks, 500);
    // 任务筛选功能
    const taskFilter = document.getElementById('taskFilter');
    const taskSearch = document.getElementById('taskSearch');
    taskFilter.addEventListener('change', function () {
        debouncedFilterTasks();
    });
    taskSearch.addEventListener('input', function () {
        debouncedFilterTasks();
    });
    // 添加全选功能
    const selectAllCheckbox = document.getElementById('selectAllTasks');
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function () {
            const rows = document.querySelectorAll('#taskTable tbody tr');
            rows.forEach(row => {
                row.classList.toggle('selected', this.checked);
            });
            // 更新批量删除按钮显示状态
            if (batchDeleteBtn) {
                batchDeleteBtn.style.display = this.checked ? '' : 'none';
            }
        });
    }
    // 修改任务行选择逻辑
    const taskTable = document.getElementById('taskTable');
    taskTable.addEventListener('click', function (e) {
        const row = e.target.closest('tr');
        if (!row)
            return;
        row.classList.toggle('selected');
        // 更新全选框状态
        const allRows = document.querySelectorAll('#taskTable tbody tr');
        const selectedRows = document.querySelectorAll('#taskTable tbody tr.selected');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = allRows.length === selectedRows.length;
            selectAllCheckbox.indeterminate = selectedRows.length > 0 && selectedRows.length < allRows.length;
        }
        // 更新批量删除按钮显示状态
        if (batchDeleteBtn) {
            batchDeleteBtn.style.display = selectedRows.length > 0 ? '' : 'none';
        }
    });
});
// 批量删除功能
function deleteSelectedTasks() {
    return __awaiter(this, void 0, void 0, function* () {
        const selectedTasks = document.querySelectorAll('#taskTable tbody tr.selected');
        const taskIds = Array.from(selectedTasks).map(row => row.getAttribute('data-task-id'));
        if (taskIds.length === 0) {
            message.warning('请选择要删除的任务');
            return;
        }
        const deleteCloud = document.getElementById('deleteCloudOption').checked;
        if (!confirm(deleteCloud ? '确定要删除选中任务并且从网盘中也删除吗？' : '确定要删除选中的任务吗？'))
            return;
        try {
            loading.show();
            const response = yield fetch('/api/tasks/batch', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskIds, deleteCloud })
            });
            loading.hide();
            const data = yield response.json();
            if (data.success) {
                message.success('批量删除成功');
                fetchTasks();
            }
            else {
                message.warning('批量删除失败: ' + data.error);
            }
        }
        catch (error) {
            message.warning('操作失败: ' + error.message);
        }
    });
}
// 添加日期格式化函数
function formatDateOnly(dateStr) {
    if (!dateStr)
        return '';
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
// 添加时间格式化函数
function formatDateTime(dateStr) {
    if (!dateStr)
        return '未更新';
    const date = new Date(dateStr);
    return `${formatDateOnly(dateStr)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
const statusOptions = {
    pending: '等待中',
    processing: '追更中',
    completed: '已完结',
    failed: '失败',
    paused: '暂停中'
};
// 格式化状态
function formatStatus(status) {
    return statusOptions[status] || status;
}
// 根据任务状态和剧集数量显示更精确的状态文字
function formatTaskStatus(task) {
    if (task.status === 'completed')
        return '已完结';
    if (task.status === 'failed')
        return '失败';
    if (task.status === 'processing')
        return '追更中';
    if (task.status === 'paused')
        return '暂停中';
    if (task.status === 'pending') {
        // pending 但已有剧集进度时，说明任务已进入追更/转存链路，展示为追更中而不是等待中。
        if (task.currentEpisodes > 0)
            return '追更中';
        return '等待中';
    }
    return task.status;
}
// 根据任务状态和剧集数量获取正确的CSS类名
function getStatusClass(task) {
    if (task.status === 'completed')
        return 'status-completed';
    if (task.status === 'failed')
        return 'status-failed';
    if (task.status === 'processing')
        return 'status-processing';
    if (task.status === 'paused')
        return 'status-paused';
    if (task.status === 'pending') {
        if (task.currentEpisodes > 0)
            return 'status-processing';
        return 'status-pending';
    }
    return 'status-' + task.status;
}
function getStatusMeta(task) {
    const className = getStatusClass(task);
    const metaMap = {
        'status-processing': { icon: 'ph ph-activity', label: '追更中' },
        'status-completed': { icon: 'ph ph-check-circle', label: '已完结' },
        'status-failed': { icon: 'ph ph-x-circle', label: '失败' },
        'status-paused': { icon: 'ph ph-pause-circle', label: '暂停中' },
        'status-pending': { icon: 'ph ph-clock', label: '等待中' }
    };
    return metaMap[className] || { icon: 'ph ph-circle', label: formatTaskStatus(task) };
}
function renderStatusCapsule(task) {
    const meta = getStatusMeta(task);
    const className = getStatusClass(task);
    return `
        <span class="status-capsule ${className}" aria-label="任务状态：${meta.label}">
            <span class="status-capsule-orb" aria-hidden="true">
                <i class="${meta.icon}"></i>
            </span>
            <span class="status-capsule-text">${meta.label}</span>
        </span>
    `;
}
// 更多操作菜单
function toggleMoreActions(btn, taskId) {
    const existing = document.querySelector('.more-actions-menu');
    if (existing) {
        existing.remove();
        return;
    }
    const menu = document.createElement('div');
    menu.className = 'more-actions-menu';
    menu.innerHTML = `
        <div class="more-actions-item" onclick="event.stopPropagation(); showEditTaskModal(${taskId}); this.parentElement.remove();">
            <i class="ph ph-pencil-simple"></i>
            <span>修改任务</span>
        </div>
        <div class="more-actions-item" onclick="event.stopPropagation(); clearTaskCache(${taskId}); this.parentElement.remove();">
            <i class="ph ph-broom"></i>
            <span>清缓存</span>
        </div>
    `;
    const rect = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 8}px`;
    menu.style.zIndex = '2000';
    document.body.appendChild(menu);
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}
// 监听enableCron的变化
document.getElementById('enableCron').addEventListener('change', function () {
    // 如果为选中 则显示cron表达式输入框
    const cronInput = document.getElementsByClassName('cronExpression-box')[0];
    cronInput.style.display = this.checked ? 'block' : 'none';
});
// 生成STRM
function generateStrm() {
    return __awaiter(this, void 0, void 0, function* () {
        const selectedTasks = document.querySelectorAll('#taskTable tbody tr.selected');
        const taskIds = Array.from(selectedTasks).map(row => row.getAttribute('data-task-id'));
        if (taskIds.length === 0) {
            message.warning('请选择要生成STRM的任务');
            return;
        }
        let overwrite = false;
        if (confirm('是否覆盖已存在的STRM文件')) {
            overwrite = true;
        }
        try {
            loading.show();
            const response = yield fetch('/api/tasks/strm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskIds, overwrite })
            });
            loading.hide();
            const data = yield response.json();
            if (data.success) {
                message.success('任务后台执行中, 请稍后查看结果');
            }
            else {
                message.warning('生成STRM失败: ' + data.error);
            }
        }
        catch (error) {
            message.warning('操作失败: ' + error.message);
        }
    });
}
// 解析分享链接获取分享目录组合
function autoDetectVideoType(taskNameStr = null) {
    var _a, _b;
    const videoTypeSelect = document.getElementById('videoType');
    if (!videoTypeSelect)
        return;
    // 如果用户已经手动选择了非自动识别，不覆盖
    if (videoTypeSelect.value && videoTypeSelect.value !== '')
        return;
    let taskName = taskNameStr !== null ? taskNameStr : (((_a = document.getElementById('taskName')) === null || _a === void 0 ? void 0 : _a.value) || '');
    const targetFolder = ((_b = document.getElementById('targetFolder')) === null || _b === void 0 ? void 0 : _b.value) || '';
    // 如果名字和目录都为空，没办法识别
    if (!taskName && !targetFolder)
        return;
    let isTv = false;
    let isMovie = false;
    // 根据目录判断
    if (targetFolder.includes('剧集') || targetFolder.includes('动漫') || targetFolder.includes('连续剧') || targetFolder.includes('纪录片') || targetFolder.includes('TV')) {
        isTv = true;
    }
    else if (targetFolder.includes('电影') || /movie/i.test(targetFolder)) {
        isMovie = true;
    }
    // 根据名称判断
    if (!isTv && !isMovie) {
        if (/S\d{1,2}/i.test(taskName) || /第.*?[季集话]/.test(taskName) || /Season/i.test(taskName) || /EP\d+/i.test(taskName)) {
            isTv = true;
        }
        else if (taskName.includes('电影')) {
            isMovie = true;
        }
    }
    if (isTv)
        videoTypeSelect.value = 'tv';
    if (isMovie)
        videoTypeSelect.value = 'movie';
}
function parseShareLink() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const shareParseError = document.getElementById('shareParseError');
        shareParseError.textContent = '';
        const tmdbInfoEl = document.getElementById('tmdbInfo');
        if (tmdbInfoEl)
            tmdbInfoEl.style.display = 'none';
        let shareLink = (_b = (_a = document.getElementById('shareLink')) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.trim();
        let accessCode = (_d = (_c = document.getElementById('accessCode')) === null || _c === void 0 ? void 0 : _c.value) === null || _d === void 0 ? void 0 : _d.trim();
        const accountId = (_e = document.getElementById('accountId')) === null || _e === void 0 ? void 0 : _e.value;
        if (!shareLink || !accountId) {
            return;
        }
        shareLink = decodeURIComponent(shareLink);
        const { url: parseShareLink, accessCode: parseAccessCode } = parseCloudShare(shareLink);
        if (parseAccessCode) {
            accessCode = parseAccessCode;
            document.getElementById('accessCode').value = accessCode;
        }
        const shareFoldersGroup = document.querySelector('.share-folders-group');
        const shareFoldersList = document.getElementById('shareFoldersList');
        try {
            loading.show();
            const response = yield fetch('/api/share/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shareLink: parseShareLink, accessCode, accountId })
            });
            loading.hide();
            const data = yield response.json();
            if (data.success) {
                shareFoldersGroup.style.display = 'block';
                shareFoldersList.innerHTML = data.data.map(folder => `
                <div class="folder-item">
                    <label>
                        <input type="checkbox" name="chooseShareFolder" value="${folder.id}" checked>
                        ${folder.name}
                    </label>
                </div>
            `).join('');
                if (data.data && data.data.length > 0) {
                    const taskName = document.getElementById('taskName');
                    const rawName = data.data[0].name;
                    if (data.tmdbInfo) {
                        taskName.value = data.tmdbInfo.standardName;
                        taskName.readOnly = false;
                        const tmdbInfoEl = document.getElementById('tmdbInfo');
                        const tmdbInfoText = document.getElementById('tmdbInfoText');
                        if (tmdbInfoEl && tmdbInfoText) {
                            tmdbInfoText.innerHTML = `
                            ✅ TMDB识别成功: <strong>${data.tmdbInfo.title}</strong> (${data.tmdbInfo.year}) 
                            <br><small style="color: #666;">原名: ${data.tmdbInfo.originalTitle || 'N/A'} | 相似度: ${data.tmdbInfo.similarity} | 类型: ${data.tmdbInfo.type === 'movie' ? '电影' : '剧集'}</small>
                        `;
                            tmdbInfoEl.style.display = 'block';
                            window.tempTmdbInfo = {
                                tmdbId: data.tmdbInfo.id,
                                videoType: data.tmdbInfo.type,
                                tmdbTitle: data.tmdbInfo.title
                            };
                        }
                        const videoTypeSelect = document.getElementById('videoType');
                        if (videoTypeSelect && data.tmdbInfo.type) {
                            videoTypeSelect.value = data.tmdbInfo.type;
                        }
                        else {
                            autoDetectVideoType(data.tmdbInfo.standardName);
                        }
                    }
                    else {
                        const cleanedName = rawName.replace(/[\[\({【]?(19|20)\d{2}[\]\)}】]?/g, '').trim();
                        taskName.value = cleanedName;
                        taskName.readOnly = false;
                        const tmdbInfoEl = document.getElementById('tmdbInfo');
                        const tmdbInfoText = document.getElementById('tmdbInfoText');
                        if (tmdbInfoEl && tmdbInfoText) {
                            tmdbInfoText.innerHTML = `
                            ⚠️ TMDB自动识别失败，请手动填写任务名称或点击"TMDB绑定"按钮手动搜索
                        `;
                            tmdbInfoEl.style.display = 'block';
                        }
                        window.tempTmdbInfo = null;
                        autoDetectVideoType(cleanedName);
                    }
                }
            }
            else {
                shareFoldersGroup.style.display = 'none';
                shareFoldersList.innerHTML = '';
                if (data.error) {
                    shareParseError.textContent = `解析失败: ${data.error}`;
                }
            }
        }
        catch (error) {
            shareFoldersGroup.style.display = 'none';
            shareFoldersList.innerHTML = '';
            shareParseError.textContent = `操作失败: ${error.message}`;
        }
    });
}
// 全选/取消全选处理
document.getElementById('selectAllFolders').addEventListener('change', function (e) {
    const checkboxes = document.querySelectorAll('input[name="chooseShareFolder"]');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
});
// 复制直链到剪贴板
function copyDirectLink(fileId, taskId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            loading.show();
            const response = yield fetch(`/api/files/direct-link?fileId=${fileId}&taskId=${taskId}`);
            loading.hide();
            const data = yield response.json();
            if (data.success) {
                // 复制到剪贴板
                yield navigator.clipboard.writeText(data.data);
                message.success('直链已复制到剪贴板');
            }
            else {
                message.warning('获取直链失败: ' + data.error);
            }
        }
        catch (error) {
            loading.hide();
            message.warning('操作失败: ' + error.message);
        }
    });
}
function parseCloudShare(shareText) {
    // 移除所有空格
    shareText = shareText.replace(/\s/g, '');
    // 提取基本URL和访问码
    let url = '';
    let accessCode = '';
    // 匹配访问码的几种常见格式
    const accessCodePatterns = [
        /[（(]访问码[：:]\s*([a-zA-Z0-9]{4})[)）]/, // （访问码：xxxx）
        /[（(]提取码[：:]\s*([a-zA-Z0-9]{4})[)）]/, // （提取码：xxxx）
        /访问码[：:]\s*([a-zA-Z0-9]{4})/, // 访问码：xxxx
        /提取码[：:]\s*([a-zA-Z0-9]{4})/, // 提取码：xxxx
        /[（(]([a-zA-Z0-9]{4})[)）]/ // （xxxx）
    ];
    // 尝试匹配访问码
    for (const pattern of accessCodePatterns) {
        const match = shareText.match(pattern);
        if (match) {
            accessCode = match[1];
            // 从原文本中移除访问码部分
            shareText = shareText.replace(match[0], '');
            break;
        }
    }
    // 提取URL - 支持两种格式
    const urlPatterns = [
        /(https?:\/\/cloud\.189\.cn\/web\/share\?[^\s]+)/, // web/share格式
        /(https?:\/\/cloud\.189\.cn\/t\/[a-zA-Z0-9]+)/, // t/xxx格式
        /(https?:\/\/h5\.cloud\.189\.cn\/share\.html#\/t\/[a-zA-Z0-9]+)/, // h5分享格式
        /(https?:\/\/[^/]+\/web\/share\?[^\s]+)/, // 其他域名的web/share格式
        /(https?:\/\/[^/]+\/t\/[a-zA-Z0-9]+)/, // 其他域名的t/xxx格式
        /(https?:\/\/[^/]+\/share\.html[^\s]*)/, // share.html格式
        /(https?:\/\/content\.21cn\.com[^\s]+)/ // 订阅链接格式
    ];
    for (const pattern of urlPatterns) {
        const urlMatch = shareText.match(pattern);
        if (urlMatch) {
            url = urlMatch[1];
            break;
        }
    }
    return {
        url: url,
        accessCode: accessCode
    };
}
function deleteTaskFiles() {
    return __awaiter(this, void 0, void 0, function* () {
        const selectedFiles = Array.from(document.querySelectorAll('.file-checkbox:checked')).map(cb => ({ id: cb.dataset.id, name: cb.dataset.filename }));
        if (selectedFiles.length === 0) {
            message.warning('请选择要删除的文件');
            return;
        }
        if (!confirm('确定要删除选中的文件吗？如果有STRM会同步删除STRM'))
            return;
        try {
            loading.show();
            const reasponse = yield fetch(`/api/tasks/files`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: chooseTask.id, files: selectedFiles })
            });
            loading.hide();
            const data = yield reasponse.json();
            if (data.success) {
                message.success('删除成功');
                // 刷新文件列表
                closeFileListModal();
                showFileListModal(chooseTask.id);
                fetchTasks();
            }
            else {
                message.warning('删除失败:' + data.error);
            }
        }
        catch (error) {
            message.warning('操作失败:' + error.message);
        }
        finally {
            loading.hide();
        }
    });
}
