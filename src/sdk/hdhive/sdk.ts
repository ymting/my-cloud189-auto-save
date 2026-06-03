/**
 * HDHive（影巢）SDK
 * 封装影巢 OpenAPI 接口调用，支持 OAuth 用户授权
 */
const ConfigService = require('../../services/ConfigService');
const { logTaskEvent } = require('../../utils/logUtils');
const ProxyUtil = require('../../utils/ProxyUtil');
const got = require('got');
const crypto = require('crypto');

// 网盘类型映射（影巢支持的网盘类型）
const CLOUD_TYPE_MAP: Record<string, { name: string; icon: string; color: string }> = {
  '115': { name: '115网盘', icon: '115', color: '#2196F3' },
  '123': { name: '123云盘', icon: '123', color: '#FF9800' },
  'quark': { name: '夸克网盘', icon: 'quark', color: '#9C27B0' },
  'baidu': { name: '百度网盘', icon: 'baidu', color: '#06A7FF' },
  'ali': { name: '阿里云盘', icon: 'ali', color: '#FF6A00' },
  'xunlei': { name: '迅雷云盘', icon: 'xunlei', color: '#0D47A1' },
  'pikpak': { name: 'PikPak', icon: 'pikpak', color: '#E91E63' },
  'cloud189': { name: '天翼云盘', icon: 'cloud189', color: '#FF6B00' },
  'lenovo': { name: '联想云盘', icon: 'lenovo', color: '#E31837' }
};

// 解锁请求防抖锁（防止重复扣积分）
const unlockLocks = new Map();
const LOCK_TTL = 10 * 60 * 1000; // 10分钟锁有效期

// OAuth 授权状态缓存（用于回调验证）
const oauthStates = new Map();
const OAUTH_STATE_TTL = 10 * 60 * 1000; // 10分钟有效期

class HDHiveSDK {
  private static instance: HDHiveSDK;
  private cache: Map<string, { data: any; expireAt: number }>;
  private readonly cacheTTL: number = 5 * 60 * 1000; // 5分钟缓存

  private constructor() {
    this.cache = new Map();
    // 定期清理过期缓存
    setInterval(() => this.cleanupCache(), 60 * 1000);
    // 定期清理过期 OAuth 状态
    setInterval(() => this.cleanupOAuthStates(), 60 * 1000);
  }

  public static getInstance(): HDHiveSDK {
    if (!HDHiveSDK.instance) {
      HDHiveSDK.instance = new HDHiveSDK();
    }
    return HDHiveSDK.instance;
  }

  /**
   * 清理过期缓存
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (value.expireAt < now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 清理过期 OAuth 状态
   */
  private cleanupOAuthStates(): void {
    const now = Date.now();
    for (const [key, value] of oauthStates.entries()) {
      if (value.expireAt < now) {
        oauthStates.delete(key);
      }
    }
  }

