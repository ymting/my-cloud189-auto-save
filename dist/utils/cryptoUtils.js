"use strict";
const crypto = require('crypto');
class CryptoUtils {
    static encryptIds(taskId, fileId) {
        const key = process.env.ENCRYPTION_KEY || 'your-encryption-key';
        const data = `${taskId}:${fileId}`;
        const cipher = crypto.createCipher('aes-256-cbc', key);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }
    static decryptIds(encrypted) {
        const key = process.env.ENCRYPTION_KEY || 'your-encryption-key';
        const decipher = crypto.createDecipher('aes-256-cbc', key);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        const [taskId, fileId] = decrypted.split(':');
        return { taskId, fileId };
    }
}
module.exports = CryptoUtils;
