"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkErrorHook = void 0;
const error_1 = require("../error");
const checkErrorHook = (response, _retryWithMergedOptions) => {
    (0, error_1.checkError)(response.body.toString());
    return response;
};
exports.checkErrorHook = checkErrorHook;
