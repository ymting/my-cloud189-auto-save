"use strict";
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const themeDropdown = document.getElementById('themeDropdown');
    // 默认影院主题
    const savedTheme = localStorage.getItem('theme') || 'cinema';
    // 设置初始主题
    setTheme(savedTheme);
    // 切换下拉菜单显示
    themeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        // 动态设置下拉菜单位置（使用 fixed 定位）
        const rect = themeToggle.getBoundingClientRect();
        themeDropdown.style.right = `${window.innerWidth - rect.right}px`;
        themeDropdown.style.top = `${rect.bottom + 8}px`;
        themeDropdown.classList.toggle('show');
    });
    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', () => {
        themeDropdown.classList.remove('show');
    });
    // 主题选项点击事件
    document.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', (e) => {
            const optionElement = e.currentTarget;
            const theme = optionElement.dataset.theme;
            if (theme) {
                setTheme(theme);
                localStorage.setItem('theme', theme);
            }
            themeDropdown.classList.remove('show');
        });
    });
}
function setTheme(theme) {
    console.log('[Theme] 设置主题:', theme);
    // 获取当前主题，用于判断是否需要清理影院背景
    const previousTheme = document.documentElement.getAttribute('data-theme');
    // 离开 cinema 模式时清理背景
    if (previousTheme === 'cinema' && theme !== 'cinema') {
        if (typeof cleanupCinemaBackground === 'function') {
            console.log('[Theme] 清理影院背景');
            cleanupCinemaBackground();
        }
    }
    // 简化：只有 light 和 cinema 两种主题
    if (theme === 'cinema') {
        console.log('[Theme] 切换到影院模式');
        document.documentElement.setAttribute('data-theme', 'cinema');
        document.querySelector('meta[name="theme-color"]').setAttribute('content', '#0f172a');
        // 初始化影院背景
        if (typeof initCinemaBackground === 'function') {
            console.log('[Theme] 调用 initCinemaBackground');
            initCinemaBackground();
        }
        else {
            console.error('[Theme] initCinemaBackground 函数不存在!');
        }
    }
    else {
        // 默认明亮主题（兼容旧值：dark/auto/未知值都降级为light）
        console.log('[Theme] 切换到明亮模式');
        document.documentElement.setAttribute('data-theme', 'light');
        document.querySelector('meta[name="theme-color"]').setAttribute('content', '#ffffff');
    }
    // 主题切换后重新渲染任务卡片（因为明亮和影院模式使用不同的HTML结构）
    if (previousTheme !== theme && typeof fetchTasks === 'function') {
        console.log('[Theme] 重新渲染任务卡片');
        fetchTasks();
    }
}
