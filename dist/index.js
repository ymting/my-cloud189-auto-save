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
require('dotenv').config();
const express = require('express');
const { AppDataSource } = require('./database');
const { Account, Task, CommonFolder } = require('./entities');
const { TaskService } = require('./services/task');
const { Cloud189Service } = require('./services/cloud189');
const { MessageUtil } = require('./services/message');
const { CacheManager } = require('./services/CacheManager');
const taskCacheManager = require('./services/TaskCacheManager');
const ConfigService = require('./services/ConfigService');
const ProxyUtil = require('./utils/ProxyUtil');
const { appendTmdbIdToFolderName } = require('./utils/folderNameUtils');
const { CloudAuthClient } = require('../vender/cloud189-sdk/dist');
const packageJson = require('../package.json');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const { SchedulerService } = require('./services/scheduler');
const { logTaskEvent, initSSE, sendAIMessage } = require('./utils/logUtils');
const TelegramBotManager = require('./utils/TelegramBotManager');
const fs = require('fs').promises;
const path = require('path');
const { setupCloudSaverRoutes, clearCloudSaverToken } = require('./sdk/cloudsaver');
const { setupHDHiveRoutes, clearHDHiveCache } = require('./sdk/hdhive');
const { Like, Not, IsNull, In, Or, MoreThan } = require('typeorm');
const cors = require('cors');
const { EmbyService } = require('./services/emby');
const { StrmService } = require('./services/strm');
const AIService = require('./services/ai');
const CustomPushService = require('./services/message/CustomPushService');
const { TMDBService } = require('./services/tmdb');
const WeChatWorkManager = require('./services/WeChatWorkService');
const cloud189Utils = require('./utils/Cloud189Utils');
const { TaskEventHandler } = require('./services/taskEventHandler');
const { tmdbBackfillService } = require('./services/TmdbBackfillService');
const app = express();
app.use(cors({
    origin: '*', // 允许所有来源
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-api-key'],
    credentials: true
}));
app.use(express.json());
app.use(session({
    store: new FileStore({
        path: './data/sessions', // session文件存储路径
        ttl: 30 * 24 * 60 * 60, // session过期时间，单位秒
        reapInterval: 3600, // 清理过期session间隔，单位秒
        retries: 0, // 设置重试次数为0
        logFn: () => { }, // 禁用内部日志
        reapAsync: true, // 异步清理过期session
    }),
    secret: 'LhX2IyUcMAz2',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000 * 30 // 30天
    }
}));
// 验证会话的中间件
const authenticateSession = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const configApiKey = ConfigService.getConfigValue('system.apiKey');
    if (apiKey && configApiKey && apiKey === configApiKey) {
        return next();
    }
    if (req.session.authenticated) {
        next();
    }
    else {
        // API 请求返回 401，页面请求重定向到登录页
        if (req.path.startsWith('/api/')) {
            res.status(401).json({ success: false, error: '未登录' });
        }
        else {
            res.redirect('/login');
        }
    }
};
// 添加根路径处理
app.get('/', (req, res) => {
    if (!req.session.authenticated) {
        res.redirect('/login');
    }
    else {
        res.sendFile(__dirname + '/public/index.html');
    }
});
// 登录页面
app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});
// 登录接口
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ConfigService.getConfigValue('system.username') &&
        password === ConfigService.getConfigValue('system.password')) {
        req.session.authenticated = true;
        req.session.username = username;
        res.json({ success: true });
    }
    else {
        res.json({ success: false, error: '用户名或密码错误' });
    }
});
app.use(express.static(path.join(__dirname, 'public')));
// 为所有路由添加认证（除了登录页和登录接口）
app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/login'
        || req.path === '/api/auth/login'
        || req.path === '/api/auth/login'
        || req.path === '/emby/notify'
        || req.path.startsWith('/wecom/')
        || req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico)$/)) {
        return next();
    }
    authenticateSession(req, res, next);
});
// 初始化数据库连接
AppDataSource.initialize().then(() => __awaiter(void 0, void 0, void 0, function* () {
    // 当前版本:
    const currentVersion = packageJson.version;
    console.log(`当前系统版本: ${currentVersion}`);
    console.log('数据库连接成功');
    // 初始化 STRM 目录权限
    const strmBaseDir = path.join(__dirname, '../strm');
    try {
        yield fs.mkdir(strmBaseDir, { recursive: true });
        if (process.getuid && process.getuid() === 0) {
            yield fs.chown(strmBaseDir, parseInt(process.env.PUID || 0), parseInt(process.env.PGID || 0));
        }
        yield fs.chmod(strmBaseDir, 0o777);
        console.log('STRM目录权限初始化完成');
    }
    catch (error) {
        console.error('STRM目录权限初始化失败:', error);
    }
    const accountRepo = AppDataSource.getRepository(Account);
    const taskRepo = AppDataSource.getRepository(Task);
    const commonFolderRepo = AppDataSource.getRepository(CommonFolder);
    const taskService = new TaskService(taskRepo, accountRepo);
    const embyService = new EmbyService(taskService);
    const messageUtil = new MessageUtil();
    // 机器人管理
    const botManager = TelegramBotManager.getInstance();
    // 初始化机器人
    yield botManager.handleBotStatus(ConfigService.getConfigValue('telegram.bot.botToken'), ConfigService.getConfigValue('telegram.bot.chatId'), ConfigService.getConfigValue('telegram.bot.enable'));
    // 初始化企业微信应用
    const wecomCfg = ConfigService.getConfigValue('wecom') || {};
    if (wecomCfg.callbackEnabled && wecomCfg.corpId && wecomCfg.appId) {
        WeChatWorkManager.initialize({
            corpId: wecomCfg.corpId,
            appId: wecomCfg.appId,
            appSecret: wecomCfg.appSecret,
            token: wecomCfg.callbackToken,
            encodingAESKey: wecomCfg.callbackEncodingAESKey
        });
    }
    // 初始化缓存管理器
    const folderCache = new CacheManager(parseInt(600));
    // 初始化任务定时器
    yield SchedulerService.initTaskJobs(taskRepo, taskService);
    // 账号相关API
    app.get('/api/accounts', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const accounts = yield accountRepo.find();
        // 获取容量
        for (const account of accounts) {
            account.capacity = {
                cloudCapacityInfo: { usedSize: 0, totalSize: 0 },
                familyCapacityInfo: { usedSize: 0, totalSize: 0 }
            };
            // 如果账号名是s打头 则不获取容量
            if (!account.username.startsWith('n_')) {
                const cached = Cloud189Service.getCachedCapacity(account.username);
                if (cached) {
                    account.capacity = cached;
                }
                else {
                    const cloud189 = Cloud189Service.getInstance(account);
                    const capacity = yield cloud189.getUserSizeInfo();
                    if (capacity && capacity.res_code == 0) {
                        account.capacity.cloudCapacityInfo = capacity.cloudCapacityInfo;
                        account.capacity.familyCapacityInfo = capacity.familyCapacityInfo;
                    }
                }
            }
            account.original_username = account.username;
            // username脱敏
            account.username = account.username.replace(/(.{3}).*(.{4})/, '$1****$2');
        }
        res.json({ success: true, data: accounts });
    }));
    // 强制刷新账号容量缓存
    app.post('/api/accounts/refresh-capacity', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const accounts = yield accountRepo.find();
            let refreshed = 0;
            for (const account of accounts) {
                if (account.username.startsWith('n_'))
                    continue;
                try {
                    const cloud189 = Cloud189Service.getInstance(account);
                    const capacity = yield cloud189.getUserSizeInfo();
                    if (capacity && capacity.res_code == 0) {
                        refreshed++;
                    }
                }
                catch (e) {
                    console.error(`[刷新容量] 账号 ${account.username} 刷新失败:`, e.message);
                }
            }
            res.json({ success: true, message: `已刷新 ${refreshed} 个账号的容量信息` });
        }
        catch (error) {
            console.error('[刷新容量] 刷新失败:', error);
            res.json({ success: false, error: error.message });
        }
    }));
    // 扫码登录 - 获取二维码
    app.get('/api/accounts/qr-code', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const authClient = new CloudAuthClient();
            const proxyUrl = ProxyUtil.getProxy('cloud189');
            if (proxyUrl) {
                authClient.setProxy(proxyUrl);
            }
            const qrData = yield authClient.getQRCode();
            // 拼接正确的二维码图片获取地址，使用 verified /api/logbox/oauth2/image.do 接口，且必须对 uuid 进行 URL 编码并带上会话的 REQID
            const qrImageUrl = `https://open.e.189.cn/api/logbox/oauth2/image.do?uuid=${encodeURIComponent(qrData.uuid)}&REQID=${qrData.reqId}`;
            res.json({
                success: true,
                data: Object.assign(Object.assign({}, qrData), { qrUrl: qrImageUrl })
            });
        }
        catch (error) {
            console.error('[扫码登录] 获取二维码失败:', error);
            res.json({ success: false, error: error.message });
        }
    }));
    // 扫码登录 - 检查状态并完成登录
    app.post('/api/accounts/qr-status', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const authClient = new CloudAuthClient();
            const proxyUrl = ProxyUtil.getProxy('cloud189');
            if (proxyUrl) {
                authClient.setProxy(proxyUrl);
            }
            const qrStatus = yield authClient.checkQRCodeStatus(req.body);
            // 状态：0=成功, -106=等待扫码, -11002=已扫码待确认, -11001=过期
            if (qrStatus.status === 0) {
                const loginToken = yield authClient.getSessionForPC({ redirectURL: qrStatus.redirectUrl });
                const loginName = loginToken.loginName;
                // 保存 Token 到 file 以便 FileTokenStore 能够读取
                const tokenData = {
                    accessToken: loginToken.accessToken,
                    refreshToken: loginToken.refreshToken,
                    expiresIn: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).getTime()
                };
                const dataDir = path.join(process.cwd(), 'data');
                // 确保 data 目录存在
                try {
                    const fsSync = require('fs');
                    if (!fsSync.existsSync(dataDir)) {
                        fsSync.mkdirSync(dataDir, { recursive: true });
                    }
                }
                catch (_) { }
                const tokenFilePath = path.join(dataDir, `${loginName}.json`);
                const fsPromises = require('fs').promises;
                yield fsPromises.writeFile(tokenFilePath, JSON.stringify(tokenData), 'utf-8');
                // 数据库记录
                let account = yield accountRepo.findOne({ where: { username: loginName } });
                if (!account) {
                    account = accountRepo.create({
                        username: loginName,
                        password: '',
                        cookies: ''
                    });
                }
                // 尝试检测家庭组
                const cloud189 = Cloud189Service.getInstance(account);
                try {
                    const familyInfo = yield cloud189.getFamilyInfo();
                    if (familyInfo && familyInfo.familyId) {
                        account.familyId = String(familyInfo.familyId);
                        console.log(`[账号] 扫码登录检测家庭组成功: ${account.username} -> familyId: ${account.familyId}`);
                    }
                }
                catch (e) {
                    console.log(`[账号] 扫码登录获取家庭信息失败: ${e.message}`);
                }
                yield accountRepo.save(account);
                res.json({
                    success: true,
                    status: 0,
                    data: {
                        accountId: account.id,
                        username: loginName,
                        familyId: account.familyId
                    }
                });
            }
            else {
                res.json({
                    success: true,
                    status: qrStatus.status,
                    message: qrStatus.status === -106 ? '等待扫码' :
                        qrStatus.status === -11002 ? '已扫码，请在手机端确认' :
                            qrStatus.status === -11001 ? '二维码已过期' : '未知状态'
                });
            }
        }
        catch (error) {
            console.error('[扫码登录] 检查状态失败:', error);
            res.json({ success: false, error: error.message });
        }
    }));
    app.post('/api/accounts', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const account = accountRepo.create(req.body);
            // 尝试登录, 登录成功写入store, 如果需要验证码, 则返回用户验证码图片
            if (!account.username.startsWith('n_') && account.password) {
                // 尝试登录
                const cloud189 = Cloud189Service.getInstance(account);
                const loginResult = yield cloud189.login(account.username, account.password, req.body.validateCode);
                if (!loginResult.success) {
                    if (loginResult.code == "NEED_CAPTCHA") {
                        res.json({
                            success: false,
                            code: "NEED_CAPTCHA",
                            data: {
                                captchaUrl: loginResult.data
                            }
                        });
                        return;
                    }
                    res.json({ success: false, error: loginResult.message });
                    return;
                }
                // 登录成功后自动获取家庭组信息
                try {
                    const familyInfo = yield cloud189.getFamilyInfo();
                    if (familyInfo && familyInfo.familyId) {
                        account.familyId = String(familyInfo.familyId);
                        console.log(`[账号] 自动检测家庭组: ${account.username} -> familyId: ${account.familyId}`);
                    }
                }
                catch (e) {
                    console.log(`[账号] 获取家庭信息失败: ${e.message}`);
                }
            }
            // 支持前端传入的家庭中转目录配置（可选）
            if (req.body.familyFolderId) {
                account.familyFolderId = req.body.familyFolderId;
            }
            yield accountRepo.save(account);
            res.json({ success: true, data: { accountId: account.id, familyId: account.familyId } });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    // 清空回收站
    app.delete('/api/accounts/recycle', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            taskService.clearRecycleBin(true, true);
            res.json({ success: true, data: "ok" });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    app.delete('/api/accounts/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const account = yield accountRepo.findOneBy({ id: parseInt(req.params.id) });
            if (!account)
                throw new Error('账号不存在');
            yield accountRepo.remove(account);
            res.json({ success: true });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    app.put('/api/accounts/:id/strm-prefix', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const accountId = parseInt(req.params.id);
            const { strmPrefix, type } = req.body;
            const account = yield accountRepo.findOneBy({ id: accountId });
            if (!account)
                throw new Error('账号不存在');
            if (type == 'local') {
                account.localStrmPrefix = strmPrefix;
            }
            if (type == 'cloud') {
                account.cloudStrmPrefix = strmPrefix;
            }
            if (type == 'emby') {
                account.embyPathReplace = strmPrefix;
            }
            yield accountRepo.save(account);
            res.json({ success: true });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    // 修改别名
    app.put('/api/accounts/:id/alias', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const accountId = parseInt(req.params.id);
            const { alias } = req.body;
            const account = yield accountRepo.findOneBy({ id: accountId });
            if (!account)
                throw new Error('账号不存在');
            account.alias = alias;
            yield accountRepo.save(account);
            res.json({ success: true });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    app.put('/api/accounts/:id/default', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const accountId = parseInt(req.params.id);
            // 清除所有账号的默认状态
            yield accountRepo.update({}, { isDefault: false });
            // 设置指定账号为默认
            yield accountRepo.update({ id: accountId }, { isDefault: true });
            res.json({ success: true });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    // 获取账号的家庭目录树（用于前端选择中转目录）
    app.get('/api/accounts/:id/family/folders', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const accountId = parseInt(req.params.id);
            const folderId = req.query.folderId || '';
            const account = yield accountRepo.findOneBy({ id: accountId });
            if (!account)
                throw new Error('账号不存在');
            const cloud189 = Cloud189Service.getInstance(account);
            const familyInfo = yield cloud189.getFamilyInfo();
            if (!familyInfo)
                throw new Error('该账号无家庭空间');
            const folders = yield cloud189.listFamilyFolderNodes(String(familyInfo.familyId), folderId);
            res.json({ success: true, data: { familyId: String(familyInfo.familyId), folders } });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    // 获取多账号容量聚合数据
    app.get('/api/accounts/storage-summary', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const accounts = yield accountRepo.find();
            let totalCloudSize = 0; // KB
            let usedCloudSize = 0; // KB
            let totalFamilySize = 0; // KB
            let usedFamilySize = 0; // KB
            let accountDetails = [];
            for (const account of accounts) {
                if (account.username.startsWith('n_'))
                    continue;
                let capacity = Cloud189Service.getCachedCapacity(account.username);
                if (!capacity) {
                    const cloud189 = Cloud189Service.getInstance(account);
                    const cloudCapacity = yield cloud189.getUserSizeInfo();
                    if (cloudCapacity && cloudCapacity.res_code == 0) {
                        capacity = {
                            cloudCapacityInfo: cloudCapacity.cloudCapacityInfo,
                            familyCapacityInfo: cloudCapacity.familyCapacityInfo
                        };
                    }
                }
                if (capacity) {
                    totalCloudSize += Number(capacity.cloudCapacityInfo.totalSize || 0);
                    usedCloudSize += Number(capacity.cloudCapacityInfo.usedSize || 0);
                    totalFamilySize += Number(capacity.familyCapacityInfo.totalSize || 0);
                    usedFamilySize += Number(capacity.familyCapacityInfo.usedSize || 0);
                    accountDetails.push({
                        username: account.username.replace(/(.{3}).*(.{4})/, '$1****$2'),
                        alias: account.alias || '',
                        cloudUsed: capacity.cloudCapacityInfo.usedSize || 0,
                        cloudTotal: capacity.cloudCapacityInfo.totalSize || 0,
                        familyUsed: capacity.familyCapacityInfo.usedSize || 0,
                        familyTotal: capacity.familyCapacityInfo.totalSize || 0
                    });
                }
            }
            res.json({
                success: true,
                data: {
                    cloud: { total: totalCloudSize, used: usedCloudSize },
                    family: { total: totalFamilySize, used: usedFamilySize },
                    accounts: accountDetails
                }
            });
        }
        catch (error) {
            console.error('[容量聚合] 获取容量聚合失败:', error);
            res.json({ success: false, error: error.message });
        }
    }));
    // 更新账号的家庭中转目录
    app.put('/api/accounts/:id/family-folder', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const accountId = parseInt(req.params.id);
            const { familyFolderId } = req.body;
            const account = yield accountRepo.findOneBy({ id: accountId });
            if (!account)
                throw new Error('账号不存在');
            account.familyFolderId = familyFolderId || '';
            yield accountRepo.save(account);
            res.json({ success: true });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    // 任务相关API
    app.get('/api/tasks', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { status, search, page: pageParam, pageSize: pageSizeParam } = req.query;
        const page = Math.max(parseInt(pageParam) || 1, 1);
        const pageSize = Math.min(parseInt(pageSizeParam) || 100, 500);
        const skip = (page - 1) * pageSize;
        let whereClause = {};
        // 基础条件（AND）
        if (status && status !== 'all') {
            if (status === 'processing') {
                // 追剧中 = processing 或 pending但有内容
                whereClause = [
                    { status: 'processing', enableSystemProxy: Or(IsNull(), false) },
                    { status: 'pending', currentEpisodes: MoreThan(0), enableSystemProxy: Or(IsNull(), false) }
                ];
            }
            else if (status === 'pending') {
                // 等待中 = pending且无内容
                whereClause = [
                    { status: 'pending', currentEpisodes: 0, enableSystemProxy: Or(IsNull(), false) },
                    { status: 'pending', currentEpisodes: IsNull(), enableSystemProxy: Or(IsNull(), false) }
                ];
            }
            else {
                whereClause.status = status;
            }
        }
        if (!Array.isArray(whereClause)) {
            whereClause.enableSystemProxy = Or(IsNull(), false);
        }
        // 添加全局模糊搜索过滤：任务标题、TMDB信息、分享链接、目录、备注、账号等都纳入匹配范围
        if (search) {
            const searchKeyword = `%${String(search).trim()}%`;
            const searchConditions = [
                { resourceName: Like(searchKeyword) },
                { shareFolderName: Like(searchKeyword) },
                { tmdbTitle: Like(searchKeyword) },
                { shareLink: Like(searchKeyword) },
                { realFolderName: Like(searchKeyword) },
                { remark: Like(searchKeyword) },
                { lastSavedDisplayText: Like(searchKeyword) },
                { lastSavedFileName: Like(searchKeyword) },
                { account: { username: Like(searchKeyword) } }
            ];
            if (Array.isArray(whereClause)) {
                // 数组where（OR条件）时，与搜索条件做笛卡尔积
                const expandedWhere = [];
                for (const baseCond of whereClause) {
                    for (const searchCond of searchConditions) {
                        expandedWhere.push(Object.assign(Object.assign({}, baseCond), searchCond));
                    }
                }
                whereClause = expandedWhere;
            }
            else if (Object.keys(whereClause).length > 0) {
                whereClause = searchConditions.map(searchCond => (Object.assign(Object.assign({}, whereClause), searchCond)));
            }
            else {
                whereClause = searchConditions;
            }
        }
        const [tasks, total] = yield taskRepo.findAndCount({
            order: { id: 'DESC' },
            relations: {
                account: true
            },
            select: {
                account: {
                    username: true
                }
            },
            where: whereClause,
            take: pageSize,
            skip
        });
        // username脱敏
        const maskedTasks = tasks.map(task => (Object.assign(Object.assign({}, task), { account: task.account ? Object.assign(Object.assign({}, task.account), { username: task.account.username.replace(/(.{3}).*(.{4})/, '$1****$2') }) : task.account })));
        res.json({ success: true, data: maskedTasks, total, page, pageSize });
    }));
    // TMDB 批量补全接口（手动触发）
    app.post('/api/tasks/tmdb-backfill', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const result = yield tmdbBackfillService.triggerManually();
            res.json(result);
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    // 更新单个任务的 tmdbContent（前端回写用）
    app.patch('/api/tasks/:id/tmdb-content', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const taskId = parseInt(req.params.id);
            const { tmdbContent } = req.body;
            if (!tmdbContent)
                throw new Error('缺少 tmdbContent 参数');
            const task = yield taskRepo.findOneBy({ id: taskId });
            if (!task)
                throw new Error('任务不存在');
            task.tmdbContent = typeof tmdbContent === 'string' ? tmdbContent : JSON.stringify(tmdbContent);
            yield taskRepo.save(task);
            res.json({ success: true });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    app.post('/api/tasks', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const task = yield taskService.createTask(req.body);
            res.json({ success: true, data: task });
        }
        catch (error) {
            console.log(error);
            res.json({ success: false, error: error.message });
        }
    }));
    app.delete('/api/tasks/batch', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const taskIds = req.body.taskIds;
            const deleteCloud = req.body.deleteCloud;
            yield taskService.deleteTasks(taskIds, deleteCloud);
            // 清除批量删除任务的目录缓存
            for (const taskId of taskIds) {
                folderCache.clearPrefix(`share_folders_${taskId}_`);
            }
            res.json({ success: true });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    // 删除任务文件
    app.delete('/api/tasks/files', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { taskId, files } = req.body;
            if (!files || files.length === 0) {
                throw new Error('未选择要删除的文件');
            }
            yield taskService.deleteFiles(taskId, files);
            res.json({ success: true, data: null });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    app.delete('/api/tasks/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const taskId = parseInt(req.params.id);
            const deleteCloud = req.body.deleteCloud;
            yield taskService.deleteTask(taskId, deleteCloud);
            // 清除该任务的目录缓存，防止内存泄漏
            folderCache.clearPrefix(`share_folders_${taskId}_`);
            res.json({ success: true });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    app.put('/api/tasks/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const taskId = parseInt(req.params.id);
            const updatedTask = yield taskService.updateTask(taskId, req.body);
            // 清除该任务的分享目录缓存，防止资源目录弹窗返回旧数据
            folderCache.clearPrefix(`share_folders_${taskId}_`);
            res.json({ success: true, data: updatedTask });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    app.post('/api/tasks/:id/clear-cache', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const taskId = parseInt(req.params.id);
            const task = yield taskRepo.findOneBy({ id: taskId });
            if (!task) {
                return res.json({ success: false, error: '任务不存在' });
            }
            // 清除任务缓存
            yield taskCacheManager.clearCache(taskId);
            // 清除处理状态相关字段
            task.processingStartTime = null;
            task.lastFileUpdateTime = null;
            task.currentEpisodes = 0;
            task.status = 'pending';
            // 清除追更进度相关字段
            task.lastSavedFileName = null;
            task.lastSavedDisplayText = null;
            task.missingEpisodes = null;
            yield taskRepo.save(task);
            logTaskEvent(`任务[${task.resourceName}]缓存已清除，状态恢复为 pending`);
            res.json({ success: true, data: task, message: '缓存已清除，任务状态已恢复' });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    // 新增: TMDB 手动搜索接口（支持双语回退）
    app.get('/api/tmdb/search', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { query, type, enableBilingual = 'true' } = req.query;
            console.log(`[TMDB搜索] 关键词: "${query}", 类型: ${type}, 双语回退: ${enableBilingual}`);
            if (!query)
                throw new Error('搜索关键字不能为空');
            const tmdbService = new TMDBService();
            console.log(`[TMDB搜索] API Key: ${tmdbService.apiKey ? '已配置' : '❌ 未配置'}`);
            // 辅助函数：按语言搜索
            const searchWithLanguage = (language) => __awaiter(void 0, void 0, void 0, function* () {
                const endpoint = type === 'movie' ? '/search/movie' : '/search/tv';
                console.log(`[TMDB搜索] 调用 ${endpoint}，语言: ${language}`);
                const response = yield tmdbService._request(endpoint, {
                    query,
                    language,
                    include_adult: false
                });
                return (response.results || []).map(item => (Object.assign(Object.assign({}, item), { _searchLanguage: language // 标记搜索语言
                 })));
            });
            let results = [];
            // 1. 优先使用中文搜索
            console.log(`[TMDB搜索] 第一步：中文搜索（language=zh-CN）`);
            results = yield searchWithLanguage('zh-CN');
            console.log(`[TMDB搜索] 中文结果数量: ${results.length}`);
            // 2. 如果启用双语回退且中文无结果，使用英文搜索
            if (enableBilingual === 'true' && results.length === 0) {
                console.log(`[TMDB搜索] 第二步：中文无结果，回退英文搜索（language=en-US）`);
                results = yield searchWithLanguage('en-US');
                console.log(`[TMDB搜索] 英文结果数量: ${results.length}`);
            }
            console.log(`[TMDB搜索] 最终结果数量: ${results.length}`);
            res.json({
                success: true,
                data: results,
                meta: {
                    query,
                    type,
                    searchedLanguages: results.length > 0 ? [results[0]._searchLanguage] : [],
                    enableBilingual: enableBilingual === 'true'
                }
            });
        }
        catch (error) {
            console.error(`[TMDB搜索] 错误:`, error.message);
            res.json({ success: false, error: error.message });
        }
    }));
    app.get('/api/tmdb/detail', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { id, type } = req.query;
            if (!id || !type)
                throw new Error('参数缺失');
            const tmdbService = new TMDBService();
            const detail = type === 'movie'
                ? yield tmdbService.getMovieDetails(id)
                : yield tmdbService.getTVDetails(id);
            if (!detail)
                throw new Error('未找到媒体详情');
            res.json({ success: true, data: detail });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    // 新增: 手动绑定 TMDB 接口
    app.post('/api/tasks/:id/manual-tmdb', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const taskId = parseInt(req.params.id);
            const { tmdbId, videoType, title, manualSeason } = req.body;
            if (!tmdbId || !videoType)
                throw new Error('参数缺失');
            const task = yield taskRepo.findOne({
                where: { id: taskId },
                relations: { account: true },
                select: {
                    account: {
                        username: true,
                        localStrmPrefix: true,
                        cloudStrmPrefix: true,
                        embyPathReplace: true
                    }
                }
            });
            if (!task)
                throw new Error('任务不存在');
            task.tmdbId = tmdbId;
            task.videoType = videoType;
            if (title)
                task.tmdbTitle = title;
            // 如果用户填写了具体的季数进行覆盖，则保存，否则置空
            task.manualSeason = manualSeason !== '' && !isNaN(parseInt(manualSeason))
                ? parseInt(manualSeason)
                : null;
            task.manualTmdbBound = true;
            // 同步更新最新转存显示文本，确保手动修正后界面刷新
            task.lastSavedDisplayText = task.tmdbTitle || title;
            // 从 TMDB API 获取更多信息更新任务卡片
            let detail;
            try {
                const { TMDBService } = require('./services/tmdb');
                const tmdbService = new TMDBService();
                detail = videoType === 'movie'
                    ? yield tmdbService.getMovieDetails(tmdbId)
                    : yield tmdbService.getTVDetails(tmdbId);
                if (detail) {
                    // 更新 TMDB 标题（如果未提供）
                    if (!title && detail.title) {
                        task.tmdbTitle = detail.title;
                    }
                    // 更新总集数（剧集类型）
                    if (videoType === 'tv' && detail.totalEpisodes) {
                        task.totalEpisodes = detail.totalEpisodes;
                    }
                    // 更新总集数（具体季的集数，剧集类型）
                    if (videoType === 'tv' && detail.seasons) {
                        const taskName = task.shareFolderName || task.resourceName || '';
                        const seasonMatch = taskName.match(/(?:Season|S)\.?\s*(\d+)|第\.?\s*(\d+)\.?\s*季/i);
                        const taskSeason = task.manualSeason != null
                            ? task.manualSeason
                            : (seasonMatch ? parseInt(seasonMatch[1] || seasonMatch[2]) : null);
                        const seasonInfo = detail.seasons.find(s => s.season_number === taskSeason);
                        if (seasonInfo && seasonInfo.episode_count > 0) {
                            task.totalEpisodes = seasonInfo.episode_count;
                        }
                    }
                    // 保存完整的 TMDB 内容
                    task.tmdbContent = JSON.stringify(detail);
                    logTaskEvent(`[TMDB绑定] 已获取 TMDB 详情: ${detail.title || title}`);
                }
            }
            catch (e) {
                logTaskEvent(`[TMDB绑定] 获取 TMDB 详情失败: ${e.message}`);
            }
            // 注意：TMDB 绑定后不清除缓存，只触发重命名
            // 清缓存会导致任务重新执行，可能误删文件
            yield taskRepo.save(task);
            // 级联同步TMDB绑定到兄弟任务（同一分享链接下的其他季）
            if (videoType === 'tv' && task.realRootFolderId) {
                try {
                    const siblings = yield taskRepo.find({
                        where: { realRootFolderId: task.realRootFolderId },
                        relations: { account: true },
                        select: {
                            account: {
                                username: true, localStrmPrefix: true, cloudStrmPrefix: true, embyPathReplace: true
                            }
                        }
                    });
                    for (const sibling of siblings) {
                        if (sibling.id === taskId)
                            continue;
                        if (sibling.manualTmdbBound || sibling.tmdbId) {
                            logTaskEvent(`[TMDB级联] 兄弟任务[${sibling.resourceName}]已有TMDB绑定，跳过`);
                            continue;
                        }
                        const name = sibling.shareFolderName || sibling.resourceName || '';
                        const seasonMatch = name.match(/(?:Season|S)\.?\s*(\d+)|第\.?\s*(\d+)\.?\s*季/i);
                        const siblingSeason = seasonMatch ? parseInt(seasonMatch[1] || seasonMatch[2]) : null;
                        sibling.tmdbId = tmdbId;
                        sibling.videoType = videoType;
                        sibling.tmdbTitle = title || task.tmdbTitle || '';
                        sibling.manualSeason = siblingSeason;
                        sibling.manualTmdbBound = true;
                        if (detail && detail.seasons) {
                            const seasonInfo = detail.seasons.find(s => s.season_number === siblingSeason);
                            if (seasonInfo && seasonInfo.episode_count > 0) {
                                sibling.totalEpisodes = seasonInfo.episode_count;
                            }
                        }
                        if (task.tmdbContent) {
                            sibling.tmdbContent = task.tmdbContent;
                        }
                        // ✅ Issue #28: 若开关开启，给兄弟任务文件夹名追加 [tmdb-{id}] 标记
                        const appendEnabled = ConfigService.getConfigValue('task.appendTmdbIdToFolder');
                        if (appendEnabled && sibling.realFolderName && !/\s*\[tmdb-\d+\]\s*$/i.test(sibling.realFolderName)) {
                            sibling.realFolderName = appendTmdbIdToFolderName(sibling.realFolderName, tmdbId);
                            logTaskEvent(`[TMDB级联] 已为兄弟任务文件夹追加 [tmdb-${tmdbId}] 标记: ${sibling.realFolderName}`);
                        }
                        yield taskRepo.save(sibling);
                        logTaskEvent(`[TMDB级联] 已同步TMDB绑定到兄弟任务: ${sibling.resourceName} (第${siblingSeason || '?'}季)`);
                        const cascadeRename = () => __awaiter(void 0, void 0, void 0, function* () {
                            try {
                                const account = sibling.account;
                                const cloud189 = Cloud189Service.getInstance(account);
                                logTaskEvent(`[TMDB级联] 触发兄弟任务重命名: ${sibling.resourceName}`);
                                const result = yield taskService.autoRename(cloud189, sibling, { skipDeletion: true });
                                let msg = '';
                                if (result && result.newFiles && result.newFiles.length > 0) {
                                    // 确保路径以 / 开头（SmartStrm webhook 要求）
                                    let folderPath = sibling.realFolderName || sibling.realFolderId || '';
                                    if (folderPath && !folderPath.startsWith('/')) {
                                        folderPath = '/' + folderPath;
                                    }
                                    msg = `✅《${sibling.resourceName}》级联绑定TMDB并重命名完成\n已处理 ${result.newFiles.length} 个文件`;
                                    if (folderPath) {
                                        msg += `\n📁 ${folderPath}`;
                                    }
                                    if (result.renameMessages && result.renameMessages.length > 0) {
                                        const details = result.renameMessages.slice(0, 10);
                                        msg += `\n${details.join('\n')}`;
                                        if (result.renameMessages.length > 10) {
                                            msg += `\n└─ ... 等${result.renameMessages.length}个文件`;
                                        }
                                    }
                                    messageUtil.sendMessage(msg);
                                    // 重命名后触发 Emby 扫库
                                    const { EmbyService } = require('./services/emby');
                                    const embyService = new EmbyService();
                                    try {
                                        yield embyService.notify(sibling);
                                    }
                                    catch (e) {
                                        logTaskEvent(`[TMDB级联] Emby扫库失败: ${e.message}`);
                                    }
                                }
                            }
                            catch (e) {
                                logTaskEvent(`[TMDB级联] 兄弟任务[${sibling.resourceName}]重命名失败: ${e.message}`);
                            }
                        });
                        cascadeRename().catch(e => logTaskEvent(`[TMDB级联] 兄弟任务异步重命名失败: ${e.message}`));
                    }
                }
                catch (e) {
                    logTaskEvent(`[TMDB级联] 级联同步失败: ${e.message}`);
                }
            }
            // 自动触发重命名（后台异步执行，不阻塞响应）
            const renameTask = () => __awaiter(void 0, void 0, void 0, function* () {
                try {
                    const account = task.account;
                    const cloud189 = Cloud189Service.getInstance(account);
                    logTaskEvent(`[TMDB绑定] 自动触发重命名: ${task.resourceName}`);
                    // TMDB 绑定后的重命名：只重命名，不删除文件（避免误删）
                    const result = yield taskService.autoRename(cloud189, task, { skipDeletion: true });
                    let message = '';
                    if (result && result.newFiles && result.newFiles.length > 0) {
                        // 获取保存路径用于 webhook 占位符
                        // 确保路径以 / 开头（SmartStrm webhook 要求）
                        let folderPath = task.realFolderName || task.realFolderId || '';
                        if (folderPath && !folderPath.startsWith('/')) {
                            folderPath = '/' + folderPath;
                        }
                        message = `✅《${task.resourceName}》TMDB绑定并重命名完成\n已处理 ${result.newFiles.length} 个文件\n📁 ${folderPath}`;
                        if (result.renameMessages && result.renameMessages.length > 0) {
                            const details = result.renameMessages.slice(0, 10);
                            message += `\n${details.join('\n')}`;
                            if (result.renameMessages.length > 10) {
                                message += `\n└─ ... 等${result.renameMessages.length}个文件`;
                            }
                        }
                        messageUtil.sendMessage(message);
                        // 重命名后触发 Emby 扫库
                        const { EmbyService } = require('./services/emby');
                        const embyService = new EmbyService();
                        try {
                            logTaskEvent(`[TMDB绑定] 执行Emby通知: ${task.resourceName}`);
                            yield embyService.notify(task);
                        }
                        catch (e) {
                            logTaskEvent(`[TMDB绑定] Emby扫库失败: ${e.message}`);
                        }
                    }
                    else {
                        message = `ℹ️《${task.resourceName}》TMDB绑定完成，无需重命名（无文件或已是正确格式）`;
                        messageUtil.sendMessage(message);
                    }
                }
                catch (e) {
                    logTaskEvent(`[TMDB绑定] 自动重命名失败: ${e.message}`);
                    messageUtil.sendMessage(`❌《${task.resourceName}》TMDB绑定后重命名失败: ${e.message}`);
                }
            });
            renameTask().catch(e => logTaskEvent(`[TMDB绑定] 异步重命名失败: ${e.message}`)); // 异步执行，不阻塞
            res.json({ success: true, data: task });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    // 企业微信回调地址验证 (GET)
    app.get('/wecom/callback', (req, res) => {
        const { msg_signature, timestamp, nonce, echostr } = req.query;
        const service = WeChatWorkManager.getService();
        if (!service)
            return res.status(400).send('WeChat service not configured');
        try {
            const plain = service.verifyCallback(msg_signature, timestamp, nonce, echostr);
            res.send(plain);
        }
        catch (e) {
            res.status(403).send('Verification failed');
        }
    });
    // 企业微信接收消息 (POST) - 数字选择式交互状态机
    app.post('/wecom/callback', express.text({ type: 'application/xml' }), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        res.send('success'); // 先立即回包，避免超时重试
        const { msg_signature, timestamp, nonce } = req.query;
        const service = WeChatWorkManager.getService();
        if (!service)
            return;
        try {
            const encryptMatch = (req.body || '').match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
            if (!encryptMatch)
                return;
            const encrypted = encryptMatch[1];
            if (!service.verifySignature(msg_signature, timestamp, nonce, encrypted))
                return;
            const plain = service.decryptMessage(encrypted);
            const fromUser = (_a = plain.match(/<FromUserName><!\[CDATA\[(.*?)\]\]><\/FromUserName>/)) === null || _a === void 0 ? void 0 : _a[1];
            const msgType = (_b = plain.match(/<MsgType><!\[CDATA\[(.*?)\]\]><\/MsgType>/)) === null || _b === void 0 ? void 0 : _b[1];
            const content = (_d = (_c = plain.match(/<Content><!\[CDATA\[(.*?)\]\]><\/Content>/)) === null || _c === void 0 ? void 0 : _c[1]) === null || _d === void 0 ? void 0 : _d.trim();
            const event = (_e = plain.match(/<Event><!\[CDATA\[(.*?)\]\]><\/Event>/)) === null || _e === void 0 ? void 0 : _e[1];
            const eventKey = (_f = plain.match(/<EventKey><!\[CDATA\[(.*?)\]\]><\/EventKey>/)) === null || _f === void 0 ? void 0 : _f[1];
            const send = (txt) => service.sendTextMessage(fromUser, txt);
            const ses = WeChatWorkManager.getSession(fromUser);
            // 菜单点击事件
            if (msgType === 'event' && event === 'CLICK') {
                if (eventKey === 'RENAME_TASKS') {
                    const tasks = yield taskRepo.find({ order: { updatedAt: 'DESC' }, take: 10 });
                    const txt = tasks.map((t, i) => `${i + 1}. ${t.resourceName} ${t.tmdbId ? '✅已绑定' : '❌未绑定'}`).join('\n');
                    WeChatWorkManager.setSession(fromUser, { state: 'select_task', tasks });
                    yield send(`📺 任务列表：\n\n${txt}\n\n回复数字选择任务绑定TMDB，回复"取消"退出`);
                }
                else if (eventKey === 'EXECUTE_ALL') {
                    taskService.processAllTasks(true).catch(() => { });
                    yield send('✅ 已开始执行所有任务...');
                }
                else if (eventKey === 'TASK_LIST') {
                    const tasks = yield taskRepo.find({ order: { updatedAt: 'DESC' }, take: 10 });
                    const txt = tasks.map((t, i) => `${i + 1}. ${t.resourceName} - ${t.status}`).join('\n');
                    yield send(`📊 任务列表\n\n${txt}`);
                }
                else if (eventKey === 'CANCEL') {
                    WeChatWorkManager.clearSession(fromUser);
                    yield send('✅ 已取消当前操作');
                }
                return;
            }
            // 文字消息
            if (msgType === 'text' && content) {
                if (content === '取消' || content.toLowerCase() === 'cancel') {
                    WeChatWorkManager.clearSession(fromUser);
                    yield send('已取消');
                    return;
                }
                if (ses.state === 'select_task') {
                    const idx = parseInt(content) - 1;
                    const task = (_g = ses.tasks) === null || _g === void 0 ? void 0 : _g[idx];
                    if (!task) {
                        yield send('请输入有效数字，或回复"取消"');
                        return;
                    }
                    WeChatWorkManager.setSession(fromUser, { state: 'select_type', taskId: task.id, taskName: task.resourceName });
                    yield send(`选择任务：《${task.resourceName}》\n\n请选择媒体类型：\n1. 剧集/动漫/纪录片\n2. 电影\n\n回复 1 或 2`);
                    return;
                }
                if (ses.state === 'select_type') {
                    const tp = content === '2' ? 'movie' : 'tv';
                    WeChatWorkManager.setSession(fromUser, { state: 'input_keyword', searchType: tp });
                    yield send(`已选择：${tp === 'tv' ? '剧集' : '电影'}\n\n🔍 请发送影视名称开始搜索`);
                    return;
                }
                if (ses.state === 'input_keyword') {
                    const tmdbSvc = new TMDBService();
                    const apiResults = yield tmdbSvc.searchByType(content, ses.searchType);
                    if (!(apiResults === null || apiResults === void 0 ? void 0 : apiResults.length)) {
                        yield send(`未找到"${content}"，请重新输入`);
                        return;
                    }
                    const list = apiResults.slice(0, 6);
                    const txt = list.map((it, i) => `${i + 1}. ${it.title || it.name} (${(it.release_date || it.first_air_date || '').substring(0, 4)}) ID:${it.id}`).join('\n');
                    WeChatWorkManager.setSession(fromUser, { state: 'select_result', searchResults: list });
                    yield send(`📊 搜索结果：\n\n${txt}\n\n回复数字选择，或回复"取消"`);
                    return;
                }
                if (ses.state === 'select_result') {
                    const idx = parseInt(content) - 1;
                    const item = (_h = ses.searchResults) === null || _h === void 0 ? void 0 : _h[idx];
                    if (!item) {
                        yield send('请输入有效数字，或回复"取消"');
                        return;
                    }
                    const title = item.title || item.name;
                    const tmdbId = String(item.id);
                    if (ses.searchType === 'tv') {
                        WeChatWorkManager.setSession(fromUser, { state: 'select_season', pendingTmdbId: tmdbId, pendingTitle: title });
                        yield send(`已选择：《${title}》\n\n📅 请指定季数：\n回复数字(如 2)或回复"自动"自动识别`);
                    }
                    else {
                        // 电影直接绑定
                        const task = yield taskRepo.findOne({
                            where: { id: ses.taskId },
                            relations: { account: true },
                            select: { account: { username: true, localStrmPrefix: true, cloudStrmPrefix: true, embyPathReplace: true } }
                        });
                        if (task) {
                            task.tmdbId = tmdbId;
                            task.videoType = 'movie';
                            task.tmdbTitle = title;
                            task.manualTmdbBound = true;
                            task.manualSeason = null;
                            yield taskRepo.save(task);
                            // 异步触发重命名（不阻塞响应）
                            (() => __awaiter(void 0, void 0, void 0, function* () {
                                try {
                                    const cloud189 = Cloud189Service.getInstance(task.account);
                                    yield taskService.autoRename(cloud189, task, { skipDeletion: true });
                                    yield send(`✅ 重命名完成：${title}`);
                                }
                                catch (e) {
                                    yield send(`❌ 重命名失败: ${e.message}`);
                                }
                            }))().catch(() => { });
                            yield send(`✅ 绑定成功！\n🎥 电影：${title}\n🔄 已触发重命名`);
                        }
                        WeChatWorkManager.clearSession(fromUser);
                    }
                    return;
                }
                if (ses.state === 'select_season') {
                    const manualSeason = content === '自动' ? null : parseInt(content);
                    if (content !== '自动' && isNaN(manualSeason)) {
                        yield send('请输入数字或"自动"');
                        return;
                    }
                    const task = yield taskRepo.findOne({
                        where: { id: ses.taskId },
                        relations: { account: true },
                        select: { account: { username: true, localStrmPrefix: true, cloudStrmPrefix: true, embyPathReplace: true } }
                    });
                    if (task) {
                        task.tmdbId = ses.pendingTmdbId;
                        task.videoType = 'tv';
                        task.tmdbTitle = ses.pendingTitle;
                        task.manualSeason = manualSeason;
                        task.manualTmdbBound = true;
                        yield taskRepo.save(task);
                        // 异步触发重命名（不阻塞响应）
                        (() => __awaiter(void 0, void 0, void 0, function* () {
                            try {
                                const cloud189 = Cloud189Service.getInstance(task.account);
                                yield taskService.autoRename(cloud189, task, { skipDeletion: true });
                                yield send(`✅ 重命名完成：${ses.pendingTitle}${manualSeason != null ? ' 第' + manualSeason + '季' : ''}`);
                            }
                            catch (e) {
                                yield send(`❌ 重命名失败: ${e.message}`);
                            }
                        }))().catch(() => { });
                        yield send(`✅ 绑定成功！\n🎥 ${ses.pendingTitle}${manualSeason != null ? ' 第' + manualSeason + '季' : ' (自动识别季)'}\n🔄 已触发重命名，完成后发送通知`);
                    }
                    WeChatWorkManager.clearSession(fromUser);
                    return;
                }
                // 默认帮助
                yield send('🤖 天翼云盘助手\n\n请点击下方菜单进行操作：\n🎬 AI重命名 → 未匹配任务列表\n📋 任务管理 → 查看任务列表');
            }
        }
        catch (e) {
            logTaskEvent(`企微回调处理失败: ${e.message}`);
        }
    }));
    app.post('/api/tasks/:id/execute', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const task = yield taskRepo.findOne({
                where: { id: parseInt(req.params.id) },
                relations: {
                    account: true
                },
                select: {
                    account: {
                        username: true,
                        localStrmPrefix: true,
                        cloudStrmPrefix: true,
                        embyPathReplace: true
                    }
                }
            });
            if (!task)
                throw new Error('任务不存在');
            // 检查任务是否正在执行，防止并发重复执行
            // 但如果任务超过 5 分钟仍为 processing，可能是上次异常退出，强制恢复
            if (task.status === 'processing') {
                const processingStartTime = task.processingStartTime ? new Date(task.processingStartTime) : null;
                const now = new Date();
                const fiveMinutes = 5 * 60 * 1000;
                // 使用 processingStartTime 进行超时检测（比 lastCheckTime 更准确）
                // processingStartTime 在任务开始时就更新，lastCheckTime 只在正常完成后才更新
                // 如果 processingStartTime 为 NULL（旧数据或异常退出），强制恢复
                if (!processingStartTime || (now.getTime() - processingStartTime.getTime() > fiveMinutes)) {
                    logTaskEvent(`任务[${task.resourceName}] processing 状态超时或数据异常，自动恢复为 pending`);
                    task.status = 'pending';
                    task.processingStartTime = null;
                    yield taskRepo.save(task);
                }
                else {
                    logTaskEvent(`任务[${task.resourceName}/${task.shareFolderName || ''}]正在执行中，跳过本次触发`);
                    return res.json({ success: true, data: null, message: '任务正在执行中' });
                }
            }
            logTaskEvent(`================================`);
            const taskName = task.shareFolderName ? (task.resourceName + '/' + task.shareFolderName) : task.resourceName || '未知';
            logTaskEvent(`任务[${taskName}]开始执行`);
            const result = yield taskService.processTask(task, { manualTrigger: true });
            if (result) {
                messageUtil.sendMessage(result);
            }
            res.json({ success: true, data: result });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    // 手动触发重命名（用于 TMDB 绑定后重新重命名）
    app.post('/api/tasks/:id/rename', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const taskId = parseInt(req.params.id);
            const task = yield taskRepo.findOne({
                where: { id: taskId },
                relations: {
                    account: true
                },
                select: {
                    account: {
                        username: true,
                        localStrmPrefix: true,
                        cloudStrmPrefix: true,
                        embyPathReplace: true
                    }
                }
            });
            if (!task)
                throw new Error('任务不存在');
            const account = task.account;
            const cloud189 = Cloud189Service.getInstance(account);
            logTaskEvent(`================================`);
            logTaskEvent(`手动触发重命名: ${task.resourceName}`);
            const result = yield taskService.autoRename(cloud189, task);
            let message = '';
            if (result && result.newFiles && result.newFiles.length > 0) {
                message = `✅《${task.resourceName}》重命名完成\n已处理 ${result.newFiles.length} 个文件`;
                if (result.renameMessages && result.renameMessages.length > 0) {
                    const details = result.renameMessages.slice(0, 10);
                    message += `\n${details.join('\n')}`;
                    if (result.renameMessages.length > 10) {
                        message += `\n└─ ... 等${result.renameMessages.length}个文件`;
                    }
                }
                messageUtil.sendMessage(message);
                // 重命名后触发 Emby 扫库
                const { EmbyService } = require('./services/emby');
                const embyService = new EmbyService(messageUtil);
                try {
                    logTaskEvent(`执行Emby通知: ${task.resourceName}`);
                    yield embyService.notify(task);
                }
                catch (e) {
                    logTaskEvent(`Emby扫库失败: ${e.message}`);
                }
            }
            else {
                message = `ℹ️《${task.resourceName}》无需重命名（文件已是正确格式或无文件）`;
            }
            res.json({ success: true, data: result, message });
        }
        catch (error) {
            logTaskEvent(`手动重命名失败: ${error.message}`);
            res.json({ success: false, error: error.message });
        }
    }));
    // 根据任务生成STRM文件
    app.post('/api/tasks/strm', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const taskIds = req.body.taskIds;
            if (!taskIds || taskIds.length == 0) {
                throw new Error('任务ID不能为空');
            }
            const overwrite = req.body.overwrite || false;
            taskService.createStrmFileByTask(taskIds, overwrite);
            return res.json({ success: true, data: 'ok' });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    // 获取目录树
    app.get('/api/folders/:accountId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const accountId = parseInt(req.params.accountId);
            const folderId = req.query.folderId || '-11';
            const forceRefresh = req.query.refresh === 'true';
            const cacheKey = `folders_${accountId}_${folderId}`;
            // forceRefresh 为true 则清空所有folders_开头的缓存
            if (forceRefresh) {
                folderCache.clearPrefix("folders_");
            }
            if (folderCache.has(cacheKey)) {
                return res.json({ success: true, data: folderCache.get(cacheKey) });
            }
            const account = yield accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('账号不存在');
            }
            const cloud189 = Cloud189Service.getInstance(account);
            const folders = yield cloud189.getFolderNodes(folderId);
            if (!folders) {
                throw new Error('获取目录失败');
            }
            folderCache.set(cacheKey, folders);
            res.json({ success: true, data: folders });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    // 获取家庭空间目录树（供CAS中转目录选择）
    app.get('/api/family/folders/:accountId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const accountId = parseInt(req.params.accountId);
            const folderId = req.query.folderId || '';
            const account = yield accountRepo.findOneBy({ id: accountId });
            if (!account)
                throw new Error('账号不存在');
            const cloud189 = Cloud189Service.getInstance(account);
            const familyInfo = yield cloud189.getFamilyInfo();
            if (!familyInfo)
                throw new Error('当前账号无家庭空间主账号');
            const folders = yield cloud189.listFamilyFolderNodes(familyInfo.familyId, folderId);
            res.json({ success: true, data: folders, familyId: familyInfo.familyId });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    // 根据分享链接获取文件目录
    app.get('/api/share/folders/:accountId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const taskId = parseInt(req.query.taskId);
            const folderId = req.query.folderId;
            const forceRefresh = req.query.refresh === 'true';
            const rawShareLink = typeof req.query.shareLink === 'string' ? req.query.shareLink.trim() : '';
            const accessCodeFromQuery = typeof req.query.accessCode === 'string' ? req.query.accessCode.trim() : '';
            const cacheScope = rawShareLink || `task_${taskId}`;
            const cacheKey = `share_folders_${taskId}_${cacheScope}_${folderId}`;
            if (forceRefresh) {
                folderCache.clearPrefix(`share_folders_${taskId}_`);
            }
            if (folderCache.has(cacheKey)) {
                return res.json({ success: true, data: folderCache.get(cacheKey) });
            }
            const task = yield taskRepo.findOneBy({ id: parseInt(taskId) });
            if (!task) {
                throw new Error('任务不存在');
            }
            const account = yield accountRepo.findOneBy({ id: req.params.accountId });
            if (!account) {
                throw new Error('账号不存在');
            }
            const cloud189 = Cloud189Service.getInstance(account);
            let shareId = task.shareId;
            let shareMode = task.shareMode;
            let shareFileId = task.shareFileId;
            let resourceName = task.resourceName;
            let accessCode = task.accessCode;
            if (rawShareLink) {
                const shareCode = cloud189Utils.parseShareCode(rawShareLink);
                if (!shareCode) {
                    throw new Error('分享链接无效');
                }
                const shareInfo = yield taskService.getShareInfo(cloud189, shareCode);
                accessCode = accessCodeFromQuery || task.accessCode;
                if (shareInfo.shareMode == 1) {
                    if (!accessCode) {
                        throw new Error('分享链接为私密链接, 请输入提取码');
                    }
                    const accessCodeResponse = yield cloud189.checkAccessCode(shareCode, accessCode);
                    if (!accessCodeResponse || !accessCodeResponse.shareId) {
                        throw new Error('提取码无效');
                    }
                    shareInfo.shareId = accessCodeResponse.shareId;
                }
                shareId = shareInfo.shareId;
                shareMode = shareInfo.shareMode || (accessCode ? 2 : 1);
                shareFileId = shareInfo.fileId;
                resourceName = shareInfo.fileName || task.resourceName;
            }
            if (folderId == -11) {
                return res.json({ success: true, data: [{ id: shareFileId, name: resourceName }] });
            }
            const shareDir = yield cloud189.listShareDir(shareId, req.query.folderId, shareMode, accessCode);
            if (!shareDir || !shareDir.fileListAO) {
                return res.json({ success: true, data: [] });
            }
            const folders = shareDir.fileListAO.folderList;
            folderCache.set(cacheKey, folders);
            res.json({ success: true, data: folders });
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }));
    // 获取目录下的文件
    app.get('/api/folder/files', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { accountId, taskId } = req.query;
            const account = yield accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('账号不存在');
            }
            const task = yield taskRepo.findOneBy({ id: taskId });
            if (!task) {
                throw new Error('任务不存在');
            }
            const cloud189 = Cloud189Service.getInstance(account);
            const fileList = yield taskService.getAllFolderFiles(cloud189, task);
            res.json({ success: true, data: fileList });
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }));
    app.post('/api/files/rename', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { taskId, accountId, files, sourceRegex, targetRegex } = req.body;
        if (files.length == 0) {
            throw new Error('未获取到需要修改的文件');
        }
        const account = yield accountRepo.findOneBy({ id: accountId });
        if (!account) {
            throw new Error('账号不存在');
        }
        const task = yield taskService.getTaskById(taskId);
        if (!task) {
            throw new Error('任务不存在');
        }
        logTaskEvent(`[批量重命名] 获取用户确认，开始对 ${files.length} 个文件执行天翼云远端重命名...`);
        // 从realFolderName中获取文件夹名称 删除对应的本地文件
        const folderName = task.realFolderName.substring(task.realFolderName.indexOf('/') + 1);
        const strmService = new StrmService();
        const strmEnabled = ConfigService.getConfigValue('strm.enable') && task.account.localStrmPrefix;
        if (strmEnabled && task.enableSystemProxy) {
            throw new Error('系统代理模式已移除');
        }
        const newFiles = files.map(file => ({ id: file.fileId, name: file.destFileName }));
        if (task.enableSystemProxy) {
            throw new Error('系统代理模式已移除');
        }
        const cloud189 = Cloud189Service.getInstance(account);
        const result = [];
        const successFiles = [];
        const renameDetails = []; // 保存重命名详情（原名→新名）
        for (const file of files) {
            const renameResult = yield cloud189.renameFile(file.fileId, file.destFileName);
            if (!renameResult) {
                logTaskEvent(`[批量重命名] 接口异常导致失败`);
                throw new Error('重命名失败');
            }
            if (renameResult.res_code != 0) {
                logTaskEvent(`[批量重命名] 原文件 ${file.oldName} 失败: ${renameResult.res_msg}`);
                result.push(`文件${file.destFileName} ${renameResult.res_msg}`);
            }
            else {
                logTaskEvent(`[批量重命名] 成功: ${file.oldName} => ${file.destFileName}`);
                if (strmEnabled) {
                    // 从realFolderName中获取文件夹名称 删除对应的本地文件
                    const oldFile = path.join(folderName, file.oldName);
                    yield strmService.delete(path.join(task.account.localStrmPrefix, oldFile));
                }
                successFiles.push({ id: file.fileId, name: file.destFileName });
                renameDetails.push({ oldName: file.oldName, newName: file.destFileName });
            }
        }
        logTaskEvent(`[批量重命名] 对选中的文件重命名请求执行完成。成功: ${successFiles.length}，失败: ${result.length}`);
        // 重新生成STRM文件
        if (strmEnabled) {
            strmService.generate(task, successFiles, false, false);
        }
        if (sourceRegex && targetRegex) {
            task.sourceRegex = sourceRegex;
            task.targetRegex = targetRegex;
            taskRepo.save(task);
        }
        if (result.length > 0) {
            logTaskEvent(result.join('\n'));
        }
        // 发送重命名完成通知（带路径，触发 webhook）
        if (successFiles.length > 0) {
            const { MessageUtil } = require('./services/message');
            const messageUtil = new MessageUtil();
            // 确保路径以 / 开头（SmartStrm webhook 要求）
            let folderPath = task.realFolderName || task.realFolderId || '';
            if (folderPath && !folderPath.startsWith('/')) {
                folderPath = '/' + folderPath;
            }
            // 构建重命名详情列表（超过6个时中间省略）
            const detailLines = [];
            if (renameDetails.length > 6) {
                const first3 = renameDetails.slice(0, 3);
                const last3 = renameDetails.slice(-3);
                first3.forEach(d => detailLines.push(`├─ ${d.oldName} → ${d.newName}`));
                detailLines.push(`├─ ... 省略 ${renameDetails.length - 6} 个`);
                last3.forEach((d, i) => detailLines.push(i === last3.length - 1 ? `└─ ${d.oldName} → ${d.newName}` : `├─ ${d.oldName} → ${d.newName}`));
            }
            else {
                renameDetails.forEach((d, i) => {
                    detailLines.push(i === renameDetails.length - 1 ? `└─ ${d.oldName} → ${d.newName}` : `├─ ${d.oldName} → ${d.newName}`);
                });
            }
            const message = `✅《${task.resourceName}》重命名完成\n已处理 ${successFiles.length} 个文件\n📁 ${folderPath}\n${detailLines.join('\n')}`;
            messageUtil.sendMessage(message);
            logTaskEvent(`[批量重命名] 已发送重命名完成通知，路径: ${folderPath}`);
        }
        res.json({ success: true, data: result });
    }));
    app.post('/api/tasks/executeAll', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        taskService.processAllTasks(true);
        res.json({ success: true, data: null });
    }));
    // 系统版本信息
    app.get('/api/system/version', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        res.json({
            success: true,
            data: {
                version: packageJson.version,
                name: packageJson.name,
                description: packageJson.description,
                changelog: [
                    '🐛 修复 AI 重命名弹窗层级遮挡问题',
                    '🐛 修复 AI 重命名文件选择丢失问题',
                    '🔧 优化弹窗 z-index 层级管理'
                ]
            }
        });
    }));
    // 系统设置
    app.get('/api/settings', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        res.json({ success: true, data: ConfigService.getConfig() });
    }));
    app.post('/api/settings', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const settings = req.body;
        const cron = require('node-cron');
        const validateCron5 = (expr, name) => {
            if (expr) {
                if (expr.trim().split(/\s+/).length !== 5) {
                    throw new Error(`${name}必须是5位格式的Cron表达式（分 时 日 月 周）`);
                }
                if (!cron.validate(expr)) {
                    throw new Error(`${name}无效`);
                }
            }
        };
        try {
            validateCron5((_a = settings.task) === null || _a === void 0 ? void 0 : _a.taskCheckCron, '任务定时检查Cron');
            validateCron5((_b = settings.task) === null || _b === void 0 ? void 0 : _b.cleanRecycleCron, '自动清空回收站Cron');
            validateCron5((_c = settings.task) === null || _c === void 0 ? void 0 : _c.checkinCron, '每日云盘自动签到Cron');
        }
        catch (err) {
            return res.json({ success: false, error: err.message });
        }
        // 如果cloudSaver的配置变更 就清空cstoken.json
        if (((_d = settings.cloudSaver) === null || _d === void 0 ? void 0 : _d.baseUrl) != ConfigService.getConfigValue('cloudSaver.baseUrl')
            || ((_e = settings.cloudSaver) === null || _e === void 0 ? void 0 : _e.username) != ConfigService.getConfigValue('cloudSaver.username')
            || ((_f = settings.cloudSaver) === null || _f === void 0 ? void 0 : _f.password) != ConfigService.getConfigValue('cloudSaver.password')) {
            clearCloudSaverToken();
        }
        SchedulerService.handleScheduleTasks(settings, taskService);
        ConfigService.setConfig(settings);
        yield botManager.handleBotStatus((_h = (_g = settings.telegram) === null || _g === void 0 ? void 0 : _g.bot) === null || _h === void 0 ? void 0 : _h.botToken, (_k = (_j = settings.telegram) === null || _j === void 0 ? void 0 : _j.bot) === null || _k === void 0 ? void 0 : _k.chatId, (_m = (_l = settings.telegram) === null || _l === void 0 ? void 0 : _l.bot) === null || _m === void 0 ? void 0 : _m.enable);
        // 修改配置, 重新实例化消息推送
        messageUtil.updateConfig();
        Cloud189Service.setProxy();
        res.json({ success: true, data: null });
    }));
    app.get('/api/version', (req, res) => {
        res.json({
            version: currentVersion,
            uptime: process.uptime()
        });
    });
    // 解析分享链接
    app.post('/api/share/parse', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const shareLink = req.body.shareLink;
            const accountId = req.body.accountId;
            const accessCode = req.body.accessCode;
            const shareFolders = yield taskService.parseShareFolderByShareLink(shareLink, accountId, accessCode);
            let tmdbInfo = null;
            if (shareFolders && shareFolders.length > 0) {
                const fileName = shareFolders[0].name;
                tmdbInfo = yield taskService.recognizeTmdbInfo(fileName);
            }
            res.json({ success: true, data: shareFolders, tmdbInfo });
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }));
    // TMDB搜索API
    app.post('/api/tmdb/search', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { keyword, type } = req.body;
            if (!keyword) {
                throw new Error('搜索关键词不能为空');
            }
            const tmdbApiKey = ConfigService.getConfigValue('tmdb.tmdbApiKey');
            if (!tmdbApiKey) {
                throw new Error('TMDB API Key未配置');
            }
            const tmdbService = new TMDBService();
            const searchType = type || 'movie';
            // 使用 searchByType 方法获取搜索结果列表
            const results = yield tmdbService.searchByType(keyword, searchType);
            // 格式化返回数据，补充完整的字段
            const formattedResults = results.slice(0, 10).map(item => ({
                id: item.id,
                title: item.title,
                originalTitle: item.name || item.title,
                year: (item.release_date || item.first_air_date || '').substring(0, 4) || null,
                overview: item.overview || '',
                posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                voteAverage: item.vote_average || 0,
                type: searchType
            }));
            res.json({ success: true, data: formattedResults });
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }));
    // 保存常用目录
    app.post('/api/saveFavorites', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const favorites = req.body.favorites;
            const accountId = req.body.accountId;
            if (!accountId) {
                throw new Error('账号ID不能为空');
            }
            // 先删除该账号下的所有常用目录
            yield commonFolderRepo.delete({ accountId: accountId });
            // 构建新的常用目录数据
            const commonFolders = favorites.map(favorite => ({
                accountId: accountId,
                name: favorite.name,
                path: favorite.path,
                id: favorite.id
            }));
            if (commonFolders.length == 0) {
                res.json({ success: true, data: [] });
                return;
            }
            // 批量保存新的常用目录
            const result = yield commonFolderRepo.save(commonFolders);
            res.json({ success: true, data: result });
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }));
    // 获取常用目录
    app.get('/api/favorites/:accountId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const accountId = req.params.accountId;
            if (!accountId) {
                throw new Error('账号ID不能为空');
            }
            const favorites = yield commonFolderRepo.find({
                where: { accountId: accountId },
                order: { id: 'ASC' }
            });
            res.json({ success: true, data: favorites });
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }));
    // emby 回调
    app.post('/emby/notify', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            yield embyService.handleWebhookNotification(req.body);
            res.status(200).send('OK');
        }
        catch (error) {
            console.log(error);
            res.status(500).send('Error');
        }
    }));
    app.post('/api/chat', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { message } = req.body;
        try {
            let userMessage = message.trim();
            if (!userMessage) {
                res.json({ success: true });
                return;
            }
            // 打印 AI 聊天开始日志
            logTaskEvent(`[AI 聊天] 收到用户消息: "${userMessage}"`);
            AIService.streamChat(userMessage, (chunk) => __awaiter(void 0, void 0, void 0, function* () {
                if (chunk === '[END]') {
                    // 打印 AI 聊天结束日志
                    logTaskEvent(`[AI 聊天] 响应结束`);
                }
                sendAIMessage(chunk);
            }));
            res.json({ success: true });
        }
        catch (error) {
            logTaskEvent(`[AI 聊天] 处理聊天消息失败: ${error.message}`);
            console.error('处理聊天消息失败:', error);
            res.status(500).json({ success: false, error: '处理消息失败' });
        }
    }));
    app.post('/api/chat/enhanced', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { message } = req.body;
        try {
            let userMessage = message.trim();
            if (!userMessage) {
                return res.json({ success: true });
            }
            // 打印 AI 增强助手消息日志
            logTaskEvent(`[AI 助手] 收到增强聊天消息: "${userMessage}"`);
            const { AIIntentService, AI_FUNCTIONS } = require('./services/AIIntentService');
            const intentService = new AIIntentService();
            const shareLink = intentService.detectShareLink(userMessage);
            if (shareLink) {
                logTaskEvent(`[AI 助手] 检测到分享链接: ${shareLink}，开始解析并尝试智能创建任务...`);
                AIService.streamChatWithFunctions(userMessage, AI_FUNCTIONS, (chunk) => {
                    if (chunk !== '[END]') {
                        sendAIMessage(chunk);
                    }
                }, (functionCall) => __awaiter(void 0, void 0, void 0, function* () {
                    const { name, arguments: args } = functionCall;
                    logTaskEvent(`[AI 助手] 识别到分享链接函数调用: ${name}, 参数: ${JSON.stringify(args)}`);
                    if (name === 'smart_create') {
                        const result = {
                            type: 'task_preview',
                            message: '检测到分享链接，已为您准备创建任务',
                            preview: {
                                shareLink: args.shareLink,
                                resourceName: '未识别资源',
                                videoType: 'unknown',
                                suggestedPath: '/media/',
                                needPassword: false
                            }
                        };
                        sendAIMessage(JSON.stringify(result));
                    }
                }));
                return res.json({ success: true });
            }
            let functionCallResult = null;
            let textResponse = '';
            yield new Promise((resolve, reject) => {
                AIService.streamChatWithFunctions(userMessage, AI_FUNCTIONS, (chunk) => {
                    if (chunk !== '[END]') {
                        textResponse += chunk;
                    }
                }, (functionCall) => {
                    functionCallResult = functionCall;
                    resolve();
                });
                setTimeout(() => {
                    resolve();
                }, 10000);
            });
            if (functionCallResult) {
                logTaskEvent(`[AI 助手] 匹配到系统意图函数: ${functionCallResult.name}, 参数: ${JSON.stringify(functionCallResult.arguments)}`);
                return res.json({
                    success: true,
                    type: 'function_call',
                    functionCall: functionCallResult
                });
            }
            if (textResponse) {
                logTaskEvent(`[AI 助手] AI 文本回复: "${textResponse.substring(0, 100)}${textResponse.length > 100 ? '...' : ''}"`);
                sendAIMessage(textResponse);
            }
            return res.json({ success: true });
        }
        catch (error) {
            logTaskEvent(`[AI 助手] 处理增强聊天消息失败: ${error.message}`);
            console.error('处理增强聊天消息失败:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }));
    app.post('/api/chat/execute-function', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { operation, params } = req.body;
        try {
            logTaskEvent(`[AI 助手] 执行操作: ${operation}, 参数: ${JSON.stringify(params)}`);
            const AIOperationHandler = require('./services/AIOperationHandler');
            const { AIIntentService } = require('./services/AIIntentService');
            const handler = new AIOperationHandler(taskService);
            const intentService = new AIIntentService();
            if (intentService.requiresConfirmation(operation)) {
                logTaskEvent(`[AI 助手] 操作 ${operation} 需要用户二次确认`);
                const dialog = intentService.buildConfirmDialog(operation, params);
                return res.json(dialog);
            }
            const result = yield handler.executeOperation(operation, params);
            const message = intentService.formatSuccessMessage(operation, result.result);
            logTaskEvent(`[AI 助手] 操作 ${operation} 执行成功，结果: ${JSON.stringify(result.result)}`);
            return res.json(Object.assign({ type: 'operation_result', success: result.success, message }, result.result));
        }
        catch (error) {
            logTaskEvent(`[AI 助手] 执行操作 ${operation} 失败: ${error.message}`);
            console.error('执行Function失败:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }));
    app.post('/api/chat/confirm', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { operation, params, confirmed } = req.body;
        try {
            logTaskEvent(`[AI 助手] 操作确认状态: ${operation}, confirmed=${confirmed}`);
            if (!confirmed) {
                logTaskEvent(`[AI 助手] 用户取消了操作: ${operation}`);
                return res.json({
                    success: false,
                    message: '操作已取消'
                });
            }
            const AIOperationHandler = require('./services/AIOperationHandler');
            const handler = new AIOperationHandler(taskService);
            const result = yield handler.executeOperation(operation, params);
            logTaskEvent(`[AI 助手] 用户确认后操作 ${operation} 执行完成，成功=${result.success}`);
            return res.json(Object.assign({ type: 'operation_result', success: result.success, message: result.success ? '操作执行成功' : '操作执行失败' }, result.result));
        }
        catch (error) {
            logTaskEvent(`[AI 助手] 确认并执行操作 ${operation} 失败: ${error.message}`);
            console.error('确认操作失败:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }));
    app.post('/api/chat/confirm-preview', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const { preview } = req.body;
        try {
            logTaskEvent(`[AI 助手] 用户确认智能预览任务，准备创建: ${preview.shareLink}`);
            const AIOperationHandler = require('./services/AIOperationHandler');
            const handler = new AIOperationHandler(taskService);
            const result = yield handler.executeOperation('create_task', {
                shareLink: preview.shareLink,
                targetFolder: preview.suggestedPath,
                accountId: 1
            });
            logTaskEvent(`[AI 助手] 智能任务创建结果: 成功=${result.success}`);
            return res.json({
                success: result.success,
                taskId: (_a = result.result) === null || _a === void 0 ? void 0 : _a.taskId,
                message: result.success ? '任务创建成功' : '任务创建失败',
                error: result.error
            });
        }
        catch (error) {
            logTaskEvent(`[AI 助手] 确认并创建预览任务失败: ${error.message}`);
            console.error('确认创建任务失败:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }));
    // STRM相关API
    app.post('/api/strm/generate-all', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const overwrite = req.body.overwrite || false;
            const accountIds = req.body.accountIds;
            if (!accountIds || accountIds.length == 0) {
                throw new Error('账号ID不能为空');
            }
            const accounts = yield accountRepo.find({
                where: {
                    localStrmPrefix: Not(IsNull()),
                    cloudStrmPrefix: Not(IsNull()),
                    id: In(accountIds)
                }
            });
            const strmService = new StrmService();
            strmService.generateAll(accounts, overwrite);
            res.json({ success: true, data: null });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    app.get('/api/strm/list', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const path = req.query.path || '';
            const strmService = new StrmService();
            const files = yield strmService.listStrmFiles(path);
            res.json({ success: true, data: files });
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    // ai重命名
    app.post('/api/files/ai-rename', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { taskId, files } = req.body;
            // 增加参数校验，防止 files 为 undefined/null 导致异常
            if (!files || !Array.isArray(files) || files.length === 0) {
                throw new Error('未获取到需要修改的文件');
            }
            const task = yield taskService.getTaskById(taskId);
            if (!task) {
                throw new Error('任务不存在');
            }
            logTaskEvent(`[批量重命名] 开始对任务 [${task.resourceName}] 选中的 ${files.length} 个文件使用 AI 分析和重命名建议...`);
            // 开始ai分析
            const resourceInfo = yield taskService._analyzeResourceInfo(task.resourceName, files, 'file', task);
            const renamePreviewResult = yield taskService.handleAiRename(files, resourceInfo);
            logTaskEvent(`[批量重命名] AI 分析完成，生成了 ${renamePreviewResult.length} 条有效建议，等待用户确认`);
            return res.json({ success: true, data: renamePreviewResult });
        }
        catch (error) {
            // 添加错误日志输出，便于排查问题
            logTaskEvent(`[批量重命名] AI 分析失败: ${error.message}`);
            res.json({ success: false, error: error.message });
        }
    }));
    // OpenAI 测试与模型获取 API
    app.post('/api/openai/test', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { baseUrl, apiKey, model } = req.body;
            if (!apiKey)
                throw new Error('API Key不能为空');
            // 构建测试请求参数 (采用极轻量的内容探测)
            const targetUrl = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
            const got = require('got');
            const response = yield got.post(targetUrl, {
                json: {
                    model: model || 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: 'Connection test. Reply exactly with "OK".' }],
                    max_tokens: 5
                },
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                responseType: 'json',
                timeout: 10000 // 10秒超时
            });
            const data = response.body;
            if (data && data.choices && data.choices.length > 0) {
                return res.json({ success: true, data: data.choices[0].message.content });
            }
            else {
                throw new Error(`响应格式异常: ${JSON.stringify(data)}`);
            }
        }
        catch (error) {
            let errorDetails = error.message;
            if (error.response && error.response.body) {
                errorDetails += ` : ${JSON.stringify(error.response.body)}`;
            }
            res.json({ success: false, error: errorDetails });
        }
    }));
    app.post('/api/openai/models', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { baseUrl, apiKey } = req.body;
            if (!apiKey)
                throw new Error('API Key不能为空');
            const targetUrl = baseUrl.endsWith('/') ? `${baseUrl}models` : `${baseUrl}/models`;
            const got = require('got');
            const response = yield got.get(targetUrl, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                responseType: 'json',
                timeout: 10000 // 10秒超时
            });
            const data = response.body;
            if (data && data.data && Array.isArray(data.data)) {
                // OpenAI API 的 models 端点通常返回 { object: 'list', data: [ { id: 'gpt-4', ... } ] }
                const models = data.data.map(item => ({ id: item.id })).sort((a, b) => a.id.localeCompare(b.id));
                return res.json({ success: true, data: models });
            }
            else {
                throw new Error(`未获取到有效的模型列表: ${JSON.stringify(data)}`);
            }
        }
        catch (error) {
            let errorDetails = error.message;
            if (error.response && error.response.body) {
                errorDetails += ` : ${JSON.stringify(error.response.body)}`;
            }
            res.json({ success: false, error: errorDetails });
        }
    }));
    app.post('/api/custom-push/test', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const configTest = req.body;
            if (yield new CustomPushService([]).testPush(configTest)) {
                res.json({ success: true, data: null });
            }
            else {
                res.json({ success: false, error: '推送测试失败' });
            }
        }
        catch (error) {
            res.json({ success: false, error: error.message });
        }
    }));
    // 全局错误处理中间件
    app.use((err, req, res, next) => {
        console.error('捕获到全局异常:', err.message);
        res.status(500).json({ success: false, error: err.message });
    });
    initSSE(app);
    // 初始化cloudsaver
    setupCloudSaverRoutes(app);
    // 初始化hdhive（影巢）
    setupHDHiveRoutes(app);
    // 启动服务器
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`服务器运行在 http://localhost:${port}`);
        // 启动 TMDB 后台补全服务
        tmdbBackfillService.start();
    });
})).catch(error => {
    console.error('数据库连接失败:', error);
});
