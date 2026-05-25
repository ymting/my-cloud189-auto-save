require('dotenv').config();
const express = require('express');
const { AppDataSource } = require('./database');
const { Account, Task, CommonFolder } = require('./entities');
const { TaskService } = require('./services/task');
const { Cloud189Service } = require('./services/cloud189');
const { MessageUtil } = require('./services/message');
const { CacheManager } = require('./services/CacheManager')
const taskCacheManager = require('./services/TaskCacheManager');
const ConfigService = require('./services/ConfigService');
const packageJson = require('../package.json');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const { SchedulerService } = require('./services/scheduler');
const { logTaskEvent, initSSE, sendAIMessage } = require('./utils/logUtils');
const TelegramBotManager = require('./utils/TelegramBotManager');
const fs = require('fs').promises;
const path = require('path');
const { setupCloudSaverRoutes, clearCloudSaverToken } = require('./sdk/cloudsaver');
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
        path: './data/sessions',  // session文件存储路径
        ttl: 30 * 24 * 60 * 60,  // session过期时间，单位秒
        reapInterval: 3600,       // 清理过期session间隔，单位秒
        retries: 0,           // 设置重试次数为0
        logFn: () => {},      // 禁用内部日志
        reapAsync: true,      // 异步清理过期session
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
    } else {
        // API 请求返回 401，页面请求重定向到登录页
        if (req.path.startsWith('/api/')) {
            res.status(401).json({ success: false, error: '未登录' });
        } else {
            res.redirect('/login');
        }
    }
};

