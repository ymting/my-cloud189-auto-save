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
class WxPusherService extends MessageService {
    /**
     * 检查服务是否启用
     * @returns {boolean}
     */
    checkEnabled() {
        return !!this.config.spt;
    }
    /**
     * 实际发送消息
     * @param {string} message - 要发送的消息内容
     * @returns {Promise<boolean>} - 发送结果
     */
    _send(message) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const url = "https://wxpusher.zjiecode.com/api/send/message/simple-push";
                const msg = yield this.convertToMarkdown(message);
                const data = {
                    // summary: "天翼云盘更新",
                    content: msg,
                    content_type: 3,
                    spt: this.config.spt
                };
                const resp = yield got.post(url, {
                    json: data
                }).json();
                return true;
            }
            catch (error) {
                console.error('WxPusher消息推送异常:', error);
                return false;
            }
        });
    }
    _sendScrapeMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const content = [
                    `<h3>${message.title}</h3>`,
                    `<p>类型：${message.type === 'tv' ? '电视剧' : '电影'} 评分：${message.rating || '暂无'}</p>`,
                    message.description ? `<p>${message.description.split('\n').slice(0, 2).join('<br>')}${message.description.split('\n').length > 2 ? '...' : ''}</p>` : '',
                    message.image ? `<img src="${message.image}" alt="封面">` : ''
                ].join('');
                yield got.post('https://wxpusher.zjiecode.com/api/send/message/simple-push', {
                    json: {
                        summary: message.title,
                        content: content,
                        content_type: 2, // HTML类型
                        spt: this.config.spt
                    }
                }).json();
                return true;
            }
            catch (error) {
                console.error('WxPusher图片消息推送异常:', error);
                return false;
            }
        });
    }
}
module.exports = WxPusherService;
