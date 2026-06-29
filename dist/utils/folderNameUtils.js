"use strict";
/**
 * 文件夹名工具函数
 */
/**
 * 在文件夹名末尾追加 [tmdb-xxx] 标记
 * 用于在 Emby/Jellyfin/Plex 等媒体管理工具中通过 TMDB ID 精准匹配影视条目
 *
 * 特性：
 * 1. 空值安全：folderName 或 tmdbId 为空时直接返回原值
 * 2. 防重复：已含 [tmdb-xxx] 标记（大小写不敏感）则不追加
 * 3. 末尾追加：标记始终位于字符串末尾
 *
 * @param {string} folderName 原文件夹名（如 "狂飙 (2023)"）
 * @param {number|string} tmdbId TMDB ID（如 131887）
 * @returns {string} 处理后的文件夹名（如 "狂飙 (2023)[tmdb-131887]"）
 *
 * @example
 * appendTmdbIdToFolderName("狂飙 (2023)", 131887)
 * // => "狂飙 (2023)[tmdb-131887]"
 *
 * @example
 * appendTmdbIdToFolderName("狂飙[tmdb-131887]", 131887)
 * // => "狂飙[tmdb-131887]"  // 已含标记，不重复
 */
function appendTmdbIdToFolderName(folderName, tmdbId) {
    if (!folderName || !tmdbId)
        return folderName;
    // 防御：已含 [tmdb-xxx] 标记（大小写不敏感，末尾）则不重复追加
    if (/\s*\[tmdb-\d+\]\s*$/i.test(folderName))
        return folderName;
    return `${folderName}[tmdb-${tmdbId}]`;
}
module.exports = { appendTmdbIdToFolderName };
