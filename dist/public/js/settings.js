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
let customPushConfigs = [];
function loadSettings() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25, _26, _27, _28, _29, _30, _31, _32, _33, _34, _35, _36, _37, _38, _39, _40, _41, _42, _43, _44, _45, _46, _47, _48, _49, _50, _51, _52, _53, _54, _55, _56, _57, _58, _59, _60, _61, _62, _63, _64, _65, _66, _67, _68, _69, _70;
        try {
            const response = yield fetch('/api/settings');
            const data = yield response.json();
            if (data.success) {
                const settings = data.data;
                // 系统apiKey
                document.getElementById('systemApiKey').value = ((_a = settings.system) === null || _a === void 0 ? void 0 : _a.apiKey) || '';
                // 任务设置
                document.getElementById('taskExpireDays').value = ((_b = settings.task) === null || _b === void 0 ? void 0 : _b.taskExpireDays) || 3;
                document.getElementById('taskCheckCron').value = ((_c = settings.task) === null || _c === void 0 ? void 0 : _c.taskCheckCron) || '0 19-23 * * *';
                document.getElementById('cleanRecycleCron').value = ((_d = settings.task) === null || _d === void 0 ? void 0 : _d.cleanRecycleCron) || '0 */8 * * * ';
                document.getElementById('taskMaxRetries').value = ((_e = settings.task) === null || _e === void 0 ? void 0 : _e.maxRetries) || 3;
                document.getElementById('taskRetryInterval').value = ((_f = settings.task) === null || _f === void 0 ? void 0 : _f.retryInterval) || 300;
                document.getElementById('enableAutoClearRecycle').checked = ((_g = settings.task) === null || _g === void 0 ? void 0 : _g.enableAutoClearRecycle) || false;
                document.getElementById('enableAutoClearFamilyRecycle').checked = ((_h = settings.task) === null || _h === void 0 ? void 0 : _h.enableAutoClearFamilyRecycle) || false;
                document.getElementById('mediaSuffix').value = ((_j = settings.task) === null || _j === void 0 ? void 0 : _j.mediaSuffix) || '.mkv;.iso;.ts;.mp4;.avi;.rmvb;.wmv;.m2ts;.mpg;.flv;.rm;.mov';
                document.getElementById('enableOnlySaveMedia').checked = ((_k = settings.task) === null || _k === void 0 ? void 0 : _k.enableOnlySaveMedia) || false;
                document.getElementById('enableAutoCreateFolder').checked = ((_l = settings.task) === null || _l === void 0 ? void 0 : _l.enableAutoCreateFolder) || false;
                document.getElementById('enableCasRapidUpload').checked = (_o = (_m = settings.task) === null || _m === void 0 ? void 0 : _m.enableCasRapidUpload) !== null && _o !== void 0 ? _o : true;
                document.getElementById('enableDeleteCasFile').checked = (_q = (_p = settings.task) === null || _p === void 0 ? void 0 : _p.enableDeleteCasFile) !== null && _q !== void 0 ? _q : true;
                document.getElementById('enableCasFamilyTransfer').checked = (_s = (_r = settings.task) === null || _r === void 0 ? void 0 : _r.enableCasFamilyTransfer) !== null && _s !== void 0 ? _s : true;
                // casFamilyFolderId 已移除，改为账号级配置（Account.familyFolderId）
                document.getElementById('enableDeleteFamilyTempFile').checked = (_u = (_t = settings.task) === null || _t === void 0 ? void 0 : _t.enableDeleteFamilyTempFile) !== null && _u !== void 0 ? _u : true;
                // 天翼云盘特色功能
                document.getElementById('enableAutoCheckin').checked = (_w = (_v = settings.task) === null || _v === void 0 ? void 0 : _v.enableAutoCheckin) !== null && _w !== void 0 ? _w : true;
                document.getElementById('checkinCron').value = ((_x = settings.task) === null || _x === void 0 ? void 0 : _x.checkinCron) || '15 1 * * *';
                document.getElementById('enableStorageAggregation').checked = (_z = (_y = settings.task) === null || _y === void 0 ? void 0 : _y.enableStorageAggregation) !== null && _z !== void 0 ? _z : true;
                const toggleCheckinCron = () => {
                    const container = document.getElementById('checkinCronContainer');
                    if (container) {
                        container.style.display = document.getElementById('enableAutoCheckin').checked ? 'flex' : 'none';
                    }
                };
                document.getElementById('enableAutoCheckin').removeEventListener('change', toggleCheckinCron);
                document.getElementById('enableAutoCheckin').addEventListener('change', toggleCheckinCron);
                toggleCheckinCron();
                // 企业微信设置
                document.getElementById('enableWecom').checked = ((_0 = settings.wecom) === null || _0 === void 0 ? void 0 : _0.enable) || false;
                document.getElementById('wecomWebhook').value = ((_1 = settings.wecom) === null || _1 === void 0 ? void 0 : _1.webhook) || '';
                // 企业微信自建应用设置
                document.getElementById('wecomCorpId').value = ((_2 = settings.wecom) === null || _2 === void 0 ? void 0 : _2.corpId) || '';
                document.getElementById('wecomAppId').value = ((_3 = settings.wecom) === null || _3 === void 0 ? void 0 : _3.appId) || '';
                document.getElementById('wecomAppSecret').value = ((_4 = settings.wecom) === null || _4 === void 0 ? void 0 : _4.appSecret) || '';
                document.getElementById('wecomCallbackToken').value = ((_5 = settings.wecom) === null || _5 === void 0 ? void 0 : _5.callbackToken) || '';
                document.getElementById('wecomCallbackAesKey').value = ((_6 = settings.wecom) === null || _6 === void 0 ? void 0 : _6.callbackEncodingAESKey) || '';
                document.getElementById('wecomCallbackEnabled').checked = ((_7 = settings.wecom) === null || _7 === void 0 ? void 0 : _7.callbackEnabled) || false;
                // Telegram 设置
                document.getElementById('enableTelegram').checked = ((_8 = settings.telegram) === null || _8 === void 0 ? void 0 : _8.enable) || false;
                document.getElementById('proxyDomain').value = ((_9 = settings.telegram) === null || _9 === void 0 ? void 0 : _9.proxyDomain) || '';
                document.getElementById('telegramBotToken').value = ((_10 = settings.telegram) === null || _10 === void 0 ? void 0 : _10.botToken) || '';
                document.getElementById('telegramChatId').value = ((_11 = settings.telegram) === null || _11 === void 0 ? void 0 : _11.chatId) || '';
                // WXPusher 设置
                document.getElementById('enableWXPusher').checked = ((_12 = settings.wxpusher) === null || _12 === void 0 ? void 0 : _12.enable) || false;
                document.getElementById('wXPusherSPT').value = ((_13 = settings.wxpusher) === null || _13 === void 0 ? void 0 : _13.spt) || '';
                // 代理设置
                document.getElementById('proxyHost').value = ((_14 = settings.proxy) === null || _14 === void 0 ? void 0 : _14.host) || '';
                document.getElementById('proxyPort').value = ((_15 = settings.proxy) === null || _15 === void 0 ? void 0 : _15.port) || '';
                document.getElementById('proxyUsername').value = ((_16 = settings.proxy) === null || _16 === void 0 ? void 0 : _16.username) || '';
                document.getElementById('proxyPassword').value = ((_17 = settings.proxy) === null || _17 === void 0 ? void 0 : _17.password) || '';
                document.getElementById('proxyTelegram').checked = ((_19 = (_18 = settings.proxy) === null || _18 === void 0 ? void 0 : _18.services) === null || _19 === void 0 ? void 0 : _19.telegram) || false;
                document.getElementById('proxyTmdb').checked = ((_21 = (_20 = settings.proxy) === null || _20 === void 0 ? void 0 : _20.services) === null || _21 === void 0 ? void 0 : _21.tmdb) || false;
                document.getElementById('proxyOpenAI').checked = ((_23 = (_22 = settings.proxy) === null || _22 === void 0 ? void 0 : _22.services) === null || _23 === void 0 ? void 0 : _23.openai) || false;
                document.getElementById('proxyCloud189').checked = ((_25 = (_24 = settings.proxy) === null || _24 === void 0 ? void 0 : _24.services) === null || _25 === void 0 ? void 0 : _25.cloud189) || false;
                document.getElementById('proxyHDHive').checked = ((_27 = (_26 = settings.proxy) === null || _26 === void 0 ? void 0 : _26.services) === null || _27 === void 0 ? void 0 : _27.hdhive) || false;
                document.getElementById('proxyCustomPush').checked = ((_29 = (_28 = settings.proxy) === null || _28 === void 0 ? void 0 : _28.services) === null || _29 === void 0 ? void 0 : _29.customPush) || false;
                // Bark 设置
                document.getElementById('enableBark').checked = ((_30 = settings.bark) === null || _30 === void 0 ? void 0 : _30.enable) || false;
                document.getElementById('barkServerUrl').value = ((_31 = settings.bark) === null || _31 === void 0 ? void 0 : _31.serverUrl) || '';
                document.getElementById('barkKey').value = ((_32 = settings.bark) === null || _32 === void 0 ? void 0 : _32.key) || '';
                // 账号密码设置
                document.getElementById('systemUserName').value = ((_33 = settings.system) === null || _33 === void 0 ? void 0 : _33.username) || '';
                document.getElementById('systemPassword').value = ((_34 = settings.system) === null || _34 === void 0 ? void 0 : _34.password) || '';
                const enableStrm = ((_35 = settings.strm) === null || _35 === void 0 ? void 0 : _35.enable) || false;
                const enableEmby = ((_36 = settings.emby) === null || _36 === void 0 ? void 0 : _36.enable) || false;
                // 媒体信息设置
                document.getElementById('enableStrm').checked = enableStrm;
                document.getElementById('enableEmby').checked = enableEmby;
                document.getElementById('embyServer').value = ((_37 = settings.emby) === null || _37 === void 0 ? void 0 : _37.serverUrl) || '';
                document.getElementById('embyApiKey').value = ((_38 = settings.emby) === null || _38 === void 0 ? void 0 : _38.apiKey) || '';
                // tg机器人设置
                document.getElementById('enableTgBot').checked = ((_40 = (_39 = settings.telegram) === null || _39 === void 0 ? void 0 : _39.bot) === null || _40 === void 0 ? void 0 : _40.enable) || false;
                document.getElementById('tgBotToken').value = ((_42 = (_41 = settings.telegram) === null || _41 === void 0 ? void 0 : _41.bot) === null || _42 === void 0 ? void 0 : _42.botToken) || '';
                document.getElementById('tgBotChatId').value = ((_44 = (_43 = settings.telegram) === null || _43 === void 0 ? void 0 : _43.bot) === null || _44 === void 0 ? void 0 : _44.chatId) || '';
                // cloudSaver设置
                document.getElementById('cloudSaverUrl').value = ((_45 = settings.cloudSaver) === null || _45 === void 0 ? void 0 : _45.baseUrl) || '';
                document.getElementById('cloudSaverUsername').value = ((_46 = settings.cloudSaver) === null || _46 === void 0 ? void 0 : _46.username) || '';
                document.getElementById('cloudSaverPassword').value = ((_47 = settings.cloudSaver) === null || _47 === void 0 ? void 0 : _47.password) || '';
                // 刮削
                document.getElementById('enableScraper').checked = ((_48 = settings.tmdb) === null || _48 === void 0 ? void 0 : _48.enableScraper) || false;
                // tmdbkey
                document.getElementById('tmdbApiKey').value = ((_49 = settings.tmdb) === null || _49 === void 0 ? void 0 : _49.tmdbApiKey) || '';
                // openai配置
                document.getElementById('enableOpenAI').checked = ((_50 = settings.openai) === null || _50 === void 0 ? void 0 : _50.enable) || false;
                document.getElementById('openaiBaseUrl').value = ((_51 = settings.openai) === null || _51 === void 0 ? void 0 : _51.baseUrl) || '';
                document.getElementById('openaiApiKey').value = ((_52 = settings.openai) === null || _52 === void 0 ? void 0 : _52.apiKey) || '';
                document.getElementById('openaiModel').value = ((_53 = settings.openai) === null || _53 === void 0 ? void 0 : _53.model) || '';
                document.getElementById('openaiTemplate').value = ((_55 = (_54 = settings.openai) === null || _54 === void 0 ? void 0 : _54.rename) === null || _55 === void 0 ? void 0 : _55.template) || '';
                document.getElementById('openaiMovieTemplate').value = ((_57 = (_56 = settings.openai) === null || _56 === void 0 ? void 0 : _56.rename) === null || _57 === void 0 ? void 0 : _57.movieTemplate) || '';
                // alist
                document.getElementById('enableAlist').checked = ((_58 = settings.alist) === null || _58 === void 0 ? void 0 : _58.enable) || false;
                document.getElementById('alistServer').value = ((_59 = settings.alist) === null || _59 === void 0 ? void 0 : _59.baseUrl) || '';
                document.getElementById('alistApiKey').value = ((_60 = settings.alist) === null || _60 === void 0 ? void 0 : _60.apiKey) || '';
                // hdhive 影巢
                document.getElementById('enableHDHive').checked = ((_61 = settings.hdhive) === null || _61 === void 0 ? void 0 : _61.enabled) || false;
                document.getElementById('hdhiveApiKey').value = ((_62 = settings.hdhive) === null || _62 === void 0 ? void 0 : _62.apiKey) || '';
                document.getElementById('hdhiveBaseUrl').value = ((_63 = settings.hdhive) === null || _63 === void 0 ? void 0 : _63.baseUrl) || '';
                // 网盘过滤配置
                const cloudFilter = ((_64 = settings.hdhive) === null || _64 === void 0 ? void 0 : _64.cloudFilter) || {};
                document.getElementById('hdhiveCloud115').checked = cloudFilter['115'] !== false;
                document.getElementById('hdhiveCloudQuark').checked = cloudFilter['quark'] !== false;
                document.getElementById('hdhiveCloudAli').checked = cloudFilter['ali'] !== false;
                document.getElementById('hdhiveCloudBaidu').checked = cloudFilter['baidu'] !== false;
                document.getElementById('hdhiveCloud123').checked = cloudFilter['123'] !== false;
                document.getElementById('hdhiveCloudXunlei').checked = cloudFilter['xunlei'] === true;
                document.getElementById('hdhiveCloudPikpak').checked = cloudFilter['pikpak'] === true;
                document.getElementById('hdhiveCloud189').checked = cloudFilter['cloud189'] !== false;
                // pushplus
                document.getElementById('enablePushPlus').checked = ((_65 = settings.pushplus) === null || _65 === void 0 ? void 0 : _65.enable) || false;
                document.getElementById('pushplusToken').value = ((_66 = settings.pushplus) === null || _66 === void 0 ? void 0 : _66.token) || '';
                document.getElementById('pushplusTopic').value = ((_67 = settings.pushplus) === null || _67 === void 0 ? void 0 : _67.topic) || '';
                document.getElementById('pushplusChannel').value = ((_68 = settings.pushplus) === null || _68 === void 0 ? void 0 : _68.channel) || '';
                document.getElementById('pushplusWebhook').value = ((_69 = settings.pushplus) === null || _69 === void 0 ? void 0 : _69.webhook) || '';
                document.getElementById('pushplusTo').value = ((_70 = settings.pushplus) === null || _70 === void 0 ? void 0 : _70.to) || '';
                customPushConfigs = settings.customPush || [];
            }
        }
        catch (error) {
            console.error('加载设置失败:', error);
        }
    });
}
document.getElementById('settingsForm').addEventListener('submit', (e) => __awaiter(void 0, void 0, void 0, function* () {
    e.preventDefault();
    saveSettings();
}));
function saveSettings() {
    return __awaiter(this, void 0, void 0, function* () {
        const settings = {
            task: {
                taskExpireDays: parseInt(document.getElementById('taskExpireDays').value) || 3,
                taskCheckCron: document.getElementById('taskCheckCron').value || '0 19-23 * * *',
                cleanRecycleCron: document.getElementById('cleanRecycleCron').value || '0 */8 * * *',
                maxRetries: parseInt(document.getElementById('taskMaxRetries').value) || 3,
                retryInterval: parseInt(document.getElementById('taskRetryInterval').value) || 300,
                enableAutoClearRecycle: document.getElementById('enableAutoClearRecycle').checked,
                enableAutoClearFamilyRecycle: document.getElementById('enableAutoClearFamilyRecycle').checked,
                mediaSuffix: document.getElementById('mediaSuffix').value,
                enableOnlySaveMedia: document.getElementById('enableOnlySaveMedia').checked,
                enableAutoCreateFolder: document.getElementById('enableAutoCreateFolder').checked,
                enableCasRapidUpload: document.getElementById('enableCasRapidUpload').checked,
                enableDeleteCasFile: document.getElementById('enableDeleteCasFile').checked,
                enableCasFamilyTransfer: document.getElementById('enableCasFamilyTransfer').checked,
                // casFamilyFolderId 已移除，改为账号级配置
                enableDeleteFamilyTempFile: document.getElementById('enableDeleteFamilyTempFile').checked,
                enableAutoCheckin: document.getElementById('enableAutoCheckin').checked,
                checkinCron: document.getElementById('checkinCron').value || '15 1 * * *',
                enableStorageAggregation: document.getElementById('enableStorageAggregation').checked
            },
            wecom: {
                enable: document.getElementById('enableWecom').checked,
                webhook: document.getElementById('wecomWebhook').value,
                // 自建应用双向交互
                corpId: document.getElementById('wecomCorpId').value,
                appId: document.getElementById('wecomAppId').value,
                appSecret: document.getElementById('wecomAppSecret').value,
                callbackToken: document.getElementById('wecomCallbackToken').value,
                callbackEncodingAESKey: document.getElementById('wecomCallbackAesKey').value,
                callbackEnabled: document.getElementById('wecomCallbackEnabled').checked
            },
            telegram: {
                enable: document.getElementById('enableTelegram').checked,
                proxyDomain: document.getElementById('proxyDomain').value,
                botToken: document.getElementById('telegramBotToken').value,
                chatId: document.getElementById('telegramChatId').value,
                bot: {
                    enable: document.getElementById('enableTgBot').checked,
                    botToken: document.getElementById('tgBotToken').value,
                    chatId: document.getElementById('tgBotChatId').value
                }
            },
            wxpusher: {
                enable: document.getElementById('enableWXPusher').checked,
                spt: document.getElementById('wXPusherSPT').value
            },
            proxy: {
                host: document.getElementById('proxyHost').value,
                port: parseInt(document.getElementById('proxyPort').value) || 0,
                username: document.getElementById('proxyUsername').value,
                password: document.getElementById('proxyPassword').value,
                services: {
                    telegram: document.getElementById('proxyTelegram').checked,
                    tmdb: document.getElementById('proxyTmdb').checked,
                    openai: document.getElementById('proxyOpenAI').checked,
                    cloud189: document.getElementById('proxyCloud189').checked,
                    hdhive: document.getElementById('proxyHDHive').checked,
                    customPush: document.getElementById('proxyCustomPush').checked
                }
            },
            bark: {
                enable: document.getElementById('enableBark').checked,
                serverUrl: document.getElementById('barkServerUrl').value,
                key: document.getElementById('barkKey').value
            },
            system: {
                username: document.getElementById('systemUserName').value,
                password: document.getElementById('systemPassword').value,
                apiKey: document.getElementById('systemApiKey').value
            },
            pushplus: {
                enable: document.getElementById('enablePushPlus').checked,
                token: document.getElementById('pushplusToken').value,
                topic: document.getElementById('pushplusTopic').value,
                channel: document.getElementById('pushplusChannel').value,
                webhook: document.getElementById('pushplusWebhook').value,
                to: document.getElementById('pushplusTo').value
            },
            strm: {
                enable: document.getElementById('enableStrm').checked,
            },
            emby: {
                enable: document.getElementById('enableEmby').checked,
                serverUrl: document.getElementById('embyServer').value,
                apiKey: document.getElementById('embyApiKey').value,
            },
            cloudSaver: {
                baseUrl: document.getElementById('cloudSaverUrl').value,
                username: document.getElementById('cloudSaverUsername').value,
                password: document.getElementById('cloudSaverPassword').value,
            },
            tmdb: {
                enableScraper: document.getElementById('enableScraper').checked,
                tmdbApiKey: document.getElementById('tmdbApiKey').value
            },
            openai: {
                enable: document.getElementById('enableOpenAI').checked,
                baseUrl: document.getElementById('openaiBaseUrl').value,
                apiKey: document.getElementById('openaiApiKey').value,
                model: document.getElementById('openaiModel').value,
                rename: {
                    template: document.getElementById('openaiTemplate').value,
                    movieTemplate: document.getElementById('openaiMovieTemplate').value,
                }
            },
            alist: {
                enable: document.getElementById('enableAlist').checked,
                baseUrl: document.getElementById('alistServer').value,
                apiKey: document.getElementById('alistApiKey').value
            },
            hdhive: {
                enabled: document.getElementById('enableHDHive').checked,
                apiKey: document.getElementById('hdhiveApiKey').value,
                baseUrl: document.getElementById('hdhiveBaseUrl').value || 'https://api.hdhive.com',
                cloudFilter: {
                    '115': document.getElementById('hdhiveCloud115').checked,
                    'quark': document.getElementById('hdhiveCloudQuark').checked,
                    'ali': document.getElementById('hdhiveCloudAli').checked,
                    'baidu': document.getElementById('hdhiveCloudBaidu').checked,
                    '123': document.getElementById('hdhiveCloud123').checked,
                    'xunlei': document.getElementById('hdhiveCloudXunlei').checked,
                    'pikpak': document.getElementById('hdhiveCloudPikpak').checked,
                    'cloud189': document.getElementById('hdhiveCloud189').checked
                }
            },
            customPush: customPushConfigs
        };
        // taskRetryInterval不能少于60秒
        if (settings.task.taskRetryInterval < 60) {
            message.warning("任务重试间隔不能小于60秒");
            return;
        }
        try {
            const response = yield fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            const data = yield response.json();
            if (data.success) {
                message.success('保存成功');
                // 刷新影巢按钮显示状态
                if (typeof initHDHiveFeature === 'function') {
                    initHDHiveFeature();
                }
            }
            else {
                message.warning('保存失败: ' + data.error);
            }
        }
        catch (error) {
            message.warning('保存失败: ' + error.message);
        }
    });
}
// 在页面加载时初始化设置
document.addEventListener('DOMContentLoaded', loadSettings);
function generateApiKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let apiKey = '';
    for (let i = 0; i < 32; i++) {
        apiKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('systemApiKey').value = apiKey;
}
// 移除旧的 CAS 家庭目录选择器逻辑，改为账号级配置
