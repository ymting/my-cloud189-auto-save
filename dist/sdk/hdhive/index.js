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
const ConfigService = require('../../services/ConfigService');
function setupHDHiveRoutes(app) {
    /**
     * 获取授权状态
     * GET /api/hdhive/auth/status
     */
    app.get('/api/hdhive/auth/status', (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const status = sdk_1.default.getAuthStatus();
            res.json({ success: true, data: status });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    /**
     * 获取 OAuth 授权 URL
     * GET /api/hdhive/oauth/url?redirect_uri=xxx
     */
    app.get('/api/hdhive/oauth/url', (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { redirect_uri } = req.query;
            if (!redirect_uri) {
                return res.status(400).json({
                    success: false,
                    error: 'redirect_uri 参数必填'
                });
            }
            const result = sdk_1.default.getOAuthUrl(redirect_uri);
            res.json({ success: true, data: result });
        }
        catch (error) {
            logTaskEvent(`影巢 OAuth URL 生成失败: ${error.message}`);
            res.json({ success: false, error: error.message });
        }
    }));
    /**
     * OAuth 回调接口
     * GET /api/hdhive/oauth/callback?code=xxx&state=xxx
     */
    app.get('/api/hdhive/oauth/callback', (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const { code, state, error: oauthError, error_description } = req.query;
            // 处理授权失败
            if (oauthError) {
                logTaskEvent(`影巢 OAuth 授权失败: ${oauthError} - ${error_description}`);
                return res.send(`
          <html>
            <head><title>授权失败</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h2 style="color: #e74c3c;">❌ 授权失败</h2>
              <p>${error_description || oauthError}</p>
              <script>setTimeout(() => window.close(), 3000);</script>
            </body>
          </html>
        `);
            }
            if (!code || !state) {
                return res.status(400).send(`
          <html>
            <head><title>授权失败</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h2 style="color: #e74c3c;">❌ 缺少必要参数</h2>
              <script>setTimeout(() => window.close(), 3000);</script>
            </body>
          </html>
        `);
            }
            // 验证 state
            if (!sdk_1.default.validateOAuthState(state)) {
                return res.status(400).send(`
          <html>
            <head><title>授权失败</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h2 style="color: #e74c3c;">❌ State 验证失败</h2>
              <p>可能是授权链接已过期，请重新发起授权</p>
              <script>setTimeout(() => window.close(), 3000);</script>
            </body>
          </html>
        `);
            }
            // 获取配置的回调地址
            const config = ConfigService.getConfig();
            const baseUrl = ((_a = config.system) === null || _a === void 0 ? void 0 : _a.baseUrl) || '';
            const redirectUri = `${baseUrl}/api/hdhive/oauth/callback`;
            // 用授权码换取 Token
            const result = yield sdk_1.default.exchangeCodeForToken(code, redirectUri);
            if (result.success) {
                res.send(`
          <html>
            <head><title>授权成功</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h2 style="color: #27ae60;">✅ 授权成功</h2>
              <p>您可以关闭此页面</p>
              <script>
                // 通知父窗口
                if (window.opener) {
                  window.opener.postMessage({ type: 'hdhive_oauth_success' }, '*');
                }
                setTimeout(() => window.close(), 2000);
              </script>
            </body>
          </html>
        `);
            }
            else {
                res.send(`
          <html>
            <head><title>授权失败</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h2 style="color: #e74c3c;">❌ 授权失败</h2>
              <p>${result.error}</p>
              <script>setTimeout(() => window.close(), 3000);</script>
            </body>
          </html>
        `);
            }
        }
        catch (error) {
            logTaskEvent(`影巢 OAuth 回调处理失败: ${error.message}`);
            res.status(500).send(`
        <html>
          <head><title>授权失败</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: #e74c3c;">❌ 服务器错误</h2>
            <p>${error.message}</p>
            <script>setTimeout(() => window.close(), 3000);</script>
          </body>
        </html>
      `);
        }
    }));
    /**
     * 撤销授权
     * POST /api/hdhive/oauth/revoke
     */
    app.post('/api/hdhive/oauth/revoke', (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield sdk_1.default.revokeAuth();
            res.json(result);
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
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
     * 获取当前授权用户信息
     * GET /api/hdhive/me
     */
    app.get('/api/hdhive/me', (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield sdk_1.default.getMe();
            res.json(result);
        }
        catch (error) {
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
     * Body: { slug: string }
     */
    app.post('/api/hdhive/unlock', (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { slug } = req.body;
            if (!slug) {
                return res.status(400).json({
                    success: false,
                    error: 'slug 参数必填'
                });
            }
            const result = yield sdk_1.default.unlockResource(slug);
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
