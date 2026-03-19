// 修改任务相关功能
let shareFolderSelector = new FolderSelector({
    apiUrl: "/api/share/folders",
    onSelect: ({ id, name, path }) => {
        document.getElementById('shareFolder').value = path;
        document.getElementById('shareFolderId').value = id;
    },
    buildParams: (accountId, folderId) => {
        const taskId = document.getElementById('editTaskId').value;
        return `${accountId}?folderId=${folderId}&taskId=${taskId}`;
    }
});

let editFolderSelector = new FolderSelector({
    onSelect: ({ id, name, path }) => {
        document.getElementById('editRealFolder').value = path;
        document.getElementById('editRealFolderId').value = id;
    }
});

function showEditTaskModal(id) {
    const task = getTaskById(id)
    document.getElementById('editTaskId').value = id;
    document.getElementById('editResourceName').value = task.resourceName;
    document.getElementById('editRealFolder').value = task.realFolderName?task.realFolderName:task.realFolderId;
    document.getElementById('editRealFolderId').value = task.realFolderId;
    document.getElementById('editCurrentEpisodes').value = task.currentEpisodes;
    document.getElementById('editTotalEpisodes').value = task.totalEpisodes;
    document.getElementById('editStatus').value = task.status;
    document.getElementById('editShareLink').value = task.shareLink;
    document.getElementById('editAccessCode').value = task.accessCode || '';
    document.getElementById('editShareParseError').textContent = '';
    document.getElementById('shareFolder').value = task.shareFolderName;
    document.getElementById('shareFolderId').value = task.shareFolderId;
    document.getElementById('editMatchPattern').value = task.matchPattern;
    document.getElementById('editMatchOperator').value = task.matchOperator;
    document.getElementById('editMatchValue').value = task.matchValue;
    document.getElementById('editRemark').value = task.remark;
    document.getElementById('editTaskModal').style.display = 'block';
    document.getElementById('editEnableCron').checked = task.enableCron;
    document.getElementById('editCronExpression').value = task.cronExpression;
    document.getElementById('editAccountId').value = task.accountId;

    document.getElementsByClassName('cronExpression-box')[1].style.display = task.enableCron?'block':'none';
    document.getElementById('editEnableCron').addEventListener('change', function() {
        // 如果为选中 则显示cron表达式输入框
        const cronInput = document.getElementsByClassName('cronExpression-box')[1];
        cronInput.style.display = this.checked? 'block' : 'none';
    });
    document.getElementById('editEnableTaskScraper').checked = task?.enableTaskScraper;
}

async function parseEditShareLink() {
    const shareParseError = document.getElementById('editShareParseError');
    shareParseError.textContent = '';
    let shareLink = document.getElementById('editShareLink')?.value?.trim();
    let accessCode = document.getElementById('editAccessCode')?.value?.trim();
    const accountId = document.getElementById('editAccountId')?.value;
    if (!shareLink || !accountId) {
        return;
    }
    shareLink = decodeURIComponent(shareLink);
    const { url: parsedShareLink, accessCode: parsedAccessCode } = parseCloudShare(shareLink);
    if (parsedAccessCode) {
        accessCode = parsedAccessCode;
        document.getElementById('editAccessCode').value = accessCode;
    }

    try {
        loading.show();
        const response = await fetch('/api/share/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shareLink: parsedShareLink, accessCode, accountId })
        });
        const data = await response.json();
        if (data.success && data.data && data.data.length > 0) {
            document.getElementById('shareFolder').value = data.data[0].name;
            document.getElementById('shareFolderId').value = data.data[0].id;
        } else {
            if (data.error) {
                shareParseError.textContent = `解析失败: ${data.error}`;
            }
        }
    } catch (error) {
        shareParseError.textContent = `操作失败: ${error.message}`;
    } finally {
        loading.hide();
    }
}

function closeEditTaskModal() {
    document.getElementById('editTaskModal').style.display = 'none';
}

function initEditTaskForm() {
    const debouncedHandleShare = debounce(parseEditShareLink, 500);
    const shareInputs = document.querySelectorAll('[data-edit-share-input]');
    shareInputs.forEach(input => {
        input.addEventListener('blur', debouncedHandleShare);
    });

    document.getElementById('shareFolder').addEventListener('click', (e) => {
        e.preventDefault();
        const accountId = document.getElementById('editAccountId').value;
        if (!accountId) {
            message.warning('请先选择账号');
            return;
        }
        shareFolderSelector.show(accountId);
    });

    // 更新目录也改为点击触发
    document.getElementById('editRealFolder').addEventListener('click', (e) => {
        e.preventDefault();
        const accountId = document.getElementById('editAccountId').value;
        if (!accountId) {
            message.warning('请先选择账号');
            return;
        }
        editFolderSelector.show(accountId);
    });

    document.getElementById('editTaskForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editTaskId').value;
        const resourceName = document.getElementById('editResourceName').value;
        const realFolderId = document.getElementById('editRealFolderId').value;
        const realFolderName = document.getElementById('editRealFolder').value;
        const currentEpisodes = document.getElementById('editCurrentEpisodes').value;
        const totalEpisodes = document.getElementById('editTotalEpisodes').value;
        const shareFolderName = document.getElementById('shareFolder').value;
        const shareFolderId = document.getElementById('shareFolderId').value;
        const shareLink = document.getElementById('editShareLink').value;
        const accessCode = document.getElementById('editAccessCode').value;
        const status = document.getElementById('editStatus').value;

        const matchPattern = document.getElementById('editMatchPattern').value
        const matchOperator = document.getElementById('editMatchOperator').value
        const matchValue = document.getElementById('editMatchValue').value
        const remark = document.getElementById('editRemark').value

        const enableCron = document.getElementById('editEnableCron').checked;
        const cronExpression = document.getElementById('editCronExpression').value;
        const enableTaskScraper = document.getElementById('editEnableTaskScraper').checked;

        try {
            loading.show()
            const response = await fetch(`/api/tasks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resourceName,
                    shareLink,
                    accessCode,
                    realFolderId,
                    currentEpisodes: currentEpisodes?parseInt(currentEpisodes):0,
                    totalEpisodes: totalEpisodes?parseInt(totalEpisodes):0,
                    status,
                    shareFolderName,
                    shareFolderId,
                    realFolderName,
                    matchPattern,
                    matchOperator,
                    matchValue,
                    remark,
                    enableCron,
                    cronExpression,
                    enableTaskScraper
                })
            });
            loading.hide()
            if (response.ok) {
                closeEditTaskModal();
                await fetchTasks();
            } else {
                const error = await response.json();
                message.warning(error.message || '修改任务失败');
            }
        } catch (error) {
            message.warning('修改任务失败：' + error.message);
        }
    });
}
