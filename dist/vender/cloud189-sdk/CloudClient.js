"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _CloudClient_instances, _CloudClient_valid, _CloudClient_getAccessTokenBySsKey, _CloudClient_generateRsaKey, _CloudClient_isFamily, _CloudClient_partUpload, _CloudClient_singleUpload, _CloudClient_multiUpload;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudClient = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const got_1 = __importDefault(require("got"));
const types_1 = require("./types");
const log_1 = require("./log");
const util_1 = require("./util");
const const_1 = require("./const");
const signature_1 = require("./signature");
const CloudAuthClient_1 = require("./CloudAuthClient");
const hook_1 = require("./hook");
const store_1 = require("./store");
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const dnsLookupIpVersion = process.env.DNS_LOOKUP_IP_VERSION === 'ipv4' ? 'ipv4' :
    process.env.DNS_LOOKUP_IP_VERSION === 'ipv6' ? 'ipv6' :
        'auto';
const config = {
    clientId: '538135150693412',
    model: 'KB2000',
    version: '9.0.6'
};
/**
 * 天翼网盘客户端
 * @public
 */
class CloudClient {
    constructor(_options) {
        _CloudClient_instances.add(this);
        this.proxyUrl = null;
        this.forceRefresh = false;
        _CloudClient_valid.set(this, (options) => {
            if (options.ssonCookie) {
                return;
            }
            if (options.token) {
                return;
            }
            if (options.username && options.password) {
                return;
            }
            if (options.onQRCodeReady) {
                return;
            }
            log_1.logger.error('valid');
            throw new Error('Please provide username and password or token or ssonCooike or onQRCodeReady !');
        });
        __classPrivateFieldGet(this, _CloudClient_valid, "f").call(this, _options);
        this.username = _options.username;
        this.password = _options.password;
        this.ssonCookie = _options.ssonCookie;
        this.onQRCodeReady = _options.onQRCodeReady;
        this.qrLoginOptions = _options.qrLoginOptions;
        this.tokenStore = _options.token || new store_1.MemoryStore();
        this.authClient = new CloudAuthClient_1.CloudAuthClient();
        // 如果有代理
        if (_options.proxyUrl) {
            this.setProxy(_options.proxyUrl);
        }
        this.session = {
            accessToken: '',
            sessionKey: ''
        };
        this.rsaKey = null;
        this.request = got_1.default.extend({
            retry: {
                limit: 2,
                statusCodes: [408, 413, 429],
                errorCodes: ['ETIMEDOUT', 'ECONNRESET']
            },
            timeout: {
                request: 10000 // 设置10秒超时
            },
            headers: {
                'User-Agent': const_1.UserAgent,
                Referer: `${const_1.WEB_URL}/web/main/`,
                Accept: 'application/json;charset=UTF-8'
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
                        if (options.url.href.includes(const_1.API_URL)) {
                            const accessToken = await this.getAccessToken();
                            (0, signature_1.signatureAccesstoken)(options, accessToken);
                        }
                        else if (options.url.href.includes(const_1.WEB_URL) || options.url.host === 'm.cloud.189.cn') {
                            if (options.url.href.includes('/open')) {
                                const appkey = '600100422';
                                (0, signature_1.signatureAppKey)(options, appkey);
                            }
                            const sessionKey = await this.getSessionKey();
                            options.url.searchParams.set('sessionKey', sessionKey);
                        }
                        else if (options.url.href.includes(const_1.UPLOAD_URL)) {
                            const sessionKey = await this.getSessionKey();
                            const rsaKey = await this.generateRsaKey();
                            (0, signature_1.signatureUpload)(options, rsaKey, sessionKey);
                        }
                    }
                ],
                afterResponse: [
                    hook_1.logHook,
                    async (response, retryWithMergedOptions) => {
                        if (response.statusCode === 400) {
                            try {
                                const { errorCode, errorMsg } = JSON.parse(response.body.toString());
                                if (errorCode === 'InvalidAccessToken') {
                                    log_1.logger.debug(`InvalidAccessToken retry..., errorMsg: ${errorMsg}`);
                                    log_1.logger.debug('Refresh AccessToken');
                                    this.session.accessToken = '';
                                    this.forceRefresh = true;
                                    return retryWithMergedOptions({});
                                }
                                else if (errorCode === 'InvalidSessionKey') {
                                    log_1.logger.debug(`InvalidSessionKey retry..., errorMsg: ${errorMsg}`);
                                    log_1.logger.debug('Refresh InvalidSessionKey');
                                    this.session.sessionKey = '';
                                    this.forceRefresh = true;
                                    return retryWithMergedOptions({});
                                }
                            }
                            catch (e) {
                                log_1.logger.error(e);
                            }
                        }
                        return response;
                    }
                ]
            }
        });
    }
    setProxy(proxyUrl) {
        this.proxyUrl = proxyUrl;
        this.authClient.setProxy(proxyUrl);
    }
    async getSession() {
        const { accessToken, expiresIn, refreshToken } = await this.tokenStore.get();
        if (!this.forceRefresh && accessToken && expiresIn && expiresIn > Date.now()) {
            try {
                return await this.authClient.loginByAccessToken(accessToken);
            }
            catch (e) {
                log_1.logger.error(e);
            }
        }
        if (refreshToken) {
            try {
                this.forceRefresh = false;
                const refreshTokenSession = await this.authClient.refreshToken(refreshToken);
                await this.tokenStore.update({
                    accessToken: refreshTokenSession.accessToken,
                    refreshToken: refreshTokenSession.refreshToken,
                    expiresIn: new Date(Date.now() + refreshTokenSession.expiresIn * 1000).getTime()
                });
                return await this.authClient.loginByAccessToken(refreshTokenSession.accessToken);
            }
            catch (e) {
                log_1.logger.error(e);
            }
        }
        if (this.ssonCookie) {
            try {
                this.forceRefresh = false;
                const loginToken = await this.authClient.loginBySsoCooike(this.ssonCookie);
                await this.tokenStore.update({
                    accessToken: loginToken.accessToken,
                    refreshToken: loginToken.refreshToken,
                    expiresIn: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).getTime()
                });
                return loginToken;
            }
            catch (e) {
                log_1.logger.error(e);
            }
        }
        if (this.username && this.password) {
            try {
                this.forceRefresh = false;
                const loginToken = await this.authClient.loginByPassword(this.username, this.password);
                await this.tokenStore.update({
                    accessToken: loginToken.accessToken,
                    refreshToken: loginToken.refreshToken,
                    expiresIn: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).getTime()
                });
                return loginToken;
            }
            catch (e) {
                log_1.logger.error(e);
            }
        }
        if (this.onQRCodeReady) {
            try {
                const loginToken = await this.authClient.loginByQRCode(this.onQRCodeReady, this.qrLoginOptions);
                await this.tokenStore.update({
                    accessToken: loginToken.accessToken,
                    refreshToken: loginToken.refreshToken,
                    expiresIn: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).getTime()
                });
                return loginToken;
            }
            catch (e) {
                log_1.logger.error(e);
            }
        }
        throw new Error('Can not get session.');
    }
    /**
     * 获取 sessionKey
     * @returns sessionKey
     */
    async getSessionKey() {
        if (this.session.sessionKey) {
            return this.session.sessionKey;
        }
        if (!this.sessionKeyPromise) {
            this.sessionKeyPromise = this.getSession()
                .then((result) => {
                this.session.sessionKey = result.sessionKey;
                return result.sessionKey;
            })
                .finally(() => {
                this.sessionKeyPromise = null;
            });
        }
        const result = await this.sessionKeyPromise;
        return result;
    }
    /**
     * 获取 accessToken
     * @returns accessToken
     */
    async getAccessToken() {
        if (this.session.accessToken) {
            return this.session.accessToken;
        }
        if (!this.accessTokenPromise) {
            this.accessTokenPromise = __classPrivateFieldGet(this, _CloudClient_instances, "m", _CloudClient_getAccessTokenBySsKey).call(this)
                .then((result) => {
                this.session.accessToken = result.accessToken;
                return result;
            })
                .finally(() => {
                this.accessTokenPromise = null;
            });
        }
        const result = await this.accessTokenPromise;
        return result.accessToken;
    }
    /**
     * 获取 RSA key
     * @returns RSAKey
     */
    async generateRsaKey() {
        if (this.rsaKey && new Date(this.rsaKey.expire).getTime() > Date.now()) {
            return this.rsaKey;
        }
        if (!this.generateRsaKeyPromise) {
            this.generateRsaKeyPromise = __classPrivateFieldGet(this, _CloudClient_instances, "m", _CloudClient_generateRsaKey).call(this)
                .then((res) => {
                this.rsaKey = {
                    expire: res.expire,
                    pubKey: res.pubKey,
                    pkId: res.pkId,
                    ver: res.ver
                };
                return res;
            })
                .finally(() => {
                this.generateRsaKeyPromise = null;
            });
        }
        const result = await this.generateRsaKeyPromise;
        return result;
    }
    /**
     * 获取用户网盘存储容量信息
     * @returns 账号容量结果
     */
    getUserSizeInfo() {
        return this.request.get(`${const_1.WEB_URL}/api/portal/getUserSizeInfo.action`).json();
    }
    /**
     * 个人签到任务（2025/2026最新接口，包含每日空间签到和相册签到）
     * @returns 签到结果
     */
    async userSign() {
        try {
            // 获取 sessionKey 用于 SSO 登录
            const sessionKey = await this.getSessionKey();
            // SSO 登录获取 COOKIE_LOGIN_USER cookie（签到接口必需）
            const ssoLoginUrl = `https://m.cloud.189.cn/ssoLoginMerge.action?sessionKey=${sessionKey}&appName=com.cn21.ecloud&redirectUrl=https://m.cloud.189.cn/zhuanti/2016/sign/index.jsp`;
            await this.request.get(ssoLoginUrl).text().catch(() => { }); // 忽略错误，主要是为了设置 cookie
            // 构建签到请求头
            const signHeaders = {
                'X-Requested-With': 'com.cn21.ecloud',
                'Referer': 'https://m.cloud.189.cn/zhuanti/2016/sign/index.jsp'
            };
            // 1. 每日个人空间签到与抽奖
            const res1 = await this.request
                .get(`https://m.cloud.189.cn/v2/drawPrizeMarketDetails.action`, {
                searchParams: {
                    activityId: 'ACT_SIGNIN',
                    taskId: 'TASK_SIGNIN',
                    noCache: Date.now()
                },
                headers: signHeaders
            })
                .json();
            // 2. 每日相册备份签到与抽奖
            const res2 = await this.request
                .get(`https://m.cloud.189.cn/v2/drawPrizeMarketDetails.action`, {
                searchParams: {
                    activityId: 'ACT_SIGNIN',
                    taskId: 'TASK_SIGNIN_PHOTOS',
                    noCache: Date.now()
                },
                headers: Object.assign(Object.assign({}, signHeaders), { 'Referer': 'https://m.cloud.189.cn/zhuanti/2016/sign/index1.jsp' })
            })
                .json();
            // 提取抽奖获得的空间大小（例如从”50M空间”中提取 50）
            const getSpace = (res) => {
                if (res && res.prizeName) {
                    const match = res.prizeName.match(/(\d+)\s*(M|G)B?/i);
                    if (match) {
                        const num = parseInt(match[1]);
                        const unit = match[2].toUpperCase();
                        return unit === 'G' ? num * 1024 : num;
                    }
                }
                if (res && res.description) {
                    const match = res.description.match(/(\d+)\s*(M|G)B?/i);
                    if (match) {
                        const num = parseInt(match[1]);
                        const unit = match[2].toUpperCase();
                        return unit === 'G' ? num * 1024 : num;
                    }
                }
                return 0;
            };
            // 判断今日是否已经签到过（如果两个接口均返回已抽过奖，或者不含活动ID，则视作已签到）
            const isSign = ((res1 === null || res1 === void 0 ? void 0 : res1.errorCode) === 'UserSignDrawRepeat' || !(res1 === null || res1 === void 0 ? void 0 : res1.activityId)) &&
                ((res2 === null || res2 === void 0 ? void 0 : res2.errorCode) === 'UserSignDrawRepeat' || !(res2 === null || res2 === void 0 ? void 0 : res2.activityId));
            // 累计本次签到获得的奖励大小
            const bonus1 = getSpace(res1);
            const bonus2 = getSpace(res2);
            return {
                isSign,
                netdiskBonus: bonus1 + bonus2,
                res1,
                res2
            };
        }
        catch (e) {
            log_1.logger.error(`userSign error: ${e.message}`);
            throw e;
        }
    }
    /**
     * 获取家庭信息
     * @returns 家庭列表信息
     */
    getFamilyList() {
        return this.request.get(`${const_1.API_URL}/open/family/manage/getFamilyList.action`).json();
    }
    /**
     * 家庭签到任务
     * @param familyId - 家庭id
     * @returns 签到结果
     * @deprecated 已无效
     */
    familyUserSign(familyId) {
        return this.request
            .get(`${const_1.API_URL}/open/family/manage/exeFamilyUserSign.action?familyId=${familyId}`)
            .json();
    }
    /**
     * 获取文件列表
     * @param pageQuery - 查询参数
     * @returns
     */
    getListFiles(pageQuery, familyId) {
        const defaultQuery = {
            pageNum: 1,
            pageSize: 60,
            mediaType: types_1.MediaType.ALL.toString(),
            orderBy: types_1.OrderByType.LAST_OP_TIME.toString(),
            descending: true,
            folderId: '',
            iconOption: 5
        };
        const query = Object.assign(Object.assign({}, defaultQuery), pageQuery);
        if (familyId) {
            return this.request
                .get(`${const_1.API_URL}/open/family/file/listFiles.action`, {
                searchParams: Object.assign(Object.assign({}, query), { familyId })
            })
                .json();
        }
        else {
            return this.request
                .get(`${const_1.API_URL}/open/file/listFiles.action`, {
                searchParams: Object.assign({}, query)
            })
                .json();
        }
    }
    /**
     * 创建文件夹
     * @param createFolderRequest - 创建文件夹请求
     * @returns
     */
    createFolder(createFolderRequest) {
        const url = __classPrivateFieldGet(this, _CloudClient_instances, "m", _CloudClient_isFamily).call(this, createFolderRequest)
            ? `${const_1.API_URL}/open/family/file/createFolder.action`
            : `${const_1.API_URL}/open/file/createFolder.action`;
        return this.request
            .post(url, {
            form: createFolderRequest
        })
            .json();
    }
    /**
     * 重命名文件夹
     * @param renameFolderRequest - 重名文件夹请求
     * @returns
     */
    renameFolder(renameFolderRequest) {
        let url = `${const_1.API_URL}/open/file/renameFolder.action`;
        let form = {
            destFolderName: renameFolderRequest.folderName,
            folderId: renameFolderRequest.folderId
        };
        if (__classPrivateFieldGet(this, _CloudClient_instances, "m", _CloudClient_isFamily).call(this, renameFolderRequest)) {
            url = `${const_1.API_URL}/open/family/file/renameFolder.action`;
            form = Object.assign(form, {
                familyId: renameFolderRequest.familyId
            });
        }
        return this.request
            .post(url, {
            form
        })
            .json();
    }
    /**
     * 初始化上传
     * @param initMultiUploadRequest - 初始化请求
     * @returns
     */
    async initMultiUpload(initMultiUploadRequest) {
        const { parentFolderId, fileName, fileSize, sliceSize, fileMd5, sliceMd5 } = initMultiUploadRequest;
        let initParams = Object.assign({ parentFolderId,
            fileName,
            fileSize,
            sliceSize }, (fileMd5 && sliceMd5 ? { fileMd5, sliceMd5 } : { lazyCheck: 1 }));
        let url = `${const_1.UPLOAD_URL}/person/initMultiUpload`;
        if (__classPrivateFieldGet(this, _CloudClient_instances, "m", _CloudClient_isFamily).call(this, initMultiUploadRequest)) {
            url = `${const_1.UPLOAD_URL}/family/initMultiUpload`;
            initParams = Object.assign(initParams, {
                familyId: initMultiUploadRequest.familyId
            });
        }
        return await this.request
            .get(url, {
            searchParams: Object.assign({}, initParams)
        })
            .json();
    }
    /**
     * 提交上传
     * @param commitMultiUploadRequest - 提交请求
     * @returns
     */
    commitMultiUpload(commitMultiUploadRequest) {
        const url = __classPrivateFieldGet(this, _CloudClient_instances, "m", _CloudClient_isFamily).call(this, commitMultiUploadRequest)
            ? `${const_1.UPLOAD_URL}/family/commitMultiUploadFile`
            : `${const_1.UPLOAD_URL}/person/commitMultiUploadFile`;
        return this.request
            .get(url, {
            searchParams: Object.assign({}, commitMultiUploadRequest)
        })
            .json();
    }
    /**
     * 检测秒传
     * @param params - 检查参数
     * @returns
     */
    checkTransSecond(params) {
        const url = __classPrivateFieldGet(this, _CloudClient_instances, "m", _CloudClient_isFamily).call(this, params)
            ? `${const_1.UPLOAD_URL}/family/checkTransSecond`
            : `${const_1.UPLOAD_URL}/person/checkTransSecond`;
        return this.request
            .get(url, {
            searchParams: params
        })
            .json();
    }
    /**
     * 文件上传
     * @param param - 上传参数
     * @param callbacks - 上传回调
     * @returns
     */
    async upload(param, callbacks = {}) {
        const { filePath, parentFolderId, familyId } = param;
        const { size } = await fs_1.default.promises.stat(filePath);
        const fileName = encodeURIComponent(path_1.default.basename(filePath));
        const sliceSize = (0, util_1.partSize)(size);
        const { fileMd5, chunkMd5s } = await (0, util_1.calculateFileAndChunkMD5)(filePath, sliceSize);
        if (chunkMd5s.length === 1) {
            log_1.logger.debug('single file upload');
            return __classPrivateFieldGet(this, _CloudClient_instances, "m", _CloudClient_singleUpload).call(this, {
                parentFolderId,
                filePath,
                fileName,
                fileSize: size,
                sliceSize,
                fileMd5,
                familyId
            }, callbacks);
        }
        else {
            log_1.logger.debug('multi file upload');
            return __classPrivateFieldGet(this, _CloudClient_instances, "m", _CloudClient_multiUpload).call(this, {
                parentFolderId,
                filePath,
                fileName,
                fileSize: size,
                sliceSize,
                fileMd5,
                chunkMd5s,
                familyId
            }, callbacks);
        }
    }
    /**
     * 检测任务状态
     * @param type - 任务类型
     * @param taskId - 任务Id
     * @param maxAttempts - 重试次数
     * @param interval - 重试间隔
     * @returns
     */
    async checkTaskStatus(type, taskId, maxAttempts = 120, interval = 500) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const { taskStatus, successedFileIdList } = await this.request
                    .post(`${const_1.API_URL}/open/batch/checkBatchTask.action`, {
                    form: { type, taskId }
                })
                    .json();
                if (taskStatus === -1) {
                    log_1.logger.error('创建任务异常');
                    return {
                        taskId,
                        taskStatus
                    };
                }
                //重名
                if (taskStatus === 2) {
                    log_1.logger.error('文件重名任务异常');
                    return {
                        taskId,
                        taskStatus
                    };
                }
                //成功
                if (taskStatus === 4) {
                    return { successedFileIdList, taskId, taskStatus };
                }
            }
            catch (e) {
                log_1.logger.error(`Check task status attempt ${attempt + 1} failed:` + e);
            }
            await new Promise((resolve) => setTimeout(resolve, interval));
        }
    }
    /**
     * 创建任务
     * @param createBatchTaskRequest - 创建任务参数
     * @returns
     */
    async createBatchTask(createBatchTaskRequest) {
        let form = {
            type: createBatchTaskRequest.type,
            taskInfos: JSON.stringify(createBatchTaskRequest.taskInfos)
        };
        if (createBatchTaskRequest.targetFolderId) {
            form = Object.assign(form, {
                targetFolderId: createBatchTaskRequest.targetFolderId
            });
        }
        if (__classPrivateFieldGet(this, _CloudClient_instances, "m", _CloudClient_isFamily).call(this, createBatchTaskRequest)) {
            form = Object.assign(form, {
                familyId: createBatchTaskRequest.familyId
            });
        }
        try {
            const { taskId } = await this.request
                .post(`${const_1.API_URL}/open/batch/createBatchTask.action`, {
                form
            })
                .json();
            return await this.checkTaskStatus(createBatchTaskRequest.type, taskId);
        }
        catch (error) {
            log_1.logger.error('Batch task creation failed:' + error);
            throw error;
        }
    }
    /**
     * 获取文件下载路径
     * @param params - 文件参数
     * @returns
     */
    getFileDownloadUrl(params) {
        const url = params.familyId
            ? `${const_1.API_URL}/open/family/file/getFileDownloadUrl.action`
            : `${const_1.API_URL}/open/file/getFileDownloadUrl.action`;
        return this.request(url, {
            searchParams: params
        }).json();
    }
}
exports.CloudClient = CloudClient;
_CloudClient_valid = new WeakMap(), _CloudClient_instances = new WeakSet(), _CloudClient_getAccessTokenBySsKey = function _CloudClient_getAccessTokenBySsKey() {
    return this.request.get(`${const_1.WEB_URL}/api/open/oauth2/getAccessTokenBySsKey.action`).json();
}, _CloudClient_generateRsaKey = function _CloudClient_generateRsaKey() {
    return this.request.get(`${const_1.WEB_URL}/api/security/generateRsaKey.action`).json();
}, _CloudClient_isFamily = function _CloudClient_isFamily(request) {
    return 'familyId' in request && request.familyId !== undefined;
}, _CloudClient_partUpload = async function _CloudClient_partUpload({ partNumber, md5, buffer, uploadFileId, familyId }, callbacks = {}) {
    const partInfo = `${partNumber}-${(0, util_1.hexToBase64)(md5)}`;
    log_1.logger.debug(`upload part: ${partNumber}`);
    const multiUploadUrParams = {
        partInfo,
        uploadFileId
    };
    const url = familyId
        ? `${const_1.UPLOAD_URL}/family/getMultiUploadUrls`
        : `${const_1.UPLOAD_URL}/person/getMultiUploadUrls`;
    const urls = await this.request
        .get(url, {
        searchParams: multiUploadUrParams
    })
        .json();
    const { requestURL, requestHeader } = urls.uploadUrls[`partNumber_${partNumber}`];
    const headers = requestHeader.split('&').reduce((acc, pair) => {
        const key = pair.split('=')[0];
        const value = pair.match(/=(.*)/)[1];
        acc[key] = value;
        return acc;
    }, {});
    log_1.logger.debug(`Upload URL: ${requestURL}`);
    log_1.logger.debug(`Upload Headers: ${JSON.stringify(headers)}`);
    await got_1.default
        .put(requestURL, {
        headers,
        body: buffer
    })
        .on('uploadProgress', (progress) => {
        var _a;
        (_a = callbacks.onProgress) === null || _a === void 0 ? void 0 : _a.call(callbacks, (progress.transferred * 100) / progress.total);
    });
}, _CloudClient_singleUpload = 
/**
 * 单个小文件上传
 */
