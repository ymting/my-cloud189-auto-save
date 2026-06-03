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
const { TaskService } = require('./task');
const ConfigService = require('./ConfigService');
const { logTaskEvent } = require('../utils/logUtils');
const AIDiagnosticService = require('./AIDiagnosticService');
const OperationRecommendation = require('./OperationRecommendation');
const { ShareLinkParserWithTMDB } = require('./ShareLinkParser');
class AIOperationHandler {
    constructor(taskService) {
        this.taskService = taskService;
        this.diagnosticService = new AIDiagnosticService(taskService);
        this.recommendationService = new OperationRecommendation(taskService);
        this.shareLinkParser = new ShareLinkParserWithTMDB();
    }
    executeOperation(operation_1, params_1) {
        return __awaiter(this, arguments, void 0, function* (operation, params, context = {}) {
            const handler = this._getHandler(operation);
            if (!handler) {
                throw new Error(`未知操作: ${operation}`);
            }
            try {
                const result = yield handler.call(this, params, context);
                return {
                    success: true,
                    operation,
                    result,
                    timestamp: new Date().toISOString()
                };
            }
            catch (error) {
                console.error(`执行操作 ${operation} 失败:`, error);
                return {
                    success: false,
                    operation,
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
            }
        });
    }
    _getHandler(operation) {
        const handlers = {
            'list_tasks': this.handleListTasks,
            'get_task_detail': this.handleGetTaskDetail,
            'create_task': this.handleCreateTask,
            'run_task': this.handleRunTask,
            'delete_task': this.handleDeleteTask,
            'update_task': this.handleUpdateTask,
            'get_system_status': this.handleGetSystemStatus,
            'batch_operation': this.handleBatchOperation,
            'smart_create': this.handleSmartCreate,
            'diagnose_task': this.handleDiagnoseTask,
            'auto_fix': this.handleAutoFix,
            'batch_diagnose': this.handleBatchDiagnose,
            'get_recommendations': this.handleGetRecommendations
        };
        return handlers[operation];
    }
    handleListTasks(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { status = 'all', search, limit = 50 } = params;
            const tasks = yield this.taskService.getTasks();
            let filteredTasks = tasks;
            if (status && status !== 'all') {
                filteredTasks = filteredTasks.filter(t => t.status === status);
            }
            if (search) {
                filteredTasks = filteredTasks.filter(t => t.resourceName && t.resourceName.includes(search));
            }
            // 记录查询日志
            const { logTaskEvent } = require('../utils/logUtils');
            logTaskEvent(`[AI助手] 任务列表查询: 状态=${status}, 搜索=${search || '无'}, 总数=${tasks.length}, 过滤后=${filteredTasks.length}`);
            return {
                tasks: filteredTasks.map(task => ({
                    id: task.id,
                    resourceName: task.resourceName,
                    status: task.status,
                    createdAt: task.createdAt,
                    updatedAt: task.updatedAt,
                    shareLink: task.shareLink,
                    targetFolderId: task.targetFolderId
                })),
                total: filteredTasks.length,
                allTotal: tasks.length, // 添加总任务数
                filters: { status, search }
            };
        });
    }
    handleGetTaskDetail(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { taskId } = params;
            const task = yield this.taskService.getTaskById(taskId);
            if (!task) {
                throw new Error(`任务 ${taskId} 不存在`);
            }
            return {
                id: task.id,
                resourceName: task.resourceName,
                status: task.status,
                shareLink: task.shareLink,
                sharePassword: task.sharePassword,
                targetFolderId: task.targetFolderId,
                accountId: task.accountId,
                tmdbId: task.tmdbId,
                tmdbTitle: task.tmdbTitle,
                videoType: task.videoType,
                enableCron: task.enableCron,
                cronExpression: task.cronExpression,
                createdAt: task.createdAt,
                updatedAt: task.updatedAt,
                lastExecuteTime: task.lastExecuteTime,
                errorMessage: task.errorMessage
            };
        });
    }
    handleCreateTask(params, context) {
        return __awaiter(this, void 0, void 0, function* () {
            const { shareLink, sharePassword, targetFolder, accountId } = params;
            const taskData = {
                shareLink,
                sharePassword: sharePassword || '',
                targetFolderId: targetFolder,
                accountId,
                status: 'pending'
            };
            const task = yield this.taskService.createTask(taskData);
            logTaskEvent(`AI创建任务成功: ID=${task.id}, 链接=${shareLink}`);
            return {
                taskId: task.id,
                message: `任务创建成功！任务ID: ${task.id}`,
                details: {
                    shareLink,
                    targetFolder,
                    status: 'pending'
                }
            };
        });
    }
    handleSmartCreate(params, context) {
        return __awaiter(this, void 0, void 0, function* () {
            const { shareLink } = params;
            const shareInfo = yield this._parseShareLink(shareLink);
            const suggestedPath = this._suggestSavePath(shareInfo.name, shareInfo.type);
            return {
                type: 'task_preview',
                message: '检测到分享链接，已为您准备创建任务',
                preview: {
                    shareLink,
                    resourceName: shareInfo.name,
                    videoType: shareInfo.type || 'unknown',
                    suggestedPath: suggestedPath,
                    needPassword: shareInfo.needPassword || false
                },
                askConfirm: true
            };
        });
    }
    handleRunTask(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { taskId } = params;
            const task = yield this.taskService.getTaskById(taskId);
            if (!task) {
                throw new Error(`任务 ${taskId} 不存在`);
            }
            yield this.taskService.executeTask(taskId);
            logTaskEvent(`AI执行任务: ID=${taskId}, 名称=${task.resourceName}`);
            return {
                taskId,
                taskName: task.resourceName,
                message: `任务 ${taskId} 已开始执行`,
                status: 'executing'
            };
        });
    }
    handleDeleteTask(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { taskId, deleteCloud = false } = params;
            const task = yield this.taskService.getTaskById(taskId);
            if (!task) {
                throw new Error(`任务 ${taskId} 不存在`);
            }
            yield this.taskService.deleteTask(taskId, { deleteCloud });
            logTaskEvent(`AI删除任务: ID=${taskId}, 名称=${task.resourceName}, 删除云盘文件=${deleteCloud}`);
            return {
                taskId,
                taskName: task.resourceName,
                message: `任务 ${taskId} 已删除`,
                deletedCloud: deleteCloud
            };
        });
    }
    handleUpdateTask(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { taskId, updates } = params;
            const task = yield this.taskService.getTaskById(taskId);
            if (!task) {
                throw new Error(`任务 ${taskId} 不存在`);
            }
            yield this.taskService.updateTask(taskId, updates);
            logTaskEvent(`AI更新任务: ID=${taskId}, 更新字段=${Object.keys(updates).join(', ')}`);
            return {
                taskId,
                taskName: task.resourceName,
                updates,
                message: `任务 ${taskId} 已更新`
            };
        });
    }
    handleGetSystemStatus() {
        return __awaiter(this, void 0, void 0, function* () {
            const taskStats = yield this._getTaskStatistics();
            const resourceUsage = {
                cpu: process.cpuUsage(),
                memory: process.memoryUsage(),
                uptime: process.uptime(),
                platform: process.platform,
                nodeVersion: process.version
            };
            const config = ConfigService.getConfigValue('openai');
            const aiEnabled = config && config.enable && config.apiKey && config.baseUrl;
            return {
                tasks: taskStats,
                resources: resourceUsage,
                ai: {
                    enabled: aiEnabled,
                    model: (config === null || config === void 0 ? void 0 : config.model) || 'unknown'
                },
                timestamp: new Date().toISOString()
            };
        });
    }
    handleBatchOperation(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { operation, filter } = params;
            const tasks = yield this._getFilteredTasks(filter);
            if (tasks.length === 0) {
                return {
                    operation,
                    affected: 0,
                    message: '没有符合条件的任务'
                };
            }
            const results = [];
            for (const task of tasks) {
                try {
                    if (operation === 'execute') {
                        yield this.taskService.executeTask(task.id);
                        results.push({ taskId: task.id, status: 'success' });
                    }
                    else if (operation === 'delete') {
                        yield this.taskService.deleteTask(task.id);
                        results.push({ taskId: task.id, status: 'deleted' });
                    }
                    else if (operation === 'pause') {
                        yield this.taskService.updateTask(task.id, { status: 'paused' });
                        results.push({ taskId: task.id, status: 'paused' });
                    }
                    else if (operation === 'resume') {
                        yield this.taskService.updateTask(task.id, { status: 'pending' });
                        results.push({ taskId: task.id, status: 'resumed' });
                    }
                }
                catch (error) {
                    results.push({ taskId: task.id, status: 'failed', error: error.message });
                }
            }
            logTaskEvent(`AI批量操作: ${operation}, 影响任务数=${tasks.length}`);
            return {
                operation,
                affected: tasks.length,
                results,
                message: `批量${operation}完成，影响 ${tasks.length} 个任务`
            };
        });
    }
    _parseShareLink(shareLink) {
        return __awaiter(this, void 0, void 0, function* () {
            return {
                name: '未识别资源',
                type: 'unknown',
                needPassword: false
            };
        });
    }
    _suggestSavePath(resourceName, type) {
        const basePath = '/media/';
        if (type === 'movie') {
            return `${basePath}电影/${resourceName}/`;
        }
        else if (type === 'tv') {
            return `${basePath}电视剧/${resourceName}/`;
        }
        else {
            return `${basePath}${resourceName}/`;
        }
    }
    _getTaskStatistics() {
        return __awaiter(this, void 0, void 0, function* () {
            const allTasks = yield this.taskService.getTasks({});
            return {
                total: allTasks.length,
                active: allTasks.filter(t => t.status === 'active').length,
                completed: allTasks.filter(t => t.status === 'completed').length,
                failed: allTasks.filter(t => t.status === 'failed').length,
                pending: allTasks.filter(t => t.status === 'pending').length
            };
        });
    }
    _getFilteredTasks(filter) {
        return __awaiter(this, void 0, void 0, function* () {
            const tasks = yield this.taskService.getTasks();
            let filteredTasks = tasks;
            if (filter.status) {
                filteredTasks = filteredTasks.filter(t => t.status === filter.status);
            }
            if (filter.ids && filter.ids.length > 0) {
                filteredTasks = filteredTasks.filter(t => filter.ids.includes(t.id));
            }
            return filteredTasks;
        });
    }
    handleDiagnoseTask(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { taskId } = params;
            const diagnosis = yield this.diagnosticService.diagnoseTask(taskId);
            return {
                taskId,
                diagnosis: diagnosis.diagnosis,
                solutions: diagnosis.solutions,
                autoFixAvailable: diagnosis.autoFixAvailable,
                message: diagnosis.message || '诊断完成'
            };
        });
    }
    handleAutoFix(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { taskId } = params;
            const result = yield this.diagnosticService.autoFix(taskId);
            logTaskEvent(`AI自动修复任务: ID=${taskId}, 结果=${result.success ? '成功' : '失败'}`);
            return Object.assign({ taskId }, result);
        });
    }
    handleBatchDiagnose(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { filter = {} } = params;
            const result = yield this.diagnosticService.batchDiagnose(filter);
            return {
                diagnoses: result.diagnoses,
                summary: result.summary,
                message: `批量诊断完成，共 ${result.summary.total} 个失败任务`
            };
        });
    }
    handleGetRecommendations() {
        return __awaiter(this, arguments, void 0, function* (params = {}) {
            const recommendations = yield this.recommendationService.getRecommendations(params);
            return {
                recommendations,
                message: `获取到 ${recommendations.length} 条建议`
            };
        });
    }
}
module.exports = AIOperationHandler;
