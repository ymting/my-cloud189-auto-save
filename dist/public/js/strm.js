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
function fillAccountsList() {
    const accountsListDom = document.getElementById('accountsList');
    // 从全局账号列表获取数据并填充
    accountsList.forEach(account => {
        const accountItem = document.createElement('label');
        accountItem.onmouseover = () => {
            accountItem.style.backgroundColor = 'var(--hover-color)';
        };
        accountItem.onmouseout = () => {
            accountItem.style.backgroundColor = 'var(--background-color)';
        };
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = account.id;
        checkbox.className = 'account-checkbox';
        const label = document.createElement('span');
        label.textContent = account.username;
        if (account.alias) {
            label.textContent += ` (${account.alias})`;
        }
        accountItem.appendChild(checkbox);
        accountItem.appendChild(label);
        accountsListDom.appendChild(accountItem);
    });
}
function openStrmModal() {
    document.getElementById('strmModal').style.display = 'block';
    document.getElementById('accountsList').innerHTML = ''; // 清空现有列表
    fillAccountsList();
    // 添加全选事件监听
    document.getElementById('selectAllAccounts').addEventListener('change', handleSelectAllAccounts);
}
function closeStrmModal() {
    const modal = document.getElementById('strmModal');
    modal.style.display = 'none';
}
function handleSelectAllAccounts() {
    const selectAllCheckbox = document.getElementById('selectAllAccounts');
    const accountCheckboxes = document.querySelectorAll('.account-checkbox');
    accountCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });
}
function generateAllStrm() {
    return __awaiter(this, arguments, void 0, function* (overwrite = false) {
        const selectedAccounts = Array.from(document.querySelectorAll('.account-checkbox:checked'))
            .map(checkbox => checkbox.value);
        if (selectedAccounts.length === 0) {
            message.error('请至少选择一个账号');
            return;
        }
        console.log(JSON.stringify({
            accountIds: selectedAccounts,
            overwrite: overwrite
        }));
        try {
            const response = yield fetch('/api/strm/generate-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accountIds: selectedAccounts,
                    overwrite: overwrite
                })
            });
            message.success("执行中, 请稍后查看结果");
        }
        catch (error) {
            message.error('生成STRM失败: ' + error.message);
        }
    });
}
