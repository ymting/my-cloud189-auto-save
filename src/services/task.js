const { LessThan, In, IsNull } = require('typeorm');
const { Cloud189Service } = require('./cloud189');
const { MessageUtil } = require('./message');
const { logTaskEvent } = require('../utils/logUtils');
const ConfigService = require('./ConfigService');
const { CreateTaskDto } = require('../dto/TaskDto');
const { BatchTaskDto } = require('../dto/BatchTaskDto');
const { TaskCompleteEventDto } = require('../dto/TaskCompleteEventDto');
const { SchedulerService } = require('./scheduler');
const taskCacheManager = require('./TaskCacheManager');

const path = require('path');
const { StrmService } = require('./strm');
const { EventService } = require('./eventService');
const { TaskEventHandler } = require('./taskEventHandler');
const AIService = require('./ai');
const { TMDBService } = require('./tmdb');
const harmonizedFilter = require('../utils/BloomFilter');
const cloud189Utils = require('../utils/Cloud189Utils');
const alistService = require('./alistService');
const CasUtils = require('../utils/CasUtils');

class TaskService {
    constructor(taskRepo, accountRepo) {
        this.taskRepo = taskRepo;
        this.accountRepo = accountRepo;
        this.messageUtil = new MessageUtil();
        this.eventService = EventService.getInstance();
        // 如果还没有taskComplete事件的监听器，则添加
        if (!this.eventService.hasListeners('taskComplete')) {
            const taskEventHandler = new TaskEventHandler(this.messageUtil);
            this.eventService.on('taskComplete', async (eventDto) => {
                eventDto.taskService = this;
                eventDto.taskRepo = this.taskRepo;
                taskEventHandler.handle(eventDto);
            });
        }
    }

    // 解析分享链接
    async getShareInfo(cloud189, shareCode) {
         const shareInfo = await cloud189.getShareInfo(shareCode);
         if (!shareInfo) throw new Error('获取分享信息失败');
         if(shareInfo.res_code == "ShareAuditWaiting") {
            throw new Error('分享链接审核中, 请稍后再试');
         }
         return shareInfo;
    }

    // 创建任务的基础配置
    _createTaskConfig(taskDto, shareInfo, realFolder, resourceName, currentEpisodes = 0, shareFolderId = null, shareFolderName = "") {
        return {
            accountId: taskDto.accountId,
            shareLink: taskDto.shareLink,
            targetFolderId: taskDto.targetFolderId,
            realFolderId:realFolder.id,
            realFolderName:realFolder.name,
            status: 'pending',
            totalEpisodes: taskDto.totalEpisodes,
            resourceName,
            currentEpisodes,
            shareFileId: shareInfo.fileId,
            shareFolderId: shareFolderId || shareInfo.fileId,
            shareFolderName,
            shareId: shareInfo.shareId,
            shareMode: shareInfo.shareMode,
            accessCode: taskDto.accessCode,
            matchPattern: taskDto.matchPattern,
            matchOperator: taskDto.matchOperator,
            matchValue: taskDto.matchValue,
            remark: taskDto.remark,
            realRootFolderId: taskDto.realRootFolderId,
            enableCron: taskDto.enableCron,
            cronExpression: taskDto.cronExpression,
            sourceRegex: taskDto.sourceRegex,
            targetRegex: taskDto.targetRegex,
            enableTaskScraper: taskDto.enableTaskScraper,
            isFolder: taskDto.isFolder,
            videoType: taskDto.videoType
        };
    }

     // 验证并创建目标目录
     async _validateAndCreateTargetFolder(cloud189, taskDto, shareInfo) {
        if (!this.checkFolderInList(taskDto, '-1')) {
            return {id: taskDto.targetFolderId, name: '', oldFolder: true}
        }
        // 优先使用任务名称，如果没有设置则使用分享链接名称
        const folderName = taskDto.taskName || shareInfo.fileName;
        // 检查目标文件夹是否存在
        await this.checkFolderExists(cloud189, taskDto.targetFolderId, folderName, taskDto.overwriteFolder);
        const targetFolder = await cloud189.createFolder(folderName, taskDto.targetFolderId);
        if (!targetFolder || !targetFolder.id) throw new Error('创建目录失败');
        return targetFolder;
    }

    // 处理文件夹分享
    async _handleFolderShare(cloud189, shareInfo, taskDto, rootFolder, tasks) {
        const result = await cloud189.listShareDir(shareInfo.shareId, shareInfo.fileId, shareInfo.shareMode, taskDto.accessCode);
        if (!result?.fileListAO) return;
        const { fileList: rootFiles = [], folderList: subFolders = [] } = result.fileListAO;
        // 处理根目录文件 如果用户选择了根目录, 则生成根目录任务
        if (rootFiles.length > 0 && !rootFolder?.oldFolder) {
            const enableOnlySaveMedia = ConfigService.getConfigValue('task.enableOnlySaveMedia');
            // mediaSuffixs转为小写
            const mediaSuffixs = ConfigService.getConfigValue('task.mediaSuffix').split(';').map(suffix => suffix.toLowerCase())
            // 校验文件是否一个满足条件的都没有, 如果都没有 直接跳过
            let shouldContinue = false;
            if (enableOnlySaveMedia && !rootFiles.some(file => this._checkFileSuffix(file, true, mediaSuffixs))) {
                shouldContinue = true
            }
            if (!shouldContinue) {
                taskDto.realRootFolderId = rootFolder.id;
                const rootTask = this.taskRepo.create(
                    this._createTaskConfig(
                        taskDto,
                        shareInfo, rootFolder, taskDto.taskName || shareInfo.fileName, 0
                    )
                );
                tasks.push(await this.taskRepo.save(rootTask));
            }
        }
        if (subFolders.length > 0) {
            taskDto.realRootFolderId = rootFolder.id;
            // 如果启用了 AI 分析，分析子文件夹
            if (AIService.isEnabled() && subFolders.length > 0) {
                try {
                    const resourceInfo = await this._analyzeResourceInfo(
                        shareInfo.fileName,
                        subFolders.map(f => ({ id:f.id, name: f.name })),
                        'folder'
                    );
                    // 遍历子文件夹，使用 AI 分析结果更新文件夹名称
                    for (const folder of subFolders) {
                        // 在 AI 分析结果中查找对应的文件夹
                        const aiFolder = resourceInfo.folders.find(f => f.id === folder.id);
                        if (aiFolder) {
                            folder.name = aiFolder.name;
                        }
                    }
                } catch (error) {
                    logTaskEvent('子文件夹 AI 分析失败，使用原始文件名: ' + error.message);
                }
            }
             // 处理子文件夹
            for (const folder of subFolders) {
                // 检查用户是否选择了该文件夹
                if (!this.checkFolderInList(taskDto, folder.id)) {
                    continue;
                }
                const subFolderContent = await cloud189.listShareDir(shareInfo.shareId, folder.id, shareInfo.shareMode, taskDto.accessCode);
                const hasFiles = subFolderContent?.fileListAO?.fileList?.length > 0;
                if (!hasFiles) {
                    logTaskEvent(`子文件夹 "${folder.name}" (ID: ${folder.id}) 为空，跳过目录。`);
                    continue; // 跳到下一个子文件夹
                }
                let realFolder;
                // 检查目标文件夹是否存在
                await this.checkFolderExists(cloud189, rootFolder.id, folder.fileName, taskDto.overwriteFolder);
                realFolder = await cloud189.createFolder(folder.name, rootFolder.id);
                if (!realFolder?.id) throw new Error('创建目录失败');
                rootFolder?.oldFolder && (taskDto.realRootFolderId = realFolder.id);
                realFolder.name = path.join(rootFolder.name, realFolder.name);
                const subTask = this.taskRepo.create(
                    this._createTaskConfig(
                        taskDto,
                        shareInfo, realFolder, taskDto.taskName || shareInfo.fileName, 0, folder.id, folder.name
                    )
                );
                tasks.push(await this.taskRepo.save(subTask));
            }
        }
    }

    // 处理单文件分享
    async _handleSingleShare(cloud189, shareInfo, taskDto, rootFolder, tasks) {
        const shareFiles = await cloud189.getShareFiles(shareInfo.shareId, shareInfo.fileId, shareInfo.shareMode, taskDto.accessCode, false);
        if (!shareFiles?.length) throw new Error('获取文件列表失败');
        taskDto.realRootFolderId = rootFolder.id;
        const task = this.taskRepo.create(
            this._createTaskConfig(
                taskDto,
                shareInfo, rootFolder, taskDto.taskName || shareInfo.fileName, 0
            )
        );
        tasks.push(await this.taskRepo.save(task));
    }

    // 提纯影视文件名，移除技术参数和季集信息
    // 例如: "Gimlet Eyes.2026.S01E01.2160p.SDR.25fps.10-bit.HEVC.AAC 2.0@HiveWeb.mp4" -> "Gimlet Eyes"
    // 例如: "Throne.of.Seal.S01E198.2160p.mkv" -> "Throne of Seal"
    // 例如: "The.Matrix.1999.2160p.BluRay.x264.mp4" -> "The Matrix"
    _extractCleanTitle(fileName) {
        let name = fileName;

        // 0. 移除常见任务后缀（中文）- 用户创建任务时添加的说明
        name = name.replace(/\s*(仅秒传|秒传|自动保存|自动转存|追剧|更新|订阅)$/gi, '');

        // 1. 移除文件扩展名
        name = name.replace(/\.(mkv|mp4|avi|rmvb|wmv|m2ts|ts|flv|mov|iso|mpg|rm)$/i, '');

        // 2. 先提取并移除年份（在移除其他内容前）
        // 年份格式: .2026. 或 (2026) 或 【2026】
        name = name.replace(/\.\d{4}\./g, '.');         // .2026.
        name = name.replace(/[\[\({【（]\d{4}[\]\)}】）]/g, ''); // (2026)

        // 3. 移除季集信息 (S01E01, S01, E01, 第1集, 第1季 等)
        name = name.replace(/\.S\d+[-_ ]*E\d+/gi, '.');  // S01E01
        name = name.replace(/\.S\d+.*/i, '');            // S01 → 截断其后所有内容
        name = name.replace(/\s+S\d+\s*.*/i, '');        // S01 (空格版) → 截断
        name = name.replace(/\.E[P]?\d+/gi, '.');        // E01, EP01
        name = name.replace(/\.第\s*\d+\s*[集季话]/gi, '.'); // 第1集, 第1季, 第1话

        // 4. 移除技术参数（常见视频/音频编码格式）- 使用更宽松的匹配
        const techParams = [
            // 分辨率
            '2160p', '1080p', '720p', '480p', '360p', '4K', '8K',
            // 视频编码
            'HEVC', 'H\\.265', 'x265', 'AVC', 'H\\.264', 'x264', 'AV1', 'VP9',
            // 视频质量
            'SDR', 'HDR', 'HDR10', 'DV', 'DolbyVision', 'Hybrid', 'REMUX', 'BluRay', 'WEB-DL', 'WEBRip',
            // 音频编码
            'AAC', 'AC3', 'DTS', 'DTS-HD', 'DTS-MA', 'TrueHD', 'FLAC', 'MP3', 'DDP', 'DD',
            // 帧率
            'fps', '25fps', '30fps', '24fps', '60fps', '23\\.976fps',
            // 位深
            '10-bit', '8-bit', '10bit', '8bit',
            // 音频声道（数字格式）
            '2\\.0', '5\\.1', '7\\.1', '2ch', '6ch', '8ch',
            // Atmos
            'Atmos',
            // 来源/组名
            'HiveWeb', 'Hive', 'WEB', 'NTB', 'FRDS', 'CMCT', 'ADWeb', 'Bilibili', 'iQIYI', 'Youku',
            // 其他
            'SD', 'HD', 'UHD', 'Complete', 'Final', 'OVA', 'SP', 'OAD'
        ];
        // 匹配格式: .参数 或 参数. 或 参数后面有空格/@
        for (const param of techParams) {
            // 移除点号包裹的参数
            name = name.replace(new RegExp(`\\.${param}\\.?`, 'gi'), '.');
            // 移除空格分隔的参数
            name = name.replace(new RegExp(`\\s+${param}(\\s|\\.|$|@)`, 'gi'), ' ');
            // 移除 @ 前缀的参数
            name = name.replace(new RegExp(`@${param}`, 'gi'), '');
        }

        // 5. 移除 @xxx 后缀（如 @HiveWeb）
        name = name.replace(/@[\w.-]+/gi, '');

        // 6. 清理多余点号和空格（多次清理确保干净）
        name = name.replace(/\.\./g, '.');
        name = name.replace(/\.\./g, '.');  // 再次清理（可能产生新的双点）
        name = name.replace(/\.$/, '');
        name = name.replace(/^\./, '');
        name = name.trim();

        // 7. 将点号替换为空格（更符合 TMDB 搜索格式）
        name = name.replace(/\./g, ' ');
        name = name.replace(/\s+/g, ' ').trim();

        // 8. 移除残留的数字孤立（可能是帧率/声道残留）
        name = name.replace(/\s+\d+\s+/g, ' ');  // 孤立数字
        name = name.replace(/\s+\d+$/g, '');     // 末尾数字
        name = name.trim();

        return name;
    }

    // 从文件名提取年份
    // 支持格式: .2026. (2026) 【2026】 或末尾的年份
    _extractYear(fileName) {
        // 格式1: .年份. (如 Gimlet Eyes.2026.S01)
        const dotYearMatch = fileName.match(/\.(20\d{2}|19\d{2})\./i);
        if (dotYearMatch) return parseInt(dotYearMatch[1]);

        // 格式2: (年份) 【年份】 等括号格式
        const bracketYearMatch = fileName.match(/[\[\({【（](20\d{2}|19\d{2})[\]\)}】）]/);
        if (bracketYearMatch) return parseInt(bracketYearMatch[1]);

        // 格式3: 末尾年份（如 繁花 (2023)）
        const endYearMatch = fileName.match(/[\[\({【（]?(20\d{2}|19\d{2})[\]\)}】）]?\s*$/);
        if (endYearMatch) return parseInt(endYearMatch[1]);

        return 0;
    }

