const express = require('express');
const https = require('https');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const { CONFIG } = require('./server/config');
const { logAudit } = require('./server/logger');
const { setupWebSocket } = require('./server/ws-handler');
const state = require('./server/state');

// ====================================================================
//  Express + HTTPS 服务器
// ====================================================================
const app = express();
app.use(express.static('public'));

let server;
try {
    const key = fs.readFileSync(path.join(__dirname, 'cert/key.pem'), 'utf8');
    const cert = fs.readFileSync(path.join(__dirname, 'cert/cert.pem'), 'utf8');
    server = https.createServer({ key, cert }, app);
    console.log('🔒 HTTPS 已启用');
} catch (e) {
    console.log('⚠️ 未找到证书，使用 HTTP（仅开发环境）');
    server = http.createServer(app);
}

const wss = new WebSocket.Server({
    server,
    verifyClient: (info, cb) => {
        const origin = info.origin || info.req.headers.origin || '';
        const allowed = [
            'https://localhost', 'https://127.0.0.1',
            'capacitor://localhost', ''
        ];
        if (allowed.some(a => origin.startsWith(a)) || process.env.NODE_ENV === 'development') {
            cb(true);
        } else {
            console.log('🚫 拒绝未授权来源:', origin);
            cb(false, 403, 'Forbidden');
        }
    }
});

// ====================================================================
//  空闲终端清理（定时任务）
// ====================================================================
setInterval(() => {
    const now = Date.now();
    for (const [termId, owner] of state.terminalOwners.entries()) {
        if (now - owner.lastActive > CONFIG.IDLE_TERMINAL_TIMEOUT) {
            console.log(`🧹 清理空闲终端: ${termId} (最后活跃: ${new Date(owner.lastActive).toLocaleString()})`);
            const term = state.terminals[termId];
            if (term) {
                try { term.kill('SIGHUP'); } catch(e) {}
                setTimeout(() => {
                    try { term.kill('SIGKILL'); } catch(e) {}
                    delete state.terminals[termId];
                }, 2000);
            }
            state.terminalOwners.delete(termId);
            logAudit('TERMINAL_CLEANUP', { terminalId: termId, reason: '空闲超时' });
        }
    }
}, CONFIG.CLEANUP_INTERVAL);

// ====================================================================
//  初始化 WebSocket
// ====================================================================
setupWebSocket(wss);

// ====================================================================
//  启动服务器
// ====================================================================
const PORT = CONFIG.PORT;
server.listen(PORT, '0.0.0.0', () => {
    const proto = server instanceof https.Server ? 'https' : 'http';
    console.log('');
    console.log('🚀 =============================================');
    console.log(`   ${proto === 'https' ? '🔒' : '⚠️'}  安全远程 SSH 管理面板 v2.0`);
    console.log('===============================================');
    console.log(`   服务地址: ${proto}://0.0.0.0:${PORT}`);
    console.log(`   本地访问: ${proto}://127.0.0.1:${PORT}`);
    console.log(`   日志目录: ${path.join(__dirname, 'logs')}`);
    console.log(`   终端持久化: ✅ (断连不清理)`);
    console.log(`   空闲清理: ${CONFIG.IDLE_TERMINAL_TIMEOUT / 1000 / 60 / 60}小时`);
    console.log('===============================================');
    console.log('');
});

// ====================================================================
//  优雅关闭
// ====================================================================
function gracefulShutdown() {
    console.log('\n🛑 收到关闭信号，等待终端自然退出...');
    setTimeout(() => {
        for (const term of Object.values(state.terminals)) {
            try { term.kill('SIGKILL'); } catch(e) {}
        }
        process.exit(0);
    }, 5000);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);