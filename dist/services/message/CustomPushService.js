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
const { logTaskEvent } = require('../../utils/logUtils');
const ProxyUtil = require('../../utils/ProxyUtil'); // ProxyUtil 仍然可能被 ConfigService.getProxyAgent 内部使用或直接使用
class CustomPushService extends MessageService {
    constructor(config) {
        super(config);
        // 确保 this.customPushConfigs 总是一个数组
        this.customPushConfigs = Array.isArray(config) ? config : (config ? [config] : []);
        this.initialize(); // 调用父类的 initialize，它会调用下面的 checkEnabled
    }
    checkEnabled() {
        // 检查配置数组中是否至少有一个启用的推送
        return this.customPushConfigs && this.customPushConfigs.some(c => c && c.enabled === true);
    }
    _jsonEscape(str) {
        if (typeof str !== 'string')
            return str;
        return str.replace(/\\/g, '\\\\') // 必须先替换反斜杠
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t')
            .replace(/\f/g, '\\f')
            .replace(/\b/g, '\\b');
    }
    // 从消息内容中提取 savePath（从 "📁 /xxx/yyy" 格式中提取）
    _extractSavePath(content) {
        if (typeof content !== 'string')
            return '';
        // 匹配 📁 后面跟的路径
        const match = content.match(/📁\s+(.+?)(?:\n|$)/);
        if (!match)
            return '';
        const path = match[1].trim();
        // 确保路径以 / 开头（SmartStrm 要求）
        return path.startsWith('/') ? path : '/' + path;
    }
    // 从消息内容中提取 videoType（从 "🎬 movie" 或 "🎬 tv" 格式中提取）
    _extractVideoType(content) {
        if (typeof content !== 'string')
            return 'tv'; // 默认剧集
        const match = content.match(/🎬\s+(movie|tv)/);
        return match ? match[1].trim() : 'tv';
    }
    _replacePlaceholders(template, title, content, escapeValuesForJson = false) {
        if (typeof template !== 'string')
            return template;
        const safeTitle = escapeValuesForJson ? this._jsonEscape(title) : title;
        const safeContent = escapeValuesForJson ? this._jsonEscape(content) : content;
        const savePath = this._extractSavePath(content);
        const videoType = this._extractVideoType(content);
        // 替换 {{title}}, {{content}}, {savePath}, {videoType}
        return template
            .replace(/{{title}}/g, safeTitle)
            .replace(/{{content}}/g, safeContent)
            .replace(/\{savePath\}/g, savePath)
            .replace(/\{videoType\}/g, videoType);
    }
    _replacePlaceholdersInObject(obj, title, content) {
        if (typeof obj !== 'object' || obj === null)
            return obj;
        const newObj = JSON.parse(JSON.stringify(obj)); // Deep clone
        const savePath = this._extractSavePath(content);
        const videoType = this._extractVideoType(content);
        for (const key in newObj) {
            if (Object.prototype.hasOwnProperty.call(newObj, key)) {
                if (typeof newObj[key] === 'string') {
                    // 替换 {{title}}, {{content}}, {savePath}, {videoType}
                    newObj[key] = newObj[key]
                        .replace(/{{title}}/g, title)
                        .replace(/{{content}}/g, content)
                        .replace(/\{savePath\}/g, savePath)
                        .replace(/\{videoType\}/g, videoType);
                }
                else if (typeof newObj[key] === 'object') {
                    newObj[key] = this._replacePlaceholdersInObject(newObj[key], title, content);
                }
            }
        }
        return newObj;
    }
    _sendSingleRequest(title, content, singlePushConfig) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!singlePushConfig || !singlePushConfig.enabled) {
                return false;
            }
            // 解构新的配置字段
            const { url, method, contentType, fields } = singlePushConfig;
            if (!url || !method) {
                logTaskEvent(`[CustomPushService] URL 或请求方法未在配置中提供: ${JSON.stringify(singlePushConfig)}`, 'error');
                return false;
            }
            let processedUrl = this._replacePlaceholders(url, title, content);
            let requestHeaders = {};
            let requestBodyFields = {};
            // 处理 fields 数组
            if (Array.isArray(fields)) {
                for (const field of fields) {
                    if (!field || !field.key)
                        continue;
                    if (field.type === 'header') {
                        requestHeaders[field.key] = this._replacePlaceholders(field.value, title, content);
                    }
                    else if (field.type === 'string') {
                        requestBodyFields[field.key] = this._replacePlaceholders(field.value, title, content);
                    }
                    else if (field.type === 'json') {
                        try {
                            let parsedJsonValue = JSON.parse(field.value);
                            parsedJsonValue = this._replacePlaceholdersInObject(parsedJsonValue, title, content);
                            requestBodyFields = parsedJsonValue;
                        }
                        catch (e) {
                            logTaskEvent(`[CustomPushService] 解析字段 "${field.key}" 的JSON值失败: ${e.message}. 原始值 (替换前): ${field.value}, 替换后尝试解析的字符串: ${this._replacePlaceholders(field.value, title, content, true)}`, 'error');
                            requestBodyFields = this._replacePlaceholders(field.value, title, content);
                        }
                    }
                    else {
                        // 其他类型或未指定类型的字段，默认作为字符串处理放入body
                        requestBodyFields[field.key] = this._replacePlaceholders(field.value, title, content);
                    }
                }
            }
            const agent = ProxyUtil.getProxyAgent("customPush");
            const options = {
                method: method.toUpperCase(),
                headers: requestHeaders, // 从 fields 中提取的请求头
                timeout: { request: 5000 }, // 使用配置的timeout或默认值
                retry: { limit: 1 }, // 使用配置的retries或默认值
                throwHttpErrors: false,
                agent // 应用代理
            };
            // 根据 contentType 设置请求体和 Content-Type 请求头
            if (contentType && contentType.toLowerCase().includes('application/json')) {
                options.json = requestBodyFields;
                options.headers['Content-Type'] = 'application/json; charset=utf-8';
            }
            else if (contentType && contentType.toLowerCase().includes('application/x-www-form-urlencoded')) {
                options.form = requestBodyFields;
                options.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=utf-8';
            }
            else if (contentType && contentType.toLowerCase().includes('text/plain')) {
                options.body = Object.values(requestBodyFields).join('\n');
                options.headers['Content-Type'] = contentType.startsWith('text/plain') ? contentType : 'text/plain; charset=utf-8';
            }
            else if (Object.keys(requestBodyFields).length > 0) {
                if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
                    options.json = requestBodyFields;
                    options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json; charset=utf-8';
                }
            }
            try {
                logTaskEvent(`[CustomPushService] 发送自定义推送: ${options.method} ${processedUrl} | Headers: ${JSON.stringify(options.headers)} | Body: ${options.json ? JSON.stringify(options.json) : (options.form ? JSON.stringify(options.form) : options.body || 'N/A')}`);
                const response = yield got(processedUrl, options);
                if (response.statusCode >= 200 && response.statusCode < 300) {
                    logTaskEvent(`[CustomPushService] 推送成功 (${processedUrl}). 状态码: ${response.statusCode}`);
                    return true;
                }
                else {
                    logTaskEvent(`[CustomPushService] 推送失败 (${processedUrl}). 状态码: ${response.statusCode}, 响应体: ${response.body}`, 'error');
                    return false;
                }
            }
            catch (error) {
                logTaskEvent(`[CustomPushService] 推送请求错误 (${processedUrl}): ${error.message}`, 'error');
                return false;
            }
        });
    }
    _send(message_1) {
        return __awaiter(this, arguments, void 0, function* (message, title = '应用通知') {
            if (!this.enabled) {
                return;
            }
            // 处理包含 📁 路径的消息（重命名完成）或文件删除消息
            // 避免 AI 重命名过程中、Emby 通知等其他消息触发 webhook
            if (typeof message !== 'string' || (!message.includes('📁') && !message.includes('🗑️'))) {
                return;
            }
            let allSuccess = true;
            for (const config of this.customPushConfigs) {
                if (config && config.enabled) {
                    const success = yield this._sendSingleRequest(title, message, config);
                    if (!success) {
                        allSuccess = false;
                    }
                }
            }
            return allSuccess;
        });
    }
    _sendScrapeMessage(scrapeMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.enabled) {
                return;
            }
            const baseTitle = scrapeMessage.title || '刮削通知';
            let content = scrapeMessage.content || '';
            if (scrapeMessage.posterUrl) {
                content += `\n海报: ${scrapeMessage.posterUrl}`;
            }
            let allSuccess = true;
            for (const config of this.customPushConfigs) {
                if (config && config.enabled) {
                    // 你可能需要根据新的配置结构调整标题的生成方式，或者在配置中添加类似字段
                    const pushTitle = config.scrapeTitleTemplate ? this._replacePlaceholders(config.scrapeTitleTemplate, baseTitle, content) : baseTitle;
                    const success = yield this._sendSingleRequest(pushTitle, content, config);
                    if (!success) {
                        allSuccess = false;
                    }
                }
            }
            return allSuccess;
        });
    }
    // 测试推送
    testPush(config) {
        return __awaiter(this, void 0, void 0, function* () {
            config.enabled = true;
            return yield this._sendSingleRequest('测试标题', '测试内容', config);
        });
    }
}
module.exports = CustomPushService;
