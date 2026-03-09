const TelegramBot = require('node-telegram-bot-api');
const { AppDataSource } = require('../database');
const { Task, Account, CommonFolder } = require('../entities');
const { TaskService } = require('./task');
const { EmbyService } = require('./emby');
const { Cloud189Service } = require('./cloud189');
const { TMDBService } = require('./tmdb');
const path = require('path');
const { default: cloudSaverSDK } = require('../sdk/cloudsaver/sdk');
const ProxyUtil = require('../utils/ProxyUtil');
const cloud189Utils = require('../utils/Cloud189Utils');

class TelegramBotService {
    constructor(token, chatId) {
        this.token = token;
        this.chatId = chatId
        this.bot = null;
        this.accountRepo = AppDataSource.getRepository(Account);
        this.commonFolderRepo = AppDataSource.getRepository(CommonFolder);
        this.taskRepo = AppDataSource.getRepository(Task);
        this.taskService = new TaskService(this.taskRepo, this.accountRepo);
        this.currentAccountId = null;
        this.currentAccount = null;
        this.currentShareLink = null;
        this.currentAccessCode = null;
        this.lastButtonMessageId = null;  // 上次按钮消息
        this.currentFolderPath = '';  // 当前路径
        this.currentFolderId = '-11';  // 当前文件夹ID
        this.folders = new Map();
        this.parentFolderIds = new Set();

        // 全局任务列表消息id
        this.globalTaskListMessageId = null;
        // 全局常用目录列表消息id
        this.globalCommonFolderListMessageId = null;

        this.cloudSaverSdk = cloudSaverSDK;
        this.isSearchMode = false;
        this.searchModeTimeout = null;  // 搜索模式超时计时器

        this.cloudSaverSearchMap = new Map();

        this.tmdbService = new TMDBService();

        // TMDB 绑定会话状态
        this.tmdbBindMode = false;   // 是否处于 TMDB 搜索等待模式
        this.tmdbBindTaskId = null;  // 待绑定的任务ID
        this.tmdbBindType = 'tv';    // 搜索类型 tv/movie
        this.tmdbSearchResultsCache = []; // 搜索结果缓存
    }

    async start() {
        if (this.bot) {
            return;
        }
        // 从配置文件获取代理
        const proxy = ProxyUtil.getProxy('telegram');
        this.bot = new TelegramBot(this.token, { 
            polling: true, 
            request: {
                proxy: proxy,
                agentOptions: {
                    keepAlive: true,
                    family: 4,
                    timeout:  30000 // 10秒超时
                },
                timeout: 30000, // 请求超时时间
                forever: true, // 保持连接
                retries: 3 // 添加重试次数
            } 
        });

        // 添加错误处理
        this.bot.on('polling_error', (error) => {
            console.error('Telegram Bot polling error:', error.message);
        });

        this.bot.on('error', (error) => {
            console.error('Telegram Bot error:', error.message);
        });
        
        // 设置命令菜单
        await this.bot.setMyCommands([
            { command: 'help', description: '帮助信息' },
            { command: 'search_cs', description: '搜索CloudSaver资源' },
            { command: 'accounts', description: '账号列表' },
            { command: 'tasks', description: '任务列表' },
            { command: 'execute_all', description: '执行所有任务' },
            { command: 'rename_tasks', description: '查看未匹配TMDB的任务' },
            { command: 'fl', description: '常用目录列表' },
            { command: 'fs', description: '添加常用目录' },
            { command: 'cancel', description: '取消当前操作' }
        ]);
        // 从数据库中加载默认的账号
        const account = await this.accountRepo.findOne({
            where: { tgBotActive: true }
        });
        this.currentAccount = account;
        this.currentAccountId = account?.id;
        this.initCommands();
        return true;
    }

    async stop() {
        if (!this.bot) {
            return;
        }
        try {
            // 发送机器人停止消息
            await this.bot.stopPolling();
            this.bot = null;
            // 清理状态
            this.currentAccountId = null;
            this.currentAccount = null;
            this.currentShareLink = null;
            this.currentAccessCode = null;
            this.lastButtonMessageId = null;
            this.currentFolderPath = '';
            this.currentFolderId = '-11';
            this.folders.clear();
            this.parentFolderIds.clear();
            this.globalTaskListMessageId = null;
            this.globalCommonFolderListMessageId = null;
            return true;
        } catch (error) {
            console.error('停止机器人失败:', error);
            return false;
        }
    }