  /**
   * 获取缓存
   */
  private getCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && cached.expireAt > Date.now()) {
      return cached.data;
    }
    return null;
  }

  /**
   * 设置缓存
   */
  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      expireAt: Date.now() + this.cacheTTL
    });
  }

  /**
   * SDK 是否启用
   */
  get enabled(): boolean {
    return !!this.apiKey && ConfigService.getConfigValue('hdhive.enabled', false);
  }

  /**
   * 获取 Client ID（应用公开 ID）
   */
  private get clientId(): string {
    return ConfigService.getConfigValue('hdhive.clientId') || '';
  }

  /**
   * 获取 API Key（应用 Secret）
   */
  private get apiKey(): string {
    return ConfigService.getConfigValue('hdhive.apiKey') || '';
  }

  /**
   * 获取 API 基础地址
   */
  private get baseUrl(): string {
    return ConfigService.getConfigValue('hdhive.baseUrl') || 'https://hdhive.com';
  }

  /**
   * 获取用户 Access Token
   */
  private get accessToken(): string {
    return ConfigService.getConfigValue('hdhive.accessToken') || '';
  }

  /**
   * 获取 Refresh Token
   */
  private get refreshToken(): string {
    return ConfigService.getConfigValue('hdhive.refreshToken') || '';
  }

  /**
   * 获取 Token 过期时间
   */
  private get tokenExpiresAt(): number {
    return ConfigService.getConfigValue('hdhive.tokenExpiresAt') || 0;
  }

  /**
   * 检查用户是否已授权
   */
  get isAuthorized(): boolean {
    return !!this.accessToken && Date.now() < this.tokenExpiresAt;
  }

  /**
   * 检查是否需要 OAuth 授权
   */
  get needsOAuth(): boolean {
    // 如果有 clientId 但没有有效的 accessToken，则需要授权
    return !!this.clientId && !this.isAuthorized;
  }

  /**
   * 构建请求头（仅应用认证）
   */
  private buildHeaders(): Record<string, string> {
    return {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json'
    };
  }

  /**
   * 构建请求头（应用 + 用户认证）
   */
  private buildAuthHeaders(): Record<string, string> {
    return {
      'X-API-Key': this.apiKey,
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * 获取代理配置
   */
  private getProxyAgent(): any {
    return ProxyUtil.getProxyAgent('hdhive');
  }

  /**
   * 保存 Token 到配置
   */
  private saveTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
    const config = ConfigService.getConfig();
    config.hdhive = config.hdhive || {};
    config.hdhive.accessToken = accessToken;
    config.hdhive.refreshToken = refreshToken;
    config.hdhive.tokenExpiresAt = Date.now() + expiresIn * 1000;
    ConfigService.saveConfig(config);
  }

  /**
   * 清除 Token
   */
  clearTokens(): void {
    const config = ConfigService.getConfig();
    if (config.hdhive) {
      config.hdhive.accessToken = '';
      config.hdhive.refreshToken = '';
      config.hdhive.tokenExpiresAt = null;
      ConfigService.saveConfig(config);
    }
  }

  // ==================== OAuth 授权相关 ====================

  /**
   * 生成 OAuth 授权 URL
   * @param redirectUri 回调地址
   * @param scope 请求的权限范围
   */
  getOAuthUrl(redirectUri: string, scope: string = 'query unlock'): { url: string; state: string } {
    if (!this.clientId) {
      throw new Error('影巢 Client ID 未配置');
    }

    // 生成随机 state 用于防 CSRF
    const state = crypto.randomBytes(16).toString('hex');

    // 缓存 state 用于回调验证
    oauthStates.set(state, {
      redirectUri,
      expireAt: Date.now() + OAUTH_STATE_TTL
    });

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: scope,
      state: state,
      response_mode: 'redirect'
    });

    return {
      url: `${this.baseUrl}/openapi/authorize?${params.toString()}`,
      state
    };
  }

  /**
   * 验证 OAuth 回调 state
   */
  validateOAuthState(state: string): boolean {
    const cached = oauthStates.get(state);
    if (!cached) return false;

    oauthStates.delete(state);
    return cached.expireAt > Date.now();
  }

  /**
   * 使用授权码换取 Token
   * @param code 授权码
   * @param redirectUri 回调地址（必须与授权时一致）
   */
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.apiKey) {
      return { success: false, error: '影巢 API Key 未配置' };
    }

    try {
      const { body, statusCode } = await got.post(
        `${this.baseUrl}/api/public/openapi/oauth/token`,
        {
          headers: this.buildHeaders(),
          agent: this.getProxyAgent(),
          json: {
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri
          },
          responseType: 'json',
          timeout: 30000,
          throwHttpErrors: false
        }
      );

      const data = body as any;

      if (statusCode !== 200 || !data.success) {
        return {
          success: false,
          error: data.description || data.message || '授权码换取 Token 失败'
        };
      }

      // 保存 Token
      this.saveTokens(
        data.data.access_token,
        data.data.refresh_token,
        data.data.expires_in
      );

      logTaskEvent('影巢 OAuth 授权成功');
      return { success: true };
    } catch (error: any) {
      logTaskEvent(`影巢 OAuth 授权失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 刷新 Access Token
   */
  async refreshAccessToken(): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.refreshToken) {
      return { success: false, error: 'Refresh Token 未配置，请重新授权' };
    }

    try {
      const { body, statusCode } = await got.post(
        `${this.baseUrl}/api/public/openapi/oauth/refresh`,
        {
          headers: this.buildHeaders(),
          agent: this.getProxyAgent(),
          json: {
            refresh_token: this.refreshToken
          },
          responseType: 'json',
          timeout: 30000,
          throwHttpErrors: false
        }
      );

      const data = body as any;

      if (statusCode === 401 || data.code === 'OPENAPI_REAUTH_REQUIRED') {
        // 需要重新授权
        this.clearTokens();
        return { success: false, error: '授权已过期，请重新授权' };
      }

      if (statusCode !== 200 || !data.success) {
        return {
          success: false,
          error: data.description || data.message || '刷新 Token 失败'
        };
      }

      // 保存新 Token
      this.saveTokens(
        data.data.access_token,
        data.data.refresh_token,
        data.data.expires_in
      );

      logTaskEvent('影巢 Token 刷新成功');
      return { success: true };
    } catch (error: any) {
      logTaskEvent(`影巢 Token 刷新失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 撤销授权
   */
  async revokeAuth(): Promise<{ success: boolean; error?: string }> {
    if (!this.refreshToken) {
      this.clearTokens();
      return { success: true };
    }

    try {
      await got.post(
        `${this.baseUrl}/api/public/openapi/oauth/revoke`,
        {
          headers: this.buildHeaders(),
          agent: this.getProxyAgent(),
          json: {
            refresh_token: this.refreshToken
          },
          responseType: 'json',
          timeout: 10000,
          throwHttpErrors: false
        }
      );
    } catch (e) {
      // 忽略撤销错误
    }

    this.clearTokens();
    return { success: true };
  }

  /**
   * 获取授权状态
   */
  getAuthStatus(): {
    hasClient: boolean;
    hasApiKey: boolean;
    isAuthorized: boolean;
    needsOAuth: boolean;
    tokenExpiresAt: number | null;
  } {
    return {
      hasClient: !!this.clientId,
      hasApiKey: !!this.apiKey,
      isAuthorized: this.isAuthorized,
      needsOAuth: this.needsOAuth,
      tokenExpiresAt: this.tokenExpiresAt || null
    };
  }

  // ==================== 业务接口 ====================

  /**
   * 测试连通性（meta 接口，不需要用户授权）
   */
  async ping(): Promise<{ success: boolean; message: string }> {
    if (!this.apiKey) {
      return { success: false, message: '影巢 API Key 未配置' };
    }

    try {
      const { body, statusCode } = await got.get(`${this.baseUrl}/api/open/ping`, {
        headers: this.buildHeaders(),
        agent: this.getProxyAgent(),
        responseType: 'json',
        timeout: 10000,
        throwHttpErrors: false
      });

      if (statusCode === 401) {
        return { success: false, message: '影巢 API Key 无效或已过期' };
      }

      const data = body as any;
      return { success: true, message: data.data?.message || data.message || 'pong' };
    } catch (error: any) {
      logTaskEvent(`影巢连通性测试失败: ${error.message}`);
      return { success: false, message: `连接失败: ${error.message}` };
    }
  }

  /**
   * 查询积分与配额（meta 接口，不需要用户授权）
   */
  async getQuota(): Promise<{
    success: boolean;
    data?: {
      points: number;
      dailyQuota?: number;
      usedQuota?: number;
    };
    error?: string;
  }> {
    if (!this.apiKey) {
      return { success: false, error: '影巢 API Key 未配置' };
    }

    try {
      const { body, statusCode } = await got.get(`${this.baseUrl}/api/open/quota`, {
        headers: this.buildHeaders(),
        agent: this.getProxyAgent(),
        responseType: 'json',
        timeout: 10000,
        throwHttpErrors: false
      });

      if (statusCode === 401) {
        return { success: false, error: '影巢 API Key 无效或已过期' };
      }

      const data = body as any;
      return { success: true, data: data.data || data };
    } catch (error: any) {
      logTaskEvent(`影巢积分查询失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取当前授权用户信息（query 接口，需要用户授权）
   */
  async getMe(): Promise<{
    success: boolean;
    data?: {
      id: number;
      level: string;
      username: string;
      avatar: string;
    };
    error?: string;
  }> {
    if (!this.isAuthorized) {
      return { success: false, error: '请先进行 OAuth 授权' };
    }

    try {
      const { body, statusCode } = await got.get(`${this.baseUrl}/api/open/me`, {
        headers: this.buildAuthHeaders(),
        agent: this.getProxyAgent(),
        responseType: 'json',
        timeout: 10000,
        throwHttpErrors: false
      });

      if (statusCode === 401) {
        // Token 可能过期，尝试刷新
        const refreshResult = await this.refreshAccessToken();
        if (!refreshResult.success) {
          return { success: false, error: refreshResult.error };
        }
        // 重试
        const retryResult = await got.get(`${this.baseUrl}/api/open/me`, {
          headers: this.buildAuthHeaders(),
          agent: this.getProxyAgent(),
          responseType: 'json',
          timeout: 10000,
          throwHttpErrors: false
        });
        const retryData = retryResult.body as any;
        return { success: true, data: retryData.data };
      }

      const data = body as any;
      return { success: true, data: data.data };
    } catch (error: any) {
      logTaskEvent(`影巢用户信息查询失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 根据 TMDB ID 获取资源列表（query 接口，需要用户授权）
   * @param type 影视类型: movie | tv
   * @param tmdbId TMDB ID
   */
  async getResources(type: 'movie' | 'tv', tmdbId: number | string): Promise<{
    success: boolean;
    data?: any[];
    error?: string;
  }> {
    if (!this.apiKey) {
      return { success: false, error: '影巢 API Key 未配置' };
    }

    if (!this.isAuthorized) {
      return { success: false, error: '请先进行 OAuth 授权', needsOAuth: true } as any;
    }

    // 检查缓存
    const cacheKey = `resources_${type}_${tmdbId}`;
    const cached = this.getCache(cacheKey);
    if (cached) {
      return { success: true, data: cached };
    }

    try {
      const { body, statusCode } = await got.get(
        `${this.baseUrl}/api/open/resources/${type}/${tmdbId}`,
        {
          headers: this.buildAuthHeaders(),
          agent: this.getProxyAgent(),
          responseType: 'json',
          timeout: 30000,
          throwHttpErrors: false
        }
      );

      if (statusCode === 401) {
        const data = body as any;
        // 判断是需要刷新还是重新授权
        if (data.code === 'OPENAPI_REFRESH_REQUIRED') {
          // 尝试刷新 Token
          const refreshResult = await this.refreshAccessToken();
          if (!refreshResult.success) {
            return { success: false, error: refreshResult.error, needsOAuth: true } as any;
          }
          // 重试
          return this.getResources(type, tmdbId);
        } else if (data.code === 'OPENAPI_REAUTH_REQUIRED' || data.code === 'OPENAPI_USER_REQUIRED') {
          return { success: false, error: '授权已过期，请重新授权', needsOAuth: true } as any;
        }
        return { success: false, error: '影巢 API Key 无效或已过期' };
      }

      if (statusCode === 404) {
        return { success: true, data: [] };
      }

      const data = body as any;
      const resources = data.data || data || [];

      // 规范化资源数据
      const normalizedResources = this.normalizeResources(Array.isArray(resources) ? resources : []);

      // 设置缓存
      this.setCache(cacheKey, normalizedResources);

      return { success: true, data: normalizedResources };
    } catch (error: any) {
      const errorDetail = error.code ? `[${error.code}] ` : '';
      logTaskEvent(`影巢资源查询失败: ${errorDetail}${error.message}`);
      let errorMessage = error.message;
      if (error.code === 'ECONNRESET' || error.message?.includes('TLS') || error.message?.includes('socket disconnected')) {
        errorMessage = '网络连接异常，请检查：1) 影巢代理是否正常 2) 网络是否稳定 3) 影巢服务是否可用';
      }
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 规范化资源数据
   */
  private normalizeResources(resources: any[]): any[] {
    return resources.map(res => ({
      id: res.slug || res.id || res.resourceId,
      slug: res.slug,
      title: res.title || res.name,
      cloudType: this.mapCloudType(res.pan_type || res.cloudType || res.drive),
      cloudTypeName: CLOUD_TYPE_MAP[this.mapCloudType(res.pan_type || res.cloudType || res.drive)]?.name || '未知网盘',
      cloudTypeIcon: CLOUD_TYPE_MAP[this.mapCloudType(res.pan_type || res.cloudType || res.drive)]?.icon || 'default',
      cloudTypeColor: CLOUD_TYPE_MAP[this.mapCloudType(res.pan_type || res.cloudType || res.drive)]?.color || '#666',
      size: res.share_size || res.size || res.fileSize,
      sizeFormatted: this.formatSize(res.share_size || res.size || res.fileSize),
      points: res.unlock_points || res.points || res.cost || 0,
      isFree: !res.unlock_points && !res.points && !res.cost,
      expired: res.expired || res.isExpired || false,
      quality: this.extractQuality(res.title || res.name),
      uploader: res.user || res.uploader || res.publisher || {},
      publishedAt: res.publishedAt || res.createTime || '',
      link: res.media_url || res.link || '',
      code: res.access_code || res.code || res.password || '',
      isUnlocked: res.is_unlocked || false
    }));
  }

  /**
   * 映射网盘类型
   */
  private mapCloudType(type: string | number): string {
    if (typeof type === 'number') {
      const typeMap: Record<number, string> = {
        1: '115',
        2: 'quark',
        3: 'ali',
        4: 'baidu',
        5: '123',
        6: 'xunlei',
        7: 'pikpak',
        8: 'cloud189',
        9: 'lenovo'
      };
      return typeMap[type] || 'unknown';
    }

    if (!type) return 'unknown';

    const typeLower = String(type).toLowerCase();
    if (typeLower.includes('115')) return '115';
    if (typeLower.includes('123')) return '123';
    if (typeLower.includes('quark') || typeLower.includes('夸克')) return 'quark';
    if (typeLower.includes('baidu') || typeLower.includes('百度')) return 'baidu';
    if (typeLower.includes('ali') || typeLower.includes('阿里')) return 'ali';
    if (typeLower.includes('xunlei') || typeLower.includes('迅雷')) return 'xunlei';
    if (typeLower.includes('pikpak')) return 'pikpak';
    if (typeLower.includes('cloud189') || typeLower.includes('天翼') || typeLower.includes('电信')) return 'cloud189';
    if (typeLower.includes('lenovo') || typeLower.includes('联想')) return 'lenovo';

    return typeLower;
  }

  /**
   * 提取画质标签
   */
  private extractQuality(title: string): string[] {
    if (!title) return [];
    const qualities: string[] = [];
    const qualityKeywords = [
      { pattern: /4k|2160p/i, label: '4K' },
      { pattern: /1080p/i, label: '1080P' },
      { pattern: /720p/i, label: '720P' },
      { pattern: /remux/i, label: 'REMUX' },
      { pattern: /hdr|hdr10|dolby\s*vision/i, label: 'HDR' },
      { pattern: /atmos|truehd/i, label: 'Atmos' },
      { pattern: /dts-hd|dts:x/i, label: 'DTS-HD' },
      { pattern: /hevc|x265/i, label: 'HEVC' },
      { pattern: /avc|x264/i, label: 'AVC' },
      { pattern: /简中|简体|中字|中英/i, label: '中字' },
      { pattern: /原盘|蓝光/i, label: '原盘' },
      { pattern: /web-dl/i, label: 'WEB-DL' },
      { pattern: /bluray|blu-ray/i, label: 'BluRay' }
    ];

    for (const { pattern, label } of qualityKeywords) {
      if (pattern.test(title) && !qualities.includes(label)) {
        qualities.push(label);
      }
    }

    return qualities;
  }

  /**
   * 格式化文件大小
   */
  private formatSize(bytes: number | string): string {
    if (!bytes) return '未知';
    const size = typeof bytes === 'string' ? parseFloat(bytes) : bytes;
    if (isNaN(size)) return '未知';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let s = size;
    while (s >= 1024 && i < units.length - 1) {
      s /= 1024;
      i++;
    }
    return `${s.toFixed(1)} ${units[i]}`;
  }

  /**
   * 解锁资源（unlock 接口，需要用户授权）
   * @param slug 资源 slug
   */
  async unlockResource(slug: string): Promise<{
    success: boolean;
    data?: {
      link: string;
      code?: string;
      fullUrl?: string;
      points: number;
    };
    error?: string;
  }> {
    if (!this.apiKey) {
      return { success: false, error: '影巢 API Key 未配置' };
    }

    if (!this.isAuthorized) {
      return { success: false, error: '请先进行 OAuth 授权', needsOAuth: true } as any;
    }

    // 检查防抖锁
    if (unlockLocks.has(slug)) {
      const lockTime = unlockLocks.get(slug);
      if (Date.now() - lockTime < LOCK_TTL) {
        return { success: false, error: '该资源正在处理中，请勿重复操作' };
      }
    }

    // 设置锁
    unlockLocks.set(slug, Date.now());

    try {
      const { body, statusCode } = await got.post(
        `${this.baseUrl}/api/open/resources/unlock`,
        {
          headers: this.buildAuthHeaders(),
          agent: this.getProxyAgent(),
          json: { slug: slug },
          responseType: 'json',
          timeout: 30000,
          throwHttpErrors: false
        }
      );

      const data = body as any;

      if (statusCode === 401) {
        unlockLocks.delete(slug);
        if (data.code === 'OPENAPI_REFRESH_REQUIRED') {
          const refreshResult = await this.refreshAccessToken();
          if (!refreshResult.success) {
            return { success: false, error: refreshResult.error, needsOAuth: true } as any;
          }
          // 重试
          return this.unlockResource(slug);
        } else if (data.code === 'OPENAPI_REAUTH_REQUIRED' || data.code === 'OPENAPI_USER_REQUIRED') {
          return { success: false, error: '授权已过期，请重新授权', needsOAuth: true } as any;
        }
        return { success: false, error: '影巢 API Key 无效或已过期' };
      }

      if (statusCode === 402) {
        unlockLocks.delete(slug);
        return { success: false, error: '积分不足，无法解锁该资源' };
      }

      if (statusCode === 200 || data.success) {
        // 解锁成功，清除缓存
        this.cache.clear();
        unlockLocks.delete(slug);

        return {
          success: true,
          data: {
            link: data.data?.url || data.data?.link || '',
            code: data.data?.access_code || data.data?.code || '',
            fullUrl: data.data?.full_url || '',
            points: data.data?.points || 0
          }
        };
      }

      unlockLocks.delete(slug);
      return { success: false, error: data.description || data.message || '解锁失败' };
    } catch (error: any) {
      unlockLocks.delete(slug);
      logTaskEvent(`影巢资源解锁失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 清除所有缓存
   */
  clearCache(): void {
    this.cache.clear();
    logTaskEvent('影巢 SDK 缓存已清除');
  }
}

export default HDHiveSDK.getInstance();
