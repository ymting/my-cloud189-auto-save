let customPushConfigs = []
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const data = await response.json();
        if (data.success) {
            const settings = data.data;
            // 系统apiKey
            document.getElementById('systemApiKey').value = settings.system?.apiKey || '';
            // 任务设置
            document.getElementById('taskExpireDays').value = settings.task?.taskExpireDays || 3;
            document.getElementById('taskCheckCron').value = settings.task?.taskCheckCron || '0 19-23 * * *';
            document.getElementById('cleanRecycleCron').value = settings.task?.cleanRecycleCron || '0 */8 * * * ';
            document.getElementById('taskMaxRetries').value = settings.task?.maxRetries || 3;
            document.getElementById('taskRetryInterval').value = settings.task?.retryInterval || 300;
            document.getElementById('enableAutoClearRecycle').checked = settings.task?.enableAutoClearRecycle || false;
            document.getElementById('enableAutoClearFamilyRecycle').checked = settings.task?.enableAutoClearFamilyRecycle || false;
            document.getElementById('mediaSuffix').value = settings.task?.mediaSuffix || '.mkv;.iso;.ts;.mp4;.avi;.rmvb;.wmv;.m2ts;.mpg;.flv;.rm;.mov';
            document.getElementById('enableOnlySaveMedia').checked = settings.task?.enableOnlySaveMedia || false;
            document.getElementById('enableAutoCreateFolder').checked = settings.task?.enableAutoCreateFolder || false;
            document.getElementById('enableCasRapidUpload').checked = settings.task?.enableCasRapidUpload ?? true;
            document.getElementById('enableDeleteCasFile').checked = settings.task?.enableDeleteCasFile ?? true;
            document.getElementById('enableCasFamilyTransfer').checked = settings.task?.enableCasFamilyTransfer ?? true;
            // casFamilyFolderId 已移除，改为账号级配置（Account.familyFolderId）
            document.getElementById('enableDeleteFamilyTempFile').checked = settings.task?.enableDeleteFamilyTempFile ?? true;
            
            // 天翼云盘特色功能
            document.getElementById('enableAutoCheckin').checked = settings.task?.enableAutoCheckin ?? true;
            document.getElementById('checkinCron').value = settings.task?.checkinCron || '15 1 * * *';
            document.getElementById('enableStorageAggregation').checked = settings.task?.enableStorageAggregation ?? true;

            const toggleCheckinCron = () => {
                const container = document.getElementById('checkinCronContainer');
                if (container) {
                    container.style.display = document.getElementById('enableAutoCheckin').checked ? 'flex' : 'none';
                }
            };
            document.getElementById('enableAutoCheckin').removeEventListener('change', toggleCheckinCron);
            document.getElementById('enableAutoCheckin').addEventListener('change', toggleCheckinCron);
            toggleCheckinCron();

            // 企业微信设置
            document.getElementById('enableWecom').checked = settings.wecom?.enable || false;
            document.getElementById('wecomWebhook').value = settings.wecom?.webhook || '';
            // 企业微信自建应用设置
            document.getElementById('wecomCorpId').value = settings.wecom?.corpId || '';
            document.getElementById('wecomAppId').value = settings.wecom?.appId || '';
            document.getElementById('wecomAppSecret').value = settings.wecom?.appSecret || '';
            document.getElementById('wecomCallbackToken').value = settings.wecom?.callbackToken || '';
            document.getElementById('wecomCallbackAesKey').value = settings.wecom?.callbackEncodingAESKey || '';
            document.getElementById('wecomCallbackEnabled').checked = settings.wecom?.callbackEnabled || false;
            
            // Telegram 设置
            document.getElementById('enableTelegram').checked = settings.telegram?.enable || false;
            document.getElementById('proxyDomain').value = settings.telegram?.proxyDomain || '';
            document.getElementById('telegramBotToken').value = settings.telegram?.botToken || '';
            document.getElementById('telegramChatId').value = settings.telegram?.chatId || '';
            
            // WXPusher 设置
            document.getElementById('enableWXPusher').checked = settings.wxpusher?.enable || false;
            document.getElementById('wXPusherSPT').value = settings.wxpusher?.spt || '';
            
            // 代理设置
            document.getElementById('proxyHost').value = settings.proxy?.host || '';
            document.getElementById('proxyPort').value = settings.proxy?.port || '';
            document.getElementById('proxyUsername').value = settings.proxy?.username || '';
            document.getElementById('proxyPassword').value = settings.proxy?.password || '';
            document.getElementById('proxyTelegram').checked = settings.proxy?.services?.telegram || false;
            document.getElementById('proxyTmdb').checked = settings.proxy?.services?.tmdb || false;
            document.getElementById('proxyOpenAI').checked = settings.proxy?.services?.openai || false;
            document.getElementById('proxyCloud189').checked = settings.proxy?.services?.cloud189 || false;
            document.getElementById('proxyCustomPush').checked = settings.proxy?.services?.customPush || false;
            // Bark 设置
            document.getElementById('enableBark').checked = settings.bark?.enable || false;
            document.getElementById('barkServerUrl').value = settings.bark?.serverUrl || '';
            document.getElementById('barkKey').value = settings.bark?.key || '';

            // 账号密码设置
            document.getElementById('systemUserName').value = settings.system?.username || '';
            document.getElementById('systemPassword').value = settings.system?.password || '';
            
            const enableStrm = settings.strm?.enable || false
            const enableEmby = settings.emby?.enable || false
            // 媒体信息设置
            document.getElementById('enableStrm').checked = enableStrm;
            document.getElementById('enableEmby').checked = enableEmby;
            document.getElementById('embyServer').value = settings.emby?.serverUrl || '';
            document.getElementById('embyApiKey').value = settings.emby?.apiKey || '';

            // tg机器人设置
            document.getElementById('enableTgBot').checked = settings.telegram?.bot?.enable || false;
            document.getElementById('tgBotToken').value = settings.telegram?.bot?.botToken || '';
            document.getElementById('tgBotChatId').value = settings.telegram?.bot?.chatId || '';
            // cloudSaver设置
            document.getElementById('cloudSaverUrl').value = settings.cloudSaver?.baseUrl || '';
            document.getElementById('cloudSaverUsername').value = settings.cloudSaver?.username || '';
            document.getElementById('cloudSaverPassword').value = settings.cloudSaver?.password || '';
            // 刮削
            document.getElementById('enableScraper').checked = settings.tmdb?.enableScraper || false;
            // tmdbkey
            document.getElementById('tmdbApiKey').value = settings.tmdb?.tmdbApiKey || '';

            // openai配置
            document.getElementById('enableOpenAI').checked = settings.openai?.enable || false;
            document.getElementById('openaiBaseUrl').value = settings.openai?.baseUrl || '';
            document.getElementById('openaiApiKey').value = settings.openai?.apiKey || '';
            document.getElementById('openaiModel').value = settings.openai?.model || '';
            document.getElementById('openaiTemplate').value = settings.openai?.rename?.template || '';
            document.getElementById('openaiMovieTemplate').value = settings.openai?.rename?.movieTemplate || '';

            // alist
            document.getElementById('enableAlist').checked = settings.alist?.enable || false;
            document.getElementById('alistServer').value = settings.alist?.baseUrl || '';
            document.getElementById('alistApiKey').value = settings.alist?.apiKey || '';

            // hdhive 影巢
            document.getElementById('enableHDHive').checked = settings.hdhive?.enabled || false;
            document.getElementById('hdhiveApiKey').value = settings.hdhive?.apiKey || '';
            document.getElementById('hdhiveBaseUrl').value = settings.hdhive?.baseUrl || '';
            // 网盘过滤配置
            const cloudFilter = settings.hdhive?.cloudFilter || {};
            document.getElementById('hdhiveCloud115').checked = cloudFilter['115'] !== false;
            document.getElementById('hdhiveCloudQuark').checked = cloudFilter['quark'] !== false;
            document.getElementById('hdhiveCloudAli').checked = cloudFilter['ali'] !== false;
            document.getElementById('hdhiveCloudBaidu').checked = cloudFilter['baidu'] !== false;
            document.getElementById('hdhiveCloud123').checked = cloudFilter['123'] !== false;
            document.getElementById('hdhiveCloudXunlei').checked = cloudFilter['xunlei'] === true;
            document.getElementById('hdhiveCloudPikpak').checked = cloudFilter['pikpak'] === true;

            // pushplus
            document.getElementById('enablePushPlus').checked = settings.pushplus?.enable || false;
            document.getElementById('pushplusToken').value = settings.pushplus?.token || '';
            document.getElementById('pushplusTopic').value = settings.pushplus?.topic || '';
            document.getElementById('pushplusChannel').value = settings.pushplus?.channel || '';
            document.getElementById('pushplusWebhook').value = settings.pushplus?.webhook || '';
            document.getElementById('pushplusTo').value = settings.pushplus?.to || '';

            customPushConfigs = settings.customPush || [];
        }
    } catch (error) {
        console.error('加载设置失败:', error);
    }
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    saveSettings()
});

