// ==================== 终端管理 ====================
const TerminalManager = {
    _terminals: {},
    _activeId: null,
    _counter: 0,
    _typeCounters: {},

    /**
     * 根据文件路径获取类型标签
     */
    _getTypeLabel(filePath) {
        if (!filePath) return '终端';
        const ext = filePath.split('.').pop().toLowerCase();
        const extMap = {
            txt: 'txt', c: 'c', cpp: 'cpp', h: 'h', hpp: 'hpp',
            js: 'js', ts: 'ts', jsx: 'jsx', tsx: 'tsx',
            py: 'py', go: 'go', rs: 'rs', java: 'java',
            html: 'html', css: 'css', scss: 'scss', less: 'less',
            json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yml',
            md: 'md', sh: 'sh', bash: 'bash', zsh: 'zsh',
            conf: 'conf', ini: 'ini', cfg: 'cfg', log: 'log',
            sql: 'sql', rb: 'rb', php: 'php', pl: 'pl', lua: 'lua',
            vim: 'vim', lua: 'lua', swift: 'swift', kt: 'kt',
            dart: 'dart', vue: 'vue', svelte: 'svelte',
            makefile: 'mk', dockerfile: 'docker',
        };
        return extMap[ext] || ext || '终端';
    },

    /**
     * 创建新终端（前端主动创建，如点 + 或工具栏执行）
     */
    create(cwd, title, filePath) {
        const termId = `term_${++this._counter}`;

        // 确定类型标签
        const type = filePath ? this._getTypeLabel(filePath) : '终端';
        this._typeCounters[type] = (this._typeCounters[type] || 0) + 1;
        const typeIndex = this._typeCounters[type];
        const displayTitle = title || `${type}${typeIndex}`;

        // 显示终端容器
        document.getElementById('terminalContainer').style.display = 'flex';
        document.getElementById('panelsContainer').style.display = 'none';

        const tab = this._createTab(termId, displayTitle);
        const wrapper = this._createWrapper(termId);
        const closeBtn = this._createCloseBtn(termId);
        wrapper.appendChild(closeBtn);

        const term = this._createXterm(wrapper);
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        setTimeout(() => fitAddon.fit(), 100);

        if (!this._activeId) {
            this.activate(termId);
        }

        term.onData(data => {
            WebSocketManager.send({
                action: 'terminal_input',
                terminalId: termId,
                data: data
            });
        });

        this._terminals[termId] = {
            tab, term, wrapper, fitAddon,
            title: displayTitle,
            type,
            visible: true,
            minimized: false
        };

        // 通知后端创建终端
        WebSocketManager.send({
            action: 'create_terminal',
            terminalId: termId,
            cwd: cwd || '/',
            cols: term.cols,
            rows: term.rows
        });

        return termId;
    },

    /**
     * 后端主动创建的终端（execute / open_file 等）
     * 前端根据后端返回的 terminal_created 来创建 xterm 实例
     */
    createFromBackend(termId, title, cwd) {
        // 如果已经存在，跳过
        if (this._terminals[termId]) return;

        // 从 title 提取类型
        let type = '终端';
        if (title) {
            if (title.startsWith('执行:') || title.startsWith('编辑:')) {
                const filePath = title.replace(/^(执行:|编辑:)\s*/, '');
                type = this._getTypeLabel(filePath);
            } else if (title.startsWith('终端')) {
                type = '终端';
            }
        }

        this._typeCounters[type] = (this._typeCounters[type] || 0) + 1;
        const typeIndex = this._typeCounters[type];
        // 如果标题已经有数字了就不用重编号
        const displayTitle = title || `${type}${typeIndex}`;

        document.getElementById('terminalContainer').style.display = 'flex';
        document.getElementById('panelsContainer').style.display = 'none';

        const tab = this._createTab(termId, displayTitle);
        const wrapper = this._createWrapper(termId);
        const closeBtn = this._createCloseBtn(termId);
        wrapper.appendChild(closeBtn);

        const term = this._createXterm(wrapper);
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        setTimeout(() => fitAddon.fit(), 100);

        if (!this._activeId) {
            this.activate(termId);
        }

        term.onData(data => {
            WebSocketManager.send({
                action: 'terminal_input',
                terminalId: termId,
                data: data
            });
        });

        this._terminals[termId] = {
            tab, term, wrapper, fitAddon,
            title: displayTitle,
            type,
            visible: true,
            minimized: false
        };
    },

    _createTab(termId, title) {
        const bar = document.getElementById('terminalBar');
        const addBtn = document.getElementById('addTerminalBtn');
        const tab = document.createElement('div');
        tab.className = 'term-tab';
        tab.dataset.termId = termId;
        tab.innerHTML = `<span class="tab-title">${Utils.escapeHtml(title)}</span>`;

        tab.addEventListener('click', () => this.toggleTerminal(termId));
        bar.insertBefore(tab, addBtn);
        return tab;
    },

    _createWrapper(termId) {
        const wrapper = document.createElement('div');
        wrapper.id = `term-wrapper-${termId}`;
        wrapper.className = 'terminal-wrapper';
        wrapper.style.cssText = 'flex:1;display:none;position:relative;';
        document.getElementById('terminalContainer').appendChild(wrapper);
        return wrapper;
    },

    _createCloseBtn(termId) {
        const btn = document.createElement('div');
        btn.className = 'term-close-btn';
        btn.textContent = '×';
        btn.title = '关闭终端';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.close(termId);
        });
        btn.addEventListener('mouseenter', () => {
            btn.style.color = '#fff';
            btn.style.background = 'rgba(200,50,50,0.8)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.color = '#888';
            btn.style.background = 'rgba(60,60,60,0.8)';
        });
        return btn;
    },

    _createXterm(wrapper) {
        const term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            theme: {
                background: '#1e1e1e',
                foreground: '#d4d4d4',
                cursor: '#d4d4d4',
                selection: '#264f78'
            }
        });
        term.open(wrapper);
        return term;
    },

    /**
     * 切换终端显示状态
     */
    toggleTerminal(termId) {
        const termData = this._terminals[termId];
        if (!termData) return;

        // 点击的是当前激活且可见的 → 隐藏（最小化）
        if (this._activeId === termId && termData.visible) {
            this.minimize(termId);
            return;
        }

        // 点击的是当前激活但隐藏的 → 重新显示
        if (this._activeId === termId && !termData.visible) {
            this.show(termId);
            return;
        }

        // 点击的是其他终端 → 激活它
        this.activate(termId);
    },

    /**
     * 最小化终端（隐藏界面，不关闭进程）
     */
    minimize(termId) {
        const termData = this._terminals[termId];
        if (!termData) return;

        termData.visible = false;
        termData.minimized = true;
        termData.wrapper.style.display = 'none';
        termData.tab.classList.remove('active');
        termData.tab.classList.add('minimized');

        this._activeId = null;

        // 检查是否有其他可见终端
        const visibleTerms = Object.values(this._terminals).filter(t => t.visible);
        if (visibleTerms.length === 0) {
            document.getElementById('terminalContainer').style.display = 'none';
            document.getElementById('panelsContainer').style.display = 'flex';
        }
    },

    /**
     * 显示被隐藏的终端
     */
    show(termId) {
        const termData = this._terminals[termId];
        if (!termData) return;

        // 先隐藏当前激活的
        if (this._activeId && this._terminals[this._activeId]) {
            const old = this._terminals[this._activeId];
            old.wrapper.style.display = 'none';
            old.tab.classList.remove('active');
            old.visible = false;
        }

        termData.visible = true;
        termData.minimized = false;
        termData.wrapper.style.display = 'flex';
        termData.tab.classList.add('active');
        termData.tab.classList.remove('minimized');

        document.getElementById('terminalContainer').style.display = 'flex';
        document.getElementById('panelsContainer').style.display = 'none';

        termData.term.focus();
        setTimeout(() => termData.fitAddon.fit(), 50);

        this._activeId = termId;
    },

    /**
     * 激活终端（切换到指定终端）
     */
    activate(termId) {
        const termData = this._terminals[termId];
        if (!termData) return;

        // 取消旧激活
        if (this._activeId && this._terminals[this._activeId]) {
            const old = this._terminals[this._activeId];
            old.tab.classList.remove('active');
            if (old.wrapper.style.display !== 'none') {
                old.wrapper.style.display = 'none';
            }
            old.visible = false;
        }

        termData.visible = true;
        termData.minimized = false;
        termData.tab.classList.add('active');
        termData.tab.classList.remove('minimized');
        termData.wrapper.style.display = 'flex';

        document.getElementById('terminalContainer').style.display = 'flex';
        document.getElementById('panelsContainer').style.display = 'none';

        termData.term.focus();
        setTimeout(() => termData.fitAddon.fit(), 50);

        this._activeId = termId;
    },

    write(termId, data) {
        const termData = this._terminals[termId];
        if (termData) {
            termData.term.write(data);
        }
    },

    addTab(termId, title) {
        // 旧方法保留兼容，但不再使用
        this._createTab(termId, title);
    },

    removeTab(termId) {
        const termData = this._terminals[termId];
        if (termData) {
            termData.tab.remove();
            try { termData.term.dispose(); } catch(e) {}
            termData.wrapper.remove();
            delete this._terminals[termId];
        }
    },

    close(termId) {
        const termData = this._terminals[termId];
        if (!termData) return;

        termData.tab.remove();
        try { termData.term.dispose(); } catch(e) {}
        termData.wrapper.remove();

        if (this._typeCounters[termData.type]) {
            this._typeCounters[termData.type]--;
        }

        delete this._terminals[termId];

        WebSocketManager.send({
            action: 'close_terminal',
            terminalId: termId
        });

        if (this._activeId === termId) {
            this._activeId = null;
            const remaining = Object.keys(this._terminals);
            if (remaining.length > 0) {
                // 优先找可见的
                for (const id of remaining) {
                    if (this._terminals[id].visible) {
                        this.activate(id);
                        return;
                    }
                }
                this.activate(remaining[0]);
            } else {
                document.getElementById('terminalContainer').style.display = 'none';
                document.getElementById('panelsContainer').style.display = 'flex';
            }
        }
    },

    switchToFilePanel() {
        document.getElementById('terminalContainer').style.display = 'none';
        document.getElementById('panelsContainer').style.display = 'flex';
        for (const id of Object.keys(this._terminals)) {
            this._terminals[id].tab.classList.remove('active');
        }
        this._activeId = null;
    }
};