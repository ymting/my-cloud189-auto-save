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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupHDHiveRoutes = setupHDHiveRoutes;
exports.clearHDHiveCache = clearHDHiveCache;
const sdk_1 = __importDefault(require("./sdk"));
const { logTaskEvent } = require('../../utils/logUtils');
function setupHDHiveRoutes(app) {
    /**
     * 测试连通性
     * GET /api/hdhive/ping
     */
    app.get('/api/hdhive/ping', (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield sdk_1.default.ping();
            res.json(result);
        }
        catch (error) {
            logTaskEvent(`影巢连通性测试异常: ${error.message}`);
            res.json({ success: false, message: error.message });
        }
    }));
    /**
     * 查询积分与配额
     * GET /api/hdhive/quota
     */
    app.get('/api/hdhive/quota', (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield sdk_1.default.getQuota();
            res.json(result);
        }
        catch (error) {
            logTaskEvent(`影巢积分查询异常: ${error.message}`);
            res.json({ success: false, error: error.message });
        }
    }));
    /**
     * 根据 TMDB ID 获取资源列表
     * GET /api/hdhive/resources?type=movie&tmdbId=123
     */
    app.get('/api/hdhive/resources', (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { type, tmdbId } = req.query;
            if (!type || !['movie', 'tv'].includes(type)) {
                return res.status(400).json({
                    success: false,
                    error: 'type 参数必须为 movie 或 tv'
                });
            }
            if (!tmdbId) {
                return res.status(400).json({
                    success: false,
                    error: 'tmdbId 参数必填'
                });
            }
            const result = yield sdk_1.default.getResources(type, tmdbId);
            res.json(result);
        }
        catch (error) {
            logTaskEvent(`影巢资源查询异常: ${error.message}`);
            res.json({ success: false, error: error.message });
        }
    }));
    /**
     * 解锁资源
     * POST /api/hdhive/unlock
     * Body: { resourceId: string }
     */
    app.post('/api/hdhive/unlock', (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { resourceId } = req.body;
            if (!resourceId) {
                return res.status(400).json({
                    success: false,
                    error: 'resourceId 参数必填'
                });
            }
            const result = yield sdk_1.default.unlockResource(resourceId);
            res.json(result);
        }
        catch (error) {
            logTaskEvent(`影巢资源解锁异常: ${error.message}`);
            res.json({ success: false, error: error.message });
        }
    }));
    /**
     * 清除缓存
     * POST /api/hdhive/cache/clear
     */
    app.post('/api/hdhive/cache/clear', (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            sdk_1.default.clearCache();
            res.json({ success: true, message: '缓存已清除' });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
}
/**
 * 清除 SDK 缓存（供配置变更时调用）
 */
function clearHDHiveCache() {
    sdk_1.default.clearCache();
}
