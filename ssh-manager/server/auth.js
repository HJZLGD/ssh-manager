const crypto = require('crypto');
const { CONFIG, PASSWORD_HASH } = require('./config');
const { logAudit } = require('./logger');
const { checkRateLimit } = require('./security');
const state = require('./state');
const { sendPanelState } = require('./file-handler');

async function handleAuth(ws, msg) {
    const { challenge, response, deviceId } = msg;

    // 校验挑战值
    if (challenge !== ws.challenge) {
        logAudit('AUTH_FAILED', { sessionId: ws.sessionId, ip: ws.clientIP, deviceId, reason: '挑战值不匹配' });
        ws.close(4001, '认证失败');
        return;
    }

    // 速率限制
    if (!checkRateLimit(ws, 'auth')) {
        logAudit('AUTH_FAILED', { sessionId: ws.sessionId, ip: ws.clientIP, deviceId, reason: '尝试过于频繁' });
        ws.send(JSON.stringify({ type: 'error', message: '⏳ 登录尝试过于频繁，请 1 分钟后再试' }));
        return;
    }

    // 验证 HMAC 响应
    const expected = crypto.createHmac('sha256', PASSWORD_HASH).update(challenge).digest('hex');
    if (response !== expected) {
        logAudit('AUTH_FAILED', { sessionId: ws.sessionId, ip: ws.clientIP, deviceId, reason: '密码错误' });
        ws.send(JSON.stringify({ type: 'error', message: '❌ 密码错误' }));
        return;
    }

    // ✅ 认证通过
    ws.authenticated = true;
    ws._connectedAt = Date.now();
    ws._disconnected = false;
    clearTimeout(ws.authTimer);
    ws.sessionToken = crypto.randomBytes(32).toString('hex');

    state.activeSessions.set(ws.sessionId, {
        ws,
        ip: ws.clientIP,
        deviceId,
        authenticatedAt: new Date()
    });

    logAudit('AUTH_SUCCESS', { sessionId: ws.sessionId, ip: ws.clientIP, deviceId: deviceId || 'unknown' });

    // 查找该会话之前创建且仍然存活的终端（重连恢复）
    const reconnectedTerminals = [];
    for (const [termId, owner] of state.terminalOwners.entries()) {
        if (owner.sessionId === ws.sessionId && state.terminals[termId]) {
            ws._createdTerminals[termId] = true;
            owner.disconnected = false;

            let pendingOutput = '';
            const term = state.terminals[termId];
            if (term._outputBuffer) {
                pendingOutput = term._outputBuffer
                    .filter(e => e.time > (owner._lastSentTime || owner.lastActive))
                    .map(e => e.data)
                    .join('');
            }
            owner._lastSentTime = Date.now();

            reconnectedTerminals.push({
                terminalId: termId,
                title: owner.title,
                cwd: owner.cwd,
                createdAt: owner.createdAt,
                pendingOutput
            });

            logAudit('TERMINAL_RECONNECTED', { sessionId: ws.sessionId, terminalId: termId });
        }
    }

    ws.send(JSON.stringify({
        type: 'auth_ok',
        sessionToken: ws.sessionToken,
        message: '✅ 认证成功',
        reconnectedTerminals
    }));

    // 发送面板初始状态
    sendPanelState(ws);
}

module.exports = { handleAuth };