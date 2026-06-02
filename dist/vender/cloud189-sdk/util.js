"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncPool = exports.calculateFileAndChunkMD5 = exports.partSize = exports.randomString = exports.md5 = exports.hexToBase64 = exports.hmacSha1 = exports.aesECBEncrypt = exports.rsaEncrypt = exports.getSignature = exports.sortParameter = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const sortParameter = (data) => {
    if (!data) {
        return '';
    }
    const e = Object.entries(data).map((t) => t.join('='));
    e.sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
    return e.join('&');
};
exports.sortParameter = sortParameter;
const getSignature = (data) => {
    const parameter = (0, exports.sortParameter)(data);
    return crypto_1.default.createHash('md5').update(parameter).digest('hex');
};
exports.getSignature = getSignature;
const rsaEncrypt = (publicKey, origData, encoding = 'hex') => {
    const key = `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;
    const encryptedData = crypto_1.default.publicEncrypt({
        key,
        padding: crypto_1.default.constants.RSA_PKCS1_PADDING
    }, Buffer.from(origData));
    return encryptedData.toString(encoding);
};
exports.rsaEncrypt = rsaEncrypt;
const aesECBEncrypt = (data, key) => {
    const p = Object.entries(data)
        .map((t) => t.join('='))
        .join('&');
    const cipher = crypto_1.default.createCipheriv('aes-128-ecb', Buffer.from(key, 'utf8'), null);
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(p, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
};
exports.aesECBEncrypt = aesECBEncrypt;
const hmacSha1 = (data, key, encoding = 'hex') => {
    const p = Object.entries(data)
        .map((t) => t.join('='))
        .join('&');
    const hmac = crypto_1.default.createHmac('sha1', key);
    hmac.update(p);
    return hmac.digest(encoding);
};
exports.hmacSha1 = hmacSha1;
const hexToBase64 = (data) => {
    const buffer = Buffer.from(data, 'hex');
    return buffer.toString('base64');
};
exports.hexToBase64 = hexToBase64;
const md5 = (data) => {
    return crypto_1.default.createHash('md5').update(data).digest('hex');
};
exports.md5 = md5;
const randomString = (f) => {
    return f.replace(/[xy]/g, (e) => {
        var t = (16 * Math.random()) | 0, n = 'x' === e ? t : (3 & t) | 8;
        return n.toString(16);
    });
};
exports.randomString = randomString;
const partSize = (size) => {
    const DEFAULT = 1024 * 1024 * 10; // 10 MiB
    if (size > DEFAULT * 2 * 999) {
        const chunkSize = size / 1999;
        const ratio = chunkSize / DEFAULT;
        const multiplier = Math.max(Math.ceil(ratio), 5);
        return multiplier * DEFAULT;
    }
    if (size > DEFAULT * 999) {
        return DEFAULT * 2; // 20 MiB
    }
    return DEFAULT;
};
exports.partSize = partSize;
const calculateFileAndChunkMD5 = (filePath, chunkSize = 1024 * 1024) => {
    return new Promise((resolve, reject) => {
        const stream = fs_1.default.createReadStream(filePath, { highWaterMark: chunkSize });
        const fileHash = crypto_1.default.createHash('md5');
        const chunkMd5s = [];
        stream.on('data', (chunk) => {
            fileHash.update(chunk);
            const chunkHash = (0, exports.md5)(chunk);
            chunkMd5s.push(chunkHash.toUpperCase());
        });
        stream.on('end', () => {
            const fileMd5 = fileHash.digest('hex');
            stream.close();
            resolve({ fileMd5, chunkMd5s });
        });
        stream.on('error', (err) => {
            reject(err);
        });
    });
};
exports.calculateFileAndChunkMD5 = calculateFileAndChunkMD5;
const asyncPool = async (poolLimit, array, iteratorFn) => {
    const ret = []; // 存储所有异步任务
    const executing = []; // 存储正在执行的异步任务
    for (const item of array) {
        const p = Promise.resolve().then(() => iteratorFn(item, array));
        ret.push(p);
        if (poolLimit <= array.length) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= poolLimit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(ret);
};
exports.asyncPool = asyncPool;
