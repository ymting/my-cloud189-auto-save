"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signatureUpload = exports.signatureAppKey = exports.signatureAccesstoken = void 0;
const url_1 = __importDefault(require("url"));
const util_1 = require("./util");
const log_1 = require("./log");
const signatureAccesstoken = (options, accessToken) => {
    const time = String(Date.now());
    const { query } = url_1.default.parse(options.url.toString(), true);
    const signature = (0, util_1.getSignature)(Object.assign(Object.assign({}, (options.method === 'GET' ? query : options.json || options.form)), { Timestamp: time, AccessToken: accessToken }));
    options.headers['Sign-Type'] = '1';
    options.headers['Signature'] = signature;
    options.headers['Timestamp'] = time;
    options.headers['Accesstoken'] = accessToken;
};
exports.signatureAccesstoken = signatureAccesstoken;
const signatureAppKey = (options, appkey) => {
    const time = String(Date.now());
    const { query } = url_1.default.parse(options.url.toString(), true);
    const signature = (0, util_1.getSignature)(Object.assign(Object.assign({}, (options.method === 'GET' ? query : options.json || options.form)), { Timestamp: time, AppKey: appkey }));
    options.headers['Sign-Type'] = '1';
    options.headers['Signature'] = signature;
    options.headers['Timestamp'] = time;
    options.headers['AppKey'] = appkey;
};
exports.signatureAppKey = signatureAppKey;
const signatureUpload = (options, rsaKey, sessionKey) => {
    const time = String(Date.now());
    const { query } = url_1.default.parse(options.url.toString(), true);
    const requestID = (0, util_1.randomString)('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx');
    const uuid = (0, util_1.randomString)('xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx').slice(0, (16 + 16 * Math.random()) | 0);
    log_1.logger.debug(`upload query: ${JSON.stringify(query)}`);
    const params = (0, util_1.aesECBEncrypt)(query, uuid.substring(0, 16));
    const data = {
        SessionKey: sessionKey,
        Operate: 'GET',
        RequestURI: options.url.pathname,
        Date: time,
        params
    };
    const encryptionText = (0, util_1.rsaEncrypt)(rsaKey.pubKey, uuid, 'base64');
    options.headers['X-Request-Date'] = time;
    options.headers['X-Request-ID'] = requestID;
    options.headers['SessionKey'] = sessionKey;
    options.headers['EncryptionText'] = encryptionText;
    options.headers['PkId'] = rsaKey.pkId;
    options.headers['Signature'] = (0, util_1.hmacSha1)(data, uuid);
    options.url.search = '';
    options.url.hash = '';
    options.url.searchParams.set('params', params);
};
exports.signatureUpload = signatureUpload;