    initCommands() {
        this.bot.onText(/\/help/, async (msg) => {
            const helpText = 
                '🤖 天翼云盘机器人使用指南\n\n' +
                '📋 基础命令：\n' +
                '/help - 显示帮助信息\n' +
                '/accounts - 账号列表与切换\n' +
                '/tasks - 显示下载任务列表\n' +
                '/fl - 显示常用目录列表\n' +
                '/fs - 添加常用目录\n' +
                '/search_cs - 搜索CloudSaver资源\n' +
                '/cancel - 取消当前操作\n\n' +
                '📥 创建任务：\n' +
                '直接发送天翼云盘分享链接即可创建任务\n' +
                '格式：链接（支持访问码的链接）\n\n' +
                '📝 任务操作：\n' +
                '/execute_[ID] - 执行指定任务\n' +
                '/execute_all - 执行所有任务\n' +
                '/strm_[ID] - 生成STRM文件\n' +
                '/emby_[ID] - 通知Emby刷新\n' +
                '/dt_[ID] - 删除指定任务\n' +
                '/df_[ID] - 删除指定常用目录\n\n' +
                '🔍 资源搜索：\n' +
                '1. 输入 /search_cs 进入搜索模式\n' +
                '2. 直接输入关键字搜索资源\n' +
                '3. 点击搜索结果中的链接可复制\n' +
                '4. 输入 /cancel 退出搜索模式';

            await this.bot.sendMessage(msg.chat.id, helpText);

            const helpText2 = 
                '---\n\n' +
                '🎬 AI重命名 & TMDB绑定：\n' +
                '/rename_tasks - 查看未匹配TMDB的任务列表\n' +
                '/bind_[ID] - 直接为指定任务绑定TMDB';
            await this.bot.sendMessage(msg.chat.id, helpText2);
        });


        this.bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)){
                return;
            }
            // 忽略命令消息
            if (msg.text?.startsWith('/')) return;
            // TMDB绑定模式下处理搜索
            if (this.tmdbBindMode) {
                await this._handleTmdbSearchInput(chatId, msg.text?.trim());
                return;
            }
            // 搜索模式下处理消息
            if (this.isSearchMode) {
                const input = msg.text?.trim();
                // 判断是否为纯数字
                if (/^\d+$/.test(input)) {
                    const index = parseInt(input);
                    const cacheShareLink = this.cloudSaverSearchMap.get(index);
                    if (!cacheShareLink) {
                        this.bot.sendMessage(chatId, '无效的编号');
                        return;
                    }
                    try {
                        const { url: shareLink, accessCode } = cloud189Utils.parseCloudShare(cacheShareLink);
                        // 处理分享链接
                        await this.handleFolderSelection(chatId, shareLink, null, accessCode);
                        return
                    }catch(e){
                        this.bot.sendMessage(chatId, `处理失败: ${error.message}`);
                        return;
                    }
                }
                this.cloudSaverSearch(chatId, msg)
            }
        });

        this.bot.onText(/cloud\.189\.cn/, async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)){
                return;
            }
            // 如果处于搜索模式，则不处理
            if (this.isSearchMode) {
                return;
            }
            try {
                if (!this._checkUserId(chatId)) return;
                const { url: shareLink, accessCode } = cloud189Utils.parseCloudShare(msg.text);
                await this.handleFolderSelection(chatId, shareLink, null, accessCode);
            } catch (error) {
                console.log(error)
                this.bot.sendMessage(chatId, `处理失败: ${error.message}`);
            }
        });


        // 添加账号列表命令
        this.bot.onText(/\/accounts/, async (msg) => {
            await this.showAccounts(msg.chat.id);
        });

        // 添加任务列表命令
        this.bot.onText(/\/tasks/, async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) return
            if (!this._checkUserId(chatId)) return
            await this.showTasks(msg.chat.id);
        });

        // 添加常用目录查询命令
        this.bot.onText(/\/fl$/, async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) return
            if (!this._checkUserId(chatId)) return
            await this.showCommonFolders(chatId);
        });

        this.bot.onText(/\/fs$/, async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) return
            if (!this._checkUserId(chatId)) return
            await this.showFolderTree(chatId);
        });

        // 执行任务
        this.bot.onText(/^\/execute_(\d+)$/, async (msg, match) => {
            const chatId = msg.chat.id;
            const taskId = match[1];
            if (!this._checkChatId(chatId)) return
            if(!this._checkTaskId(taskId)) return;
            const message = await this.bot.sendMessage(chatId, `任务开始执行`);
            try{
                await this.taskService.processAllTasks(true, [taskId])   
                this.bot.deleteMessage(chatId, message.message_id);
                await this.bot.sendMessage(chatId, `任务执行完成`);
            }catch(e){
                await this.bot.editMessageText(`任务执行失败: ${e.message}`, {
                    chat_id: chatId,
                    message_id: message.message_id
                });
                return;
            }
        })

        // 执行所有任务
        this.bot.onText(/^\/execute_all$/, async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) return
            const message = await this.bot.sendMessage(chatId, `开始执行所有任务...`);
            try {
                await this.taskService.processAllTasks(true);
                this.bot.editMessageText("所有任务执行完成", {
                    chat_id: chatId,
                    message_id: message.message_id
                });
            } catch(e) {
                await this.bot.editMessageText(`任务执行失败: ${e.message}`, {
                    chat_id: chatId,
                    message_id: message.message_id
                });
            }
        });

        // 生成strm
        this.bot.onText(/\/strm_(\d+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const taskId = match[1];
            if (!this._checkChatId(chatId)) return
            if(!this._checkTaskId(taskId)) return;
            const task = await this.taskService.getTaskById(taskId);
            if (!task) {
                await this.bot.sendMessage(chatId, '未找到该任务');
                return;
            }
            const message = await this.bot.sendMessage(chatId, '开始生成strm...');
            try{
                this.taskService._createStrmFileByTask(task, false);
            }catch(e){
                await this.bot.sendMessage(chatId, `生成strm失败: ${e.message}`);
                return;
            }
            // 删除消息
            await this.bot.deleteMessage(chatId, message.message_id);
        })
        // 通知emby
        this.bot.onText(/\/emby_(\d+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const taskId = match[1];
            if (!this._checkChatId(chatId)) return
            if(!this._checkTaskId(taskId)) return;
            const task = await this.taskService.getTaskById(taskId);
            if (!task) {
                await this.bot.sendMessage(chatId, '未找到该任务');
                return;
            }
            const message = await this.bot.sendMessage(chatId, '开始通知emby...');
            try{
                const embyService = new EmbyService()                
                await embyService.notify(task)
                // 删除消息
                await this.bot.deleteMessage(chatId, msg.message_id);
            }catch(e){
                await this.bot.sendMessage(chatId, `通知失败: ${e.message}`);
                return;
            }
        })
        // 添加删除任务命令
        this.bot.onText(/\/dt_(\d+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const taskId = match[1];
            if (!this._checkChatId(chatId)) return
            const keyboard = [
                [
                    { text: '是', callback_data: JSON.stringify({ t: 'dt', i: taskId, c: true, df: true }) },
                    { text: '否', callback_data: JSON.stringify({ t: 'dt', i: taskId, c: true, df: false }) }
                ],
                [{ text: '取消', callback_data: JSON.stringify({ t: 'dt', c: false }) }]
            ];
            await this.bot.sendMessage(chatId, '是否同步删除网盘文件？', {
                reply_markup: { inline_keyboard: keyboard }
            });
        });

        // 删除常用目录
        this.bot.onText(/\/df_(-?\d+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const folderId = match[1];
            if (!this._checkChatId(chatId)) return
            if (!this._checkUserId(chatId)) return
          
            try {
                await this.commonFolderRepo.delete({
                    id: folderId,
                    accountId: this.currentAccountId
                });
                await this.bot.sendMessage(chatId, '删除成功');
                await this.showCommonFolders(chatId);
            } catch (error) {
                await this.bot.sendMessage(chatId, `删除失败: ${error.message}`);
            }
        });

        // 搜索CloudSaver命令
        this.bot.onText(/\/search_cs/, async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) return
            if (this.isSearchMode) {
                await this.bot.sendMessage(chatId, '当前已处于搜索模式, 请直接输入关键字搜索资源\n输入 /cancel 退出搜索模式');
                return;
            } 
            if (!this._checkUserId(chatId)) return;
            // 判断用户是否开启了CloudSaver
            if (!this.cloudSaverSdk.enabled){
                await this.bot.sendMessage(chatId, '未开启CloudSaver, 请先在网页端配置CloudSaver');
                return;
            }
            this.isSearchMode = true;
            // 设置3分钟超时
            this._resetSearchModeTimeout(chatId);
            await this.bot.sendMessage(chatId, '已进入搜索模式，请输入关键字搜索资源\n输入 /cancel 退出搜索模式\n3分钟内未搜索将自动退出搜索模式');
        });

        this.bot.onText(/\/cancel/, async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) return
            // 清除缓存
            this.currentShareLink = null;
            this.currentAccessCode = null;
            this.isSearchMode = false;  // 退出搜索模式
            // 重置 TMDB 绑定状态
            this.tmdbBindMode = false;
            this.tmdbBindTaskId = null;
            this.tmdbBindType = 'tv';
            this.tmdbSearchResultsCache = [];
            try {
                if (this.lastButtonMessageId) {
                    await this.bot.deleteMessage(chatId, this.lastButtonMessageId);
                    this.lastButtonMessageId = null;
                }
            } catch (error) {
                console.error('删除消息失败:', error);
            }
            
            await this.bot.sendMessage(chatId, '已取消当前操作');
        });

        // 修改回调处理
        this.bot.on('callback_query', async (callbackQuery) => {
            const data = JSON.parse(callbackQuery.data);
            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;

            try {
                switch (data.t) {
                    case 'f': // 文件夹选择
                        await this.createTask(chatId, data, messageId);
                        break;
                    case 'of': // 覆盖文件夹
                        if (!data.o) {
                            await this.bot.editMessageText("已取消任务创建",{
                                chat_id: chatId,
                                message_id: messageId
                            });
                            return;
                        }
                        await this.createTask(chatId, data, messageId);
                        break;
                    case 'sa': // 设置当前账号
                        await this.setCurrentAccount(chatId, data, messageId);
                        break;
                    case 'tp': // 任务分页
                        await this.showTasks(chatId, data.p, messageId);
                        break;
                    case 'dt': // 删除任务
                        if (!data.c) {
                            await this.bot.editMessageText("已取消删除",{
                                chat_id: chatId,
                                message_id: messageId
                            });
                            return;
                        }
                        await this.deleteTask(chatId, data, messageId);
                        break;
                    case 'fd': // 进入下一级目录
                        await this.showFolderTree(chatId, data, messageId);
                        break;
                    case 'fc': // 取消操作
                        await this.bot.deleteMessage(chatId, messageId);
                        break;
                    case 'fs': // 保存当前目录
                        await this.saveFolderAsFavorite(chatId, data, messageId);
                        break;
                    case 'tr': // 进入TMDB搜索模式
                        await this._startTmdbBind(chatId, data, messageId);
                        break;
                    case 'ts': // 设置搜索类型并提示输入
                        await this._setTmdbSearchType(chatId, data, messageId);
                        break;
                    case 'tb': // 绑定所选TMDB结果
                        await this._confirmTmdbBind(chatId, data, messageId);
                        break;
                    case 'tse': // 选择季数
                        await this._selectTmdbSeason(chatId, data, messageId);
                        break;
                }
            } catch (error) {
                this.bot.sendMessage(chatId, `处理失败: ${error.message}`);
            }
        });



        // 添加TMDB搜索命令
        this.bot.onText(/\/tmdb (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const input = match[1];
            if (!this._checkChatId(chatId)) return
            let title, year;

            // 解析输入的标题和年份
            const yearMatch = input.match(/^(.+?)(?:\s+(\d{4}))?$/);
            if (yearMatch) {
                title = yearMatch[1].trim();
                year = yearMatch[2];
            }

            const message = await this.bot.sendMessage(chatId, '正在搜索...');
            try {
                const results = await this.tmdbService.search(title, year);
                let responseText = '';
                console.log('搜索结束')
                // 先发送海报图片
                const firstPoster = results.movies[0]?.posterPath || results.tvShows[0]?.posterPath;

                if (results.movies.length > 0) {
                    responseText += '📽 电影：\n\n';
                    results.movies.forEach(movie => {
                        const shortOverview = movie.overview ? 
                            (movie.overview.length > 20 ? movie.overview.substring(0, 20) + '...' : movie.overview) : 
                            '暂无';
                        
                        responseText += `标题：${movie.title}\n` +
                            `原标题：${movie.originalTitle}\n` +
                            `上映日期：${movie.releaseDate}\n` +
                            `评分：${movie.voteAverage}\n` +
                            `简介：${shortOverview}\n\n`;
                    });
                }

                if (results.tvShows.length > 0) {
                    responseText += '📺 剧集：\n\n';
                    results.tvShows.forEach(show => {
                        const shortOverview = show.overview ? 
                            (show.overview.length > 20 ? show.overview.substring(0, 20) + '...' : show.overview) : 
                            '暂无';

                        responseText += `标题：${show.title}\n` +
                            `原标题：${show.originalTitle}\n` +
                            `首播日期：${show.releaseDate}\n` +
                            `评分：${show.voteAverage}\n` +
                            `简介：${shortOverview}\n\n`;
                    });
                }

                if (!results.movies.length && !results.tvShows.length) {
                    responseText = '未找到相关影视信息';
                }
                console.log('获取到的海报', firstPoster)
                this.bot.deleteMessage(chatId, message.message_id);
                this.bot.sendPhoto(chatId, firstPoster, {
                    caption: responseText,
                    parse_mode: 'HTML'
                });
            } catch (error) {
                await this.bot.editMessageText(`搜索失败: ${error.message}`, {
                    chat_id: chatId,
                    message_id: message.message_id
                });
            }
        });

        // 查看未匹配TMDB的任务
        this.bot.onText(/\/rename_tasks/, async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) return;
            await this.showRenameTasksList(chatId);
        });

        // 直接为指定任务绑定TMDB
        this.bot.onText(/^\/bind_(\d+)$/, async (msg, match) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) return;
            const taskId = parseInt(match[1]);
            const task = await this.taskRepo.findOneBy({ id: taskId });
            if (!task) {
                await this.bot.sendMessage(chatId, `未找到ID为 ${taskId} 的任务`);
                return;
            }
            this.tmdbBindTaskId = taskId;
            const keyboard = [
                [{ text: '📺 剧集/动漫/纪录片', callback_data: JSON.stringify({ t: 'ts', tp: 'tv', ti: taskId }) }],
                [{ text: '🎦 电影', callback_data: JSON.stringify({ t: 'ts', tp: 'movie', ti: taskId }) }]
            ];
            await this.bot.sendMessage(chatId,
                `任务：《${task.resourceName}》\n\n请选择媒体类型：`,
                { reply_markup: { inline_keyboard: keyboard } }
            );
        });
    }

    async showAccounts(chatId, messageId = null) {
        if (!this._checkChatId(chatId)){
            return;
        }
        const accounts = await this.accountRepo.find();
        const keyboard = accounts.map(account => [{
            text: `${account.username.slice(0, 3)}***${account.username.slice(-3)} ${account.id === this.currentAccountId ? '✅' : ''}`,
            callback_data: JSON.stringify({ t: 'sa', i: account.id, a: `${account.username.slice(0, 3)}***${account.username.slice(-3)}` })
        }]);

        const message = '账号列表 (✅表示当前选中账号):';
        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await this.bot.sendMessage(chatId, message, {
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    }

    async showTasks(chatId, page = 1, messageId = null) {
        const pageSize = 5;
        const skip = (page - 1) * pageSize;
        
        const [tasks, total] = await this.taskRepo.findAndCount({
            order: { updatedAt: 'DESC' },
            take: pageSize,
            skip: skip
        });

        const totalPages = Math.ceil(total / pageSize);
        
        const taskList = tasks.map(task => 
            `📺 ${task.resourceName}\n` +
            `⏱ 进度：${task.currentEpisodes}${task.totalEpisodes ? '/' + task.totalEpisodes : ''} 集\n` +
            `🔄 状态：${this.formatStatus(task.status)}\n` +
            `⌚️ 更新：${new Date(task.lastFileUpdateTime).toLocaleString('zh-CN')}\n` +
            `📁 执行: /execute_${task.id}\n` +
            `📁 STRM：/strm_${task.id}\n` +
            `🎬 Emby：/emby_${task.id}\n` +
            `❌ 删除: /dt_${task.id}`
        ).join('\n\n');

        const keyboard = [];

        // 添加分页按钮
        if (totalPages > 1) {
            const pageButtons = [];
            if (page > 1) {
                pageButtons.push({
                    text: '⬅️',
                    callback_data: JSON.stringify({ t: 'tp', p: page - 1 })
                });
            }
            pageButtons.push({
                text: `${page}/${totalPages}`,
                callback_data: JSON.stringify({ t: 'tp', p: page })
            });
            if (page < totalPages) {
                pageButtons.push({
                    text: '➡️',
                    callback_data: JSON.stringify({ t: 'tp', p: page + 1 })
                });
            }
            keyboard.push(pageButtons);
        }

        const message = tasks.length > 0 ? 
            `📋 任务列表 (第${page}页):\n\n${taskList}` : 
            '📭 暂无任务';

        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            // 先删除之前的消息
            if (this.globalTaskListMessageId) {
                await this.bot.deleteMessage(chatId, this.globalTaskListMessageId);
            }
            const newMessage = await this.bot.sendMessage(chatId, message, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
            this.globalTaskListMessageId = newMessage.message_id;
        }
    }

    formatStatus(status) {
        const statusMap = {
            'pending': '⏳ 等待执行',
            'processing': '🔄 追剧中',
            'completed': '✅ 已完结',
            'failed': '❌ 失败'
        };
        return statusMap[status] || status;
    }

    async setCurrentAccount(chatId, data, messageId) {
        try {
            const accountId = data.i;
            if (this.currentAccountId == accountId) {
                await this.bot.sendMessage(chatId, `账号[${data.a}]已被选中`);
                await this.bot.deleteMessage(chatId, messageId);
                return;
            } 
            this.currentAccountId = accountId;
            // 获取账号信息
            const account = await this.accountRepo.findOneBy({ id: accountId });
            if (!account) {
                await this.bot.sendMessage(chatId, '未找到该账号');
            }
            this.currentAccount = account;
            account.tgBotActive = true;
            this.accountRepo.save(account);
            // 删除原消息
            await this.bot.deleteMessage(chatId, messageId);
            await this.bot.sendMessage(chatId, `已选择账号: ${this._getDesensitizedUserName()}`);

        } catch (error) {
            this.bot.sendMessage(chatId, `设置当前账号失败: ${error.message}`);
        }
    }

    async handleFolderSelection(chatId, shareLink, messageId = null,accessCode) {
        const folders = await this.commonFolderRepo.find({ where: { accountId: this.currentAccountId } });
        
        if (folders.length === 0) {
            const keyboard = [[{ 
                text: '📁 添加常用目录',
                callback_data: JSON.stringify({ t: 'fd', f: '-11' })
            }]];
            const message = `当前账号: ${this._getDesensitizedUserName()} \n 未找到常用目录，请添加常用目录`;
            if (messageId) {
                await this.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: keyboard }
                });
                this.globalCommonFolderListMessageId = null
            } else {
                await this.bot.sendMessage(chatId, message, {reply_markup: { inline_keyboard: keyboard }});
            }
            return;
        }
        // 缓存当前分享信息
        this.currentShareLink = shareLink;
        this.currentAccessCode = accessCode;
        let taskName = ""
        // 解析链接
        try{
            const shareFolders = await this.taskService.parseShareFolderByShareLink(shareLink, this.currentAccountId, accessCode);
            taskName = shareFolders[0].name;
        }catch(e){
            await this.bot.sendMessage(chatId, `解析分享链接失败: ${e.message}`);
            return;
        }
    
        const keyboard = folders.map(folder => [{
            text: folder.path.length > 30 ? 
                  '.../' + folder.path.split('/').slice(-2).join('/') : 
                  folder.path,
            callback_data: JSON.stringify({
                t: 'f',               // type
                f: folder.id,   // folderId
            })
        }]);

        const message = `当前账号: ${this._getDesensitizedUserName()} \n资源名称: ${taskName}\n请选择保存目录:`;
        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
            this.lastButtonMessageId = messageId;
        } else {
            const msg = await this.bot.sendMessage(chatId, message, {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
            this.lastButtonMessageId = msg.message_id;
        }
    }

    async createTask(chatId, data, messageId) {
        try {
            const targetFolderId = data.f;
            // 根据targetFolderId查询出folderName
            const targetFolder = await this.commonFolderRepo.findOne({ where: { id: targetFolderId } });
            if (!targetFolder) {
                await this.bot.sendMessage(chatId, '未找到该目录');
                return
            }
            // 发送任务创建中消息
            const message = await this.bot.editMessageText('任务创建中...',{
                chat_id: chatId,
                message_id: messageId
            });
            const taskDto = {
                accountId: this.currentAccountId,
                shareLink: this.currentShareLink,
                targetFolderId: targetFolderId,
                targetFolder: targetFolder.path,
                tgbot: true,
                overwriteFolder: data?.o,
                accessCode: this.currentAccessCode
            };
            const tasks = await this.taskService.createTask(taskDto);
            // 遍历获取task.id
            const taskIds = tasks.map(task => task.id);
            this.bot.editMessageText('任务创建成功, 执行中...', {
                chat_id: chatId,
                message_id: message.message_id
            });
            if(taskIds.length > 0) {
                await this.taskService.processAllTasks(true, taskIds)   
            }
            this.bot.deleteMessage(chatId, message.message_id);
            // 发送任务执行完成消息
            this.bot.sendMessage(chatId, '任务执行完成');
            // 清空缓存
            this.currentShareLink = null;
            this.currentAccessCode = null;
        } catch (error) {
            // 如果报错是 folder already exists 则提示用户是否需要覆盖
            if (error.message.includes('folder already exists')) {
                const keyboard = [
                    [{ text: '是', callback_data: JSON.stringify({ t: 'of', f: data.f, o: true }) }],
                    [{ text: '否', callback_data: JSON.stringify({ t: 'of', f: data.f, o: false }) }]
                ];
                await this.bot.editMessageText('该目录下已有同名文件夹，是否覆盖？', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
                return;
            }else{
                await this.bot.editMessageText(`任务创建失败: ${error.message}`, {
                    chat_id: chatId,
                    message_id: messageId
                });
                // 清空缓存
                this.currentShareLink = null;
                this.currentAccessCode = null;
                return;
            }
        }
    }

    async deleteTask(chatId,data,messageId) {
        try{
            // 判断data.i是否为数字
            if(isNaN(data.i)) {
                await this.bot.editMessageText('任务ID无效', {
                    chat_id: chatId,
                    message_id: messageId
                });
                return;
            }
            // 发送任务删除中消息
            await this.bot.editMessageText('任务删除中...',{
                chat_id: chatId,
                message_id: messageId
            });

            await this.taskService.deleteTask(parseInt(data.i), data.df);
            await this.bot.editMessageText('任务删除成功', {
                chat_id: chatId,
                message_id: messageId
            });
            // 刷新任务列表
            setTimeout(() => this.showTasks(chatId, 1), 800);
        }catch(e) {
            this.bot.editMessageText(`任务删除失败: ${e.message}`, {
                chat_id: chatId,
                message_id: messageId
            });
        }
    }

    async showCommonFolders(chatId, messageId = null) {
        const folders = await this.commonFolderRepo.find({ 
            where: { 
                accountId: this.currentAccountId 
            },
            order: {
                path: 'ASC'
            }
        });
        const keyboard = [[{ 
            text: '📁 添加常用目录',
            callback_data: JSON.stringify({ t: 'fd', f: '-11' })
        }]];
        if (folders.length === 0) {
            const message = `当前账号: ${this._getDesensitizedUserName()} \n 未找到常用目录，请先添加常用目录`;
            if (messageId) {
                await this.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: keyboard }
                });
                this.globalCommonFolderListMessageId = null
            } else { 
                if (this.globalCommonFolderListMessageId) {
                    await this.bot.deleteMessage(chatId, this.globalCommonFolderListMessageId);
                    this.globalCommonFolderListMessageId = null;
                }
                await this.bot.sendMessage(chatId, message,{reply_markup: { inline_keyboard: keyboard }});
            }
            return;
        }

        const folderList = folders.map(folder => 
            `📁 ${folder.path}\n❌ 删除: /df_${folder.id}`
        ).join('\n\n');

        const message = `当前账号: ${this._getDesensitizedUserName()} \n 常用目录列表:\n\n${folderList}`;
        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard: keyboard }
            });
            this.globalCommonFolderListMessageId = null
        } else {
            if (this.globalCommonFolderListMessageId) {
                await this.bot.deleteMessage(chatId, this.globalCommonFolderListMessageId);
            }
            const newMessage = await this.bot.sendMessage(chatId, message,{reply_markup: { inline_keyboard: keyboard }});
            this.globalCommonFolderListMessageId = newMessage.message_id;
        }
    }

    async showFolderTree(chatId, data, messageId = null) {
        try {
            let folderId = data?.f || '-11';
            if (!this._checkUserId(chatId)) return;
            if (data?.r) {
               // 返回上一级目录，从记录的父级ID中获取
               const parentId = Array.from(this.parentFolderIds).pop() || '-11';
               this.parentFolderIds.delete(parentId);
               const path = this.currentFolderPath.split('/').filter(Boolean);
               path.pop();
               path.pop();
               this.currentFolderPath = path.join('/');
               folderId = parentId;
            } else if (folderId !== '-11') {
                // 非根目录时记录父级ID
                const folder = this.folders.get(folderId);
                if (folder?.pId) {
                    this.parentFolderIds.add(folder.pId);
                }
            }
            const cloud189 = Cloud189Service.getInstance(this.currentAccount);
            const folders = await cloud189.getFolderNodes(folderId);
            if (!folders) {
                await this.bot.sendMessage(chatId, '获取文件夹列表失败');
                return;
            }

            // 获取当前账号的所有常用目录
            const commonFolders = await this.commonFolderRepo.find({
                where: { accountId: this.currentAccountId }
            });
            const commonFolderIds = new Set(commonFolders.map(f => f.id));

            // 更新当前ID
            this.currentFolderId = folderId;

            // 处理路径更新
            if (folderId === '-11') {
                // 根目录
                this.currentFolderPath = '/';
            } else {
                this.currentFolderPath = path.join(this.currentFolderPath, this.folders.get(folderId).name);
            }

            const keyboard = [];
            
            // 添加文件夹按钮
            for (const folder of folders) {
                keyboard.push([{
                    text: `📁 ${folder.name}${commonFolderIds.has(folder.id) ? ' ✅' : ''}`,
                    callback_data: JSON.stringify({
                        t: 'fd',
                        f: folder.id
                    })
                }]);
                this.folders.set(folder.id, folder);
            }
            
            // 添加操作按钮
            keyboard.push([
                {
                    text: '❌ 关闭',
                    callback_data: JSON.stringify({ t: 'fc' })
                },
                ...(folderId !== '-11' ? [{
                    text: '🔄 返回',
                    callback_data: JSON.stringify({
                        t: 'fd',
                        f: folders[0]?.pId || '-11',
                        r: true
                    })
                }] : []),
                {
                    text: '✅ 确认',
                    callback_data: JSON.stringify({ 
                        t: 'fs',
                        f: folderId
                    })
                },
            ]);

            const message = `当前账号: ${this._getDesensitizedUserName()} \n 当前路径: ${this.currentFolderPath}\n请选择要添加的目录:`;

            if (messageId) {
                await this.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: keyboard }
                });
            } else {
                await this.bot.sendMessage(chatId, message, {
                    reply_markup: { inline_keyboard: keyboard }
                });
            }

        } catch (error) {
            console.log(error);
            this.bot.sendMessage(chatId, `获取目录失败: ${error.message}`);
        }
    }

    async saveFolderAsFavorite(chatId, data, messageId) {
        try {
            let currentPath = this.currentFolderPath|| '';

            // 校验目录是否已经是常用目录
            const existingFavorite = await this.commonFolderRepo.findOne({
                where: {
                    accountId: this.currentAccountId,
                    id: data.f
                }
            });
            if (existingFavorite) {
                await this.bot.editMessageText(`${data.p || '根目录'} 已经是常用目录`, {
                    chat_id: chatId,
                    message_id: messageId
                });
                this.globalCommonFolderListMessageId = null;
                return;
            }
            if (currentPath === '' || currentPath === '/') {
                currentPath = '/';
            }else{
                currentPath = currentPath.replace(/^\/|\/$/g, '');
            }
            const favorite = {
                accountId: this.currentAccountId,
                id: data.f,
                path: currentPath,
                name: currentPath.split('/').pop() || '根目录'
            };
            
            await this.commonFolderRepo.save(favorite);
            await this.bot.editMessageText(`已将 ${currentPath || '根目录'} 添加到常用目录`, {
                chat_id: chatId,
                message_id: messageId
            });
            
        } catch (error) {
            throw new Error(`保存常用目录失败: ${error.message}`);
        }
    }

    // 显示未匹配TMDB的任务列表
    async showRenameTasksList(chatId) {
        const tasks = await this.taskRepo.find({
            order: { updatedAt: 'DESC' },
            take: 20
        });
        if (tasks.length === 0) {
            await this.bot.sendMessage(chatId, '📢 暂无任务');
            return;
        }
        const taskText = tasks.map((t, i) =>
            `${i + 1}. 📺 ${t.resourceName}\n` +
            `   ${t.manualTmdbBound ? `✅ 已绑定: ${t.tmdbTitle || t.tmdbId}${t.manualSeason != null ? ' 第' + t.manualSeason + '季' : ''}` : '❌ 未绑定TMDB'}\n` +
            `   /bind_${t.id}`
        ).join('\n\n');
        await this.bot.sendMessage(chatId, `🎥 任务列表 (TMDB绑定状态)\n\n${taskText}\n\n输入 /bind_[ID] 为对应任务绑定TMDB`, { parse_mode: 'HTML' });
    }

    // 开始 TMDB 绑定流程（回调按键 tr）
    async _startTmdbBind(chatId, data, messageId) {
        const taskId = data.ti;
        const task = await this.taskRepo.findOneBy({ id: taskId });
        if (!task) {
            await this.bot.editMessageText(`未找到任务`, { chat_id: chatId, message_id: messageId });
            return;
        }
        this.tmdbBindTaskId = taskId;
        const keyboard = [
            [{ text: '📺 剧集/动漫/纪录片', callback_data: JSON.stringify({ t: 'ts', tp: 'tv', ti: taskId }) }],
            [{ text: '🎦 电影', callback_data: JSON.stringify({ t: 'ts', tp: 'movie', ti: taskId }) }]
        ];
        await this.bot.editMessageText(
            `任务：《${task.resourceName}》\n\n请选择媒体类型：`,
            { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: keyboard } }
        );
    }

    // 设置搜索类型，进入等待文字输入模式
    async _setTmdbSearchType(chatId, data, messageId) {
        this.tmdbBindType = data.tp;
        this.tmdbBindTaskId = data.ti;
        this.tmdbBindMode = true;
        const typeLabel = data.tp === 'tv' ? '剧集/动漫' : '电影';
        await this.bot.editMessageText(
            `已选择类型：${typeLabel}\n\n🔍 请发送影视名称开始搜索\n\n输入 /cancel 可取消`,
            { chat_id: chatId, message_id: messageId }
        );
    }

    // 处理用户输入的 TMDB 搜索关键词
    async _handleTmdbSearchInput(chatId, input) {
        if (!input) return;
        const loadMsg = await this.bot.sendMessage(chatId, `🔍 正在搜索 "${input}"...`);
        try {
            const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/tmdb/search?query=${encodeURIComponent(input)}&type=${this.tmdbBindType}`, {
                headers: { 'x-api-key': require('./ConfigService').getConfigValue('system.apiKey', '') }
            });
            const result = await response.json();
            if (!result.success || !result.data?.length) {
                await this.bot.editMessageText(`未找到相关结果，请尝试其他关键词`, { chat_id: chatId, message_id: loadMsg.message_id });
                return;
            }
            this.tmdbSearchResultsCache = result.data;
            const keyboard = result.data.slice(0, 8).map((item, idx) => [{
                text: `${idx + 1}. ${item.title || item.name} (${(item.release_date || item.first_air_date || '').substring(0, 4)}) [${item.id}]`,
                callback_data: JSON.stringify({ t: 'tb', idx, ti: this.tmdbBindTaskId, tp: this.tmdbBindType })
            }]);
            keyboard.push([{ text: '❌ 取消', callback_data: JSON.stringify({ t: 'fc' }) }]);
            await this.bot.editMessageText(
                `📊 搜到 ${result.data.length} 条结果，请选择：\n\n(如果列表没有想要的，可输入 /cancel 后重新搜索)`,
                { chat_id: chatId, message_id: loadMsg.message_id, reply_markup: { inline_keyboard: keyboard } }
            );
            this.tmdbBindMode = false; // 退出输入模式，等待回调选择
        } catch (e) {
            await this.bot.editMessageText(`搜索失败: ${e.message}`, { chat_id: chatId, message_id: loadMsg.message_id });
        }
    }

    // 用户选了某个TMDB结果，进入选季数步骤
    async _confirmTmdbBind(chatId, data, messageId) {
        const item = this.tmdbSearchResultsCache[data.idx];
        if (!item) {
            await this.bot.editMessageText('结果已过期，请重新搜索', { chat_id: chatId, message_id: messageId });
            return;
        }
        const title = item.title || item.name;
        const tmdbId = item.id;
        const tp = data.tp;
        if (tp === 'tv') {
            // 剧集类：进入选季数步骤
            const seasonBtns = [1, 2, 3, 4, 5, 6].map(s => ({
                text: `第${s}季`,
                callback_data: JSON.stringify({ t: 'tse', s, id: tmdbId, tp, ti: data.ti, title })
            }));
            const rows = [];
            for (let i = 0; i < seasonBtns.length; i += 3) rows.push(seasonBtns.slice(i, i + 3));
            rows.push([{ text: '🤖 自动识别季数', callback_data: JSON.stringify({ t: 'tse', s: null, id: tmdbId, tp, ti: data.ti, title }) }]);
            rows.push([{ text: '❌ 取消', callback_data: JSON.stringify({ t: 'fc' }) }]);
            await this.bot.editMessageText(
                `✅ 已选择：《${title}》 (TMDB: ${tmdbId})\n\n📅 请选择季数（不确定可选“自动识别”）：`,
                { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: rows } }
            );
        } else {
            // 电影类：直接绑定
            await this._doBindTmdb(chatId, messageId, data.ti, tmdbId, tp, title, null);
        }
    }

    // 用户选了季数，执行最终绑定
    async _selectTmdbSeason(chatId, data, messageId) {
        await this._doBindTmdb(chatId, messageId, data.ti, data.id, data.tp, data.title, data.s);
    }

    // 实际调用API绑定TMDB并触发重命名
    async _doBindTmdb(chatId, messageId, taskId, tmdbId, videoType, title, manualSeason) {
        await this.bot.editMessageText('⏳ 正在绑定并触发重命名...', { chat_id: chatId, message_id: messageId });
        try {
            const apiKey = require('./ConfigService').getConfigValue('system.apiKey', '');
            const port = process.env.PORT || 3000;
            const resp = await fetch(`http://localhost:${port}/api/tasks/${taskId}/manual-tmdb`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                body: JSON.stringify({ tmdbId: String(tmdbId), videoType, title, manualSeason })
            });
            const result = await resp.json();
            if (result.success) {
                // 触发执行
                fetch(`http://localhost:${port}/api/tasks/${taskId}/execute`, {
                    method: 'POST',
                    headers: { 'x-api-key': apiKey }
                });
                const seasonTxt = manualSeason != null ? ` 第${manualSeason}季` : ' (自动识别季)';
                const successTxt = `✅ 绑定成功！\n🎥 媒体：${title}${videoType === 'tv' ? seasonTxt : ''}\n🎯 TMDB ID: ${tmdbId}\n\n🔄 已在后台触发重命名，稍后会发送结果通知`;
                await this.bot.editMessageText(successTxt, { chat_id: chatId, message_id: messageId });
            } else {
                await this.bot.editMessageText(`❌ 绑定失败: ${result.error}`, { chat_id: chatId, message_id: messageId });
            }
        } catch (e) {
            await this.bot.editMessageText(`❌ 绑定失败: ${e.message}`, { chat_id: chatId, message_id: messageId });
        }
    }

    // 发送TMDB匹配失败告警（在task.js中调用）
    async sendTmdbFailAlert(task) {
        if (!this.bot || !this.chatId) return;
        const keyboard = [[
            { text: '🔍 搜索并绑定TMDB', callback_data: JSON.stringify({ t: 'tr', ti: task.id }) }
        ]];
        const text = `⚠️ TMDB 自动匹配失败\n\n📺 任务：${task.resourceName}\n💡 需要手动指定TMDB信息才能正确重命名`;
        try {
            await this.bot.sendMessage(this.chatId, text, { reply_markup: { inline_keyboard: keyboard } });
        } catch (e) {
            console.error('发送TMDB失败告警失败:', e.message);
        }
    }

    async cloudSaverSearch(chatId, msg) {
        const keyword = msg.text?.trim();
        if (!keyword) return;
        // 重置超时时间
        this._resetSearchModeTimeout(chatId);
        try {
            const message = await this.bot.sendMessage(chatId, '正在搜索...');
            const result = await this.cloudSaverSdk.search(keyword);
            if (result.length <= 0) {
                await this.bot.editMessageText('未找到相关资源', {
                    chat_id: chatId,
                    message_id: message.message_id
                });
                return
            }
            // 保存结果到this.cloudSaverSearchMap
            result.forEach((item, index) => {
                this.cloudSaverSearchMap.set(index + 1, item.cloudLinks[0].link);
            });
            const results = `💡 以下资源来自 CloudSaver\n` +
                `📝 共找到 ${result.length} 个结果,输入编号可转存\n` +
                result.map((item, index) => 
                    `${index + 1}. 🎬 <a href="${item.cloudLinks[0].link}">${item.title}</a>`
                ).join('\n\n');
            await this.bot.editMessageText(`搜索结果：\n\n${results}`, {
                chat_id: chatId,
                message_id: message.message_id,
                parse_mode: 'HTML'
            });
        } catch (error) {
            await this.bot.sendMessage(chatId, `搜索失败: ${error.message}`);
        }
    }

    // 校验任务id
    _checkTaskId(taskId) {
        if(isNaN(taskId)) {
            this.bot.editMessageText('任务ID无效', {
                chat_id: chatId,
                message_id: messageId
            });
            return false;
        }
        return true;
    }
    // 校验当前是否有用户id
    _checkUserId(chatId) {
        if(!this.currentAccountId) {
            this.bot.sendMessage(chatId, '请先使用 /accounts 选择账号');
            return false;
        }
        return true;
    }
    // 校验是否是当前chatId
    _checkChatId(chatId) {
        if (chatId != this.chatId) return false;
        return true;
    }
    // 获取当前已脱敏的用户名
    _getDesensitizedUserName() {
       return this.currentAccount.username.replace(/(.{3}).*(.{4})/, '$1****$2');
    }

    // 在类的底部添加新的辅助方法
    _resetSearchModeTimeout(chatId) {
        // 清除现有的超时计时器
        if (this.searchModeTimeout) {
            clearTimeout(this.searchModeTimeout);
        }
        
        // 设置新的超时计时器
        this.searchModeTimeout = setTimeout(async () => {
            if (this.isSearchMode) {
                this.isSearchMode = false;
                this.cloudSaverSearchMap = new Map();
                await this.bot.sendMessage(chatId, '长时间未搜索，已自动退出搜索模式');
            }
        }, 3 * 60 * 1000);  // 3分钟
    }
}

module.exports = { TelegramBotService };