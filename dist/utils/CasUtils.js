"use strict";
/**
 * CAS 文件解析工具
 * CAS 文件是天翼云盘的秒传指纹文件，内部存储了真实视频的 md5/sliceMd5/size/name 等信息
 *
 * 标准 CAS 格式（与 OpenList-CAS 一致）:
 *   Base64 编码的 JSON: {"name":"xxx","size":123,"md5":"xxx","sliceMd5":"xxx","create_time":"xxx"}
 *
 * 同时兼容其他格式:
 *   - 纯 JSON
 *   - 管道格式: 文件名|文件大小|MD5|sliceMD5
 */
class CasUtils {
    /**
     * 解析 CAS 文件内容，提取秒传信息
     * @param {string} content - CAS 文件的文本内容
     * @returns {object|null} 解析结果 { md5, slice_md5, size, name } 或 null
     */
    static parseCasContent(content) {
        if (!content)
            return null;
        content = content.trim();
        // 尝试1: 直接就是 JSON
        if (content.startsWith('{')) {
            try {
                const json = JSON.parse(content);
                return CasUtils._normalizeJsonItem(json);
            }
            catch (e) { }
        }
        // 尝试2: Base64 编码的 JSON（OpenList-CAS 标准格式）
        try {
            const decoded = CasUtils._base64Decode(content);
            if (decoded && decoded.startsWith('{')) {
                const json = JSON.parse(decoded);
                return CasUtils._normalizeJsonItem(json);
            }
        }
        catch (e) { }
        // 尝试3: 可能有多行，逐行解析
        const lines = content.split(/[\n\r]+/).filter(l => l.trim());
        for (const line of lines) {
            const trimmed = line.trim();
            try {
                const decoded = CasUtils._base64Decode(trimmed);
                if (decoded && decoded.startsWith('{')) {
                    const json = JSON.parse(decoded);
                    return CasUtils._normalizeJsonItem(json);
                }
            }
            catch (e) { }
            try {
                if (trimmed.startsWith('{')) {
                    const json = JSON.parse(trimmed);
                    return CasUtils._normalizeJsonItem(json);
                }
            }
            catch (e) { }
        }
        // 尝试4: 管道格式 文件名|文件大小|MD5|sliceMD5
        if (content.includes('|')) {
            const parts = content.split('|');
            if (parts.length >= 4) {
                const result = {
                    md5: parts[2].toUpperCase(),
                    slice_md5: parts[3].toUpperCase(),
                    size: parseInt(parts[1]) || 0,
                    name: parts[0]
                };
                if (!result.md5 || !result.slice_md5)
                    return null;
                return result;
            }
        }
        return null;
    }
    /**
     * 标准化 JSON 格式的 CAS 数据
     * 兼容不同字段名:
     *   OpenList-CAS 标准: md5, sliceMd5, size, name, create_time
     *   其他变体: fileMd5, slice_md5, fileSize, fileName
     */
    static _normalizeJsonItem(json) {
        if (!json)
            return null;
        const result = {
            md5: (json.md5 || json.fileMd5 || '').toUpperCase(),
            slice_md5: (json.slice_md5 || json.sliceMd5 || '').toUpperCase(),
            size: parseInt(json.size || json.fileSize || 0),
            name: json.name || json.fileName || ''
        };
        if (!result.md5 || !result.slice_md5)
            return null;
        return result;
    }
    /**
     * 合并 CAS 文件名和解析出的真实文件名
     * 参照 OpenList-CAS resolveRestoreSourceName:
     *   - CAS 文件名去掉 .cas 后缀作为恢复后的文件名
     *   - 如果去掉 .cas 后的名字没有视频扩展名，使用 CAS 中记录的原始文件扩展名
     *   - 安全检查: 文件名不能包含路径分隔符
     *
     * @param {string} casFileName - .cas 文件名
     * @param {string} parsedName - 解析出的真实文件名
     * @returns {string} 合并后的文件名
     */
    static mergeCasFileName(casFileName, parsedName) {
        const baseName = String(casFileName || '').replace(/\.cas$/i, '');
        // 安全检查: 防止路径遍历
        if (baseName.includes('/') || baseName.includes('\\')) {
            // 只取最后一段
            const parts = baseName.split(/[/\\]/);
            return parts[parts.length - 1] || 'unknown';
        }
        const baseSuffix = CasUtils._getFileSuffix(baseName).toLowerCase();
        const parsedSuffix = CasUtils._getFileSuffix(parsedName).toLowerCase();
        // 常见媒体扩展名列表
        const mediaSuffixes = ['.mkv', '.mp4', '.avi', '.rmvb', '.wmv', '.m2ts', '.ts', '.flv', '.mov', '.iso', '.mpg', '.rm', '.mp3', '.flac', '.wav', '.aac', '.srt', '.ass', '.nfo'];
        // 如果 CAS 文件名本身有媒体扩展名，直接使用
        if (baseSuffix && mediaSuffixes.includes(baseSuffix)) {
            return baseName;
        }
        // 否则用 CAS 文件名（去扩展名）+ 解析出的扩展名
        if (parsedSuffix) {
            const nameWithoutSuffix = baseSuffix ? baseName.substring(0, baseName.length - baseSuffix.length) : baseName;
            return nameWithoutSuffix + parsedSuffix;
        }
        return baseName;
    }
    /**
     * 判断文件名是否为 CAS 文件
     */
    static isCasFile(fileName) {
        return fileName && fileName.toLowerCase().endsWith('.cas');
    }
    static _getFileSuffix(name) {
        if (!name)
            return '';
        const lastDot = name.lastIndexOf('.');
        if (lastDot === -1 || lastDot === name.length - 1)
            return '';
        return name.substring(lastDot);
    }
    static _base64Decode(str) {
        try {
            return Buffer.from(str, 'base64').toString('utf-8');
        }
        catch (e) {
            return null;
        }
    }
}
module.exports = CasUtils;
