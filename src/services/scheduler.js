const cron = require('node-cron');
const ConfigService = require('./ConfigService');
const { logTaskEvent } = require('../utils/logUtils');
const { MessageUtil } = require('./message');

class SchedulerService {
    static taskJobs = new Map();
    static messageUtil = new MessageUtil();

    static async initTaskJobs(taskRepo, taskService) {
        // 初始化所有启用定时任务的任务
        const tasks = await taskRepo.find({ where: { enableCron: true } });
        tasks.forEach(task => {
            this.saveTaskJob(task, taskService);
        });

        logTaskEvent("初始化系统定时任务...")
        // 初始化系统定时任务
        // 1. 默认定时任务检查 默认19-23点执行一次
        let taskCheckCrons = ConfigService.getConfigValue('task.taskCheckCron')
        if (taskCheckCrons) {
            // 根据|分割
            taskCheckCrons = taskCheckCrons.split('|');
            // 遍历每个cron表达式
            taskCheckCrons.forEach((cronExpression, index) => {
                this.saveDefaultTaskJob(`任务定时检查-${index}`, cronExpression, async () => {
                    taskService.processAllTasks();
                });
            });
        }
        
        // 2. 重试任务检查 默认每分钟执行一次
        this.saveDefaultTaskJob('重试任务检查', '*/1 * * * *', async () => {
            await taskService.processRetryTasks();
        });
        // 3. 清空回收站 默认每8小时执行一次
        const enableAutoClearRecycle = ConfigService.getConfigValue('task.enableAutoClearRecycle');
        const enableAutoClearFamilyRecycle = ConfigService.getConfigValue('task.enableAutoClearFamilyRecycle');
        if (enableAutoClearRecycle || enableAutoClearFamilyRecycle) {
            this.saveDefaultTaskJob('自动清空回收站',  ConfigService.getConfigValue('task.cleanRecycleCron'), async () => {
                await taskService.clearRecycleBin(enableAutoClearRecycle, enableAutoClearFamilyRecycle);
            })   
        }

        // 4. TV 剧集每日总集数刷新（自动跟踪连载剧集数变动，集数满足时自动完结）
        this.saveDefaultTaskJob('TV剧集总集数刷新', '0 2 * * *', async () => {
            const tasks = await taskRepo.find({ where: { videoType: 'tv' } });
            const { TMDBService } = require('./tmdb');
            const tmdbService = new TMDBService();
            for (const task of tasks) {
                if (task.status === 'completed' || !task.tmdbId) continue;
                try {
                    const detail = await tmdbService.getTVDetails(task.tmdbId);
                    if (!detail?.seasons) continue;
                    const seasonNum = (() => {
                        const n = task.shareFolderName || task.resourceName || '';
                        const m = n.match(/(?:Season|S|第)\s*(\d+)/i);
                        return m ? parseInt(m[1]) : detail.lastEpisodeToAir?.season_number || null;
                    })() || Math.max(...detail.seasons.filter(s => s.season_number > 0).map(s => s.season_number), 0);
                    const seasonData = detail.seasons.find(s => s.season_number === seasonNum);
                    if (seasonData?.episode_count && seasonData.episode_count !== task.totalEpisodes) {
                        task.totalEpisodes = seasonData.episode_count;
                        await taskRepo.save(task);
                        logTaskEvent(`[TV更新] ${task.resourceName} 总集数更新: ${seasonData.episode_count}`);
                    }
                    if (task.totalEpisodes && task.currentEpisodes >= task.totalEpisodes) {
                        task.status = 'completed';
                        await taskRepo.save(task);
                        logTaskEvent(`[TV完结] ${task.resourceName} 已完结（${task.currentEpisodes}/${task.totalEpisodes}）`);
                    }
                } catch (e) {
                    logTaskEvent(`[TV更新] ${task.resourceName} 失败: ${e.message}`);
                }
            }
        });
    }

