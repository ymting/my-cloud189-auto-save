"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientSuffix = exports.UserAgent = exports.ReturnURL = exports.ClientType = exports.AppID = exports.AccountType = exports.UPLOAD_URL = exports.API_URL = exports.AUTH_URL = exports.WEB_URL = void 0;
exports.WEB_URL = 'https://cloud.189.cn';
exports.AUTH_URL = 'https://open.e.189.cn';
exports.API_URL = 'https://api.cloud.189.cn';
exports.UPLOAD_URL = 'https://upload.cloud.189.cn';
exports.AccountType = '02';
exports.AppID = '8025431004';
exports.ClientType = '10020';
exports.ReturnURL = 'https://m.cloud.189.cn/zhuanti/2020/loginErrorPc/index.html';
exports.UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36';
const Version = '6.2', PC = 'TELEPC', ChannelID = 'web_cloud.189.cn';
const clientSuffix = () => ({
    clientType: PC,
    version: Version,
    channelId: ChannelID,
    rand: Date.now()
});
exports.clientSuffix = clientSuffix;
