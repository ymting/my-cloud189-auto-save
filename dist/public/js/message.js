"use strict";
class Message {
    constructor() {
        this.container = null;
        this.init();
    }
    init() {
        this.container = document.createElement('div');
        this.container.className = 'message-container';
        document.body.appendChild(this.container);
    }
    show(content, type = 'info', duration = 3000) {
        const messageElement = document.createElement('div');
        messageElement.className = `message message-${type}`;
        messageElement.innerHTML = content;
        this.container.appendChild(messageElement);
        // 自动消失
        setTimeout(() => {
            messageElement.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => {
                this.container.removeChild(messageElement);
            }, 300);
        }, duration);
    }
    success(content, duration) {
        this.show(content, 'success', duration);
    }
    error(content, duration) {
        this.show(content, 'error', duration);
    }
    warning(content, duration) {
        this.show(content, 'warning', duration);
    }
    info(content, duration) {
        this.show(content, 'info', duration);
    }
}
const message = new Message();