    async _analyzeResourceInfo(resourcePath, files, type = 'folder', taskDto = null) {
        try {
            if (type == 'folder') {
                const result = await AIService.folderAnalysis(resourcePath, files);
                if (!result.success) {
                    throw new Error('AI 分析失败:'+ result.error);
                }
                return result.data;
            }

            // ====== 针对文件类型优化的重命名 (TMDB 优先 + 本地正则全量匹配) ======
            // 1. 提纯影视名称（移除技术参数）
            let baseName = this._extractCleanTitle(resourcePath);
            // 2. 提取年份
            let year = this._extractYear(resourcePath);

            logTaskEvent(`[AI重命名] 文件名提纯: "${resourcePath}" -> "${baseName}", 年份: ${year || '未知'}`);

            // ====== 优先从任务名中提取 TMDB ID（比标题搜索更准确） ======
            // 支持格式: {tmdb-71233}, [tmdbid=71233], tmdb:71233 等
            const tmdbIdMatch = resourcePath.match(/(?:^|[\[{(\s_/])tmdb(?:id)?[-=:_ ](\d+)(?:$|[\]})\s_/])/i);
            let extractedTmdbId = null;

            if (tmdbIdMatch) {
                extractedTmdbId = parseInt(tmdbIdMatch[1]);
                // 清理 baseName，移除 TMDB ID 标记部分
                baseName = baseName.replace(/\s*\{tmdb[^}]*\}\s*/i, '').trim();
                baseName = baseName.replace(/\s*\[tmdb[^]]*\]\s*/i, '').trim();
                baseName = baseName.replace(/\s*\(tmdb[^)]*\)\s*/i, '').trim();
                logTaskEvent(`[AI重命名] 从任务名提取到 TMDB ID: ${extractedTmdbId}，清理后的名称: ${baseName}`);
            }

            let tmdbName = null;
            let tmdbParsed = false;
            let tmdbType = type;

            // ====== 启发式判断视频类型（在 TMDB 搜索前分析资源特征） ======
            let inferredType = null; // 启发式推断的类型，优先级低于用户指定
            // 1. 根据保存路径中的关键字判断（仅当用户未指定类型时）
            if (!taskDto?.videoType) {
                const savePath = taskDto?.realFolderName || '';
                const moviePathKeywords = ['/电影/', '/Movies/', '/Movie/', '/movie/', '/影片/'];
                const tvPathKeywords = ['/电视剧/', '/TV/', '/Tv/', '/tv/', '/剧集/', '/动漫/', '/番剧/'];
                if (moviePathKeywords.some(k => savePath.includes(k))) {
                    inferredType = 'movie';
                    logTaskEvent(`[AI重命名] 启发式判断：保存路径含电影关键字 -> 推断为电影`);
                } else if (tvPathKeywords.some(k => savePath.includes(k))) {
                    inferredType = 'tv';
                    logTaskEvent(`[AI重命名] 启发式判断：保存路径含电视剧关键字 -> 推断为电视剧`);
                }
            }

            // 2. 根据文件名中的季集信息判断（有季集标识则是电视剧）
            if (!inferredType && files && files.length > 0) {
                const hasEpisodePattern = files.some(f =>
                    /S\d+[-_ ]*E\d+|第\s*\d+\s*[集话]|EP?\d+/i.test(f.name || '')
                );
                if (hasEpisodePattern) {
                    inferredType = 'tv';
                    logTaskEvent(`[AI重命名] 启发式判断：文件名含季集标识 -> 推断为电视剧`);
                }
            }

            // 3. 根据文件数量判断（单文件更可能是电影）
            if (!inferredType && files && files.length > 0) {
                const mediaFiles = files.filter(f => !f.isFolder);
                if (mediaFiles.length === 1) {
                    inferredType = 'movie';
                    logTaskEvent(`[AI重命名] 启发式判断：仅1个媒体文件 -> 推断为电影`);
                }
            }

            if (inferredType) {
                logTaskEvent(`[AI重命名] 启发式判断最终结果: ${inferredType === 'movie' ? '电影' : '电视剧'}`);
            }

            try {
                // 如果用户已经手动指定了 TMDB，则直接获取该详情
                if (taskDto && taskDto.manualTmdbBound && taskDto.tmdbId && taskDto.videoType) {
                    logTaskEvent(`[AI重命名] 检测到任务已手动绑定 TMDB ID: ${taskDto.tmdbId}，跳过自动搜索，直接拉取绑定信息。`);
                    const tmdbService = new TMDBService();
                    const detail = taskDto.videoType === 'movie'
                        ? await tmdbService.getMovieDetails(taskDto.tmdbId)
                        : await tmdbService.getTVDetails(taskDto.tmdbId);

                    if (detail && detail.title) {
                        tmdbName = detail.title;
                        tmdbType = detail.type || taskDto.videoType;
                        if (detail.releaseDate) year = parseInt(detail.releaseDate.substring(0, 4)) || year;
                        tmdbParsed = true;
                        logTaskEvent(`[AI重命名] 手动指定匹配成功: 成功获得影视名称【${tmdbName} (${year})】`);
                    } else {
                        logTaskEvent(`[AI重命名] 手动指定匹配失败: 无法根据提供的 TMDB ID 从远程获取到实际名称`);
                    }
                } else if (extractedTmdbId) {
                    // ====== 优先使用提取到的 TMDB ID，直接调用详情 API ======
                    const tmdbApiKey = ConfigService.getConfigValue('tmdb.tmdbApiKey');
                    if (tmdbApiKey) {
                        logTaskEvent(`[AI重命名] 使用提取的 TMDB ID ${extractedTmdbId} 直接查询详情...`);
                        const tmdbService = new TMDBService();

                        // 使用启发式推断结果决定查询顺序，auto-detect 的 videoType 作为回退
                        let detail = null;
                        const searchType = inferredType || taskDto?.videoType || 'tv';
                        if (searchType === 'movie') {
                            detail = await tmdbService.getMovieDetails(extractedTmdbId);
                            if (detail && detail.title) {
                                tmdbType = 'movie';
                            } else {
                                detail = await tmdbService.getTVDetails(extractedTmdbId);
                                if (detail && detail.title) {
                                    tmdbType = 'tv';
                                }
                            }
                        } else {
                            detail = await tmdbService.getTVDetails(extractedTmdbId);
                            if (detail && detail.title) {
                                tmdbType = 'tv';
                            } else {
                                detail = await tmdbService.getMovieDetails(extractedTmdbId);
                                if (detail && detail.title) {
                                    tmdbType = 'movie';
                                }
                            }
                        }

                        if (detail && detail.title) {
                            tmdbName = detail.title;
                            if (detail.releaseDate) year = parseInt(detail.releaseDate.substring(0, 4)) || year;
                            tmdbParsed = true;
                            logTaskEvent(`[AI重命名] TMDB ID ${extractedTmdbId} 匹配成功: 【${tmdbName} (${year})】，类型: ${tmdbType}`);
                        } else {
                            logTaskEvent(`[AI重命名] TMDB ID ${extractedTmdbId} 查询失败: 未找到有效信息，将回退标题搜索`);
                        }
                    }
                } else {
                    // 检查是否配置了 TMDB API Key
                    const tmdbApiKey = ConfigService.getConfigValue('tmdb.tmdbApiKey');
                    if (tmdbApiKey) {
                        logTaskEvent(`[AI重命名] 未发现手动指定，正在通过 TMDB 自动搜索可能匹配的名称: ${baseName}...`);
                        // 查询 TMDB (优先返回中文名称)
                        const tmdbService = new TMDBService();

                        // 如果用户指定了videoType，优先按指定类型搜索
                        if (taskDto?.videoType === 'movie') {
                            const movieResult = await tmdbService.searchMovie(baseName, year ? year.toString() : '');
                            if (movieResult && movieResult.title) {
                                tmdbName = movieResult.title;
                                tmdbType = 'movie';
                                if (movieResult.releaseDate) year = parseInt(movieResult.releaseDate.substring(0, 4)) || year;
                                tmdbParsed = true;
                                if (taskDto) {
                                    taskDto.tmdbId = String(movieResult.id);
                                    taskDto.tmdbTitle = movieResult.title;
                                    taskDto.videoType = 'movie';
                                    taskDto.tmdbContent = JSON.stringify(movieResult);
                                    if (movieResult.type === 'tv' && movieResult.seasons) {
                                        const n = taskDto.shareFolderName || taskDto.resourceName || '';
                                        const m = n.match(/(?:Season|S|第)\s*(\d+)/i);
                                        const seasonNum = (m ? parseInt(m[1]) : null)
                                            || Math.max(...movieResult.seasons.filter(s => s.season_number > 0).map(s => s.season_number), 0);
                                        const s = movieResult.seasons.find(s => s.season_number === seasonNum);
                                        if (s?.episode_count > 0) taskDto.totalEpisodes = s.episode_count;
                                    }
                                }
                            }
                        } else if (taskDto?.videoType === 'tv') {
                            const tvResult = await tmdbService.searchTV(baseName, year ? year.toString() : '');
                            if (tvResult && tvResult.title) {
                                tmdbName = tvResult.title;
                                tmdbType = 'tv';
                                if (tvResult.releaseDate) year = parseInt(tvResult.releaseDate.substring(0, 4)) || year;
                                tmdbParsed = true;
                                if (taskDto) {
                                    taskDto.tmdbId = String(tvResult.id);
                                    taskDto.tmdbTitle = tvResult.title;
                                    taskDto.videoType = 'tv';
                                    taskDto.tmdbContent = JSON.stringify(tvResult);
                                    if (tvResult.seasons) {
                                        const n = taskDto.shareFolderName || taskDto.resourceName || '';
                                        const m = n.match(/(?:Season|S|第)\s*(\d+)/i);
                                        const seasonNum = (m ? parseInt(m[1]) : null)
                                            || Math.max(...tvResult.seasons.filter(s => s.season_number > 0).map(s => s.season_number), 0);
                                        const s = tvResult.seasons.find(s => s.season_number === seasonNum);
                                        if (s?.episode_count > 0) taskDto.totalEpisodes = s.episode_count;
                                    }
                                }
                            }
                        } else {
                            // 未指定类型，使用启发式判断结果决定搜索优先级
                            const searchType = inferredType || 'tv'; // 默认回退电视剧（CAS资源多为剧集）
                            const primaryResult = searchType === 'movie'
                                ? await tmdbService.searchMovie(baseName, year ? year.toString() : '')
                                : await tmdbService.searchTV(baseName, year ? year.toString() : '');

                            if (primaryResult && primaryResult.title) {
                                tmdbName = primaryResult.title;
                                tmdbType = searchType;
                                if (primaryResult.releaseDate) year = parseInt(primaryResult.releaseDate.substring(0, 4)) || year;
                                tmdbParsed = true;
                                logTaskEvent(`[AI重命名] TMDB ${searchType === 'movie' ? '电影' : '电视剧'}搜索匹配成功: ${tmdbName}`);
                                if (taskDto) {
                                    taskDto.tmdbId = String(primaryResult.id);
                                    taskDto.tmdbTitle = primaryResult.title;
                                    taskDto.videoType = primaryResult.type || searchType;
                                    taskDto.tmdbContent = JSON.stringify(primaryResult);
                                    if ((primaryResult.type || searchType) === 'tv' && primaryResult.seasons) {
                                        const n = taskDto.shareFolderName || taskDto.resourceName || '';
                                        const m = n.match(/(?:Season|S|第)\s*(\d+)/i);
                                        const seasonNum = (m ? parseInt(m[1]) : null)
                                            || Math.max(...primaryResult.seasons.filter(s => s.season_number > 0).map(s => s.season_number), 0);
                                        const s = primaryResult.seasons.find(s => s.season_number === seasonNum);
                                        if (s?.episode_count > 0) taskDto.totalEpisodes = s.episode_count;
                                    }
                                }
                            } else {
                                // 首选类型搜不到，尝试另一种类型
                                const fallbackType = searchType === 'movie' ? 'tv' : 'movie';
                                const fallbackResult = fallbackType === 'movie'
                                    ? await tmdbService.searchMovie(baseName, year ? year.toString() : '')
                                    : await tmdbService.searchTV(baseName, year ? year.toString() : '');
                                if (fallbackResult && fallbackResult.title) {
                                    tmdbName = fallbackResult.title;
                                    tmdbType = fallbackType;
                                    if (fallbackResult.releaseDate) year = parseInt(fallbackResult.releaseDate.substring(0, 4)) || year;
                                    tmdbParsed = true;
                                    logTaskEvent(`[AI重命名] 首选类型未匹配，回退${fallbackType === 'movie' ? '电影' : '电视剧'}搜索成功: ${tmdbName}`);
                                    if (taskDto) {
                                        taskDto.tmdbId = String(fallbackResult.id);
                                        taskDto.tmdbTitle = fallbackResult.title;
                                        taskDto.videoType = fallbackResult.type || fallbackType;
                                        taskDto.tmdbContent = JSON.stringify(fallbackResult);
                                        if ((fallbackResult.type || fallbackType) === 'tv' && fallbackResult.seasons) {
                                            const n = taskDto.shareFolderName || taskDto.resourceName || '';
                                            const m = n.match(/(?:Season|S|第)\s*(\d+)/i);
                                            const seasonNum = (m ? parseInt(m[1]) : null)
                                                || Math.max(...fallbackResult.seasons.filter(s => s.season_number > 0).map(s => s.season_number), 0);
                                            const s = fallbackResult.seasons.find(s => s.season_number === seasonNum);
                                            if (s?.episode_count > 0) taskDto.totalEpisodes = s.episode_count;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                logTaskEvent("TMDB 查询中文名失败: " + err.message);
            }

            // [新增] 如果配置了 TMDB 但是没查到，也没有手动绑定，发送通知需要人工干预
            const tmdbApiKey = ConfigService.getConfigValue('tmdb.tmdbApiKey');
            if (tmdbApiKey && !tmdbParsed && taskDto && !taskDto.manualTmdbBound) {
                try {
                    // [延迟加载] 避免循环依赖导出 undefined
                    const TelegramBotManager = require('../utils/TelegramBotManager');
                    const WeChatWorkManager = require('./WeChatWorkService');

                    // 发送互动式机器人通知 (Telegram)
                    const tgBot = TelegramBotManager.getInstance().getBot();
                    if (tgBot) {
                        tgBot.sendTmdbFailAlert(taskDto).catch(e => console.error("TG TMDB失败通知失败:", e));
                    }
                    
                    // 发送互动式机器人通知 (企业微信)
                    if (WeChatWorkManager.isEnabled()) {
                        WeChatWorkManager.sendTmdbFailAlert(taskDto).catch(e => console.error("企微 TMDB失败通知失败:", e));
                    }

                    // 保留原有通用通知作为保底
                    const MessageUtilModule = require('./message');
                    const messageUtil = new MessageUtilModule.MessageUtil();
                    await messageUtil.sendMessage(
                        `⚠️匹配TMDB失败\n任务 "${taskDto.resourceName}" (${baseName}) 匹配 TMDB 失败，已触发机器人互动通知，也可前往后台手动指定。`
                    );
                } catch (e) {
                    console.error("发送 TMDB 匹配失败通知失败:", e);
                }
            }

            // 确定最终用于重命名的标准名称 (优先 TMDB 官方中文)
            const finalName = tmdbName || baseName;

            // ===== 快速通道：尝试本地正则全量匹配剧集 =====
            let allMatched = true;
            let localParsedEpisodes = [];

            if (files && files.length > 0) {
                for (const f of files) {
                    const nameToMatch = f.name;
                    let epNum = 0;
                    let sNum = 1;
                    let matched = false;

                    // 匹配季数 (e.g. S02, Season 3, 第2季)
                    const seasonMatch = nameToMatch.match(/(?:S|Season)\s*(\d+)|第\s*(\d+)\s*季/i);
                    if (seasonMatch) sNum = parseInt(seasonMatch[1] || seasonMatch[2] || 1);

                    // 匹配集数 (e.g. S01E03, EP12, 第5集, 第6话)
                    const epMatch = nameToMatch.match(/(?:S\d+[-_ ]*E(\d+))|(?:(?:E[P]?|Episode)[-_ ]*(\d+))|(?:第\s*(\d+)\s*[集话])/i);
                    if (epMatch) {
                        epNum = parseInt(epMatch[1] || epMatch[2] || epMatch[3]);
                        matched = true;
                    } else {
                        // 回退匹配孤立的集数数字（注意避开年份和常见分辨率）
                        const numMatch = nameToMatch.match(/(^|[^\d])(?!1080|720|2160|4K|264|265|20\d\d|19\d\d)(\d{1,4})([^\d]|$)/i);
                        if (numMatch) {
                            epNum = parseInt(numMatch[3]);
                            matched = true;
                        }
                    }

                    if (!matched) {
                        allMatched = false;
                        break;  // 一旦有无法解析的文件，立刻终止本地解析并回退给AI
                    }

                    const ext = path.extname(f.name);
                    localParsedEpisodes.push({
                        id: f.id,
                        name: finalName,
                        season: sNum.toString().padStart(2, '0'),
                        episode: epNum.toString().padStart(2, '0'),
                        extension: ext
                    });
                }
            } else {
                allMatched = false;
            }

            // 如果全部文件都能被正则快速解析，且 TMDB 已匹配成功，直接返回构造好的结果！
            // 极速重命名只适用于: 手动绑定 TMDB、TMDB ID 提取成功、或 TMDB 搜索匹配成功
            if (allMatched && files.length > 0 && tmdbParsed) {
                logTaskEvent(`极速版重命名生效: TMDB已匹配【${tmdbName}】，本地正则全量匹配成功，跳过耗时的AI请求`);
                // 优先使用用户指定的类型，其次TMDB类型，最后根据文件数量自动判断
                const finalType = taskDto?.videoType || tmdbType || (localParsedEpisodes.length > 1 ? "tv" : "movie");
                return {
                    name: finalName,
                    year: year || 0,
                    type: finalType,
                    season: localParsedEpisodes.length > 0 ? localParsedEpisodes[0].season : "01",
                    episode: localParsedEpisodes
                };
            }

            // ======= AI 回退方案 =======
            // 如果 TMDB 未匹配成功，或本地正则无法完全匹配，使用 AI 大模型解析
            const aiReason = !tmdbParsed ? 'TMDB未匹配到影视信息' : '本地正则无法完全匹配季集数';
            logTaskEvent(`${aiReason}，调用 AI 大模型解析文件名...`);
            const result = await AIService.simpleChatCompletion(resourcePath, files);
            if (!result.success) {
                // 如果 AI 分析失败且还没找到 TMDB 信息，可以判定完全失败
                throw new Error('AI 分析失败: ' + result.error);
            }

            // 强制将 AI 给出的最终结果中的名字覆写为更准确的 TMDB 官方中文名
            if (tmdbParsed && result.data) {
                result.data.name = finalName;
                if (tmdbType) result.data.type = tmdbType;
                if (year) result.data.year = year;
                if (result.data.episode) {
                    result.data.episode.forEach(ep => {
                        ep.name = finalName;
                    });
                }
            }

            // 如果用户指定了类型，强制使用用户指定的类型
            if (taskDto?.videoType && result.data) {
                result.data.type = taskDto.videoType;
            }

            return result.data;
        } catch (error) {
            throw new Error('分析失败: ' + error.message);
        }
    }

    // 创建新任务
    async createTask(params) {
        const taskDto = new CreateTaskDto(params);
        taskDto.validate();
        // 获取分享信息
        const account = await this.accountRepo.findOneBy({ id: taskDto.accountId });
        if (!account) throw new Error('账号不存在');
        
        // 解析url
        const {url: parseShareLink, accessCode} = cloud189Utils.parseCloudShare(taskDto.shareLink)
        if (accessCode) {
            taskDto.accessCode = accessCode;
        }
        taskDto.shareLink = parseShareLink;
        const cloud189 = Cloud189Service.getInstance(account);
        const shareCode = cloud189Utils.parseShareCode(taskDto.shareLink);
        const shareInfo = await this.getShareInfo(cloud189, shareCode);
        // 如果分享链接是加密链接, 且没有提供访问码, 则抛出错误
        if (shareInfo.shareMode == 1 ) {
            if (!taskDto.accessCode) {
                throw new Error('分享链接为加密链接, 请提供访问码');
            }
            // 校验访问码是否有效
            const accessCodeResponse = await cloud189.checkAccessCode(shareCode, taskDto.accessCode);
            if (!accessCodeResponse) {
                throw new Error('校验访问码失败');
            }
            if (!accessCodeResponse.shareId) {
                throw new Error('访问码无效');
            }
            shareInfo.shareId = accessCodeResponse.shareId;
        }
        if (!shareInfo.shareId) {
            throw new Error('获取分享信息失败');
        }
        // 如果启用了 AI 分析 如果任务名和分享名相同, 则使用AI分析结果更新任务名称
        if (AIService.isEnabled() && taskDto.taskName == shareInfo.fileName) {
            try {
                const resourceInfo = await this._analyzeResourceInfo(shareInfo.fileName, [], 'folder');
                // 使用 AI 分析结果更新任务名称
                shareInfo.fileName = resourceInfo.year?`${resourceInfo.name} (${resourceInfo.year})`:resourceInfo.name;
                taskDto.taskName = shareInfo.fileName;
            } catch (error) {
                logTaskEvent('AI 分析失败，使用原始文件名: ' + error.message);
            }
        }
        // 如果任务名称存在 且和shareInfo的name不一致
        if (taskDto.taskName && taskDto.taskName != shareInfo.fileName) {
            shareInfo.fileName = taskDto.taskName;
        }
        taskDto.isFolder = true
        await this.increaseShareFileAccessCount(cloud189, shareInfo.shareId)
        // 检查并创建目标目录
        const rootFolder = await this._validateAndCreateTargetFolder(cloud189, taskDto, shareInfo);
        const tasks = [];
        rootFolder.name = path.join(taskDto.targetFolder, rootFolder.name)
        if (shareInfo.isFolder) {
            await this._handleFolderShare(cloud189, shareInfo, taskDto, rootFolder, tasks);
        }

         // 处理单文件
         if (!shareInfo.isFolder) {
            taskDto.isFolder = false
            await this._handleSingleShare(cloud189, shareInfo, taskDto, rootFolder, tasks);
        }
        if (taskDto.enableCron) {
            for(const task of tasks) {
                SchedulerService.saveTaskJob(task, this)   
            }
        }
        return tasks;
    }
    async increaseShareFileAccessCount(cloud189, shareId ) {
        await cloud189.increaseShareFileAccessCount(shareId)
    }
    // 删除任务
    async deleteTask(taskId, deleteCloud) {
        const task = await this.getTaskById(taskId);
        if (!task) throw new Error('任务不存在');
        await taskCacheManager.clearCache(taskId);
        const folderName = task.realFolderName.substring(task.realFolderName.indexOf('/') + 1);
        if (!task.enableSystemProxy && deleteCloud) {
            const account = await this.accountRepo.findOneBy({ id: task.accountId });
            if (!account) throw new Error('账号不存在');
            const cloud189 = Cloud189Service.getInstance(account);
            await this.deleteCloudFile(cloud189,await this.getRootFolder(task), 1);
            // 删除strm
            new StrmService().deleteDir(path.join(task.account.localStrmPrefix, folderName))
            // 刷新Alist缓存
            await this.refreshAlistCache(task, true)
        }
        if (task.enableSystemProxy) {
            // 删除strm
            new StrmService().deleteDir(path.join(task.account.localStrmPrefix, folderName))
        }
        // 删除定时任务
        if (task.enableCron) {
            SchedulerService.removeTaskJob(task.id)
        }
        await this.taskRepo.remove(task);
    }

    // 批量删除
    async deleteTasks(taskIds, deleteCloud) {
        for(const taskId of taskIds) {
            try{
                await this.deleteTask(taskId, deleteCloud)
            }catch (error){

            }
        }
    }

    // 获取文件夹下的所有文件
    async getAllFolderFiles(cloud189, task) {
        if (task.enableSystemProxy) {
            throw new Error('系统代理模式已移除');
        }
        const folderId = task.realFolderId
        const folderInfo = await cloud189.listFiles(folderId);
        // 如果folderInfo.res_code == FileNotFound 需要重新创建目录
        if (folderInfo.res_code == "FileNotFound") {
            logTaskEvent('文件夹不存在!')
            if (!task) {
                throw new Error('文件夹不存在!');
            }
            logTaskEvent('正在重新创建目录');
            const enableAutoCreateFolder = ConfigService.getConfigValue('task.enableAutoCreateFolder');
            if (enableAutoCreateFolder) {
                await this._autoCreateFolder(cloud189, task);
                return await this.getAllFolderFiles(cloud189, task);
            }
        }
        if (!folderInfo || !folderInfo.fileListAO) {
            return [];
        }

        let allFiles = [...(folderInfo.fileListAO.fileList || [])];
        return allFiles;
    }

    // 自动创建目录
    async _autoCreateFolder(cloud189, task) {
         // 检查 targetFolderId 是否存在
         const targetFolderInfo = await cloud189.listFiles(task.targetFolderId);
         if (targetFolderInfo.res_code === "FileNotFound") {
             throw new Error('保存目录不存在，无法自动创建目录');
         }

        // 如果 realRootFolderId 存在，先检查是否可用
        if (task.realRootFolderId) {
            const rootFolderInfo = await cloud189.listFiles(task.realRootFolderId);
            if (rootFolderInfo.res_code === "FileNotFound") {
                // 记录原来的目录属性：如果自身和根目录一致，说明就是装在根目录里的任务
                const isRootTask = task.realRootFolderId === task.realFolderId;

                // realRootFolderId 不存在或不可用，需要创建
                const rootFolderName = task.resourceName.replace('(根)', '').trim();
                logTaskEvent(`正在创建根目录: ${rootFolderName}`);
                const rootFolder = await cloud189.createFolder(rootFolderName, task.targetFolderId);
                if (!rootFolder?.id) throw new Error('创建根目录失败');
                task.realRootFolderId = rootFolder.id;
                
                // 如果是直接存根目录任务，同步更新 realFolderId
                if (isRootTask) {
                    task.realFolderId = rootFolder.id;
                }
                
                logTaskEvent(`根目录创建成功: ${rootFolderName}`);
            }
        }

        // 如果是子文件夹任务，在 realRootFolderId 下创建子文件夹
        if (task.realRootFolderId !== task.realFolderId) {
            logTaskEvent(`正在创建子目录: ${task.shareFolderName}`);
            const subFolder = await cloud189.createFolder(task.shareFolderName, task.realRootFolderId);
            if (!subFolder?.id) throw new Error('创建子目录失败');
            task.realFolderId = subFolder.id;
            logTaskEvent(`子目录创建成功: ${task.shareFolderName}`);
        } else {
            // 如果是根目录任务，则 realFolderId 等于 realRootFolderId
            task.realFolderId = task.realRootFolderId;
        }

        await this.taskRepo.save(task);
        logTaskEvent('目录创建完成');
    }

    // 处理新文件
    async _handleNewFiles(task, newFiles, cloud189, mediaSuffixs) {
        const taskInfoList = [];
        const fileNameList = [];
        let fileCount = 0;

        for (const file of newFiles) {
            if (task.enableSystemProxy) {
                throw new Error('系统代理模式已移除');
            } else {
                // 普通模式：添加到转存任务
                taskInfoList.push({
                    fileId: file.id,
                    fileName: file.name,
                    isFolder: 0,
                    md5: file.md5,
                });
            }
            fileNameList.push(`├─ ${file.name}`);
            if (this._checkFileSuffix(file, true, mediaSuffixs)) fileCount++;
        }
        // 如果有多个文件，最后一个文件使用└─
        if (fileNameList.length > 0) {
            const lastItem = fileNameList.pop();
            fileNameList.push(lastItem.replace('├─', '└─'));
        }
        if (taskInfoList.length > 0) {
            if (!task.enableSystemProxy) {
                const batchTaskDto = new BatchTaskDto({
                    taskInfos: JSON.stringify(taskInfoList),
                    type: 'SHARE_SAVE',
                    targetFolderId: task.realFolderId,
                    shareId: task.shareId
                });
                await this.createBatchTask(cloud189, batchTaskDto);
            }else{
                throw new Error('系统代理模式已移除');
            }
        }
        // 修改省略号的显示格式
        if (fileNameList.length > 20) {
            fileNameList.splice(5, fileNameList.length - 10, '├─ ...');
        }

        return { fileNameList, fileCount };
    }

    // 使用 AI 过滤文件列表
    async _filterFilesWithAI(task, fileList) {
        logTaskEvent(`任务 ${task.id}: 尝试使用 AI 进行文件过滤...`);

        // 1. 构建中文过滤描述
        let filterDescription = '';
        const pattern = task.matchPattern; // 例如: "剧集", "文件名"
        const operator = task.matchOperator; // 例如: "lt", "gt", "eq", "contains", "not contains"
        const value = task.matchValue; // 例如: "8", "特效", "1080p"

        if (!pattern || !operator || !value) {
            logTaskEvent(`任务 ${task.id}: AI 过滤条件不完整，跳过 AI 过滤。`);
            return null; // 条件不完整，无法生成描述
        }

        let operatorText = '';
        switch (operator) {
            case 'gt': operatorText = '大于'; break;
            case 'lt': operatorText = '小于'; break;
            case 'eq': operatorText = '等于'; break;
            case 'contains': operatorText = '包含'; break;
            case 'not contains': operatorText = '不包含'; break;
            default:
                logTaskEvent(`任务 ${task.id}: 未知的过滤操作符 "${operator}"，跳过 AI 过滤。`);
                return null;
        }

        // 根据 pattern 生成更自然的描述
        filterDescription = `筛选出 ${pattern} ${operatorText} "${value}" 的文件。请根据文件名判断。`;
        logTaskEvent(`任务 ${task.id}: 生成 AI 过滤描述: "${filterDescription}"`);


        // 2. 准备给 AI 的文件列表 (仅含 id 和 name)
        const filesForAI = fileList.map(f => ({ id: f.id, name: f.name }));

        // 3. 调用 AI 服务
        try {
            const aiResponse = await AIService.filterMediaFiles(task.resourceName, filesForAI, filterDescription);

            if (aiResponse.success && Array.isArray(aiResponse.data)) {
                logTaskEvent(`任务 ${task.id}: AI 文件过滤成功，保留 ${aiResponse.data.length} 个文件。`);
                // 使用 AI 返回的 id 列表来过滤原始的完整文件列表
                const keptFileIds = new Set(aiResponse.data);
                // 先应用后缀过滤，再应用AI过滤结果
                const filteredList = fileList.filter(file => keptFileIds.has(file.id));
                return filteredList; 
            } else {
                logTaskEvent(`任务 ${task.id}: AI 文件过滤失败: ${aiResponse.error || '未知错误'}。`);
                return null;
            }
        } catch (error) {
            logTaskEvent(`任务 ${task.id}: 调用 AI 文件过滤时发生错误: ${error.message}`);
            console.error(`AI filter error for task ${task.id}:`, error);
            return null; 
        }
    }

    // 执行任务
    // options: { manualTrigger: boolean } - 是否手动触发
    async processTask(task, options = {}) {
        const { manualTrigger = false } = options;
        // 检查任务状态，防止并发重复执行
        // 同时检查 processing 状态超时（5分钟），防止异常退出后任务卡住
        if (task.status === 'processing') {
            const processingStartTime = task.processingStartTime ? new Date(task.processingStartTime) : null;
            const now = new Date();
            const fiveMinutes = 5 * 60 * 1000;
            // 使用 processingStartTime 进行超时检测
            // 如果 processingStartTime 为 NULL（旧数据或异常退出），强制恢复
            if (!processingStartTime || (now.getTime() - processingStartTime.getTime() > fiveMinutes)) {
                logTaskEvent(`任务[${task.resourceName}/${task.shareFolderName || ''}] processing 状态超时或数据异常，自动恢复为 pending`);
                task.status = 'pending';
                task.processingStartTime = null;
                await this.taskRepo.save(task);
            } else {
                logTaskEvent(`任务[${task.resourceName}/${task.shareFolderName || ''}]正在执行中，跳过本次触发`);
                return null;
            }
        }

        let saveResults = [];
        try {
            // 立即将状态更新为 processing，防止其他并发请求重复执行
            // 同时更新 processingStartTime 用于超时检测
            task.status = 'processing';
            task.processingStartTime = new Date();
            await this.taskRepo.save(task);

            // ====== 从任务名中提取 TMDB ID 并更新到任务对象 ======
            // 支持 {tmdb-71233} 格式，确保任务封面/简介能正确显示
            if (!task.tmdbId) {
                const tmdbIdMatch = task.resourceName.match(/(?:^|[\[{(\s_/])tmdb(?:id)?[-=:_ ](\d+)(?:$|[\]})\s_/])/i);
                if (tmdbIdMatch) {
                    const extractedTmdbId = parseInt(tmdbIdMatch[1]);
                    task.tmdbId = extractedTmdbId;
                    logTaskEvent(`[任务执行] 从任务名提取到 TMDB ID: ${extractedTmdbId}，已更新到任务对象`);
                    // 如果未指定 videoType，尝试通过 TMDB API 判断类型
                    const tmdbApiKey = ConfigService.getConfigValue('tmdb.tmdbApiKey');
                    if (tmdbApiKey && !task.videoType) {
                        try {
                            // 1. 根据保存路径启发式推断
                            const savePath = task.realFolderName || '';
                            const movieKeywords = ['/电影/', '/Movies/', '/movie/', '/影片/'];
                            const tvKeywords = ['/电视剧/', '/TV/', '/tv/', '/剧集/', '/动漫/', '/番剧/',
                                                '/国产剧/', '/外语剧/', '/更新中/', '/纪录片/'];
                            let inferredType = null;
                            if (movieKeywords.some(k => savePath.includes(k))) {
                                inferredType = 'movie';
                            } else if (tvKeywords.some(k => savePath.includes(k))) {
                                inferredType = 'tv';
                            }

                            // 2. 根据任务名中的季集标识推断（S01E01、Season、第1季等）
                            if (!inferredType) {
                                const hasEpisodePattern = /S\d{1,2}[-_ ]*E\d{1,3}|Season\s*\d+|第\s*\d+\s*[季集话]|\d{1,4}x\d{1,3}/i.test(task.resourceName || '');
                                if (hasEpisodePattern) {
                                    inferredType = 'tv';
                                }
                            }

                            // 3. 按推断结果决定查询顺序
                            const tmdbService = new TMDBService();
                            let movieDetail = null, tvDetail = null;
                            if (inferredType === 'movie') {
                                movieDetail = await tmdbService.getMovieDetails(extractedTmdbId);
                                if (!movieDetail?.title) tvDetail = await tmdbService.getTVDetails(extractedTmdbId);
                            } else {
                                tvDetail = await tmdbService.getTVDetails(extractedTmdbId);
                                if (!tvDetail?.title) movieDetail = await tmdbService.getMovieDetails(extractedTmdbId);
                            }

                            if (movieDetail?.title) {
                                task.videoType = 'movie';
                                task.tmdbTitle = movieDetail.title;
                            } else if (tvDetail?.title) {
                                task.videoType = 'tv';
                                task.tmdbTitle = tvDetail.title;

                                // 自动设置当前季总集数
                                const seasonNum = (() => {
                                    const n = task.shareFolderName || task.resourceName || '';
                                    const m = n.match(/(?:Season|S|第)\s*(\d+)/i);
                                    return m ? parseInt(m[1]) : tvDetail.lastEpisodeToAir?.season_number || null;
                                })() || Math.max(...(tvDetail.seasons || []).filter(s => s.season_number > 0).map(s => s.season_number), 0);
                                const s = (tvDetail.seasons || []).find(s => s.season_number === seasonNum);
                                if (s?.episode_count > 0) {
                                    task.totalEpisodes = s.episode_count;
                                    logTaskEvent(`[任务执行] ${tvDetail.title} 第${seasonNum}季: 总集数 ${s.episode_count}`);
                                }
                            }
                        } catch (e) {
                            logTaskEvent(`[任务执行] TMDB ID ${extractedTmdbId} 类型检测失败: ${e.message}`);
                        }
                    }

                    // ====== 4. 未找到 TMDB ID 时通过标题搜索补全 ======
                    if (!task.tmdbId && tmdbApiKey && !task.videoType && task.resourceName) {
                        try {
                            const baseName = this._extractCleanTitle(task.resourceName);
                            const year = this._extractYear(task.resourceName);
                            logTaskEvent(`[任务执行] 未发现 TMDB ID，尝试标题搜索: "${baseName}"`);

                            const savePath = task.realFolderName || '';
                            let inferredType = 'tv';
                            if (['/电影/', '/Movies/', '/movie/', '/影片/'].some(k => savePath.includes(k))) {
                                inferredType = 'movie';
                            } else if (['/电视剧/', '/TV/', '/tv/', '/剧集/', '/动漫/', '/番剧/',
                                        '/国产剧/', '/外语剧/', '/更新中/', '/纪录片/'].some(k => savePath.includes(k))) {
                                inferredType = 'tv';
                            }
                            if (!inferredType && /S\d{1,2}[-_ ]*E\d{1,3}|Season\s*\d+|第\s*\d+\s*[季集话]|\d{1,4}x\d{1,3}/i.test(task.resourceName || '')) {
                                inferredType = 'tv';
                            }

                            const tmdbService = new TMDBService();
                            let detail = null;
                            if (inferredType === 'movie') {
                                const sr = await tmdbService.searchMovie(baseName, year ? String(year) : '');
                                if (sr?.id) detail = await tmdbService.getMovieDetails(sr.id);
                                if (!detail) {
                                    const sr2 = await tmdbService.searchTV(baseName, year ? String(year) : '');
                                    if (sr2?.id) detail = await tmdbService.getTVDetails(sr2.id);
                                }
                            } else {
                                const sr = await tmdbService.searchTV(baseName, year ? String(year) : '');
                                if (sr?.id) detail = await tmdbService.getTVDetails(sr.id);
                                if (!detail) {
                                    const sr2 = await tmdbService.searchMovie(baseName, year ? String(year) : '');
                                    if (sr2?.id) detail = await tmdbService.getMovieDetails(sr2.id);
                                }
                            }

                            if (detail?.title) {
                                task.tmdbId = String(detail.id);
                                task.videoType = detail.type || inferredType;
                                task.tmdbTitle = detail.title;
                                logTaskEvent(`[任务执行] TMDB 标题搜索匹配成功: ${detail.title}（${detail.id}），类型: ${task.videoType}`);
                            }
                        } catch (e) {
                            logTaskEvent(`[任务执行] TMDB 标题搜索失败: ${e.message}`);
                        }
                    }

                    await this.taskRepo.save(task);
                }
            }

            const account = await this.accountRepo.findOneBy({ id: task.accountId });
            if (!account) {
                logTaskEvent(`账号不存在，accountId: ${task.accountId}`);
                throw new Error('账号不存在');
            }
            task.account = account;
            const cloud189 = Cloud189Service.getInstance(account);

            // 每次执行都重新获取分享信息以确保 shareId 始终有效（部分链接类型的 shareId 是会话级别的）
            let shareId = task.shareId;
            let shareFolderId = task.shareFolderId;
            let shareMode = task.shareMode;
            let isFolder = task.isFolder;
            if (task.shareLink) {
                try {
                    const shareCode = cloud189Utils.parseShareCode(task.shareLink);
                    if (shareCode) {
                        const freshShareInfo = await this.getShareInfo(cloud189, shareCode);
                        if (freshShareInfo) {
                            // 检查分享链接是否失效
                            if (freshShareInfo.res_code === 'ShareNotFound' ||
                                freshShareInfo.res_code === 'ShareExpired' ||
                                freshShareInfo.res_code === 'ShareDeleted' ||
                                freshShareInfo.res_code === 'ShareAuditFailed' ||
                                freshShareInfo.res_message?.includes('不存在') ||
                                freshShareInfo.res_message?.includes('已失效') ||
                                freshShareInfo.res_message?.includes('已过期') ||
                                freshShareInfo.res_message?.includes('审核不通过')) {
                                logTaskEvent(`⚠️ 分享链接已失效: ${freshShareInfo.res_message || '链接不存在'}`);
                                task.lastError = `分享链接已失效: ${freshShareInfo.res_message || '链接不存在'}`;
                                task.status = 'failed';
                                await this.taskRepo.save(task);
                                // 发送失效通知
                                this.messageUtil.sendMessage(`❌ 任务 "${task.resourceName}" 分享链接已失效\n错误: ${freshShareInfo.res_message || '链接不存在'}\n请更新任务配置中的分享链接`);
                                return '';
                            }
                            if (freshShareInfo.shareMode == 1 && task.accessCode) {
                                const accessCodeResp = await cloud189.checkAccessCode(shareCode, task.accessCode);
                                if (accessCodeResp?.shareId) freshShareInfo.shareId = accessCodeResp.shareId;
                            }
                            shareId = freshShareInfo.shareId;
                            shareMode = freshShareInfo.shareMode;
                            isFolder = freshShareInfo.isFolder;
                            // 如果 shareFolderId 是根目录，也用新 fileId 替换
                            if (!task.shareFolderName && shareFolderId === task.shareFileId) {
                                shareFolderId = freshShareInfo.fileId;
                            }
                        } else {
                            // getShareInfo 返回 null 表示请求失败，链接可能失效
                            logTaskEvent(`⚠️ 无法获取分享信息，链接可能已失效`);
                            task.lastError = '无法获取分享信息，链接可能已失效';
                            task.status = 'failed';
                            await this.taskRepo.save(task);
                            this.messageUtil.sendMessage(`❌ 任务 "${task.resourceName}" 分享链接可能已失效\n请检查链接是否正常`);
                            return '';
                        }
                    }
                } catch (e) {
                    logTaskEvent(`重新获取分享信息失败，使用缓存数据: ${e.message}`);
                }
            }

             // 获取分享文件列表并进行增量转存
             const shareDir = await cloud189.listShareDir(shareId, shareFolderId, shareMode, task.accessCode, isFolder);
             // 先检查 shareDir 是否存在
             if (!shareDir) {
                logTaskEvent("⚠️ 无法获取分享目录，链接可能已失效");
                task.lastError = '无法获取分享目录，链接可能已失效';
                task.status = 'failed';
                await this.taskRepo.save(task);
                this.messageUtil.sendMessage(`❌ 任务 "${task.resourceName}" 无法获取分享目录\n请检查分享链接是否正常`);
                return '';
             }
             if(shareDir.res_code == "ShareAuditWaiting") {
                logTaskEvent("分享链接审核中, 等待下次执行")
                // 恢复任务状态为 pending，避免卡在 processing
                task.status = 'pending';
                await this.taskRepo.save(task);
                return ''
             }
             // 检查其他失效错误码
             if (shareDir.res_code === 'ShareNotFound' ||
                 shareDir.res_code === 'ShareExpired' ||
                 shareDir.res_code === 'ShareDeleted' ||
                 shareDir.res_code === 'ShareInfoNotFound' ||
                 shareDir.res_code === 'ShareAuditNotPass' ||
                 shareDir.res_message?.includes('不存在') ||
                 shareDir.res_message?.includes('已失效') ||
                 shareDir.res_message?.includes('审核不通过')) {
                logTaskEvent(`⚠️ 分享链接已失效: ${shareDir.res_message || shareDir.res_code}`);
                task.lastError = `分享链接已失效: ${shareDir.res_message || shareDir.res_code}`;
                task.status = 'failed';
                await this.taskRepo.save(task);
                this.messageUtil.sendMessage(`❌ 任务 "${task.resourceName}" 分享链接已失效\n错误: ${shareDir.res_message || shareDir.res_code}\n请更新任务配置中的分享链接`);
                return '';
             }
             if (!shareDir?.fileListAO?.fileList) {
                logTaskEvent("获取文件列表失败: " + JSON.stringify(shareDir));
                throw new Error('获取文件列表失败');
            }
            // 诊断日志：检查 shareFolderId 配置
            logTaskEvent(`[分享检测] shareId: ${shareId ? String(shareId).slice(-6) : 'null'}, shareFolderId: ${shareFolderId ? String(shareFolderId).slice(-6) : '根目录'}, shareMode: ${shareMode}, 文件数: ${shareDir.fileListAO?.fileList?.length || 0}`);
            let shareFiles = [...shareDir.fileListAO.fileList];            
            const cachedFileIds = await taskCacheManager.getCache(task.id);
            const unprocessedShareFiles = shareFiles.filter(f => f.isFolder || !cachedFileIds.has(String(f.id)));
            shareFiles = unprocessedShareFiles;
            const folderFiles = await this.getAllFolderFiles(cloud189, task);
            const enableOnlySaveMedia = ConfigService.getConfigValue('task.enableOnlySaveMedia');
            // mediaSuffixs转为小写
            const mediaSuffixs = ConfigService.getConfigValue('task.mediaSuffix').split(';').map(suffix => suffix.toLowerCase())
            const { existingFiles, existingFileNames, existingMediaCount } = folderFiles.reduce((acc, file) => {
                if (!file.isFolder) {
                    acc.existingFiles.add(file.md5);
                    acc.existingFileNames.add(file.name);
                    acc.existingFileList.push(file);
                    // 始终过滤垃圾文件，只计算媒体文件和字幕文件
                    if (this._checkFileSuffix(file, true, mediaSuffixs)) {
                        acc.existingMediaCount++;
                    }
                }
                return acc;
            }, {
                existingFiles: new Set(),
                existingFileNames: new Set(),
                existingFileList: [],
                existingMediaCount: 0
            });
            let aiFiltered = false;
            if (AIService.isEnabled() && task.matchPattern && task.matchOperator && task.matchValue) {
                const aiResult = await this._filterFilesWithAI(task, shareFiles)
                if (aiResult != null) {
                    shareFiles = aiResult;
                    aiFiltered = true;
                }
            }
            
            const enableCasRapidUpload = ConfigService.getConfigValue('task.enableCasRapidUpload');
            const enableDeleteCasFile = ConfigService.getConfigValue('task.enableDeleteCasFile');
            const enableCasFamilyTransfer = ConfigService.getConfigValue('task.enableCasFamilyTransfer');
            // casFamilyFolderId 已移除，改为账号级配置（Account.familyFolderId）
            const enableDeleteFamilyTempFile = ConfigService.getConfigValue('task.enableDeleteFamilyTempFile');

            // 家庭中转临时目录ID（通过账号级配置或自动创建）
            let casFamilyFolderIdActual = ''; // 初始为空，由 _getFamilyFolderId 决定
            let casTempFolderCreated = false; // 标记是否创建了临时目录

            // 诊断日志：记录分享文件数量和过滤情况
            const totalShareFiles = shareDir.fileListAO.fileList.length;
            const afterCacheFilter = shareFiles.length;
            logTaskEvent(`[增量检测] 分享目录文件总数: ${totalShareFiles}, 缓存过滤后: ${afterCacheFilter}, 目标目录已有: ${existingMediaCount}`);

            // 排除 .cas 文件，避免进入常规转存流程
            const newFiles = shareFiles
                .filter(file =>
                    !file.isFolder && !existingFiles.has(file.md5)
                   && !existingFileNames.has(file.name)
                   && this._checkFileSuffix(file, enableOnlySaveMedia, mediaSuffixs)
                   && (aiFiltered || this._handleMatchMode(task, file))
                   && !this.isHarmonized(file)
                   && !(enableCasRapidUpload && CasUtils.isCasFile(file.name))
                );

            // 诊断日志：最终需要处理的新文件数量
            logTaskEvent(`[增量检测] 最终需处理的新文件: ${newFiles.length} 个`);

            // ============== 第1步: 先转存常规视频文件 ==============
            let fileNameList = [];
            let fileCount = 0;
            if (newFiles.length > 0) {
                const handleResult = await this._handleNewFiles(task, newFiles, cloud189, mediaSuffixs);
                fileNameList = handleResult.fileNameList;
                fileCount = handleResult.fileCount;
            }

            // ============== 第2步: CAS 秒传处理 ==============
            let casResults = [];
            const failedShareFileIds = new Set();
            let successFiles = [];  // 成功的文件名（需在智能去重之前定义）
            let casSuccessCount = 0;  // CAS成功计数（需在智能去重之前定义）
            let smartDedupExecuted = false;  // 智能去重执行标记（需在更外层定义）
            if (enableCasRapidUpload) {
                // 从分享文件中筛选 .cas 文件
                const allCasFiles = shareFiles.filter(f => !f.isFolder && CasUtils.isCasFile(f.name));
                // 排除已处理过的（基于 fileId 缓存）
                const uncachedCasFiles = allCasFiles.filter(f => !cachedFileIds.has(String(f.id)));

                // ====== 智能去重判断：初次执行/清缓存后 ======
                // 条件：所有CAS文件都未缓存（说明是初次执行或清缓存后），且至少有1个CAS文件
                const useSmartDedup = (uncachedCasFiles.length === allCasFiles.length && uncachedCasFiles.length > 0);

                if (useSmartDedup) {
                    logTaskEvent(`[CAS] 使用智能去重v2模式（内存比对优先）`);
                    const tmdbTitle = task.tmdbTitle || (this._extractCleanTitle ? this._extractCleanTitle(task.resourceName, false).name : task.resourceName) || task.resourceName;
                    const CasSmartDedupService = require('./CasSmartDedupService');
                    const smartDedup = new CasSmartDedupService(this);
                    // 初始化家庭中转变量（与原有流程一致）
                    let familyCloud189 = cloud189;
                    if (enableCasFamilyTransfer && task.casFamilyAccountId && task.casFamilyAccountId !== task.accountId) {
                        const familyAccount = await this.accountRepo.findOneBy({ id: task.casFamilyAccountId });
                        if (familyAccount) {
                            familyCloud189 = Cloud189Service.getInstance(familyAccount);
                        }
                    }
                    const dedupResult = await smartDedup.processV2(task, cloud189, allCasFiles, folderFiles, tmdbTitle, {
                        enableCasFamilyTransfer, casFamilyFolderIdActual, familyCloud189, account, enableDeleteCasFile
                    });
                    for (const f of dedupResult.successFiles) successFiles.push(f);
                    for (const r of dedupResult.casResults) casResults.push(r);
                    for (const id of dedupResult.failedShareFileIds) failedShareFileIds.add(id);
                    casSuccessCount = dedupResult.casSuccessCount;
                    smartDedupExecuted = true;
                }

                if (!smartDedupExecuted) {
                    // ====== 原有增量流程 ======
                    // ====== 智能接力检测 ======
                // 检查目标目录已有的 .cas 文件名，避免重复转存和解析
                const existingCasFileNames = new Set(
                    folderFiles.filter(f => CasUtils.isCasFile(f.name)).map(f => f.name)
                );
                // 真正需要处理的：文件名不在目标目录中的
                const newCasFiles = uncachedCasFiles.filter(f => !existingCasFileNames.has(f.name));

                // 对已存在同名 .cas 的文件，直接标记为已处理（接力）
                const skippedCasFiles = uncachedCasFiles.filter(f => existingCasFileNames.has(f.name));
                if (skippedCasFiles.length > 0) {
                    logTaskEvent(`[CAS] 接力跳过 ${skippedCasFiles.length} 个已存在的 .cas 文件（更换链接后智能识别）`);
                    // 将跳过的文件也加入缓存，避免下次重复检测
                    for (const f of skippedCasFiles) {
                        await taskCacheManager.addCache(task.id, String(f.id));
                    }
                }

                if (newCasFiles.length > 0) {
                    logTaskEvent(`[CAS] 发现 ${newCasFiles.length} 个新 CAS 文件，开始处理...`);

                    // ====== 新增：提前根据 .cas 文件名推断视频文件名，过滤已存在的 ======
                    // 构建去后缀的文件名集合，用于智能匹配已有剧集
                    const mediaExtensions = ['.mkv', '.mp4', '.avi', '.rmvb', '.wmv', '.m2ts', '.ts', '.flv', '.mov', '.iso', '.mpg', '.rm'];
                    const getBaseNameWithoutExt = (name) => {
                        for (const ext of mediaExtensions) {
                            if (name.toLowerCase().endsWith(ext)) return name.slice(0, -ext.length);
                        }
                        return name;
                    };
                    const existingBaseNames = new Set(
                        folderFiles.filter(f => !CasUtils.isCasFile(f.name)).map(f => getBaseNameWithoutExt(f.name))
                    );
                    const existingVideoNames = new Set(
                        folderFiles.filter(f => !CasUtils.isCasFile(f.name)).map(f => f.name)
                    );

                    // 推断 .cas 文件对应的视频文件名
                    const inferVideoNameFromCas = (casFileName) => {
                        const baseName = casFileName.replace(/\.cas$/i, '');
                        const suffix = CasUtils._getFileSuffix ? CasUtils._getFileSuffix(baseName) : '';
                        // 如果去掉 .cas 后有媒体扩展名，直接使用
                        if (suffix && mediaExtensions.includes(suffix.toLowerCase())) {
                            return baseName;
                        }
                        // 否则返回 null，表示无法推断（需要解析后才能确定）
                        return null;
                    };

                    // 过滤：可以推断且有媒体扩展名的 .cas 文件
                    const casFilesToPreCheck = [];
                    const casFilesNeedProcess = [];
                    for (const casFile of newCasFiles) {
                        const inferredName = inferVideoNameFromCas(casFile.name);
                        if (inferredName) {
                            casFilesToPreCheck.push({ casFile, inferredName });
                        } else {
                            // 无法推断（无媒体扩展名），需要转存后解析
                            casFilesNeedProcess.push(casFile);
                        }
                    }

                    // 对可推断的文件进行预检查
                    const casFilesToTransfer = [];
                    const preSkippedCasFiles = [];
                    for (const { casFile, inferredName } of casFilesToPreCheck) {
                        const inferredBaseName = getBaseNameWithoutExt(inferredName);
                        if (existingBaseNames.has(inferredBaseName) || existingVideoNames.has(inferredName)) {
                            preSkippedCasFiles.push(casFile);
                        } else {
                            casFilesToTransfer.push(casFile);
                        }
                    }

                    // 合并：需要转存的 = 预检查通过的 + 无法推断需要解析的
                    const finalCasFilesToTransfer = [...casFilesToTransfer, ...casFilesNeedProcess];

                    if (preSkippedCasFiles.length > 0) {
                        logTaskEvent(`[CAS] 提前跳过 ${preSkippedCasFiles.length} 个已存在的视频（根据 .cas 文件名推断）`);
                        // 将跳过的文件加入缓存
                        for (const f of preSkippedCasFiles) {
                            await taskCacheManager.addCache(task.id, String(f.id));
                        }
                    }

                    // 如果没有需要转存的文件，直接结束
                    if (finalCasFilesToTransfer.length === 0) {
                        logTaskEvent(`[CAS] 所有 CAS 文件已提前过滤，无需处理`);
                    } else {
                        const totalCount = finalCasFilesToTransfer.length;
                        logTaskEvent(`[CAS] 总共 ${totalCount} 个 CAS 文件需要处理`);

                        try {
                            // ====== 新逻辑：每批次转存+秒传3个文件 ======
                            const BATCH_SIZE = 3;  // 每批处理文件数
                            const MAX_RETRY_PER_FILE = 3;  // 每个文件最大重试次数
                            const FILE_DELAY = 500;  // 文件间延迟

                            const savedCasFileIds = [];  // 记录已转存的 .cas 文件 fileId，用于后续删除
                            // successFiles 已在外层定义
                            const permanentlyFailedFiles = [];  // 永久失败的文件 [{id, name, reason, retryCount}]
                            const fileRetryCount = new Map();  // 每个文件的重试次数

                        let remainingFiles = [...finalCasFilesToTransfer];
                        let batchNumber = 1;

                        // 家庭账号初始化（只做一次）
                        let familyCloud189 = cloud189;
                        let familyAccountForTransfer = account;
                        if (enableCasFamilyTransfer && task.casFamilyAccountId && task.casFamilyAccountId !== task.accountId) {
                            const familyAccount = await this.accountRepo.findOneBy({ id: task.casFamilyAccountId });
                            if (familyAccount) {
                                familyAccountForTransfer = familyAccount;
                                familyCloud189 = Cloud189Service.getInstance(familyAccount);
                                logTaskEvent(`[家庭中转] 使用指定账号(${familyAccount.username})的家庭空间进行中转`);
                            }
                        }

                        // 懒加载家庭信息
                        if (enableCasFamilyTransfer && (!this._casFamilyInfo || this._casFamilyAccountId !== familyAccountForTransfer.id)) {
                            this._casFamilyInfo = await familyCloud189.getFamilyInfo();
                            this._casFamilyAccountId = familyAccountForTransfer.id;
                            if (this._casFamilyInfo) {
                                logTaskEvent(`[家庭中转] 家庭ID: ${this._casFamilyInfo.familyId}, 贡号: ${familyAccountForTransfer.username}`);
                            }
                        }

                        // 家庭目录初始化（使用账号级配置）
                        if (enableCasFamilyTransfer && this._casFamilyInfo && !casFamilyFolderIdActual) {
                            const familyId = this._casFamilyInfo.familyId;
                            if (!this._casFamilyRootFolderId) {
                                this._casFamilyRootFolderId = await familyCloud189.getFamilyRootFolderId(familyId);
                            }
                            // 获取中转目录（账号级配置 + 同家庭组继承）
                            const familyFolderIdResult = await this._getFamilyFolderId(familyAccountForTransfer, familyCloud189, familyId, this._casFamilyRootFolderId);
                            if (familyFolderIdResult.folderId) {
                                casFamilyFolderIdActual = familyFolderIdResult.folderId;
                                casTempFolderCreated = familyFolderIdResult.isTemp;
                                logTaskEvent(`[家庭中转] 中转目录: ${casFamilyFolderIdActual} (${familyFolderIdResult.source})`);
                            } else {
                                casFamilyFolderIdActual = this._casFamilyRootFolderId;
                                logTaskEvent(`[家庭中转] 使用家庭根目录作为中转目录`);
                            }
                        }

                        const familyFolderId = casFamilyFolderIdActual || this._casFamilyRootFolderId;

                        // 处理单个CAS文件的函数（需要动态获取savedCasFiles）
                        const processCasFile = async (casFile, savedCasFiles, existingBaseNamesAfter, currentFileNamesAfter) => {
                            const result = { casFile, savedFile: null, realFileName: null, success: false, message: '' };
                            try {
                                const savedFile = savedCasFiles.find(f => f.name === casFile.name);
                                if (!savedFile) {
                                    result.message = '转存后未找到';
                                    return result;
                                }
                                result.savedFile = savedFile;

                                const content = await cloud189.downloadFileContent(savedFile.id);
                                const parsed = CasUtils.parseCasContent(content);
                                if (!parsed || !parsed.md5 || !parsed.slice_md5) {
                                    result.message = '解析失败: 缺少 md5 或 slice_md5';
                                    return result;
                                }

                                const realFileName = CasUtils.mergeCasFileName(casFile.name, parsed.name);
                                result.realFileName = realFileName;

                                // 过滤非媒体文件（如 txt、jpg 等）
                                if (!this._checkFileNameSuffix(realFileName)) {
                                    result.message = '非媒体文件，跳过';
                                    result.skipped = true;
                                    logTaskEvent(`[CAS] ⏭️ ${realFileName} - 非媒体文件，跳过秒传`);
                                    return result;
                                }

                                const realBaseName = getBaseNameWithoutExt(realFileName);
                                if (existingBaseNamesAfter.has(realBaseName) || currentFileNamesAfter.has(realFileName)) {
                                    result.message = '已存在，跳过秒传';
                                    result.skipped = true;
                                    logTaskEvent(`[CAS] ⏭️ ${realFileName} - 已存在，跳过`);
                                    return result;
                                }

                                let uploadResult = { success: false, message: '未执行' };

                                if (enableCasFamilyTransfer && this._casFamilyInfo) {
                                    logTaskEvent(`[CAS] 处理: ${realFileName} - 家庭中转秒传`);
                                    const familyResult = await familyCloud189.familyRapidUpload(
                                        realFileName, parseInt(parsed.size),
                                        parsed.md5.toUpperCase(), parsed.slice_md5.toUpperCase(),
                                        this._casFamilyInfo.familyId, familyFolderId
                                    );
                                    if (familyResult.success && familyResult.familyFileId) {
                                        const saveResult = await cloud189.saveFamilyFileToPersonal(
                                            this._casFamilyInfo.familyId, familyResult.familyFileId, task.realFolderId, familyFolderId, realFileName
                                        );
                                        if (saveResult.success) {
                                            uploadResult = { success: true, message: '家庭中转秒传成功' };
                                            logTaskEvent(`[家庭中转] ✅ ${realFileName} 完成`);
                                            // 立即删除家庭临时文件，释放配额！
                                            try {
                                                await familyCloud189.deleteFamilyFile(this._casFamilyInfo.familyId, familyResult.familyFileId);
                                                logTaskEvent(`[家庭中转] 已清理临时文件，释放配额`);
                                            } catch (e) {
                                                logTaskEvent(`[家庭中转] 清理临时文件失败: ${e.message}`);
                                            }
                                        } else {
                                            uploadResult = { success: false, message: saveResult.message };
                                            logTaskEvent(`[家庭中转] ${realFileName} 转存失败: ${saveResult.message}`);
                                        }
                                    } else {
                                        uploadResult = { success: false, message: familyResult.message };
                                        logTaskEvent(`[家庭中转] ${realFileName} 秒传失败: ${familyResult.message}`);
                                    }
                                } else if (!enableCasFamilyTransfer) {
                                    logTaskEvent(`[CAS秒传] 处理: ${realFileName} - 个人接口秒传`);
                                    uploadResult = await cloud189.rapidUpload(
                                        realFileName, parseInt(parsed.size),
                                        parsed.md5.toUpperCase(), parsed.slice_md5.toUpperCase(),
                                        task.realFolderId
                                    );
                                    if (uploadResult.success) {
                                        logTaskEvent(`[CAS秒传] ✅ ${realFileName} 完成`);
                                    }
                                }

                                result.success = uploadResult.success;
                                result.message = uploadResult.success ? '秒传成功' : uploadResult.message;
                            } catch (error) {
                                result.message = error.message;
                                logTaskEvent(`[CAS] ${casFile.name} 处理异常: ${error.message}`);
                            }
                            return result;
                        };

                        // ====== 批次循环：每批转存3个 + 秒传3个 ======
                        while (remainingFiles.length > 0 && permanentlyFailedFiles.length < totalCount) {
                            // 取出本批次要处理的文件（最多3个）
                            const batchFiles = remainingFiles.slice(0, BATCH_SIZE);
                            const batchFileIds = batchFiles.map(f => f.id);

                            logTaskEvent(`[CAS] ===== 第${batchNumber}批次，处理${batchFiles.length}个文件（剩余${remainingFiles.length}个） =====`);

                            // 1. 转存这批CAS文件
                            let transferSuccess = false;
                            let retryCount = 0;
                            const MAX_TRANSFER_RETRY = 3;

                            let transferError = null;  // 记录转存错误信息
                            while (!transferSuccess && retryCount < MAX_TRANSFER_RETRY) {
                                try {
                                    const casTaskInfoList = batchFiles.map(f => ({
                                        fileId: f.id,
                                        fileName: f.name,
                                        isFolder: 0,
                                        md5: f.md5,
                                    }));
                                    const casBatchTask = new BatchTaskDto({
                                        taskInfos: JSON.stringify(casTaskInfoList),
                                        type: 'SHARE_SAVE',
                                        targetFolderId: task.realFolderId,
                                        shareId: task.shareId
                                    });
                                    await this.createBatchTask(cloud189, casBatchTask);
                                    logTaskEvent(`[CAS] ${batchFiles.length} 个CAS文件转存完成`);
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                    transferSuccess = true;
                                } catch (error) {
                                    const errorMsg = error.message || '';
                                    transferError = errorMsg;  // 保存错误信息供后续使用
                                    // 检测API队列堵塞
                                    if (errorMsg.includes('ShareSaveTaskIsAlreadyExist') || errorMsg.includes('BatchOperFileFailed')) {
                                        retryCount++;
                                        logTaskEvent(`[CAS] 批量任务队列堵塞，等待5秒后重试(${retryCount}/${MAX_TRANSFER_RETRY})...`);
                                        await new Promise(resolve => setTimeout(resolve, 5000));
                                    } else {
                                        // 其他错误，直接失败
                                        logTaskEvent(`[CAS] 批量转存失败: ${error.message}`);
                                        break;
                                    }
                                }
                            }

                            if (!transferSuccess) {
                                // 转存失败，将失败的文件加入failedShareFileIds，避免被缓存导致下次无法重新处理
                                for (const file of batchFiles) {
                                    failedShareFileIds.add(String(file.id));
                                }
                                // 转存失败，更新重试计数
                                for (const file of batchFiles) {
                                    const currentRetry = fileRetryCount.get(file.id) || 0;
                                    fileRetryCount.set(file.id, currentRetry + 1);
                                    logTaskEvent(`[CAS] ${file.name} 转存失败，重试次数: ${currentRetry + 1}/${MAX_RETRY_PER_FILE}`);

                                    if (currentRetry + 1 >= MAX_RETRY_PER_FILE) {
                                        permanentlyFailedFiles.push({
                                            id: file.id,
                                            name: file.name,
                                            reason: `转存失败: ${transferError || '未知错误'}`,
                                            retryCount: currentRetry + 1
                                        });
                                        remainingFiles = remainingFiles.filter(f => f.id !== file.id);
                                        logTaskEvent(`[CAS] ❌ ${file.name} 达到最大重试次数，标记为永久失败`);
                                    }
                                }
                            }

                            if (!transferSuccess) {
                                batchNumber++;
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                continue;
                            }

                            // 2. 刷新目录获取已转存的文件
                            let folderFilesAfter, existingBaseNamesAfter, currentFileNamesAfter, savedCasFiles;
                            try {
                                folderFilesAfter = await this.getAllFolderFiles(cloud189, task);
                                existingBaseNamesAfter = new Set(
                                    folderFilesAfter.filter(f => !CasUtils.isCasFile(f.name)).map(f => getBaseNameWithoutExt(f.name))
                                );
                                currentFileNamesAfter = new Set(folderFilesAfter.filter(f => !CasUtils.isCasFile(f.name)).map(f => f.name));
                                savedCasFiles = folderFilesAfter.filter(f => CasUtils.isCasFile(f.name));
                            } catch (e) {
                                logTaskEvent(`[CAS] 刷新目录失败: ${e.message}`);
                                batchNumber++;
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                continue;
                            }

                            // 3. 秒传每个文件
                            for (const casFile of batchFiles) {
                                // 检查是否已被永久标记失败
                                if (permanentlyFailedFiles.some(f => f.id === casFile.id)) {
                                    continue;
                                }

                                try {
                                    const result = await processCasFile(casFile, savedCasFiles, existingBaseNamesAfter, currentFileNamesAfter);

                                    if (result.savedFile) {
                                        savedCasFileIds.push(result.savedFile.id);
                                    }

                                    if (result.skipped) {
                                        remainingFiles = remainingFiles.filter(f => f.id !== casFile.id);
                                        logTaskEvent(`[CAS] ⏭️ ${result.realFileName || casFile.name} 已跳过: ${result.message}`);
                                        // 将跳过的文件加入缓存（避免下次重复处理）
                                        await taskCacheManager.addCache(task.id, String(casFile.id));
                                    } else if (result.success && result.realFileName) {
                                        successFiles.push(result.realFileName);
                                        casResults.push({ fileName: result.realFileName, success: true });
                                        newFiles.push({});
                                        remainingFiles = remainingFiles.filter(f => f.id !== casFile.id);
                                        existingBaseNamesAfter.add(getBaseNameWithoutExt(result.realFileName));
                                        currentFileNamesAfter.add(result.realFileName);
                                        logTaskEvent(`[CAS] ✅ ${result.realFileName} 秒传成功`);
                                    } else {
                                        // 失败，更新重试计数
                                        const currentRetry = fileRetryCount.get(casFile.id) || 0;
                                        fileRetryCount.set(casFile.id, currentRetry + 1);
                                        logTaskEvent(`[CAS] ❌ ${result.realFileName || casFile.name} 失败: ${result.message}，重试次数: ${currentRetry + 1}/${MAX_RETRY_PER_FILE}`);

                                        if (currentRetry + 1 >= MAX_RETRY_PER_FILE) {
                                            permanentlyFailedFiles.push({
                                                id: casFile.id,
                                                name: casFile.name,
                                                reason: result.message,
                                                retryCount: currentRetry + 1
                                            });
                                            remainingFiles = remainingFiles.filter(f => f.id !== casFile.id);
                                            logTaskEvent(`[CAS] ❌ ${casFile.name} 达到最大重试次数，标记为永久失败`);
                                        }
                                        failedShareFileIds.add(String(casFile.id));
                                    }
                                } catch (error) {
                                    const currentRetry = fileRetryCount.get(casFile.id) || 0;
                                    fileRetryCount.set(casFile.id, currentRetry + 1);
                                    logTaskEvent(`[CAS] ❌ ${casFile.name} 异常: ${error.message}，重试次数: ${currentRetry + 1}/${MAX_RETRY_PER_FILE}`);

                                    if (currentRetry + 1 >= MAX_RETRY_PER_FILE) {
                                        permanentlyFailedFiles.push({
                                            id: casFile.id,
                                            name: casFile.name,
                                            reason: error.message,
                                            retryCount: currentRetry + 1
                                        });
                                        remainingFiles = remainingFiles.filter(f => f.id !== casFile.id);
                                    }
                                    failedShareFileIds.add(String(casFile.id));
                                }

                                await new Promise(resolve => setTimeout(resolve, FILE_DELAY));
                            }

                            // 4. 清理目标目录所有CAS文件（包括本批次和之前残留的）
                            try {
                                const currentFolderFiles = await this.getAllFolderFiles(cloud189, task);
                                const allCasFilesInTarget = currentFolderFiles.filter(f => CasUtils.isCasFile(f.name));
                                if (allCasFilesInTarget.length > 0) {
                                    logTaskEvent(`[CAS] 清理目标目录 ${allCasFilesInTarget.length} 个CAS文件...`);
                                    for (const casFile of allCasFilesInTarget) {
                                        try {
                                            await cloud189.deleteFile(casFile.id);
                                        } catch (e) {
                                            logTaskEvent(`[CAS] 删除CAS文件失败(${casFile.name}): ${e.message}`);
                                        }
                                    }
                                }
                            } catch (e) {
                                logTaskEvent(`[CAS] 清理CAS文件异常: ${e.message}`);
                            }

                            // 5. 每批次清理家庭中转目录 + 清空家庭回收站（恢复配额的关键！）
                            if (enableCasFamilyTransfer && this._casFamilyInfo && casFamilyFolderIdActual) {
                                try {
                                    // 获取家庭账号的 cloud189 实例（用于清理）
                                    let cleanupCloud189 = familyCloud189;
                                    if (task.casFamilyAccountId && task.casFamilyAccountId !== task.accountId) {
                                        const familyAccount = await this.accountRepo.findOneBy({ id: task.casFamilyAccountId });
                                        if (familyAccount) {
                                            cleanupCloud189 = Cloud189Service.getInstance(familyAccount);
                                        }
                                    }

                                    // 清空家庭中转目录内容（不删除目录本身）
                                    const familyFolderId = casFamilyFolderIdActual || this._casFamilyRootFolderId;
                                    logTaskEvent(`[家庭中转] 批次结束清理中转目录(ID: ${familyFolderId})...`);
                                    await cleanupCloud189.clearFamilyFolder(this._casFamilyInfo.familyId, familyFolderId);

                                    // 清空家庭回收站释放配额（这是恢复配额的关键！）
                                    logTaskEvent(`[家庭中转] 批次结束清空家庭回收站...`);
                                    await cleanupCloud189.request('/api/open/batch/createBatchTask.action', {
                                        method: 'POST',
                                        form: {
                                            type: 'EMPTY_RECYCLE',
                                            taskInfos: '[]',
                                            familyId: String(this._casFamilyInfo.familyId)
                                        }
                                    });
                                    logTaskEvent(`[家庭中转] ✅ 批次清理完成，配额已恢复`);

                                    // 等待2秒确保云端清理生效
                                    await new Promise(resolve => setTimeout(resolve, 2000));
                                } catch (err) {
                                    logTaskEvent(`[家庭中转] 批次清理失败: ${err.message}`);
                                }
                            }

                            // 6. 清空sessionKey让配额恢复
                            if (enableCasFamilyTransfer && familyCloud189) {
                                familyCloud189._sessionKey = null;
                                familyCloud189._rsaKey = null;
                            }

                            batchNumber++;
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }

                        // ====== 最终结果报告 ======
                        const totalSuccess = successFiles.length;
                        const totalPermanentlyFailed = permanentlyFailedFiles.length;
                        const totalRemaining = remainingFiles.length;

                        logTaskEvent(`[CAS] ===== 最终结果 =====`);
                        logTaskEvent(`[CAS] 总数: ${totalCount}`);
                        logTaskEvent(`[CAS] 成功: ${totalSuccess}`);
                        logTaskEvent(`[CAS] 永久失败: ${totalPermanentlyFailed}`);
                        if (permanentlyFailedFiles.length > 0) {
                            logTaskEvent(`[CAS] 永久失败文件列表:`);
                            for (const f of permanentlyFailedFiles) {
                                logTaskEvent(`[CAS]   - ${f.name}: ${f.reason} (重试${f.retryCount}次)`);
                            }
                            logTaskEvent(`[CAS] 💡 永久失败的文件将在下次手动执行时重新尝试`);
                        }
                        if (remainingFiles.length > 0) {
                            logTaskEvent(`[CAS] 未完成: ${totalRemaining}（将在下次任务执行时继续）`);
                        }

                        // ====== 检查视频文件数量是否匹配 ======
                        try {
                            const finalFolderFiles = await this.getAllFolderFiles(cloud189, task);
                            const finalVideoCount = finalFolderFiles.filter(f => !CasUtils.isCasFile(f.name) && mediaExtensions.some(ext => f.name.toLowerCase().endsWith(ext))).length;
                            const expectedVideoCount = existingMediaCount + totalSuccess;
                            logTaskEvent(`[CAS] 视频文件检查: 预期${expectedVideoCount}个，实际${finalVideoCount}个`);
                            if (finalVideoCount < expectedVideoCount) {
                                logTaskEvent(`[CAS] ⚠️ 部分文件可能因版权限制无法秒传`);
                            }
                        } catch (e) {
                            logTaskEvent(`[CAS] 视频文件检查失败: ${e.message}`);
                        }

                        // 清理家庭中转目录（整体清理）- 使用家庭账号的 cloud189 实例
                        if (enableDeleteFamilyTempFile && this._casFamilyInfo && casFamilyFolderIdActual) {
                                try {
                                    // 获取家庭账号的 cloud189 实例（用于清理）
                                    let cleanupCloud189 = cloud189;
                                    if (task.casFamilyAccountId && task.casFamilyAccountId !== task.accountId) {
                                        const familyAccount = await this.accountRepo.findOneBy({ id: task.casFamilyAccountId });
                                        if (familyAccount) {
                                            cleanupCloud189 = Cloud189Service.getInstance(familyAccount);
                                        }
                                    }

                                    // 如果是自动创建的临时目录，直接删除整个目录
                                    if (casTempFolderCreated) {
                                        logTaskEvent(`[家庭中转] 删除自动创建的临时目录...`);
                                        await cleanupCloud189.deleteFamilyFolder(this._casFamilyInfo.familyId, casFamilyFolderIdActual, `CAS临时目录`);
                                    } else {
                                        // 用户指定的目录，只清空内容
                                        logTaskEvent(`[家庭中转] 清空用户指定的中转目录...`);
                                        await cleanupCloud189.clearFamilyFolder(this._casFamilyInfo.familyId, casFamilyFolderIdActual);
                                    }
                                    // 清空家庭回收站释放配额
                                    logTaskEvent(`[家庭中转] 清空家庭回收站释放配额...`);
                                    await cleanupCloud189.request('/api/open/batch/createBatchTask.action', {
                                        method: 'POST',
                                        form: {
                                            type: 'EMPTY_RECYCLE',
                                            taskInfos: '[]',
                                            familyId: String(this._casFamilyInfo.familyId)
                                        }
                                    });
                                    logTaskEvent(`[家庭中转] ✅ 家庭中转清理完成`);
                                } catch (err) {
                                    logTaskEvent(`[家庭中转] 清理失败: ${err.message}`);
                                }
                            }

                            // 第2.3步: 根据配置决定是否删除任务目标目录中的所有 .cas 文件
                            if (enableDeleteCasFile) {
                                // 重新获取目标目录，清理所有 .cas 文件（包括遗留的）
                                try {
                                    const latestFiles = await this.getAllFolderFiles(cloud189, task);
                                    const allCasFilesInTarget = latestFiles.filter(f => CasUtils.isCasFile(f.name));
                                    let deletedCount = 0;
                                    for (const casFile of allCasFilesInTarget) {
                                        try {
                                            await cloud189.deleteFile(casFile.id);
                                            deletedCount++;
                                        } catch (e) {
                                            logTaskEvent(`[CAS] 删除 .cas 文件失败(${casFile.name}): ${e.message}`);
                                        }
                                    }
                                    if (deletedCount > 0) {
                                        logTaskEvent(`[CAS] ✅ 已清理 ${deletedCount} 个 .cas 文件`);
                                        // 等待云端真正删除（API 返回成功但实际有延迟）
                                        logTaskEvent(`[CAS] 等待 5 秒确保云端删除生效...`);
                                        await new Promise(resolve => setTimeout(resolve, 5000));
                                    }
                                } catch (e) {
                                    logTaskEvent(`[CAS] 清理 .cas 文件异常: ${e.message}`);
                                }
                            } else {
                                if (savedCasFileIds.length > 0) {
                                    logTaskEvent(`[CAS] 保留 ${savedCasFileIds.length} 个 .cas 文件（未启用删除）`);
                                }
                            }
                        } catch (error) {
                            logTaskEvent(`[CAS] 处理异常: ${error.message}`);
                        }
                    }
                }
                } // 结束 if (!smartDedupExecuted) - 原有增量流程
                // CAS 文件的处理结果已记录在 failedShareFileIds
                // 统一在最后根据结果更新缓存，从而过滤掉处理失败的项
                // 清理本次任务的家庭信息缓存（避免跨任务串扰）
                this._casFamilyInfo = null;
                this._casFamilyRootFolderId = null;
            }

            // casSuccessCount 已在智能去重流程中正确计算（包含跳过+秒传）
            // 这里只累加非智能去重流程的 casResults 成功数（避免重复计数）
            if (!smartDedupExecuted) {
                casSuccessCount += casResults.filter(r => r.success).length;
            }


            // 处理新文件并保存到数据库和云盘
            // 智能去重流程：只有实际秒传成功或有新文件才发通知
            const actualNewCount = smartDedupExecuted 
                ? casResults.filter(r => r.success).length 
                : (fileCount + casSuccessCount);
            
            if (newFiles.length > 0 || actualNewCount > 0) {
                const resourceName = task.resourceName;
                const folderPath = task.realFolderName || task.realFolderId || '';
                const totalEps = task.totalEpisodes > 0 ? task.totalEpisodes : '?';
                
                // 智能去重流程：progressEps = 已有视频数（刷新后）
                // 常规流程：progressEps = 已有 + 新增
                let progressEps;
                if (smartDedupExecuted) {
                    // 智能去重后刷新目标目录获取真实视频数
                    try {
                        const refreshedFiles = await this.getAllFolderFiles(cloud189, task);
                        const refreshedVideoCount = refreshedFiles.filter(f => !f.isFolder && !CasUtils.isCasFile(f.name) && this._checkFileSuffix(f, mediaSuffixs, ConfigService.getConfigValue('task.enableOnlySaveMedia'))).length;
                        progressEps = refreshedVideoCount;
                    } catch (e) {
                        progressEps = existingMediaCount + actualNewCount;
                    }
                } else {
                    progressEps = existingMediaCount + fileCount + casSuccessCount;
                }

                // 构建具有表头的结构化通知消息
                const lines = [
                    `【天翼云转存】`,
                    `✅《${resourceName}》新增 ${actualNewCount} 集`,
                    `📁 ${folderPath}`,
                    ...fileNameList,
                ];
                // 添加 CAS 秒传结果到通知（只有实际秒传成功才显示）
                const successfulCas = casResults.filter(r => r.success);
                if (successfulCas.length > 0) {
                    lines.push(`⚡ CAS秒传成功 ${successfulCas.length} 个:`);
                    // 当文件数量超过 6 个时，只显示前 3 个和后 3 个，中间省略
                    if (successfulCas.length > 6) {
                        const first3 = successfulCas.slice(0, 3);
                        const last3 = successfulCas.slice(-3);
                        first3.forEach(r => lines.push(`├─ ${r.fileName}`));
                        lines.push(`├─ ... 省略 ${successfulCas.length - 6} 个`);
                        last3.forEach((r, i) => lines.push(i === last3.length - 1 ? `└─ ${r.fileName}` : `├─ ${r.fileName}`));
                    } else {
                        successfulCas.forEach((r, i) => {
                            lines.push(i === successfulCas.length - 1 ? `└─ ${r.fileName}` : `├─ ${r.fileName}`);
                        });
                    }
                }
                if (task.totalEpisodes > 0 || existingMediaCount > 0) {
                    lines.push(`🚀 当前进度：${progressEps}${task.totalEpisodes > 0 ? '/' + task.totalEpisodes : ''} 集`);
                }

                saveResults.push(lines.join('\n'));
                const firstExecution = !task.lastFileUpdateTime;
                task.status = 'processing';
                task.lastFileUpdateTime = new Date();
                task.currentEpisodes = progressEps;
                task.retryCount = 0;
                process.nextTick(() => {
                    this.eventService.emit('taskComplete', new TaskCompleteEventDto({
                        task,
                        cloud189,
                        fileList: newFiles,
                        existingFiles: folderFiles,
                        overwriteStrm: false,
                        firstExecution: firstExecution,
                        taskService: this,
                        taskRepo: this.taskRepo
                    }));
                })
            } else {
                // 无新增文件的情况
                // 手动触发时，即使无新增也发送通知
                if (manualTrigger) {
                    const resourceName = task.resourceName;
                    const folderPath = task.realFolderName || task.realFolderId || '';
                    const lines = [
                        `【天翼云转存】`,
                        `ℹ️《${resourceName}》无新增剧集`,
                        `📁 ${folderPath}`,
                    ];
                    if (task.totalEpisodes > 0 || existingMediaCount > 0) {
                        lines.push(`🚀 当前进度：${existingMediaCount}${task.totalEpisodes > 0 ? '/' + task.totalEpisodes : ''} 集`);
                    }
                    saveResults.push(lines.join('\n'));
                }
                // 1. 如果有历史记录，检查是否过期
                if (task.lastFileUpdateTime) {
                    const now = new Date();
                    const lastUpdate = new Date(task.lastFileUpdateTime);
                    const daysDiff = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
                    if (daysDiff >= ConfigService.getConfigValue('task.taskExpireDays')) {
                        task.status = 'completed';
                    }
                    task.currentEpisodes = existingMediaCount;
                    logTaskEvent(`${task.resourceName} 没有增量剧集，当前剧集数: ${existingMediaCount}`);
                } else {
                    // 2. 首次执行/清缓存后执行，但文件都已存在
                    // 需要正确初始化任务状态
                    task.status = 'pending';  // 恢复为 pending，避免卡住
                    task.lastFileUpdateTime = new Date();
                    task.currentEpisodes = existingMediaCount;
                    task.retryCount = 0;
                    logTaskEvent(`${task.resourceName} 首次检查完成，已有 ${existingMediaCount} 集`);
                }
            }
            // 电影自动完结
            if (task.videoType === 'movie' && task.status !== 'failed') {
                task.totalEpisodes = 1;
                task.currentEpisodes = 1;
                task.status = 'completed';
                logTaskEvent(`电影 ${task.resourceName} 已完结，不再占用定时资源`);
            }

            // 检查是否达到总数
            if (task.totalEpisodes && task.currentEpisodes >= task.totalEpisodes) {
                task.status = 'completed';
                logTaskEvent(`${task.resourceName} 已完结`)
            }

            // 正常执行完成后，恢复为 pending（允许下次执行）
            // 前端会根据 currentEpisodes 显示"追剧中"或"等待中"
            // 同时清除 processingStartTime，标记任务已完成
            if (task.status === 'processing') {
                task.status = 'pending';
                task.processingStartTime = null;
            }

            logTaskEvent(`[任务状态] ${task.resourceName} 最终状态: ${task.status}, currentEpisodes: ${task.currentEpisodes}`);

            const newEvaluatedIds = unprocessedShareFiles
                .filter(f => !f.isFolder && !failedShareFileIds.has(String(f.id)))
                .map(f => String(f.id));
            if (newEvaluatedIds.length > 0) {
                await taskCacheManager.addCache(task.id, newEvaluatedIds);
            }

            task.lastCheckTime = new Date();
            await this.taskRepo.save(task);
            logTaskEvent(`[任务保存] ${task.resourceName} 已保存到数据库`);
            return saveResults.join('\n');
        } catch (error) {
            return await this._handleTaskFailure(task, error);
        }
    }

    // 获取所有任务
    async getTasks() {
        return await this.taskRepo.find({
            order: {
                id: 'DESC'
            }
        });
    }

    // 获取待处理任务
    async getPendingTasks(ignore = false, taskIds = []) {
        const conditions = [
            {
                status: 'pending',
                nextRetryTime: null,
                enableSystemProxy: IsNull(),
                ...(ignore ? {} : { enableCron: false })
            },
            {
                status: 'processing',
                enableSystemProxy: IsNull(),
                ...(ignore ? {} : { enableCron: false })
            }
        ];
        return await this.taskRepo.find({
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
            },
            where: [
                ...(taskIds.length > 0 
                    ? [{ id: In(taskIds) }] 
                    : conditions)
            ]
        });
    }

    // 更新任务
    async updateTask(taskId, updates) {
        const task = await this.taskRepo.findOne({
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

        // 如果原realFolderName和现realFolderName不一致 则需要删除原strm
        if (updates.realFolderName && updates.realFolderName !== task.realFolderName && ConfigService.getConfigValue('strm.enable')) {
            // 删除原strm
            // 从realFolderName中获取文件夹名称
            const folderName = task.realFolderName.substring(task.realFolderName.indexOf('/') + 1);
            new StrmService().deleteDir(path.join(task.account.localStrmPrefix, folderName))
        }
        // 处理分享链接、访问码、分享文件夹的更新
        let shouldResetProgress = false;
        let linkValidationError = null; // 记录链接验证错误，但不立即抛出

        if (updates.shareLink || updates.accessCode !== undefined || updates.shareFolderId) {
            const shareLink = updates.shareLink || task.shareLink;
            const accessCode = updates.accessCode !== undefined ? updates.accessCode : task.accessCode;
            const linkChanged = updates.shareLink && updates.shareLink !== task.shareLink;
            const shareFolderChanged = updates.shareFolderId !== undefined && updates.shareFolderId !== task.shareFolderId;

            let shareCode = shareLink ? cloud189Utils.parseShareCode(shareLink) : null;
            if (shareCode) {
                const cloud189 = Cloud189Service.getInstance(task.account);
                try {
                    const shareInfo = await this.getShareInfo(cloud189, shareCode);
                    if (shareInfo) {
                        if (shareInfo.shareMode == 1) {
                            if (!accessCode) {
                                linkValidationError = '分享链接为私密链接，请输入提取码';
                            } else {
                                const accessCodeResponse = await cloud189.checkAccessCode(shareCode, accessCode);
                                if (!accessCodeResponse || !accessCodeResponse.shareId) {
                                    linkValidationError = '提取码无效，请检查后重试';
                                } else {
                                    shareInfo.shareId = accessCodeResponse.shareId;
                                }
                            }
                            if (linkValidationError) {
                                throw new Error(linkValidationError);
                            }
                        }

                        task.shareLink = shareLink;
                        task.accessCode = accessCode;
                        task.shareId = shareInfo.shareId;
                        task.shareMode = shareInfo.shareMode || (accessCode ? 2 : 1);
                        task.isFolder = shareInfo.isFolder;
                        // 每次更新都同步 shareFileId（根 ID）
                        task.shareFileId = shareInfo.fileId;

                        // 当链接本身发生变化时，旧的 shareFolderId 对新的 shareId 无效
                        // 必须重置为新链接的根目录 fileId，用户可之后再选子目录
                        if (linkChanged) {
                            task.shareFolderId = shareInfo.fileId;
                            task.shareFolderName = '';
                        } else if (updates.shareFolderId === '-1') {
                            task.shareFolderId = shareInfo.fileId;
                            task.shareFolderName = '';
                        } else if (updates.shareFolderId) {
                            task.shareFolderId = updates.shareFolderId;
                        }

                        if (linkChanged || shareFolderChanged) {
                            shouldResetProgress = true;
                        }
                    }
                } catch (e) {
                    // 提供更友好的错误信息，帮助用户理解问题
                    const errorMsg = e.message || '未知错误';
                    logTaskEvent(`[任务更新] 分享链接验证失败: ${errorMsg}`);

                    // 区分不同类型的错误，给出针对性提示
                    if (errorMsg.includes('分享链接审核中')) {
                        throw new Error('分享链接审核中，请稍后再试');
                    } else if (errorMsg.includes('ShareNotFound') || errorMsg.includes('ShareExpired') || errorMsg.includes('ShareDeleted')) {
                        throw new Error('分享链接已失效或不存在，请检查链接是否正确');
                    } else if (errorMsg.includes('提取码') || errorMsg.includes('Invalid')) {
                        throw new Error(errorMsg);
                    } else {
                        throw new Error(`分享链接验证失败: ${errorMsg}，请检查链接是否有效`);
                    }
                }
            } else if (updates.shareLink) {
                // 无法解析出 shareCode，说明链接格式不对
                throw new Error('分享链接格式不正确，请检查是否为有效的天翼云盘分享链接');
            }
        }

        // 只允许更新特定字段
        const allowedFields = ['resourceName', 'realFolderId', 'currentEpisodes', 'totalEpisodes', 'status','realFolderName', 'shareFolderName', 'matchPattern','matchOperator','matchValue','remark', 'enableCron', 'cronExpression', 'enableTaskScraper', 'videoType'];
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                task[field] = updates[field];
            }
        }
        // 如果currentEpisodes和totalEpisodes为null 则设置为0
        if (task.currentEpisodes === null) {
            task.currentEpisodes = 0;
        }
        if (task.totalEpisodes === null) {
            task.totalEpisodes = 0;
        }
        
        // 验证状态值
        const validStatuses = ['pending', 'processing', 'completed', 'failed'];
        if (!validStatuses.includes(task.status)) {
            throw new Error('无效的状态值');
        }

        // 验证数值字段
        if (task.currentEpisodes !== null && task.currentEpisodes < 0) {
            throw new Error('更新数不能为负数');
        }
        if (task.totalEpisodes !== null && task.totalEpisodes < 0) {
            throw new Error('总数不能为负数');
        }
        if (task.matchPattern && !task.matchValue) {
            throw new Error('匹配模式需要提供匹配值');
        }
        if (shouldResetProgress) {
            task.currentEpisodes = 0;
            task.status = 'pending';
            task.processingStartTime = null;  // 清除 processingStartTime
            task.lastFileUpdateTime = null;
            task.lastCheckTime = null;
            task.lastSavedFileName = null;
            task.lastSavedDisplayText = null;
            task.missingEpisodes = null;
            await taskCacheManager.clearCache(task.id);
            logTaskEvent(`任务[${task.resourceName}]资源链接或源目录已变更，已重置追更进度并清空任务缓存`);
        }
        const newTask = await this.taskRepo.save(task)
        SchedulerService.removeTaskJob(task.id)
        if (task.enableCron && task.cronExpression) {
            SchedulerService.saveTaskJob(newTask, this)
        }
        return newTask;
    }

    // 自动重命名
    // options: { skipDeletion: boolean } - 跳过去重删除（TMDB绑定后使用）
    async autoRename(cloud189, task, options = {}) {
        const { skipDeletion = false } = options;
        if ((!task.sourceRegex || !task.targetRegex) && !AIService.isEnabled()) return [];
        let message = []
        let newFiles = [];
        let files = [];

        if (task.enableSystemProxy) {
            throw new Error('系统代理模式已移除');
        } else {
            const folderInfo = await cloud189.listFiles(task.realFolderId);
            if (!folderInfo || !folderInfo.fileListAO) return [];
            files = folderInfo.fileListAO.fileList;
        }
        if (!files || files.length === 0) return [];
        
        // 过滤掉文件夹
        files = files.filter(file => !file.isFolder);

        // 初始化去重所需的基础名称映射表
        const mediaSuffixs = ConfigService.getConfigValue('task.mediaSuffix').split(';').map(suffix => suffix.toLowerCase());
        const getBaseName = (filename) => {
            const lastDot = filename.lastIndexOf('.');
            return lastDot !== -1 ? filename.substring(0, lastDot) : filename;
        };
        const isMediaFile = (filename) => {
            const ext = '.' + filename.split('.').pop().toLowerCase();
            return mediaSuffixs.includes(ext);
        };
        const baseNameMap = new Map();
        for (const f of files) {
            if (isMediaFile(f.name)) {
                baseNameMap.set(f.id, {
                    baseName: getBaseName(f.name).toLowerCase(),
                    isMedia: true
                });
            }
        }

        // 使用 AI 重命名或正则重命名  如果写了正则, 那么优先使用正则
        if (AIService.isEnabled() && (!task.sourceRegex || !task.targetRegex)) {
            logTaskEvent(` ${task.resourceName} 开始使用 AI 重命名`);
            try {
                const resourceInfo = await this._analyzeResourceInfo(
                    task.resourceName,
                    files.map(f => ({ id: f.id, name: f.name })),
                    'file',
                    task
                );
                await this._processRename(cloud189, task, files, resourceInfo, message, newFiles, baseNameMap, getBaseName, isMediaFile, skipDeletion);
            } catch (error) {
                logTaskEvent('AI 重命名失败，使用正则表达式重命名: ' + error.message);
                await this._processRegexRename(cloud189, task, files, message, newFiles, baseNameMap, getBaseName, isMediaFile, skipDeletion);
            }
        } else {
            logTaskEvent(` ${task.resourceName} 开始使用正则表达式重命名`);
            await this._processRegexRename(cloud189, task, files, message, newFiles, baseNameMap, getBaseName, isMediaFile, skipDeletion);
        }

        // 处理消息和保存结果
        const renameMessages = await this._handleRenameResults(task, message, newFiles);
        return { newFiles, renameMessages };
    }


    // 处理重命名结果
    async _handleRenameResults(task, message, newFiles) {
        if (message.length > 0) {
            const lastMessage = message[message.length - 1];
            message[message.length - 1] = lastMessage.replace('├─', '└─');
        }
        if (task.enableSystemProxy && newFiles.length > 0) {
            throw new Error('系统代理模式已移除');
        }
        // 修改省略号的显示格式
        if (message.length > 20) {
            message.splice(5, message.length - 10, '├─ ...');
        }
        // .cas 文件重命名仅记录日志，不推送通知（用户不需要看到内部处理细节）
        message.length > 0 && logTaskEvent(`${task.resourceName}自动重命名完成: \n${message.join('\n')}`)
        // 返回 message 供通知使用
        return message;
    }

    // 根据AI分析结果生成新文件名
    _generateFileName(file, aiFile, resourceInfo, template, task) {
        if (!aiFile) return file.name;
        
        // 强制季数覆盖（如果用户手动指定了此任务的季数）
        const effectiveSeasonStr = (task && task.manualSeason != null) 
            ? task.manualSeason.toString() 
            : aiFile.season;
            
        // 构建文件名替换映射
        const replaceMap = {
            '{name}': aiFile.name || resourceInfo.name,
            '{year}': resourceInfo.year || '',
            '{s}': effectiveSeasonStr?.padStart(2, '0') || '01',
            '{e}': aiFile.episode?.padStart(2, '0') || '01',
            '{sn}': parseInt(effectiveSeasonStr) || '1',                    // 不补零的季数
            '{en}': parseInt(aiFile.episode) || '1',                   // 不补零的集数
            '{ext}': aiFile.extension || path.extname(file.name),
            '{se}': `S${effectiveSeasonStr?.padStart(2, '0') || '01'}E${aiFile.episode?.padStart(2, '0') || '01'}`
        };

        // 替换模板中的占位符
        let newName = template;
        for (const [key, value] of Object.entries(replaceMap)) {
            newName = newName.replace(new RegExp(key, 'g'), value);
        }
        // 清理文件名中的非法字符
        return this._sanitizeFileName(newName);
    }
    // 处理重命名过程
    async _processRename(cloud189, task, files, resourceInfo, message, newFiles, baseNameMap, getBaseName, isMediaFile, skipDeletion = false) {
        const newNames = resourceInfo.episode;
        // 处理aiFilename, 文件命名通过配置文件的占位符获取
        // 获取用户配置的文件名模板，如果没有配置则使用默认模板
        const template = resourceInfo.type === 'movie' 
        ? ConfigService.getConfigValue('openai.rename.movieTemplate') || '{name} ({year}){ext}'  // 电影模板
        : ConfigService.getConfigValue('openai.rename.template') || '{name} - {se}{ext}';  // 剧集模板
        for (const file of files) {
            try {
                const aiFile = newNames.find(f => f.id === file.id);
                if (!aiFile) {
                    newFiles.push(file);
                    continue;
                }
                const newName = this._generateFileName(file, aiFile, resourceInfo, template, task);
                
                // 去重检查（skipDeletion 时跳过）
                let isDuplicate = false;
                if (!skipDeletion && isMediaFile && baseNameMap && isMediaFile(newName)) {
                    const newBaseName = getBaseName(newName).toLowerCase();
                    for (const [id, info] of baseNameMap.entries()) {
                        if (id !== file.id && info.baseName === newBaseName) {
                            isDuplicate = true;
                            break;
                        }
                    }
                }

                if (isDuplicate) {
                    await this.deleteCloudFile(cloud189, file, 0);
                    message.push(`├─ ${file.name} → 删除 (已存在忽略后缀的同名视频文件)`);
                    if (baseNameMap) baseNameMap.delete(file.id);
                    continue; // 删除后直接跳过，不再重命名和生成 STRM
                }

                if (isMediaFile && baseNameMap && isMediaFile(newName)) {
                    baseNameMap.set(file.id, { baseName: getBaseName(newName).toLowerCase(), isMedia: true });
                }

                // 判断文件名是否已存在
                if (file.name === newName) {
                    newFiles.push(file);
                    continue;   
                }
                await this._renameFile(cloud189, task, file, newName, message, newFiles);
            } catch (error) {
                logTaskEvent(`${file.name}重命名失败: ${error.message}`);
                newFiles.push(file);
            }
        }
    }

    // 清理文件名中的非法字符
    _sanitizeFileName(fileName) {
        // 移除文件名中的非法字符
        return fileName.replace(/[<>:"/\\|?*]/g, '')
            .replace(/\s+/g, ' ')  // 合并多个空格
            .trim();
    }
    // 处理正则表达式重命名
    async _processRegexRename(cloud189, task, files, message, newFiles, baseNameMap, getBaseName, isMediaFile, skipDeletion = false) {
        if (!task.sourceRegex || !task.targetRegex) return [];
        for (const file of files) {
            try {
                const destFileName = file.name.replace(new RegExp(task.sourceRegex), task.targetRegex);
                
                // 去重检查（skipDeletion 时跳过）
                let isDuplicate = false;
                if (!skipDeletion && isMediaFile && baseNameMap && isMediaFile(destFileName)) {
                    const newBaseName = getBaseName(destFileName).toLowerCase();
                    for (const [id, info] of baseNameMap.entries()) {
                        if (id !== file.id && info.baseName === newBaseName) {
                            isDuplicate = true;
                            break;
                        }
                    }
                }

                if (isDuplicate) {
                    await this.deleteCloudFile(cloud189, file, 0);
                    message.push(`├─ ${file.name} → 删除 (已存在忽略后缀的同名视频文件)`);
                    if (baseNameMap) baseNameMap.delete(file.id);
                    continue; // 删除后直接跳过
                }

                if (isMediaFile && baseNameMap && isMediaFile(destFileName)) {
                    baseNameMap.set(file.id, { baseName: getBaseName(destFileName).toLowerCase(), isMedia: true });
                }

                if (destFileName === file.name) {
                    newFiles.push(file);
                    continue;
                }
                await this._renameFile(cloud189, task, file, destFileName, message, newFiles);
            } catch (error) {
                logTaskEvent(`${file.name}重命名失败: ${error.message}`);
                newFiles.push(file);
            }
        }
    }

    // 执行单个文件重命名
    async _renameFile(cloud189, task, file, newName, message, newFiles) {
        let renameResult;
        if (task.enableSystemProxy) {
            throw new Error('系统代理模式已移除');
        } else {
            renameResult = await cloud189.renameFile(file.id, newName);
        }

        if (!task.enableSystemProxy && (!renameResult || renameResult.res_code != 0)) {
            // message.push(`├─ ${file.name} → ${newName}失败, 原因:${newName}${renameResult?.res_msg}`);
            newFiles.push(file);
        } else {
            message.push(`├─ ${file.name} → ${newName}`);
            newFiles.push({
                ...file,
                name: newName
            });
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 检查任务状态
    async checkTaskStatus(cloud189, taskId, count = 0, batchTaskDto, lastStatus = null) {
        if (count > 5) {
             return false;
        }
        let type = batchTaskDto.type || 'SHARE_SAVE';
        // 轮询任务状态
        const task = await cloud189.checkTaskStatus(taskId, batchTaskDto)
        if (!task) {
            return false;
        }
        // 只在状态变化时输出日志，减少冗余
        if (lastStatus === null || task.taskStatus !== lastStatus) {
            const statusText = {1: '等待中', 2: '有冲突', 3: '处理中', 4: '已完成'};
            logTaskEvent(`批量任务 ${task.taskId}: ${statusText[task.taskStatus] || task.taskStatus}`);
        }
        if (task.taskStatus == 3 || task.taskStatus == 1) {
            // 暂停200毫秒
            await new Promise(resolve => setTimeout(resolve, 200));
            return await this.checkTaskStatus(cloud189, taskId, count++, batchTaskDto, task.taskStatus)
        }
        if (task.taskStatus == 4) {
            // 如果failedCount > 0 说明有失败或者被和谐的文件, 需要查一次文件列表
            if (task.failedCount > 0 && type == 'SHARE_SAVE') {
                const targetFolderId = batchTaskDto.targetFolderId;
                const fileList = await this.getAllFolderFiles(cloud189, {
                    enableSystemProxy: false,
                    realFolderId: targetFolderId
                });
                //  当前转存的文件列表为taskInfos 需反序列化
                const taskInfos = JSON.parse(batchTaskDto.taskInfos);
                // fileList和taskInfos进行对比 拿到不在fileList中的文件
                const conflictFiles = taskInfos.filter(taskInfo => {
                    return !fileList.some(file => file.md5 === taskInfo.md5);
                });
                if (conflictFiles.length > 0) {
                    // 打印日志
                    logTaskEvent(`任务编号: ${task.taskId}, 任务状态: ${task.taskStatus}, 有${conflictFiles.length}个文件冲突, 已忽略: ${conflictFiles.map(file => file.fileName).join(',')}`);
                    // 加入和谐文件中
                    harmonizedFilter.addHarmonizedList(conflictFiles.map(file => file.md5))
                }
            }
            return true;
        }
        // 如果status == 2 说明有冲突
        if (task.taskStatus == 2) {
            logTaskEvent(`[批量任务] 检测到冲突，taskId: ${taskId}，尝试获取冲突信息...`);
            const conflictTaskInfo = await cloud189.getConflictTaskInfo(taskId);
            logTaskEvent(`[批量任务] 冲突信息返回: ${JSON.stringify(conflictTaskInfo)}`);
            if (!conflictTaskInfo) {
                logTaskEvent(`[批量任务] 获取冲突信息失败，返回null`);
                return false
            }
            // 忽略冲突
            const taskInfos = conflictTaskInfo.taskInfos;
            logTaskEvent(`[批量任务] 原始taskInfos: ${JSON.stringify(taskInfos)}`);
            for (const taskInfo of taskInfos) {
                taskInfo.dealWay = 1;
            }
            logTaskEvent(`[批量任务] 处理后taskInfos: ${JSON.stringify(taskInfos)}`);
            logTaskEvent(`[批量任务] 调用manageBatchTask参数: taskId=${taskId}, targetFolderId=${conflictTaskInfo.targetFolderId}, taskInfos=${JSON.stringify(taskInfos)}`);
            try {
                const manageResult = await cloud189.manageBatchTask(taskId, conflictTaskInfo.targetFolderId, taskInfos);
                logTaskEvent(`[批量任务] manageBatchTask返回: ${JSON.stringify(manageResult)}`);
            } catch (manageError) {
                logTaskEvent(`[批量任务] manageBatchTask失败: ${manageError.message}`);
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
            return await this.checkTaskStatus(cloud189, taskId, count++, batchTaskDto)
        }
        return false;
    }

    // 执行所有任务
    async processAllTasks(ignore = false, taskIds = []) {
        const tasks = await this.getPendingTasks(ignore, taskIds);
        if (tasks.length === 0) {
            logTaskEvent('没有待处理的任务');
            return;
        }
        let saveResults = []
        logTaskEvent(`================================`);
        for (const task of tasks) {
            const taskName = task.shareFolderName?(task.resourceName + '/' + task.shareFolderName): task.resourceName || '未知'
            logTaskEvent(`任务[${taskName}]开始执行`);
            try {
                const result = await this.processTask(task);
            if (result) {
                saveResults.push(result)
            }
            } catch (error) {
                logTaskEvent(`任务${task.id}执行失败: ${error.message}`);
            }finally {
                logTaskEvent(`任务[${taskName}]执行完成`);
            }
            // 暂停500ms
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (saveResults.length > 0) {
            this.messageUtil.sendMessage(saveResults.join("\n\n"))
        }
        logTaskEvent(`================================`);
        return saveResults
    }
    // 处理匹配模式
    _handleMatchMode(task, file) {
        if (!task.matchPattern || !task.matchValue) {
            return true;
        } 
        const matchPattern = task.matchPattern;
        const matchOperator = task.matchOperator; // lt eq gt
        const matchValue = task.matchValue;
        const regex = new RegExp(matchPattern);
        // 根据正则表达式提取文件名中匹配上的值 然后根据matchOperator判断是否匹配
        const match = file.name.match(regex);
        if (match) {
            const matchResult = match[0];
            const values = this._handleMatchValue(matchOperator, matchResult, matchValue);
            if (matchOperator === 'lt' && values[0] < values[1]) {
                return true;
            }
            if (matchOperator === 'eq' && values[0] === values[1]) {
                return true;
            }
            if (matchOperator === 'gt' && values[0] > values[1]) {
                return true;
            }
            if (matchOperator === 'contains' && matchResult.includes(matchValue)) {
                return true;
            }
            if (matchOperator === 'notContains' && !matchResult.includes(matchValue)) {
                return true;
            }
        }
        return false;
    }

    // 根据matchOperator判断值是否要转换为数字
    _handleMatchValue(matchOperator, matchResult, matchValue) {    
        if (matchOperator === 'lt' || matchOperator === 'gt') {
            return [parseFloat(matchResult), parseFloat(matchValue)];
        }
        return [matchResult, matchValue];
    }

    // 任务失败处理逻辑
    async _handleTaskFailure(task, error) {
        logTaskEvent(error);
        const maxRetries = ConfigService.getConfigValue('task.maxRetries');
        const retryInterval = ConfigService.getConfigValue('task.retryInterval');
        // 初始化重试次数
        if (!task.retryCount) {
            task.retryCount = 0;
        }

        if (task.retryCount < maxRetries) {
            task.retryCount++;
            task.status = 'pending';
            task.processingStartTime = null;  // 清除 processingStartTime
            task.lastError = `${error.message} (重试 ${task.retryCount}/${maxRetries})`;
            // 设置下次重试时间
            task.nextRetryTime = new Date(Date.now() + retryInterval * 1000);
            logTaskEvent(`任务将在 ${retryInterval} 秒后重试 (${task.retryCount}/${maxRetries})`);
        } else {
            task.status = 'failed';
            task.processingStartTime = null;  // 清除 processingStartTime
            task.lastError = `${error.message} (已达到最大重试次数 ${maxRetries})`;
            logTaskEvent(`任务达到最大重试次数 ${maxRetries}，标记为失败`);
        }

        await this.taskRepo.save(task);
        return '';
    }

     // 获取需要重试的任务
     async getRetryTasks() {
        const now = new Date();
        return await this.taskRepo.find({
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
            },
            where: {
                status: 'pending',
                nextRetryTime: LessThan(now),
                retryCount: LessThan(ConfigService.getConfigValue('task.maxRetries')),
                enableSystemProxy: IsNull()
            }
        });
    }

    // 处理重试任务
    async processRetryTasks() {
        const retryTasks = await this.getRetryTasks();
        if (retryTasks.length === 0) {
            return [];
        }
        let saveResults = [];
        logTaskEvent(`================================`);
        for (const task of retryTasks) {
            const taskName = task.shareFolderName?(task.resourceName + '/' + task.shareFolderName): task.resourceName || '未知'
            logTaskEvent(`任务[${taskName}]开始重试`);
            try {
                const result = await this.processTask(task);
                if (result) {
                    saveResults.push(result);
                }
            } catch (error) {
                console.error(`重试任务${task.name}执行失败:`, error);
            }finally {
                logTaskEvent(`任务[${taskName}]重试完成`);
            }
            // 任务间隔
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (saveResults.length > 0) {
            this.messageUtil.sendMessage(saveResults.join("\n\n"));
        }
        logTaskEvent(`================================`);
        return saveResults;
    }
    // 创建批量任务
    async createBatchTask(cloud189, batchTaskDto) {
        const resp = await cloud189.createBatchTask(batchTaskDto);
        if (!resp) {
            throw new Error('批量任务处理失败');
        }
        if (resp.res_code != 0) {
            throw new Error(resp.res_msg);
        }
        logTaskEvent(`批量任务处理中: ${JSON.stringify(resp)}`)
        if (!await this.checkTaskStatus(cloud189,resp.taskId, 0 , batchTaskDto)) {
            throw new Error('检查批量任务状态: 批量任务处理失败');
        }
        logTaskEvent(`批量任务处理完成`)
    }
    // 定时清空回收站
    async clearRecycleBin(enableAutoClearRecycle, enableAutoClearFamilyRecycle) {
        const accounts = await this.accountRepo.find()
        if (accounts) {
            for (const account of accounts) {
                let username = account.username.replace(/(.{3}).*(.{4})/, '$1****$2');
                try {
                    const cloud189 = Cloud189Service.getInstance(account); 
                    await this._clearRecycleBin(cloud189, username, enableAutoClearRecycle, enableAutoClearFamilyRecycle)
                } catch (error) {
                    logTaskEvent(`定时[${username}]清空回收站任务执行失败:${error.message}`);
                }
            }
        }
    }

    // 执行清空回收站
    async _clearRecycleBin(cloud189, username, enableAutoClearRecycle, enableAutoClearFamilyRecycle) {
        const params = {
            taskInfos: '[]',
            type: 'EMPTY_RECYCLE',
        }   
        const batchTaskDto = new BatchTaskDto(params);
        if (enableAutoClearRecycle) {
            logTaskEvent(`开始清空[${username}]个人回收站`)
            await this.createBatchTask(cloud189, batchTaskDto)
            logTaskEvent(`清空[${username}]个人回收站完成`)
            // 延迟10秒
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
        if (enableAutoClearFamilyRecycle) {
            // 获取家庭id
            const familyInfo = await cloud189.getFamilyInfo()
            if (familyInfo == null) {
                logTaskEvent(`用户${username}没有家庭主账号, 跳过`)
                return
            }
            logTaskEvent(`开始清空[${username}]家庭回收站`)
            batchTaskDto.familyId = familyInfo.familyId
            await this.createBatchTask(cloud189, batchTaskDto)
            logTaskEvent(`清空[${username}]家庭回收站完成`)
        }
    }
    // 校验文件后缀（文件对象版本）
    _checkFileSuffix(file, enableOnlySaveMedia, mediaSuffixs) {
        // 获取文件后缀
        const fileExt = '.' + file.name.split('.').pop().toLowerCase();
        const isMedia = mediaSuffixs.includes(fileExt);

        // 垃圾文件/非媒体文件黑名单 (即使不开启仅保存媒体文件，也过滤掉这些明显的无关文件)
        const junkSuffixes = ['.txt', '.html', '.htm', '.png', '.jpg', '.jpeg', '.gif', '.url', '.nfo'];
        // 字幕文件白名单 (属于有用文件)
        const subSuffixes = ['.srt', '.ass', '.ssa', '.sub', '.vtt'];

        // 如果是黑名单里的垃圾文件，直接过滤掉
        if (junkSuffixes.includes(fileExt)) {
            return false;
        }

        // 如果启用了只保存媒体文件, 则检查文件后缀是否在媒体白名单或字幕白名单中
        if (enableOnlySaveMedia && !isMedia && !subSuffixes.includes(fileExt)) {
            return false;
        }

        return true;
    }

    // 校验文件名后缀（字符串版本，用于 CAS 文件解析后的真实文件名过滤）
    _checkFileNameSuffix(fileName) {
        // 获取文件后缀
        const fileExt = '.' + fileName.split('.').pop().toLowerCase();

        // 常见媒体扩展名
        const mediaSuffixes = ['.mkv', '.mp4', '.avi', '.rmvb', '.wmv', '.m2ts', '.ts', '.flv', '.mov', '.iso', '.mpg', '.rm', '.mp3', '.flac', '.wav', '.aac'];
        // 字幕文件白名单
        const subSuffixes = ['.srt', '.ass', '.ssa', '.sub', '.vtt'];
        // 垃圾文件黑名单（始终过滤）
        const junkSuffixes = ['.txt', '.html', '.htm', '.png', '.jpg', '.jpeg', '.gif', '.url', '.nfo'];

        // 如果是黑名单里的垃圾文件，直接过滤掉
        if (junkSuffixes.includes(fileExt)) {
            return false;
        }

        // 只保留媒体文件和字幕文件
        if (!mediaSuffixes.includes(fileExt) && !subSuffixes.includes(fileExt)) {
            return false;
        }

        return true;
    }
    
    // 从文件名提取季数和集数
    _extractSeasonEpisode(fileName) {
        if (!fileName) return { season: 1, episode: null };
        fileName = fileName.replace(/\.cas$/i, '');
        const seasonRegex = /(?:S|Season)\s*(\d+)|第\s*(\d+)\s*季/i;
        const seasonMatch = fileName.match(seasonRegex);
        const episodeRegex = /(?:S\d+[-_ ]*E(\d+))|(?:(?:E[P]?|Episode)[-_ ]*(\d+))|(?:第\s*(\d+)\s*[集话])/i;
        const episodeMatch = fileName.match(episodeRegex);
        if (!episodeMatch) {
            const isolatedNumberRegex = /(^|[^\d])(?!1080|720|2160|4K|265|264|10[-_]?bit|HEVC|AAC|HDR|SDR|WEB[-_]?DL|BluRay|x264|x265)(\d{1,4})([^\d]|$)/i;
            const numberMatch = fileName.match(isolatedNumberRegex);
            if (numberMatch) {
                const num = parseInt(numberMatch[2]);
                if (num >= 1 && num <= 999) {
                    return { season: seasonMatch ? parseInt(seasonMatch[1] || seasonMatch[2]) : 1, episode: num };
                }
            }
        }
        return {
            season: seasonMatch ? parseInt(seasonMatch[1] || seasonMatch[2]) : 1,
            episode: episodeMatch ? parseInt(episodeMatch[1] || episodeMatch[2] || episodeMatch[3]) : null
        };
    }

    // 获取文件扩展名
    _getFileExtension(fileName) {
        if (!fileName) return '';
        fileName = fileName.replace(/\.cas$/i, '');
        const lastDot = fileName.lastIndexOf('.');
        if (lastDot === -1 || lastDot === fileName.length - 1) return '';
        return fileName.substring(lastDot + 1);
    }

    // 生成 CAS 重命名后的目标文件名
    _generateCasTargetName(casFileName, tmdbTitle, season, episode) {
        const ext = this._getFileExtension(casFileName);
        const seasonStr = String(season).padStart(2, '0');
        const episodeStr = String(episode).padStart(2, '0');
        const extPart = ext ? '.' + ext : '.mkv';
        return tmdbTitle + ' - S' + seasonStr + 'E' + episodeStr + extPart + '.cas';
    }

// 根据realRootFolderId获取根目录
    async getRootFolder(task) {
        if (task.realRootFolderId) {
            // 判断realRootFolderId下是否还有其他目录, 通过任务查询 查询realRootFolderId是否有多个任务, 如果存在多个 则使用realFolderId
            const tasks = await this.taskRepo.find({
                where: {
                    realRootFolderId: task.realRootFolderId
                }
            })
            if (tasks.length > 1) {
                return {id: task.realFolderId, name: task.realFolderName}    
            }
            return {id: task.realRootFolderId, name: task.shareFolderName}
        }
        logTaskEvent(`任务[${task.resourceName}]为老版本系统创建, 无法删除网盘内容, 跳过`)
        return null
    }
    // 删除网盘文件
    async deleteCloudFile(cloud189, file, isFolder) {
        if (!file) return;
        const taskInfos = []
        // 如果file是数组, 则遍历删除
        if (Array.isArray(file)) {
            for (const f of file) {
                taskInfos.push({
                    fileId: f.id,
                    fileName: f.name,
                    isFolder: isFolder
                })
            }
        }else{
            taskInfos.push({
                fileId: file.id,
                fileName: file.name,
                isFolder: isFolder
            })
        }
        console.log(taskInfos)
        
        const batchTaskDto = new BatchTaskDto({
            taskInfos: JSON.stringify(taskInfos),
            type: 'DELETE',
            targetFolderId: ''
        });
        await this.createBatchTask(cloud189, batchTaskDto)
    }

    // 根据任务创建STRM文件
    async createStrmFileByTask(taskIds, overwrite) {
        const tasks = await this.taskRepo.find({
            where: {
                id: In(taskIds)
            },
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
            },
        })
        if (tasks.length == 0) {
            throw new Error('任务不存在')
        }
        for (const task of tasks) {
            try {
                await this._createStrmFileByTask(task, overwrite)   
            }catch (error) {
                logTaskEvent(`任务[${task.resourceName}]生成strm失败: ${error.message}`)
            }
        }
    }
    // 根据任务执行生成strm
    async _createStrmFileByTask(task, overwrite) {
        if (!task) {
            throw new Error('任务不存在')
        }
        let account = await this._getAccountById(task.accountId)
        if (!account) {
            logTaskEvent(`任务[${task.resourceName}]账号不存在, 跳过`)
            return
        }
        const cloud189 = Cloud189Service.getInstance(account);
        // 获取文件列表
        const fileList = await this.getAllFolderFiles(cloud189, task)
        if (fileList.length == 0) {
            throw new Error('文件列表为空')
        }
        const strmService = new StrmService()
        const message = await strmService.generate(task, fileList, overwrite);
        this.messageUtil.sendMessage(message);
    }
    // 根据accountId获取账号
    async _getAccountById(accountId) {
        return await this.accountRepo.findOne({
            where: {
                id: accountId
            }
        })
    }

    // 获取家庭中转目录（账号级配置 + 同家庭组继承）
    // 返回 { folderId, isTemp, source }
    async _getFamilyFolderId(account, familyCloud189, familyId, familyRootFolderId) {
        // 1. 该账号自己配置了目录 → 使用自己的
        if (account.familyFolderId) {
            return { folderId: account.familyFolderId, isTemp: false, source: '账号配置' };
        }

        // 2. 查找同家庭组其他账号的配置（继承）
        if (account.familyId) {
            const sameFamilyAccounts = await this.accountRepo.find({
                where: { familyId: account.familyId }
            });
            for (const a of sameFamilyAccounts) {
                if (a.id !== account.id && a.familyFolderId) {
                    logTaskEvent(`[家庭中转] 继承账号 ${a.username.replace(/(.{3}).*(.{4})/, '$1****$2')} 的中转目录配置`);
                    return { folderId: a.familyFolderId, isTemp: false, source: '同家庭组继承' };
                }
            }
        }

        // 3. 都没配置 → 自动创建临时目录
        const tempFolderName = `CAS临时_${Date.now()}`;
        const createResult = await familyCloud189.createFamilyFolder(familyId, tempFolderName, familyRootFolderId);
        if (createResult.success && createResult.folderId) {
            return { folderId: createResult.folderId, isTemp: true, source: '自动创建临时目录' };
        }

        // 4. 创建失败 → 使用家庭根目录
        return { folderId: familyRootFolderId, isTemp: false, source: '家庭根目录（创建失败）' };
    }

    // 根据分享链接获取文件目录组合 资源名 资源名/子目录1 资源名/子目录2
    async parseShareFolderByShareLink(shareLink, accountId, accessCode) {
        const account = await this._getAccountById(accountId)
        if (!account) {
            throw new Error('账号不存在')
        }
        const cloud189 = Cloud189Service.getInstance(account);
        const shareCode = cloud189Utils.parseShareCode(shareLink)
        const shareInfo = await this.getShareInfo(cloud189, shareCode)
        if (shareInfo.shareMode == 1) {
            if (!accessCode) {
                throw new Error('分享链接为私密链接, 请输入提取码')
            }
            // 校验访问码是否有效
            const accessCodeResponse = await cloud189.checkAccessCode(shareCode, accessCode);
            if (!accessCodeResponse) {
                throw new Error('校验访问码失败');
            }
            if (!accessCodeResponse.shareId) {
                throw new Error('访问码无效');
            }
            shareInfo.shareId = accessCodeResponse.shareId;
        }
        const folders = []
        // 根目录为分享链接的名称
        folders.push({id: -1 ,name: shareInfo.fileName})
        if (!shareInfo.isFolder) {
            return folders;
        }
        // 遍历分享链接的目录
        const result = await cloud189.listShareDir(shareInfo.shareId, shareInfo.fileId, shareInfo.shareMode, accessCode);
        if (!result?.fileListAO) return folders;
        const { folderList: subFolders = [] } = result.fileListAO;
        subFolders.forEach(folder => {
            folders.push({id: folder.id, name: path.join(shareInfo.fileName, folder.name)});
        });
        return folders;
    }

    // 校验目录是否在目录列表中
    checkFolderInList(taskDto, folderId) {
        return (!taskDto.selectedFolders || taskDto.selectedFolders.length === 0) || taskDto.tgbot || (taskDto.selectedFolders?.includes(folderId) || false);
    }

    // 校验云盘中是否存在同名目录
    async checkFolderExists(cloud189, targetFolderId, folderName, overwriteFolder = false) {
        const folderInfo = await cloud189.listFiles(targetFolderId);
        if (!folderInfo?.fileListAO) {
            throw new Error('获取文件列表失败');
        }

        // 检查目标文件夹是否存在
        const { folderList = [] } = folderInfo.fileListAO;
        const existFolder = folderList.find(folder => folder.name === folderName);
        if (existFolder) {
            if (!overwriteFolder) {
                throw new Error('folder already exists');
            }
            // 如果用户需要覆盖, 则删除目标目录
            await this.deleteCloudFile(cloud189, existFolder, 1)
        }
    }

    // 根据id获取任务
    async getTaskById(id) {
        return await this.taskRepo.findOne({
            where: { id: parseInt(id) },
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
    }
    // ai命名处理
    async handleAiRename(files, resourceInfo) {
        const template = resourceInfo.type === 'movie' 
        ? ConfigService.getConfigValue('openai.rename.movieTemplate') || '{name} ({year}){ext}'  // 电影模板
        : ConfigService.getConfigValue('openai.rename.template') || '{name} - {se}{ext}';  // 剧集模板
        const aiNames = resourceInfo.episode
        const newFiles = [];
        for (const file of files) {
            try {
                const aiFile = aiNames.find(f => f.id === file.id);
                if (!aiFile) {
                    continue;
                }
                const newName = this._generateFileName(file, aiFile, resourceInfo, template);
                // 判断文件名是否已存在
                if (file.name === newName) {
                    continue;   
                }
                newFiles.push({
                    ...file,
                    fileId: file.id,
                    oldName: file.name,
                    destFileName: newName
                });
            } catch (error) {
                logTaskEvent(`${file.name}AI重命名处理失败: ${error.message}`);
            }
        }
        return newFiles;
    }
    // 根据布隆过滤器判断是否被和谐
    isHarmonized(file) {
        // 检查资源是否被和谐
        if (harmonizedFilter.isHarmonized(file.md5)) {
            logTaskEvent(`文件 ${file.name} 被和谐`);
            return true;
        }    
        return false
    }

    // 根据文件id批量删除文件
    async deleteFiles(taskId, files) {
        const task = await this.getTaskById(taskId)
        if (!task) {
            throw new Error('任务不存在')
        }
        const strmService = new StrmService()
        const folderName = task.realFolderName.substring(task.realFolderName.indexOf('/') + 1);
        let strmList = []
        strmList = files.map(file => path.join(folderName, file.name));
        // 判断是否启用了系统代理
        if (task.enableSystemProxy) {
            // 代理文件
        }else{
            // 删除网盘文件
            const cloud189 = Cloud189Service.getInstance(task.account);
            await this.deleteCloudFile(cloud189,files, 0);
            await this.refreshAlistCache(task)
        }
        for (const strm of strmList) {
            // 删除strm文件
            await strmService.delete(path.join(task.account.localStrmPrefix, strm));
        }
    }

    // 根据任务刷新Alist缓存
    async refreshAlistCache(task, firstExecution = false) {
        try{
            if (ConfigService.getConfigValue('alist.enable') && !task.enableSystemProxy && task.account.cloudStrmPrefix) {
                const pathParts = task.realFolderName.split('/');
                let alistPath = pathParts.slice(1).join('/');
                let currentPath = task.account.cloudStrmPrefix.includes('/d/') 
                    ? task.account.cloudStrmPrefix.split('/d/')[1] 
                    : path.basename(task.account.cloudStrmPrefix);
                let refreshPath = "";
                // 首次执行任务需要刷新所有目录缓存
                if (firstExecution) {
                    alistPath = pathParts.slice(1, -1).join('/');
                    const taskName = task.resourceName;
                    // 替换alistPath中的taskName为空, 然后去掉最后一个/
                    alistPath = alistPath.replace(taskName, '').replace(/\/$/, '');
                    refreshPath = path.join(currentPath, alistPath);
                } else {
                    // 非首次只刷新当前目录
                    refreshPath = path.join(currentPath, alistPath);
                }
                logTaskEvent(`刷新alist目录缓存: ${refreshPath}`);
                await alistService.listFiles(refreshPath);
            }
        }catch (error) {
            logTaskEvent(`刷新Alist缓存失败: ${error.message}`);
        }
    }

    // 根据task获取文件列表
    async getFilesByTask(task) {
        if (task.enableSystemProxy) {
            throw new Error('系统代理模式已移除');
        }
        const cloud189 = Cloud189Service.getInstance(task.account);
        return await this.getAllFolderFiles(cloud189, task)
    }
}

module.exports = { TaskService };