async function _CloudClient_singleUpload({ parentFolderId, filePath, fileName, fileSize, fileMd5, sliceSize, familyId }, callbacks = {}) {
    var _a, _b, _c;
    const sliceMd5 = fileMd5;
    const initParams = {
        parentFolderId,
        fileName,
        fileSize,
        sliceSize,
        fileMd5,
        sliceMd5,
        familyId
    };
    let fd;
    try {
        // md5校验
        const res = await this.initMultiUpload(initParams);
        const { uploadFileId, fileDataExists } = res.data;
        if (!fileDataExists) {
            fd = await fs_1.default.promises.open(filePath, 'r');
            const buffer = Buffer.alloc(fileSize);
            await fd.read(buffer, 0, fileSize);
            await __classPrivateFieldGet(this, _CloudClient_instances, "m", _CloudClient_partUpload).call(this, {
                partNumber: 1,
                md5: fileMd5,
                buffer,
                uploadFileId,
                familyId
            }, {
                onProgress: callbacks.onProgress,
                onError: callbacks.onError
            });
        }
        else {
            log_1.logger.debug(`单文件 ${filePath} 秒传: ${uploadFileId}`);
            (_a = callbacks.onProgress) === null || _a === void 0 ? void 0 : _a.call(callbacks, 100); // 秒传直接显示100%
        }
        const commitResult = Object.assign(Object.assign({}, (await this.commitMultiUpload({
            fileMd5,
            sliceMd5,
            uploadFileId,
            familyId
        }))), { fileDataExists });
        (_b = callbacks.onComplete) === null || _b === void 0 ? void 0 : _b.call(callbacks, commitResult);
        return commitResult;
    }
    catch (e) {
        (_c = callbacks.onError) === null || _c === void 0 ? void 0 : _c.call(callbacks, e);
        throw e;
    }
    finally {
        fd === null || fd === void 0 ? void 0 : fd.close();
    }
}, _CloudClient_multiUpload = 
/**
 * 大文件分块上传
 */
