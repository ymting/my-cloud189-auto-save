"use strict";
/**
 * CAS 智能去重服务
 * 用于初次执行/清缓存后批量处理 CAS 文件
 * 流程：转存 → 重命名 → 比对 → 删除已存在/秒传缺失
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const CasUtils = require('../utils/CasUtils');
const { BatchTaskDto } = require('../dto/BatchTaskDto');
const taskCacheManager = require('./TaskCacheManager');
const Cloud189Service = require('./cloud189');
const { logTaskEvent } = require('../utils/logUtils');
class CasSmartDedupService {
    constructor(taskService) {
        this.taskService = taskService;
    }
    /**
     * CAS 智能去重 v2 主流程 - 内存集数比对优先
     * 核心优化：先在内存中比对集数，只转存真正缺失的CAS文件
     * @param {Object} task - 任务对象
     * @param {Object} cloud189 - 云盘服务实例
     * @param {Array} allCasFiles - 分享目录所有 CAS 文件列表
     * @param {Array} folderFiles - 目标目录已有文件列表
     * @param {string} tmdbTitle - TMDB 标题
     * @param {Object} options - 配置选项
     * @returns {Object} 处理结果
     */
    processV2(task_1, cloud189_1, allCasFiles_1, folderFiles_1, tmdbTitle_1) {
        return __awaiter(this, arguments, void 0, function* (task, cloud189, allCasFiles, folderFiles, tmdbTitle, options = {}) {
            const { enableCasFamilyTransfer = false, casFamilyFolderIdActual = '', familyCloud189 = null, account = null, enableDeleteCasFile = true } = options;
            const successFiles = [];
            const casResults = [];
            const failedShareFileIds = new Set();
            let casSuccessCount = 0;
            logTaskEvent('[CAS智能去重v2] 开始处理 ' + allCasFiles.length + ' 个 CAS 文件');
            logTaskEvent('[CAS智能去重v2] TMDB 标题: ' + tmdbTitle);
            // 步骤1: 内存集数比对（零API调用）
            const { toSkip, toProcess } = this._compareByEpisodeInMemory(allCasFiles, folderFiles, tmdbTitle);
            logTaskEvent('[CAS智能去重v2] 内存比对完成：跳过 ' + toSkip.length + ' 个已存在，需处理 ' + toProcess.length + ' 个缺失');
            // 步骤2: 跳过的CAS加入缓存（零API调用）
            if (toSkip.length > 0) {
                logTaskEvent('[CAS智能去重v2] 将 ' + toSkip.length + ' 个已存在的 CAS 加入缓存...');
                for (const casFile of toSkip) {
                    yield taskCacheManager.addCache(task.id, String(casFile.id));
                }
                casSuccessCount += toSkip.length;
            }
            // 步骤3: 处理缺失的CAS（只转存+秒传真正缺失的）
            if (toProcess.length > 0) {
                logTaskEvent('[CAS智能去重v2] 开始处理 ' + toProcess.length + ' 个缺失文件...');
                // 批量转存缺失的CAS
                const transferResult = yield this._batchTransfer(task, cloud189, toProcess);
                if (!transferResult.success) {
                    for (const f of toProcess) {
                        failedShareFileIds.add(String(f.id));
                    }
                    return { successFiles, casResults, failedShareFileIds, casSuccessCount };
                }
                // 刷新目录获取转存后的CAS文件
                let savedCasFiles = [];
                try {
                    const folderFilesAfter = yield this.taskService.getAllFolderFiles(cloud189, task);
                    savedCasFiles = folderFilesAfter.filter(f => CasUtils.isCasFile(f.name));
                    logTaskEvent('[CAS智能去重v2] 目标目录现有 ' + savedCasFiles.length + ' 个 CAS 文件');
                }
                catch (e) {
                    logTaskEvent('[CAS智能去重v2] 刷新目录失败: ' + e.message);
                    return { successFiles, casResults, failedShareFileIds, casSuccessCount };
                }
                // 秒传缺失文件
                const uploadResult = yield this._uploadMissingFiles(task, cloud189, savedCasFiles, enableCasFamilyTransfer, casFamilyFolderIdActual, familyCloud189, account, enableDeleteCasFile);
                successFiles.push(...uploadResult.successFiles);
                casResults.push(...uploadResult.casResults);
                for (const id of uploadResult.failedShareFileIds) {
                    failedShareFileIds.add(id);
                }
                casSuccessCount += uploadResult.casSuccessCount;
            }
            // 步骤4: 最终清理（v2只有缺失的CAS被转存，清理量极小）
            if (enableDeleteCasFile) {
                yield this._cleanupAllCas(cloud189, task);
            }
            logTaskEvent('[CAS智能去重v2] 完成，成功 ' + casSuccessCount + ' 个');
            return { successFiles, casResults, failedShareFileIds, casSuccessCount };
        });
    }
    /**
     * 内存集数比对 - v2核心方法
     * 从CAS文件名提取集数，与目标目录已有视频集数比对
     * @param {Array} casFiles - CAS文件列表
     * @param {Array} folderFiles - 目标目录文件列表
     * @param {string} tmdbTitle - TMDB标题（用于重命名后的文件名匹配）
     * @returns {Object} { toSkip, toProcess }
     */
    _compareByEpisodeInMemory(casFiles, folderFiles, tmdbTitle) {
        const toSkip = [];
        const toProcess = [];
        const mediaExtensions = ['.mkv', '.mp4', '.avi', '.rmvb', '.wmv', '.m2ts', '.ts', '.flv', '.mov', '.iso', '.mpg', '.rm'];
        // 构建目标目录已有视频的集数映射: season_episode -> [file]
        const existingEpisodeMap = new Map();
        // 同时构建去后缀文件名集合（用于回退匹配）
        const existingBaseNames = new Set();
        const getBaseNameWithoutExt = (name) => {
            for (const ext of mediaExtensions) {
                if (name.toLowerCase().endsWith(ext))
                    return name.slice(0, -ext.length);
            }
            return name;
        };
        for (const file of folderFiles) {
            if (CasUtils.isCasFile(file.name))
                continue;
            // 提取集数
            const { season, episode } = this.taskService._extractSeasonEpisode(file.name);
            if (episode !== null) {
                const key = season + '_' + episode;
                if (!existingEpisodeMap.has(key)) {
                    existingEpisodeMap.set(key, []);
                }
                existingEpisodeMap.get(key).push(file);
            }
            // 同时构建去后缀集合
            existingBaseNames.add(getBaseNameWithoutExt(file.name));
        }
        logTaskEvent('[CAS智能去重v2] 目标目录已有 ' + existingEpisodeMap.size + ' 个不同集数的视频');
        const normalizeName = (name) => {
            if (!name)
                return '';
            return name.toLowerCase()
                .replace(/（/g, '(')
                .replace(/）/g, ')')
                .replace(/【/g, '[')
                .replace(/】/g, ']')
                .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
                .trim();
        };
        const normExistingBaseNames = Array.from(existingBaseNames).map(n => normalizeName(n));
        // 比对每个CAS文件
        for (const casFile of casFiles) {
            // 从CAS文件名提取集数
            const { season, episode } = this.taskService._extractSeasonEpisode(casFile.name);
            if (episode !== null) {
                // 有集数，与目标目录集数比对
                const key = season + '_' + episode;
                if (existingEpisodeMap.has(key)) {
                    // 集数匹配，跳过
                    toSkip.push(casFile);
                    continue;
                }
                // 集数不匹配，但也可能是重命名后的文件名匹配
                // 生成重命名后的目标文件名，检查去后缀集合
                const generatedName = this.taskService._generateCasTargetName(casFile.name, tmdbTitle, season, episode);
                const generatedVideoName = generatedName.replace(/\.cas$/i, '');
                const generatedBaseName = getBaseNameWithoutExt(generatedVideoName);
                const normGeneratedBaseName = normalizeName(generatedBaseName);
                if (existingBaseNames.has(generatedBaseName) || normExistingBaseNames.includes(normGeneratedBaseName)) {
                    toSkip.push(casFile);
                    continue;
                }
                // 确实缺失，需处理
                toProcess.push(casFile);
            }
            else {
                // 无法提取集数，回退到文件名比对
                // 去掉.cas后缀，得到推断的视频名
                const videoName = casFile.name.replace(/\.cas$/i, '');
                const baseName = getBaseNameWithoutExt(videoName);
                let isMatch = false;
                // 1. 原文件名比对 (不区分大小写和特殊字符)
                const normBaseName = normalizeName(baseName);
                if (normExistingBaseNames.includes(normBaseName)) {
                    isMatch = true;
                }
                // 2. TMDB标题比对 (电影类型适用)
                if (!isMatch && tmdbTitle) {
                    const year = this.taskService._extractYear(casFile.name);
                    const normTmdbTitle = normalizeName(tmdbTitle);
                    const potentialNames = [
                        normTmdbTitle,
                        year ? normalizeName(`${tmdbTitle}(${year})`) : null,
                        year ? normalizeName(`${tmdbTitle} (${year})`) : null
                    ].filter(Boolean);
                    if (normExistingBaseNames.some(existing => potentialNames.includes(existing))) {
                        isMatch = true;
                    }
                }
                if (isMatch) {
                    toSkip.push(casFile);
                }
                else {
                    // 无法匹配，纳入处理流程
                    toProcess.push(casFile);
                }
            }
        }
        return { toSkip, toProcess };
    }
    /**
     * CAS 智能去重 v1 主流程
     * @param {Object} task - 任务对象
     * @param {Object} cloud189 - 云盘服务实例
     * @param {Array} newCasFiles - 需处理的 CAS 文件列表
     * @param {string} tmdbTitle - TMDB 标题
     * @param {Object} options - 配置选项
     * @returns {Object} 处理结果
     */
    process(task_1, cloud189_1, newCasFiles_1, tmdbTitle_1) {
        return __awaiter(this, arguments, void 0, function* (task, cloud189, newCasFiles, tmdbTitle, options = {}) {
            const { enableCasFamilyTransfer = false, casFamilyFolderIdActual = '', familyCloud189 = null, account = null, enableDeleteCasFile = true } = options;
            const successFiles = [];
            const casResults = [];
            const failedShareFileIds = new Set();
            let casSuccessCount = 0;
            logTaskEvent('[CAS智能去重] 开始处理 ' + newCasFiles.length + ' 个 CAS 文件');
            logTaskEvent('[CAS智能去重] TMDB 标题: ' + tmdbTitle);
            // 1. 批量转存所有 CAS 文件
            const transferResult = yield this._batchTransfer(task, cloud189, newCasFiles);
            if (!transferResult.success) {
                for (const f of newCasFiles) {
                    failedShareFileIds.add(String(f.id));
                }
                return { successFiles, casResults, failedShareFileIds, casSuccessCount };
            }
            // 2. 刷新目录获取转存后的 CAS 文件
            let savedCasFiles = [];
            try {
                const folderFilesAfter = yield this.taskService.getAllFolderFiles(cloud189, task);
                savedCasFiles = folderFilesAfter.filter(f => CasUtils.isCasFile(f.name));
                logTaskEvent('[CAS智能去重] 目标目录现有 ' + savedCasFiles.length + ' 个 CAS 文件');
            }
            catch (e) {
                logTaskEvent('[CAS智能去重] 刷新目录失败: ' + e.message);
                return { successFiles, casResults, failedShareFileIds, casSuccessCount };
            }
            // 3. 批量重命名 CAS 文件
            logTaskEvent('[CAS智能去重] 开始重命名 CAS 文件...');
            const renamedFiles = yield this._renameCasFiles(cloud189, savedCasFiles, tmdbTitle);
            // 4. 刷新目录获取重命名后的文件和目标目录视频
            const compareResult = yield this._refreshAndCompare(cloud189, task);
            if (!compareResult.success) {
                return { successFiles, casResults, failedShareFileIds, casSuccessCount };
            }
            const { existingBaseNames, existingVideoNames, renamedCasFiles } = compareResult;
            // 5. 去后缀比对，分类处理
            const { toDelete, toUpload } = this._compareCasWithExisting(renamedCasFiles, existingBaseNames, existingVideoNames);
            logTaskEvent('[CAS智能去重] 已存在 ' + toDelete.length + ' 个，需秒传 ' + toUpload.length + ' 个');
            // 6. 删除已存在的 CAS 文件并缓存
            if (toDelete.length > 0) {
                const deleteResult = yield this._deleteExistingCas(cloud189, task, toDelete, enableDeleteCasFile);
                casSuccessCount += deleteResult.deletedCount;
            }
            // 7. 秒传缺失的文件
            if (toUpload.length > 0) {
                logTaskEvent('[CAS智能去重] 开始秒传 ' + toUpload.length + ' 个缺失文件...');
                const uploadResult = yield this._uploadMissingFiles(task, cloud189, toUpload, enableCasFamilyTransfer, casFamilyFolderIdActual, familyCloud189, account, enableDeleteCasFile);
                successFiles.push(...uploadResult.successFiles);
                casResults.push(...uploadResult.casResults);
                for (const id of uploadResult.failedShareFileIds) {
                    failedShareFileIds.add(id);
                }
                casSuccessCount += uploadResult.casSuccessCount;
            }
            // 8. 清理目标目录所有 CAS 文件（如果配置启用）
            if (enableDeleteCasFile) {
                yield this._cleanupAllCas(cloud189, task);
            }
            return { successFiles, casResults, failedShareFileIds, casSuccessCount };
        });
    }
    // 批量转存
    _batchTransfer(task, cloud189, casFiles) {
        return __awaiter(this, void 0, void 0, function* () {
            let retryCount = 0;
            const MAX_RETRY = 3;
            while (retryCount < MAX_RETRY) {
                try {
                    const casTaskInfoList = casFiles.map(f => ({
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
                    yield this.taskService.createBatchTask(cloud189, casBatchTask);
                    logTaskEvent('[CAS智能去重] ' + casFiles.length + ' 个 CAS 文件批量转存完成');
                    yield new Promise(resolve => setTimeout(resolve, 2000));
                    return { success: true };
                }
                catch (error) {
                    if (error.message.includes('ShareSaveTaskIsAlreadyExist') || error.message.includes('BatchOperFileFailed')) {
                        retryCount++;
                        logTaskEvent('[CAS智能去重] 队列堵塞，等待5秒重试(' + retryCount + '/' + MAX_RETRY + ')');
                        yield new Promise(resolve => setTimeout(resolve, 5000));
                    }
                    else {
                        logTaskEvent('[CAS智能去重] 批量转存失败: ' + error.message);
                        return { success: false };
                    }
                }
            }
            return { success: false };
        });
    }
    // 批量重命名 CAS 文件
    _renameCasFiles(cloud189, casFiles, tmdbTitle) {
        return __awaiter(this, void 0, void 0, function* () {
            const renamedFiles = [];
            for (const casFile of casFiles) {
                try {
                    const { season, episode } = this.taskService._extractSeasonEpisode(casFile.name);
                    if (!episode) {
                        renamedFiles.push(casFile);
                        continue;
                    }
                    const newName = this.taskService._generateCasTargetName(casFile.name, tmdbTitle, season, episode);
                    if (casFile.name === newName) {
                        renamedFiles.push(casFile);
                        continue;
                    }
                    const renameResult = yield cloud189.renameFile(casFile.id, newName);
                    if (renameResult && renameResult.res_code === 0) {
                        logTaskEvent('[CAS重命名] ' + casFile.name + ' -> ' + newName);
                        renamedFiles.push(Object.assign(Object.assign({}, casFile), { name: newName }));
                    }
                    else {
                        logTaskEvent('[CAS重命名] ' + casFile.name + ' 失败');
                        renamedFiles.push(casFile);
                    }
                    yield new Promise(resolve => setTimeout(resolve, 500));
                }
                catch (error) {
                    logTaskEvent('[CAS重命名] ' + casFile.name + ' 异常: ' + error.message);
                    renamedFiles.push(casFile);
                }
            }
            return renamedFiles;
        });
    }
    // 刷新目录并构建比对集合
    _refreshAndCompare(cloud189, task) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const folderFiles = yield this.taskService.getAllFolderFiles(cloud189, task);
                const mediaExtensions = ['.mkv', '.mp4', '.avi', '.rmvb', '.wmv', '.m2ts', '.ts', '.flv', '.mov', '.iso', '.mpg', '.rm'];
                const getBaseNameWithoutExt = (name) => {
                    name = name.replace(/\.cas$/i, '');
                    for (const ext of mediaExtensions) {
                        if (name.toLowerCase().endsWith(ext))
                            return name.slice(0, -ext.length);
                    }
                    return name;
                };
                const existingBaseNames = new Set(folderFiles.filter(f => !CasUtils.isCasFile(f.name)).map(f => getBaseNameWithoutExt(f.name)));
                const existingVideoNames = new Set(folderFiles.filter(f => !CasUtils.isCasFile(f.name)).map(f => f.name));
                const renamedCasFiles = folderFiles.filter(f => CasUtils.isCasFile(f.name));
                logTaskEvent('[CAS智能去重] 目标目录已有 ' + existingBaseNames.size + ' 个视频文件');
                return { success: true, existingBaseNames, existingVideoNames, renamedCasFiles };
            }
            catch (e) {
                logTaskEvent('[CAS智能去重] 刷新目录失败: ' + e.message);
                return { success: false };
            }
        });
    }
    // 去后缀比对
    _compareCasWithExisting(casFiles, existingBaseNames, existingVideoNames) {
        const toDelete = [];
        const toUpload = [];
        const mediaExtensions = ['.mkv', '.mp4', '.avi', '.rmvb', '.wmv', '.m2ts', '.ts', '.flv', '.mov', '.iso', '.mpg', '.rm'];
        const getBaseNameWithoutExt = (name) => {
            name = name.replace(/\.cas$/i, '');
            for (const ext of mediaExtensions) {
                if (name.toLowerCase().endsWith(ext))
                    return name.slice(0, -ext.length);
            }
            return name;
        };
        for (const casFile of casFiles) {
            const videoName = casFile.name.replace(/\.cas$/i, '');
            const baseName = getBaseNameWithoutExt(videoName);
            if (existingBaseNames.has(baseName) || existingVideoNames.has(videoName)) {
                toDelete.push(casFile);
            }
            else {
                toUpload.push(casFile);
            }
        }
        return { toDelete, toUpload };
    }
    // 删除已存在的 CAS
    _deleteExistingCas(cloud189_1, task_1, casFiles_1) {
        return __awaiter(this, arguments, void 0, function* (cloud189, task, casFiles, enableDeleteCasFile = true) {
            let deletedCount = 0;
            logTaskEvent('[CAS智能去重] 处理 ' + casFiles.length + ' 个已存在的 CAS...');
            for (const casFile of casFiles) {
                try {
                    // 修复 Issue #27：仅当用户启用"处理后删除 .cas 文件"时才执行删除
                    // 即使不删除，也加入缓存避免下次重复处理
                    if (enableDeleteCasFile) {
                        yield cloud189.deleteFile(casFile.id);
                        deletedCount++;
                    }
                    else {
                        logTaskEvent('[CAS] 保留已存在 .cas 文件（未启用处理后删除）: ' + casFile.name);
                    }
                    yield taskCacheManager.addCache(task.id, String(casFile.id));
                }
                catch (e) {
                    logTaskEvent('[CAS删除] ' + casFile.name + ' 失败: ' + e.message);
                }
                yield new Promise(resolve => setTimeout(resolve, 100));
            }
            return { deletedCount };
        });
    }
    // 秒传缺失文件
    _uploadMissingFiles(task_1, cloud189_1, casFiles_1, enableCasFamilyTransfer_1, casFamilyFolderIdActual_1, familyCloud189_1, account_1) {
        return __awaiter(this, arguments, void 0, function* (task, cloud189, casFiles, enableCasFamilyTransfer, casFamilyFolderIdActual, familyCloud189, account, enableDeleteCasFile = true) {
            const successFiles = [];
            const casResults = [];
            const failedShareFileIds = new Set();
            let casSuccessCount = 0;
            // 家庭账号初始化
            let familyCloud189Actual = familyCloud189 || cloud189;
            let casFamilyInfo = this.taskService._casFamilyInfo;
            let casFamilyFolderId = casFamilyFolderIdActual;
            if (enableCasFamilyTransfer && task.casFamilyAccountId && task.casFamilyAccountId !== task.accountId) {
                const familyAccount = yield this.taskService.accountRepo.findOneBy({ id: task.casFamilyAccountId });
                if (familyAccount) {
                    familyCloud189Actual = Cloud189Service.getInstance(familyAccount);
                }
            }
            if (enableCasFamilyTransfer && !casFamilyInfo) {
                casFamilyInfo = yield familyCloud189Actual.getFamilyInfo();
            }
            if (enableCasFamilyTransfer && casFamilyInfo && !casFamilyFolderId) {
                const familyId = casFamilyInfo.familyId;
                if (!this.taskService._casFamilyRootFolderId) {
                    this.taskService._casFamilyRootFolderId = yield familyCloud189Actual.getFamilyRootFolderId(familyId);
                }
                const familyFolderIdResult = yield this.taskService._getFamilyFolderId(account, familyCloud189Actual, familyId, this.taskService._casFamilyRootFolderId);
                casFamilyFolderId = familyFolderIdResult.folderId || this.taskService._casFamilyRootFolderId;
            }
            const familyFolderId = casFamilyFolderId || this.taskService._casFamilyRootFolderId;
            // 批次秒传
            const BATCH_SIZE = 3;
            let batchNum = 1;
            let remainingFiles = [...casFiles];
            while (remainingFiles.length > 0) {
                const batchFiles = remainingFiles.slice(0, BATCH_SIZE);
                logTaskEvent('[CAS秒传] 第' + batchNum + '批次，' + batchFiles.length + ' 个文件');
                for (const casFile of batchFiles) {
                    try {
                        const content = yield cloud189.downloadFileContent(casFile.id);
                        const parsed = CasUtils.parseCasContent(content);
                        if (!parsed || !parsed.md5 || !parsed.slice_md5) {
                            logTaskEvent('[CAS秒传] ' + casFile.name + ' 解析失败');
                            failedShareFileIds.add(String(casFile.id));
                            continue;
                        }
                        const videoName = casFile.name.replace(/\.cas$/i, '');
                        if (enableCasFamilyTransfer && casFamilyInfo) {
                            const familyResult = yield familyCloud189Actual.familyRapidUpload(videoName, parseInt(parsed.size), parsed.md5.toUpperCase(), parsed.slice_md5.toUpperCase(), casFamilyInfo.familyId, familyFolderId);
                            if (familyResult.success && familyResult.familyFileId) {
                                const saveResult = yield cloud189.saveFamilyFileToPersonal(casFamilyInfo.familyId, familyResult.familyFileId, task.realFolderId, familyFolderId, videoName);
                                if (saveResult.success) {
                                    logTaskEvent('[家庭中转] 完成 ' + videoName);
                                    successFiles.push(videoName);
                                    casResults.push({ fileName: videoName, success: true });
                                    try {
                                        yield familyCloud189Actual.deleteFamilyFile(casFamilyInfo.familyId, familyResult.familyFileId);
                                    }
                                    catch (e) { }
                                    // 修复 Issue #27：仅当用户启用"处理后删除 .cas 文件"时才删除源 .cas
                                    if (enableDeleteCasFile) {
                                        try {
                                            yield cloud189.deleteFile(casFile.id);
                                            yield taskCacheManager.addCache(task.id, String(casFile.id));
                                        }
                                        catch (e) { }
                                    }
                                    else {
                                        logTaskEvent('[CAS] 保留源 .cas 文件（未启用处理后删除）: ' + casFile.name);
                                    }
                                    casSuccessCount++;
                                }
                                else {
                                    logTaskEvent('[家庭中转] ' + videoName + ' 转存失败');
                                    failedShareFileIds.add(String(casFile.id));
                                }
                            }
                            else {
                                logTaskEvent('[家庭中转] ' + videoName + ' 秒传失败');
                                failedShareFileIds.add(String(casFile.id));
                            }
                        }
                        else {
                            const uploadResult = yield cloud189.rapidUpload(videoName, parseInt(parsed.size), parsed.md5.toUpperCase(), parsed.slice_md5.toUpperCase(), task.realFolderId);
                            if (uploadResult.success) {
                                logTaskEvent('[CAS秒传] 完成 ' + videoName);
                                successFiles.push(videoName);
                                casResults.push({ fileName: videoName, success: true });
                                // 修复 Issue #27：仅当用户启用"处理后删除 .cas 文件"时才删除源 .cas
                                if (enableDeleteCasFile) {
                                    try {
                                        yield cloud189.deleteFile(casFile.id);
                                        yield taskCacheManager.addCache(task.id, String(casFile.id));
                                    }
                                    catch (e) { }
                                }
                                else {
                                    logTaskEvent('[CAS] 保留源 .cas 文件（未启用处理后删除）: ' + casFile.name);
                                }
                                casSuccessCount++;
                            }
                            else {
                                logTaskEvent('[CAS秒传] ' + videoName + ' 失败');
                                failedShareFileIds.add(String(casFile.id));
                            }
                        }
                    }
                    catch (error) {
                        logTaskEvent('[CAS秒传] ' + casFile.name + ' 异常: ' + error.message);
                        failedShareFileIds.add(String(casFile.id));
                    }
                    yield new Promise(resolve => setTimeout(resolve, 500));
                }
                // 批次结束清理
                if (enableCasFamilyTransfer && familyCloud189Actual) {
                    familyCloud189Actual._sessionKey = null;
                    familyCloud189Actual._rsaKey = null;
                }
                remainingFiles = remainingFiles.slice(BATCH_SIZE);
                batchNum++;
                yield new Promise(resolve => setTimeout(resolve, 1000));
            }
            return { successFiles, casResults, failedShareFileIds, casSuccessCount };
        });
    }
    // 清理所有 CAS 文件
    _cleanupAllCas(cloud189, task) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const folderFiles = yield this.taskService.getAllFolderFiles(cloud189, task);
                const allCasFiles = folderFiles.filter(f => CasUtils.isCasFile(f.name));
                if (allCasFiles.length > 0) {
                    logTaskEvent('[CAS清理] 删除 ' + allCasFiles.length + ' 个 CAS 文件...');
                    for (const casFile of allCasFiles) {
                        try {
                            yield cloud189.deleteFile(casFile.id);
                        }
                        catch (e) { }
                    }
                    yield new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            catch (e) {
                logTaskEvent('[CAS清理] 失败: ' + e.message);
            }
        });
    }
}
module.exports = CasSmartDedupService;
