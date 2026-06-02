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
function showAIChat() {
    document.getElementById('aiChatModal').style.display = 'block';
    scrollToBottom();
}
function closeAIChat() {
    document.getElementById('aiChatModal').style.display = 'none';
}
function scrollToBottom() {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
function addMessage(content, isUser = false, type = 'text') {
    const messagesDiv = document.getElementById('chatMessages');
    if (isUser) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'user-message';
        const contentDiv = document.createElement('div');
        contentDiv.className = 'user-message-content';
        contentDiv.textContent = content;
        messageDiv.appendChild(contentDiv);
        messagesDiv.appendChild(messageDiv);
    }
    else {
        if (content === '[END]') {
            return;
        }
        if (type === 'operation_result') {
            addOperationResultMessage(content);
            return;
        }
        if (type === 'task_preview') {
            addTaskPreviewMessage(content);
            return;
        }
        if (type === 'confirmation') {
            addConfirmationMessage(content);
            return;
        }
        const lastMessage = messagesDiv.lastElementChild;
        if (lastMessage && lastMessage.classList.contains('ai-message')) {
            const contentDiv = lastMessage.querySelector('.ai-message-content');
            if (contentDiv) {
                contentDiv.textContent += content;
            }
        }
        else {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'ai-message';
            const contentDiv = document.createElement('div');
            contentDiv.className = 'ai-message-content';
            contentDiv.textContent = content;
            messageDiv.appendChild(contentDiv);
            messagesDiv.appendChild(messageDiv);
        }
    }
    scrollToBottom();
}
function addOperationResultMessage(result) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'ai-message';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'ai-message-content operation-result';
    if (result.success) {
        contentDiv.innerHTML = `
            <div class="result-header">
                <span class="result-icon">✅</span>
                <span class="result-title">${result.message || '操作成功'}</span>
            </div>
            ${result.tasks && result.tasks.length > 0 ? renderTaskList(result.tasks) : ''}
        `;
    }
    else {
        contentDiv.innerHTML = `
            <div class="result-header">
                <span class="result-icon">❌</span>
                <span class="result-title">操作失败</span>
            </div>
            <div class="error-message">${result.error || '未知错误'}</div>
        `;
    }
    messageDiv.appendChild(contentDiv);
    messagesDiv.appendChild(messageDiv);
    scrollToBottom();
}
function renderTaskList(tasks) {
    return `
        <div class="task-list">
            ${tasks.map(task => `
                <div class="ai-task-card" onclick="showTaskDetail(${task.id})">
                    <div class="task-header">
                        <span class="task-id">#${task.id}</span>
                        <span class="task-status ${task.status}">${getStatusText(task.status)}</span>
                    </div>
                    <div class="task-name">${task.resourceName || '未命名'}</div>
                    <div class="task-info">
                        <span>创建时间：${formatDate(task.createdAt)}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}
function addTaskPreviewMessage(preview) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'ai-message';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'ai-message-content task-preview';
    contentDiv.innerHTML = `
        <div class="preview-header">
            <span class="preview-icon">📦</span>
            <span class="preview-title">检测到分享链接</span>
        </div>
        <div class="preview-body">
            <div class="preview-item">
                <span class="label">资源名称：</span>
                <span class="value">${preview.resourceName}</span>
            </div>
            <div class="preview-item">
                <span class="label">资源类型：</span>
                <span class="value">${preview.videoType || '未知'}</span>
            </div>
            <div class="preview-item">
                <span class="label">推荐路径：</span>
                <span class="value">${preview.suggestedPath}</span>
            </div>
            ${preview.needPassword ? '<div class="preview-warning">⚠️ 此链接可能需要密码</div>' : ''}
        </div>
        <div class="preview-footer">
            <button class="btn-confirm-task" onclick="confirmTaskPreview()">确认创建</button>
            <button class="btn-cancel" onclick="cancelTaskPreview()">取消</button>
        </div>
    `;
    messageDiv.appendChild(contentDiv);
    messagesDiv.appendChild(messageDiv);
    window.currentTaskPreview = preview;
    scrollToBottom();
}
function getStatusText(status) {
    const texts = {
        'pending': '等待中',
        'active': '执行中',
        'completed': '已完成',
        'failed': '失败',
        'paused': '已暂停'
    };
    return texts[status] || status;
}
function formatDate(dateStr) {
    if (!dateStr)
        return '未知';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}
