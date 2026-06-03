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
/**
 * 消息推送服务接口基类
 */
class MessageService {
    constructor(config) {
        this.config = config;
        this.enabled = false;
    }
    /**
     * 初始化服务
     */
    initialize() {
        this.enabled = this.checkEnabled();
    }
    /**
     * 检查服务是否启用
     * @returns {boolean}
     */
    checkEnabled() {
        return false;
    }
    /**
     * 发送消息
     * @param {string} message - 要发送的消息内容
     * @returns {Promise<boolean>} - 发送结果
     */
    sendMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.enabled) {
                return false;
            }
            return yield this._send(message);
        });
    }
    /**
     * 发送刮削消息
     * @param {object} message - 要发送的消息内容
     * @returns {Promise<boolean>} - 发送结果
     */
    sendScrapeMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.enabled) {
                return false;
            }
            return yield this._sendScrapeMessage(message);
        });
    }
    /**
     * 实际发送消息的方法，需要被子类实现
     * @param {string} message - 要发送的消息内容
     * @returns {Promise<boolean>} - 发送结果
     */
    _send(message) {
        return __awaiter(this, void 0, void 0, function* () {
            throw new Error('_send method must be implemented by subclass');
        });
    }
    /**
     * 实际发送刮削消息的方法，需要被子类实现
     * @param {object} message - 要发送的消息内容
     * @returns {Promise<boolean>} - 发送结果
     */
    _sendScrapeMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
            throw new Error('_sendScrapeMessage method must be implemented by subclass');
        });
    }
    /**
     * 转换消息为标准的markdown格式
     * @param {string} message - 要转换的消息内容
     * @returns {string} - 转换后的消息内容
     */
    convertToMarkdown(message) {
        return __awaiter(this, void 0, void 0, function* () {
            return message
                // 加粗标题
                .replace(/^(.*?)更新/gm, '🎉*$1*更新')
                // 移除 HTML 标签并转换为 Telegram 代码格式
                .replace(/<font color="warning">/g, '`')
                .replace(/<font color="info">/g, '`')
                .replace(/<\/font>/g, '`')
                // 替换引用格式为列表项（确保在新行开始）
                .replace(/>s*/g, '   - ');
        });
    }
}
module.exports = MessageService;
