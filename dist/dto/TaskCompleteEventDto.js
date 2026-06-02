"use strict";
class TaskCompleteEventDto {
    constructor(data) {
        this.cloud189 = data === null || data === void 0 ? void 0 : data.cloud189;
        this.task = data === null || data === void 0 ? void 0 : data.task;
        this.fileList = data === null || data === void 0 ? void 0 : data.fileList;
        this.overwriteStrm = data === null || data === void 0 ? void 0 : data.overwriteStrm;
        this.taskService = data === null || data === void 0 ? void 0 : data.taskService;
        this.taskRepo = data === null || data === void 0 ? void 0 : data.taskRepo;
        this.firstExecution = data === null || data === void 0 ? void 0 : data.firstExecution;
        this.existingFiles = data === null || data === void 0 ? void 0 : data.existingFiles;
        this.actualNewCount = (data === null || data === void 0 ? void 0 : data.actualNewCount) || 0; // 智能去重场景的实际新增数量
        this.saveResults = (data === null || data === void 0 ? void 0 : data.saveResults) || []; // 转存成功通知内容，由 taskEventHandler 统一发送
    }
}
module.exports = { TaskCompleteEventDto };
