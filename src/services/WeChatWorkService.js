/**
 * 企业微信自建应用服务
 * 支持：主动发消息、回调URL验证、接收并解密用户消息/菜单事件
 */
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { logTaskEvent } = require('../utils/logUtils');

class WeChatWorkService {
    constructor(config) {
        this.corpId = config.corpId;
        this.appId = config.appId;       // AgentId
        this.appSecret = config.appSecret;
        this.token = config.token;
        this.encodingAESKey = config.encodingAESKey;
        this._accessToken = null;
        this._tokenExpireAt = 0;
    }

    // ─── Access Token ──────────────────────────────────────────────────────────

    async getAccessToken() {
        if (this._accessToken && Date.now() < this._tokenExpireAt) {
            return this._accessToken;
        }
        const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.corpId}&corpsecret=${this.appSecret}`;
        const data = await this._get(url);
        if (data.errcode !== 0) {
            throw new Error(`企微获取token失败: ${data.errmsg}`);
        }
        this._accessToken = data.access_token;
        this._tokenExpireAt = Date.now() + (data.expires_in - 60) * 1000; // 提前60秒刷新
        return this._accessToken;
    }

    // ─── 发送消息 ──────────────────────────────────────────────────────────────

    async sendTextMessage(userId, content) {
        const token = await this.getAccessToken();
        const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`;
        const body = {
            touser: userId || '@all',
            msgtype: 'text',
            agentid: this.appId,
            text: { content },
            safe: 0
        };
        return this._post(url, body);
    }

    async sendNewsMessage(userId, articles) {
        const token = await this.getAccessToken();
        const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`;
        const body = {
            touser: userId || '@all',
            msgtype: 'news',
            agentid: this.appId,
            news: { articles }
        };
        return this._post(url, body);
    }

    // ─── 创建自定义菜单 ─────────────────────────────────────────────────────────

    async createMenu(menuConfig) {
        const token = await this.getAccessToken();
        const url = `https://qyapi.weixin.qq.com/cgi-bin/menu/create?access_token=${token}&agentid=${this.appId}`;
        return this._post(url, menuConfig);
    }

    async setupDefaultMenu() {
        const menu = {
            button: [
                {
                    name: '🎬 AI重命名',
                    sub_button: [
                        { type: 'click', name: '未匹配任务列表', key: 'RENAME_TASKS' },
                        { type: 'click', name: '执行所有任务', key: 'EXECUTE_ALL' }
                    ]
                },
                {
                    name: '📋 任务管理',
                    sub_button: [
                        { type: 'click', name: '查看任务列表', key: 'TASK_LIST' },
                        { type: 'click', name: '取消当前操作', key: 'CANCEL' }
                    ]
                }
            ]
        };
        try {
            const result = await this.createMenu(menu);
            if (result.errcode === 0) {
                logTaskEvent('企业微信应用菜单创建成功');
            } else {
                logTaskEvent(`企业微信应用菜单创建失败: ${result.errmsg}`);
            }
        } catch (e) {
            logTaskEvent(`企业微信菜单初始化失败: ${e.message}`);
        }
    }

    // ─── 回调 URL 验证（GET请求）──────────────────────────────────────────────

    verifyCallback(signature, timestamp, nonce, echostr) {
        // 1. 验证签名
        const arr = [this.token, timestamp, nonce, echostr].sort();
        const str = arr.join('');
        const hash = crypto.createHash('sha1').update(str).digest('hex');
        if (hash !== signature) {
            throw new Error('企微回调签名验证失败');
        }
        // 2. 解密 echostr
        return this._aesDecrypt(echostr);
    }

    // ─── 解密消息（POST请求）─────────────────────────────────────────────────

    decryptMessage(encryptedMsg) {
        return this._aesDecrypt(encryptedMsg);
    }

    verifySignature(signature, timestamp, nonce, encryptedMsg) {
        const arr = [this.token, timestamp, nonce, encryptedMsg].sort();
        const str = arr.join('');
        const hash = crypto.createHash('sha1').update(str).digest('hex');
        return hash === signature;
    }

    _aesDecrypt(encryptedStr) {
        const aesKey = Buffer.from(this.encodingAESKey + '=', 'base64');
        const iv = aesKey.subarray(0, 16);
        const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
        decipher.setAutoPadding(false);
        let decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedStr, 'base64')), decipher.final()]);
        // 去除填充
        const pad = decrypted[decrypted.length - 1];
        decrypted = decrypted.subarray(0, decrypted.length - pad);
        // 前16字节是随机字符串，4字节是消息长度
        const msgLen = decrypted.readUInt32BE(16);
        const msgContent = decrypted.subarray(20, 20 + msgLen).toString('utf8');
        return msgContent;
    }

    // ─── HTTP 工具 ──────────────────────────────────────────────────────────────

    _get(url) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https') ? https : http;
            client.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(JSON.parse(data)));
            }).on('error', reject);
        });
    }

    _post(url, body) {
        return new Promise((resolve, reject) => {
            const payload = JSON.stringify(body);
            const client = url.startsWith('https') ? https : http;
            const urlObj = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            };
            const req = client.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(JSON.parse(data)));
            });
            req.on('error', reject);
            req.write(payload);
            req.end();
        });
    }
}

// ─── 全局单例管理器 ─────────────────────────────────────────────────────────────

class WeChatWorkManager {
    static instance = null;

    static getInstance() {
        if (!WeChatWorkManager.instance) {
            WeChatWorkManager.instance = new WeChatWorkManager();
        }
        return WeChatWorkManager.instance;
    }

    constructor() {
        this.service = null;
        // 会话状态机：userId => { state, taskId, searchType, searchResults }
        this.sessions = new Map();
    }

    initialize(config) {
        const { corpId, appId, appSecret, token, encodingAESKey } = config;
        if (corpId && appId && appSecret && token && encodingAESKey) {
            this.service = new WeChatWorkService(config);
            logTaskEvent('企业微信应用服务已初始化');
            this.service.setupDefaultMenu();
        } else {
            this.service = null;
        }
    }

    getService() { return this.service; }
    isEnabled() { return !!this.service; }

    getSession(userId) {
        if (!this.sessions.has(userId)) {
            this.sessions.set(userId, { state: 'idle' });
        }
        return this.sessions.get(userId);
    }

    setSession(userId, data) {
        this.sessions.set(userId, { ...this.getSession(userId), ...data });
    }

    clearSession(userId) {
        this.sessions.set(userId, { state: 'idle' });
    }

    // 发送简单文本给所有配置的chatId
    async sendText(userId, text) {
        if (!this.service) return;
        try {
            await this.service.sendTextMessage(userId, text);
        } catch (e) {
            logTaskEvent(`企微发送消息失败: ${e.message}`);
        }
    }

    /**
     * TMDB 匹配失败通知 (企微版)
     */
    async sendTmdbFailAlert(task) {
        if (!this.service) return;
        const taskName = task.resourceName;
        const content = `⚠️ AI重命名匹配 TMDB 失败\n\n任务：${taskName}\n\n您可以点击下方菜单: [🎬 AI重命名] -> [未匹配任务列表] 找到该任务进行手动绑定。`;
        await this.sendText(null, content);
    }
}

module.exports = WeChatWorkManager.getInstance();
module.exports.WeChatWorkService = WeChatWorkService;
