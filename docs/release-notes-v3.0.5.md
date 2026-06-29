## v3.0.5

### ✨ 新功能

- **任务文件夹名追加 [tmdb-xxx] 标记** (Issue #28)
  - 为已绑定 TMDB ID 的任务，在云盘文件夹名末尾追加 `[tmdb-{id}]` 标记
  - 方便 Emby / Jellyfin / Plex 等媒体管理工具通过 TMDB ID 直接精准匹配影视条目
  - 避免标题翻译/别名/年份不同导致的刮削歧义或失败
  - **默认关闭**（不影响现有 Emby 库），需在「系统设置 → 任务设置」主动开启
  - 开启后只对新任务生效；历史任务提供 **"迁移历史任务"** 按钮手动迁移
  - 迁移过程 4 阶段：预览 → 二次确认 → 执行 → 结果汇总（带安全防御）
  - 工具函数 `appendTmdbIdToFolderName` 单元测试 22/22 通过
  - 涉及文件：`src/utils/folderNameUtils.js`（新增）、`src/services/task.js`、`src/index.js`、`src/public/index.html`、`src/public/js/settings.js`、`src/public/js/main.js`

### 📖 用户文档

- 📄 [任务文件夹追加 [tmdb-xxx] 标记 — 用户使用指南](./issue-28-tmdbid-folder-tag-user-guide.md)
- 📐 [设计文档](./superpowers/specs/2026-06-29-tmdbid-folder-tag-design.md)

### 📦 升级说明

1. 拉取最新代码：`git pull`
2. 重新安装依赖：`yarn install`（如有新增依赖，本版本无）
3. 重新编译：`yarn build`
4. 重启服务：`pm2 restart cloud189-auto-save`
5. 验证：
   - 进入「系统设置 → 任务设置」找到新选项
   - 点击 ❓ 图标查看功能说明
   - 开启开关后创建新任务，确认云盘文件夹名末尾出现 `[tmdb-xxx]` 标记

### ⚠️ 重要提示

- 本功能**默认关闭**，不开启则无任何影响
- 开启开关**不会**自动迁移历史任务，避免误改 Emby 库
- 迁移操作会**修改云盘文件夹名**，请确认无问题后再执行
- 如需回退，关闭开关即可（新任务不再追加），已迁移的任务需手动还原

### 🔗 相关链接

- Issue: https://github.com/ymting/my-cloud189-auto-save/issues/28
- 设计文档: docs/superpowers/specs/2026-06-29-tmdbid-folder-tag-design.md
- 用户指南: docs/issue-28-tmdbid-folder-tag-user-guide.md
