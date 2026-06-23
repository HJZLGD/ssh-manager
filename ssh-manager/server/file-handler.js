const fs = require('fs');
const path = require('path');
const { isProtectedPath } = require('./security');
const { logAudit } = require('./logger');
const { spawnSafe } = require('./utils');
const state = require('./state');

// ==================== 目录列表 ====================

async function handleListDir(ws, msg) {
    try {
        const panel = msg.panel;
        const targetPath = msg.path || state.panels[panel].path;
        const resolvedPath = path.resolve(targetPath);

        state.panels[panel].path = resolvedPath;
        state.panels[panel].highlight = null;

        try { await fs.promises.access(resolvedPath, fs.constants.R_OK); }
        catch {
            ws.send(JSON.stringify({ type: 'error', message: `无法访问目录: ${resolvedPath}` }));
            return;
        }

        const items = await fs.promises.readdir(resolvedPath, { withFileTypes: true });
        const fileList = [];

        if (resolvedPath !== '/') {
            fileList.push({ name: '..', isDir: true, path: path.dirname(resolvedPath), size: null });
        }

        const dirs = [], files = [];
        for (const item of items) {
            const fullPath = path.join(resolvedPath, item.name);
            try {
                const stat = await fs.promises.stat(fullPath);
                const entry = {
                    name: item.name,
                    isDir: item.isDirectory(),
                    path: fullPath,
                    size: item.isDirectory() ? null : stat.size,
                    mode: stat.mode,
                    mtime: stat.mtime
                };
                if (item.isDirectory()) dirs.push(entry);
                else files.push(entry);
            } catch { continue; }
        }

        const sortName = (a, b) => a.name.localeCompare(b.name, 'zh-CN');
        dirs.sort(sortName);
        files.sort(sortName);

        ws.send(JSON.stringify({
            type: 'dir_list',
            panel,
            path: resolvedPath,
            files: [...dirs, ...files],
            highlight: state.panels[panel].highlight,
            stats: { total: dirs.length + files.length, dirs: dirs.length, files: files.length }
        }));
    } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: `无法读取目录: ${err.message}` }));
    }
}

// ==================== 复制 ====================

async function handleCopy(ws, msg) {
    try {
        const { sourcePanel, files, targetPanel } = msg;
        const targetDir = state.panels[targetPanel].path;

        if (isProtectedPath(targetDir)) {
            logAudit('COPY_BLOCKED', { sessionId: ws.sessionId, targetDir });
            ws.send(JSON.stringify({ type: 'error', message: '❌ 不能复制到受保护的系统目录' }));
            return;
        }

        let copied = 0;
        for (const file of files) {
            const fileName = path.basename(file);
            const targetPath = path.join(targetDir, fileName);
            if (isProtectedPath(file)) {
                ws.send(JSON.stringify({ type: 'error', message: `❌ "${fileName}" 是受保护文件` }));
                continue;
            }
            try {
                await fs.promises.access(targetPath);
                ws.send(JSON.stringify({ type: 'confirm_required', action: 'overwrite', file: targetPath, message: `文件 "${fileName}" 已存在，是否覆盖？` }));
                return;
            } catch { /* 不存在，继续 */ }

            const stat = await fs.promises.stat(file);
            if (stat.isDirectory()) {
                await fs.promises.cp(file, targetPath, { recursive: true });
            } else {
                await fs.promises.copyFile(file, targetPath);
            }
            copied++;
        }

        logAudit('COPY_SUCCESS', { sessionId: ws.sessionId, files, targetDir, count: copied });
        ws.send(JSON.stringify({ type: 'success', message: `✅ 已复制 ${copied} 个项目` }));
        await handleListDir(ws, { panel: sourcePanel });
        await handleListDir(ws, { panel: targetPanel });
    } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: `复制失败: ${err.message}` }));
    }
}

// ==================== 移动 ====================

