"use strict";
/**
 * TMDB 信息后台补全服务
 *
 * 功能：系统启动后异步补全缺失的 tmdbContent 字段
 * 设计：
 * - 延迟启动，避免影响系统初始化
 * - 并发控制，避免 TMDB API 限流
 * - 批次间隔，让出系统资源
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
const { getTaskRepository } = require('../database');
const { TMDBService } = require('./tmdb');
class TmdbBackfillService {
    constructor() {
        this.isRunning = false;
        this.config = {
            startupDelay: 30 * 1000, // 启动延迟 30 秒
            concurrency: 5, // 并发数 5
            batchInterval: 2 * 1000, // 批次间隔 2 秒
            maxPerRun: 100 // 单次最大处理 100 个
        };
    }
    /**
     * 启动后台补全服务
     */
    start() {
        if (this.isRunning)
            return;
        console.log('[TMDB补全] 服务已调度，将在 30 秒后开始...');
        setTimeout(() => {
            this.run();
        }, this.config.startupDelay);
    }
    /**
     * 执行补全任务
     */
    run() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isRunning)
                return { processed: 0, success: 0, failed: 0 };
            this.isRunning = true;
            try {
                const taskRepo = getTaskRepository();
                // 查询缺失 tmdbContent 但有 tmdbId 的任务（只选择需要的字段）
                const tasks = yield taskRepo
                    .createQueryBuilder('task')
                    .select(['task.id', 'task.tmdbId', 'task.videoType'])
                    .where('task.tmdbId IS NOT NULL')
                    .andWhere('task.tmdbContent IS NULL')
                    .getMany();
                if (tasks.length === 0) {
                    console.log('[TMDB补全] 没有需要补全的任务');
                    return;
                }
                // 按 tmdbId 去重（多个任务可能对应同一个 TMDB）
                const tmdbMap = new Map();
                for (const task of tasks) {
                    const key = `${task.tmdbId}_${task.videoType}`;
                    if (!tmdbMap.has(key)) {
                        tmdbMap.set(key, {
                            tmdbId: task.tmdbId,
                            videoType: task.videoType,
                            taskIds: []
                        });
                    }
                    tmdbMap.get(key).taskIds.push(task.id);
                }
                const uniqueTmdbs = Array.from(tmdbMap.values());
                const toProcess = uniqueTmdbs.slice(0, this.config.maxPerRun);
                console.log(`[TMDB补全] 发现 ${tasks.length} 个任务，${uniqueTmdbs.length} 个唯一 TMDB，将处理 ${toProcess.length} 个`);
                // 分批处理
                let processed = 0;
                let success = 0;
                let failed = 0;
                for (let i = 0; i < toProcess.length; i += this.config.concurrency) {
                    const batch = toProcess.slice(i, i + this.config.concurrency);
                    const results = yield Promise.allSettled(batch.map(item => this.fetchAndUpdateTmdb(item, taskRepo)));
                    for (const result of results) {
                        processed++;
                        if (result.status === 'fulfilled' && result.value) {
                            success++;
                        }
                        else {
                            failed++;
                        }
                    }
                    // 批次间隔
                    if (i + this.config.concurrency < toProcess.length) {
                        yield this.sleep(this.config.batchInterval);
                    }
                }
                console.log(`[TMDB补全] 完成！处理: ${processed}, 成功: ${success}, 失败: ${failed}`);
                return { processed, success, failed };
            }
            catch (error) {
                console.error('[TMDB补全] 执行失败:', error.message);
                return { processed: 0, success: 0, failed: 0, error: error.message };
            }
            finally {
                this.isRunning = false;
            }
        });
    }
    /**
     * 获取单个 TMDB 详情并更新相关任务
     */
    fetchAndUpdateTmdb(item, taskRepo) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const tmdbService = new TMDBService();
                const detail = item.videoType === 'movie'
                    ? yield tmdbService.getMovieDetails(item.tmdbId)
                    : yield tmdbService.getTVDetails(item.tmdbId);
                if (!detail) {
                    console.warn(`[TMDB补全] 未获取到详情: ${item.tmdbId}`);
                    return false;
                }
                // 更新所有关联任务
                const tmdbContentStr = JSON.stringify(detail);
                yield taskRepo
                    .createQueryBuilder()
                    .update('task')
                    .set({ tmdbContent: tmdbContentStr })
                    .where('tmdbId = :tmdbId AND tmdbContent IS NULL', { tmdbId: item.tmdbId })
                    .execute();
                console.log(`[TMDB补全] 已更新 ${item.taskIds.length} 个任务: ${detail.title}`);
                return true;
            }
            catch (error) {
                console.warn(`[TMDB补全] 获取失败 (${item.tmdbId}): ${error.message}`);
                return false;
            }
        });
    }
    /**
     * 手动触发补全（供 API 调用）
     */
    triggerManually() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isRunning) {
                return { success: false, message: '补全任务正在运行中' };
            }
            const result = yield this.run();
            return Object.assign({ success: true, message: `补全完成：处理 ${result.processed} 个，成功 ${result.success} 个，失败 ${result.failed} 个` }, result);
        });
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
// 单例
const tmdbBackfillService = new TmdbBackfillService();
module.exports = { TmdbBackfillService, tmdbBackfillService };
