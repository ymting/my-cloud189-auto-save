"use strict";
class CreateTaskDto {
    constructor(data) {
        this.accountId = data.accountId;
        this.shareLink = data.shareLink;
        this.targetFolderId = data.targetFolderId;
        this.totalEpisodes = data.totalEpisodes;
        this.accessCode = data.accessCode;
        this.matchPattern = data.matchPattern;
        this.matchOperator = data.matchOperator;
        this.matchValue = data.matchValue;
        this.overwriteFolder = data.overwriteFolder;
        this.remark = data.remark;
        this.enableCron = data.enableCron;
        this.cronExpression = data.cronExpression;
        this.realRootFolderId = data.realRootFolderId;
        this.targetFolder = data.targetFolder;
        this.selectedFolders = data === null || data === void 0 ? void 0 : data.selectedFolders; // 选中的分享目录
        this.tgbot = data === null || data === void 0 ? void 0 : data.tgbot;
        this.sourceRegex = data === null || data === void 0 ? void 0 : data.sourceRegex; // 源正则 (自动重命名)
        this.targetRegex = data === null || data === void 0 ? void 0 : data.targetRegex; // 目标正则 (自动重命名)
        this.taskName = data === null || data === void 0 ? void 0 : data.taskName; // 任务名称
        this.enableTaskScraper = data === null || data === void 0 ? void 0 : data.enableTaskScraper; // 启用刮削
        this.enableSystemProxy = data === null || data === void 0 ? void 0 : data.enableSystemProxy; // 启用系统代理
        this.isFolder = data === null || data === void 0 ? void 0 : data.isFolder; // 是否是文件夹
        this.videoType = data === null || data === void 0 ? void 0 : data.videoType; // 视频类型 (movie/tv)
        this.tmdbId = data === null || data === void 0 ? void 0 : data.tmdbId; // TMDB ID
        this.tmdbTitle = data === null || data === void 0 ? void 0 : data.tmdbTitle; // TMDB 标题
        this.tmdbContent = data === null || data === void 0 ? void 0 : data.tmdbContent; // TMDB 完整详情（JSON序列化）
    }
    validate() {
        if (!this.accountId)
            throw new Error('账号ID不能为空');
        if (!this.shareLink)
            throw new Error('分享链接不能为空');
        if (!this.targetFolderId)
            throw new Error('目标目录不能为空');
        if (this.matchPattern && !this.matchValue)
            throw new Error('填了匹配模式, 那么匹配值就必须填');
        if (this.matchOperator && !['lt', 'eq', 'gt', 'contains', 'notContains'].includes(this.matchOperator)) {
            throw new Error('无效的匹配操作符');
        }
        if (this.enableCron) {
            if (!this.cronExpression) {
                throw new Error('启用定时任务时，Cron表达式不能为空');
            }
            if (this.cronExpression.trim().split(/\s+/).length !== 5) {
                throw new Error('Cron表达式必须为5位表达式模式（分 时 日 月 周）');
            }
            const cron = require('node-cron');
            if (!cron.validate(this.cronExpression)) {
                throw new Error('无效的Cron表达式');
            }
        }
    }
}
module.exports = { CreateTaskDto };
