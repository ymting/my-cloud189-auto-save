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
const got = require('got');
const ConfigService = require('./ConfigService');
const ProxyUtil = require('../utils/ProxyUtil');
class TMDBService {
    constructor() {
        this.apiKey = ConfigService.getConfigValue('tmdb.tmdbApiKey') || ConfigService.getConfigValue('tmdb.apiKey');
        this.baseURL = 'https://api.themoviedb.org/3';
        this.language = 'zh-CN';
    }
    _request(endpoint_1) {
        return __awaiter(this, arguments, void 0, function* (endpoint, params = {}) {
            const proxy = ProxyUtil.getProxyAgent('tmdb');
            const maxRetries = 3;
            const timeout = 10000;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const options = {
                        searchParams: Object.assign({ language: this.language }, params),
                        agent: proxy,
                        timeout: {
                            request: timeout
                        },
                        retry: {
                            limit: 0
                        }
                    };
                    // 支持 v4 的 Bearer Token (通常是很长的 JWT)
                    if (this.apiKey && this.apiKey.length > 50) {
                        options.headers = {
                            Authorization: `Bearer ${this.apiKey}`
                        };
                    }
                    else {
                        options.searchParams.api_key = this.apiKey;
                    }
                    const response = yield got(`${this.baseURL}${endpoint}`, options).json();
                    return response;
                }
                catch (error) {
                    const isProxyIssue = !proxy.https && (error.message.includes('ETIMEDOUT') ||
                        error.message.includes('ECONNREFUSED'));
                    let errorMessage = error.message;
                    if (error.response && error.response.statusCode === 401) {
                        errorMessage = 'TMDB API Key 无效或未正确配置 (401 Unauthorized)';
                    }
                    if (isProxyIssue && attempt === 1) {
                        console.error(`TMDB请求失败 [${endpoint}]: 未配置代理或代理不可用，无法访问TMDB API`);
                        console.error(`建议：在配置文件中设置代理 (proxy.services.tmdb: true)`);
                    }
                    else {
                        console.error(`TMDB请求失败 [${endpoint}] (尝试 ${attempt}/${maxRetries}):`, {
                            message: errorMessage
                        });
                    }
                    if (attempt === maxRetries) {
                        if (error.response && error.response.statusCode === 401) {
                            throw new Error(`TMDB请求失败: ${errorMessage}，请检查系统设置中的 TMDB API Key`);
                        }
                        throw new Error(`TMDB请求失败: ${isProxyIssue ? '请配置代理后重试' : errorMessage}`);
                    }
                    yield new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        });
    }
    search(title_1) {
        return __awaiter(this, arguments, void 0, function* (title, year = '') {
            try {
                console.log(`TMDB搜索：${title}，年份：${year}`);
                const response = yield this._request('/search/multi', {
                    query: title,
                    year: year
                });
                console.log(`TMDB搜索结果数量：${response.results.length}`);
                // 分离电影和电视剧结果
                const movies = response.results
                    .filter(item => item.media_type === 'movie')
                    .map(item => ({
                    id: item.id,
                    title: item.title,
                    originalTitle: item.original_title,
                    overview: item.overview,
                    releaseDate: item.release_date,
                    posterPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` : '',
                    voteAverage: item.vote_average,
                    type: 'movie'
                }));
                const tvShows = response.results
                    .filter(item => item.media_type === 'tv')
                    .map(item => ({
                    id: item.id,
                    title: item.name,
                    originalTitle: item.original_name,
                    overview: item.overview,
                    releaseDate: item.first_air_date,
                    posterPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` : '',
                    voteAverage: item.vote_average,
                    type: 'tv'
                }));
                return {
                    movies: movies.slice(0, 5),
                    tvShows: tvShows.slice(0, 5)
                };
            }
            catch (error) {
                throw new Error(`TMDB搜索失败: ${error.message}`);
            }
        });
    }
    searchMovie(title_1) {
        return __awaiter(this, arguments, void 0, function* (title, year = '') {
            try {
                const movies = yield this._searchMedia('movie', title, year, 1);
                return movies;
            }
            catch (error) {
                throw new Error(`TMDB电影搜索失败: ${error.message}`);
            }
        });
    }
    searchTV(title_1) {
        return __awaiter(this, arguments, void 0, function* (title, year = '', currentEpisodes) {
            try {
                const tvShows = yield this._searchMedia('tv', title, year, currentEpisodes);
                return tvShows;
            }
            catch (error) {
                throw new Error(`TMDB电视剧搜索失败: ${error.message}`);
            }
        });
    }
    // 按类型搜索，返回标准化平铺列表（供企微/TG bot选择用）
    searchByType(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, type = 'tv') {
            try {
                const endpoint = type === 'movie' ? '/search/movie' : '/search/tv';
                const response = yield this._request(endpoint, { query });
                return (response.results || []).map(item => ({
                    id: item.id,
                    title: item.title || item.name,
                    name: item.name || item.title,
                    original_title: item.original_title || item.original_name,
                    original_name: item.original_name || item.original_title,
                    release_date: item.release_date || item.first_air_date,
                    first_air_date: item.first_air_date || item.release_date,
                    poster_path: item.poster_path,
                    overview: item.overview,
                    vote_average: item.vote_average
                }));
            }
            catch (e) {
                throw new Error(`TMDB搜索失败: ${e.message}`);
            }
        });
    }
    _searchMedia(type_1, title_1, year_1) {
        return __awaiter(this, arguments, void 0, function* (type, title, year, currentEpisodes = 0) {
            console.log(`TMDB搜索${type}：${title}，年份：${year}，已有集数：${currentEpisodes}`);
            // 发起搜索请求
            const response = yield this._request(`/search/${type}`, {
                query: title,
                year: year
            });
            const count = response.results.length;
            console.log(`TMDB搜索${type}结果数量：${count}`);
            if (!count) {
                return null;
            }
            // 按年份倒序排序
            const sortedResults = response.results.sort((a, b) => {
                const dateA = type === 'movie' ? a.release_date : a.first_air_date;
                const dateB = type === 'movie' ? b.release_date : b.first_air_date;
                return new Date(dateB) - new Date(dateA);
            });
            // 获取前3个结果的详细信息
            const detailPromises = sortedResults.slice(0, 3).map((media) => __awaiter(this, void 0, void 0, function* () {
                if (type === 'tv') {
                    return yield this.getTVDetails(media.id);
                }
                return yield this.getMovieDetails(media.id);
            }));
            const details = yield Promise.all(detailPromises);
            // 分析最匹配的结果
            const bestMatch = details.reduce((best, current) => {
                if (!current)
                    return best;
                let score = 0;
                let scoreDetails = [];
                // 1. 标题完全匹配加分
                if (current.title.toLowerCase() === title.toLowerCase()) {
                    score += 10;
                    scoreDetails.push('完全匹配+10');
                }
                // 2. 标题包含关系加分（避免匹配到花絮、纪录片等）
                const titleLower = title.toLowerCase();
                const currentTitleLower = current.title.toLowerCase();
                if (currentTitleLower.includes(titleLower) || titleLower.includes(currentTitleLower)) {
                    // 标题长度越接近，分数越高
                    const lengthDiff = Math.abs(current.title.length - title.length);
                    if (lengthDiff <= 2) {
                        score += 8;
                        scoreDetails.push(`包含(长度差${lengthDiff})+8`);
                    }
                    else if (lengthDiff <= 5) {
                        score += 5;
                        scoreDetails.push(`包含(长度差${lengthDiff})+5`);
                    }
                    else {
                        score += 1;
                        scoreDetails.push(`包含(长度差${lengthDiff})+1`);
                    }
                }
                // 3. 原标题匹配加分（重要！处理中英文差异）
                if (current.originalTitle) {
                    const originalTitleLower = current.originalTitle.toLowerCase();
                    if (originalTitleLower === titleLower) {
                        score += 10;
                        scoreDetails.push('原名完全匹配+10');
                    }
                    else if (originalTitleLower.includes(titleLower) || titleLower.includes(originalTitleLower)) {
                        const lengthDiff = Math.abs(current.originalTitle.length - title.length);
                        if (lengthDiff <= 2) {
                            score += 8;
                            scoreDetails.push(`原名包含(长度差${lengthDiff})+8`);
                        }
                        else if (lengthDiff <= 5) {
                            score += 5;
                            scoreDetails.push(`原名包含(长度差${lengthDiff})+5`);
                        }
                    }
                }
                // 4. 年份匹配加分
                const mediaYear = new Date(current.releaseDate).getFullYear();
                if (year && mediaYear === parseInt(year)) {
                    score += 5;
                    scoreDetails.push(`年份匹配(${mediaYear})+5`);
                }
                // 5. 票数加分（热门内容优先）
                if (current.voteCount && current.voteCount > 1000) {
                    score += 5;
                    scoreDetails.push(`票数(${current.voteCount})+5`);
                }
                else if (current.voteCount && current.voteCount > 100) {
                    score += 3;
                    scoreDetails.push(`票数(${current.voteCount})+3`);
                }
                else if (current.voteCount && current.voteCount > 10) {
                    score += 2;
                    scoreDetails.push(`票数(${current.voteCount})+2`);
                }
                // 6. 评分加分
                if (current.voteAverage && current.voteAverage > 8) {
                    score += 3;
                    scoreDetails.push(`评分(${current.voteAverage})+3`);
                }
                else if (current.voteAverage && current.voteAverage > 7) {
                    score += 2;
                    scoreDetails.push(`评分(${current.voteAverage})+2`);
                }
                // 7. TV剧集特殊处理
                if (type === 'tv' && currentEpisodes > 0) {
                    // 如果是连载中的剧集，且已有集数小于总集数，优先级更高
                    if (current.status === 'Returning Series' && currentEpisodes <= current.lastEpisodeToAir.episode_number) {
                        score += 5;
                    }
                    // 如果已完结，且已有集数接近或等于总集数
                    if (current.status === 'Ended' && Math.abs(current.lastEpisodeToAir.episode_number - currentEpisodes) <= 2) {
                        score += 5;
                    }
                    // 如果已有集数大于总集数，降低优先级
                    if (currentEpisodes > current.lastEpisodeToAir.episode_number) {
                        score -= 3;
                    }
                    console.log(`匹配分析 - ${current.title}: 分数=${score}, 最近一次集数=${current.lastEpisodeToAir.episode_number}, 已有集数=${currentEpisodes}, 状态=${current.status}`);
                }
                console.log(`  - "${current.title}": 分数=${score} (${scoreDetails.join(', ')})`);
                return (!best || score > best.score) ? Object.assign(Object.assign({}, current), { score }) : best;
            }, null);
            console.log(`最佳匹配结果: ${bestMatch === null || bestMatch === void 0 ? void 0 : bestMatch.title}, 分数: ${bestMatch === null || bestMatch === void 0 ? void 0 : bestMatch.score}`);
            console.log("根据TMDBID获取详情");
            if (type == 'tv') {
                return this.getTVDetails(bestMatch.id);
            }
            return this.getMovieDetails(bestMatch.id);
        });
    }
    getTVDetails(id) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            try {
                const response = yield this._request(`/tv/${id}`, {
                    append_to_response: 'credits,images'
                });
                // 如果没有图片信息，使用英文重新获取
                if (!((_b = (_a = response.images) === null || _a === void 0 ? void 0 : _a.logos) === null || _b === void 0 ? void 0 : _b.length)) {
                    const imagesResponse = yield this._request(`/tv/${id}/images`, {
                        language: '' // 置空语言以获取所有图片
                    });
                    response.images = imagesResponse;
                }
                // 获取英文标题用于匹配（解决中文标题与英文搜索词不匹配的问题）
                let englishTitle = null;
                try {
                    const enResponse = yield this._request(`/tv/${id}`, {
                        language: 'en-US'
                    });
                    englishTitle = enResponse.name; // TV使用name字段
                }
                catch (e) {
                    // 忽略错误
                }
                return {
                    id: response.id,
                    title: response.name,
                    originalTitle: response.original_name,
                    englishTitle: englishTitle, // 英文标题
                    overview: response.overview,
                    releaseDate: response.first_air_date,
                    posterPath: response.poster_path ? `https://image.tmdb.org/t/p/w500${response.poster_path}` : null,
                    backdropPath: response.backdrop_path ? `https://image.tmdb.org/t/p/w500${response.backdrop_path}` : null,
                    logoPath: ((_e = (_d = (_c = response.images) === null || _c === void 0 ? void 0 : _c.logos) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.file_path) ? `https://image.tmdb.org/t/p/w500${response.images.logos[0].file_path}` : null,
                    voteAverage: response.vote_average,
                    voteCount: response.vote_count,
                    cast: ((_f = response.credits) === null || _f === void 0 ? void 0 : _f.cast) || [],
                    type: 'tv',
                    totalSeasons: response.number_of_seasons || 0, // 同时添加总季数
                    seasons: response.seasons,
                    lastEpisodeToAir: response.last_episode_to_air,
                    status: response.status,
                };
            }
            catch (error) {
                console.error(`获取电视剧详情失败: ${error.message}`);
                return null;
            }
        });
    }
    getMovieDetails(id) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            try {
                const response = yield this._request(`/movie/${id}`, {
                    append_to_response: 'credits,images'
                });
                // 如果没有图片信息，使用英文重新获取
                if (!((_b = (_a = response.images) === null || _a === void 0 ? void 0 : _a.logos) === null || _b === void 0 ? void 0 : _b.length)) {
                    const imagesResponse = yield this._request(`/movie/${id}/images`, {
                        language: '' // 置空语言以获取所有图片
                    });
                    response.images = imagesResponse;
                }
                // 获取英文标题用于匹配
                let englishTitle = null;
                try {
                    const enResponse = yield this._request(`/movie/${id}`, {
                        language: 'en-US'
                    });
                    englishTitle = enResponse.title;
                }
                catch (e) {
                    // 忽略错误
                }
                return {
                    id: response.id,
                    title: response.title,
                    originalTitle: response.original_title,
                    englishTitle: englishTitle, // 英文标题
                    overview: response.overview,
                    releaseDate: response.release_date,
                    posterPath: response.poster_path ? `https://image.tmdb.org/t/p/w500${response.poster_path}` : null,
                    logoPath: ((_e = (_d = (_c = response.images) === null || _c === void 0 ? void 0 : _c.logos) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.file_path) ? `https://image.tmdb.org/t/p/w500${response.images.logos[0].file_path}` : null,
                    voteAverage: response.vote_average,
                    voteCount: response.vote_count,
                    cast: ((_f = response.credits) === null || _f === void 0 ? void 0 : _f.cast) || [],
                    type: 'movie'
                };
            }
            catch (error) {
                console.error(`获取电影详情失败: ${error.message}`);
                return null;
            }
        });
    }
    getEpisodeDetails(showId, season, episode) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                console.log('获取剧集信息:', showId, season, episode);
                const response = yield this._request(`/tv/${showId}/season/${season}/episode/${episode}`, { append_to_response: 'credits' });
                return Object.assign(Object.assign({}, response), { stillPath: response.still_path ? `https://image.tmdb.org/t/p/w500${response.still_path}` : null, cast: ((_a = response.credits) === null || _a === void 0 ? void 0 : _a.cast) || [] });
            }
            catch (error) {
                console.error(`获取剧集详情失败: ${error.message}`);
                return null;
            }
        });
    }
}
module.exports = { TMDBService };
