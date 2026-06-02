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
const WeworkService = require('./WeworkService');
const TelegramService = require('./TelegramService');
const WxPusherService = require('./WxPusherService');
const BarkService = require('./BarkService');
const PushPlusService = require('./PushPlusService');
const CustomPushService = require('./CustomPushService');
class MessageManager {
    constructor() {
        this.services = [];
    }
    /**
     * 初始化消息服务
     * @param {Object} config - 配置对象
     */
    initialize(config) {
        var _a, _b, _c, _d, _e;
        // 清空现有服务
        this.services = [];
        // 企业微信配置
        if ((_a = config.wework) === null || _a === void 0 ? void 0 : _a.enabled) {
            const weworkService = new WeworkService({
                webhook: config.wework.webhook
            });
            weworkService.initialize();
            this.services.push(weworkService);
        }
        // Telegram配置
        if ((_b = config.telegram) === null || _b === void 0 ? void 0 : _b.enabled) {
            const telegramService = new TelegramService({
                botToken: config.telegram.botToken,
                chatId: config.telegram.chatId,
                proxy: config.telegram.proxy,
                cfProxyDomain: config.telegram.cfProxyDomain
            });
            telegramService.initialize();
            this.services.push(telegramService);
        }
        // WxPusher配置
        if ((_c = config.wxpusher) === null || _c === void 0 ? void 0 : _c.enabled) {
            const wxPusherService = new WxPusherService({
                spt: config.wxpusher.spt
            });
            wxPusherService.initialize();
            this.services.push(wxPusherService);
        }
        // Bark配置
        if ((_d = config.bark) === null || _d === void 0 ? void 0 : _d.enabled) {
            const barkService = new BarkService({
                serverUrl: config.bark.serverUrl,
                key: config.bark.key
            });
            barkService.initialize();
            this.services.push(barkService);
        }
        // PushPlus配置
        if ((_e = config.pushplus) === null || _e === void 0 ? void 0 : _e.enabled) {
            const pushPlusService = new PushPlusService(config.pushplus);
            pushPlusService.initialize();
            this.services.push(pushPlusService);
        }
        // 自定义推送
        this.services.push(new CustomPushService(config.customPush));
    }
    /**
     * 发送消息到所有已启用的服务
     * @param {string} message - 要发送的消息内容
     * @returns {Promise<Array<boolean>>} - 各个服务的发送结果
     */
    sendMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
            const results = yield Promise.all(this.services.map(service => service.sendMessage(message)));
            return results;
        });
    }
    /**
     * 发送刮削消息到所有已启用的服务
     * @param {string} message - 要发送的消息内容
     * @returns {Promise<Array<boolean>>} - 各个服务的发送结果
     */
    sendScrapeMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
            const results = yield Promise.all(this.services.map(service => service.sendScrapeMessage(message)));
            return results;
        });
    }
}
module.exports = new MessageManager();
