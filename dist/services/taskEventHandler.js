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
const { StrmService } = require('./strm');
const { EmbyService } = require('./emby');
const { logTaskEvent } = require('../utils/logUtils');
const ConfigService = require('./ConfigService');
const { ScrapeService } = require('./ScrapeService');
class TaskEventHandler {
    constructor(messageUtil) {
        this.messageUtil = messageUtil;
    }
    handle(taskCompleteEventDto) {
        return __awaiter(this, void 0, void 0, function* () {
            const task = taskCompleteEventDto.task;
            const taskRepo = taskCompleteEventDto.taskRepo;
            const taskService = taskCompleteEventDto.taskService;
            const actualNewCount = taskCompleteEventDto.actualNewCount || 0;
            // 修改判断逻辑：不仅检查 fileList，还检查 actualNewCount（智能去重场景）
            // 智能去重流程中 newFiles 可能是空，但 actualNewCount > 0 表示有秒传成功
            if (taskCompleteEventDto.fileList.length === 0 && actualNewCount === 0) {
                return;
            }
            logTaskEvent(` ${task.resourceName} 触发事件:`);
            try {
                // 第1步：发送转存成功通知（确保最先发送）
                yield this._handleSaveSuccessNotification(taskCompleteEventDto);
                // 第2步：自动重命名（发送重命名完成通知）
                yield this._handleAutoRename(taskCompleteEventDto);
                // 第3步：更新最新保存显示
                yield this._handleLatestSavedDisplay(taskCompleteEventDto);
                // 第4步：生成STRM文件
                yield this._handleStrmGeneration(taskCompleteEventDto);
                // 第5步：刷新Alist缓存
                yield this._handleAlistCache(taskCompleteEventDto);
                // 第6步：媒体刮削
                yield this._handleMediaScraping(taskCompleteEventDto);
                // 第7步：Emby入库通知（确保最后发送）
                this._handleEmbyNotification(taskCompleteEventDto);
            }
            catch (error) {
                console.error(error);
                logTaskEvent(`任务完成后处理失败: ${error.message}`);
            }
            logTaskEvent(`================事件处理完成================`);
            if (taskRepo && task.status === 'processing') {
                task.status = 'pending';
                yield taskRepo.save(task);
                logTaskEvent(`任务状态已恢复为 pending`);
            }
        });
    }
    _extractEpisodeInfo(fileName) {
        if (!fileName)
            return null;
        const patterns = [
            /S(\d{1,2})E(\d{1,4})/i,
            /第\s*(\d{1,4})\s*[集话话]/,
            /(?:EP|E)(\d{1,4})(?!\d)/i
        ];
        for (const pattern of patterns) {
            const match = fileName.match(pattern);
            if (!match)
                continue;
            if (match.length >= 3 && /S/i.test(match[0])) {
                return {
                    season: parseInt(match[1], 10),
                    episode: parseInt(match[2], 10),
                    label: `S${match[1].padStart(2, '0')}E${match[2].padStart(2, '0')}`
                };
            }
            const episode = parseInt(match[1], 10);
            return {
                season: null,
                episode,
                label: `第${episode}集`
            };
        }
        return null;
    }
    _isSeriesTask(task, fileList) {
        if (task.videoType) {
            return task.videoType !== 'movie';
        }
        if ((task.totalEpisodes || 0) > 1) {
            return true;
        }
        return fileList.some(file => this._extractEpisodeInfo(file.name));
    }
    buildLatestSavedDisplay(task, allFiles = []) {
        const mediaFiles = (allFiles || []).filter(file => !file.isFolder);
        if (mediaFiles.length === 0) {
            return {
                lastSavedFileName: null,
                lastSavedDisplayText: null,
                missingEpisodes: null
            };
        }
        const latestFile = mediaFiles[mediaFiles.length - 1];
        let lastSavedDisplayText = latestFile.name;
        let missingEpisodes = null;
        if (this._isSeriesTask(task, mediaFiles)) {
            const episodeInfos = mediaFiles
                .map(file => ({ file, episodeInfo: this._extractEpisodeInfo(file.name) }))
                .filter(item => item.episodeInfo && Number.isInteger(item.episodeInfo.episode));
            if (episodeInfos.length > 0) {
                episodeInfos.sort((a, b) => {
                    const seasonA = a.episodeInfo.season || 1;
                    const seasonB = b.episodeInfo.season || 1;
                    if (seasonA !== seasonB)
                        return seasonA - seasonB;
                    return a.episodeInfo.episode - b.episodeInfo.episode;
                });
                const latestEpisode = episodeInfos[episodeInfos.length - 1].episodeInfo;
                lastSavedDisplayText = `已更新到${latestEpisode.label}`;
                const targetSeason = latestEpisode.season || episodeInfos[0].episodeInfo.season || 1;
                const seasonEpisodes = episodeInfos
                    .filter(item => (item.episodeInfo.season || 1) === targetSeason)
                    .map(item => item.episodeInfo.episode);
                const episodeSet = new Set(seasonEpisodes);
                const missing = [];
                for (let ep = 1; ep < latestEpisode.episode; ep++) {
                    if (!episodeSet.has(ep)) {
                        missing.push(targetSeason ? `S${String(targetSeason).padStart(2, '0')}E${String(ep).padStart(2, '0')}` : `第${ep}集`);
                    }
                }
                if (missing.length > 0) {
                    missingEpisodes = JSON.stringify(missing);
                }
            }
        }
        return {
            lastSavedFileName: latestFile.name,
            lastSavedDisplayText,
            missingEpisodes
        };
    }
    _handleLatestSavedDisplay(taskCompleteEventDto) {
        return __awaiter(this, void 0, void 0, function* () {
            const { task, taskRepo } = taskCompleteEventDto;
            const finalFiles = (taskCompleteEventDto.fileList || []).filter(file => !file.isFolder);
            if (finalFiles.length === 0 || !taskRepo) {
                return;
            }
            const allFiles = [
                ...((taskCompleteEventDto.existingFiles || []).filter(file => !file.isFolder)),
                ...finalFiles
            ];
            const latestSavedDisplay = this.buildLatestSavedDisplay(task, allFiles);
            task.lastSavedFileName = latestSavedDisplay.lastSavedFileName;
            task.lastSavedDisplayText = latestSavedDisplay.lastSavedDisplayText;
            task.missingEpisodes = latestSavedDisplay.missingEpisodes;
            yield taskRepo.save(task);
        });
    }
    /**
     * 发送转存成功通知（确保在重命名和入库通知之前）
     * 通知顺序：转存成功 → 重命名完成 → Emby入库
     */
    _handleSaveSuccessNotification(taskCompleteEventDto) {
        return __awaiter(this, void 0, void 0, function* () {
            const { task, saveResults } = taskCompleteEventDto;
            // 如果有预构建的 saveResults，直接发送
            if (saveResults && saveResults.length > 0) {
                const message = saveResults.join('\n\n');
                this.messageUtil.sendMessage(message);
                logTaskEvent(`[转存通知] 已发送转存成功通知: ${task.resourceName}`);
            }
        });
    }
    _handleAutoRename(taskCompleteEventDto) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { task, taskService, cloud189, taskRepo } = taskCompleteEventDto;
                const freshTask = yield taskRepo.findOneBy({ id: task.id });
                if (freshTask) {
                    task.manualTmdbBound = freshTask.manualTmdbBound;
                    task.tmdbId = freshTask.tmdbId;
                    task.tmdbTitle = freshTask.tmdbTitle;
                    task.videoType = freshTask.videoType;
                    task.manualSeason = freshTask.manualSeason;
                }
                const result = yield taskService.autoRename(cloud189, task);
                if (result && result.newFiles && result.newFiles.length > 0) {
                    taskCompleteEventDto.fileList = result.newFiles;
                    // 获取保存路径用于 webhook 占位符
                    // 确保路径以 / 开头（SmartStrm webhook 要求）
                    let folderPath = task.realFolderName || task.realFolderId || '';
                    if (folderPath && !folderPath.startsWith('/')) {
                        folderPath = '/' + folderPath;
                    }
                    let message = `✅《${task.resourceName}》重命名完成\n已处理 ${result.newFiles.length} 个文件\n📁 ${folderPath}`;
                    if (result.renameMessages && result.renameMessages.length > 0) {
                        const details = result.renameMessages.slice(0, 10);
                        message += `\n${details.join('\n')}`;
                        if (result.renameMessages.length > 10) {
                            message += `\n└─ ... 等${result.renameMessages.length}个文件`;
                        }
                    }
                    this.messageUtil.sendMessage(message);
                    if (result.tmdbInfo) {
                        return { tmdbInfo: result.tmdbInfo };
                    }
                }
                else {
                    // AI 重命名失败（网络问题等）且无正则降级
                    // 使用实际文件名通知（带路径，触发 webhook）
                    // 这样下游服务可以处理，文件名虽未规范化但不影响使用
                    let folderPath = task.realFolderName || task.realFolderId || '';
                    if (folderPath && !folderPath.startsWith('/')) {
                        folderPath = '/' + folderPath;
                    }
                    const message = `⚠️《${task.resourceName}》转存成功但重命名失败\n` +
                        `📁 ${folderPath}\n` +
                        `请检查 AI 服务状态`;
                    this.messageUtil.sendMessage(message);
                    logTaskEvent(`AI 重命名失败，已发送带路径通知，路径: ${folderPath}`);
                }
            }
            catch (error) {
                console.error(error);
                logTaskEvent(`自动重命名失败: ${error.message}`);
                // 异常情况也发送带路径通知
                let folderPath = task.realFolderName || task.realFolderId || '';
                if (folderPath && !folderPath.startsWith('/')) {
                    folderPath = '/' + folderPath;
                }
                const message = `❌《${task.resourceName}》重命名异常\n` +
                    `📁 ${folderPath}\n` +
                    `错误: ${error.message}`;
                this.messageUtil.sendMessage(message);
            }
            return null;
        });
    }
    _handleStrmGeneration(taskCompleteEventDto) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { task, taskService, overwriteStrm } = taskCompleteEventDto;
                const strmService = new StrmService();
                if (ConfigService.getConfigValue('strm.enable')) {
                    // 获取文件列表
                    const fileList = yield taskService.getFilesByTask(task);
                    const message = yield strmService.generate(task, fileList, overwriteStrm);
                    this.messageUtil.sendMessage(message);
                }
            }
            catch (error) {
                console.error(error);
                logTaskEvent(`生成STRM文件失败: ${error.message}`);
            }
        });
    }
    _handleAlistCache(taskCompleteEventDto) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { task, taskService, firstExecution } = taskCompleteEventDto;
                yield taskService.refreshAlistCache(task, firstExecution);
            }
            catch (error) {
                console.error(error);
                logTaskEvent(`刷新Alist缓存失败: ${error.message}`);
            }
        });
    }
    _handleMediaScraping(taskCompleteEventDto) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { task, taskRepo } = taskCompleteEventDto;
                if (ConfigService.getConfigValue('tmdb.enableScraper') && (task === null || task === void 0 ? void 0 : task.enableTaskScraper)) {
                    const strmService = new StrmService();
                    const strmPath = strmService.getStrmPath(task);
                    if (strmPath) {
                        const scrapeService = new ScrapeService();
                        logTaskEvent(`开始刮削tmdbId: ${task.tmdbId}的媒体信息, 路径: ${strmPath}`);
                        const mediaDetails = yield scrapeService.scrapeFromDirectory(strmPath, task.tmdbId);
                        if (mediaDetails) {
                            if (task.tmdbId != mediaDetails.tmdbId) {
                                yield taskRepo.update(task.id, {
                                    tmdbId: mediaDetails.tmdbId,
                                    tmdbContent: JSON.stringify(mediaDetails)
                                });
                            }
                            const shortOverview = mediaDetails.overview ?
                                (mediaDetails.overview.length > 20 ? mediaDetails.overview.substring(0, 50) + '...' : mediaDetails.overview) :
                                '暂无';
                            const message = {
                                title: `✅ 刮削成功：${mediaDetails.title}`,
                                image: mediaDetails.backdropPath,
                                description: shortOverview,
                                rating: mediaDetails.voteAverage,
                                type: mediaDetails.type
                            };
                            this.messageUtil.sendScrapeMessage(message);
                        }
                    }
                }
            }
            catch (error) {
                console.error(error);
                logTaskEvent(`媒体刮削失败: ${error.message}`);
            }
        });
    }
    _handleEmbyNotification(taskCompleteEventDto) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { task } = taskCompleteEventDto;
                if (ConfigService.getConfigValue('emby.enable')) {
                    const embyService = new EmbyService();
                    yield embyService.notify(task);
                }
            }
            catch (error) {
                console.error(error);
                logTaskEvent(`通知Emby失败: ${error.message}`);
            }
        });
    }
}
module.exports = { TaskEventHandler };