    static saveTaskJob(task, taskService) {
        if (this.taskJobs.has(task.id)) {
            this.taskJobs.get(task.id).stop();
        }
        const taskName = task.shareFolderName?(task.resourceName + '/' + task.shareFolderName): task.resourceName || '未知'
        // 校验表达式是否有效
        if (!cron.validate(task.cronExpression)) {
            logTaskEvent(`定时任务[${taskName}]表达式无效，跳过...`);
            return;
        }
        if (task.enableCron && task.cronExpression) {
            logTaskEvent(`创建定时任务 ${taskName}, 表达式: ${task.cronExpression}`)
            const job = cron.schedule(task.cronExpression, async () => {
                logTaskEvent(`================================`);
                logTaskEvent(`任务[${taskName}]自定义定时检查...`);
                // 重新获取最新的任务信息
                const latestTask = await taskService.getTaskById(task.id);
                if (!latestTask) {
                    logTaskEvent(`任务[${taskName}]已被删除，跳过执行`);
                    this.removeTaskJob(task.id);
                    return;
                }
                // 检查 processing 状态超时（5分钟），防止异常退出后任务卡住
                if (latestTask.status === 'processing') {
                    const processingStartTime = latestTask.processingStartTime ? new Date(latestTask.processingStartTime) : null;
                    const now = new Date();
                    const fiveMinutes = 5 * 60 * 1000;
                    // 如果 processingStartTime 为 NULL（旧数据或异常退出），强制恢复
                    if (!processingStartTime || (now.getTime() - processingStartTime.getTime() > fiveMinutes)) {
                        logTaskEvent(`任务[${taskName}] processing 状态超时或数据异常，自动恢复为 pending`);
                        latestTask.status = 'pending';
                        latestTask.processingStartTime = null;
                        await taskService.taskRepo.save(latestTask);
                    } else {
                        logTaskEvent(`任务[${taskName}]正在执行中，跳过本次定时触发`);
                        logTaskEvent(`================================`);
                        return;
                    }
                }
                const result = await taskService.processTask(latestTask);
                if (result) {
                    this.messageUtil.sendMessage(result)
                }
                logTaskEvent(`================================`);
            });
            this.taskJobs.set(task.id, job);
            logTaskEvent(`定时任务 ${taskName}, 表达式: ${task.cronExpression} 已设置`)
        }
    }

    // 内置定时任务
    static saveDefaultTaskJob(name, cronExpression, task) {
        if (this.taskJobs.has(name)) {
            this.taskJobs.get(name).stop();
        }
        // 校验表达式是否有效
        if (!cron.validate(cronExpression)) {
            logTaskEvent(`定时任务[${name}]表达式无效，跳过...`);
            return;
        }
        const job = cron.schedule(cronExpression, task);
        this.taskJobs.set(name, job);
        logTaskEvent(`定时任务 ${name}, 表达式: ${cronExpression} 已设置`)
        return job;
    }

    static removeTaskJob(taskId) {
        if (this.taskJobs.has(taskId)) {
            this.taskJobs.get(taskId).stop();
            this.taskJobs.delete(taskId);
            logTaskEvent(`定时任务[${taskId}]已移除`);
        }
    }

    // 处理默认定时任务配置
    static handleScheduleTasks(settings,taskService) {
        // 如果定时任务和清空回收站任务与配置文件不一致, 则修改定时任务
        if (settings.task.taskCheckCron && settings.task.taskCheckCron != ConfigService.getConfigValue('task.taskCheckCron')) {
            let taskCheckCrons = settings.task.taskCheckCron.split('|');
            // 遍历每个cron表达式
            taskCheckCrons.forEach((cronExpression, index) => {
                this.saveDefaultTaskJob(`任务定时检查-${index}`, cronExpression, async () => {
                    taskService.processAllTasks();
                });
            });
        }
        // 处理定时任务配置
        const handleScheduleTask = (currentEnabled, newEnabled, currentCron, newCron, jobName, taskFn) => {
            if (!currentEnabled && newEnabled && newCron) {
                // 情况1: 当前未开启 -> 开启
                this.saveDefaultTaskJob(jobName, newCron, taskFn);
            } else if (currentEnabled && newEnabled && currentCron !== newCron) {
                // 情况2: 当前开启 -> 开启，但cron不同
                this.saveDefaultTaskJob(jobName, newCron, taskFn);
            } else if (!newEnabled) {
                // 情况3: 提交为关闭
                this.removeTaskJob(jobName);
            }
        };
        const currentCron = ConfigService.getConfigValue('task.cleanRecycleCron');
        const enableAutoClearRecycle = settings.task.enableAutoClearRecycle
        const enableAutoClearFamilyRecycle = settings.task.enableAutoClearFamilyRecycle
        // 处理普通回收站任务
        handleScheduleTask(
            ConfigService.getConfigValue('task.enableAutoClearRecycle'),
            enableAutoClearRecycle || enableAutoClearFamilyRecycle,
            currentCron,
            settings.task.cleanRecycleCron,
            '自动清空回收站',
            async () => taskService.clearRecycleBin(enableAutoClearRecycle, enableAutoClearFamilyRecycle)
        );
        return true;
    }
}

module.exports = { SchedulerService };
