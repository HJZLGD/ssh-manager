// ==================== 消息路由 ====================
const MessageHandler = {
    handle(msg) {
        switch (msg.type) {
            // ---- 文件面板 ----
            case 'dir_list':
                Panels.render(msg.panel, msg.path, msg.files, msg.highlight);
                break;

            // ---- 终端 ----
            case 'terminal_created':
                TerminalManager.createFromBackend(msg.terminalId, msg.title, msg.cwd);
                break;

            case 'terminal_output':
                TerminalManager.write(msg.terminalId, msg.data);
                break;

            case 'terminal_list':
                // 后端返回的终端列表，暂时忽略（前端自己维护）
                break;

            // ---- 查找 ----
            case 'find_result':
                DialogManager.showFindResults(msg);
                break;

            case 'find_progress':
                Utils.showToast(msg.message);
                break;

            // ---- 确认弹窗 ----
            case 'confirm_required':
                this._handleConfirm(msg);
                break;

            // ---- 通知 ----
            case 'success':
                Utils.showToast(msg.message);
                break;

            case 'info':
                Utils.showToast(msg.message);
                break;

            case 'error':
                Utils.showToast(msg.message, 'error');
                break;

            default:
                console.log('未处理的消息类型:', msg.type, msg);
        }
    },

    _handleConfirm(msg) {
        const { action, file, files, message } = msg;

        // 用原生 confirm 简单处理，正式场景可以换成自定义弹窗
        if (confirm(message)) {
            WebSocketManager.send({
                action: this._getConfirmAction(action),
                files: files || [file],
                confirmed: true
            });
        }
    },

    _getConfirmAction(action) {
        const map = {
            'delete_batch': 'delete_confirm',
            'delete_large_dir': 'delete_confirm',
            'overwrite': 'delete_confirm',  // 实际上应该发 copy_confirm，但后端只有 delete_confirm
            'overwrite_move': 'delete_confirm',
            'chmod_execute': 'chmod_execute',
            'open_large_file': 'open_file'
        };
        return map[action] || action;
    }
};