function confirmTaskPreview() {
    return __awaiter(this, void 0, void 0, function* () {
        const preview = window.currentTaskPreview;
        if (!preview) {
            addMessage('没有待确认的任务', false);
            return;
        }
        try {
            const response = yield fetch('/api/chat/confirm-preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ preview })
            });
            const result = yield response.json();
            if (result.success) {
                addMessage(`✅ 任务创建成功！任务ID: ${result.taskId}`, false, 'operation_result');
            }
            else {
                addMessage(`❌ 创建失败：${result.error}`, false);
            }
        }
        catch (error) {
            addMessage(`❌ 创建失败：${error.message}`, false);
        }
        window.currentTaskPreview = null;
    });
}
function cancelTaskPreview() {
    window.currentTaskPreview = null;
    addMessage('已取消创建任务', false);
}
let pendingOperation = null;
function handleFunctionCall(functionCall) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('[AI聊天] 处理Function Call:', functionCall);
        const { name, arguments: args } = functionCall;
        try {
            const response = yield fetch('/api/chat/execute-function', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    operation: name,
                    params: args
                })
            });
            const result = yield response.json();
            console.log('[AI聊天] Function执行结果:', result);
            if (result.type === 'confirmation_required') {
                pendingOperation = { name, args };
                const dialogResult = yield window.aiConfirmDialog.show(result.dialog);
                if (dialogResult.confirmed) {
                    const confirmResponse = yield fetch('/api/chat/confirm', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            operation: name,
                            params: args,
                            confirmed: true
                        })
                    });
                    const confirmResult = yield confirmResponse.json();
                    addMessage(confirmResult, false, 'operation_result');
                }
                else {
                    addMessage('操作已取消', false);
                }
            }
            else if (result.type === 'task_preview') {
                addMessage(result, false, 'task_preview');
            }
            else {
                addMessage(result, false, 'operation_result');
            }
        }
        catch (error) {
            console.error('[AI聊天] 执行Function失败:', error);
            addMessage(`❌ 执行失败：${error.message}`, false);
        }
    });
}
document.addEventListener('DOMContentLoaded', function () {
    let chatEventSource = null;
    function connectChatSSE() {
        if (chatEventSource) {
            chatEventSource.close();
        }
        console.log('[AI聊天] 建立SSE连接...');
        chatEventSource = new EventSource('/api/logs/events');
        chatEventSource.onopen = () => {
            console.log('[AI聊天] SSE连接已建立');
        };
        chatEventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('[AI聊天] 收到SSE消息:', data);
                if (data.type === 'aimessage') {
                    addMessage(data.message, false);
                }
            }
            catch (e) {
                console.error('[AI聊天] 解析SSE消息失败:', e);
            }
        };
        chatEventSource.onerror = (error) => {
            console.error('[AI聊天] SSE连接错误:', error);
            chatEventSource.close();
            setTimeout(connectChatSSE, 3000);
        };
    }
    connectChatSSE();
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', function (e) {
            return __awaiter(this, void 0, void 0, function* () {
                if (e.key === 'Enter' && this.value.trim()) {
                    const message = this.value.trim();
                    this.value = '';
                    addMessage(message, true);
                    console.log('[AI聊天] 发送消息:', message);
                    try {
                        const response = yield fetch('/api/chat/enhanced', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ message })
                        });
                        if (!response.ok) {
                            throw new Error('请求失败: ' + response.status);
                        }
                        const result = yield response.json();
                        console.log('[AI聊天] 发送结果:', result);
                        if (result.error && result.error.includes('AI服务未配置')) {
                            addMessage('⚠️ AI服务未启用，请前往「系统设置 → TMDB设置」启用AI重命名功能', false);
                        }
                        else if (result.type === 'function_call') {
                            yield handleFunctionCall(result.functionCall);
                        }
                        else if (result.type === 'task_preview') {
                            addMessage(result, false, 'task_preview');
                        }
                        else if (result.message) {
                            addMessage(result.message, false);
                        }
                    }
                    catch (error) {
                        console.error('[AI聊天] 发送消息失败:', error);
                        addMessage('❌ 发送消息失败：' + error.message, false);
                    }
                }
            });
        });
    }
});
window.onclick = function (event) {
    const modal = document.getElementById('aiChatModal');
    if (event.target === modal) {
        closeAIChat();
    }
};
