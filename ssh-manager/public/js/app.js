// ==================== 主程序（完整版）====================
const App = {
    init() {
        this.bindButtons();
        this.loadInitialData();
    },

    bindButtons() {
        // ☰ 设置
        const menuBtn = document.getElementById('menuBtn');
        if (menuBtn) {
            menuBtn.addEventListener('click', () => DialogManager.showSettings());
        }

        // ▶️ 运行选中文件
        const btnExecute = document.getElementById('btnExecute');
        if (btnExecute) {
            btnExecute.addEventListener('click', () => {
                const panel = State.lastOperatedPanel;
                const selected = State.panels[panel].selected;

                if (selected.length === 0) {
                    Utils.showToast('请先选择一个文件', 'error');
                    return;
                }

                const file = State.panels[panel].files[selected[0]];
                if (!file || file.isDir) {
                    Utils.showToast('请选择一个可执行文件', 'error');
                    return;
                }

                // 不预创建终端，让后端创建 pty 后前端再建 xterm
                WebSocketManager.send({
                    action: 'execute',
                    file: file.path,
                    panel: panel
                });

                Utils.showToast(`正在执行: ${file.name}`);
            });
        }

        // 🔍 查找
        const btnFind = document.getElementById('btnFind');
        if (btnFind) {
            btnFind.addEventListener('click', () => DialogManager.showFindDialog());
        }

        // ➕ 新建
        const btnCreate = document.getElementById('btnCreate');
        if (btnCreate) {
            btnCreate.addEventListener('click', () => DialogManager.showCreateDialog());
        }

        // ⇆ 同步
        const btnSync = document.getElementById('btnSync');
        if (btnSync) {
            btnSync.addEventListener('click', () => {
                const panel = State.lastOperatedPanel;
                const targetPanel = panel === 'left' ? 'right' : 'left';
                const path = State.panels[panel].path;

                WebSocketManager.send({
                    action: 'sync',
                    fromPanel: panel,
                    path: path
                });

                Utils.showToast(`已将 ${panel} 同步到 ${targetPanel}`);
            });
        }

        // ↑ 后退
        const btnBack = document.getElementById('btnBack');
        if (btnBack) {
            btnBack.addEventListener('click', () => {
                const panel = State.lastOperatedPanel;
                const prevPath = History.pop(panel);

                if (prevPath) {
                    Panels.navigate(panel, prevPath);
                } else {
                    Utils.showToast('没有更多历史记录', 'error');
                }
            });
        }

        // 新增终端
        const addTerminalBtn = document.getElementById('addTerminalBtn');
        if (addTerminalBtn) {
            addTerminalBtn.addEventListener('click', () => {
                TerminalManager.create();
            });
        }
    },

    loadInitialData() {
        Utils.showToast('正在加载...');

        Panels.navigate('left', '/');
        Panels.navigate('right', '/home');

        // 默认创建一个终端
        try {
            if (typeof Terminal !== 'undefined' && typeof FitAddon !== 'undefined') {
                TerminalManager.create('/', '终端');
            }
        } catch (e) {
            console.log('终端库未加载，稍后重试');
        }

        setTimeout(() => {
            const savedHost = localStorage.getItem('ssh_host');
            const savedToken = localStorage.getItem('ssh_token');
            if (savedHost) {
                WebSocketManager.connect(savedHost, savedToken);
            } else {
                WebSocketManager.connect();
            }
        }, 500);
    }
};

// DOM 加载完成后启动
document.addEventListener('DOMContentLoaded', () => App.init());

// 页面关闭时清理
window.addEventListener('beforeunload', () => {
    History.clear();
    WebSocketManager.disconnect();
});