# HDHive 影巢凭证记录

> ⚠️ 此文件包含敏感凭证，已在 .gitignore 中配置，不会提交到远程仓库。

## 应用凭证

| 配置项 | 值 |
|--------|-----|
| **Client ID** | `app_77452045fdbedee866f44385` |
| **应用 Secret** | `3dbd55699e2deb249c329adbdbf04098` |

## 使用方式

### 方式一：环境变量

```bash
# Linux/macOS
export HDHIVE_CLIENT_ID="app_77452045fdbedee866f44385"
export HDHIVE_SECRET="3dbd55699e2deb249c329adbdbf04098"

# Windows PowerShell
$env:HDHIVE_CLIENT_ID = "app_77452045fdbedee866f44385"
$env:HDHIVE_SECRET = "3dbd55699e2deb249c329adbdbf04098"
```

### 方式二：系统配置文件

在 `data/config.json` 中添加：

```json
{
  "hdhive": {
    "enabled": true,
    "clientId": "app_77452045fdbedee866f44385",
    "secret": "3dbd55699e2deb249c329adbdbf04098"
  }
}
```

## 影巢开放平台

- 官网：https://hdhive.com
- API 文档：https://hdhive.com/api/docs

---

**创建时间**：2026-06-02
