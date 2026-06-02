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
const AIService = require('./ai');
const { logTaskEvent } = require('../utils/logUtils');
class AIDiagnosticService {
    constructor(taskService) {
        this.taskService = taskService;
    }
    diagnoseTask(taskId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const task = yield this.taskService.getTaskById(taskId);
                if (!task) {
                    throw new Error(`任务 ${taskId} 不存在`);
                }
                if (task.status !== 'failed') {
                    return {
                        success: true,
                        taskId,
                        taskName: task.resourceName,
                        status: task.status,
                        diagnosis: null,
                        message: '任务状态正常，无需诊断'
                    };
                }
                const logs = yield this._getTaskLogs(taskId);
                const diagnosis = yield this._analyzeFailure(task, logs);
                const solutions = yield this._generateSolutions(diagnosis);
                return {
                    success: true,
                    taskId,
                    taskName: task.resourceName,
                    status: task.status,
                    diagnosis: {
                        reason: diagnosis.reason,
                        severity: diagnosis.severity,
                        category: diagnosis.category,
                        details: diagnosis.details
                    },
                    solutions,
                    autoFixAvailable: solutions.some(s => s.autoFix),
                    relatedLogs: logs.slice(0, 5)
                };
            }
            catch (error) {
                console.error(`诊断任务 ${taskId} 失败:`, error);
                return {
                    success: false,
                    taskId,
                    error: error.message
                };
            }
        });
    }
    _getTaskLogs(taskId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const logs = [];
                return logs;
            }
            catch (error) {
                console.error('获取任务日志失败:', error);
                return [];
            }
        });
    }
    _analyzeFailure(task, logs) {
        return __awaiter(this, void 0, void 0, function* () {
            const errorMessage = task.errorMessage || '';
            const shareLink = task.shareLink || '';
            const failurePatterns = [
                {
                    pattern: /分享链接.*失效|链接.*不存在|404|not found/i,
                    reason: '分享链接已失效',
                    severity: 'high',
                    category: 'link_invalid',
                    details: '分享链接可能已被删除、过期或访问权限已变更'
                },
                {
                    pattern: /密码.*错误|password.*incorrect|401|unauthorized/i,
                    reason: '分享密码错误',
                    severity: 'medium',
                    category: 'password_error',
                    details: '分享链接需要正确的访问密码'
                },
                {
                    pattern: /配额.*不足|quota.*exceeded|空间.*不足|507/i,
                    reason: '存储空间不足',
                    severity: 'high',
                    category: 'quota_exceeded',
                    details: '账号存储空间已满，无法保存新文件'
                },
                {
                    pattern: /网络.*超时|timeout|network.*error|ECONNREFUSED/i,
                    reason: '网络连接失败',
                    severity: 'medium',
                    category: 'network_error',
                    details: '网络连接不稳定或服务暂时不可用'
                },
                {
                    pattern: /账号.*失效|token.*expired|登录.*过期/i,
                    reason: '账号登录失效',
                    severity: 'high',
                    category: 'auth_expired',
                    details: '账号登录状态已过期，需要重新登录'
                },
                {
                    pattern: /文件.*不存在|file.*not found|资源.*删除/i,
                    reason: '源文件不存在',
                    severity: 'high',
                    category: 'source_missing',
                    details: '分享的源文件可能已被删除'
                },
                {
                    pattern: /权限.*不足|permission.*denied|403/i,
                    reason: '权限不足',
                    severity: 'medium',
                    category: 'permission_denied',
                    details: '账号权限不足以执行此操作'
                },
                {
                    pattern: /目标.*已存在|already.*exists|duplicate/i,
                    reason: '目标文件已存在',
                    severity: 'low',
                    category: 'duplicate',
                    details: '目标位置已存在同名文件'
                }
            ];
            for (const failure of failurePatterns) {
                if (failure.pattern.test(errorMessage)) {
                    return failure;
                }
            }
            if (yield this._shouldUseAIAnalysis(errorMessage)) {
                const aiAnalysis = yield this._aiAnalyzeFailure(errorMessage, task);
                if (aiAnalysis) {
                    return aiAnalysis;
                }
            }
            return {
                reason: '未知错误',
                severity: 'medium',
                category: 'unknown',
                details: errorMessage || '任务执行失败，但无法确定具体原因'
            };
        });
    }
    _shouldUseAIAnalysis(errorMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            const config = ConfigService.getConfigValue('openai');
            return config && config.enable && errorMessage && errorMessage.length > 20;
        });
    }
    _aiAnalyzeFailure(errorMessage, task) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const prompt = `分析以下任务失败的原因并提供诊断结果：

任务名称: ${task.resourceName || '未知'}
错误信息: ${errorMessage}

请以JSON格式返回分析结果，包含以下字段：
- reason: 失败原因的简短描述
- severity: 严重程度 (high/medium/low)
- category: 错误类别 (link_invalid/password_error/quota_exceeded/network_error/auth_expired/source_missing/permission_denied/unknown)
- details: 详细说明

只返回JSON，不要添加其他文字。`;
                const response = yield AIService.chat([
                    { role: 'user', content: prompt }
                ], { temperature: 0.3 });
                if (response.success) {
                    const analysis = JSON.parse(response.data);
                    return analysis;
                }
            }
            catch (error) {
                console.error('AI分析失败:', error);
            }
            return null;
        });
    }
    _generateSolutions(diagnosis) {
        return __awaiter(this, void 0, void 0, function* () {
            const solutions = {
                link_invalid: [
                    {
                        type: 'manual',
                        description: '联系分享者确认链接是否有效',
                        priority: 1
                    },
                    {
                        type: 'manual',
                        description: '尝试重新获取分享链接',
                        priority: 2
                    },
                    {
                        type: 'system',
                        description: '删除此失败任务',
                        autoFix: true,
                        action: 'delete_task',
                        priority: 3
                    }
                ],
                password_error: [
                    {
                        type: 'manual',
                        description: '输入正确的分享密码',
                        priority: 1,
                        autoFix: false,
                        action: 'update_password'
                    },
                    {
                        type: 'manual',
                        description: '联系分享者获取正确密码',
                        priority: 2
                    }
                ],
                quota_exceeded: [
                    {
                        type: 'manual',
                        description: '清理云盘空间，删除不需要的文件',
                        priority: 1
                    },
                    {
                        type: 'manual',
                        description: '升级账号存储空间',
                        priority: 2
                    },
                    {
                        type: 'system',
                        description: '切换到其他账号执行',
                        autoFix: false,
                        action: 'change_account',
                        priority: 3
                    }
                ],
                network_error: [
                    {
                        type: 'system',
                        description: '重新执行任务',
                        autoFix: true,
                        action: 'retry_task',
                        priority: 1
                    },
                    {
                        type: 'manual',
                        description: '检查网络连接',
                        priority: 2
                    }
                ],
                auth_expired: [
                    {
                        type: 'manual',
                        description: '重新登录账号',
                        priority: 1,
                        action: 'relogin'
                    },
                    {
                        type: 'system',
                        description: '切换到其他有效账号',
                        autoFix: false,
                        action: 'change_account',
                        priority: 2
                    }
                ],
                source_missing: [
                    {
                        type: 'manual',
                        description: '联系分享者确认文件是否仍存在',
                        priority: 1
                    },
                    {
                        type: 'system',
                        description: '删除此失败任务',
                        autoFix: true,
                        action: 'delete_task',
                        priority: 2
                    }
                ],
                permission_denied: [
                    {
                        type: 'manual',
                        description: '检查账号权限设置',
                        priority: 1
                    },
                    {
                        type: 'system',
                        description: '切换到有权限的账号',
                        autoFix: false,
                        action: 'change_account',
                        priority: 2
                    }
                ],
                duplicate: [
                    {
                        type: 'system',
                        description: '启用覆盖选项重新执行',
                        autoFix: true,
                        action: 'retry_with_overwrite',
                        priority: 1
                    },
                    {
                        type: 'manual',
                        description: '修改目标路径避免冲突',
                        priority: 2
                    }
                ],
                unknown: [
                    {
                        type: 'system',
                        description: '重新执行任务',
                        autoFix: true,
                        action: 'retry_task',
                        priority: 1
                    },
                    {
                        type: 'manual',
                        description: '查看详细日志分析问题',
                        priority: 2
                    },
                    {
                        type: 'manual',
                        description: '联系技术支持',
                        priority: 3
                    }
                ]
            };
            return solutions[diagnosis.category] || solutions.unknown;
        });
    }
    autoFix(taskId) {
        return __awaiter(this, void 0, void 0, function* () {
            const diagnosis = yield this.diagnoseTask(taskId);
            if (!diagnosis.success || !diagnosis.autoFixAvailable) {
                return {
                    success: false,
                    message: '此任务无法自动修复'
                };
            }
            const autoFixSolution = diagnosis.solutions.find(s => s.autoFix);
            if (!autoFixSolution) {
                return {
                    success: false,
                    message: '未找到可自动执行的修复方案'
                };
            }
            try {
                switch (autoFixSolution.action) {
                    case 'retry_task':
                        yield this.taskService.executeTask(taskId);
                        return {
                            success: true,
                            action: 'retry_task',
                            message: '任务已重新执行'
                        };
                    case 'delete_task':
                        yield this.taskService.deleteTask(taskId);
                        return {
                            success: true,
                            action: 'delete_task',
                            message: '失败任务已删除'
                        };
                    case 'retry_with_overwrite':
                        yield this.taskService.executeTask(taskId, { overwrite: true });
                        return {
                            success: true,
                            action: 'retry_with_overwrite',
                            message: '任务已重新执行（启用覆盖）'
                        };
                    default:
                        return {
                            success: false,
                            message: '未知的修复操作'
                        };
                }
            }
            catch (error) {
                console.error('自动修复失败:', error);
                return {
                    success: false,
                    action: autoFixSolution.action,
                    error: error.message
                };
            }
        });
    }
    batchDiagnose() {
        return __awaiter(this, arguments, void 0, function* (filter = {}) {
            const tasks = yield this.taskService.getTasks({
                where: Object.assign({ status: 'failed' }, filter)
            });
            const diagnoses = [];
            for (const task of tasks) {
                const diagnosis = yield this.diagnoseTask(task.id);
                diagnoses.push(diagnosis);
            }
            const summary = {
                total: diagnoses.length,
                byCategory: {},
                autoFixable: diagnoses.filter(d => d.autoFixAvailable).length
            };
            diagnoses.forEach(d => {
                if (d.diagnosis) {
                    const category = d.diagnosis.category;
                    summary.byCategory[category] = (summary.byCategory[category] || 0) + 1;
                }
            });
            return {
                success: true,
                diagnoses,
                summary
            };
        });
    }
}
module.exports = AIDiagnosticService;
