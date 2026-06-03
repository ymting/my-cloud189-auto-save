"use strict";
const ConfigService = require('./ConfigService');
const { logTaskEvent } = require('../utils/logUtils');
const INTENT_TYPES = {
    QUERY: {
        LIST_TASKS: 'list_tasks',
        GET_TASK_DETAIL: 'get_task_detail',
        GET_SYSTEM_STATUS: 'get_system_status',
        GET_LOGS: 'get_logs',
        SEARCH_TASKS: 'search_tasks'
    },
    EXECUTE: {
        RUN_TASK: 'run_task',
        BATCH_RUN: 'batch_run',
        PAUSE_TASK: 'pause_task',
        RESUME_TASK: 'resume_task'
    },
    MANAGE: {
        CREATE_TASK: 'create_task',
        DELETE_TASK: 'delete_task',
        BATCH_DELETE: 'batch_delete',
        UPDATE_TASK: 'update_task',
        UPDATE_CONFIG: 'update_config'
    },
    INTELLIGENT: {
        SMART_CREATE: 'smart_create',
        FIX_FAILED: 'fix_failed',
        SUGGEST_ACTIONS: 'suggest_actions'
    }
};
const SECURITY_LEVELS = {
    SAFE: {
        level: 1,
        autoExecute: true,
        requireConfirm: false,
        examples: ['查询任务', '创建任务', '修改任务', '执行任务', '查看日志', '查看状态']
    },
    MODERATE: {
        level: 2,
        autoExecute: false,
        requireConfirm: true,
        confirmMessage: '此操作将修改数据，是否继续？',
        examples: ['批量执行', '批量暂停', '修改非关键配置']
    },
    DANGEROUS: {
        level: 3,
        autoExecute: false,
        requireConfirm: true,
        requirePassword: false,
        confirmMessage: '⚠️ 此操作不可逆，请确认！',
        examples: ['删除任务', '批量删除', '修改关键配置']
    }
};
const OPERATION_SECURITY = {
    'list_tasks': SECURITY_LEVELS.SAFE,
    'get_task_detail': SECURITY_LEVELS.SAFE,
    'get_system_status': SECURITY_LEVELS.SAFE,
    'get_logs': SECURITY_LEVELS.SAFE,
    'search_tasks': SECURITY_LEVELS.SAFE,
    'run_task': SECURITY_LEVELS.SAFE,
    'create_task': SECURITY_LEVELS.SAFE,
    'update_task': SECURITY_LEVELS.SAFE,
    'smart_create': SECURITY_LEVELS.SAFE,
    'batch_run': SECURITY_LEVELS.MODERATE,
    'pause_task': SECURITY_LEVELS.SAFE,
    'resume_task': SECURITY_LEVELS.SAFE,
    'delete_task': SECURITY_LEVELS.DANGEROUS,
    'batch_delete': SECURITY_LEVELS.DANGEROUS,
    'update_config': SECURITY_LEVELS.DANGEROUS,
    'fix_failed': SECURITY_LEVELS.MODERATE,
    'diagnose_task': SECURITY_LEVELS.SAFE,
    'auto_fix': SECURITY_LEVELS.MODERATE,
    'batch_diagnose': SECURITY_LEVELS.SAFE,
    'get_recommendations': SECURITY_LEVELS.SAFE
};
const AI_FUNCTIONS = [
    {
        name: 'list_tasks',
        description: '查询任务列表，支持按状态、名称过滤',
        parameters: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    enum: ['all', 'active', 'completed', 'failed', 'pending'],
                    description: '任务状态过滤'
                },
                search: {
                    type: 'string',
                    description: '任务名称搜索关键词'
                },
                limit: {
                    type: 'number',
                    description: '返回数量限制，默认20'
                }
            }
        }
    },
    {
        name: 'get_task_detail',
        description: '查询单个任务的详细信息',
        parameters: {
            type: 'object',
            properties: {
                taskId: {
                    type: 'number',
                    description: '任务ID'
                }
            },
            required: ['taskId']
        }
    },
    {
        name: 'create_task',
        description: '创建新的转存任务',
        parameters: {
            type: 'object',
            properties: {
                shareLink: {
                    type: 'string',
                    description: '分享链接'
                },
                sharePassword: {
                    type: 'string',
                    description: '分享密码（可选）'
                },
                targetFolder: {
                    type: 'string',
                    description: '目标文件夹路径'
                },
                accountId: {
                    type: 'number',
                    description: '账号ID'
                }
            },
            required: ['shareLink', 'targetFolder', 'accountId']
        }
    },
    {
        name: 'smart_create',
        description: '智能识别分享链接并创建任务（用户发送分享链接时自动触发）',
        parameters: {
            type: 'object',
            properties: {
                shareLink: {
                    type: 'string',
                    description: '分享链接URL'
                }
            },
            required: ['shareLink']
        }
    },
    {
        name: 'run_task',
        description: '执行指定的任务',
        parameters: {
            type: 'object',
            properties: {
                taskId: {
                    type: 'number',
                    description: '任务ID'
                }
            },
            required: ['taskId']
        }
    },
    {
        name: 'delete_task',
        description: '删除任务（需要用户确认）',
        parameters: {
            type: 'object',
            properties: {
                taskId: {
                    type: 'number',
                    description: '任务ID'
                },
                deleteCloud: {
                    type: 'boolean',
                    description: '是否同时删除云盘文件'
                }
            },
            required: ['taskId']
        }
    },
    {
        name: 'batch_operation',
        description: '批量操作任务（需要用户确认）',
        parameters: {
            type: 'object',
            properties: {
                operation: {
                    type: 'string',
                    enum: ['execute', 'delete', 'pause', 'resume']
                },
                filter: {
                    type: 'object',
                    properties: {
                        status: { type: 'string' },
                        ids: { type: 'array', items: { type: 'number' } }
                    }
                }
            },
            required: ['operation', 'filter']
        }
    },
    {
        name: 'get_system_status',
        description: '获取系统运行状态和资源占用',
        parameters: { type: 'object', properties: {} }
    },
    {
        name: 'update_task',
        description: '修改任务配置',
        parameters: {
            type: 'object',
            properties: {
                taskId: {
                    type: 'number',
                    description: '任务ID'
                },
                updates: {
                    type: 'object',
                    description: '要更新的字段'
                }
            },
            required: ['taskId', 'updates']
        }
    },
    {
        name: 'diagnose_task',
        description: '诊断失败任务的原因并提供解决方案',
        parameters: {
            type: 'object',
            properties: {
                taskId: {
                    type: 'number',
                    description: '任务ID'
                }
            },
            required: ['taskId']
        }
    },
    {
        name: 'auto_fix',
        description: '自动修复失败任务',
        parameters: {
            type: 'object',
            properties: {
                taskId: {
                    type: 'number',
                    description: '任务ID'
                }
            },
            required: ['taskId']
        }
    },
    {
        name: 'batch_diagnose',
        description: '批量诊断所有失败任务',
        parameters: {
            type: 'object',
            properties: {
                filter: {
                    type: 'object',
                    description: '过滤条件'
                }
            }
        }
    },
    {
        name: 'get_recommendations',
        description: '获取系统优化建议和操作推荐',
        parameters: {
            type: 'object',
            properties: {}
        }
    }
];
class AIIntentService {
    constructor() {
        this.functions = AI_FUNCTIONS;
    }
    getSecurityLevel(operationName) {
        return OPERATION_SECURITY[operationName] || SECURITY_LEVELS.SAFE;
    }
    isOperationSafe(operationName) {
        const level = this.getSecurityLevel(operationName);
        return level.autoExecute;
    }
    requiresConfirmation(operationName) {
        const level = this.getSecurityLevel(operationName);
        return level.requireConfirm;
    }
    buildFunctionCallingConfig() {
        return {
            tools: this.functions.map(fn => ({
                type: 'function',
                function: fn
            })),
            tool_choice: 'auto'
        };
    }
    detectShareLink(message) {
        const shareLinkPattern = /https?:\/\/cloud\.189\.cn\/t\/[\w]+/gi;
        const match = message.match(shareLinkPattern);
        return match ? match[0] : null;
    }
    buildConfirmDialog(operation, params, impact = {}) {
        const securityLevel = this.getSecurityLevel(operation);
        return {
            type: 'confirmation_required',
            dialog: {
                title: this._getDialogTitle(operation),
                message: securityLevel.confirmMessage || '是否执行此操作？',
                operation: {
                    name: operation,
                    params: params
                },
                impact: impact,
                securityLevel: securityLevel.level
            }
        };
    }
    _getDialogTitle(operation) {
        const titles = {
            'delete_task': '删除任务确认',
            'batch_delete': '批量删除确认',
            'batch_operation': '批量操作确认',
            'update_config': '修改配置确认'
        };
        return titles[operation] || '操作确认';
    }
    formatSuccessMessage(operation, result) {
        var _a;
        const messages = {
            'list_tasks': `查询到 ${result.total || ((_a = result.tasks) === null || _a === void 0 ? void 0 : _a.length) || 0} 个任务`,
            'get_task_detail': `任务详情：${result.taskName || result.id}`,
            'create_task': `✅ 任务创建成功！任务ID: ${result.taskId}`,
            'smart_create': `检测到分享链接，已为您准备创建任务`,
            'run_task': `✅ 任务 ${result.taskId} 已开始执行`,
            'delete_task': `✅ 任务 ${result.taskId} 已删除`,
            'update_task': `✅ 任务 ${result.taskId} 已更新`,
            'get_system_status': `系统状态获取成功`
        };
        return messages[operation] || '操作执行成功';
    }
}
module.exports = {
    AIIntentService,
    INTENT_TYPES,
    SECURITY_LEVELS,
    OPERATION_SECURITY,
    AI_FUNCTIONS
};
