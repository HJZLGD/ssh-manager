const fs = require('fs');
const path = require('path');
const { CONFIG } = require('./config');
const { isProtectedPath } = require('./security');
const { logAudit } = require('./logger');
const state = require('./state');

// ==================== 执行文件 ====================

async function handleExecute(ws, msg) {
    const { file } = msg;

    if (isProtectedPath(file)) {
        logAudit('EXECUTE_BLOCKED', { sessionId: ws.sessionId, file, reason: '受保护路径' });
        ws.send(JSON.stringify({ type: 'error', message: '❌ 不允许执行系统目录中的文件' }));
        return;
    }

    try {
        const stat = await fs.promises.stat(file);
        if (!stat.isFile()) {
            ws.send(JSON.stringify({ type: 'error', message: '❌ 不是一个可执行文件' }));
            return;
        }
        if (!(stat.mode & fs.constants.S_IXUSR)) {
            ws.send(JSON.stringify({ type: 'confirm_required', action: 'chmod_execute', file, message: `文件 "${path.basename(file)}" 没有执行权限，是否添加权限并执行？` }));
            return;
        }
    } catch {
        ws.send(JSON.stringify({ type: 'error', message: '❌ 文件不存在' }));
        return;
    }

    logAudit('EXECUTE', { sessionId: ws.sessionId, file, ip: ws.clientIP });

    const dir = path.dirname(file);
    const fileName = path.basename(file);
    const terminalId = `term_${++state.terminalIdCounter}`;

    try {
        const pty = require('node-pty');
        const term = pty.spawn('bash', [], {
            name: 'xterm-color', cols: 80, rows: 24, cwd: dir, env: process.env
        });

        state.terminals[terminalId] = term;
        ws._createdTerminals[terminalId] = true;

        const owner = {
            sessionId: ws.sessionId,
            ip: ws.clientIP,
            createdAt: new Date(),
            cwd: dir,
            title: `执行: ${fileName}`,
            lastActive: Date.now(),
            _lastSentTime: Date.now(),
            disconnected: false
        };
        state.terminalOwners.set(terminalId, owner);

        const outputBuffer = [];
        term._outputBuffer = outputBuffer;

        term.on('data', (data) => {
            outputBuffer.push({ time: Date.now(), data });
            if (outputBuffer.length > CONFIG.MAX_TERMINAL_OUTPUT_LINES) outputBuffer.shift();
            owner.lastActive = Date.now();

            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: 'terminal_output', terminalId, data }));
                owner._lastSentTime = Date.now();
            }
        });

        term.on('exit', (code) => {
            logAudit('EXECUTE_COMPLETED', { sessionId: ws.sessionId, file, exitCode: code });
            const exitMsg = `\r\n\x1b[33m[进程已退出，退出码: ${code}]\x1b[0m\r\n`;
            outputBuffer.push({ time: Date.now(), data: exitMsg });
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: 'terminal_output', terminalId, data: exitMsg }));
            }
        });

        term.write(`cd "${dir}"\n`);
        term.write(`"./${fileName}"\n`);

        ws.send(JSON.stringify({ type: 'terminal_created', terminalId, title: `执行: ${fileName}`, cwd: dir, source: 'execute' }));
    } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: `创建终端失败: ${err.message}` }));
    }
}

// ==================== 打开文件 ====================

async function handleOpenFile(ws, msg) {
    const { file } = msg;

    if (isProtectedPath(file)) {
        ws.send(JSON.stringify({ type: 'error', message: '❌ 不允许编辑系统关键文件' }));
        return;
    }

    try {
        const stat = await fs.promises.stat(file);
        if (stat.size > 10 * 1024 * 1024) {
            ws.send(JSON.stringify({ type: 'confirm_required', action: 'open_large_file', file, size: stat.size, message: `文件大小 ${(stat.size / 1024 / 1024).toFixed(1)}MB，确定要打开吗？` }));
            return;
        }
    } catch {
        ws.send(JSON.stringify({ type: 'error', message: '文件不存在' }));
        return;
    }

    logAudit('FILE_OPENED', { sessionId: ws.sessionId, file });

    const dir = path.dirname(file);
    const fileName = path.basename(file);
    const terminalId = `term_${++state.terminalIdCounter}`;

    try {
        const pty = require('node-pty');
        const term = pty.spawn('bash', [], {
            name: 'xterm-color', cols: 80, rows: 24, cwd: dir, env: process.env
        });

        state.terminals[terminalId] = term;
        ws._createdTerminals[terminalId] = true;

        const owner = {
            sessionId: ws.sessionId,
            ip: ws.clientIP,
            createdAt: new Date(),
            cwd: dir,
            title: `编辑: ${fileName}`,
            lastActive: Date.now(),
            _lastSentTime: Date.now(),
            disconnected: false
        };
        state.terminalOwners.set(terminalId, owner);

        const outputBuffer = [];
        term._outputBuffer = outputBuffer;

        term.on('data', (data) => {
            outputBuffer.push({ time: Date.now(), data });
            if (outputBuffer.length > CONFIG.MAX_TERMINAL_OUTPUT_LINES) outputBuffer.shift();
            owner.lastActive = Date.now();
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: 'terminal_output', terminalId, data }));
                owner._lastSentTime = Date.now();
            }
        });

        term.on('exit', () => {
            const msg = '\r\n\x1b[33m[文件编辑已结束]\x1b[0m\r\n';
            outputBuffer.push({ time: Date.now(), data: msg });
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: 'terminal_output', terminalId, data: msg }));
            }
        });

        term.write(`cd "${dir}"\n`);
        term.write(`if command -v vim &>/dev/null; then vim "${fileName}"; elif command -v nano &>/dev/null; then nano "${fileName}"; else cat "${fileName}"; fi\n`);

        ws.send(JSON.stringify({ type: 'terminal_created', terminalId, title: `编辑: ${fileName}`, cwd: dir, source: 'open_file' }));
    } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: `打开文件失败: ${err.message}` }));
    }
}

