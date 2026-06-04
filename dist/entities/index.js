"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommonFolder = exports.Task = exports.Account = void 0;
const typeorm_1 = require("typeorm");
let Account = class Account {
};
exports.Account = Account;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Account.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], Account.prototype, "username", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Account.prototype, "password", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Account.prototype, "cookies", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { default: true }),
    __metadata("design:type", Boolean)
], Account.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({
        transformer: {
            from: (date) => date && new Date(date.getTime() + (8 * 60 * 60 * 1000)),
            to: (date) => date
        }
    }),
    __metadata("design:type", Date)
], Account.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({
        transformer: {
            from: (date) => date && new Date(date.getTime() + (8 * 60 * 60 * 1000)),
            to: (date) => date
        }
    }),
    __metadata("design:type", Date)
], Account.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { nullable: true, default: false }),
    __metadata("design:type", Boolean)
], Account.prototype, "clearRecycle", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true, default: '' }),
    __metadata("design:type", String)
], Account.prototype, "localStrmPrefix", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true, default: '' }),
    __metadata("design:type", String)
], Account.prototype, "cloudStrmPrefix", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true, default: '' }),
    __metadata("design:type", String)
], Account.prototype, "embyPathReplace", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { nullable: true, default: false }),
    __metadata("design:type", Boolean)
], Account.prototype, "tgBotActive", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true, default: '' }),
    __metadata("design:type", String)
], Account.prototype, "alias", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { nullable: true, default: false }),
    __metadata("design:type", Boolean)
], Account.prototype, "isDefault", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true, default: '' }),
    __metadata("design:type", String)
], Account.prototype, "familyId", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true, default: '' }),
    __metadata("design:type", String)
], Account.prototype, "familyFolderId", void 0);
exports.Account = Account = __decorate([
    (0, typeorm_1.Entity)()
], Account);
let Task = class Task {
};
exports.Task = Task;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Task.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('IDX_TASK_ACCOUNT_ID'),
    (0, typeorm_1.Column)('integer'),
    __metadata("design:type", Number)
], Task.prototype, "accountId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Account, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'accountId' }),
    __metadata("design:type", Account)
], Task.prototype, "account", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], Task.prototype, "shareLink", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], Task.prototype, "targetFolderId", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "videoType", void 0);
__decorate([
    (0, typeorm_1.Index)('IDX_TASK_STATUS'),
    (0, typeorm_1.Column)('text', { default: 'pending' }),
    __metadata("design:type", String)
], Task.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "lastError", void 0);
__decorate([
    (0, typeorm_1.Column)('datetime', { nullable: true, transformer: {
            from: (date) => date && new Date(date.getTime() + (8 * 60 * 60 * 1000)),
            to: (date) => date
        } }),
    __metadata("design:type", Date)
], Task.prototype, "lastCheckTime", void 0);
__decorate([
    (0, typeorm_1.Column)('datetime', { nullable: true }),
    __metadata("design:type", Date)
], Task.prototype, "lastFileUpdateTime", void 0);
__decorate([
    (0, typeorm_1.Column)('datetime', { nullable: true, transformer: {
            from: (date) => date && new Date(date.getTime() + (8 * 60 * 60 * 1000)),
            to: (date) => date
        } }),
    __metadata("design:type", Date)
], Task.prototype, "processingStartTime", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "resourceName", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { default: 0 }),
    __metadata("design:type", Number)
], Task.prototype, "totalEpisodes", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { default: 0 }),
    __metadata("design:type", Number)
], Task.prototype, "currentEpisodes", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "lastSavedFileName", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "lastSavedDisplayText", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "missingEpisodes", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "realFolderId", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "realFolderName", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "shareFileId", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "shareFolderId", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "shareFolderName", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "shareId", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "shareMode", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "pathType", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({
        transformer: {
            from: (date) => date && new Date(date.getTime() + (8 * 60 * 60 * 1000)),
            to: (date) => date
        }
    }),
    __metadata("design:type", Date)
], Task.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({
        transformer: {
            from: (date) => date && new Date(date.getTime() + (8 * 60 * 60 * 1000)),
            to: (date) => date
        }
    }),
    __metadata("design:type", Date)
], Task.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "accessCode", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "sourceRegex", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "targetRegex", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "matchPattern", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "matchOperator", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "matchValue", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { nullable: true }),
    __metadata("design:type", Number)
], Task.prototype, "retryCount", void 0);
__decorate([
    (0, typeorm_1.Column)('datetime', { nullable: true, transformer: {
            from: (date) => date && new Date(date.getTime() + (8 * 60 * 60 * 1000)),
            to: (date) => date
        } }),
    __metadata("design:type", Date)
], Task.prototype, "nextRetryTime", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "remark", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "cronExpression", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Task.prototype, "enableCron", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "realRootFolderId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "embyId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "tmdbId", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "tmdbTitle", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { nullable: true, default: false }),
    __metadata("design:type", Boolean)
], Task.prototype, "manualTmdbBound", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { nullable: true }),
    __metadata("design:type", Number)
], Task.prototype, "manualSeason", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Boolean)
], Task.prototype, "enableTaskScraper", void 0);
__decorate([
    (0, typeorm_1.Index)('IDX_TASK_ENABLE_SYSTEM_PROXY'),
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Boolean)
], Task.prototype, "enableSystemProxy", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "tmdbContent", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { nullable: true, default: true }),
    __metadata("design:type", Boolean)
], Task.prototype, "isFolder", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { nullable: true }),
    __metadata("design:type", Number)
], Task.prototype, "casFamilyAccountId", void 0);
exports.Task = Task = __decorate([
    (0, typeorm_1.Entity)()
], Task);
// 常用目录表
let CommonFolder = class CommonFolder {
};
exports.CommonFolder = CommonFolder;
__decorate([
    (0, typeorm_1.Column)('text', { primary: true }),
    __metadata("design:type", String)
], CommonFolder.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('integer'),
    __metadata("design:type", Number)
], CommonFolder.prototype, "accountId", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], CommonFolder.prototype, "path", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], CommonFolder.prototype, "name", void 0);
exports.CommonFolder = CommonFolder = __decorate([
    (0, typeorm_1.Entity)()
], CommonFolder);
exports.default = { Account, Task, CommonFolder };
