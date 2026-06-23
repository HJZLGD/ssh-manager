// ==================== 双栏文件面板 ====================
const Panels = {
    render(panel, path, files, highlight) {
        State.panels[panel].path = path;
        State.panels[panel].files = files;
        State.panels[panel].highlight = highlight || null;
        
        const body = document.getElementById(`panel${Utils.capitalize(panel)}Body`);
        const header = document.getElementById(`panel${Utils.capitalize(panel)}Header`);
        
        if (!body || !header) return;
        
        header.textContent = path;
        State.updatePathDisplay();
        
        body.innerHTML = '';
        files.forEach((file, index) => {
            body.appendChild(this._createItem(panel, file, index));
        });
    },

    _createItem(panel, file, index) {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.dataset.index = index;
        div.dataset.panel = panel;
        div.dataset.isDir = file.isDir;
        
        // 选中状态
        if (State.panels[panel].selected.includes(index)) {
            div.classList.add('selected');
        }
        if (State.panels[panel].highlight && file.path === State.panels[panel].highlight) {
            div.classList.add('highlight');
        }
        
        // 图标
        let icon;
        if (file.name === '..') icon = '⬆';
        else if (file.isDir) icon = '📁';
        else icon = '📄';
        
        div.innerHTML = `
            <span class="icon">${icon}</span>
            <span class="name">${Utils.escapeHtml(file.name)}</span>
            ${file.size !== null && file.size !== undefined ? 
                `<span class="size">${Utils.formatSize(file.size)}</span>` : ''}
        `;
        
        this._bindEvents(div, panel, file, index);
        
        return div;
    },

    _bindEvents(div, panel, file, index) {
        let touchStartX = 0;
        let isSwiping = false;
        let longPressTimer = null;

        // 单击：进入目录 或 选中文件
        div.addEventListener('click', () => {
            State.lastOperatedPanel = panel;
            
            if (file.name === '..') {
                History.push(panel, State.panels[panel].path);
                this.navigate(panel, file.path);
            } else if (file.isDir) {
                History.push(panel, State.panels[panel].path);
                this.navigate(panel, file.path);
            } else {
                this.toggleSelect(panel, index);
            }
        });

        // 双击：打开文件
        div.addEventListener('dblclick', () => {
            if (!file.isDir && file.name !== '..') {
                WebSocketManager.send({
                    action: 'open_file',
                    file: file.path
                });
            }
        });

        // 触摸事件
        div.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            isSwiping = false;
            
            longPressTimer = setTimeout(() => {
                if (!State.panels[panel].selected.includes(index)) {
                    this.toggleSelect(panel, index);
                }
                DialogManager.showActionSheet(panel);
            }, 500);
        }, { passive: true });

        div.addEventListener('touchmove', (e) => {
            const deltaX = e.touches[0].clientX - touchStartX;
            if (Math.abs(deltaX) > 30) {
                isSwiping = true;
                clearTimeout(longPressTimer);
            }
        }, { passive: true });

        div.addEventListener('touchend', () => {
            clearTimeout(longPressTimer);
            if (isSwiping) {
                this.toggleSelect(panel, index);
                isSwiping = false;
            }
        }, { passive: true });
    },

    navigate(panel, path) {
        State.lastOperatedPanel = panel;
        
        // 优先 Mock 数据
        if (Utils.mockFileSystem[path]) {
            this.render(panel, path, Utils.mockFileSystem[path], null);
        } else {
            // 尝试生成子目录模拟
            const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
            const dirName = path.substring(path.lastIndexOf('/') + 1);
            
            // 检查是否有父目录的 mock 数据
            const parentFiles = Utils.mockFileSystem[parentPath];
            if (parentFiles) {
                const dirEntry = parentFiles.find(f => f.name === dirName && f.isDir);
                if (dirEntry) {
                    // 生成空的子目录
                    this.render(panel, path, [
                        { name: '..', path: parentPath, isDir: true, size: null },
                        { name: '(空目录)', path: '', isDir: false, size: 0 }
                    ], null);
                    return;
                }
            }
            
            WebSocketManager.send({ action: 'list_dir', panel, path });
        }
    },

    toggleSelect(panel, index) {
        const selected = State.panels[panel].selected;
        const idx = selected.indexOf(index);
        if (idx > -1) {
            selected.splice(idx, 1);
        } else {
            selected.push(index);
        }
        this.render(panel, State.panels[panel].path, State.panels[panel].files, null);
    },

    getSelectedPaths(panel) {
        return State.panels[panel].selected.map(i => 
            State.panels[panel].files[i].path
        ).filter(p => p);
    },

    clearSelection(panel) {
        State.panels[panel].selected = [];
        this.render(panel, State.panels[panel].path, State.panels[panel].files, null);
    }
};

// 补充 Utils.escapeHtml
Utils.escapeHtml = function(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};