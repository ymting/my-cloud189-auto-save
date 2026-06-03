"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkError = exports.AuthApiError = exports.InvalidRefreshTokenError = void 0;
class InvalidRefreshTokenError extends Error {
}
exports.InvalidRefreshTokenError = InvalidRefreshTokenError;
class AuthApiError extends Error {
}
exports.AuthApiError = AuthApiError;
const checkError = (response) => {
    let res;
    try {
        res = JSON.parse(response);
    }
    catch (e) {
        return;
    }
    // 判断res是否是json
    if (typeof res !== 'object') {
        return;
    }
    // auth
    if ('result' in res && 'msg' in res) {
        switch (res.result) {
            case 0:
                return;
            case -117:
                throw new InvalidRefreshTokenError(res.msg);
            default:
                throw new AuthApiError(res.msg);
        }
    }
};
exports.checkError = checkError;
