"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const { TelegramBotService } = require('../services/telegramBot');
const { logTaskEvent } = require('./logUtils');
class TelegramBotManager {
    static getInstance() {
        if (!TelegramBotManager.instance) {
            TelegramBotManager.instance = new TelegramBotManager();
        }
        return TelegramBotManager.instance;
    }
    handleBotStatus(botToken, chatId, enable) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const shouldEnableBot = !!(enable && botToken && chatId);
            const botTokenChanged = ((_a = TelegramBotManager.bot) === null || _a === void 0 ? void 0 : _a.token) !== botToken;
            const chatIdChanged = ((_b = TelegramBotManager.bot) === null || _b === void 0 ? void 0 : _b.chatId) !== chatId;
            if (TelegramBotManager.bot && (!shouldEnableBot || botTokenChanged || chatIdChanged)) {
                yield TelegramBotManager.bot.stop();
                TelegramBotManager.bot = null;
                logTaskEvent(`Telegram机器人已停用`);
            }
            if (shouldEnableBot && (!TelegramBotManager.bot || botTokenChanged || chatIdChanged)) {
                TelegramBotManager.bot = new TelegramBotService(botToken, chatId);
                TelegramBotManager.bot.start()
                    .then(() => {
                    logTaskEvent(`Telegram机器人已启动`);
                })
                    .catch(error => {
                    logTaskEvent(`Telegram机器人启动失败: ${error.message}`);
                });
            }
        });
    }
    getBot() {
        return TelegramBotManager.bot;
    }
}
TelegramBotManager.instance = null;
TelegramBotManager.bot = null;
TelegramBotManager.chatId = null;
module.exports = TelegramBotManager;
