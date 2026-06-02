"use strict";
// 缓存管理类
class CacheManager {
    constructor(ttl = 600) {
        this.cache = new Map();
        this.ttl = ttl * 1000; // 转换为毫秒
        // 定期清理过期缓存
        // setInterval(() => this.cleanup(), this.ttl); // 每2分钟清理一次
    }
    set(key, value) {
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }
    get(key) {
        const data = this.cache.get(key);
        if (!data)
            return null;
        // if (Date.now() - data.timestamp > this.ttl) {
        //     this.cache.delete(key);
        //     return null;
        // }
        return data.value;
    }
    has(key) {
        return this.get(key) !== null;
    }
    cleanup() {
        const now = Date.now();
        for (const [key, data] of this.cache.entries()) {
            if (now - data.timestamp > this.ttl) {
                this.cache.delete(key);
            }
        }
    }
    clearPrefix(prefix) {
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
            }
        }
    }
}
module.exports = { CacheManager };