async function _CloudClient_multiUpload({ parentFolderId, filePath, fileName, fileSize, fileMd5, sliceSize, chunkMd5s, familyId }, callbacks = {}) {
    var _a, _b, _c;
    const sliceMd5 = (0, util_1.md5)(chunkMd5s.join('\n'));
    const initParams = {
        parentFolderId,
        fileName,
        fileSize,
        sliceSize,
        familyId
    };
    let fd;
    try {
        const res = await this.initMultiUpload(initParams);
        const { uploadFileId } = res.data;
        const checkTransSecondParams = {
            fileMd5,
            sliceMd5,
            uploadFileId,
            familyId
        };
        // md5校验
        const checkRes = await this.checkTransSecond(checkTransSecondParams);
        const { fileDataExists } = checkRes.data;
        if (!fileDataExists) {
            fd = await fs_1.default.promises.open(filePath, 'r');
            const chunkCount = chunkMd5s.length;
            const progressMap = {};
            await (0, util_1.asyncPool)(5, [...Array(chunkCount).keys()], async (i) => {
                const partNumber = i + 1;
                const position = i * sliceSize;
                const length = Math.min(sliceSize, fileSize - position);
                const buffer = Buffer.alloc(length);
                await fd.read(buffer, 0, length, position);
                await __classPrivateFieldGet(this, _CloudClient_instances, "m", _CloudClient_partUpload).call(this, {
                    partNumber: partNumber,
                    md5: chunkMd5s[i],
                    buffer,
                    uploadFileId,
                    familyId
                }, {
                    onProgress: (chunkProgress) => {
                        if (callbacks.onProgress) {
                            // 计算整体进度
                            progressMap[`partNumber_${partNumber}`] = chunkProgress;
                            const totalProgress = Object.values(progressMap).reduce((sum, p) => sum + p, 0) / chunkCount;
                            callbacks.onProgress(totalProgress);
                        }
                    },
                    onError: callbacks.onError
                });
            });
        }
        else {
            log_1.logger.debug(`多块文件 ${filePath} 秒传: ${uploadFileId}`);
            (_a = callbacks.onProgress) === null || _a === void 0 ? void 0 : _a.call(callbacks, 100); // 秒传直接显示100%
        }
        const commitResult = Object.assign(Object.assign({}, (await this.commitMultiUpload({
            fileMd5,
            sliceMd5,
            uploadFileId,
            lazyCheck: 1,
            familyId
        }))), { fileDataExists });
        (_b = callbacks.onComplete) === null || _b === void 0 ? void 0 : _b.call(callbacks, commitResult);
        return commitResult;
    }
    catch (e) {
        (_c = callbacks.onError) === null || _c === void 0 ? void 0 : _c.call(callbacks, e);
        throw e;
    }
    finally {
        fd === null || fd === void 0 ? void 0 : fd.close();
    }
};
