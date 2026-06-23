const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { CONFIG } = require('./config');

class AuditLogger {
    constructor() {
        this.logDir = path.join(__dirname, '..', 'logs');
        this.currentDate = null;
        this.logStream = null;
        this._ensureLogDir();
        this._rotateLog();
        setInterval(() => this._rotateLog(), 3600000);
    }

    _ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true, mode: 0o700 });
        }
    }

    _rotateLog() {
        const today = new Date().toISOString().split('T')[0];
        if (today === this.currentDate) return;
        if (this.logStream) this.logStream.end();
        this.currentDate = today;
        const logFile = path.join(this.logDir, `audit-${today}.log`);
        this.logStream = fs.createWriteStream(logFile, { flags: 'a', mode: 0o600 });
        this._cleanOldLogs(CONFIG.LOG_RETENTION_DAYS);
    }

    _cleanOldLogs(days) {
        const cutoff = Date.now() - days * 86400000;
        const files = fs.readdirSync(this.logDir);
        for (const file of files) {
            if (!file.endsWith('.log')) continue;
            const filePath = path.join(this.logDir, file);
            const stat = fs.statSync(filePath);
            if (stat.mtimeMs < cutoff) {
                const gzip = zlib.createGzip();
                const input = fs.createReadStream(filePath);
                const output = fs.createWriteStream(filePath + '.gz');
                input.pipe(gzip).pipe(output);
                output.on('finish', () => fs.unlinkSync(filePath));
            }
        }
    }

    log(event, details = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            event,
            sessionId: details.sessionId || 'unknown',
            ip: details.ip || 'unknown',
            deviceId: details.deviceId || 'unknown',
            ...details
        };
        const logLine = JSON.stringify(entry) + '\n';
        if (this.logStream) this.logStream.write(logLine);

        const important = [
            'AUTH_SUCCESS', 'AUTH_FAILED', 'AUTH_TIMEOUT',
            'DELETE_SUCCESS', 'DELETE_BLOCKED', 'DELETE_CONFIRMED',
            'EXECUTE', 'FILE_OPENED',
            'TOKEN_MISMATCH', 'RATE_LIMIT_EXCEEDED',
            'COPY_BLOCKED', 'MOVE_BLOCKED',
            'TERMINAL_CREATED', 'TERMINAL_CLOSED', 'TERMINAL_CLEANUP',
            'SESSION_ENDED'
        ];
        if (important.includes(event)) {
            const icon = event.includes('FAILED') || event.includes('BLOCKED') || event.includes('EXCEEDED')
                ? '⚠️' : '📋';
            console.log(`${icon} [AUDIT] ${event}:`, details.message || details.file || details.files || '');
        }
    }
}

const auditLogger = new AuditLogger();

function logAudit(event, details = {}) {
    auditLogger.log(event, details);
}

module.exports = { logAudit, AuditLogger };