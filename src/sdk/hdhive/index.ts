/**
 * HDHive（影巢）路由注册
 */
import { Application } from 'express';
import hdhiveSDK from './sdk';
const { logTaskEvent } = require('../../utils/logUtils');

export function setupHDHiveRoutes(app: Application) {
  /**
   * 测试连通性
   * GET /api/hdhive/ping
   */
  app.get('/api/hdhive/ping', async (req, res) => {
    try {
      const result = await hdhiveSDK.ping();
      res.json(result);
    } catch (error: any) {
      logTaskEvent(`影巢连通性测试异常: ${error.message}`);
      res.json({ success: false, message: error.message });
    }
  });

  /**
   * 查询积分与配额
   * GET /api/hdhive/quota
   */
  app.get('/api/hdhive/quota', async (req, res) => {
    try {
      const result = await hdhiveSDK.getQuota();
      res.json(result);
    } catch (error: any) {
      logTaskEvent(`影巢积分查询异常: ${error.message}`);
      res.json({ success: false, error: error.message });
    }
  });

  /**
   * 根据 TMDB ID 获取资源列表
   * GET /api/hdhive/resources?type=movie&tmdbId=123
   */
  app.get('/api/hdhive/resources', async (req, res) => {
    try {
      const { type, tmdbId } = req.query;

      if (!type || !['movie', 'tv'].includes(type as string)) {
        return res.status(400).json({
          success: false,
          error: 'type 参数必须为 movie 或 tv'
        });
      }

      if (!tmdbId) {
        return res.status(400).json({
          success: false,
          error: 'tmdbId 参数必填'
        });
      }

      const result = await hdhiveSDK.getResources(type as 'movie' | 'tv', tmdbId as string);
      res.json(result);
    } catch (error: any) {
      logTaskEvent(`影巢资源查询异常: ${error.message}`);
      res.json({ success: false, error: error.message });
    }
  });

  /**
   * 解锁资源
   * POST /api/hdhive/unlock
   * Body: { resourceId: string }
   */
  app.post('/api/hdhive/unlock', async (req, res) => {
    try {
      const { resourceId } = req.body;

      if (!resourceId) {
        return res.status(400).json({
          success: false,
          error: 'resourceId 参数必填'
        });
      }

      const result = await hdhiveSDK.unlockResource(resourceId);
      res.json(result);
    } catch (error: any) {
      logTaskEvent(`影巢资源解锁异常: ${error.message}`);
      res.json({ success: false, error: error.message });
    }
  });

  /**
   * 清除缓存
   * POST /api/hdhive/cache/clear
   */
  app.post('/api/hdhive/cache/clear', async (req, res) => {
    try {
      hdhiveSDK.clearCache();
      res.json({ success: true, message: '缓存已清除' });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });
}

/**
 * 清除 SDK 缓存（供配置变更时调用）
 */
export function clearHDHiveCache() {
  hdhiveSDK.clearCache();
}
