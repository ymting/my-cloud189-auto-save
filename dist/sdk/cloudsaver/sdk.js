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
Object.defineProperty(exports, "__esModule", { value: true });
const { logTaskEvent } = require('../../utils/logUtils');
const ConfigService = require('../../services/ConfigService');
const fs = require('fs');
const path = require('path');
const got = require('got');
class CloudSaverSDK {
    constructor() {
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.tokenPath = path.join(process.cwd(), 'data', 'cstoken.json');
        this.token = this.loadToken();
    }
    static getInstance() {
        if (!CloudSaverSDK.instance) {
            CloudSaverSDK.instance = new CloudSaverSDK();
        }
        return CloudSaverSDK.instance;
    }
    get enabled() {
        return !!this.baseUrl && !!this.username && !!this.password;
    }
    get baseUrl() {
        return ConfigService.getConfigValue('cloudSaver.baseUrl') || '';
    }
    get username() {
        return ConfigService.getConfigValue('cloudSaver.username') || '';
    }
    get password() {
        return ConfigService.getConfigValue('cloudSaver.password') || '';
    }
    login() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.baseUrl || !this.username || !this.password) {
                logTaskEvent('您还未配置 CloudSaver 请先配置后使用');
                throw new Error('您还未配置 CloudSaver 请先配置后使用');
            }
            try {
                const { body } = yield got.post(`${this.baseUrl}/api/user/login`, {
                    json: {
                        username: this.username,
                        password: this.password
                    },
                    responseType: 'json',
                    timeout: 3000 // 3秒超时
                });
                const data = body;
                if (data.success && data.code === 0) {
                    this.token = data.data.token;
                    this.saveToken();
                    return true;
                }
                return false;
            }
            catch (error) {
                logTaskEvent('登录失败:' + error);
                return false;
            }
        });
    }
    loadToken() {
        try {
            if (fs.existsSync(this.tokenPath)) {
                const data = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
                return data.token || '';
            }
        }
        catch (error) {
            logTaskEvent('加载 token 失败: ' + error);
        }
        return '';
    }
    saveToken() {
        try {
            const dir = path.dirname(this.tokenPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.tokenPath, JSON.stringify({ token: this.token }));
        }
        catch (error) {
            logTaskEvent('保存 token 失败: ' + error);
        }
    }
    delay(ms) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise(resolve => setTimeout(resolve, ms));
        });
    }
    autoLogin() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.username || !this.password) {
                throw new Error('CloudSaverSDK 未启用');
            }
            let retries = 0;
            while (retries < this.maxRetries) {
                const success = yield this.login();
                if (success) {
                    return true;
                }
                retries++;
                if (retries < this.maxRetries) {
                    logTaskEvent(`CloudSaverSDK 自动登录失败，第 ${retries} 次重试...`);
                    yield this.delay(this.retryDelay);
                }
            }
            return false;
        });
    }
    search(keyword) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.token) {
                const loginSuccess = yield this.autoLogin();
                if (!loginSuccess) {
                    throw new Error('CloudSaverSDK 自动登录失败，请检查账号密码是否正确');
                }
            }
            try {
                logTaskEvent(`CloudSaverSDK 开始搜索${keyword}`);
                const { body, statusCode } = yield got.get(`${this.baseUrl}/api/search`, {
                    searchParams: { keyword },
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    },
                    responseType: 'json',
                    timeout: 30000, // 30秒超时
                    throwHttpErrors: false // 不自动抛出HTTP错误
                });
                // 处理 401 未授权的情况
                if (statusCode === 401) {
                    logTaskEvent('token 已过期，尝试自动登录...');
                    const loginSuccess = yield this.autoLogin();
                    if (!loginSuccess) {
                        throw new Error('token 已过期，自动登录失败');
                    }
                    // 重新发起请求
                    return this.search(keyword);
                }
                const data = body;
                if (data.success && data.code === 0) {
                    const resources = data.data
                        .flatMap(item => item.list)
                        .filter(item => {
                        var _a;
                        return ((_a = item.cloudLinks) === null || _a === void 0 ? void 0 : _a.length) > 0 &&
                            item.cloudLinks.some(link => link.link.includes('cloud.189.cn'));
                    });
                    // 先按资源去重
                    const uniqueResources = new Map();
                    resources.forEach(resource => {
                        if (!uniqueResources.has(resource.messageId)) {
                            uniqueResources.set(resource.messageId, resource);
                        }
                    });
                    // 将每个资源的多个链接拆分为独立资源
                    const result = [];
                    uniqueResources.forEach(resource => {
                        const cloudLinks = resource.cloudLinks.filter(link => link.link.includes('cloud.189.cn'));
                        cloudLinks.forEach(cloudLink => {
                            result.push({
                                messageId: resource.messageId,
                                title: resource.title,
                                cloudLinks: [cloudLink]
                            });
                        });
                    });
                    // 最后按链接去重
                    const uniqueLinks = new Map();
                    result.forEach(resource => {
                        const link = resource.cloudLinks[0].link;
                        if (!uniqueLinks.has(link)) {
                            uniqueLinks.set(link, resource);
                        }
                    });
                    const res = Array.from(uniqueLinks.values());
                    logTaskEvent(`CloudSaverSDK 清洗后的结果${JSON.stringify(res)}`);
                    return res;
                }
                return [];
            }
            catch (error) {
                throw error;
            }
        });
    }
    /**
     * 获取当前token
     */
    getToken() {
        return this.token;
    }
    /**
     * 设置token
     */
    setToken(token) {
        this.token = token;
        this.saveToken();
    }
}
exports.default = CloudSaverSDK.getInstance();
