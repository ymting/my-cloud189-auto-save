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
// 存储所有的 SSE 客户端
const clients = new Set();
const LOG_FILE = '/tmp/cloud189-app.log';
const MAX_LOG_SIZE = 1024 * 100; // 100kb
// 初始化 SSE
const initSSE = (app) => {
    app.get('/api/logs/events', (req, res) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        // 发送历史日志
        sendHistoryLogs(res);
        // 将客户端添加到集合中
        clients.add(res);
        // 客户端断开连接时清理
        req.on('close', () => {
            clients.delete(res);
        });
    });
};
// 发送历史日志
const sendHistoryLogs = (res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const stat = yield fs.stat(LOG_FILE);
        // 如果文件大于 1MB，只读取最后 1MB 的内容
        const start = stat.size > MAX_LOG_SIZE ? stat.size - MAX_LOG_SIZE : 0;
        const fileHandle = yield fs.open(LOG_FILE, 'r');
        const buffer = Buffer.alloc(stat.size - start);
        yield fileHandle.read(buffer, 0, buffer.length, start);
        yield fileHandle.close();
        const logs = buffer.toString('utf8');
        res.write(`data: ${JSON.stringify({ type: 'history', logs: logs.split('\n').filter(Boolean) })}\n\n`);
    }
    catch (error) {
        console.error('读取历史日志失败:', error);
    }
});
// 记录任务日志
const logTaskEvent = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (message = null) {
    if (!message) {
        return;
    }
    // 获取当前时间
    const currentTime = new Date();
    // 构建日志消息
    let logMessage = `[${currentTime.toLocaleString()}] ${message}`;
    console.log(logMessage);
    try {
        yield fs.appendFile(LOG_FILE, logMessage + '\n');
        // 自动控制磁盘日志文件体积，防止无限增长撑爆空间
        const stat = yield fs.stat(LOG_FILE);
        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 磁盘最大日志文件大小限制：5MB
        if (stat.size > MAX_FILE_SIZE) {
            const keepSize = 500 * 1024; // 超限时仅保留末尾 500KB 的日志
            const start = stat.size - keepSize;
            const fileHandle = yield fs.open(LOG_FILE, 'r');
            const buffer = Buffer.alloc(keepSize);
            yield fileHandle.read(buffer, 0, keepSize, start);
            yield fileHandle.close();
            // 剥离第一行可能被截断的不完整日志，保证日志文件格式整洁
            const rawLogs = buffer.toString('utf8');
            const firstNewlineIndex = rawLogs.indexOf('\n');
            const truncatedContent = firstNewlineIndex !== -1 ? rawLogs.substring(firstNewlineIndex + 1) : rawLogs;
            yield fs.writeFile(LOG_FILE, truncatedContent);
        }
        // 向所有连接的客户端发送日志
        clients.forEach(client => {
            client.write(`data: ${JSON.stringify({ type: 'log', message: logMessage })}\n\n`);
        });
    }
    catch (error) {
        console.error('写入日志失败:', error);
    }
});
// 添加发送AI消息的函数
const sendAIMessage = (message) => {
    clients.forEach(client => {
        client.write(`data: ${JSON.stringify({ type: 'aimessage', message })}\n\n`);
    });
};
module.exports = {
    logTaskEvent,
    initSSE,
    sendAIMessage
};
