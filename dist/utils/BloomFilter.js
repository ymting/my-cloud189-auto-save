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
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
class BloomFilter {
    constructor(size = 10000, hashFunctions = 3) {
        this.size = size;
        this.hashFunctions = hashFunctions;
        this.bitArray = new Array(size).fill(false);
    }
    // 生成多个哈希值
    _getHashValues(md5) {
        const hashValues = [];
        for (let i = 0; i < this.hashFunctions; i++) {
            const hash = crypto
                .createHash('sha256')
                .update(md5 + i.toString())
                .digest('hex');
            // 将哈希值转换为数组索引
            const index = parseInt(hash.substring(0, 8), 16) % this.size;
            hashValues.push(index);
        }
        return hashValues;
    }
    // 添加一个MD5到过滤器
    add(md5) {
        const hashValues = this._getHashValues(md5);
        for (const index of hashValues) {
            this.bitArray[index] = true;
        }
    }
    // 检查MD5是否可能存在
    exists(md5) {
        const hashValues = this._getHashValues(md5);
        return hashValues.every(index => this.bitArray[index]);
    }
    // 清空过滤器
    clear() {
        this.bitArray.fill(false);
    }
    // 获取当前过滤器的使用率
    getUsageRate() {
        const usedBits = this.bitArray.filter(bit => bit).length;
        return (usedBits / this.size * 100).toFixed(2) + '%';
    }
    // 将过滤器状态导出为字符串
    export() {
        return JSON.stringify({
            size: this.size,
            hashFunctions: this.hashFunctions,
            bitArray: this.bitArray
        });
    }
    // 从字符串导入过滤器状态
    import(data) {
        const state = JSON.parse(data);
        this.size = state.size;
        this.hashFunctions = state.hashFunctions;
        this.bitArray = state.bitArray;
    }
}
// 创建单例实例
let instance = null;
class HarmonizedFilter {
    constructor() {
        if (!instance) {
            this.filter = new BloomFilter();
            this.filePath = path.join(process.cwd(), 'data', 'harmonized_md5.txt');
            this.loadFromFile();
            instance = this;
        }
        return instance;
    }
    // 从文件加载MD5列表
    loadFromFile() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const content = yield fs.readFile(this.filePath, 'utf-8');
                const md5List = content.split('\n').filter(line => line.trim());
                this.addHarmonizedList(md5List);
                console.log(`已从文件加载 ${md5List.length} 个和谐记录`);
            }
            catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error('加载和谐文件失败:', error);
                }
            }
        });
    }
    // 添加MD5到文件
    appendToFile(md5) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield fs.appendFile(this.filePath, md5 + '\n');
            }
            catch (error) {
                console.error('写入和谐MD5到文件失败:', error);
            }
        });
    }
    // 添加被和谐的资源MD5
    addHarmonized(md5) {
        this.filter.add(md5);
        s.appendToFile(md5).catch(error => {
            console.error('写入和谐MD5到文件失败:', error);
        });
    }
    // 批量添加被和谐的资源MD5
    addHarmonizedList(md5List) {
        for (const md5 of md5List) {
            this.filter.add(md5);
        }
        fs.writeFile(this.filePath, md5List.join('\n') + '\n')
            .catch(error => {
            console.error('批量写入和谐MD5到文件失败:', error);
        });
    }
    // 检查资源是否被和谐
    isHarmonized(md5) {
        return this.filter.exists(md5);
    }
    // 导出过滤器状态
    exportFilter() {
        return this.filter.export();
    }
    // 导入过滤器状态
    importFilter(data) {
        this.filter.import(data);
    }
    // 清空过滤器
    clearFilter() {
        this.filter.clear();
    }
    // 获取使用率
    getUsageRate() {
        return this.filter.getUsageRate();
    }
}
module.exports = new HarmonizedFilter();
