"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _CloudAuthClient_builLoginForm;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudAuthClient = void 0;
const got_1 = __importDefault(require("got"));
const log_1 = require("./log");
const const_1 = require("./const");
const types_1 = require("./types");
const util_1 = require("./util");
const hook_1 = require("./hook");
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const dnsLookupIpVersion = process.env.DNS_LOOKUP_IP_VERSION === 'ipv4' ? 'ipv4' :
    process.env.DNS_LOOKUP_IP_VERSION === 'ipv6' ? 'ipv6' :
        'auto';
/**
 * @public
 */
class CloudAuthClient {
    constructor() {
        this.proxyUrl = null;
        _CloudAuthClient_builLoginForm.set(this, (encrypt, appConf, username, password) => {
            const usernameEncrypt = (0, util_1.rsaEncrypt)(encrypt.pubKey, username);
            const passwordEncrypt = (0, util_1.rsaEncrypt)(encrypt.pubKey, password);
            const data = {
                appKey: const_1.AppID,
                accountType: const_1.AccountType,
                // mailSuffix: '@189.cn',
                validateCode: '',
                captchaToken: appConf.captchaToken,
                dynamicCheck: 'FALSE',
                clientType: '1',
                cb_SaveName: '3',
                isOauth2: false,
                returnUrl: const_1.ReturnURL,
                paramId: appConf.paramId,
                userName: `${encrypt.pre}${usernameEncrypt}`,
                password: `${encrypt.pre}${passwordEncrypt}`
            };
            return data;
        });
        this.authRequest = got_1.default.extend({
            headers: {
                'User-Agent': const_1.UserAgent,
                Accept: 'application/json;charset=UTF-8',
                'Referer': const_1.WEB_URL
            },
            timeout: {
                request: 10000 // 设置10秒超时
            },
            dnsLookupIpVersion: dnsLookupIpVersion,
            hooks: {
                beforeRequest: [
                    async (options) => {
                        if (this.proxyUrl) {
                            options.agent = {
                                http: new HttpProxyAgent(this.proxyUrl),
                                https: new HttpsProxyAgent(this.proxyUrl)
                            };
                        }
                    }
                ],
                afterResponse: [hook_1.logHook, hook_1.checkErrorHook]
            }
        });
    }
    setProxy(proxyUrl) {
        this.proxyUrl = proxyUrl;
    }
    /**
     * 获取加密参数
     * @returns
     */
    getEncrypt() {
        return this.authRequest.post(`${const_1.AUTH_URL}/api/logbox/config/encryptConf.do`).json();
    }
    async getLoginForm() {
        const res = await this.authRequest
            .get(`${const_1.WEB_URL}/api/portal/unifyLoginForPC.action`, {
            searchParams: {
                appId: const_1.AppID,
                clientType: const_1.ClientType,
                returnURL: const_1.ReturnURL,
                timeStamp: Date.now()
            }
        })
            .text();
        if (res) {
            const captchaToken = res.match(`'captchaToken' value='(.+?)'`)[1];
            const lt = res.match(`lt = "(.+?)"`)[1];
            const paramId = res.match(`paramId = "(.+?)"`)[1];
            const reqId = res.match(`reqId = "(.+?)"`)[1];
            return { captchaToken, lt, paramId, reqId };
        }
        return null;
    }
    async getSessionForPC(param) {
        const params = Object.assign(Object.assign({ appId: const_1.AppID }, (0, const_1.clientSuffix)()), param);
        const res = await this.authRequest
            .post(`${const_1.API_URL}/getSessionForPC.action`, {
            searchParams: params
        })
            .json();
        return res;
    }
    /**
     * 用户名密码登录
     * */
    async loginByPassword(username, password) {
        log_1.logger.debug('loginByPassword...');
        try {
            const res = await Promise.all([
                //1.获取公钥
                this.getEncrypt(),
                //2.获取登录参数
                this.getLoginForm()
            ]);
            const encrypt = res[0].data;
            const appConf = res[1];
            const data = __classPrivateFieldGet(this, _CloudAuthClient_builLoginForm, "f").call(this, encrypt, appConf, username, password);
            const loginRes = await this.authRequest
                .post(`${const_1.AUTH_URL}/api/logbox/oauth2/loginSubmit.do`, {
                headers: {
                    Referer: const_1.AUTH_URL,
                    lt: appConf.lt,
                    REQID: appConf.reqId
                },
                form: data
            })
                .json();
            return await this.getSessionForPC({ redirectURL: loginRes.toUrl });
        }
        catch (e) {
            log_1.logger.error(e);
            throw e;
        }
    }
    /**
     * token登录
     */
    async loginByAccessToken(accessToken) {
        log_1.logger.debug('loginByAccessToken...');
        return await this.getSessionForPC({ accessToken });
    }
    /**
     * sso登录
     */
    async loginBySsoCooike(cookie) {
        log_1.logger.debug('loginBySsoCooike...');
        const res = await this.authRequest.get(`${const_1.WEB_URL}/api/portal/unifyLoginForPC.action`, {
            searchParams: {
                appId: const_1.AppID,
                clientType: const_1.ClientType,
                returnURL: const_1.ReturnURL,
                timeStamp: Date.now()
            }
        });
        const redirect = await this.authRequest(res.url, {
            headers: {
                Cookie: `SSON=${cookie}`
            }
        });
        return await this.getSessionForPC({ redirectURL: redirect.url });
    }
    /**
     * 刷新token
     */
    refreshToken(refreshToken) {
        return this.authRequest
            .post(`${const_1.AUTH_URL}/api/oauth2/refreshToken.do`, {
            form: {
                clientId: const_1.AppID,
                refreshToken,
                grantType: 'refresh_token',
                format: 'json'
            }
        })
            .json();
    }
    /**
     * Get QR code data for scanning login
     * @returns QR code data including uuid for display
     */
    async getQRCode() {
        log_1.logger.debug('getQRCode...');
        const loginForm = await this.getLoginForm();
        const uuidRes = await this.authRequest
            .post(`${const_1.AUTH_URL}/api/logbox/oauth2/getUUID.do`, {
            headers: {
                Referer: const_1.AUTH_URL
            },
            form: { appId: const_1.AppID }
        })
            .json();
        if (!uuidRes.uuid || !uuidRes.encryuuid) {
            throw new Error('Failed to get QR code UUID');
        }
        return {
            uuid: uuidRes.uuid,
            encryuuid: uuidRes.encryuuid,
            reqId: loginForm.reqId,
            lt: loginForm.lt,
            paramId: loginForm.paramId
        };
    }
    /**
     * Check QR code scan status
     * @param qrData - QR code data from getQRCode
     * @returns status and redirectUrl on success
     */
    async checkQRCodeStatus(qrData) {
        const now = new Date();
        const pad = (n, len = 2) => String(n).padStart(len, '0');
        const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
            `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
        return this.authRequest
            .post(`${const_1.AUTH_URL}/api/logbox/oauth2/qrcodeLoginState.do`, {
            headers: {
                Referer: const_1.AUTH_URL,
                Reqid: qrData.reqId,
                lt: qrData.lt
            },
            form: {
                appId: const_1.AppID,
                clientType: const_1.ClientType,
                returnUrl: const_1.ReturnURL,
                paramId: qrData.paramId,
                uuid: qrData.uuid,
                encryuuid: qrData.encryuuid,
                date,
                timeStamp: Date.now()
            }
        })
            .json();
    }
    /**
     * QR code login with polling
     * @param onQRReady - callback invoked with QR code URL for display
     * @param options - polling interval and timeout
     * @returns token session
     */
    async loginByQRCode(onQRReady, options) {
        var _a, _b;
        log_1.logger.debug('loginByQRCode...');
        const pollInterval = (_a = options === null || options === void 0 ? void 0 : options.pollInterval) !== null && _a !== void 0 ? _a : 3000;
        const timeout = (_b = options === null || options === void 0 ? void 0 : options.timeout) !== null && _b !== void 0 ? _b : 120000;
        const qrData = await this.getQRCode();
        onQRReady(qrData.uuid);
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const res = await this.checkQRCodeStatus(qrData);
            if (res.status === types_1.QRCodeStatus.SUCCESS) {
                log_1.logger.debug('QR code login success, getting session...');
                return await this.getSessionForPC({ redirectURL: res.redirectUrl });
            }
            if (res.status === types_1.QRCodeStatus.EXPIRED) {
                throw new Error('QR code expired');
            }
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }
        throw new Error('QR code login timeout');
    }
}
exports.CloudAuthClient = CloudAuthClient;
_CloudAuthClient_builLoginForm = new WeakMap();
