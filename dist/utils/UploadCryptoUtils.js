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
/**
 * 天翼云盘上传 API 加密签名工具
 * 用于秒传等上传接口的请求签名
 * 包含: RSA 加密、AES-128-ECB 加密、HMAC-SHA1 签名
 *
 * 加密流程参考 OpenList-CAS 项目:
 *
 * 【个人接口】
 * 1. 生成随机字符串 l (16~32位), 取前16字节作为 AES 密钥
 * 2. AES-128-ECB 加密业务参数
 * 3. RSA 加密随机字符串 l
 * 4. HMAC-SHA1 签名: SessionKey=xxx&Operate=GET&RequestURI=xxx&Date=xxx&params=xxx
 *
 * 【家庭接口】（关键差异）
 * 1. 使用 familySessionSecret[:16] 作为 AES 密钥（固定密钥，非随机）
 * 2. AES-128-ECB 加密业务参数
 * 3. HMAC-SHA1 签名使用 familySessionSecret 作为密钥
 * 4. 请求头 SessionKey = familySessionKey（而非个人sessionKey）
 */
const crypto = require('crypto');
const UPLOAD_URL = 'https://upload.cloud.189.cn';
const WEB_URL = 'https://cloud.189.cn';
class UploadCryptoUtils {
    /**
     * 获取 RSA 公钥
     * @param {string} sessionKey - 会话密钥
     * @returns {Promise<{pubKey: string, pkId: string, expire: number}>}
     */
    static generateRsaKey(sessionKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const ts = Date.now().toString();
            const signParams = { AppKey: '600100422', Timestamp: ts };
            const paramStr = Object.entries(signParams)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([k, v]) => `${k}=${v}`)
                .join('&');
            const signature = crypto.createHash('md5').update(paramStr).digest('hex');
            const noCache = Math.random().toString();
            const url = `${WEB_URL}/api/security/generateRsaKey.action?sessionKey=${encodeURIComponent(sessionKey)}&noCache=${noCache}`;
            const got = require('got');
            const ProxyUtil = require('./ProxyUtil');
            const proxyUrl = ProxyUtil.getProxy('cloud189');
            const options = {
                headers: {
                    'Sign-Type': '1',
                    'Signature': signature,
                    'Timestamp': ts,
                    'AppKey': '600100422',
                    'SessionKey': sessionKey,
                    'Accept': 'application/json;charset=UTF-8'
                }
            };
            if (proxyUrl) {
                const { HttpsProxyAgent } = require('https-proxy-agent');
                options.agent = { https: new HttpsProxyAgent(proxyUrl) };
            }
            const resp = yield got(url, options).json();
            if (resp.errorCode) {
                throw new Error(resp.errorMsg || resp.errorCode);
            }
            if (!resp.pubKey) {
                throw new Error('RSA 密钥无效');
            }
            return {
                pubKey: resp.pubKey,
                pkId: resp.pkId,
                expire: resp.expire || (Date.now() + 300000),
                ver: resp.ver
            };
        });
    }
    /**
     * RSA 加密（返回 Base64 字符串）
     */
    static rsaEncrypt(publicKey, data) {
        const formattedKey = UploadCryptoUtils._formatPublicKey(publicKey);
        const encrypted = crypto.publicEncrypt({
            key: formattedKey,
            padding: crypto.constants.RSA_PKCS1_PADDING
        }, Buffer.from(data, 'utf-8'));
        return encrypted.toString('base64');
    }
    /**
     * AES-128-ECB 加密（返回大写十六进制字符串）
     * 密钥取 key 的前 16 字节（128位），与 OpenList-CAS 一致
     * @param {object|string} data - 待加密的参数对象或已编码的字符串
     * @param {string} key - 加密密钥（取前16字节）
     * @returns {string} 大写十六进制加密结果
     */
    static aesEncrypt(data, key) {
        // 将参数对象编码为 URL 查询字符串
        const params = typeof data === 'string'
            ? data
            : Object.entries(data)
                .map(([k, v]) => `${k}=${v}`)
                .join('&');
        // 取 key 前16字节作为 AES-128 密钥
        const aesKey = Buffer.from(key.substring(0, 16), 'utf-8');
        const cipher = crypto.createCipheriv('aes-128-ecb', aesKey, null);
        let encrypted = cipher.update(params, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted.toUpperCase();
    }
    /**
     * HMAC-SHA1 签名（返回大写十六进制字符串）
     * 签名原文格式: SessionKey=xxx&Operate=GET&RequestURI=xxx&Date=xxx&params=xxx
     * 与 OpenList-CAS 实现一致
     * @param {string} signText - 签名原文
     * @param {string} key - HMAC 密钥
     * @returns {string} 大写十六进制签名
     */
    static hmacSha1(signText, key) {
        const hmac = crypto.createHmac('sha1', key);
        hmac.update(signText);
        return hmac.digest('hex').toUpperCase();
    }
    /**
     * 构建上传请求（签名 + 加密）
     * 完整流程:
     * 1. 生成随机字符串 l (16~32位)
     * 2. AES-128-ECB 加密参数 → hex 大写
     * 3. RSA 加密随机字符串 l → base64
     * 4. HMAC-SHA1 签名: SessionKey=xxx&Operate=GET&RequestURI=xxx&Date=xxx&params=加密后参数
     * 5. 密钥: 随机字符串 l
     *
     * @param {object} params - 请求参数对象
     * @param {string} requestUri - 请求路径 (如 /person/initMultiUpload)
     * @param {object} rsaKey - RSA 密钥信息 { pubKey, pkId }
     * @param {string} sessionKey - 会话密钥
     * @param {string} method - HTTP 方法
     * @returns {object} { url, headers }
     */
    static buildUploadRequest(params, requestUri, rsaKey, sessionKey, method = 'GET') {
        // 生成随机字符串 l，长度 16~32 位（与 OpenList-CAS 一致）
        const l = UploadCryptoUtils._randomString(16 + Math.floor(Math.random() * 17));
        const ts = Date.now().toString();
        const uuid = UploadCryptoUtils._randomUUID();
        // AES 加密参数
        const encryptedParams = UploadCryptoUtils.aesEncrypt(params, l);
        // RSA 加密随机字符串 l
        const encryptionText = UploadCryptoUtils.rsaEncrypt(rsaKey.pubKey, l);
        // HMAC-SHA1 签名（固定格式拼接，与 OpenList-CAS 一致）
        const signText = `SessionKey=${sessionKey}&Operate=${method}&RequestURI=${requestUri}&Date=${ts}&params=${encryptedParams}`;
        const signature = UploadCryptoUtils.hmacSha1(signText, l);
        return {
            url: `${UPLOAD_URL}${requestUri}?params=${encryptedParams}`,
            headers: {
                'Accept': 'application/json;charset=UTF-8',
                'SessionKey': sessionKey,
                'Signature': signature,
                'X-Request-Date': ts,
                'X-Request-ID': uuid,
                'EncryptionText': encryptionText,
                'PkId': rsaKey.pkId,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
            }
        };
    }
    /**
     * 构建家庭接口上传请求（签名 + 加密）
     * 关键差异：使用 familySessionSecret 作为固定密钥，而非随机密钥
     *
     * 实现参考 OpenList-CAS:
     * 1. AES-128-ECB 加密参数，密钥 = familySessionSecret[:16]
     * 2. HMAC-SHA1 签名，密钥 = familySessionSecret（完整）
     * 3. 请求头 SessionKey = familySessionKey
     * 4. 无需 RSA 加密（家庭接口不使用 RSA）
     *
     * @param {object} params - 请求参数对象
     * @param {string} requestUri - 请求路径 (如 /family/initMultiUpload)
     * @param {string} familySessionKey - 家庭会话密钥
     * @param {string} familySessionSecret - 家庭会话密钥（用于加密和签名）
     * @param {string} method - HTTP 方法
     * @returns {object} { url, headers }
     */
    static buildFamilyUploadRequest(params, requestUri, familySessionKey, familySessionSecret, method = 'GET') {
        const ts = Date.now().toString();
        const uuid = UploadCryptoUtils._randomUUID();
        // AES 加密参数（密钥 = familySessionSecret 前16字节）
        const encryptedParams = UploadCryptoUtils.aesEncrypt(params, familySessionSecret);
        // HMAC-SHA1 签名（密钥 = familySessionSecret 完整字符串）
        // 签名原文格式与个人接口相同
        const signText = `SessionKey=${familySessionKey}&Operate=${method}&RequestURI=${requestUri}&Date=${ts}&params=${encryptedParams}`;
        const signature = UploadCryptoUtils.hmacSha1(signText, familySessionSecret);
        return {
            url: `${UPLOAD_URL}${requestUri}?params=${encryptedParams}`,
            headers: {
                'Accept': 'application/json;charset=UTF-8',
                'SessionKey': familySessionKey,
                'Signature': signature,
                'Date': ts,
                'X-Request-ID': uuid,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
            }
        };
    }
    static _formatPublicKey(publicKey) {
        let pem = publicKey;
        if (!pem.includes('-----BEGIN PUBLIC KEY-----')) {
            pem = `-----BEGIN PUBLIC KEY-----\n${pem}\n-----END PUBLIC KEY-----`;
        }
        return pem;
    }
    static _randomString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    static _randomUUID() {
        return crypto.randomUUID();
    }
}
module.exports = UploadCryptoUtils;