async function handleMove(ws, msg) {
    try {
        const { sourcePanel, files, targetPanel } = msg;
        const targetDir = state.panels[targetPanel].path;

        for (const file of files) {
            if (isProtectedPath(file)) {
                logAudit('MOVE_BLOCKED', { sessionId: ws.sessionId, file, reason: '源文件受保护' });
                ws.send(JSON.stringify({ type: 'error', message: `❌ "${path.basename(file)}" 是受保护文件` }));
                return;
            }
        }
        if (isProtectedPath(targetDir)) {
            logAudit('MOVE_BLOCKED', { sessionId: ws.sessionId, targetDir, reason: '目标路径受保护' });
            ws.send(JSON.stringify({ type: 'error', message: '❌ 不能移动到受保护的系统目录' }));
            return;
        }

        let moved = 0;
        for (const file of files) {
            const fileName = path.basename(file);
            const targetPath = path.join(targetDir, fileName);
            try {
                await fs.promises.access(targetPath);
                ws.send(JSON.stringify({ type: 'confirm_required', action: 'overwrite_move', file: targetPath, message: `目标 "${fileName}" 已存在，是否覆盖？` }));
                return;
            } catch { /* 不存在 */ }
            await fs.promises.rename(file, targetPath);
            moved++;
        }

        logAudit('MOVE_SUCCESS', { sessionId: ws.sessionId, files, targetDir, count: moved });
        ws.send(JSON.stringify({ type: 'success', message: `✅ 已移动 ${moved} 个项目` }));
        await handleListDir(ws, { panel: sourcePanel });
        await handleListDir(ws, { panel: targetPanel });
    } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: `移动失败: ${err.message}` }));
    }
}

// ==================== 删除 ====================

async function handleDelete(ws, msg) {
    try {
        const { files } = msg;

        for (const file of files) {
            if (isProtectedPath(file)) {
                logAudit('DELETE_BLOCKED', { sessionId: ws.sessionId, file, reason: '受保护路径' });
                ws.send(JSON.stringify({ type: 'error', message: `❌ 安全拒绝: "${file}" 是系统受保护路径` }));
                return;
            }
        }

        if (files.length >= 3) {
            ws.send(JSON.stringify({ type: 'confirm_required', action: 'delete_batch', files, message: `确定要删除 ${files.length} 个项目吗？此操作不可撤销！` }));
            return;
        }

        for (const file of files) {
            try {
                const stat = await fs.promises.stat(file);
                if (stat.isDirectory()) {
                    const items = await fs.promises.readdir(file);
                    if (items.length > 10) {
                        ws.send(JSON.stringify({ type: 'confirm_required', action: 'delete_large_dir', file, count: items.length, message: `目录 "${path.basename(file)}" 包含 ${items.length} 个项目，确定删除？` }));
                        return;
                    }
                }
            } catch { /* 文件可能已不存在 */ }
        }

        await doDelete(ws, files);
    } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: `删除失败: ${err.message}` }));
    }
}

async function handleDeleteConfirm(ws, msg) {
    try {
        const { files, confirmed } = msg;
        if (!confirmed) {
            ws.send(JSON.stringify({ type: 'info', message: '操作已取消' }));
            return;
        }
        logAudit('DELETE_CONFIRMED', { sessionId: ws.sessionId, files });
        await doDelete(ws, files);
    } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: `删除失败: ${err.message}` }));
    }
}

async function doDelete(ws, files) {
    let deleted = 0;
    for (const file of files) {
        try {
            const stat = await fs.promises.stat(file);
            if (stat.isDirectory()) {
                await fs.promises.rm(file, { recursive: true, force: true });
            } else {
                await fs.promises.unlink(file);
            }
            deleted++;
        } catch (err) {
            console.error(`删除失败 ${file}:`, err.message);
        }
    }
    logAudit('DELETE_SUCCESS', { sessionId: ws.sessionId, files, count: deleted });
    ws.send(JSON.stringify({ type: 'success', message: `✅ 已删除 ${deleted} 个项目` }));
    for (const panel of ['left', 'right']) {
        await handleListDir(ws, { panel });
    }
}

// ==================== 搜索 ====================

