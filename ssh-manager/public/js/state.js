// ==================== 全局状态 ====================
const State = {
    panels: {
        left: { 
            path: '/', 
            files: [], 
            selected: [], 
            highlight: null, 
            history: [] 
        },
        right: { 
            path: '/', 
            files: [], 
            selected: [], 
            highlight: null, 
            history: [] 
        }
    },
    terminals: {},
    activeTerminal: null,
    lastOperatedPanel: 'left',
    ws: null,
    findPanel: 'left',

    updatePathDisplay() {
        const leftPath = this.panels.left.path;
        const rightPath = this.panels.right.path;
        document.getElementById('pathDisplay').textContent = 
            `L: ${leftPath}  |  R: ${rightPath}`;
    }
};