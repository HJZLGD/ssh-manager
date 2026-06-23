const path = require('path');
const { CONFIG, PROTECTED_PATHS, PROTECTED_FILES } = require('./config');
const { logAudit } = require('./logger');

function isProtectedPath(targetPath) {
    const resolved = path.resolve(targetPath);
    for (const p of PROTECTED_PATHS) {
        if (resolved === p || resolved.startsWith(p + path.sep)) return true;
    }
    const basename = path.basename(resolved);
    return PROTECTED_FILES.includes(basename);
}

function checkRateLimit(ws, category) {
    const limits = {
        browse: CONFIG.RATE_LIMIT.BROWSE,
        operation: CONFIG.RATE_LIMIT.OPERATION,
        terminal: CONFIG.RATE_LIMIT.TERMINAL_INPUT,
        auth: CONFIG.RATE_LIMIT.AUTH
    };
    const limit = limits[category] || 60;
    const now = Date.now();
    if (!ws._rateLimits) ws._rateLimits = {};
    if (!ws._rateLimits[category]) ws._rateLimits[category] = [];
    ws._rateLimits[category] = ws._rateLimits[category].filter(t => now - t < 60000);
    if (ws._rateLimits[category].length >= limit) {
        logAudit('RATE_LIMIT_EXCEEDED', { sessionId: ws.sessionId, category });
        return false;
    }
    ws._rateLimits[category].push(now);
    return true;
}

function securityMiddleware(ws, msg, category, handler) {
    if (!ws.authenticated) {
        ws.send(JSON.stringify({ type: 'error', message: '🔒 请先认证' }));
        return;
    }
    if (msg.sessionToken !== ws.sessionToken) {
        logAudit('TOKEN_MISMATCH', { sessionId: ws.sessionId, ip: ws.clientIP });
        ws.close(4001, '会话令牌无效');
        return;
    }
    if (!checkRateLimit(ws, category)) {
        ws.send(JSON.stringify({ type: 'error', message: '⏳ 操作过于频繁，请稍后再试' }));
        return;
    }
    handler(ws, msg);
}

module.exports = { isProtectedPath, checkRateLimit, securityMiddleware };