async function saveSettings() {
    const settings = {
        task: {
            taskExpireDays: parseInt(document.getElementById('taskExpireDays').value) || 3,
            taskCheckCron: document.getElementById('taskCheckCron').value || '0 19-23 * * *',
            cleanRecycleCron: document.getElementById('cleanRecycleCron').value || '0 */8 * * *',
            maxRetries: parseInt(document.getElementById('taskMaxRetries').value) || 3,
            retryInterval: parseInt(document.getElementById('taskRetryInterval').value) || 300,
            enableAutoClearRecycle: document.getElementById('enableAutoClearRecycle').checked,
            enableAutoClearFamilyRecycle: document.getElementById('enableAutoClearFamilyRecycle').checked,
            mediaSuffix: document.getElementById('mediaSuffix').value,
            enableOnlySaveMedia: document.getElementById('enableOnlySaveMedia').checked,
            enableAutoCreateFolder: document.getElementById('enableAutoCreateFolder').checked,
            enableCasRapidUpload: document.getElementById('enableCasRapidUpload').checked,
            enableDeleteCasFile: document.getElementById('enableDeleteCasFile').checked,
            enableCasFamilyTransfer: document.getElementById('enableCasFamilyTransfer').checked,
            // casFamilyFolderId 已移除，改为账号级配置
            enableDeleteFamilyTempFile: document.getElementById('enableDeleteFamilyTempFile').checked,
            enableAutoCheckin: document.getElementById('enableAutoCheckin').checked,
            checkinCron: document.getElementById('checkinCron').value || '15 1 * * *',
            enableStorageAggregation: document.getElementById('enableStorageAggregation').checked
        },
        wecom: {
            enable: document.getElementById('enableWecom').checked,
            webhook: document.getElementById('wecomWebhook').value,
            // 自建应用双向交互
            corpId: document.getElementById('wecomCorpId').value,
            appId: document.getElementById('wecomAppId').value,
            appSecret: document.getElementById('wecomAppSecret').value,
            callbackToken: document.getElementById('wecomCallbackToken').value,
            callbackEncodingAESKey: document.getElementById('wecomCallbackAesKey').value,
            callbackEnabled: document.getElementById('wecomCallbackEnabled').checked
        },
        telegram: {
            enable: document.getElementById('enableTelegram').checked,
            proxyDomain: document.getElementById('proxyDomain').value,
            botToken: document.getElementById('telegramBotToken').value,
            chatId: document.getElementById('telegramChatId').value,
            bot: {
                enable: document.getElementById('enableTgBot').checked,
                botToken: document.getElementById('tgBotToken').value,
                chatId: document.getElementById('tgBotChatId').value
            }
        },
        wxpusher: {
            enable: document.getElementById('enableWXPusher').checked,
            spt: document.getElementById('wXPusherSPT').value
        },
        proxy: {
            host: document.getElementById('proxyHost').value,
            port: parseInt(document.getElementById('proxyPort').value) || 0,
            username: document.getElementById('proxyUsername').value,
            password: document.getElementById('proxyPassword').value,
            services:{
                telegram: document.getElementById('proxyTelegram').checked,
                tmdb: document.getElementById('proxyTmdb').checked,
                openai: document.getElementById('proxyOpenAI').checked,
                cloud189: document.getElementById('proxyCloud189').checked,
                customPush: document.getElementById('proxyCustomPush').checked
            }
        },
        bark: {
            enable: document.getElementById('enableBark').checked,
            serverUrl: document.getElementById('barkServerUrl').value,
            key: document.getElementById('barkKey').value
        },
        system: {
            username: document.getElementById('systemUserName').value,
            password: document.getElementById('systemPassword').value,
            apiKey: document.getElementById('systemApiKey').value
        },
        pushplus: {
            enable: document.getElementById('enablePushPlus').checked,
            token: document.getElementById('pushplusToken').value,
            topic: document.getElementById('pushplusTopic').value,
            channel: document.getElementById('pushplusChannel').value,
            webhook: document.getElementById('pushplusWebhook').value,
            to: document.getElementById('pushplusTo').value
        },
        strm: {
            enable: document.getElementById('enableStrm').checked,
        },
        emby: {
            enable: document.getElementById('enableEmby').checked,
            serverUrl: document.getElementById('embyServer').value,
            apiKey: document.getElementById('embyApiKey').value,
        },
        cloudSaver: {
            baseUrl: document.getElementById('cloudSaverUrl').value,
            username: document.getElementById('cloudSaverUsername').value,
            password: document.getElementById('cloudSaverPassword').value,
        },
        tmdb: {
            enableScraper: document.getElementById('enableScraper').checked,
            tmdbApiKey: document.getElementById('tmdbApiKey').value
        },
        openai: {
            enable: document.getElementById('enableOpenAI').checked,
            baseUrl: document.getElementById('openaiBaseUrl').value,
            apiKey: document.getElementById('openaiApiKey').value,
            model: document.getElementById('openaiModel').value,
            rename: {
                template: document.getElementById('openaiTemplate').value,
                movieTemplate: document.getElementById('openaiMovieTemplate').value,
            }
        },
        alist: {
            enable: document.getElementById('enableAlist').checked,
            baseUrl: document.getElementById('alistServer').value,
            apiKey: document.getElementById('alistApiKey').value
        },
        hdhive: {
            enabled: document.getElementById('enableHDHive').checked,
            apiKey: document.getElementById('hdhiveApiKey').value,
            baseUrl: document.getElementById('hdhiveBaseUrl').value || 'https://api.hdhive.com',
            cloudFilter: {
                '115': document.getElementById('hdhiveCloud115').checked,
                'quark': document.getElementById('hdhiveCloudQuark').checked,
                'ali': document.getElementById('hdhiveCloudAli').checked,
                'baidu': document.getElementById('hdhiveCloudBaidu').checked,
                '123': document.getElementById('hdhiveCloud123').checked,
                'xunlei': document.getElementById('hdhiveCloudXunlei').checked,
                'pikpak': document.getElementById('hdhiveCloudPikpak').checked
            }
        },
        customPush: customPushConfigs
    };
    // taskRetryInterval不能少于60秒
    if (settings.task.taskRetryInterval < 60) {
        message.warning("任务重试间隔不能小于60秒")
        return 
    }

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        const data = await response.json();
        if (data.success) {
            message.success('保存成功');
            // 刷新影巢按钮显示状态
            if (typeof initHDHiveFeature === 'function') {
                initHDHiveFeature();
            }
        } else {
            message.warning('保存失败: ' + data.error);
        }
    } catch (error) {
        message.warning('保存失败: ' + error.message);
    }
}

// 在页面加载时初始化设置
document.addEventListener('DOMContentLoaded', loadSettings);

function generateApiKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let apiKey = '';
    for (let i = 0; i < 32; i++) {
        apiKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('systemApiKey').value = apiKey;
}

// 移除旧的 CAS 家庭目录选择器逻辑，改为账号级配置