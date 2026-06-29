let customPushConfigs = []

/**
 * HTML 实体转义，防止 XSS
 */
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
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
            // ✅ Issue #28: 任务文件夹追加 [tmdb-xxx] 标记
            const appendTmdbId = settings.task?.appendTmdbIdToFolder || false;
            document.getElementById('appendTmdbIdToFolder').checked = appendTmdbId;
            updateMigrateButtonState(appendTmdbId);
            document.getElementById('appendTmdbIdToFolder').addEventListener('change', (e) => {
                updateMigrateButtonState(e.target.checked);
            });
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
            document.getElementById('proxyHDHive').checked = settings.proxy?.services?.hdhive || false;
            document.getElementById('proxyCustomPush').checked = settings.proxy?.services?.customPush || false;
            // Bark 设置
            document.getElementById('enableBark').checked = settings.bark?.enable || false;
            document.getElementById('barkServerUrl').value = settings.bark?.serverUrl || '';
            document.getElementById('barkKey').value = settings.bark?.key || '';

            // 账号密码设置
            document.getElementById('systemUserName').value = settings.system?.username || '';
            document.getElementById('systemPassword').value = settings.system?.password || '';
            document.getElementById('systemBaseUrl').value = settings.system?.baseUrl || '';
            
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
            document.getElementById('hdhiveClientId').value = settings.hdhive?.clientId || '';
            document.getElementById('hdhiveApiKey').value = settings.hdhive?.apiKey || '';
            document.getElementById('hdhiveBaseUrl').value = settings.hdhive?.baseUrl || '';

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
            // ✅ Issue #28: 任务文件夹追加 [tmdb-xxx] 标记
            appendTmdbIdToFolder: document.getElementById('appendTmdbIdToFolder').checked,
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
                hdhive: document.getElementById('proxyHDHive').checked,
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
            baseUrl: document.getElementById('systemBaseUrl').value,
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
            clientId: document.getElementById('hdhiveClientId').value,
            apiKey: document.getElementById('hdhiveApiKey').value,
            baseUrl: document.getElementById('hdhiveBaseUrl').value || 'https://hdhive.com'
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

// ✅ Issue #28: 任务文件夹追加 [tmdb-xxx] 标记相关

/**
 * 根据开关状态启用/禁用迁移按钮
 */
function updateMigrateButtonState(enabled) {
    const btn = document.getElementById('migrateFolderTmdbBtn');
    const hint = document.getElementById('migrateFolderTmdbHint');
    if (!btn) return;
    btn.disabled = !enabled;
    if (hint) {
        hint.textContent = enabled
            ? '点击按钮预览并迁移历史任务'
            : '请先开启上方开关';
    }
}

/**
 * 迁移历史任务文件夹名为其追加 [tmdb-{id}] 标记
 * 4 阶段：预览 -> 二次确认 -> 执行 -> 结果
 */
async function migrateFolderTmdb() {
    // 阶段 ① 预览
    let preview;
    try {
        loading.show();
        const resp = await fetch('/api/tasks/migrate-folder-tmdbid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dryRun: true })
        });
        loading.hide();
        const data = await resp.json();
        if (!data.success) {
            message.warning('预览失败: ' + data.error);
            return;
        }
        preview = data.data;
    } catch (e) {
        loading.hide();
        message.warning('预览失败: ' + e.message);
        return;
    }

    // 构造预览 HTML
    const toMigrateList = preview.toMigrate.map(item =>
        `<li><code>${escapeHtml(item.oldName)}</code> → <code>${escapeHtml(item.newName)}</code></li>`
    ).join('');
    const skippedList = preview.skipped.map(item =>
        `<li>任务 #${item.taskId}: ${escapeHtml(item.reason)}</li>`
    ).join('');

    const previewHtml = `
        <div style="text-align: left;">
            <p>将迁移 <strong style="color: var(--accent);">${preview.toMigrate.length}</strong> 个任务，跳过 <strong>${preview.skipped.length}</strong> 个</p>
            ${preview.toMigrate.length > 0 ? `
                <details open>
                    <summary>✅ 将迁移（${preview.toMigrate.length}）</summary>
                    <ul style="margin: 8px 0; padding-left: 20px; max-height: 240px; overflow-y: auto;">${toMigrateList}</ul>
                </details>
            ` : ''}
            ${preview.skipped.length > 0 ? `
                <details>
                    <summary>⏭️ 将跳过（${preview.skipped.length}）</summary>
                    <ul style="margin: 8px 0; padding-left: 20px; max-height: 120px; overflow-y: auto;">${skippedList}</ul>
                </details>
            ` : ''}
            ${preview.toMigrate.length === 0 ? '<p style="color: #888;">没有需要迁移的任务。</p>' : ''}
        </div>
    `;

    // 阶段 ② 二次确认（需用户输入"确认迁移"）
    const confirmed = await showMigrateConfirmDialog(previewHtml);
    if (!confirmed) return;

    // 阶段 ③ 执行
    const progressModal = showMigrateProgressModal();
    try {
        loading.show();
        const resp = await fetch('/api/tasks/migrate-folder-tmdbid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dryRun: false })
        });
        loading.hide();
        const data = await resp.json();
        progressModal.close();
        if (!data.success) {
            message.warning('迁移失败: ' + data.error);
            return;
        }

        // 阶段 ④ 结果
        const results = data.data;
        const failedList = results.results.filter(r => r.status === 'failed');
        showMigrateResultModal(results, failedList);
    } catch (e) {
        loading.hide();
        progressModal.close();
        message.warning('迁移失败: ' + e.message);
    }
}

