const crypto = require('crypto');

const CONFIG = {
    PORT: process.env.PORT || 443,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'your-password-here',
    RATE_LIMIT: {
        BROWSE: 60,
        OPERATION: 20,
        TERMINAL_INPUT: 100,
        AUTH: 5
    },
    AUTH_TIMEOUT: 15000,
    LOG_RETENTION_DAYS: 30,
    IDLE_TERMINAL_TIMEOUT: 24 * 60 * 60 * 1000,
    CLEANUP_INTERVAL: 60 * 60 * 1000,
    MAX_HISTORY: 50,
    MAX_TERMINAL_OUTPUT_LINES: 5000
};

const PROTECTED_PATHS = [
    '/etc', '/bin', '/sbin', '/boot', '/dev', '/proc', '/sys',
    '/usr', '/lib', '/lib64', '/var/log', '/var/cache',
    '/root/.ssh', '/etc/shadow', '/etc/passwd', '/etc/sudoers',
    '/etc/gshadow', '/etc/security'
];

const PROTECTED_FILES = [
    'shadow', 'passwd', 'sudoers', 'gshadow',
    'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519',
    '.bash_history', '.ssh', '.config', '.gitconfig',
    'authorized_keys', 'known_hosts'
];

const PASSWORD_HASH = crypto
    .createHash('sha256')
    .update(CONFIG.ADMIN_PASSWORD)
    .digest('hex');

module.exports = { CONFIG, PROTECTED_PATHS, PROTECTED_FILES, PASSWORD_HASH };