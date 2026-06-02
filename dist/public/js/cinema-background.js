"use strict";
/**
 * 影院模式背景控制器
 * Cinema Background Controller
 *
 * 功能：
 * 1. 加载任务海报列表
 * 2. 双缓冲渲染实现平滑过渡
 * 3. 定时轮换海报
 * 4. 锁定/解锁指定任务海报
 * 5. 性能优化（视口检测、资源预加载）
 *
 * 版本：v1.1
 * 更新日期：2026-05-11
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
// 文件加载确认
console.log('[CinemaBackground] 模块已加载');
class CinemaBackground {
    constructor(options = {}) {
        // 配置项
        this.config = {
            rotationInterval: options.rotationInterval || 8000, // 轮换间隔（毫秒）
            transitionDuration: options.transitionDuration || 1800, // 过渡时长（毫秒）
            blurAmount: options.blurAmount || 35, // 模糊程度
            minPosters: options.minPosters || 1, // 最少海报数量
            preloadCount: options.preloadCount || 2, // 预加载数量
        };
        // DOM 元素
        this.container = null;
        this.currentLayer = null;
        this.nextLayer = null;
        this.overlay = null;
        this.lockedIndicator = null;
        // 状态
        this.posters = []; // 海报列表 [{id, name, poster, logo}]
        this.currentIndex = 0; // 当前播放索引
        this.lockedTaskId = null; // 锁定的任务ID
        this.rotationTimer = null; // 轮换定时器
        this.isActive = false; // 是否激活
        this.isInitialized = false; // 是否已初始化
        // 性能优化
        this.preloadedImages = new Map(); // 预加载的图片缓存
        this.visibilityObserver = null; // 视口观察器
        // 绑定方法
        this.handleClick = this.handleClick.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        // 初始化
        this.init();
    }
    /**
     * 初始化
     */
    init() {
        if (this.isInitialized)
            return;
        // 创建 DOM 结构
        this.createDOM();
        // 绑定事件
        this.bindEvents();
        // 监听主题变化
        this.watchTheme();
        this.isInitialized = true;
        // 如果当前已经是影院模式，立即激活
        if (document.documentElement.getAttribute('data-theme') === 'cinema') {
            this.activate();
        }
    }
    /**
     * 创建 DOM 结构
     */
    createDOM() {
        // 创建背景容器
        this.container = document.createElement('div');
        this.container.id = 'cinemaBackground';
        this.container.className = 'cinema-bg-container';
        this.container.setAttribute('aria-hidden', 'true');
        // 创建双缓冲图层
        this.currentLayer = document.createElement('div');
        this.currentLayer.className = 'cinema-bg-layer cinema-bg-current';
        this.nextLayer = document.createElement('div');
        this.nextLayer.className = 'cinema-bg-layer cinema-bg-next';
        // 创建遮罩层
        this.overlay = document.createElement('div');
        this.overlay.className = 'cinema-bg-overlay';
        // 组装 DOM
        this.container.appendChild(this.currentLayer);
        this.container.appendChild(this.nextLayer);
        this.container.appendChild(this.overlay);
        // 插入到 body 开头
        document.body.insertBefore(this.container, document.body.firstChild);
        // 创建锁定指示器
        this.lockedIndicator = document.createElement('div');
        this.lockedIndicator.id = 'cinemaLockedIndicator';
        this.lockedIndicator.className = 'cinema-locked-indicator';
        this.lockedIndicator.innerHTML = `
            <i class="ph ph-lock-simple"></i>
            <span class="cinema-locked-text">已锁定</span>
        `;
        document.body.appendChild(this.lockedIndicator);
    }
    /**
     * 绑定事件
     */
    bindEvents() {
        // 点击事件（委托）
        document.addEventListener('click', this.handleClick);
        // 页面可见性变化
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        // 锁定指示器点击关闭
        if (this.lockedIndicator) {
            this.lockedIndicator.addEventListener('click', (e) => {
                e.stopPropagation();
                this.unlock();
            });
        }
    }
    /**
     * 监听主题变化
     */
    watchTheme() {
        // 创建 MutationObserver 监听 data-theme 属性变化
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'data-theme') {
                    const newTheme = document.documentElement.getAttribute('data-theme');
                    if (newTheme === 'cinema') {
                        this.activate();
                    }
                    else {
                        this.deactivate();
                    }
                }
            });
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    }
    /**
     * 激活影院模式
     */
    activate() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isActive)
                return;
            console.log('[CinemaBackground] 激活影院模式');
            this.isActive = true;
            // 加载海报列表
            yield this.loadPosters();
            console.log('[CinemaBackground] 海报数量:', this.posters.length);
            // 如果有海报，开始轮换
            if (this.posters.length >= this.config.minPosters) {
                this.container.classList.remove('no-posters');
                this.startRotation();
            }
            else {
                // 无海报时显示默认渐变背景
                console.log('[CinemaBackground] 无海报，显示默认渐变背景');
                this.container.classList.add('no-posters');
            }
        });
    }
    /**
     * 停用影院模式
     */
    deactivate() {
        if (!this.isActive)
            return;
        this.isActive = false;
        this.stopRotation();
        this.unlock();
    }
    /**
     * 加载任务海报列表
     */
    loadPosters() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const response = yield fetch('/api/tasks?status=all&search=');
                const data = yield response.json();
                console.log('[CinemaBackground] 任务数据:', (_a = data.data) === null || _a === void 0 ? void 0 : _a.length, '个任务');
                if (data.success && Array.isArray(data.data)) {
                    // 使用 enrichTaskTmdb 异步加载 TMDB 信息（与任务卡片相同的方式）
                    const loadPromises = data.data.map(task => {
                        return new Promise((resolve) => {
                            // 检查是否已有 tmdbContent
                            if (task.tmdbContent) {
                                resolve(task);
                                return;
                            }
                            // 尝试从缓存获取
                            if (typeof taskTmdbCache !== 'undefined' && taskTmdbCache.has(task.id)) {
                                task.tmdbContent = JSON.stringify(taskTmdbCache.get(task.id));
                                resolve(task);
                                return;
                            }
                            // 使用 enrichTaskTmdb 异步加载
                            if (typeof enrichTaskTmdb === 'function') {
                                enrichTaskTmdb(task);
                                // 等待一小段时间让异步加载完成
                                setTimeout(() => resolve(task), 100);
                            }
                            else {
                                resolve(task);
                            }
                        });
                    });
                    // 等待所有任务加载完成（最多等待 2 秒）
                    yield Promise.race([
                        Promise.all(loadPromises),
                        new Promise(resolve => setTimeout(resolve, 2000))
                    ]);
                    // 再等待一下让 enrichTaskTmdb 完成异步加载
                    yield new Promise(resolve => setTimeout(resolve, 500));
                    // 调试：检查有 tmdbContent 的任务数量
                    const tasksWithTmdb = data.data.filter(task => task.tmdbContent);
                    console.log('[CinemaBackground] 有 tmdbContent 的任务:', tasksWithTmdb.length, '个');
                    // 调试：检查第一个任务的 tmdbContent 结构
                    if (tasksWithTmdb.length > 0) {
                        const firstTask = tasksWithTmdb[0];
                        console.log('[CinemaBackground] 第一个任务示例:', {
                            id: firstTask.id,
                            resourceName: firstTask.resourceName,
                            tmdbContent: firstTask.tmdbContent
                        });
                    }
                    this.posters = data.data
                        .filter(task => task.tmdbContent)
                        .map(task => ({
                        id: task.id,
                        name: task.resourceName || task.shareFolderName || '未命名任务',
                        poster: this.extractPoster(task),
                        logo: this.extractLogo(task)
                    }))
                        .filter(p => p.poster);
                    console.log('[CinemaBackground] 提取到海报:', this.posters.length, '张');
                    // 预加载前几张海报
                    this.preloadImages();
                }
            }
            catch (error) {
                console.warn('[CinemaBackground] 加载海报失败:', error);
                this.posters = [];
            }
        });
    }
    /**
     * 从任务数据中提取海报 URL
     *
     * TMDB 字段说明（v1.1 更新）：
     * - backdropPath: 横版背景图，最适合作为页面背景（优先使用）
     * - posterPath: 竖版海报图，适合作为卡片缩略图
     * - logoPath: 影视Logo透明图，可用于锁定指示器增强显示
     */
    extractPoster(task) {
        // 优先使用 tmdbContent 中的背景图
        if (task.tmdbContent) {
            try {
                const tmdb = typeof task.tmdbContent === 'string'
                    ? JSON.parse(task.tmdbContent)
                    : task.tmdbContent;
                // 优先使用 backdropPath（横版背景图，更适合作为页面背景）
                if (tmdb.backdropPath) {
                    return tmdb.backdropPath;
                }
                // 其次使用 posterPath（竖版海报）
                if (tmdb.posterPath) {
                    return tmdb.posterPath;
                }
            }
            catch (e) {
                console.warn('[CinemaBackground] 解析 tmdbContent 失败:', e);
            }
        }
        // 兼容旧数据：直接使用 posterPath 字段
        if (task.posterPath) {
            return task.posterPath;
        }
        return null;
    }
    /**
     * 从任务数据中提取 Logo URL（可选增强功能）
     * 可用于锁定指示器中显示影视 Logo
     */
    extractLogo(task) {
        if (task.tmdbContent) {
            try {
                const tmdb = typeof task.tmdbContent === 'string'
                    ? JSON.parse(task.tmdbContent)
                    : task.tmdbContent;
                return tmdb.logoPath || null;
            }
            catch (e) { }
        }
        return null;
    }
    /**
     * 预加载图片
     */
    preloadImages() {
        const preloadCount = Math.min(this.config.preloadCount, this.posters.length);
        for (let i = 0; i < preloadCount; i++) {
            const poster = this.posters[i];
            if (poster && !this.preloadedImages.has(poster.id)) {
                const img = new Image();
                img.src = poster.poster;
                this.preloadedImages.set(poster.id, img);
            }
        }
    }
    /**
     * 开始轮换
     */
    startRotation() {
        if (this.posters.length === 0)
            return;
        this.stopRotation();
        // 立即显示第一张
        this.showNextPoster();
        // 启动定时器
        this.rotationTimer = setInterval(() => {
            if (!this.lockedTaskId && this.isActive) {
                this.showNextPoster();
            }
        }, this.config.rotationInterval);
    }
    /**
     * 停止轮换
     */
    stopRotation() {
        if (this.rotationTimer) {
            clearInterval(this.rotationTimer);
            this.rotationTimer = null;
        }
    }
    /**
     * 暂停轮换（保持当前状态）
     */
    pauseRotation() {
        this.stopRotation();
    }
    /**
     * 恢复轮换
     */
    resumeRotation() {
        if (this.isActive && !this.lockedTaskId) {
            this.startRotation();
        }
    }
    /**
     * 显示下一张海报（双缓冲过渡）
     */
    showNextPoster() {
        if (this.posters.length === 0)
            return;
        const poster = this.posters[this.currentIndex];
        if (!poster || !poster.poster) {
            this.advanceIndex();
            return;
        }
        console.log('[CinemaBackground] 显示海报:', poster.name, poster.poster);
        // 设置下一帧图片
        this.nextLayer.style.backgroundImage = `url('${poster.poster}')`;
        // 触发过渡动画
        requestAnimationFrame(() => {
            this.nextLayer.style.opacity = '1';
            this.currentLayer.style.opacity = '0';
            // 过渡完成后交换图层
            setTimeout(() => {
                [this.currentLayer, this.nextLayer] = [this.nextLayer, this.currentLayer];
                this.currentLayer.classList.add('cinema-bg-current');
                this.currentLayer.classList.remove('cinema-bg-next');
                this.nextLayer.classList.add('cinema-bg-next');
                this.nextLayer.classList.remove('cinema-bg-current');
            }, this.config.transitionDuration);
        });
        // 预加载下一张
        this.preloadNext();
        // 更新索引
        this.advanceIndex();
    }
    /**
     * 推进索引
     */
    advanceIndex() {
        this.currentIndex = (this.currentIndex + 1) % this.posters.length;
    }
    /**
     * 预加载下一张图片
     */
    preloadNext() {
        const nextIndex = (this.currentIndex + 1) % this.posters.length;
        const nextPoster = this.posters[nextIndex];
        if (nextPoster && !this.preloadedImages.has(nextPoster.id)) {
            const img = new Image();
            img.src = nextPoster.poster;
            this.preloadedImages.set(nextPoster.id, img);
        }
    }
    /**
     * 锁定指定任务海报
     */
    lockToTask(taskId) {
        const task = this.posters.find(p => p.id === parseInt(taskId));
        if (!task)
            return;
        this.lockedTaskId = taskId;
        // 暂停轮换
        this.stopRotation();
        // 显示锁定海报
        this.nextLayer.style.backgroundImage = `url('${task.poster}')`;
        requestAnimationFrame(() => {
            this.nextLayer.style.opacity = '1';
            this.currentLayer.style.opacity = '0';
            setTimeout(() => {
                [this.currentLayer, this.nextLayer] = [this.nextLayer, this.currentLayer];
                this.currentLayer.classList.add('cinema-bg-current');
                this.currentLayer.classList.remove('cinema-bg-next');
                this.nextLayer.classList.add('cinema-bg-next');
                this.nextLayer.classList.remove('cinema-bg-current');
            }, this.config.transitionDuration);
        });
        // 显示锁定指示器
        this.showLockedIndicator(task.name);
    }
    /**
     * 解除锁定
     */
    unlock() {
        if (!this.lockedTaskId)
            return;
        this.lockedTaskId = null;
        this.hideLockedIndicator();
        // 恢复轮换
        if (this.isActive) {
            this.startRotation();
        }
    }
    /**
     * 显示锁定指示器
     */
    showLockedIndicator(taskName) {
        const textEl = this.lockedIndicator.querySelector('.cinema-locked-text');
        if (textEl) {
            textEl.textContent = `已锁定: ${taskName}`;
        }
        this.lockedIndicator.classList.add('show');
    }
    /**
     * 隐藏锁定指示器
     */
    hideLockedIndicator() {
        this.lockedIndicator.classList.remove('show');
    }
    /**
     * 处理点击事件
     */
    handleClick(e) {
        if (!this.isActive)
            return;
        // 检查是否点击了任务卡片
        const taskCard = e.target.closest('.media-wall-card');
        if (taskCard && taskCard.dataset.taskId) {
            const clickedTaskId = taskCard.dataset.taskId;
            // 移动端：只切换简介显示，不处理锁定逻辑
            if (this.isMobile()) {
                this.toggleCardOverview(taskCard);
                return;
            }
            // 桌面端：如果点击的是当前已锁定的任务，则解除锁定
            if (this.lockedTaskId == clickedTaskId) {
                this.unlock();
                return;
            }
            // 桌面端：点击任务卡片 - 锁定海报
            this.lockToTask(clickedTaskId);
        }
        else if (!e.target.closest('.sidebar') &&
            !e.target.closest('.topbar') &&
            !e.target.closest('.modal') &&
            !e.target.closest('.cinema-locked-indicator') &&
            !e.target.closest('.theme-dropdown') &&
            !e.target.closest('.notification-dropdown') &&
            !e.target.closest('.media-btn-circle') && // 不在点击操作按钮时解锁
            !e.target.closest('.media-actions')) {
            // 点击空白区域 - 解除锁定
            this.unlock();
            // 移动端：同时清除所有卡片的简介展开状态
            if (this.isMobile()) {
                document.querySelectorAll('.media-wall-card.overview-expanded').forEach(c => {
                    c.classList.remove('overview-expanded');
                    const overview = c.querySelector('.media-card-hover-overview');
                    if (overview)
                        overview.style.opacity = '0';
                });
            }
        }
    }
    /**
     * 检测是否为移动设备
     */
    isMobile() {
        return window.innerWidth <= 768 || ('ontouchstart' in window);
    }
    /**
     * 切换卡片简介显示状态（移动端专用）
     */
    toggleCardOverview(card) {
        const overview = card.querySelector('.media-card-hover-overview');
        if (!overview)
            return;
        // 清除其他卡片的展开状态
        document.querySelectorAll('.media-wall-card.overview-expanded').forEach(c => {
            if (c !== card) {
                c.classList.remove('overview-expanded');
                const otherOverview = c.querySelector('.media-card-hover-overview');
                if (otherOverview) {
                    otherOverview.style.opacity = '0';
                }
            }
        });
        // 切换当前卡片
        const isExpanded = card.classList.toggle('overview-expanded');
        overview.style.opacity = isExpanded ? '1' : '0';
    }
    /**
     * 处理页面可见性变化
     */
    handleVisibilityChange() {
        if (document.hidden) {
            this.pauseRotation();
        }
        else if (this.isActive && !this.lockedTaskId) {
            this.resumeRotation();
        }
    }
    /**
     * 刷新海报列表（任务变化时调用）
     */
    refresh() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadPosters();
            if (this.isActive && !this.lockedTaskId) {
                this.startRotation();
            }
        });
    }
    /**
     * 销毁实例
     */
    destroy() {
        this.deactivate();
        // 移除事件监听
        document.removeEventListener('click', this.handleClick);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        // 移除 DOM
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        if (this.lockedIndicator && this.lockedIndicator.parentNode) {
            this.lockedIndicator.parentNode.removeChild(this.lockedIndicator);
        }
        // 清理缓存
        this.preloadedImages.clear();
        this.posters = [];
        this.isInitialized = false;
    }
}
// 导出单例
let cinemaBackgroundInstance = null;
/**
 * 初始化影院背景
 */
function initCinemaBackground() {
    console.log('[CinemaBackground] initCinemaBackground 被调用');
    if (!cinemaBackgroundInstance) {
        cinemaBackgroundInstance = new CinemaBackground();
    }
    return cinemaBackgroundInstance;
}
/**
 * 获取影院背景实例
 */
function getCinemaBackground() {
    return cinemaBackgroundInstance;
}
/**
 * 刷新影院背景海报列表
 */
function refreshCinemaBackground() {
    if (cinemaBackgroundInstance) {
        cinemaBackgroundInstance.refresh();
    }
}
/**
 * 清理影院背景（从 cinema 切换到其他主题时调用）
 */
function cleanupCinemaBackground() {
    console.log('[CinemaBackground] cleanupCinemaBackground 被调用');
    if (cinemaBackgroundInstance) {
        cinemaBackgroundInstance.destroy();
        cinemaBackgroundInstance = null;
    }
}
