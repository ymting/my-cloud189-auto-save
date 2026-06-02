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
class WeworkService extends MessageService {
    /**
     * 检查服务是否启用
     * @returns {boolean}
     */
    checkEnabled() {
        return !!this.config.webhook;
    }
    /**
     * 实际发送消息
     * @param {string} message - 要发送的消息内容
     * @returns {Promise<boolean>} - 发送结果
     */
    _send(message) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield got.post(this.config.webhook, {
                    json: {
                        msgtype: 'text',
                        text: {
                            content: message
                        }
                    }
                }).json();
                return true;
            }
            catch (error) {
                console.error('企业微信消息推送异常:', error);
                return false;
            }
        });
    }
    _sendScrapeMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const description = message.description
                    ? `${message.description.split('\n').slice(0, 2).join('\n')}${message.description.split('\n').length > 2 ? '...' : ''}`
                    : '';
                yield got.post(this.config.webhook, {
                    json: {
                        msgtype: 'news',
                        news: {
                            articles: [{
                                    title: message.title,
                                    description: `类型：${message.type === 'tv' ? '电视剧' : '电影'} 评分：${message.rating || '暂无'}\n${description}`,
                                    picurl: message.image
                                }]
                        }
                    }
                }).json();
                return true;
            }
            catch (error) {
                console.error('企业微信图片消息推送异常:', error);
                return false;
            }
        });
    }
}
module.exports = WeworkService;
