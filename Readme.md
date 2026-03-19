<div align="center">
    <img src="img/cloud189.png" alt="Logo" width="200">
    <h1>cloud189-auto-save (🚀 二开定制版)</h1>
    <p>天翼云盘自动转存系统，该版本基于原版进行深度体验优化，强化了 AI 智能化重命名和手动干预机制。</p>
    <a href="https://github.com/ymting/my-cloud189-auto-save/packages/1885489/versions">
        <img src="https://img.shields.io/badge/Docker-Images-blue?style=flat-square&logo=docker" alt="Docker">
    </a>
</div>

## 🌟 二开定制功能亮点

本项目在[原版系统](https://github.com/1307super/cloud189-auto-save)（参见 `README_orig.md`）基础上，着重针对**影视重命名**与**部署自动化**进行了二次开发（Fork版），核心特性如下：

### 1. 手动强制绑定 TMDB (AI 纠错杀手锏)
在原版中，如果 `AI / TMDB` API 匹配不出正确的刮削名（如英文名、生僻译名），任务会反复报错或被错误重命名。
在这个二开版中，我们加入了“最高优先级”的**手动干预机制**：
- **直观的搜索入口**：在`文件列表`界面点击【指定TMDB】，直接弹出附带海报的 TMDB 精确搜索界面。
- **记录永久固化**：一旦你手动选择了一部电影或剧集，系统会将这个中文名称和 `TMDB ID` 永远写入 SQLite 数据库（重启不丢）。
- **立即生效**：AI 会立刻停止猜测，100% 遵照你手动绑定的结果重新洗刷并重命名任务文件。

### 2. 失败预警与推送（TG / 微信）
当后台自动转存某个带有年份缺失或格式奇怪的视频时，如果自动匹配 TMDB 彻底失败并且没有经过人工绑定，**任务将自动挂起，并通过配置的群消息（企业微信/Telegram/Bark等）直接推送到你的手机**，而不是默默出错。你可以点开手机通知，回电脑“手动指定”一键修正。

### 3. 可视化体验与核心转存优化
- **(新)** 完美支持任务“资源链接”与“访问码”随时修改更新，转存目标文件夹将智能继承你最初的设定。
- **(新)** 新增底层视频去重机制（自动检测基础名称相同的冗余同名视频如 .mkv 与 .mp4 并清理，自动放过脱离查重范围的字幕等非媒体文件）。
- 解决了一些弹窗的 `z-index` 遮挡 Bug。
- 在“AI 重命名”二次确认中，清晰高亮展示当前人工绑定的名称和 ID，心里有底再执行。
- 后台日志 `logTaskEvent` 更加详细，重命名每一步思路清晰可见。

### 4. 自动化 Docker 构建 (GHCR)
- 内置 GitHub Actions 工作流（`ghcr-docker-image.yml`）。
- **只要一 Push 代码到 `main` 分支**，GitHub 就会免费在后台帮你打包并推送至 Github Container Registry (`ghcr.io`)。
- 在任何机器上只需要拉取自己的私服镜像 `docker pull ghcr.io/<你的用户名>/my-cloud189-auto-save:latest` 即可无缝部署！

---

## 🛠️ Docker 快速部署

如果你 Fork 了本项目，并开启了 GHCR 的自动构建，你可以这样运行你的定制版：

```bash
docker run -d \
  -v /yourpath/data:/home/data \
  -v /yourpath/strm:/home/strm \
  -p 3000:3000 \
  --restart unless-stopped \
  --name cloud189 \
  -e PUID=0 \
  -e PGID=0 \
  ghcr.io/ymting/my-cloud189-auto-save:latest
```
*(把 `ymting` 替换为你自己的 Github 用户名即可，前提是你的 Packages 权限设为了 Public)*

访问 `http://localhost:3000` 即可开始使用，默认账号密码：`admin` / `admin`。

---

## 📜 鸣谢与原说明

本项目核心逻辑源于天翼云盘自动转存神器。有关**账号抓取 Cookie**、**STRM 生成**、**Emby 自动入库**、**TG 机器人配置指令**等全套原版详细指南，请仔细查阅项目根目录下的 [README_orig.md](./README_orig.md)。