async function handleFind(ws, msg) {
    try {
        const { keyword, panel } = msg;
        const searchDir = state.panels[panel].path;

        if (isProtectedPath(searchDir)) {
            ws.send(JSON.stringify({ type: 'error', message: '❌ 不允许在系统目录中搜索' }));
            return;
        }
        if (!keyword || keyword.length < 2) {
            ws.send(JSON.stringify({ type: 'find_result', keyword, searchDir, panel, files: [] }));
            return;
        }
        if (/[;&|`$(){}]/.test(keyword)) {
            ws.send(JSON.stringify({ type: 'error', message: '❌ 搜索关键词包含非法字符' }));
            return;
        }

        ws.send(JSON.stringify({ type: 'find_progress', message: `🔍 正在 ${searchDir} 中查找 "${keyword}"...` }));

        const result = await spawnSafe('find', [
            searchDir, '-iname', `*${keyword}*`,
            '-not', '-path', '*/.*',
            '2>/dev/null', '|', 'head', '-100'
        ]);

        const output = result.stdout.trim();
        const allFiles = output ? output.split('\n').filter(f => f.trim()) : [];
        const safeFiles = allFiles.filter(f => !isProtectedPath(f)).slice(0, 100);

        ws.send(JSON.stringify({
            type: 'find_result',
            keyword, searchDir, panel,
            files: safeFiles.map(f => ({ path: f, name: path.basename(f), dir: path.dirname(f) })),
            total: safeFiles.length,
            truncated: allFiles.length > 100
        }));

        logAudit('FIND_EXECUTED', { sessionId: ws.sessionId, keyword, searchDir, results: safeFiles.length });
    } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: `查找失败: ${err.message}` }));
    }
}

// ==================== 创建 ====================

async function handleCreate(ws, msg) {
    try {
        const { panel, name, type } = msg;
        const targetPath = path.join(state.panels[panel].path, name);

        if (isProtectedPath(targetPath)) {
            ws.send(JSON.stringify({ type: 'error', message: '❌ 不能在系统受保护目录中创建文件' }));
            return;
        }
        if (/[<>:"/\\|?*]/.test(name) || name.includes('..')) {
            ws.send(JSON.stringify({ type: 'error', message: '❌ 名称包含非法字符' }));
            return;
        }

        if (type === 'file') {
            await fs.promises.writeFile(targetPath, '', { mode: 0o644 });
            logAudit('FILE_CREATED', { sessionId: ws.sessionId, file: targetPath });
        } else {
            await fs.promises.mkdir(targetPath, { recursive: true, mode: 0o755 });
            logAudit('DIR_CREATED', { sessionId: ws.sessionId, dir: targetPath });
        }

        ws.send(JSON.stringify({ type: 'success', message: `✅ 已创建 ${type === 'file' ? '文件' : '文件夹'}: ${name}` }));
        await handleListDir(ws, { panel });
    } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: `创建失败: ${err.message}` }));
    }
}

// ==================== 同步 / 后退 ====================

async function handleSync(ws, msg) {
    const { fromPanel } = msg;
    const toPanel = fromPanel === 'left' ? 'right' : 'left';
    state.panels[toPanel].path = state.panels[fromPanel].path;
    state.panels[toPanel].history = [...state.panels[fromPanel].history];
    await handleListDir(ws, { panel: toPanel, path: state.panels[toPanel].path });
}

async function handleBack(ws, msg) {
    const panel = msg.panel;
    if (state.panels[panel].history.length > 0) {
        const prevPath = state.panels[panel].history.pop();
        state.panels[panel].path = prevPath;
        await handleListDir(ws, { panel, path: prevPath });
    } else {
        ws.send(JSON.stringify({ type: 'info', message: '没有更多历史记录' }));
    }
}

// ==================== 发送面板状态 ====================

function sendPanelState(ws) {
    for (const panel of ['left', 'right']) {
        handleListDir(ws, { panel, path: state.panels[panel].path });
    }
}

module.exports = {
    handleListDir, handleCopy, handleMove,
    handleDelete, handleDeleteConfirm, doDelete,
    handleFind, handleCreate, handleSync, handleBack,
    sendPanelState
};