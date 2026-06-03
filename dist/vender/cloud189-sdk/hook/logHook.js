"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logHook = void 0;
const log_1 = require("../log");
const logHook = (response, _retryWithMergedOptions) => {
    log_1.logger.debug(`url: ${response.requestUrl}, response: ${response.body})}`);
    return response;
};
exports.logHook = logHook;
