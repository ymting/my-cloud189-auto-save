"use strict";
// 移除旧的 mediaForm 提交逻辑，相关配置已经合并到 settings.js 中的 settingsForm
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// ==================== OpenAI 相关测试和模型获取逻辑 ====================
// 测试 OpenAI 连接
function testOpenAIConnection() {
    return __awaiter(this, void 0, void 0, function* () {
        const baseUrl = document.getElementById('openaiBaseUrl').value || 'https://api.openai.com/v1';
        const apiKey = document.getElementById('openaiApiKey').value;
        const model = document.getElementById('openaiModel').value || 'gpt-3.5-turbo';
        if (!apiKey) {
            message.warning('请先填写 API Key');
            return;
        }
        try {
            message.success('正在测试连接中，请稍候...');
            const response = yield fetch('/api/openai/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ baseUrl, apiKey, model })
            });
            const result = yield response.json();
            if (result.success) {
                message.success('连接成功！模型响应正常。');
            }
            else {
                message.warning('测试连接失败: ' + result.error);
            }
        }
        catch (error) {
            message.warning('测试连接失败: ' + error.message);
        }
    });
}
let cachedOpenAIModels = [];
// 获取 OpenAI 模型列表并显示模态框
function getOpenAIModels() {
    return __awaiter(this, void 0, void 0, function* () {
        const baseUrl = document.getElementById('openaiBaseUrl').value || 'https://api.openai.com/v1';
        const apiKey = document.getElementById('openaiApiKey').value;
        if (!apiKey) {
            message.warning('请先填写 API Key');
            return;
        }
        try {
            message.success('正在获取模型列表中...');
            const response = yield fetch('/api/openai/models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ baseUrl, apiKey })
            });
            const result = yield response.json();
            if (result.success && result.data && result.data.length > 0) {
                cachedOpenAIModels = result.data;
                renderOpenAIModels(cachedOpenAIModels);
                document.getElementById('openaiModelsModal').style.display = 'flex';
            }
            else {
                message.warning('获取模型失败: ' + (result.error || '模型列表为空'));
            }
        }
        catch (error) {
            message.warning('获取模型失败: ' + error.message);
        }
    });
}
function renderOpenAIModels(models) {
    const listContainer = document.getElementById('openaiModelsList');
    if (models.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">无匹配的模型</div>';
        return;
    }
    listContainer.innerHTML = models.map(model => `
        <div class="tmdb-result-item" style="padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='var(--hover-bg-color)'" onmouseout="this.style.backgroundColor='transparent'" onclick="selectOpenAIModel('${model.id}')">
            <div style="font-weight: bold; font-size: 14px;">${model.id}</div>
        </div>
    `).join('');
}
function filterOpenAIModels() {
    const searchText = document.getElementById('openaiModelSearch').value.toLowerCase();
    const filtered = cachedOpenAIModels.filter(model => model.id.toLowerCase().includes(searchText));
    renderOpenAIModels(filtered);
}
function selectOpenAIModel(modelId) {
    document.getElementById('openaiModel').value = modelId;
    closeOpenAIModelsModal();
    message.success('已自动填充模型名称');
}
function closeOpenAIModelsModal() {
    document.getElementById('openaiModelsModal').style.display = 'none';
    document.getElementById('openaiModelSearch').value = '';
}
