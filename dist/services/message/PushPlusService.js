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
const got = require('got');
const MessageService = require('./MessageService');
class PushPlusService extends MessageService {
    /**
     * 检查服务是否启用
     * @returns {boolean}
     */
    checkEnabled() {
        return !!this.config.token;
    }
    /**
     * 实际发送消息
     * @param {string} message - 要发送的消息内容
     * @returns {Promise<boolean>} - 发送结果
     */
    _send(message) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const msg = yield this.convertToMarkdown(message);
                yield got.post('http://www.pushplus.plus/send', {
                    json: {
                        token: this.config.token,
                        // title: '天翼云盘更新',
                        content: msg,
                        template: 'markdown',
                        topic: this.config.topic || '', // 群组编码，不填仅发送给自己
                        channel: this.config.channel || 'wechat', // 推送渠道，默认微信公众号
                        webhook: this.config.webhook || '', // webhook编码
                        to: this.config.to || '' // 指定接收者的token
                    }
                }).json();
                return true;
            }
            catch (error) {
                console.error('PushPlus消息推送异常:', error);
                return false;
            }
        });
    }
    /**
     * 发送刮削消息
     * @param {object} message - 要发送的消息内容
     * @returns {Promise<boolean>} - 发送结果
     */
    _sendScrapeMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const content = [
                    `# ${message.title}`,
                    `类型：${message.type === 'tv' ? '电视剧' : '电影'} 评分：${message.rating || '暂无'}`,
                    message.description ? `${message.description.split('\n').slice(0, 2).join('\n')}${message.description.split('\n').length > 2 ? '...' : ''}` : '',
                    message.image ? `![封面](${message.image})` : ''
                ].join('\n\n');
                yield got.post('http://www.pushplus.plus/send', {
                    json: {
                        token: this.config.token,
                        title: message.title,
                        content: content,
                        template: 'markdown',
                        topic: this.config.topic || '',
                        channel: this.config.channel || 'wechat',
                        webhook: this.config.webhook || '',
                        to: this.config.to || ''
                    }
                }).json();
                return true;
            }
            catch (error) {
                console.error('PushPlus图片消息推送异常:', error);
                return false;
            }
        });
    }
}
module.exports = PushPlusService;
