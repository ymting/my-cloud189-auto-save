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
const fs = require('fs').promises;
const path = require('path');
const { TMDBService } = require('./tmdb');
// const MediaTypeDetector = require('../utils/MediaFileParser');
const got = require('got');
const { logTaskEvent } = require('../utils/logUtils');
const crypto = require('crypto');
const AIService = require('./ai');
const ConfigService = require('./ConfigService');
class ScrapeService {
    constructor() {
        this.tmdb = new TMDBService();
        this.ai = AIService;
        // 是否已刮削
        this.scraped = false;
    }
    scrapeFromDirectory(dirPath_1) {
        return __awaiter(this, arguments, void 0, function* (dirPath, tmdbId = null) {
            var _a;
            if (this.ai.isEnabled()) {
                logTaskEvent('使用AI进行刮削');
                return yield this.scrapeWithAI(dirPath, tmdbId);
            }
            else {
                logTaskEvent('使用AI, 跳过刮削');
                return null;
            }
            try {
                // 获取当前目录下所有 .strm 文件
                const strmFiles = yield this._getStrmFiles(dirPath);
                // 先获取媒体信息
                let mediaDetails = null;
                if (strmFiles.length > 0) {
                    const firstStrmPath = path.join(dirPath, strmFiles[0]);
                    const parsedPath = this._parseStrmPath(firstStrmPath);
                    const mediaInfo = yield this._parseMediaInfo(parsedPath);
                    if ((mediaInfo === null || mediaInfo === void 0 ? void 0 : mediaInfo.type) && (mediaInfo === null || mediaInfo === void 0 ? void 0 : mediaInfo.name)) {
                        mediaInfo.tmdbId = tmdbId;
                        mediaDetails = tmdbId
                            ? { id: tmdbId }
                            : yield this._fetchTMDBInfo(mediaInfo, strmFiles.length);
                    }
                }
                if (!(mediaDetails === null || mediaDetails === void 0 ? void 0 : mediaDetails.id) || !(mediaDetails === null || mediaDetails === void 0 ? void 0 : mediaDetails.id)) {
                    logTaskEvent('未找到TMDBID，无法刮削');
                    return null;
                }
                // 处理所有 .strm 文件
                for (const strmFile of strmFiles) {
                    const fullPath = path.join(dirPath, strmFile);
                    yield this.scrapeFromStrm(fullPath, mediaDetails);
                }
                // 判断是否是剧集季目录
                const isSeasonDir = /(Season|第[\d一二三四五六七八九十]+季)/i.test(path.basename(dirPath));
                if (isSeasonDir && strmFiles.length > 0) {
                    // 使用第一个文件获取剧集信息
                    const firstStrmPath = path.join(dirPath, strmFiles[0]);
                    const parsedPath = this._parseStrmPath(firstStrmPath);
                    const mediaInfo = yield this._parseMediaInfo(parsedPath);
                    const hasExistingData = yield this._checkExistingData(parsedPath, mediaInfo.type);
                    if (!hasExistingData && (mediaDetails === null || mediaDetails === void 0 ? void 0 : mediaDetails.id)) {
                        yield this._generateTVRootFiles(parsedPath, mediaDetails);
                        this.scraped = true;
                    }
                }
                if (!this.scraped)
                    return null;
                const currentSeason = (_a = mediaDetails.seasons) === null || _a === void 0 ? void 0 : _a.find(season => season.season_number === parseInt(mediaInfo === null || mediaInfo === void 0 ? void 0 : mediaInfo.season));
                const seasonEpisodes = (currentSeason === null || currentSeason === void 0 ? void 0 : currentSeason.episode_count) || 1;
                return Object.assign(Object.assign({}, mediaDetails), { seasonEpisodes });
            }
            catch (error) {
                console.error('目录刮削失败:', error);
            }
        });
    }
    scrapeFromStrm(strmPath, mediaDetails) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const parsedPath = this._parseStrmPath(strmPath);
                if (!parsedPath)
                    return;
                const hasExistingData = yield this._checkEpisodeExistingData(parsedPath);
                if (hasExistingData) {
                    return;
                }
                const mediaInfo = yield this._parseMediaInfo(parsedPath);
                logTaskEvent('媒体信息解析:' + JSON.stringify(mediaInfo));
                if (!mediaInfo)
                    return;
                // 如果type或者标题不存在，则返回
                if (!mediaInfo.type || !mediaInfo.name)
                    return;
                if (!(mediaDetails === null || mediaDetails === void 0 ? void 0 : mediaDetails.id))
                    return null;
                if (mediaInfo.type === 'tv') {
                    // 电视剧只处理剧集信息
                    const episodeInfo = yield this._fetchEpisodeInfo(mediaDetails.id, mediaInfo.season, mediaInfo.episode);
                    if (!episodeInfo)
                        return;
                    yield this._generateTVFiles(parsedPath, episodeInfo);
                }
                else {
                    // 电影生成对应文件
                    yield this._generateMovieFiles(parsedPath, mediaDetails);
                }
                this.scraped = true;
                return mediaDetails;
            }
            catch (error) {
                logTaskEvent('刮削失败:' + error);
            }
        });
    }
    scrapeWithAI(dirPath_1) {
        return __awaiter(this, arguments, void 0, function* (dirPath, tmdbId = null) {
            var _a;
            try {
                // 获取目录下的文件
                const fileList = yield this._getStrmFiles(dirPath);
                if (fileList.length === 0) {
                    logTaskEvent('目录中没有.strm文件');
                    return null;
                }
                // 构建文件信息
                const fileInfos = yield Promise.all(fileList.map((file) => __awaiter(this, void 0, void 0, function* () {
                    const fullPath = path.join(dirPath, file);
                    const md5 = crypto.createHash('md5').update(fullPath).digest('hex');
                    return {
                        id: md5,
                        name: file
                    };
                })));
                // 使用第一个文件路径获取目录信息
                const firstFile = path.join(dirPath, fileList[0]);
                const parsedPath = this._parseStrmPath(firstFile);
                // 调用AI分析文件信息
                const aiResponse = yield this.ai.simpleChatCompletion(dirPath, fileInfos);
                if (!aiResponse.success) {
                    logTaskEvent('AI分析失败: ' + aiResponse.error);
                    return null;
                }
                const mediaInfo = aiResponse.data;
                if (!(mediaInfo === null || mediaInfo === void 0 ? void 0 : mediaInfo.name)) {
                    logTaskEvent('AI未能识别出有效的媒体信息');
                    return null;
                }
                // 获取TMDB信息
                const tmdbDetails = tmdbId
                    ? (mediaInfo.type === 'tv'
                        ? yield this.tmdb.getTVDetails(tmdbId)
                        : yield this.tmdb.getMovieDetails(tmdbId))
                    : yield this._fetchTMDBInfo({
                        name: mediaInfo.name,
                        year: mediaInfo.year,
                        type: mediaInfo.type,
                        tmdbId: null
                    }, fileList.length || 1);
                if (!(tmdbDetails === null || tmdbDetails === void 0 ? void 0 : tmdbDetails.id)) {
                    logTaskEvent('未找到对应的TMDB信息');
                    return null;
                }
                // 根据媒体类型生成对应文件
                if (mediaInfo.type === 'tv') {
                    yield this._generateTVRootFiles(parsedPath, tmdbDetails);
                    // 处理每个剧集
                    for (const episode of mediaInfo.episode) {
                        const episodeInfo = yield this._fetchEpisodeInfo(tmdbDetails.id, episode.season, episode.episode);
                        if (episodeInfo) {
                            const filePath = path.join(dirPath, fileInfos.find(info => info.id === episode.id).name);
                            yield this._generateTVFiles(this._parseStrmPath(filePath), episodeInfo);
                        }
                    }
                }
                else {
                    yield this._generateMovieFiles(parsedPath, tmdbDetails);
                }
                this.scraped = true;
                // 获取当前季的集数
                const currentSeason = (_a = tmdbDetails.seasons) === null || _a === void 0 ? void 0 : _a.find(season => season.season_number === parseInt(mediaInfo.season));
                const seasonEpisodes = (currentSeason === null || currentSeason === void 0 ? void 0 : currentSeason.episode_count) || 0;
                return Object.assign(Object.assign({}, tmdbDetails), { seasonEpisodes });
            }
            catch (error) {
                logTaskEvent('AI刮削失败: ' + error.message);
                return null;
            }
        });
    }
    _getStrmFiles(dirPath) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const files = yield fs.readdir(dirPath);
                const mediaSuffixs = ConfigService.getConfigValue('task.mediaSuffix').split(';').map(suffix => suffix.toLowerCase());
                return files.filter(file => {
                    const ext = path.extname(file).toLowerCase();
                    return ext === '.strm' || mediaSuffixs.includes(ext);
                });
            }
            catch (error) {
                console.error('读取目录失败:', error);
                return [];
            }
        });
    }
    _checkExistingData(parsedPath_1) {
        return __awaiter(this, arguments, void 0, function* (parsedPath, type = 'tv') {
            try {
                const episodeBase = path.parse(parsedPath.strmFile).name;
                // 根据类型确定需要检查的文件
                const files = type === 'tv'
                    ? [
                        path.join(parsedPath.showDir, 'tvshow.nfo'),
                        path.join(parsedPath.showDir, 'poster.jpg'),
                        path.join(parsedPath.showDir, `${parsedPath.seasonName}-poster.jpg`)
                    ]
                    : [
                        path.join(parsedPath.seasonDir, `${episodeBase}.nfo`),
                        path.join(parsedPath.showDir, 'poster.jpg')
                    ];
                // 只要有一个文件不存在就需要刮削
                for (const file of files) {
                    try {
                        yield fs.access(file);
                    }
                    catch (_a) {
                        // logTaskEvent(`文件不存在，需要刮削: ${file}`);
                        return false;
                    }
                }
                // logTaskEvent('所有文件都存在，跳过根目录刮削');
                return true;
            }
            catch (error) {
                console.error('检查刮削数据失败:', error);
                return false;
            }
        });
    }
    // 校验剧集是否已刮削
    _checkEpisodeExistingData(parsedPath) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const episodeBase = path.parse(parsedPath.strmFile).name;
                const episodeFiles = {
                    nfo: path.join(parsedPath.seasonDir, `${episodeBase}.nfo`),
                    thumb: path.join(parsedPath.seasonDir, `${episodeBase}-thumb.jpg`)
                };
                for (const file of Object.values(episodeFiles)) {
                    try {
                        yield fs.access(file);
                    }
                    catch (_a) {
                        // logTaskEvent(`文件不存在，需要刮削: ${file}`);
                        return false;
                    }
                }
                return true;
            }
            catch (error) {
                logTaskEvent('检查剧集刮削数据失败:' + error);
                return false;
            }
        });
    }
    _generateMovieFiles(parsedPath, movieInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            const episodeBase = path.parse(parsedPath.strmFile).name;
            const movieFiles = {
                nfo: path.join(parsedPath.showDir, `${episodeBase}.nfo`),
                poster: path.join(parsedPath.showDir, 'poster.jpg'),
                logo: path.join(parsedPath.showDir, 'clearlogo.png')
            };
            yield Promise.all([
                this._generateFileIfNotExists(movieFiles.nfo, () => this._generateMovieNFO(movieInfo)),
                this._generateFileIfNotExists(movieFiles.poster, () => this._downloadImage(movieInfo.posterPath)),
                this._generateFileIfNotExists(movieFiles.logo, () => this._downloadImage(movieInfo.logoPath))
            ]);
        });
    }
    // 生成TV根目录文件
    _generateTVRootFiles(parsedPath, showInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            // 检查并生成剧集目录文件
            const showFiles = {
                nfo: path.join(parsedPath.showDir, 'tvshow.nfo'),
                poster: path.join(parsedPath.showDir, 'poster.jpg'),
                logo: path.join(parsedPath.showDir, 'clearlogo.png'),
                seasonPoster: path.join(parsedPath.showDir, `${parsedPath.seasonName}-poster.jpg`)
            };
            yield Promise.all([
                this._generateFileIfNotExists(showFiles.nfo, () => this._generateShowNFO(showInfo)),
                this._generateFileIfNotExists(showFiles.poster, () => this._downloadImage(showInfo.posterPath)),
                this._generateFileIfNotExists(showFiles.logo, () => this._downloadImage(showInfo.logoPath)),
                this._generateFileIfNotExists(showFiles.seasonPoster, () => this._downloadImage(showInfo.posterPath))
            ]);
        });
    }
    _generateTVFiles(parsedPath, episodeInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            // 生成剧集文件
            const episodeBase = path.parse(parsedPath.strmFile).name;
            const episodeFiles = {
                nfo: path.join(parsedPath.seasonDir, `${episodeBase}.nfo`),
                thumb: path.join(parsedPath.seasonDir, `${episodeBase}-thumb.jpg`)
            };
            yield Promise.all([
                this._generateFileIfNotExists(episodeFiles.nfo, () => this._generateEpisodeNFO(episodeInfo)),
                this._generateFileIfNotExists(episodeFiles.thumb, () => this._downloadImage(episodeInfo.stillPath))
            ]);
        });
    }
    _fetchEpisodeInfo(showId, season, episode) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.tmdb.getEpisodeDetails(showId, parseInt(season), parseInt(episode));
        });
    }
    _generateFileIfNotExists(filePath, generator) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield fs.access(filePath);
                // logTaskEvent(`文件已存在，跳过生成: ${filePath}`);
            }
            catch (_a) {
                const content = yield generator();
                if (content) {
                    yield fs.writeFile(filePath, content);
                    logTaskEvent(`生成文件: ${filePath}`);
                }
            }
        });
    }
    _generateMovieNFO(movieInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const dateAdded = new Date().toISOString().replace('T', ' ').substring(0, 19);
            return `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<movie>
    <plot><![CDATA[${movieInfo.overview}]]></plot>
    <outline><![CDATA[${movieInfo.overview}]]></outline>
    <lockdata>true</lockdata>
    <dateadded>${dateAdded}</dateadded>
    <title>${movieInfo.title}</title>
    <originaltitle>${movieInfo.originalTitle}</originaltitle>
    ${(_a = movieInfo.cast) === null || _a === void 0 ? void 0 : _a.map(actor => `
    <actor>
        <name>${actor.name}</name>
        <role>${actor.character}</role>
        <type>Actor</type>
        <tmdbid>${actor.id}</tmdbid>
    </actor>`).join('')}
    <year>${(_b = movieInfo.releaseDate) === null || _b === void 0 ? void 0 : _b.substring(0, 4)}</year>
    <premiered>${movieInfo.releaseDate}</premiered>
    <rating>${movieInfo.voteAverage}</rating>
    <fileinfo>
        <streamdetails />
    </fileinfo>
</movie>`;
        });
    }
    _generateShowNFO(showInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const dateAdded = new Date().toISOString().replace('T', ' ').substring(0, 19);
            return `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<tvshow>
    <plot><![CDATA[${showInfo.overview}]]></plot>
    <outline><![CDATA[${showInfo.overview}]]></outline>
    <lockdata>true</lockdata>
    <dateadded>${dateAdded}</dateadded>
    <title>${showInfo.title}</title>
    <originaltitle>${showInfo.originalTitle}</originaltitle>
    ${(_a = showInfo.cast) === null || _a === void 0 ? void 0 : _a.map(actor => `
    <actor>
        <name>${actor.original_name}</name>
        <role>${actor.character}</role>
        <type>Actor</type>
        <tmdbid>${actor.id}</tmdbid>
    </actor>`).join('')}
    <tmdbid>${showInfo.id}</tmdbid>
</tvshow>`;
        });
    }
    _generateEpisodeNFO(episodeInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const dateAdded = new Date().toISOString().replace('T', ' ').substring(0, 19);
            return `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<episodedetails>
    <plot><![CDATA[${episodeInfo.overview}]]></plot>
    <outline><![CDATA[${episodeInfo.overview}]]></outline>
    <lockdata>true</lockdata>
    <dateadded>${dateAdded}</dateadded>
    <title>${episodeInfo.name}</title>
    ${(_a = episodeInfo.cast) === null || _a === void 0 ? void 0 : _a.map(actor => `
    <actor>
        <name>${actor.name}</name>
        <role>${actor.character}</role>
        <type>Actor</type>
        <tmdbid>${actor.id}</tmdbid>
    </actor>`).join('')}
    <year>${(_b = episodeInfo.air_date) === null || _b === void 0 ? void 0 : _b.substring(0, 4)}</year>
    <sorttitle>${episodeInfo.name}</sorttitle>
    <episode>${episodeInfo.episode_number}</episode>
    <season>${episodeInfo.season_number}</season>
    <aired>${episodeInfo.air_date}</aired>
    <fileinfo>
        <streamdetails />
    </fileinfo>
</episodedetails>`;
        });
    }
    _parseStrmPath(strmPath) {
        const parsed = path.parse(strmPath);
        const seasonDir = path.dirname(strmPath);
        // 判断是否是季目录
        const isSeasonDir = /(Season|第[\d一二三四五六七八九十]+季)/i.test(path.basename(seasonDir));
        const showDir = isSeasonDir ? path.dirname(seasonDir) : seasonDir;
        // logTaskEvent('原始路径:' + strmPath);
        return {
            strmFile: parsed.base,
            strmPath: strmPath,
            seasonDir: seasonDir,
            showDir: showDir,
            seasonName: path.basename(seasonDir),
            showName: path.basename(showDir)
        };
    }
    _parseMediaInfo(parsedPath) {
        return __awaiter(this, void 0, void 0, function* () {
            // return MediaTypeDetector.detect({
            //     filename: parsedPath.strmFile,
            //     dirPath: parsedPath.seasonDir
            // });
            return {};
        });
    }
    _fetchTMDBInfo(mediaInfo, currentEpisodes) {
        return __awaiter(this, void 0, void 0, function* () {
            if (mediaInfo.type === 'tv') {
                return mediaInfo.tmdbId
                    ? [yield this.tmdb.getTVDetails(mediaInfo.tmdbId)]
                    : yield this.tmdb.searchTV(mediaInfo.name, mediaInfo.year, currentEpisodes);
            }
            else {
                return mediaInfo.tmdbId
                    ? [yield this.tmdb.getMovieDetails(mediaInfo.tmdbId)]
                    : yield this.tmdb.searchMovie(mediaInfo.name, mediaInfo.year);
            }
        });
    }
    _downloadImage(imageUrl) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!imageUrl)
                return;
            try {
                const response = yield got(imageUrl, { responseType: 'buffer' });
                return response.body; // 返回图片的二进制数据
            }
            catch (error) {
                console.error(`下载图片失败 ${imageUrl}:`, error);
            }
        });
    }
}
module.exports = { ScrapeService };