// 添加根路径处理
app.get('/', (req, res) => {
    if (!req.session.authenticated) {
        res.redirect('/login');
    } else {
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
    } else {
        res.json({ success: false, error: '用户名或密码错误' });
    }
});
app.use(express.static(path.join(__dirname,'public')));
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
AppDataSource.initialize().then(async () => {
    // 当前版本:
    const currentVersion = packageJson.version;
    console.log(`当前系统版本: ${currentVersion}`);
    console.log('数据库连接成功');

    // 初始化 STRM 目录权限
    const strmBaseDir = path.join(__dirname, '../strm');
    try {
        await fs.mkdir(strmBaseDir, { recursive: true });
        if (process.getuid && process.getuid() === 0) {
            await fs.chown(strmBaseDir, parseInt(process.env.PUID || 0), parseInt(process.env.PGID || 0));
        }
        await fs.chmod(strmBaseDir, 0o777);
        console.log('STRM目录权限初始化完成');
    } catch (error) {
        console.error('STRM目录权限初始化失败:', error);
    }

    const accountRepo = AppDataSource.getRepository(Account);
    const taskRepo = AppDataSource.getRepository(Task);
    const commonFolderRepo = AppDataSource.getRepository(CommonFolder);
    const taskService = new TaskService(taskRepo, accountRepo);
    const embyService = new EmbyService(taskService)
    const messageUtil = new MessageUtil();
    // 机器人管理
    const botManager = TelegramBotManager.getInstance();
    // 初始化机器人
    await botManager.handleBotStatus(
        ConfigService.getConfigValue('telegram.bot.botToken'),
        ConfigService.getConfigValue('telegram.bot.chatId'),
        ConfigService.getConfigValue('telegram.bot.enable')
    );
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
    await SchedulerService.initTaskJobs(taskRepo, taskService);
    
    // 账号相关API
    app.get('/api/accounts', async (req, res) => {
        const accounts = await accountRepo.find();
        // 获取容量
        for (const account of accounts) {
            
            account.capacity = {
                cloudCapacityInfo: {usedSize:0,totalSize:0},
                familyCapacityInfo: {usedSize:0,totalSize:0}
            }
            // 如果账号名是s打头 则不获取容量
            if (!account.username.startsWith('n_')) {
                const cloud189 = Cloud189Service.getInstance(account);
                const capacity = await cloud189.getUserSizeInfo()
                if (capacity && capacity.res_code == 0) {
                    account.capacity.cloudCapacityInfo = capacity.cloudCapacityInfo;
                    account.capacity.familyCapacityInfo = capacity.familyCapacityInfo;
                }
            }
            account.original_username = account.username;
            // username脱敏
            account.username = account.username.replace(/(.{3}).*(.{4})/, '$1****$2');
        }
        res.json({ success: true, data: accounts });
    });

    app.post('/api/accounts', async (req, res) => {
        try {
            const account = accountRepo.create(req.body);
            // 尝试登录, 登录成功写入store, 如果需要验证码, 则返回用户验证码图片
            if (!account.username.startsWith('n_') && account.password) {
                // 尝试登录
                const cloud189 = Cloud189Service.getInstance(account);
                const loginResult = await cloud189.login(account.username, account.password, req.body.validateCode);
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
                    const familyInfo = await cloud189.getFamilyInfo();
                    if (familyInfo && familyInfo.familyId) {
                        account.familyId = String(familyInfo.familyId);
                        console.log(`[账号] 自动检测家庭组: ${account.username} -> familyId: ${account.familyId}`);
                    }
                } catch (e) {
                    console.log(`[账号] 获取家庭信息失败: ${e.message}`);
                }
            }
            // 支持前端传入的家庭中转目录配置（可选）
            if (req.body.familyFolderId) {
                account.familyFolderId = req.body.familyFolderId;
            }
            await accountRepo.save(account);
            res.json({ success: true, data: { accountId: account.id, familyId: account.familyId } });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

     // 清空回收站
     app.delete('/api/accounts/recycle', async (req, res) => {
        try {
            taskService.clearRecycleBin(true, true);
            res.json({ success: true, data: "ok" });
        }catch (error) {
            res.json({ success: false, error: error.message });
        }
    })

    app.delete('/api/accounts/:id', async (req, res) => {
        try {
            const account = await accountRepo.findOneBy({ id: parseInt(req.params.id) });
            if (!account) throw new Error('账号不存在');
            await accountRepo.remove(account);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });
    app.put('/api/accounts/:id/strm-prefix', async (req, res) => {
        try {
            const accountId = parseInt(req.params.id);
            const { strmPrefix, type } = req.body;
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) throw new Error('账号不存在');
            if (type == 'local') {
                account.localStrmPrefix = strmPrefix;
            }
            if (type == 'cloud') {
                account.cloudStrmPrefix = strmPrefix;
            }
            if (type == 'emby') {
                account.embyPathReplace = strmPrefix;
            }
            await accountRepo.save(account);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    })

    // 修改别名
    app.put('/api/accounts/:id/alias', async (req, res) => {
        try {
            const accountId = parseInt(req.params.id);
            const { alias } = req.body;
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) throw new Error('账号不存在');
            account.alias = alias;
            await accountRepo.save(account);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    })
    app.put('/api/accounts/:id/default', async (req, res) => {
        try {
            const accountId = parseInt(req.params.id);
            // 清除所有账号的默认状态
            await accountRepo.update({}, { isDefault: false });
            // 设置指定账号为默认
            await accountRepo.update({ id: accountId }, { isDefault: true });
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    })

    // 获取账号的家庭目录树（用于前端选择中转目录）
    app.get('/api/accounts/:id/family/folders', async (req, res) => {
        try {
            const accountId = parseInt(req.params.id);
            const folderId = req.query.folderId || '';
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) throw new Error('账号不存在');

            const cloud189 = Cloud189Service.getInstance(account);
            const familyInfo = await cloud189.getFamilyInfo();
            if (!familyInfo) throw new Error('该账号无家庭空间');

            const folders = await cloud189.listFamilyFolderNodes(String(familyInfo.familyId), folderId);
            res.json({ success: true, data: { familyId: String(familyInfo.familyId), folders } });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 更新账号的家庭中转目录
    app.put('/api/accounts/:id/family-folder', async (req, res) => {
        try {
            const accountId = parseInt(req.params.id);
            const { familyFolderId } = req.body;
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) throw new Error('账号不存在');
            account.familyFolderId = familyFolderId || '';
            await accountRepo.save(account);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 任务相关API
    app.get('/api/tasks', async (req, res) => {
        const { status, search } = req.query;
        let whereClause = { };

        // 基础条件（AND）
        if (status && status !== 'all') {
            if (status === 'processing') {
                // 追剧中 = processing 或 pending但有内容
                whereClause = [
                    { status: 'processing', enableSystemProxy: Or(IsNull(), false) },
                    { status: 'pending', currentEpisodes: MoreThan(0), enableSystemProxy: Or(IsNull(), false) }
                ];
            } else if (status === 'pending') {
                // 等待中 = pending且无内容
                whereClause = [
                    { status: 'pending', currentEpisodes: 0, enableSystemProxy: Or(IsNull(), false) },
                    { status: 'pending', currentEpisodes: IsNull(), enableSystemProxy: Or(IsNull(), false) }
                ];
            } else {
                whereClause.status = status;
            }
        }
        if (!Array.isArray(whereClause)) {
            whereClause.enableSystemProxy = Or(IsNull(), false);
        }

        // 添加搜索过滤
        if (search) {
            const searchConditions = [
                { realFolderName: Like(`%${search}%`) },
                { remark: Like(`%${search}%`) },
                { account: { username: Like(`%${search}%`) } }
            ];
            if (Array.isArray(whereClause)) {
                // 数组where（OR条件）时，与搜索条件做笛卡尔积
                const expandedWhere = [];
                for (const baseCond of whereClause) {
                    for (const searchCond of searchConditions) {
                        expandedWhere.push({ ...baseCond, ...searchCond });
                    }
                }
                whereClause = expandedWhere;
            } else if (Object.keys(whereClause).length > 0) {
                whereClause = searchConditions.map(searchCond => ({
                    ...whereClause,
                    ...searchCond
                }));
            } else {
                whereClause = searchConditions;
            }
        }
        const tasks = await taskRepo.find({
            order: { id: 'DESC' },
            relations: {
                account: true
            },
            select: {
                account: {
                    username: true
                }
            },
            where: whereClause
        });
        const taskEventHandler = new TaskEventHandler();
        for (const task of tasks) {
            const hasSavedDisplay = task.lastSavedDisplayText || task.lastSavedFileName || task.missingEpisodes;
            if (hasSavedDisplay || !task.lastFileUpdateTime || !task.realFolderId || task.enableSystemProxy) {
                continue;
            }
            try {
                const account = await accountRepo.findOneBy({ id: task.accountId });
                if (!account) {
                    continue;
                }
                task.account = account;
                const taskFiles = await taskService.getFilesByTask(task);
                const latestSavedDisplay = taskEventHandler.buildLatestSavedDisplay(task, taskFiles);
                if (!latestSavedDisplay.lastSavedDisplayText && !latestSavedDisplay.lastSavedFileName) {
                    continue;
                }
                task.lastSavedFileName = latestSavedDisplay.lastSavedFileName;
                task.lastSavedDisplayText = latestSavedDisplay.lastSavedDisplayText;
                task.missingEpisodes = latestSavedDisplay.missingEpisodes;
                await taskRepo.save(task);
            } catch (error) {
                logTaskEvent(`任务[${task.resourceName}]初始化最新转存信息失败: ${error.message}`);
            }
        }
        // username脱敏
        tasks.forEach(task => {
            task.account.username = task.account.username.replace(/(.{3}).*(.{4})/, '$1****$2');
        });
        res.json({ success: true, data: tasks });
    });

    app.post('/api/tasks', async (req, res) => {
        try {
            const task = await taskService.createTask(req.body);
            res.json({ success: true, data: task });
        } catch (error) {
            console.log(error)
            res.json({ success: false, error: error.message });
        }
    });

    app.delete('/api/tasks/batch', async (req, res) => {
        try {
            const taskIds = req.body.taskIds;
            const deleteCloud = req.body.deleteCloud;
            await taskService.deleteTasks(taskIds, deleteCloud);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 删除任务文件
    app.delete('/api/tasks/files', async (req, res) => {
        try{
            const { taskId, files } = req.body;
            if (!files || files.length === 0) {
                throw new Error('未选择要删除的文件');
            }
            await taskService.deleteFiles(taskId, files);
            res.json({ success: true, data: null });
        }catch (error) {
            res.json({ success: false, error: error.message });
        }
    })

    app.delete('/api/tasks/:id', async (req, res) => {
        try {
            const deleteCloud = req.body.deleteCloud;
            await taskService.deleteTask(parseInt(req.params.id), deleteCloud);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });


    app.put('/api/tasks/:id', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            const updatedTask = await taskService.updateTask(taskId, req.body);
            // 清除该任务的分享目录缓存，防止资源目录弹窗返回旧数据
            folderCache.clearPrefix(`share_folders_${taskId}_`);
            res.json({ success: true, data: updatedTask });
        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    });

    app.post('/api/tasks/:id/clear-cache', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            const task = await taskRepo.findOneBy({ id: taskId });
            if (!task) {
                return res.json({ success: false, error: '任务不存在' });
            }
            // 清除任务缓存
            await taskCacheManager.clearCache(taskId);
            // 同时清除 processingStartTime、lastFileUpdateTime、currentEpisodes，恢复任务状态为 pending
            task.processingStartTime = null;
            task.lastFileUpdateTime = null;
            task.currentEpisodes = 0;
            task.status = 'pending';
            await taskRepo.save(task);
            logTaskEvent(`任务[${task.resourceName}]缓存已清除，状态恢复为 pending`);
            res.json({ success: true, data: null, message: '缓存已清除，任务状态已恢复' });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 新增: TMDB 手动搜索接口
    app.get('/api/tmdb/search', async (req, res) => {
        try {
            const { query, type } = req.query;
            if (!query) throw new Error('搜索关键字不能为空');
            const tmdbService = new TMDBService();
            let results = [];
            if (type === 'movie') {
                const response = await tmdbService._request('/search/movie', { query, include_adult: false });
                results = response.results || [];
            } else {
                const response = await tmdbService._request('/search/tv', { query, include_adult: false });
                results = response.results || [];
            }
            res.json({ success: true, data: results });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.get('/api/tmdb/detail', async (req, res) => {
        try {
            const { id, type } = req.query;
            if (!id || !type) throw new Error('参数缺失');
            const tmdbService = new TMDBService();
            const detail = type === 'movie'
                ? await tmdbService.getMovieDetails(id)
                : await tmdbService.getTVDetails(id);
            if (!detail) throw new Error('未找到媒体详情');
            res.json({ success: true, data: detail });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 新增: 手动绑定 TMDB 接口
    app.post('/api/tasks/:id/manual-tmdb', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            const { tmdbId, videoType, title, manualSeason } = req.body;
            if (!tmdbId || !videoType) throw new Error('参数缺失');
            const task = await taskRepo.findOne({
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
            if (!task) throw new Error('任务不存在');
            
            task.tmdbId = tmdbId;
            task.videoType = videoType;
            if (title) task.tmdbTitle = title;
            // 如果用户填写了具体的季数进行覆盖，则保存，否则置空
            task.manualSeason = manualSeason !== '' && !isNaN(parseInt(manualSeason)) 
                ? parseInt(manualSeason) 
                : null;
            task.manualTmdbBound = true;
            
            // 从 TMDB API 获取更多信息更新任务卡片
            try {
                const { TMDBService } = require('./services/tmdb');
                const tmdbService = new TMDBService();
                const detail = videoType === 'movie'
                    ? await tmdbService.getMovieDetails(tmdbId)
                    : await tmdbService.getTVDetails(tmdbId);
                
                if (detail) {
                    // 更新 TMDB 标题（如果未提供）
                    if (!title && detail.title) {
                        task.tmdbTitle = detail.title;
                    }
                    // 更新总集数（剧集类型）
                    if (videoType === 'tv' && detail.totalEpisodes) {
                        task.totalEpisodes = detail.totalEpisodes;
                    }
                    // 保存完整的 TMDB 内容
                    task.tmdbContent = JSON.stringify(detail);
                    logTaskEvent(`[TMDB绑定] 已获取 TMDB 详情: ${detail.title || title}`);
                }
            } catch (e) {
                logTaskEvent(`[TMDB绑定] 获取 TMDB 详情失败: ${e.message}`);
            }
            
            // 注意：TMDB 绑定后不清除缓存，只触发重命名
            // 清缓存会导致任务重新执行，可能误删文件
            
            await taskRepo.save(task);

            // 自动触发重命名（后台异步执行，不阻塞响应）
            const renameTask = async () => {
                try {
                    const account = task.account;
                    const cloud189 = Cloud189Service.getInstance(account);
                    logTaskEvent(`[TMDB绑定] 自动触发重命名: ${task.resourceName}`);
                    // TMDB 绑定后的重命名：只重命名，不删除文件（避免误删）
                    const result = await taskService.autoRename(cloud189, task, { skipDeletion: true });
                    
                    let message = '';
                    if (result && result.newFiles && result.newFiles.length > 0) {
                        const folderPath = task.realFolderName || task.realFolderId || '';
                        message = `✅《${task.resourceName}》TMDB绑定并重命名完成\n已处理 ${result.newFiles.length} 个文件`;
                        if (folderPath) {
                            message += `\n📁 ${folderPath}`;
                        }
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
                            await embyService.notify(task);
                        } catch (e) {
                            logTaskEvent(`[TMDB绑定] Emby扫库失败: ${e.message}`);
                        }
                    } else {
                        message = `ℹ️《${task.resourceName}》TMDB绑定完成，无需重命名（无文件或已是正确格式）`;
                        messageUtil.sendMessage(message);
                    }
                } catch (e) {
                    logTaskEvent(`[TMDB绑定] 自动重命名失败: ${e.message}`);
                    messageUtil.sendMessage(`❌《${task.resourceName}》TMDB绑定后重命名失败: ${e.message}`);
                }
            };
            renameTask().catch(() => {}); // 异步执行，不阻塞

            res.json({ success: true, data: task });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 企业微信回调地址验证 (GET)
    app.get('/wecom/callback', (req, res) => {
        const { msg_signature, timestamp, nonce, echostr } = req.query;
        const service = WeChatWorkManager.getService();
        if (!service) return res.status(400).send('WeChat service not configured');
        try {
            const plain = service.verifyCallback(msg_signature, timestamp, nonce, echostr);
            res.send(plain);
        } catch (e) {
            res.status(403).send('Verification failed');
        }
    });

    // 企业微信接收消息 (POST) - 数字选择式交互状态机
    app.post('/wecom/callback', express.text({ type: 'application/xml' }), async (req, res) => {
        res.send('success'); // 先立即回包，避免超时重试
        const { msg_signature, timestamp, nonce } = req.query;
        const service = WeChatWorkManager.getService();
        if (!service) return;
        try {
            const encryptMatch = (req.body || '').match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
            if (!encryptMatch) return;
            const encrypted = encryptMatch[1];
            if (!service.verifySignature(msg_signature, timestamp, nonce, encrypted)) return;
            const plain = service.decryptMessage(encrypted);

            const fromUser = plain.match(/<FromUserName><!\[CDATA\[(.*?)\]\]><\/FromUserName>/)?.[1];
            const msgType = plain.match(/<MsgType><!\[CDATA\[(.*?)\]\]><\/MsgType>/)?.[1];
            const content = plain.match(/<Content><!\[CDATA\[(.*?)\]\]><\/Content>/)?.[1]?.trim();
            const event = plain.match(/<Event><!\[CDATA\[(.*?)\]\]><\/Event>/)?.[1];
            const eventKey = plain.match(/<EventKey><!\[CDATA\[(.*?)\]\]><\/EventKey>/)?.[1];

            const send = (txt) => service.sendTextMessage(fromUser, txt);
            const ses = WeChatWorkManager.getSession(fromUser);

            // 菜单点击事件
            if (msgType === 'event' && event === 'CLICK') {
                if (eventKey === 'RENAME_TASKS') {
                    const tasks = await taskRepo.find({ order: { updatedAt: 'DESC' }, take: 10 });
                    const txt = tasks.map((t, i) => `${i+1}. ${t.resourceName} ${t.manualTmdbBound ? '✅已绑定' : '❌未绑定'}`).join('\n');
                    WeChatWorkManager.setSession(fromUser, { state: 'select_task', tasks });
                    await send(`📺 任务列表：\n\n${txt}\n\n回复数字选择任务绑定TMDB，回复"取消"退出`);
                } else if (eventKey === 'EXECUTE_ALL') {
                    taskService.processAllTasks(true).catch(() => {});
                    await send('✅ 已开始执行所有任务...');
                } else if (eventKey === 'TASK_LIST') {
                    const tasks = await taskRepo.find({ order: { updatedAt: 'DESC' }, take: 10 });
                    const txt = tasks.map((t, i) => `${i+1}. ${t.resourceName} - ${t.status}`).join('\n');
                    await send(`📊 任务列表\n\n${txt}`);
                } else if (eventKey === 'CANCEL') {
                    WeChatWorkManager.clearSession(fromUser);
                    await send('✅ 已取消当前操作');
                }
                return;
            }

            // 文字消息
            if (msgType === 'text' && content) {
                if (content === '取消' || content.toLowerCase() === 'cancel') {
                    WeChatWorkManager.clearSession(fromUser);
                    await send('已取消');
                    return;
                }

                if (ses.state === 'select_task') {
                    const idx = parseInt(content) - 1;
                    const task = ses.tasks?.[idx];
                    if (!task) { await send('请输入有效数字，或回复"取消"'); return; }
                    WeChatWorkManager.setSession(fromUser, { state: 'select_type', taskId: task.id, taskName: task.resourceName });
                    await send(`选择任务：《${task.resourceName}》\n\n请选择媒体类型：\n1. 剧集/动漫/纪录片\n2. 电影\n\n回复 1 或 2`);
                    return;
                }

                if (ses.state === 'select_type') {
                    const tp = content === '2' ? 'movie' : 'tv';
                    WeChatWorkManager.setSession(fromUser, { state: 'input_keyword', searchType: tp });
                    await send(`已选择：${tp === 'tv' ? '剧集' : '电影'}\n\n🔍 请发送影视名称开始搜索`);
                    return;
                }

                if (ses.state === 'input_keyword') {
                    const tmdbSvc = new TMDBService();
                    const apiResults = await tmdbSvc.searchByType(content, ses.searchType);
                    if (!apiResults?.length) { await send(`未找到"${content}"，请重新输入`); return; }
                    const list = apiResults.slice(0, 6);
                    const txt = list.map((it, i) => `${i+1}. ${it.title||it.name} (${(it.release_date||it.first_air_date||'').substring(0,4)}) ID:${it.id}`).join('\n');
                    WeChatWorkManager.setSession(fromUser, { state: 'select_result', searchResults: list });
                    await send(`📊 搜索结果：\n\n${txt}\n\n回复数字选择，或回复"取消"`);
                    return;
                }

                if (ses.state === 'select_result') {
                    const idx = parseInt(content) - 1;
                    const item = ses.searchResults?.[idx];
                    if (!item) { await send('请输入有效数字，或回复"取消"'); return; }
                    const title = item.title || item.name;
                    const tmdbId = String(item.id);
                    if (ses.searchType === 'tv') {
                        WeChatWorkManager.setSession(fromUser, { state: 'select_season', pendingTmdbId: tmdbId, pendingTitle: title });
                        await send(`已选择：《${title}》\n\n📅 请指定季数：\n回复数字(如 2)或回复"自动"自动识别`);
                    } else {
                        // 电影直接绑定
                        const task = await taskRepo.findOne({
                            where: { id: ses.taskId },
                            relations: { account: true },
                            select: { account: { username: true, localStrmPrefix: true, cloudStrmPrefix: true, embyPathReplace: true } }
                        });
                        if (task) {
                            task.tmdbId = tmdbId; task.videoType = 'movie'; task.tmdbTitle = title;
                            task.manualTmdbBound = true; task.manualSeason = null;
                            await taskRepo.save(task);
                            // 异步触发重命名（不阻塞响应）
                            (async () => {
                                try {
                                    const cloud189 = Cloud189Service.getInstance(task.account);
                                    await taskService.autoRename(cloud189, task, { skipDeletion: true });
                                    await send(`✅ 重命名完成：${title}`);
                                } catch (e) {
                                    await send(`❌ 重命名失败: ${e.message}`);
                                }
                            })().catch(() => {});
                            await send(`✅ 绑定成功！\n🎥 电影：${title}\n🔄 已触发重命名`);
                        }
                        WeChatWorkManager.clearSession(fromUser);
                    }
                    return;
                }

                if (ses.state === 'select_season') {
                    const manualSeason = content === '自动' ? null : parseInt(content);
                    if (content !== '自动' && isNaN(manualSeason)) { await send('请输入数字或"自动"'); return; }
                    const task = await taskRepo.findOne({
                        where: { id: ses.taskId },
                        relations: { account: true },
                        select: { account: { username: true, localStrmPrefix: true, cloudStrmPrefix: true, embyPathReplace: true } }
                    });
                    if (task) {
                        task.tmdbId = ses.pendingTmdbId; task.videoType = 'tv';
                        task.tmdbTitle = ses.pendingTitle; task.manualSeason = manualSeason;
                        task.manualTmdbBound = true;
                        await taskRepo.save(task);
                        // 异步触发重命名（不阻塞响应）
                        (async () => {
                            try {
                                const cloud189 = Cloud189Service.getInstance(task.account);
                                await taskService.autoRename(cloud189, task, { skipDeletion: true });
                                await send(`✅ 重命名完成：${ses.pendingTitle}${manualSeason != null ? ' 第'+manualSeason+'季' : ''}`);
                            } catch (e) {
                                await send(`❌ 重命名失败: ${e.message}`);
                            }
                        })().catch(() => {});
                        await send(`✅ 绑定成功！\n🎥 ${ses.pendingTitle}${manualSeason != null ? ' 第'+manualSeason+'季' : ' (自动识别季)'}\n🔄 已触发重命名，完成后发送通知`);
                    }
                    WeChatWorkManager.clearSession(fromUser);
                    return;
                }

                // 默认帮助
                await send('🤖 天翼云盘助手\n\n请点击下方菜单进行操作：\n🎬 AI重命名 → 未匹配任务列表\n📋 任务管理 → 查看任务列表');
            }
        } catch (e) {
            logTaskEvent(`企微回调处理失败: ${e.message}`);
        }
    });

    app.post('/api/tasks/:id/execute', async (req, res) => {
        try {
            const task = await taskRepo.findOne({
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
            if (!task) throw new Error('任务不存在');
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
                    await taskRepo.save(task);
                } else {
                    logTaskEvent(`任务[${task.resourceName}/${task.shareFolderName || ''}]正在执行中，跳过本次触发`);
                    return res.json({ success: true, data: null, message: '任务正在执行中' });
                }
            }
            logTaskEvent(`================================`);
            const taskName = task.shareFolderName?(task.resourceName + '/' + task.shareFolderName): task.resourceName || '未知'
            logTaskEvent(`任务[${taskName}]开始执行`);
            const result = await taskService.processTask(task, { manualTrigger: true });
            if (result) {
                messageUtil.sendMessage(result)
            }
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });
    // 手动触发重命名（用于 TMDB 绑定后重新重命名）
    app.post('/api/tasks/:id/rename', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            const task = await taskRepo.findOne({
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
            if (!task) throw new Error('任务不存在');

            const account = task.account;
            const cloud189 = Cloud189Service.getInstance(account);

            logTaskEvent(`================================`);
            logTaskEvent(`手动触发重命名: ${task.resourceName}`);

            const result = await taskService.autoRename(cloud189, task);
            let message = '';
            if (result && result.newFiles && result.newFiles.length > 0) {
                const folderPath = task.realFolderName || task.realFolderId || '';
                message = `✅《${task.resourceName}》重命名完成\n已处理 ${result.newFiles.length} 个文件`;
                if (folderPath) {
                    message += `\n📁 ${folderPath}`;
                }
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
                    await embyService.notifyEmby(task);
                } catch (e) {
                    logTaskEvent(`Emby扫库失败: ${e.message}`);
                }
            } else {
                message = `ℹ️《${task.resourceName}》无需重命名（文件已是正确格式或无文件）`;
            }

            res.json({ success: true, data: result, message });
        } catch (error) {
            logTaskEvent(`手动重命名失败: ${error.message}`);
            res.json({ success: false, error: error.message });
        }
    });
    // 根据任务生成STRM文件
    app.post('/api/tasks/strm', async (req, res) => {
        try {
            const taskIds = req.body.taskIds;
            if (!taskIds || taskIds.length == 0) {
                throw new Error('任务ID不能为空');
            }
            const overwrite = req.body.overwrite || false;
            taskService.createStrmFileByTask(taskIds, overwrite);
            return res.json({ success: true, data: 'ok' });
        }catch (error) {
            res.json({ success: false, error: error.message });
        }
    })
     // 获取目录树
     app.get('/api/folders/:accountId', async (req, res) => {
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
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('账号不存在');
            }

            const cloud189 = Cloud189Service.getInstance(account);
            const folders = await cloud189.getFolderNodes(folderId);
            if (!folders) {
                throw new Error('获取目录失败');
            }
            folderCache.set(cacheKey, folders);
            res.json({ success: true, data: folders });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 获取家庭空间目录树（供CAS中转目录选择）
    app.get('/api/family/folders/:accountId', async (req, res) => {
        try {
            const accountId = parseInt(req.params.accountId);
            const folderId = req.query.folderId || '';
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) throw new Error('账号不存在');
            const cloud189 = Cloud189Service.getInstance(account);
            const familyInfo = await cloud189.getFamilyInfo();
            if (!familyInfo) throw new Error('当前账号无家庭空间主账号');
            const folders = await cloud189.listFamilyFolderNodes(familyInfo.familyId, folderId);
            res.json({ success: true, data: folders, familyId: familyInfo.familyId });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 根据分享链接获取文件目录
    app.get('/api/share/folders/:accountId', async (req, res) => {
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
            const task = await taskRepo.findOneBy({ id: parseInt(taskId) });
            if (!task) {
                throw new Error('任务不存在');
            }
            const account = await accountRepo.findOneBy({ id: req.params.accountId });
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
                const shareInfo = await taskService.getShareInfo(cloud189, shareCode);
                accessCode = accessCodeFromQuery || task.accessCode;
                if (shareInfo.shareMode == 1) {
                    if (!accessCode) {
                        throw new Error('分享链接为私密链接, 请输入提取码');
                    }
                    const accessCodeResponse = await cloud189.checkAccessCode(shareCode, accessCode);
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
                return res.json({success: true, data: [{id: shareFileId, name: resourceName}]});
            }
            const shareDir = await cloud189.listShareDir(shareId, req.query.folderId, shareMode, accessCode);
            if (!shareDir || !shareDir.fileListAO) {
                return res.json({ success: true, data: [] });
            }
            const folders = shareDir.fileListAO.folderList;
            folderCache.set(cacheKey, folders);
            res.json({ success: true, data: folders });
        } catch (error) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

     // 获取目录下的文件
     app.get('/api/folder/files', async (req, res) => {
        try {
            const { accountId, taskId } = req.query;
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('账号不存在');
            }
            const task = await taskRepo.findOneBy({ id: taskId });
            if (!task) {
                throw new Error('任务不存在');
            }
            const cloud189 = Cloud189Service.getInstance(account);
            const fileList = await taskService.getAllFolderFiles(cloud189, task);
            res.json({ success: true, data: fileList });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    app.post('/api/files/rename', async (req, res) => {
        const {taskId, accountId, files, sourceRegex, targetRegex } = req.body;
        if (files.length == 0) {
            throw new Error('未获取到需要修改的文件');
        }
        const account = await accountRepo.findOneBy({ id: accountId });
        if (!account) {
            throw new Error('账号不存在');
        }
        const task = await taskService.getTaskById(taskId);
        if (!task) {
            throw new Error('任务不存在');
        }
        logTaskEvent(`[批量重命名] 获取用户确认，开始对 ${files.length} 个文件执行天翼云远端重命名...`);
        // 从realFolderName中获取文件夹名称 删除对应的本地文件
        const folderName = task.realFolderName.substring(task.realFolderName.indexOf('/') + 1);
        const strmService = new StrmService();
        const strmEnabled = ConfigService.getConfigValue('strm.enable') && task.account.localStrmPrefix
        if (strmEnabled && task.enableSystemProxy){
            throw new Error('系统代理模式已移除');
        }
        const newFiles = files.map(file => ({id: file.fileId, name: file.destFileName}))
        if(task.enableSystemProxy) {
            throw new Error('系统代理模式已移除');
        }
        const cloud189 = Cloud189Service.getInstance(account);
        const result = []
        const successFiles = []
        for (const file of files) {
            const renameResult = await cloud189.renameFile(file.fileId, file.destFileName);
            if (!renameResult) {
                logTaskEvent(`[批量重命名] 接口异常导致失败`);
                throw new Error('重命名失败');
            }
            if (renameResult.res_code != 0) {
                logTaskEvent(`[批量重命名] 原文件 ${file.oldName} 失败: ${renameResult.res_msg}`);
                result.push(`文件${file.destFileName} ${renameResult.res_msg}`)
            }else{
                logTaskEvent(`[批量重命名] 成功: ${file.oldName} => ${file.destFileName}`);
                if (strmEnabled){
                    // 从realFolderName中获取文件夹名称 删除对应的本地文件
                    const oldFile = path.join(folderName, file.oldName);
                    await strmService.delete(path.join(task.account.localStrmPrefix, oldFile))
                }
                successFiles.push({id: file.fileId, name: file.destFileName})
            }
        }
        logTaskEvent(`[批量重命名] 对选中的文件重命名请求执行完成。成功: ${successFiles.length}，失败: ${result.length}`);
        // 重新生成STRM文件
        if (strmEnabled){
            strmService.generate(task, successFiles, false, false)
        }
        if (sourceRegex && targetRegex) {
            task.sourceRegex = sourceRegex
            task.targetRegex = targetRegex
            taskRepo.save(task)
        }
        if (result.length > 0) {
            logTaskEvent(result.join('\n'));
        }
        res.json({ success: true, data: result });
    });

    app.post('/api/tasks/executeAll', async (req, res) => {
        taskService.processAllTasks(true);
        res.json({ success: true, data: null });
    });

    // 系统设置
    app.get('/api/settings', async (req, res) => {
        res.json({success: true, data: ConfigService.getConfig()})
    })

    app.post('/api/settings', async (req, res) => {
        const settings = req.body;
        SchedulerService.handleScheduleTasks(settings,taskService);
        ConfigService.setConfig(settings)
        await botManager.handleBotStatus(
            settings.telegram?.bot?.botToken,
            settings.telegram?.bot?.chatId,
            settings.telegram?.bot?.enable
        );
        // 修改配置, 重新实例化消息推送
        messageUtil.updateConfig()
        Cloud189Service.setProxy()
        res.json({success: true, data: null})
    })


    // 保存媒体配置
    app.post('/api/settings/media', async (req, res) => {
        const settings = req.body;
        // 如果cloudSaver的配置变更 就清空cstoken.json
        if (settings.cloudSaver?.baseUrl != ConfigService.getConfigValue('cloudSaver.baseUrl')
        || settings.cloudSaver?.username != ConfigService.getConfigValue('cloudSaver.username')
        || settings.cloudSaver?.password != ConfigService.getConfigValue('cloudSaver.password')
    ) {
            clearCloudSaverToken();
        }
        ConfigService.setConfig(settings)
        res.json({success: true, data: null})
    })

    app.get('/api/version', (req, res) => {
        res.json({ version: currentVersion });
    });

    // 解析分享链接
    app.post('/api/share/parse', async (req, res) => {
        try{
            const shareLink = req.body.shareLink;
            const accountId = req.body.accountId;
            const accessCode = req.body.accessCode;
            const shareFolders = await taskService.parseShareFolderByShareLink(shareLink, accountId, accessCode);
            res.json({success: true, data: shareFolders})
        }catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    })
    // 保存常用目录
    app.post('/api/saveFavorites', async (req, res) => {
        try{
            const favorites = req.body.favorites;
            const accountId = req.body.accountId;
            if (!accountId) {
                throw new Error('账号ID不能为空');
            }
            // 先删除该账号下的所有常用目录
            await commonFolderRepo.delete({ accountId: accountId });
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
            const result = await commonFolderRepo.save(commonFolders);
            res.json({ success: true, data: result });
        }catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    })
    // 获取常用目录
    app.get('/api/favorites/:accountId', async (req, res) => {
        try{
            const accountId = req.params.accountId;
            if (!accountId) {
                throw new Error('账号ID不能为空');
            }
            const favorites = await commonFolderRepo.find({
                where: { accountId: accountId },
                order: { id: 'ASC' }
            });
            res.json({ success: true, data: favorites });
        }catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    })
    
    // emby 回调
    app.post('/emby/notify', async (req, res) => {
        try {
            await embyService.handleWebhookNotification(req.body);
            res.status(200).send('OK');
        }catch (error) {
            console.log(error);
            res.status(500).send('Error');
        }
    })

    app.post('/api/chat', async (req, res) => {
        const { message } = req.body;
        try {
            let userMessage = message.trim();
            if(!userMessage) {
                res.json({ success: true });
                return
            }
            
            AIService.streamChat(userMessage, async (chunk) => {
                sendAIMessage(chunk);
            })
            res.json({ success: true });
        } catch (error) {
            console.error('处理聊天消息失败:', error);
            res.status(500).json({ success: false, error: '处理消息失败' });
        }
    })


    // STRM相关API
    app.post('/api/strm/generate-all', async (req, res) => {
        try {
            const overwrite = req.body.overwrite || false;
            const accountIds = req.body.accountIds;
            if (!accountIds || accountIds.length == 0) {
                throw new Error('账号ID不能为空');
            }
            const accounts = await accountRepo.find({
                where: {
                    localStrmPrefix: Not(IsNull()),
                    cloudStrmPrefix: Not(IsNull()),
                    id: In(accountIds)
                }
            });
            const strmService = new StrmService();
            strmService.generateAll(accounts, overwrite);
            res.json({ success: true, data: null });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.get('/api/strm/list', async (req, res) => {
        try {
            const path = req.query.path || '';
            const strmService = new StrmService();
            const files = await strmService.listStrmFiles(path);
            res.json({ success: true, data: files });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // ai重命名
    app.post('/api/files/ai-rename', async (req, res) => {
        try {
            const { taskId, files } = req.body;
            if (files.length == 0) {
                throw new Error('未获取到需要修改的文件');
            }
            const task = await taskService.getTaskById(taskId);
            if (!task) {
                throw new Error('任务不存在');
            }
            
            logTaskEvent(`[批量重命名] 开始对任务 [${task.resourceName}] 选中的 ${files.length} 个文件使用 AI 分析和重命名建议...`);
            // 开始ai分析
            const resourceInfo = await taskService._analyzeResourceInfo(
                task.resourceName,
                files,
                'file',
                task
            )
            const renamePreviewResult = await taskService.handleAiRename(files, resourceInfo);
            logTaskEvent(`[批量重命名] AI 分析完成，生成了 ${renamePreviewResult.length} 条有效建议，等待用户确认`);
            return res.json({ success: true, data: renamePreviewResult });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    })

    // OpenAI 测试与模型获取 API
    app.post('/api/openai/test', async (req, res) => {
        try {
            const { baseUrl, apiKey, model } = req.body;
            if (!apiKey) throw new Error('API Key不能为空');
            
            // 构建测试请求参数 (采用极轻量的内容探测)
            const targetUrl = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
            
            const got = require('got');
            const response = await got.post(targetUrl, {
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
            } else {
                throw new Error(`响应格式异常: ${JSON.stringify(data)}`);
            }
        } catch (error) {
            let errorDetails = error.message;
            if (error.response && error.response.body) {
                 errorDetails += ` : ${JSON.stringify(error.response.body)}`;
            }
            res.json({ success: false, error: errorDetails });
        }
    });

    app.post('/api/openai/models', async (req, res) => {
        try {
            const { baseUrl, apiKey } = req.body;
            if (!apiKey) throw new Error('API Key不能为空');
            
            const targetUrl = baseUrl.endsWith('/') ? `${baseUrl}models` : `${baseUrl}/models`;
            
            const got = require('got');
            const response = await got.get(targetUrl, {
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
            } else {
                throw new Error(`未获取到有效的模型列表: ${JSON.stringify(data)}`);
            }
        } catch (error) {
            let errorDetails = error.message;
            if (error.response && error.response.body) {
                 errorDetails += ` : ${JSON.stringify(error.response.body)}`;
            }
            res.json({ success: false, error: errorDetails });
        }
    });

    app.post('/api/custom-push/test', async (req, res) => {
        try{
            const configTest = req.body
            if (await new CustomPushService([]).testPush(configTest)){
                res.json({ success: true, data: null });
            }else{
                res.json({ success: false, error: '推送测试失败' });
            }

        }catch (error) {
            res.json({ success: false, error: error.message });
        }
    })
    
    // 全局错误处理中间件
    app.use((err, req, res, next) => {
        console.error('捕获到全局异常:', err.message);
        res.status(500).json({ success: false, error: err.message });
    });


    initSSE(app)

    // 初始化cloudsaver
    setupCloudSaverRoutes(app);
    // 启动服务器
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`服务器运行在 http://localhost:${port}`);
    });
}).catch(error => {
    console.error('数据库连接失败:', error);
});
