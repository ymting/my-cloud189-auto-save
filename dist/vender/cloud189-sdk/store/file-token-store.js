"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _FileTokenStore_instances, _FileTokenStore_loadFromFile, _FileTokenStore_saveToFile;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileTokenStore = void 0;
const fs = __importStar(require("node:fs"));
const promisesFs = __importStar(require("node:fs/promises"));
const path_1 = __importDefault(require("path"));
const memstore_1 = require("./memstore");
/**
 * @public
 */
class FileTokenStore extends memstore_1.MemoryStore {
    constructor(filePath) {
        super();
        _FileTokenStore_instances.add(this);
        this.filePath = filePath;
        if (!filePath) {
            throw new Error('Unknown file for read/write token');
        }
        this.ensureTokenDirectory(filePath);
        const dataJson = __classPrivateFieldGet(this, _FileTokenStore_instances, "m", _FileTokenStore_loadFromFile).call(this, filePath);
        if (dataJson) {
            super.update(dataJson);
        }
    }
    ensureTokenDirectory(filePath) {
        const dir = path_1.default.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
    update(token) {
        super.update(token);
        return __classPrivateFieldGet(this, _FileTokenStore_instances, "m", _FileTokenStore_saveToFile).call(this, this.filePath, this.store);
    }
}
exports.FileTokenStore = FileTokenStore;
_FileTokenStore_instances = new WeakSet(), _FileTokenStore_loadFromFile = function _FileTokenStore_loadFromFile(filePath) {
    let data = null;
    if (fs.existsSync(filePath)) {
        data = fs.readFileSync(filePath, {
            encoding: 'utf-8'
        });
    }
    if (data) {
        try {
            return JSON.parse(data);
        }
        catch (e) {
            throw new Error(`Could not parse token file ${filePath}. Please ensure it is not corrupted.`);
        }
    }
    return null;
}, _FileTokenStore_saveToFile = function _FileTokenStore_saveToFile(filePath, data) {
    return promisesFs.writeFile(filePath, JSON.stringify(data), {
        encoding: 'utf-8'
    });
};
