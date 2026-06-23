const crypto = require('crypto');
const WebSocket = require('ws');
const { CONFIG, PASSWORD_HASH } = require('./config');
const { logAudit } = require('./logger');
const { checkRateLimit, securityMiddleware } = require('./security');
const state = require('./state');
const { handleAuth } = require('./auth');
const {
    handleListDir, handleCopy, handleMove,
    handleDelete, handleDeleteConfirm,
    handleFind, handleCreate, handleSync, handleBack
} = require('./file-handler');
const {
    handleExecute, handleOpenFile, handleCreateTerminal,
    handleTerminalInput, handleResizeTerminal, handleCloseTerminal,
    handleListMyTerminals
} = require('./terminal-handler');

// ==================== 消息路由 ====================

async function routeMessage(ws, msg) {
    const handlers = {
        'list_dir':         { category: 'browse',    handler: handleListDir },
        'copy':             { category: 'operation', handler: handleCopy },
        'move':             { category: 'operation', handler: handleMove },
        'delete':           { category: 'operation', handler: handleDelete },
        'delete_confirm':   { category: 'operation', handler: handleDeleteConfirm },
        'find':             { category: 'browse',    handler: handleFind },
        'create':           { category: 'operation', handler: handleCreate },
        'sync':             { category: 'browse',    handler: handleSync },
        'back':             { category: 'browse',    handler: handleBack },
        'execute':          { category: 'operation', handler: handleExecute },
        'open_file':        { category: 'operation', handler: handleOpenFile },
        'create_terminal':  { category: 'terminal',  handler: handleCreateTerminal },
        'terminal_input':   { category: 'terminal',  handler: handleTerminalInput },
        'resize_terminal':  { category: 'terminal',  handler: handleResizeTerminal },
        'close_terminal':   { category: 'terminal',  handler: handleCloseTerminal },
        'list_my_terminals':{ category: 'browse',    handler: handleListMyTerminals }
    };

    const route = handlers[msg.action];
    if (!route) {
        ws.send(JSON.stringify({ type: 'error', message: `未知操作: ${msg.action}` }));
        return;
    }
    securityMiddleware(ws, msg, route.category, route.handler);
}

// ==================== WebSocket 连接设置 ====================

function setupWebSocket(wss) {
    wss.on('connection', (ws, req) => {
        ws.clientIP = req.socket.remoteAddress;
        ws.authenticated = false;
        ws.sessionId = crypto.randomUUID();
        ws.sessionToken = null;
        ws._rateLimits = {};
        ws._createdTerminals = {};
        ws._disconnected = false;

        console.log(`🔗 新连接: ${ws.clientIP} (会话: ${ws.sessionId.slice(0, 8)}...)`);

        // 发送认证挑战
        const challenge = crypto.randomBytes(32).toString('hex');
        ws.challenge = challenge;
        ws.send(JSON.stringify({
            type: 'auth_challenge',
            challenge,
            sessionId: ws.sessionId,
            serverVersion: '2.0.0'
        }));

        // 认证超时
        ws.authTimer = setTimeout(() => {
            if (!ws.authenticated) {
                logAudit('AUTH_TIMEOUT', { sessionId: ws.sessionId, ip: ws.clientIP });
                ws.close(4001, '认证超时');
            }
        }, CONFIG.AUTH_TIMEOUT);

        // 消息处理
        ws.on('message', async (data) => {
            try {
                const msg = JSON.parse(data);
                if (msg.action === 'auth_response') {
                    await handleAuth(ws, msg);
                    return;
                }
                await routeMessage(ws, msg);
            } catch (err) {
                console.error('消息处理错误:', err.message);
                ws.send(JSON.stringify({ type: 'error', message: '服务器内部错误' }));
            }
        });

        // 连接关闭 —— 不清理终端！只记录
        ws.on('close', () => {
            console.log(`❌ 连接断开: ${ws.clientIP}`);
            ws._disconnected = true;

            for (const termId of Object.keys(ws._createdTerminals || {})) {
                const owner = state.terminalOwners.get(termId);
                if (owner) {
                    owner.disconnected = true;
                }
            }

            logAudit('SESSION_ENDED', {
                sessionId: ws.sessionId,
                ip: ws.clientIP,
                activeTerminals: Object.keys(ws._createdTerminals || {}).length,
                duration: ws._connectedAt ? (Date.now() - ws._connectedAt) + 'ms' : 'unknown'
            });

            state.activeSessions.delete(ws.sessionId);
        });
    });
}

module.exports = { setupWebSocket };