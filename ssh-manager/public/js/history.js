// ==================== 后退导航历史 ====================
const History = {
    _storage: { left: [], right: [] },
    MAX_LENGTH: 50,

    push(panel, path) {
        const history = this._storage[panel];
        if (history[history.length - 1] !== path) {
            history.push(path);
            if (history.length > this.MAX_LENGTH) {
                history.shift();
            }
        }
    },

    pop(panel) {
        const history = this._storage[panel];
        return history.length > 0 ? history.pop() : null;
    },

    clear() {
        this._storage = { left: [], right: [] };
    },

    get(panel) {
        return [...this._storage[panel]];
    }
};