// ==================== 弹窗管理（完整版）====================
const DialogManager = {
    // === 操作浮层（长按弹出） ===
    showActionSheet(panel) {
        const count = State.panels[panel].selected.length;
        const overlay = document.getElementById('actionOverlay');

        overlay.innerHTML = `
            <div class="action-sheet" onclick="event.stopPropagation()">
                <div class="title">选中了 ${count} 个项目</div>
                <div class="action-row">
                    <button onclick="DialogManager.doAction('execute')">▶️ 执行</button>
                </div>
                <div class="action-row">
                    <button onclick="DialogManager.doAction('copy')">📋 复制</button>
                    <button onclick="DialogManager.doAction('move')">📦 移动</button>
                    <button onclick="DialogManager.doAction('delete')" class="danger">🗑️ 删除</button>
                </div>
                <div class="modal-buttons" style="margin-top:12px;">
                    <button class="btn-cancel" onclick="DialogManager.hideActionSheet()">取消</button>
                </div>
            </div>
        `;

        overlay.classList.add('active');
    },

    hideActionSheet() {
        document.getElementById('actionOverlay').classList.remove('active');
    },

    doAction(action) {
        const panel = State.lastOperatedPanel;
        const filePaths = Panels.getSelectedPaths(panel);

        if (filePaths.length === 0) {
            Utils.showToast('请先选择文件', 'error');
            return;
        }

        this.hideActionSheet();

        switch(action) {
            case 'execute': {
                const filePath = filePaths[0];
                const files = State.panels[panel].files;
                const file = files.find(f => f.path === filePath);
                if (!file || file.isDir) {
                    Utils.showToast('请选择一个可执行文件', 'error');
                    return;
                }
                const dir = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
                const fileName = file.name;

                WebSocketManager.send({
                    action: 'execute',
                    file: filePath,
                    panel: panel
                });
                Utils.showToast(`正在执行: ${fileName}`);
                break;
            }
            case 'copy': {
                const targetPanel = panel === 'left' ? 'right' : 'left';
                WebSocketManager.send({
                    action: 'copy',
                    sourcePanel: panel,
                    files: filePaths,
                    targetPanel: targetPanel
                });
                Utils.showToast(`正在复制 ${filePaths.length} 个项目到 ${targetPanel} 面板`);
                break;
            }
            case 'move': {
                const moveTarget = panel === 'left' ? 'right' : 'left';
                WebSocketManager.send({
                    action: 'move',
                    sourcePanel: panel,
                    files: filePaths,
                    targetPanel: moveTarget
                });
                Utils.showToast(`正在移动 ${filePaths.length} 个项目`);
                break;
            }
            case 'delete': {
                const fileNames = filePaths.map(p => p.split('/').pop()).join('\n');
                if (confirm(`确定删除以下 ${filePaths.length} 个项目？\n\n${fileNames}`)) {
                    WebSocketManager.send({
                        action: 'delete',
                        files: filePaths
                    });
                    Panels.clearSelection(panel);
                }
                break;
            }
        }
    },

    // === 设置弹窗 ===
    showSettings() {
        const overlay = document.getElementById('settingsModal');
        const savedHost = localStorage.getItem('ssh_host') || 'ws://192.168.1.100:3000';
        const savedToken = localStorage.getItem('ssh_token') || '';

        overlay.innerHTML = `
            <div class="modal">
                <h3>⚙️ 设置</h3>
                <label style="font-size:12px;color:#888;display:block;margin-bottom:4px;">服务器地址</label>
                <input type="text" class="setting-input" id="serverInput" 
                       value="${Utils.escapeHtml(savedHost)}" 
                       placeholder="ws://192.168.1.100:3000">
                <label style="font-size:12px;color:#888;display:block;margin-bottom:4px;margin-top:8px;">连接密码</label>
                <input type="password" class="setting-input" id="tokenInput" 
                       value="${Utils.escapeHtml(savedToken)}" 
                       placeholder="(可选) 设置连接密码">
                <div style="font-size:11px;color:#666;margin-bottom:8px;">
                    当前状态: ${State.ws && State.ws.readyState === WebSocket.OPEN ? 
                        '<span style="color:#4ec9b0;">✅ 已连接</span>' : 
                        '<span style="color:#f48771;">❌ 未连接</span>'}
                </div>
                <div class="modal-buttons">
                    <button class="btn-cancel" onclick="DialogManager.hideSettings()">关闭</button>
                    <button class="btn-confirm" onclick="DialogManager.saveSettings()">连接</button>
                </div>
            </div>
        `;
        overlay.classList.add('active');
    },

    hideSettings() {
        document.getElementById('settingsModal').classList.remove('active');
    },

    saveSettings() {
        const host = document.getElementById('serverInput').value.trim();
        const token = document.getElementById('tokenInput').value.trim();

        if (!host) {
            Utils.showToast('请输入服务器地址', 'error');
            return;
        }

        localStorage.setItem('ssh_host', host);
        localStorage.setItem('ssh_token', token);

        WebSocketManager.connect(host, token);
        this.hideSettings();
    },

    // === 查找弹窗 ===
    showFindDialog() {
        State.findPanel = State.lastOperatedPanel;
        const overlay = document.getElementById('findModal');

        overlay.innerHTML = `
            <div class="modal">
                <h3>🔍 查找文件</h3>
                <input type="text" class="find-input" id="findInput" 
                       placeholder="输入文件名..."
                       oninput="DialogManager.doFind()"
                       onkeydown="if(event.key==='Enter')DialogManager.doFind()">
                <div style="font-size:11px;color:#666;margin-bottom:8px;">
                    在 ${Utils.escapeHtml(State.panels[State.findPanel].path)} 中查找
                </div>
                <div class="find-results" id="findResults">
                    <div style="padding:8px;color:#888;">输入关键字开始搜索...</div>
                </div>
                <div class="modal-buttons">
                    <button class="btn-cancel" onclick="DialogManager.hideFindDialog()">关闭</button>
                </div>
            </div>
        `;
        overlay.classList.add('active');

        setTimeout(() => {
            const input = document.getElementById('findInput');
            if (input) input.focus();
        }, 200);
    },

    hideFindDialog() {
        document.getElementById('findModal').classList.remove('active');
    },

    doFind() {
        const keyword = document.getElementById('findInput').value.trim();
        const resultsDiv = document.getElementById('findResults');

        if (keyword.length < 2) {
            resultsDiv.innerHTML = '<div style="padding:8px;color:#888;">输入至少2个字符开始搜索...</div>';
            return;
        }

        resultsDiv.innerHTML = '<div style="padding:8px;color:#888;">⏳ 搜索中...</div>';

        WebSocketManager.send({
            action: 'find',
            keyword: keyword,
            panel: State.findPanel
        });
    },

    showFindResults(msg) {
        const results = document.getElementById('findResults');
        if (!results) return;

        if (!msg.files || msg.files.length === 0) {
            results.innerHTML = '<div style="padding:8px;color:#f48771;">未找到匹配的文件</div>';
            return;
        }

        results._files = msg.files;

        results.innerHTML = msg.files.map((f, idx) => `
            <div class="find-item" data-file-idx="${idx}">
                <span class="fname">📄 ${Utils.escapeHtml(f.name)}</span>
                <span class="fdir">${Utils.escapeHtml(f.dir)}</span>
            </div>
        `).join('');

        if (results._clickHandler) {
            results.removeEventListener('click', results._clickHandler);
        }

        results._clickHandler = (e) => {
            const item = e.target.closest('.find-item');
            if (!item) return;
            const idx = parseInt(item.dataset.fileIdx);
            const files = results._files || [];
            const file = files[idx];
            if (file) {
                this.navigateToFoundFile(file.path);
            }
        };

        results.addEventListener('click', results._clickHandler);

        const header = results.previousElementSibling;
        if (header && header.tagName === 'DIV') {
            header.textContent = `找到 ${msg.files.length} 个结果`;
        }
    },

    navigateToFoundFile(fullPath) {
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/')) || '/';
        Panels.navigate(State.findPanel, dir);
        this.hideFindDialog();
        Utils.showToast(`已跳转到: ${dir}`);
    },

    // === 新建弹窗 ===
    showCreateDialog() {
        const overlay = document.getElementById('createModal');

        overlay.innerHTML = `
            <div class="modal">
                <h3>➕ 新建</h3>
                <input type="text" class="create-input" id="createInput" 
                       placeholder="输入名称..."
                       onkeydown="if(event.key==='Enter')DialogManager.doCreate()">
                <div class="create-options" id="createOptions">
                    <button class="active" data-type="file" onclick="DialogManager.selectCreateType('file')">📄 文件</button>
                    <button data-type="dir" onclick="DialogManager.selectCreateType('dir')">📁 文件夹</button>
                </div>
                <div style="font-size:11px;color:#666;margin-bottom:8px;">
                    创建到: ${Utils.escapeHtml(State.panels[State.lastOperatedPanel].path)}
                </div>
                <div class="modal-buttons">
                    <button class="btn-cancel" onclick="DialogManager.hideCreateDialog()">取消</button>
                    <button class="btn-confirm" onclick="DialogManager.doCreate()">创建</button>
                </div>
            </div>
        `;
        overlay.classList.add('active');

        setTimeout(() => {
            const input = document.getElementById('createInput');
            if (input) input.focus();
        }, 200);
    },

    hideCreateDialog() {
        document.getElementById('createModal').classList.remove('active');
    },

    selectCreateType(type) {
        document.querySelectorAll('#createOptions button').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`[data-type="${type}"]`);
        if (btn) btn.classList.add('active');
    },

    doCreate() {
        const name = document.getElementById('createInput').value.trim();
        if (!name) {
            Utils.showToast('请输入名称', 'error');
            return;
        }

        if (/[<>:"/\\|?*]/.test(name)) {
            Utils.showToast('名称包含非法字符', 'error');
            return;
        }

        const typeBtn = document.querySelector('#createOptions .active');
        const type = typeBtn ? typeBtn.dataset.type : 'file';
        const panel = State.lastOperatedPanel;

        WebSocketManager.send({
            action: 'create',
            panel: panel,
            name: name,
            type: type
        });

        this.hideCreateDialog();
        Utils.showToast(`正在创建 ${type === 'file' ? '文件' : '文件夹'}: ${name}`);
    }
};