// ==================== 创建终端 ====================

async function handleCreateTerminal(ws, msg) {
    const terminalId = `term_${++state.terminalIdCounter}`;
    const cwd = msg.cwd || process.env.HOME;

    try {
        const pty = require('node-pty');
        const term = pty.spawn('bash', [], {
            name: 'xterm-color',
            cols: msg.cols || 80,
            rows: msg.rows || 24,
            cwd,
            env: process.env
        });

        state.terminals[terminalId] = term;
        ws._createdTerminals[terminalId] = true;

        const owner = {
            sessionId: ws.sessionId,
            ip: ws.clientIP,
            createdAt: new Date(),
            cwd,
            title: msg.title || `终端 ${state.terminalIdCounter}`,
            lastActive: Date.now(),
            _lastSentTime: Date.now(),
            disconnected: false
        };
        state.terminalOwners.set(terminalId, owner);

        const outputBuffer = [];
        term._outputBuffer = outputBuffer;

        term.on('data', (data) => {
            outputBuffer.push({ time: Date.now(), data });
            if (outputBuffer.length > CONFIG.MAX_TERMINAL_OUTPUT_LINES) outputBuffer.shift();
            owner.lastActive = Date.now();
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: 'terminal_output', terminalId, data }));
                owner._lastSentTime = Date.now();
            }
        });

        logAudit('TERMINAL_CREATED', { sessionId: ws.sessionId, terminalId, cwd, title: msg.title });

        ws.send(JSON.stringify({ type: 'terminal_created', terminalId, title: msg.title || `终端 ${state.terminalIdCounter}`, cwd, source: 'create' }));
    } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: `创建终端失败: ${err.message}` }));
    }
}

// ==================== 终端输入 / 调整大小 / 关闭 ====================

function handleTerminalInput(ws, msg) {
    const term = state.terminals[msg.terminalId];
    if (term) {
        term.write(msg.data);
        const owner = state.terminalOwners.get(msg.terminalId);
        if (owner) owner.lastActive = Date.now();
    }
}

function handleResizeTerminal(ws, msg) {
    const term = state.terminals[msg.terminalId];
    if (term) term.resize(msg.cols, msg.rows);
}

function handleCloseTerminal(ws, msg) {
    const termId = msg.terminalId;
    const owner = state.terminalOwners.get(termId);

    if (owner && owner.sessionId !== ws.sessionId) {
        ws.send(JSON.stringify({ type: 'error', message: '❌ 无权关闭其他会话的终端' }));
        return;
    }

    const term = state.terminals[termId];
    if (term) {
        term.write('exit\n');
        setTimeout(() => {
            try { term.kill('SIGHUP'); } catch(e) {}
            setTimeout(() => {
                try { term.kill('SIGKILL'); } catch(e) {}
                cleanupTerminal(termId);
            }, 2000);
        }, 1000);
    } else {
        cleanupTerminal(termId);
    }
}

function cleanupTerminal(termId) {
    const term = state.terminals[termId];
    if (term) {
        try { term.kill(); } catch(e) {}
        delete state.terminals[termId];
    }
    state.terminalOwners.delete(termId);

    for (const [sid, session] of state.activeSessions) {
        if (session.ws._createdTerminals) {
            delete session.ws._createdTerminals[termId];
        }
    }

    logAudit('TERMINAL_CLOSED', { terminalId: termId, reason: 'user_requested' });
}

function handleListMyTerminals(ws) {
    const myTerminals = [];
    for (const [termId, owner] of state.terminalOwners.entries()) {
        if (owner.sessionId === ws.sessionId) {
            myTerminals.push({
                terminalId: termId,
                title: owner.title,
                cwd: owner.cwd,
                createdAt: owner.createdAt,
                lastActive: owner.lastActive,
                isAlive: !!state.terminals[termId],
                disconnected: owner.disconnected
            });
        }
    }
    ws.send(JSON.stringify({ type: 'terminal_list', terminals: myTerminals }));
}

module.exports = {
    handleExecute, handleOpenFile, handleCreateTerminal,
    handleTerminalInput, handleResizeTerminal, handleCloseTerminal,
    cleanupTerminal, handleListMyTerminals
};