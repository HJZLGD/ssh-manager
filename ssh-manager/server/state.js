const state = {
    terminals: {},
    terminalOwners: new Map(),
    terminalIdCounter: 0,
    panels: {
        left: { path: process.env.HOME || '/', history: [], highlight: null },
        right: { path: process.env.HOME || '/', history: [], highlight: null }
    },
    activeSessions: new Map()
};

module.exports = state;