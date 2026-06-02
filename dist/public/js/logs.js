"use strict";
function initLogs() {
    const logsContainer = document.getElementById('logsContainer');
    const showLogsBtn = document.getElementById('showLogsBtn');
    const logsModal = document.getElementById('logsModal');
    const closeBtn = logsModal.querySelector('.close-btn');
    let eventSource = null;
    const MAX_VISIBLE_ITEMS = 100; // 同时显示的最大日志数量
    function connectSSE() {
        eventSource = new EventSource('/api/logs/events');
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            // 分发事件
            const customEvent = new CustomEvent('sseMessage', { detail: data });
            document.dispatchEvent(customEvent);
            if (data.type === 'history') {
                logsContainer.innerHTML = data.logs.join('<br>');
                logsContainer.scrollTop = logsContainer.scrollHeight;
            }
            else if (data.type === 'log') {
                const div = document.createElement('div');
                div.textContent = data.message;
                logsContainer.appendChild(div);
                // 如果日志数量超过限制，移除最旧的日志
                if (logsContainer.children.length > MAX_VISIBLE_ITEMS) {
                    logsContainer.removeChild(logsContainer.firstChild);
                }
                logsContainer.scrollTop = logsContainer.scrollHeight;
            }
        };
        eventSource.onerror = () => {
            eventSource.close();
            setTimeout(connectSSE, 1000);
        };
    }
    // 日志按钮已合并到通知菜单，这里不再需要单独绑定
    if (showLogsBtn) {
        showLogsBtn.onclick = () => {
            logsModal.style.display = 'block';
            if (!eventSource) {
                connectSSE();
            }
            logsContainer.scrollTop = logsContainer.scrollHeight;
        };
    }
    closeBtn.onclick = () => {
        logsModal.style.display = 'none';
    };
    // 页面关闭时才断开连接
    window.addEventListener('beforeunload', () => {
        if (eventSource) {
            eventSource.close();
        }
    });
    // 延迟连接 SSE，防止阻塞浏览器的 load 事件导致标签页一直转圈
    if (document.readyState === 'complete') {
        setTimeout(connectSSE, 500);
    }
    else {
        window.addEventListener('load', () => {
            setTimeout(() => {
                if (!eventSource)
                    connectSSE();
            }, 500);
        });
    }
}
