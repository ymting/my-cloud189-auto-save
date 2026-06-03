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
/**
 * HDHive（影巢）SDK
 * 封装影巢 OpenAPI 接口调用
 */
const ConfigService = require('../../services/ConfigService');
const { logTaskEvent } = require('../../utils/logUtils');
const ProxyUtil = require('../../utils/ProxyUtil');
const got = require('got');
// 网盘类型映射（影巢支持的网盘类型）
const CLOUD_TYPE_MAP = {
    '115': { name: '115网盘', icon: '115', color: '#2196F3' },
    '123': { name: '123云盘', icon: '123', color: '#FF9800' },
    'quark': { name: '夸克网盘', icon: 'quark', color: '#9C27B0' },
    'baidu': { name: '百度网盘', icon: 'baidu', color: '#06A7FF' },
    'ali': { name: '阿里云盘', icon: 'ali', color: '#FF6A00' },
    'xunlei': { name: '迅雷云盘', icon: 'xunlei', color: '#0D47A1' },
    'pikpak': { name: 'PikPak', icon: 'pikpak', color: '#E91E63' },
    'cloud189': { name: '天翼云盘', icon: 'cloud189', color: '#FF6B00' },
    'lenovo': { name: '联想云盘', icon: 'lenovo', color: '#E31837' }
};
// 解锁请求防抖锁（防止重复扣积分）
const unlockLocks = new Map();
const LOCK_TTL = 10 * 60 * 1000; // 10分钟锁有效期
class HDHiveSDK {
    constructor() {
        this.cacheTTL = 5 * 60 * 1000; // 5分钟缓存
        this.cache = new Map();
        // 定期清理过期缓存
        setInterval(() => this.cleanupCache(), 60 * 1000);
    }
    static getInstance() {
        if (!HDHiveSDK.instance) {
            HDHiveSDK.instance = new HDHiveSDK();
        }
        return HDHiveSDK.instance;
    }
    /**
     * 清理过期缓存
     */
    cleanupCache() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (value.expireAt < now) {
                this.cache.delete(key);
            }
        }
    }
    /**
     * 获取缓存
     */
    getCache(key) {
        const cached = this.cache.get(key);
        if (cached && cached.expireAt > Date.now()) {
            return cached.data;
        }
        return null;
    }
    /**
     * 设置缓存
     */
    setCache(key, data) {
        this.cache.set(key, {
            data,
            expireAt: Date.now() + this.cacheTTL
        });
    }
    /**
     * SDK 是否启用
     */
    get enabled() {
        return !!this.apiKey && ConfigService.getConfigValue('hdhive.enabled', false);
    }
    /**
     * 获取 API Key
     */
    get apiKey() {
        return ConfigService.getConfigValue('hdhive.apiKey') || '';
    }
    /**
     * 获取 API 基础地址
     * 注意：API 路径为 {baseUrl}/api/open/...
     */
    get baseUrl() {
        return ConfigService.getConfigValue('hdhive.baseUrl') || 'https://hdhive.com';
    }
    /**
     * 构建请求头
     */
    buildHeaders() {
        return {
            'X-API-Key': this.apiKey,
            'Content-Type': 'application/json'
        };
    }
    /**
     * 获取代理配置
     */
    getProxyAgent() {
        return ProxyUtil.getProxyAgent('hdhive');
    }
    /**
     * 测试连通性
     */
    ping() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.apiKey) {
                return { success: false, message: '影巢 API Key 未配置' };
            }
            try {
                const { body, statusCode } = yield got.get(`${this.baseUrl}/api/open/ping`, {
                    headers: this.buildHeaders(),
                    agent: this.getProxyAgent(),
                    responseType: 'json',
                    timeout: 10000,
                    throwHttpErrors: false
                });
                if (statusCode === 401) {
                    return { success: false, message: '影巢 API Key 无效或已过期' };
                }
                const data = body;
                return { success: true, message: data.message || 'pong' };
            }
            catch (error) {
                logTaskEvent(`影巢连通性测试失败: ${error.message}`);
                return { success: false, message: `连接失败: ${error.message}` };
            }
        });
    }
    /**
     * 查询积分与配额
     */
    getQuota() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.apiKey) {
                return { success: false, error: '影巢 API Key 未配置' };
            }
            try {
                const { body, statusCode } = yield got.get(`${this.baseUrl}/api/open/quota`, {
                    headers: this.buildHeaders(),
                    agent: this.getProxyAgent(),
                    responseType: 'json',
                    timeout: 10000,
                    throwHttpErrors: false
                });
                if (statusCode === 401) {
                    return { success: false, error: '影巢 API Key 无效或已过期' };
                }
                const data = body;
                return { success: true, data: data.data || data };
            }
            catch (error) {
                logTaskEvent(`影巢积分查询失败: ${error.message}`);
                return { success: false, error: error.message };
            }
        });
    }
    /**
     * 根据 TMDB ID 获取资源列表
     * @param type 影视类型: movie | tv
     * @param tmdbId TMDB ID
     */
    getResources(type, tmdbId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (!this.apiKey) {
                return { success: false, error: '影巢 API Key 未配置' };
            }
            // 检查缓存
            const cacheKey = `resources_${type}_${tmdbId}`;
            const cached = this.getCache(cacheKey);
            if (cached) {
                return { success: true, data: cached };
            }
            try {
                const { body, statusCode } = yield got.get(`${this.baseUrl}/api/open/resources/${type}/${tmdbId}`, {
                    headers: this.buildHeaders(),
                    agent: this.getProxyAgent(),
                    responseType: 'json',
                    timeout: 30000,
                    throwHttpErrors: false
                });
                if (statusCode === 401) {
                    return { success: false, error: '影巢 API Key 无效或已过期，请前往系统设置重新配置' };
                }
                if (statusCode === 404) {
                    return { success: true, data: [] };
                }
                const data = body;
                const resources = data.data || data || [];
                // 规范化资源数据
                const normalizedResources = this.normalizeResources(Array.isArray(resources) ? resources : []);
                // 设置缓存
                this.setCache(cacheKey, normalizedResources);
                return { success: true, data: normalizedResources };
            }
            catch (error) {
                const errorDetail = error.code ? `[${error.code}] ` : '';
                logTaskEvent(`影巢资源查询失败: ${errorDetail}${error.message}`);
                // 返回更详细的错误信息，帮助用户排查
                let errorMessage = error.message;
                if (error.code === 'ECONNRESET' || ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('TLS')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('socket disconnected'))) {
                    errorMessage = '网络连接异常，请检查：1) 影巢代理是否正常 2) 网络是否稳定 3) 影巢服务是否可用';
                }
                return { success: false, error: errorMessage };
            }
        });
    }
    /**
     * 规范化资源数据
     */
    normalizeResources(resources) {
        return resources.map(res => {
            var _a, _b, _c;
            return ({
                id: res.id || res.resourceId,
                title: res.title || res.name,
                cloudType: this.mapCloudType(res.cloudType || res.drive),
                cloudTypeName: ((_a = CLOUD_TYPE_MAP[this.mapCloudType(res.cloudType || res.drive)]) === null || _a === void 0 ? void 0 : _a.name) || '未知网盘',
                cloudTypeIcon: ((_b = CLOUD_TYPE_MAP[this.mapCloudType(res.cloudType || res.drive)]) === null || _b === void 0 ? void 0 : _b.icon) || 'default',
                cloudTypeColor: ((_c = CLOUD_TYPE_MAP[this.mapCloudType(res.cloudType || res.drive)]) === null || _c === void 0 ? void 0 : _c.color) || '#666',
                size: res.size || res.fileSize,
                sizeFormatted: this.formatSize(res.size || res.fileSize),
                points: res.points || res.cost || 0,
                isFree: !res.points && !res.cost,
                expired: res.expired || res.isExpired || false,
                quality: this.extractQuality(res.title || res.name),
                uploader: res.uploader || res.publisher || {},
                publishedAt: res.publishedAt || res.createTime || '',
                link: res.link || '',
                code: res.code || res.password || ''
            });
        });
    }
    /**
     * 映射网盘类型
     */
    mapCloudType(type) {
        if (typeof type === 'number') {
            const typeMap = {
                1: '115',
                2: 'quark',
                3: 'ali',
                4: 'baidu',
                5: '123',
                6: 'xunlei',
                7: 'pikpak',
                8: 'cloud189',
                9: 'lenovo'
            };
            return typeMap[type] || 'unknown';
        }
        const typeLower = String(type).toLowerCase();
        if (typeLower.includes('115'))
            return '115';
        if (typeLower.includes('123'))
            return '123';
        if (typeLower.includes('quark') || typeLower.includes('夸克'))
            return 'quark';
        if (typeLower.includes('baidu') || typeLower.includes('百度'))
            return 'baidu';
        if (typeLower.includes('ali') || typeLower.includes('阿里'))
            return 'ali';
        if (typeLower.includes('xunlei') || typeLower.includes('迅雷'))
            return 'xunlei';
        if (typeLower.includes('pikpak'))
            return 'pikpak';
        if (typeLower.includes('cloud189') || typeLower.includes('天翼') || typeLower.includes('电信'))
            return 'cloud189';
        if (typeLower.includes('lenovo') || typeLower.includes('联想'))
            return 'lenovo';
        return typeLower;
    }
    /**
     * 提取画质标签
     */
    extractQuality(title) {
        const qualities = [];
        const qualityKeywords = [
            { pattern: /4k|2160p/i, label: '4K' },
            { pattern: /1080p/i, label: '1080P' },
            { pattern: /720p/i, label: '720P' },
            { pattern: /remux/i, label: 'REMUX' },
            { pattern: /hdr|hdr10|dolby\s*vision/i, label: 'HDR' },
            { pattern: /atmos|truehd/i, label: 'Atmos' },
            { pattern: /dts-hd|dts:x/i, label: 'DTS-HD' },
            { pattern: /hevc|x265/i, label: 'HEVC' },
            { pattern: /avc|x264/i, label: 'AVC' },
            { pattern: /简中|简体|中字|中英/i, label: '中字' },
            { pattern: /原盘|蓝光/i, label: '原盘' },
            { pattern: /web-dl/i, label: 'WEB-DL' },
            { pattern: /bluray|blu-ray/i, label: 'BluRay' }
        ];
        for (const { pattern, label } of qualityKeywords) {
            if (pattern.test(title) && !qualities.includes(label)) {
                qualities.push(label);
            }
        }
        return qualities;
    }
    /**
     * 格式化文件大小
     */
    formatSize(bytes) {
        if (!bytes)
            return '未知';
        const size = typeof bytes === 'string' ? parseFloat(bytes) : bytes;
        if (isNaN(size))
            return '未知';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        let s = size;
        while (s >= 1024 && i < units.length - 1) {
            s /= 1024;
            i++;
        }
        return `${s.toFixed(1)} ${units[i]}`;
    }
    /**
     * 解锁资源
     * @param resourceId 资源ID
     */
    unlockResource(resourceId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            if (!this.apiKey) {
                return { success: false, error: '影巢 API Key 未配置' };
            }
            // 检查防抖锁
            if (unlockLocks.has(resourceId)) {
                const lockTime = unlockLocks.get(resourceId);
                if (Date.now() - lockTime < LOCK_TTL) {
                    return { success: false, error: '该资源正在处理中，请勿重复操作' };
                }
            }
            // 设置锁
            unlockLocks.set(resourceId, Date.now());
            try {
                const { body, statusCode } = yield got.post(`${this.baseUrl}/api/open/resources/unlock`, {
                    headers: this.buildHeaders(),
                    agent: this.getProxyAgent(),
                    json: { id: resourceId },
                    responseType: 'json',
                    timeout: 30000,
                    throwHttpErrors: false
                });
                if (statusCode === 401) {
                    unlockLocks.delete(resourceId);
                    return { success: false, error: '影巢 API Key 无效或已过期' };
                }
                if (statusCode === 402) {
                    unlockLocks.delete(resourceId);
                    return { success: false, error: '积分不足，无法解锁该资源' };
                }
                const data = body;
                if (statusCode === 200 || data.success) {
                    // 解锁成功，清除缓存
                    this.cache.clear();
                    unlockLocks.delete(resourceId);
                    return {
                        success: true,
                        data: {
                            link: ((_a = data.data) === null || _a === void 0 ? void 0 : _a.link) || data.link || '',
                            code: ((_b = data.data) === null || _b === void 0 ? void 0 : _b.code) || data.code || data.password || '',
                            points: ((_c = data.data) === null || _c === void 0 ? void 0 : _c.points) || data.points || 0
                        }
                    };
                }
                unlockLocks.delete(resourceId);
                return { success: false, error: data.message || data.error || '解锁失败' };
            }
            catch (error) {
                unlockLocks.delete(resourceId);
                logTaskEvent(`影巢资源解锁失败: ${error.message}`);
                return { success: false, error: error.message };
            }
        });
    }
    /**
     * 清除所有缓存
     */
    clearCache() {
        this.cache.clear();
        logTaskEvent('影巢 SDK 缓存已清除');
    }
}
exports.default = HDHiveSDK.getInstance();
