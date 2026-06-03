"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryStore = void 0;
const store_1 = require("./store");
/**
 * @public
 */
class MemoryStore extends store_1.Store {
    constructor() {
        super();
        this.store = {
            accessToken: '',
            refreshToken: '',
            expiresIn: 0
        };
    }
    get() {
        return this.store;
    }
    update(token) {
        var _a, _b;
        this.store = {
            accessToken: token.accessToken,
            refreshToken: (_a = token.refreshToken) !== null && _a !== void 0 ? _a : this.store.refreshToken,
            expiresIn: (_b = token.expiresIn) !== null && _b !== void 0 ? _b : this.store.expiresIn
        };
    }
}
exports.MemoryStore = MemoryStore;