/**
 * 阶段 ②：二次确认弹窗（要求用户输入"确认迁移"）
 */
function showMigrateConfirmDialog(previewHtml) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>⚠️ 二次确认</h3>
                </div>
                <div class="modal-body">
                    ${previewHtml}
                    <div style="margin-top: 16px; padding: 12px; background: var(--hover-bg, #fff3cd); border-radius: 6px;">
                        <p style="margin: 0 0 8px 0; color: #856404;">⚠️ 此操作将修改云盘上的文件夹名，请确认无问题后继续</p>
                        <label>请输入 <strong>确认迁移</strong> 以继续：</label>
                        <input type="text" id="migrateConfirmInput" placeholder="确认迁移" style="width: 100%; margin-top: 4px; padding: 6px 10px; box-sizing: border-box;">
                    </div>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn-default" id="migrateCancelBtn">取消</button>
                    <button type="button" class="btn-primary" id="migrateConfirmBtn" disabled>确认执行</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const input = document.getElementById('migrateConfirmInput');
        const confirmBtn = document.getElementById('migrateConfirmBtn');
        const cancelBtn = document.getElementById('migrateCancelBtn');

        input.addEventListener('input', () => {
            confirmBtn.disabled = input.value.trim() !== '确认迁移';
        });
        confirmBtn.addEventListener('click', () => {
            modal.remove();
            resolve(true);
        });
        cancelBtn.addEventListener('click', () => {
            modal.remove();
            resolve(false);
        });
        setTimeout(() => input.focus(), 100);
    });
}

/**
 * 阶段 ③：执行中进度弹窗
 */
function showMigrateProgressModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; text-align: center;">
            <div class="modal-body">
                <div class="spinner" style="border: 4px solid #f3f3f3; border-top: 4px solid var(--accent); border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 16px auto;"></div>
                <p style="margin: 16px 0;">正在迁移，请稍候...</p>
                <p style="color: #888; font-size: 12px;">为避免触发云盘 API 限流，每个任务间隔 1 秒</p>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return {
        close: () => modal.remove()
    };
}

/**
 * 阶段 ④：结果汇总弹窗
 */
function showMigrateResultModal(results, failedList) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    const failedHtml = failedList.length > 0
        ? `<details open>
                <summary>❌ 失败（${failedList.length}）</summary>
                <ul style="margin: 8px 0; padding-left: 20px; max-height: 200px; overflow-y: auto;">
                    ${failedList.map(f => `<li>任务 #${f.taskId}: ${escapeHtml(f.error || '未知错误')}</li>`).join('')}
                </ul>
           </details>`
        : '';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3>${results.failed === 0 ? '✅ 迁移完成' : '⚠️ 迁移完成（有失败）'}</h3>
            </div>
            <div class="modal-body">
                <p>成功 <strong style="color: #10b981;">${results.migrated}</strong> 个，失败 <strong style="color: #ef4444;">${results.failed}</strong> 个</p>
                ${failedHtml}
            </div>
            <div class="form-actions">
                <button type="button" class="btn-primary" id="migrateResultCloseBtn">确定</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('migrateResultCloseBtn').addEventListener('click', () => modal.remove());
}

// 移除旧的 CAS 家庭目录选择器逻辑，改为账号级配置