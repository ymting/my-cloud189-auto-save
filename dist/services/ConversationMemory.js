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
const fs = require('fs');
const path = require('path');
const ConfigService = require('./ConfigService');
class ConversationMemory {
    constructor() {
        this.maxHistory = 50;
        this.maxContextTurns = 10;
        this.storagePath = path.join(__dirname, '../data/conversations');
        this._ensureStorage();
    }
    _ensureStorage() {
        if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true });
        }
    }
    addMessage(sessionId_1, role_1, content_1) {
        return __awaiter(this, arguments, void 0, function* (sessionId, role, content, metadata = {}) {
            const conversation = yield this._loadConversation(sessionId);
            const message = Object.assign({ id: Date.now(), role,
                content, timestamp: new Date().toISOString() }, metadata);
            conversation.messages.push(message);
            if (conversation.messages.length > this.maxHistory) {
                conversation.messages = conversation.messages.slice(-this.maxHistory);
            }
            conversation.lastUpdated = new Date().toISOString();
            conversation.messageCount = conversation.messages.length;
            yield this._saveConversation(sessionId, conversation);
            return message;
        });
    }
    getHistory(sessionId_1) {
        return __awaiter(this, arguments, void 0, function* (sessionId, limit = null) {
            const conversation = yield this._loadConversation(sessionId);
            const messages = conversation.messages;
            if (limit) {
                return messages.slice(-limit);
            }
            return messages;
        });
    }
    getContextForAI(sessionId, currentMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            const history = yield this.getHistory(sessionId, this.maxContextTurns);
            const messages = [];
            messages.push({
                role: 'system',
                content: this._buildSystemPrompt()
            });
            history.forEach(msg => {
                if (msg.role === 'user' || msg.role === 'assistant') {
                    messages.push({
                        role: msg.role,
                        content: msg.content
                    });
                }
            });
            messages.push({
                role: 'user',
                content: currentMessage
            });
            return messages;
        });
    }
    _buildSystemPrompt() {
        return `你是一个智能云盘助手，帮助用户管理转存任务。你的核心能力：

1. **智能识别**：识别分享链接并自动创建任务
2. **任务管理**：查询、执行、删除任务
3. **问题诊断**：分析失败任务并提供解决方案
4. **系统监控**：查看系统状态和资源使用情况

**重要规则：**
- 当用户发送分享链接时，使用 smart_create 函数
- 当用户询问任务时，使用 list_tasks 或 get_task_detail 函数
- 当用户要求执行操作时，使用相应的函数
- 始终用中文回复
- 保持简洁专业的语气

当前时间: ${new Date().toLocaleString('zh-CN')}`;
    }
    _loadConversation(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const filePath = path.join(this.storagePath, `${sessionId}.json`);
            try {
                if (fs.existsSync(filePath)) {
                    const data = fs.readFileSync(filePath, 'utf8');
                    return JSON.parse(data);
                }
            }
            catch (error) {
                console.error('加载对话历史失败:', error);
            }
            return {
                sessionId,
                messages: [],
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                messageCount: 0
            };
        });
    }
    _saveConversation(sessionId, conversation) {
        return __awaiter(this, void 0, void 0, function* () {
            const filePath = path.join(this.storagePath, `${sessionId}.json`);
            try {
                fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2), 'utf8');
            }
            catch (error) {
                console.error('保存对话历史失败:', error);
            }
        });
    }
    clearHistory(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const filePath = path.join(this.storagePath, `${sessionId}.json`);
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
            catch (error) {
                console.error('清除对话历史失败:', error);
            }
        });
    }
    getUserPreferences(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const conversation = yield this._loadConversation(sessionId);
            const preferences = {
                frequentOperations: {},
                commonPaths: [],
                taskTypes: { movie: 0, tv: 0 }
            };
            conversation.messages.forEach(msg => {
                if (msg.metadata) {
                    if (msg.metadata.operation) {
                        preferences.frequentOperations[msg.metadata.operation] =
                            (preferences.frequentOperations[msg.metadata.operation] || 0) + 1;
                    }
                    if (msg.metadata.targetPath) {
                        preferences.commonPaths.push(msg.metadata.targetPath);
                    }
                    if (msg.metadata.videoType) {
                        preferences.taskTypes[msg.metadata.videoType]++;
                    }
                }
            });
            preferences.commonPaths = [...new Set(preferences.commonPaths)].slice(-5);
            return preferences;
        });
    }
    getRecentSessions() {
        return __awaiter(this, arguments, void 0, function* (limit = 10) {
            try {
                const files = fs.readdirSync(this.storagePath);
                const sessions = files
                    .filter(f => f.endsWith('.json'))
                    .map(f => {
                    const filePath = path.join(this.storagePath, f);
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    return {
                        sessionId: data.sessionId,
                        messageCount: data.messageCount,
                        lastUpdated: data.lastUpdated
                    };
                })
                    .sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated))
                    .slice(0, limit);
                return sessions;
            }
            catch (error) {
                console.error('获取最近会话失败:', error);
                return [];
            }
        });
    }
}
module.exports = ConversationMemory;
