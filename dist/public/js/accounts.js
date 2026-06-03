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
let accountsList = [];
let chooseAccount = null;
let familyFolderSelectorOpen = false;
// 账号相关功能
function fetchAccounts() {
    return __awaiter(this, arguments, void 0, function* (updateSelect = false) {
        const response = yield fetch('/api/accounts');
        const data = yield response.json();
        // 如果http状态码为401, 则跳转到登录页面
        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }
        if (data.success) {
            accountsList = data.data;
            // 按家庭组分组展示
            const familyGroups = {};
            accountsList.forEach(account => {
                const fid = account.familyId || 'no_family';
                if (!familyGroups[fid]) {
                    familyGroups[fid] = { familyId: fid, accounts: [] };
                }
                familyGroups[fid].accounts.push(account);
            });
            const tbody = document.querySelector('#accountTable tbody');
            tbody.innerHTML = '';
            Object.keys(familyGroups).forEach(fid => {
                const group = familyGroups[fid];
                const isSameFamily = fid !== 'no_family' && group.accounts.length > 1;
                // 家庭组标题行（优化样式）
                tbody.innerHTML += `
                <tr class="family-group-header" style="background: linear-gradient(90deg, var(--card-bg) 0%, var(--hover-bg, #f0f0f0) 100%); border-left: 3px solid var(--primary-color);">
                    <td colspan="8" style="padding: 10px 16px; font-weight: 600; color: var(--text-primary);">
                        <span class="family-toggle-icon" onclick="toggleFamilyGroup('${fid}')" style="cursor: pointer; margin-right: 8px; transition: transform 0.2s;">▼</span>
                        <span style="font-size: 14px;">家庭组 ${fid === 'no_family' ? '(无家庭空间)' : fid.slice(-6)}</span>
                        <span style="font-size: 12px; color: #888; margin-left: 8px;">(${group.accounts.length}个账号)</span>
                        ${isSameFamily ? '<span style="color: #22c55e; font-size: 11px; margin-left: 12px; padding: 2px 8px; background: rgba(34, 197, 94, 0.15); border-radius: 4px;">💡 同家庭组共用空间</span>' : ''}
                    </td>
                </tr>
            `;
                // 账号行
                group.accounts.forEach(account => {
                    // 显示家庭中转目录状态：已配置显示ID，继承显示来源，默认显示 cas_temp
                    let familyFolderDisplay = '';
                    if (account.familyFolderId) {
                        familyFolderDisplay = `已配置 (${account.familyFolderId.slice(-6)})`;
                    }
                    else if (isSameFamily) {
                        // 查找同家庭组中已配置的账号
                        const sourceAccount = group.accounts.find(a => a.familyFolderId && a.id !== account.id);
                        familyFolderDisplay = sourceAccount ? `继承自 ${sourceAccount.username}` : '继承';
                    }
                    else {
                        familyFolderDisplay = '默认 cas_temp';
                    }
                    tbody.innerHTML += `
                    <tr class="family-group-row" data-family="${fid}">
                        <td><span class="default-star" onclick="setDefaultAccount(${account.id})" title="设为默认账号">
                                ${account.isDefault ? '★' : '☆'}
                            </span>
                             <button class="btn-primary" onclick="editAccount(${account.id})">修改</button>
                            <button class="btn-danger" onclick="deleteAccount(${account.id})">删除</button>
                            </td>
                        <td data-label='账户名'>${account.username}</td>
                        <td data-label='别名' onclick="updateAlias(${account.id}, '${account.alias || ''}')">${account.alias || '-'}</td>
                        <td data-label='个人容量'>${formatBytes(account.capacity.cloudCapacityInfo.usedSize) + '/' + formatBytes(account.capacity.cloudCapacityInfo.totalSize)}</td>
                        <td data-label='家庭容量'>${formatBytes(account.capacity.familyCapacityInfo.usedSize) + '/' + formatBytes(account.capacity.familyCapacityInfo.totalSize)}</td>
                        <td data-label='家庭中转目录' style="cursor: pointer; color: ${account.familyFolderId ? '#22c55e' : '#888'};" onclick="updateFamilyFolder(${account.id}, '${account.familyFolderId || ''}', '${account.familyId || ''}')">${familyFolderDisplay}</td>
                        <td class='strm-prefix' data-label='媒体目录' style="cursor: pointer;" onclick="updateCloudStrmPrefix(${account.id}, '${account.cloudStrmPrefix || ''}')">${account.cloudStrmPrefix || '-'}</td>
                        <td class='strm-prefix' data-label='本地目录' style="cursor: pointer;" onclick="updateLocalStrmPrefix(${account.id}, '${account.localStrmPrefix || ''}')">${account.localStrmPrefix || '-'}</td>
                    </tr>
                `;
                });
            });
            // 更新任务创建页面的账号下拉
            if (updateSelect) {
                const select = document.querySelector('#accountId');
                select.innerHTML = '';
                accountsList.forEach(account => {
                    if (!account.username.startsWith('n_')) {
                        select.innerHTML += `
                    <option value="${account.id}" ${account.isDefault ? "selected" : ''}>${account.username}</option>
                `;
                    }
                });
            }
        }
    });
}
// 切换家庭组展开/折叠（带图标旋转动画）
function toggleFamilyGroup(fid) {
    var _a, _b;
    const rows = document.querySelectorAll(`.family-group-row[data-family="${fid}"]`);
    const headerRow = (_a = rows[0]) === null || _a === void 0 ? void 0 : _a.previousElementSibling;
    const icon = headerRow === null || headerRow === void 0 ? void 0 : headerRow.querySelector('.family-toggle-icon');
    const isCollapsed = ((_b = rows[0]) === null || _b === void 0 ? void 0 : _b.style.display) === 'none';
    rows.forEach(row => {
        row.style.display = isCollapsed ? '' : 'none';
    });
    // 旋转图标
    if (icon) {
        icon.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
    }
}
function deleteAccount(id) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!confirm('确定要删除这个账号吗？'))
            return;
        loading.show();
        const response = yield fetch(`/api/accounts/${id}`, {
            method: 'DELETE'
        });
        loading.hide();
        const data = yield response.json();
        if (data.success) {
            message.success('账号删除成功');
            fetchAccounts();
        }
        else {
            message.warning('账号删除失败: ' + data.error);
        }
    });
}
// 添加账号表单处理
function initAccountForm() {
    document.getElementById('accountForm').addEventListener('submit', (e) => __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        yield createAccount();
    }));
}
function openAddAccountModal() {
    chooseAccount = null;
    const modal = document.getElementById('addAccountModal');
    modal.style.display = 'block';
    // 显示切换标签，并默认选中密码登录
    document.getElementById('loginTypeTabs').style.display = 'flex';
    switchLoginTab('pass');
}
function closeAddAccountModal() {
    // 停止二维码流程
    stopQRCodeFlow();
    const modal = document.getElementById('addAccountModal');
    modal.style.display = 'none';
    const modalTitle = modal.querySelector('h3');
    modalTitle.textContent = '添加账号';
    const submitBtn = modal.querySelector('button[type="submit"]');
    submitBtn.textContent = '添加';
    submitBtn.style.display = 'inline-block';
    document.getElementById('username').removeAttribute('readonly');
    // 清空表单
    document.getElementById('accountForm').reset();
    // 移除可能存在的验证码容器
    const captchaContainer = document.querySelector('.captcha-container');
    if (captchaContainer) {
        captchaContainer.remove();
    }
    chooseAccount = null;
}
function editAccount(id) {
    return __awaiter(this, void 0, void 0, function* () {
        // 获取账号信息
        chooseAccount = accountsList.find(acc => acc.id === id);
        if (!chooseAccount) {
            message.warning('账号不存在');
            return;
        }
        // 打开模态框
        const modal = document.getElementById('addAccountModal');
        modal.style.display = 'block';
        // 修改标题
        const modalTitle = modal.querySelector('h3');
        modalTitle.textContent = '修改账号';
        // 编辑模式隐藏切换标签并确保只显示密码表单
        document.getElementById('loginTypeTabs').style.display = 'none';
        switchLoginTab('pass');
        // 填充表单数据
        document.getElementById('username').value = chooseAccount.username;
        document.getElementById('password').value = chooseAccount.password; // 出于安全考虑，不填充密码
        document.getElementById('cookie').value = chooseAccount.cookies || '';
        document.getElementById('alias').value = chooseAccount.alias || '';
        document.getElementById('cloudStrmPrefix').value = chooseAccount.cloudStrmPrefix || '';
        document.getElementById('localStrmPrefix').value = chooseAccount.localStrmPrefix || '';
        document.getElementById('embyPathReplace').value = chooseAccount.embyPathReplace || '';
        // 填充家庭中转目录
        const familyFolderIdInput = document.getElementById('familyFolderId');
        const familyFolderDisplayInput = document.getElementById('familyFolderDisplay');
        const clearBtn = document.getElementById('clearFamilyFolderBtn');
        const selectBtn = document.getElementById('selectFamilyFolderBtn');
        if (chooseAccount.familyFolderId) {
            familyFolderIdInput.value = chooseAccount.familyFolderId;
            familyFolderDisplayInput.value = `已配置 (${chooseAccount.familyFolderId.slice(-6)})`;
            clearBtn.style.display = 'inline-block';
        }
        else {
            familyFolderIdInput.value = '';
            familyFolderDisplayInput.value = '默认 cas_temp 目录';
            clearBtn.style.display = 'none';
        }
        // 设置选择按钮事件
        selectBtn.onclick = () => {
            if (chooseAccount.familyId) {
                openFamilyFolderSelectorForEdit(chooseAccount.id, chooseAccount.familyFolderId || '', chooseAccount.familyId);
            }
            else {
                message.warning('该账号无家庭空间，无法配置家庭中转目录');
            }
        };
        // 设置清空按钮事件
        clearBtn.onclick = () => {
            familyFolderIdInput.value = '';
            familyFolderDisplayInput.value = '默认 cas_temp 目录';
            clearBtn.style.display = 'none';
        };
        // 账号不允许修改
        document.getElementById('username').setAttribute('readonly', true);
        // 修改提交按钮文本
        const submitBtn = modal.querySelector('button[type="submit"]');
        submitBtn.textContent = '修改';
    });
}
// 编辑账号时弹出家庭中转目录选择器
function openFamilyFolderSelectorForEdit(accountId, currentFolderId, familyId) {
    return __awaiter(this, void 0, void 0, function* () {
        // 初始化浏览路径状态
        window.editFolderAccountId = accountId;
        window.editFolderBreadcrumb = [{ id: '', name: '家庭根目录' }];
        window.editFolderCurrentPath = '';
        window.editSelectedFolderId = currentFolderId;
        window.editSelectedFolderName = currentFolderId ? '已配置' : '默认 cas_temp';
        // 创建目录选择器弹窗
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'familyFolderEditModal';
        modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3>选择家庭中转目录</h3>
                <button class="close-btn" onclick="closeFamilyFolderEditModal()">×</button>
            </div>
            <div style="padding: 20px;">
                <div id="currentFolderDisplay" style="margin-bottom: 10px; padding: 10px; background: var(--bg-color); border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                    <span>
                        <strong>当前：</strong>
                        <span id="editCurrentFolderText">${currentFolderId ? '已配置 (' + currentFolderId.slice(-6) + ')' : '默认 cas_temp 目录'}</span>
                    </span>
                    <button class="btn-secondary" style="padding: 4px 10px; font-size: 12px;" onclick="clearEditFolderSelection()">清空</button>
                </div>
                <div id="editFolderBreadcrumb" style="margin-bottom: 10px; padding: 8px; background: var(--bg-color); border-radius: 6px; font-size: 12px; color: #666;">
                    📍 家庭根目录
                </div>
                <div id="editFolderTreeContainer" style="border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; max-height: 300px; overflow-y: auto;">
                    <div style="text-align: center; padding: 20px; color: #888;">加载中...</div>
                </div>
            </div>
            <div class="form-actions" style="padding: 15px 20px; border-top: 1px solid var(--border-color);">
                <button type="button" class="btn-secondary" onclick="closeFamilyFolderEditModal()">取消</button>
                <button type="button" class="btn-primary" onclick="confirmEditFamilyFolder()">确认</button>
            </div>
        </div>
    `;
        document.body.appendChild(modal);
        modal.style.display = 'block';
        yield loadEditFamilyFolderTree(accountId, '', currentFolderId);
    });
}
// 加载编辑模式的家庭目录树
function loadEditFamilyFolderTree(accountId, folderId, selectedFolderId) {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('editFolderTreeContainer');
        const breadcrumbDiv = document.getElementById('editFolderBreadcrumb');
        if (!container)
            return;
        // 更新面包屑导航
        if (breadcrumbDiv && window.editFolderBreadcrumb) {
            let breadcrumbHtml = '📍 ';
            window.editFolderBreadcrumb.forEach((item, index) => {
                if (index === window.editFolderBreadcrumb.length - 1) {
                    breadcrumbHtml += `<span style="color: var(--primary-color);">${item.name}</span>`;
                }
                else {
                    breadcrumbHtml += `<span style="cursor: pointer; color: #666;" onclick="navigateToEditFolder(${index})">${item.name}</span> / `;
                }
            });
            breadcrumbDiv.innerHTML = breadcrumbHtml;
        }
        try {
            const response = yield fetch(`/api/accounts/${accountId}/family/folders?folderId=${folderId}`);
            const data = yield response.json();
            if (!data.success) {
                container.innerHTML = `<div style="text-align: center; padding: 20px; color: #e74c3c;">加载失败: ${data.error}</div>`;
                return;
            }
            const folders = data.data.folders || [];
            window.editFolderCurrentPath = folderId;
            // 构建目录树
            let html = '';
            // 根目录选项（仅在根目录时显示）
            if (folderId === '') {
                html += `
                <div class="edit-folder-item" data-folder-id="" style="padding: 10px; cursor: pointer; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; ${!window.editSelectedFolderId ? 'background: var(--primary-color); color: white;' : 'hover:bg'}" onmouseover="this.style.background='${!window.editSelectedFolderId ? 'var(--primary-color)' : 'var(--bg-color)'}'" onmouseout="this.style.background='${!window.editSelectedFolderId ? 'var(--primary-color)' : ''}'" onclick="selectEditFolder('', '家庭根目录')">
                    <span>📁 家庭根目录（默认 cas_temp 目录）</span>
                </div>
            `;
            }
            if (folders.length === 0 && folderId !== '') {
                html += `<div style="text-align: center; padding: 10px; color: #888;">当前目录无子目录</div>`;
            }
            folders.forEach(folder => {
                const isSelected = folder.id === window.editSelectedFolderId;
                html += `
                <div class="edit-folder-item" data-folder-id="${folder.id}" style="padding: 10px; cursor: pointer; border-radius: 4px; margin-top: 4px; display: flex; justify-content: space-between; align-items: center; ${isSelected ? 'background: var(--primary-color); color: white;' : ''}" onclick="selectEditFolder('${folder.id}', '${folder.name}')">
                    <span>📁 ${folder.name}</span>
                    <button class="btn-secondary" style="padding: 2px 8px; font-size: 11px; background: transparent; border: 1px solid ${isSelected ? 'white' : 'var(--border-color)'}; color: ${isSelected ? 'white' : '#666'};" onclick="event.stopPropagation(); enterEditFolder('${folder.id}', '${folder.name}')">进入 →</button>
                </div>
            `;
            });
            container.innerHTML = html;
        }
        catch (error) {
            container.innerHTML = `<div style="text-align: center; padding: 20px; color: #e74c3c;">加载失败: ${error.message}</div>`;
        }
    });
}
// 进入子目录
function enterEditFolder(folderId, folderName) {
    return __awaiter(this, void 0, void 0, function* () {
        // 添加到面包屑
        window.editFolderBreadcrumb.push({ id: folderId, name: folderName });
        yield loadEditFamilyFolderTree(window.editFolderAccountId, folderId, window.editSelectedFolderId);
    });
}
// 返回面包屑指定层级
function navigateToEditFolder(index) {
    return __awaiter(this, void 0, void 0, function* () {
        // 截断面包屑到指定层级
        window.editFolderBreadcrumb = window.editFolderBreadcrumb.slice(0, index + 1);
        const targetFolderId = window.editFolderBreadcrumb[index].id;
        yield loadEditFamilyFolderTree(window.editFolderAccountId, targetFolderId, window.editSelectedFolderId);
    });
}
// 编辑模式下选择目录
function selectEditFolder(folderId, folderName) {
    // 更新选中状态
    document.querySelectorAll('.edit-folder-item').forEach(item => {
        item.style.background = '';
        item.style.color = '';
    });
    const selected = document.querySelector(`.edit-folder-item[data-folder-id="${folderId}"]`);
    if (selected) {
        selected.style.background = 'var(--primary-color)';
        selected.style.color = 'white';
    }
    // 更新当前选择显示
    const currentFolderText = document.getElementById('editCurrentFolderText');
    if (currentFolderText) {
        if (folderId) {
            currentFolderText.textContent = `已选择: ${folderName} (${folderId.slice(-6)})`;
        }
        else {
            currentFolderText.textContent = '默认 cas_temp 目录';
        }
    }
    // 保存选中值
    window.editSelectedFolderId = folderId;
    window.editSelectedFolderName = folderName;
}
// 编辑模式下清空选择
function clearEditFolderSelection() {
    window.editSelectedFolderId = '';
    window.editSelectedFolderName = '默认 cas_temp';
    // 更新显示
    const currentFolderText = document.getElementById('editCurrentFolderText');
    if (currentFolderText) {
        currentFolderText.textContent = '默认 cas_temp 目录';
    }
    // 清除目录树选中状态
    document.querySelectorAll('.edit-folder-item').forEach(item => {
        item.style.background = '';
        item.style.color = '';
    });
    // 选中根目录项
    const rootItem = document.querySelector('.edit-folder-item[data-folder-id=""]');
    if (rootItem) {
        rootItem.style.background = 'var(--primary-color)';
        rootItem.style.color = 'white';
    }
    message.success('已恢复为默认 cas_temp 目录');
}
// 关闭编辑模式弹窗
function closeFamilyFolderEditModal() {
    const modal = document.getElementById('familyFolderEditModal');
    if (modal) {
        modal.remove();
    }
    window.editSelectedFolderId = undefined;
    window.editSelectedFolderName = undefined;
}
// 确认编辑模式选择
function confirmEditFamilyFolder() {
    const folderId = window.editSelectedFolderId || '';
    // 更新表单显示
    const familyFolderIdInput = document.getElementById('familyFolderId');
    const familyFolderDisplayInput = document.getElementById('familyFolderDisplay');
    const clearBtn = document.getElementById('clearFamilyFolderBtn');
    familyFolderIdInput.value = folderId;
    if (folderId) {
        familyFolderDisplayInput.value = `已选择 (${folderId.slice(-6)})`;
        clearBtn.style.display = 'inline-block';
    }
    else {
        familyFolderDisplayInput.value = '默认 cas_temp 目录';
        clearBtn.style.display = 'none';
    }
    closeFamilyFolderEditModal();
    message.success('已选择家庭中转目录');
}
function createAccount() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        let username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const cookies = document.getElementById('cookie').value;
        const alias = document.getElementById('alias').value;
        const validateCodeDom = document.getElementById('validateCode');
        const cloudStrmPrefix = document.getElementById('cloudStrmPrefix').value;
        const localStrmPrefix = document.getElementById('localStrmPrefix').value;
        const embyPathReplace = document.getElementById('embyPathReplace').value;
        const familyFolderId = document.getElementById('familyFolderId').value;
        let validateCode = "";
        if (validateCodeDom) {
            validateCode = validateCodeDom.value;
        }
        if (!username) {
            message.warning('用户名不能为空');
            return;
        }
        if (!password && !cookies) {
            message.warning('密码和Cookie不能同时为空');
            return;
        }
        if (chooseAccount === null || chooseAccount === void 0 ? void 0 : chooseAccount.id) {
            username = chooseAccount.original_username;
        }
        loading.show();
        const response = yield fetch('/api/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: chooseAccount === null || chooseAccount === void 0 ? void 0 : chooseAccount.id, username, password, cookies, alias, validateCode, cloudStrmPrefix, localStrmPrefix, embyPathReplace, familyFolderId })
        });
        const data = yield response.json();
        if (data.success) {
            loading.hide();
            message.success('账号添加成功');
            document.getElementById('accountForm').reset();
            if (validateCodeDom) {
                // 移除验证码容器
                document.getElementById('account-captcha').style.display = 'none';
                validateCodeDom.value = '';
            }
            closeAddAccountModal();
            fetchAccounts();
            // 如果账号有家庭空间，弹出家庭中转目录选择器
            if (((_a = data.data) === null || _a === void 0 ? void 0 : _a.familyId) && ((_b = data.data) === null || _b === void 0 ? void 0 : _b.accountId)) {
                yield showFamilyFolderSelectorAfterAddAccount(data.data.accountId, data.data.familyId);
            }
        }
        else {
            loading.hide();
            // 如果返回的code是NEED_CAPTCHA, 则展示二维码和输入框, 允许用户输入验证码后重新提交
            if (data.code === 'NEED_CAPTCHA') {
                // 展示二维码
                document.getElementById('account-captcha').style.display = 'block';
                document.getElementById('captchaImage').src = data.data.captchaUrl;
                message.warning('请输入验证码后重新提交');
            }
            else {
                message.warning('账号添加失败: ' + data.error);
            }
        }
    });
}
function formatBytes(bytes) {
    if (!bytes || isNaN(bytes))
        return '0B';
    if (bytes < 0)
        return '-' + formatBytes(-bytes);
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const base = 1024;
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(base)), units.length - 1);
    const value = bytes / Math.pow(base, exponent);
    return value.toFixed(exponent > 0 ? 2 : 0) + units[exponent];
}
function clearRecycleBin() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!confirm('确定要清空所有账号的回收站吗？')) {
            return;
        }
        try {
            const response = yield fetch('/api/accounts/recycle', {
                method: 'DELETE'
            });
            const data = yield response.json();
            if (data.success) {
                message.success('后台任务执行中, 请稍后查看结果');
            }
            else {
                message.warning('清空回收站失败: ' + data.error);
            }
        }
        catch (error) {
            message.warning('操作失败: ' + error.message);
        }
    });
}
// 添加更新 STRM 前缀的函数
function updateCloudStrmPrefix(id, currentPrefix) {
    return __awaiter(this, void 0, void 0, function* () {
        const newPrefix = prompt('请输入新的媒体目录前缀', currentPrefix);
        if (newPrefix === null)
            return; // 用户点击取消
        try {
            const response = yield fetch(`/api/accounts/${id}/strm-prefix`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ strmPrefix: newPrefix, type: 'cloud' })
            });
            const data = yield response.json();
            if (data.success) {
                message.success('更新成功');
                fetchAccounts(true);
            }
            else {
                message.warning('更新失败: ' + data.error);
            }
        }
        catch (error) {
            message.warning('操作失败: ' + error.message);
        }
    });
}
function updateLocalStrmPrefix(id, currentPrefix) {
    return __awaiter(this, void 0, void 0, function* () {
        const newPrefix = prompt('请输入新的本地目录前缀', currentPrefix);
        if (newPrefix === null)
            return; // 用户点击取消
        try {
            const response = yield fetch(`/api/accounts/${id}/strm-prefix`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ strmPrefix: newPrefix, type: 'local' })
            });
            const data = yield response.json();
            if (data.success) {
                message.success('更新成功');
                fetchAccounts(true);
            }
            else {
                message.warning('更新失败: ' + data.error);
            }
        }
        catch (error) {
            message.warning('操作失败: ' + error.message);
        }
    });
}
function updateEmbyPathReplace(id, embyPathReplace) {
    return __awaiter(this, void 0, void 0, function* () {
        const newEmbyPathReplace = prompt('请输入新的Emby替换路径', embyPathReplace);
        if (newEmbyPathReplace === null)
            return; // 用户点击取消
        try {
            const response = yield fetch(`/api/accounts/${id}/strm-prefix`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ strmPrefix: newEmbyPathReplace, type: 'emby' })
            });
            const data = yield response.json();
            if (data.success) {
                message.success('更新成功');
                fetchAccounts(true);
            }
            else {
                message.warning('更新失败: ' + data.error);
            }
        }
        catch (error) {
            message.warning('操作失败: ' + error.message);
        }
    });
}
function updateAlias(id, currentAlias) {
    return __awaiter(this, void 0, void 0, function* () {
        const newAlias = prompt('请输入新的别名', currentAlias);
        if (newAlias === null)
            return;
        try {
            const response = yield fetch(`/api/accounts/${id}/alias`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alias: newAlias })
            });
            const data = yield response.json();
            if (data.success) {
                message.success('更新成功');
                fetchAccounts(true);
            }
            else {
                message.warning('更新失败:' + data.error);
            }
        }
        catch (error) {
            message.warning('操作失败:' + error.message);
        }
    });
}
function setDefaultAccount(id) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(`/api/accounts/${id}/default`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = yield response.json();
            if (data.success) {
                message.success('设置默认账号成功');
                fetchAccounts(true); // 更新账号列表和下拉框
            }
            else {
                message.warning('设置默认账号失败: ' + data.error);
            }
        }
        catch (error) {
            message.warning('操作失败: ' + error.message);
        }
    });
}
// 更新家庭中转目录（弹出目录选择器）
function updateFamilyFolder(accountId, currentFolderId, familyId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!familyId) {
            message.warning('该账号无家庭空间，无法配置家庭中转目录');
            return;
        }
        // 创建目录选择器弹窗
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'familyFolderModal';
        modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3>选择家庭中转目录</h3>
                <button class="close-btn" onclick="closeFamilyFolderModal()">×</button>
            </div>
            <div style="padding: 20px;">
                <p style="color: #888; font-size: 13px; margin-bottom: 15px;">
                    💡 选择家庭空间中的目录作为 CAS 秒传中转目录，或使用默认 cas_temp 目录
                </p>
                <div id="currentFolderDisplay" style="margin-bottom: 10px; padding: 10px; background: var(--bg-color); border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                    <span>
                        <strong>当前：</strong>
                        <span id="currentFolderText">${currentFolderId ? '已配置 (' + currentFolderId.slice(-6) + ')' : '默认 cas_temp 目录'}</span>
                    </span>
                    <button class="btn-secondary" style="padding: 4px 10px; font-size: 12px;" onclick="clearFamilyFolderSelection(${accountId})">清空</button>
                </div>
                <div id="folderTreeContainer" style="border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; max-height: 300px; overflow-y: auto;">
                    <div style="text-align: center; padding: 20px; color: #888;">加载中...</div>
                </div>
            </div>
            <div class="form-actions" style="padding: 15px 20px; border-top: 1px solid var(--border-color);">
                <button type="button" class="btn-secondary" onclick="closeFamilyFolderModal()">取消</button>
                <button type="button" class="btn-primary" onclick="confirmFamilyFolder(${accountId})">确认</button>
            </div>
        </div>
    `;
        document.body.appendChild(modal);
        modal.style.display = 'block';
        // 初始化选中值（默认使用 cas_temp 目录）
        window.selectedFamilyFolderId = '';
        window.selectedFamilyFolderName = '默认 cas_temp';
        yield loadFamilyFolderTree(accountId, '', currentFolderId);
    });
}
// 清空选择（恢复默认 cas_temp 目录）
function clearFamilyFolderSelection(accountId) {
    window.selectedFamilyFolderId = '';
    window.selectedFamilyFolderName = '默认 cas_temp';
    // 更新显示
    const currentFolderText = document.getElementById('currentFolderText');
    if (currentFolderText) {
        currentFolderText.textContent = '默认 cas_temp 目录';
    }
    // 清除目录树选中状态
    document.querySelectorAll('.folder-item').forEach(item => {
        item.style.background = '';
        item.style.color = '';
    });
    // 选中根目录项
    const rootItem = document.querySelector('.folder-item[data-folder-id=""]');
    if (rootItem) {
        rootItem.style.background = 'var(--primary-color)';
        rootItem.style.color = 'white';
    }
    message.success('已恢复为默认 cas_temp 目录');
}
// 加载家庭目录树
function loadFamilyFolderTree(accountId, folderId, selectedFolderId) {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('folderTreeContainer');
        if (!container)
            return;
        try {
            const response = yield fetch(`/api/accounts/${accountId}/family/folders?folderId=${folderId}`);
            const data = yield response.json();
            if (!data.success) {
                container.innerHTML = `<div style="text-align: center; padding: 20px; color: #e74c3c;">加载失败: ${data.error}</div>`;
                return;
            }
            const folders = data.data.folders || [];
            if (folders.length === 0 && folderId === '') {
                container.innerHTML = `<div style="text-align: center; padding: 20px; color: #888;">家庭空间无目录，将使用默认 cas_temp 目录</div>`;
                return;
            }
            // 构建目录树
            let html = folderId === '' ? `
            <div class="folder-item" data-folder-id="" style="padding: 8px; cursor: pointer; border-radius: 4px; ${selectedFolderId === '' ? 'background: var(--primary-color); color: white;' : ''}" onclick="selectFamilyFolder('', '家庭根目录')">
                📁 家庭根目录（默认 cas_temp 目录）
            </div>
        ` : '';
            folders.forEach(folder => {
                const isSelected = folder.id === selectedFolderId;
                html += `
                <div class="folder-item" data-folder-id="${folder.id}" style="padding: 8px; cursor: pointer; border-radius: 4px; margin-left: ${folderId ? '15px' : '0'}; ${isSelected ? 'background: var(--primary-color); color: white;' : ''}" onclick="selectFamilyFolder('${folder.id}', '${folder.name}')">
                    📁 ${folder.name}
                </div>
            `;
            });
            container.innerHTML = html;
        }
        catch (error) {
            container.innerHTML = `<div style="text-align: center; padding: 20px; color: #e74c3c;">加载失败: ${error.message}</div>`;
        }
    });
}
// 选择目录
function selectFamilyFolder(folderId, folderName) {
    // 更新选中状态
    document.querySelectorAll('.folder-item').forEach(item => {
        item.style.background = '';
        item.style.color = '';
    });
    const selected = document.querySelector(`.folder-item[data-folder-id="${folderId}"]`);
    if (selected) {
        selected.style.background = 'var(--primary-color)';
        selected.style.color = 'white';
    }
    // 更新当前选择显示
    const currentFolderText = document.getElementById('currentFolderText');
    if (currentFolderText) {
        if (folderId) {
            currentFolderText.textContent = `已选择: ${folderName} (${folderId.slice(-6)})`;
        }
        else {
            currentFolderText.textContent = '默认 cas_temp 目录';
        }
    }
    // 保存选中值
    window.selectedFamilyFolderId = folderId;
    window.selectedFamilyFolderName = folderName;
}
// 关闭弹窗
function closeFamilyFolderModal() {
    const modal = document.getElementById('familyFolderModal');
    if (modal) {
        modal.remove();
    }
    window.selectedFamilyFolderId = undefined;
    window.selectedFamilyFolderName = undefined;
}
// 确认选择
function confirmFamilyFolder(accountId) {
    return __awaiter(this, void 0, void 0, function* () {
        const checkbox = document.getElementById('autoCreateFolder');
        const folderId = (checkbox === null || checkbox === void 0 ? void 0 : checkbox.checked) ? '' : (window.selectedFamilyFolderId || '');
        try {
            loading.show();
            const response = yield fetch(`/api/accounts/${accountId}/family-folder`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ familyFolderId: folderId })
            });
            loading.hide();
            const data = yield response.json();
            if (data.success) {
                message.success('家庭中转目录配置成功');
                closeFamilyFolderModal();
                fetchAccounts(true);
            }
            else {
                message.warning('配置失败: ' + data.error);
            }
        }
        catch (error) {
            loading.hide();
            message.warning('操作失败: ' + error.message);
        }
    });
}
// 添加账号成功后弹出家庭中转目录选择器
function showFamilyFolderSelectorAfterAddAccount(accountId, familyId) {
    return __awaiter(this, void 0, void 0, function* () {
        // 创建目录选择器弹窗
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'familyFolderModal';
        modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3>配置家庭中转目录</h3>
                <button class="close-btn" onclick="closeFamilyFolderModal()">×</button>
            </div>
            <div style="padding: 20px;">
                <p style="color: #22c55e; font-size: 13px; margin-bottom: 10px;">
                    ✅ 检测到家庭空间（ID: ${familyId.slice(-6)}）
                </p>
                <p style="color: #888; font-size: 13px; margin-bottom: 15px;">
                    💡 选择家庭空间中的目录作为 CAS 秒传中转目录，或使用默认 cas_temp 目录
                </p>
                <div id="currentFolderDisplay" style="margin-bottom: 10px; padding: 10px; background: var(--bg-color); border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                    <span>
                        <strong>当前：</strong>
                        <span id="currentFolderText">默认 cas_temp 目录</span>
                    </span>
                    <button class="btn-secondary" style="padding: 4px 10px; font-size: 12px;" onclick="clearFamilyFolderSelection(${accountId})">清空</button>
                </div>
                <div id="folderTreeContainer" style="border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; max-height: 300px; overflow-y: auto;">
                    <div style="text-align: center; padding: 20px; color: #888;">加载中...</div>
                </div>
            </div>
            <div class="form-actions" style="padding: 15px 20px; border-top: 1px solid var(--border-color);">
                <button type="button" class="btn-secondary" onclick="closeFamilyFolderModal()">跳过</button>
                <button type="button" class="btn-primary" onclick="confirmFamilyFolder(${accountId})">确认</button>
            </div>
        </div>
    `;
        document.body.appendChild(modal);
        modal.style.display = 'block';
        // 加载家庭目录树，默认选中根目录（使用 cas_temp 目录）
        window.selectedFamilyFolderId = '';
        window.selectedFamilyFolderName = '默认 cas_temp';
        yield loadFamilyFolderTree(accountId, '', '');
    });
}
// ================= 扫码登录前端控制逻辑 =================
let qrPollInterval = null;
let currentQRData = null;
function switchLoginTab(mode) {
    const passTab = document.getElementById('tab-pass-login');
    const qrTab = document.getElementById('tab-qr-login');
    const passFields = document.getElementById('password-login-fields');
    const qrContainer = document.getElementById('qr-login-container');
    const submitBtn = document.querySelector('#accountForm button[type="submit"]');
    const usernameInput = document.getElementById('username');
    if (mode === 'pass') {
        passTab.classList.add('active');
        qrTab.classList.remove('active');
        passFields.style.display = 'block';
        qrContainer.style.display = 'none';
        submitBtn.style.display = 'inline-block';
        usernameInput.setAttribute('required', 'true');
        stopQRCodeFlow();
    }
    else {
        qrTab.classList.add('active');
        passTab.classList.remove('active');
        passFields.style.display = 'none';
        qrContainer.style.display = 'block';
        submitBtn.style.display = 'none';
        usernameInput.removeAttribute('required');
        startQRCodeFlow();
    }
}
function startQRCodeFlow() {
    return __awaiter(this, void 0, void 0, function* () {
        stopQRCodeFlow();
        const qrImg = document.getElementById('qr-code-img');
        const statusMsg = document.getElementById('qr-status-message');
        const statusMask = document.getElementById('qr-status-mask');
        const refreshBtn = document.getElementById('qr-refresh-btn');
        qrImg.src = '';
        qrImg.style.filter = 'blur(5px)';
        statusMsg.textContent = '正在获取二维码...';
        statusMask.style.display = 'none';
        refreshBtn.style.display = 'none';
        try {
            const response = yield fetch('/api/accounts/qr-code');
            const result = yield response.json();
            if (result.success) {
                currentQRData = result.data;
                qrImg.src = result.data.qrUrl;
                qrImg.onload = () => {
                    qrImg.style.filter = 'none';
                };
                statusMsg.textContent = '请使用天翼云盘 App 扫码登录';
                // 开始轮询状态
                qrPollInterval = setInterval(pollQRCodeStatus, 3000);
            }
            else {
                statusMsg.textContent = '获取二维码失败: ' + (result.error || '未知错误');
                qrImg.style.filter = 'none';
            }
        }
        catch (e) {
            statusMsg.textContent = '网络错误，获取二维码失败';
            qrImg.style.filter = 'none';
        }
    });
}
function stopQRCodeFlow() {
    if (qrPollInterval) {
        clearInterval(qrPollInterval);
        qrPollInterval = null;
    }
    currentQRData = null;
}
function pollQRCodeStatus() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (!currentQRData)
            return;
        try {
            const response = yield fetch('/api/accounts/qr-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentQRData)
            });
            const result = yield response.json();
            if (result.success) {
                const status = result.status;
                const statusMask = document.getElementById('qr-status-mask');
                const maskText = document.getElementById('qr-mask-text');
                const maskIcon = document.getElementById('qr-mask-icon');
                const refreshBtn = document.getElementById('qr-refresh-btn');
                const statusMsg = document.getElementById('qr-status-message');
                if (status === 0) {
                    // 登录成功
                    stopQRCodeFlow();
                    message.success('扫码登录成功！');
                    closeAddAccountModal();
                    fetchAccounts();
                    // 如果新账号包含家庭空间，弹出家庭中转目录选择器
                    if (((_a = result.data) === null || _a === void 0 ? void 0 : _a.familyId) && ((_b = result.data) === null || _b === void 0 ? void 0 : _b.accountId)) {
                        yield showFamilyFolderSelectorAfterAddAccount(result.data.accountId, result.data.familyId);
                    }
                }
                else if (status === -11002) {
                    // 已扫码，等待确认
                    statusMask.style.display = 'flex';
                    maskIcon.textContent = '🔔';
                    maskText.textContent = '已扫码，请在手机端确认';
                    refreshBtn.style.display = 'none';
                    statusMsg.textContent = '已扫码，等待确认中...';
                }
                else if (status === -11001) {
                    // 二维码过期
                    stopQRCodeFlow();
                    statusMask.style.display = 'flex';
                    maskIcon.textContent = '❌';
                    maskText.textContent = '二维码已过期';
                    refreshBtn.style.display = 'inline-block';
                    statusMsg.textContent = '二维码已过期，请点击重新获取';
                }
                else {
                    // 等待扫码中
                    statusMask.style.display = 'none';
                    statusMsg.textContent = '请使用天翼云盘 App 扫码登录';
                }
            }
        }
        catch (e) {
            console.error('轮询二维码状态失败:', e);
        }
    });
}
function refreshQRCode(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    startQRCodeFlow();
}
// 刷新账号容量缓存
function refreshCapacity() {
    return __awaiter(this, void 0, void 0, function* () {
        const btn = document.getElementById('refreshCapacityBtn');
        const originalText = btn.innerHTML;
        try {
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner"></i> 刷新中...';
            const response = yield fetch('/api/accounts/refresh-capacity', { method: 'POST' });
            const data = yield response.json();
            if (data.success) {
                // 刷新成功后重新加载账号列表
                yield fetchAccounts();
                // 显示成功提示
                showToast(data.message, 'success');
            }
            else {
                showToast('刷新失败: ' + data.error, 'error');
            }
        }
        catch (e) {
            console.error('刷新容量失败:', e);
            showToast('刷新失败: ' + e.message, 'error');
        }
        finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
}
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
    `;
    toast.style.background = type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#6366f1';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
