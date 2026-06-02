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
let searchResults = [];
let selectedIndex = -1;
function showCloudsaver() {
    document.getElementById('cloudSaverModal').style.display = 'block';
    document.body.classList.add('modal-open');
    document.getElementById('searchInput').focus();
    document.getElementById('cloudSaverModal').addEventListener('click', (e) => {
        if (e.target.id === 'cloudSaverModal') {
            closeCloudsaver();
        }
    });
}
function closeCloudsaver() {
    document.getElementById('cloudSaverModal').style.display = 'none';
    document.body.classList.remove('modal-open');
    // 重置状态
    searchResults = [];
    selectedIndex = -1;
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').style.display = 'none';
}
function searchResources() {
    return __awaiter(this, void 0, void 0, function* () {
        const keyword = document.getElementById('searchInput').value.trim();
        if (!keyword) {
            message.warning('请输入搜索关键字');
            return;
        }
        try {
            loading.show();
            const response = yield fetch(`/api/cloudsaver/search?keyword=${keyword}`);
            const data = yield response.json();
            if (data.success) {
                searchResults = data.data;
                renderResults();
            }
            else {
                message.error(data.error);
            }
        }
        catch (error) {
            console.error('搜索失败:', error);
            message.error('搜索失败');
        }
        finally {
            loading.hide();
        }
    });
}
function renderResults() {
    const resultsDiv = document.querySelector('.cloudsaver-results-list');
    document.querySelector('.cloudsaver-action-buttons').style.display = 'none';
    if (searchResults.length === 0) {
        resultsDiv.innerHTML = `
            <div style="padding: 8px; color: #999; font-size: 12px;">未搜索到任何资源</div>
        `;
    }
    else {
        document.querySelector('.cloudsaver-action-buttons').style.display = 'flex';
        resultsDiv.innerHTML = `
            <div style="padding: 8px; color: #999; font-size: 12px;">以下资源来自 <a href="https://github.com/jiangrui1994/cloudsaver" target="_blank" style="color: #666; text-decoration: underline;">CloudSaver</a></div>
            ${searchResults.map((item, index) => `
                <div class="cloudsaver-result-item" onclick="selectItem(${index})" data-index="${index}">
                    ${item.title}
                </div>
            `).join('')}
        `;
    }
    document.getElementById('searchResults').style.display = 'block';
}
function selectItem(index) {
    selectedIndex = index;
    document.querySelectorAll('.cloudsaver-result-item').forEach(item => {
        item.classList.remove('selected');
    });
    document.querySelector(`[data-index="${index}"]`).classList.add('selected');
}
function handleSelectedResource(action) {
    if (selectedIndex === -1) {
        message.warning('请先选择一个资源');
        return;
    }
    const resource = searchResults[selectedIndex];
    if (action === 'open') {
        window.open(resource.cloudLinks[0].link, '_blank');
    }
    else if (action === 'create') {
        document.getElementById('shareLink').value = resource.cloudLinks[0].link;
        // 触发 blur 事件
        document.getElementById('shareLink').dispatchEvent(new Event('blur'));
        closeCloudsaver();
        openCreateTaskModal();
    }
}
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                searchResources();
            }
        });
    }
});
