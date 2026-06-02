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
const messageManager = require('./message/MessageManager');
const ConfigService = require('./ConfigService');
class MessageUtil {
    constructor() {
        this._init();
    }
    _init() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w;
        const settings = ConfigService.getConfig();
        // 初始化消息推送配置
        messageManager.initialize({
            wework: {
                enabled: ((_a = settings.wecom) === null || _a === void 0 ? void 0 : _a.enable) || false,
                webhook: ((_b = settings.wecom) === null || _b === void 0 ? void 0 : _b.webhook) || '',
            },
            telegram: {
                enabled: ((_c = settings.telegram) === null || _c === void 0 ? void 0 : _c.enable) || false,
                botToken: ((_d = settings.telegram) === null || _d === void 0 ? void 0 : _d.botToken) || '',
                chatId: ((_e = settings.telegram) === null || _e === void 0 ? void 0 : _e.chatId) || '',
                proxy: {
                    type: "http",
                    host: ((_f = settings.proxy) === null || _f === void 0 ? void 0 : _f.host) || '',
                    port: ((_g = settings.proxy) === null || _g === void 0 ? void 0 : _g.port) || '',
                    username: ((_h = settings.proxy) === null || _h === void 0 ? void 0 : _h.username) || '',
                    password: ((_j = settings.proxy) === null || _j === void 0 ? void 0 : _j.password) || ''
                },
                cfProxyDomain: ((_k = settings.telegram) === null || _k === void 0 ? void 0 : _k.proxyDomain) || ''
            },
            wxpusher: {
                enabled: ((_l = settings.wxpusher) === null || _l === void 0 ? void 0 : _l.enable) || false,
                spt: ((_m = settings.wxpusher) === null || _m === void 0 ? void 0 : _m.spt) || ''
            },
            bark: {
                enabled: ((_o = settings.bark) === null || _o === void 0 ? void 0 : _o.enable) || false,
                serverUrl: ((_p = settings.bark) === null || _p === void 0 ? void 0 : _p.serverUrl) || '',
                key: ((_q = settings.bark) === null || _q === void 0 ? void 0 : _q.key) || '',
            },
            pushplus: {
                enabled: ((_r = settings.pushplus) === null || _r === void 0 ? void 0 : _r.enable) || false,
                token: ((_s = settings.pushplus) === null || _s === void 0 ? void 0 : _s.token) || '',
                topic: ((_t = settings.pushplus) === null || _t === void 0 ? void 0 : _t.topic) || '',
                channel: ((_u = settings.pushplus) === null || _u === void 0 ? void 0 : _u.channel) || '',
                webhook: ((_v = settings.pushplus) === null || _v === void 0 ? void 0 : _v.webhook) || '',
                to: ((_w = settings.pushplus) === null || _w === void 0 ? void 0 : _w.to) || '',
            },
            customPush: settings.customPush || []
        });
    }
    updateConfig() {
        return __awaiter(this, void 0, void 0, function* () {
            this._init();
        });
    }
    // 发送消息
    sendMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
            yield messageManager.sendMessage(message);
        });
    }
    // 发送刮削消息
    sendScrapeMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
            yield messageManager.sendScrapeMessage(message);
        });
    }
}
module.exports = { MessageUtil };
