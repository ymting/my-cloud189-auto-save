"use strict";
// 导航切换
function initTabs() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            // Remove active from all items
            document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            // Add active to clicked item
            item.classList.add('active');
            // Activate corresponding tab
            const tabId = item.dataset.tab + 'Tab';
            const tabElement = document.getElementById(tabId);
            if (tabElement) {
                tabElement.classList.add('active');
            }
            // Handle sub-tab scrolling in Settings
            if (item.dataset.subTab && tabId === 'settingsTab') {
                const subTabId = item.dataset.subTab;
                document.querySelectorAll('#settingsTab .settings-card').forEach(card => {
                    if (card.dataset.settingGroup === subTabId) {
                        card.style.display = 'block';
                    }
                    else {
                        card.style.display = 'none';
                    }
                });
                document.querySelector('.page-container').scrollTop = 0;
            }
            else if (tabId === 'settingsTab' && !item.dataset.subTab) {
                // 没有sub-tab时，显示所有设置卡片
                document.querySelectorAll('#settingsTab .settings-card').forEach(card => {
                    card.style.display = 'block';
                });
            }
            // 移动端：点击导航后关闭侧边栏
            if (window.innerWidth <= 768) {
                const sidebar = document.querySelector('.sidebar');
                const sidebarOverlay = document.getElementById('sidebarOverlay');
                if (sidebar) {
                    sidebar.classList.remove('open');
                }
                if (sidebarOverlay) {
                    sidebarOverlay.classList.remove('show');
                }
            }
        });
    });
}
