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
const fs = require('fs').promises;
const path = require('path');
class TaskCacheManager {
    constructor() {
        this.cacheDir = path.join(__dirname, '../../data/task_caches');
        this.init();
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield fs.mkdir(this.cacheDir, { recursive: true });
            }
            catch (error) {
                console.error('Failed to create task cache directory:', error);
            }
        });
    }
    getCacheFilePath(taskId) {
        return path.join(this.cacheDir, `${taskId}.json`);
    }
    getCache(taskId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const data = yield fs.readFile(this.getCacheFilePath(taskId), 'utf-8');
                const arr = JSON.parse(data);
                return new Set(arr);
            }
            catch (error) {
                return new Set();
            }
        });
    }
    addCache(taskId, fileIds) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!fileIds || fileIds.length === 0)
                return;
            try {
                const cache = yield this.getCache(taskId);
                let changed = false;
                for (const id of fileIds) {
                    const strId = String(id);
                    if (!cache.has(strId)) {
                        cache.add(strId);
                        changed = true;
                    }
                }
                if (changed) {
                    yield fs.writeFile(this.getCacheFilePath(taskId), JSON.stringify(Array.from(cache)));
                }
            }
            catch (error) {
                console.error(`Failed to add cache for task ${taskId}:`, error);
            }
        });
    }
    clearCache(taskId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield fs.unlink(this.getCacheFilePath(taskId));
            }
            catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error(`Failed to clear cache for task ${taskId}:`, error);
                }
            }
        });
    }
}
module.exports = new TaskCacheManager();
