"use strict";
class AIConfirmDialog {
    constructor() {
        this.dialog = null;
        this.resolvePromise = null;
    }
    show(options) {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this._createDialog(options);
        });
    }
    _createDialog(options) {
        const { title = '操作确认', message = '', operation = {}, impact = {}, securityLevel = 2 } = options;
        this.dialog = document.createElement('div');
        this.dialog.className = 'ai-confirm-dialog-overlay';
        this.dialog.innerHTML = `
            <div class="ai-confirm-dialog">
                <div class="confirm-header">
                    <span class="confirm-icon">${securityLevel === 3 ? '⚠️' : 'ℹ️'}</span>
                    <h3>${title}</h3>
                </div>
                
                <div class="confirm-body">
                    <div class="operation-desc">
                        <p class="operation-name">即将执行：<strong>${this._formatOperationName(operation.name)}</strong></p>
                        ${message ? `<p class="warning-text">${message}</p>` : ''}
                    </div>
                    
                    ${Object.keys(impact).length > 0 ? this._renderImpactAnalysis(impact) : ''}
                    
                    ${operation.params ? this._renderParams(operation.params) : ''}
                </div>
                
                <div class="confirm-footer">
                    <button class="btn-cancel" onclick="window.aiConfirmDialog.cancel()">取消</button>
                    <button class="btn-confirm ${securityLevel === 3 ? 'danger' : ''}" onclick="window.aiConfirmDialog.confirm()">确认执行</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.dialog);
        document.body.style.overflow = 'hidden';
    }
    _formatOperationName(name) {
        const names = {
            'delete_task': '删除任务',
            'batch_delete': '批量删除任务',
            'batch_operation': '批量操作',
            'update_config': '修改配置'
        };
        return names[name] || name;
    }
    _renderParams(params) {
        const items = Object.entries(params)
            .map(([key, value]) => `
                <div class="detail-item">
                    <span class="label">${this._formatParamKey(key)}：</span>
                    <span class="value">${value}</span>
                </div>
            `)
            .join('');
        return `
            <div class="operation-details">
                <div class="details-title">参数详情：</div>
                ${items}
            </div>
        `;
    }
    _formatParamKey(key) {
        const keys = {
            'taskId': '任务ID',
            'deleteCloud': '删除云盘文件',
            'operation': '操作类型',
            'status': '状态'
        };
        return keys[key] || key;
    }
    _renderImpactAnalysis(impact) {
        const items = [];
        if (impact.count !== undefined) {
            items.push(`影响任务数：${impact.count}`);
        }
        if (impact.warnings && impact.warnings.length > 0) {
            items.push(...impact.warnings.map(w => `⚠️ ${w}`));
        }
        return `
            <div class="impact-analysis">
                <div class="impact-title">影响范围：</div>
                <ul class="impact-list">
                    ${items.map(item => `<li>${item}</li>`).join('')}
                </ul>
            </div>
        `;
    }
    confirm() {
        this._close();
        if (this.resolvePromise) {
            this.resolvePromise({ confirmed: true });
        }
    }
    cancel() {
        this._close();
        if (this.resolvePromise) {
            this.resolvePromise({ confirmed: false });
        }
    }
    _close() {
        if (this.dialog) {
            document.body.removeChild(this.dialog);
            this.dialog = null;
            document.body.style.overflow = '';
        }
    }
}
window.aiConfirmDialog = new AIConfirmDialog();
