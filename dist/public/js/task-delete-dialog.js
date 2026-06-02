"use strict";
// 删除任务确认弹窗功能
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// 显示删除确认弹窗
function showDeleteConfirmDialog(taskId, taskName) {
    return new Promise((resolve) => {
        const dialog = document.createElement('div');
        dialog.className = 'delete-confirm-dialog';
        dialog.innerHTML = `
            <div class="delete-confirm-overlay"></div>
            <div class="delete-confirm-content">
                <div class="delete-confirm-header">
                    <span class="delete-confirm-icon">⚠️</span>
                    <h3>确认删除任务</h3>
                </div>
                <div class="delete-confirm-body">
                    <p class="task-info">任务 ID: ${taskId}</p>
                    ${taskName ? `<p class="task-name">任务名称: ${taskName}</p>` : ''}
                    <label class="delete-cloud-checkbox">
                        <input type="checkbox" id="confirmDeleteCloud">
                        <span>同时删除网盘中对应的文件</span>
                    </label>
                    <p class="delete-warning" style="display: none;">
                        ⚠️ 此操作将永久删除网盘文件，无法恢复！
                    </p>
                </div>
                <div class="delete-confirm-footer">
                    <button class="btn-cancel" id="cancelDelete">取消</button>
                    <button class="btn-confirm" id="confirmDelete">确认删除</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        const checkbox = dialog.querySelector('#confirmDeleteCloud');
        const warning = dialog.querySelector('.delete-warning');
        const cancelBtn = dialog.querySelector('#cancelDelete');
        const confirmBtn = dialog.querySelector('#confirmDelete');
        checkbox.addEventListener('change', (e) => {
            warning.style.display = e.target.checked ? 'block' : 'none';
            confirmBtn.className = e.target.checked ? 'btn-confirm-danger' : 'btn-confirm';
        });
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(dialog);
            resolve({ confirmed: false });
        });
        confirmBtn.addEventListener('click', () => {
            const deleteCloud = checkbox.checked;
            document.body.removeChild(dialog);
            resolve({ confirmed: true, deleteCloud });
        });
        dialog.querySelector('.delete-confirm-overlay').addEventListener('click', () => {
            document.body.removeChild(dialog);
            resolve({ confirmed: false });
        });
    });
}
// 重写删除任务函数
window.originalDeleteTask = window.deleteTask;
function deleteTaskWithDialog(id) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const task = (_a = window.currentTasks) === null || _a === void 0 ? void 0 : _a.find(t => t.id === id);
        const result = yield showDeleteConfirmDialog(id, task === null || task === void 0 ? void 0 : task.resourceName);
        if (!result.confirmed)
            return;
        if (typeof loading !== 'undefined')
            loading.show();
        try {
            const response = yield fetch(`/api/tasks/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleteCloud: result.deleteCloud })
            });
            const data = yield response.json();
            if (data.success) {
                if (typeof removeTmdbCache !== 'undefined')
                    removeTmdbCache(id);
                if (typeof message !== 'undefined')
                    message.success('任务删除成功');
                if (typeof fetchTasks !== 'undefined')
                    fetchTasks();
            }
            else {
                if (typeof message !== 'undefined')
                    message.warning('任务删除失败: ' + data.error);
            }
        }
        catch (error) {
            if (typeof message !== 'undefined')
                message.error('删除失败: ' + error.message);
        }
        finally {
            if (typeof loading !== 'undefined')
                loading.hide();
        }
    });
}
// 替换全局的 deleteTask 函数
window.deleteTask = deleteTaskWithDialog;
