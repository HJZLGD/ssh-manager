// ==================== 工具函数（完整版）====================
const Utils = {
    capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    formatSize(bytes) {
        if (bytes === null || bytes === undefined) return '';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        let size = bytes;
        while (size >= 1024 && i < units.length - 1) {
            size /= 1024;
            i++;
        }
        return size.toFixed(1) + units[i];
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    showToast(message, type = 'info') {
        // 移除旧的 toast
        const old = document.querySelector('.toast-message');
        if (old) old.remove();
        
        const div = document.createElement('div');
        div.className = 'toast-message';
        div.textContent = message;
        div.style.cssText = `
            position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%);
            background: ${type === 'error' ? '#f48771' : '#4ec9b0'};
            color: #fff; padding: 8px 16px; border-radius: 8px;
            font-size: 13px; z-index: 2000; max-width: 80%;
            text-align: center; word-break: break-all;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            animation: toastIn 0.3s ease;
        `;
        document.body.appendChild(div);
        setTimeout(() => {
            if (div.parentNode) div.remove();
        }, 2500);
    },

    // Mock 数据（无后端时测试用）
    mockFileSystem: {
        '/': [
            { name: 'home', path: '/home', isDir: true, size: null },
            { name: 'etc', path: '/etc', isDir: true, size: null },
            { name: 'var', path: '/var', isDir: true, size: null },
            { name: 'tmp', path: '/tmp', isDir: true, size: null },
            { name: 'root', path: '/root', isDir: true, size: null },
            { name: 'readme.txt', path: '/readme.txt', isDir: false, size: 1024 },
            { name: 'test.sh', path: '/test.sh', isDir: false, size: 256 },
            { name: 'config.ini', path: '/config.ini', isDir: false, size: 128 }
        ],
        '/home': [
            { name: '..', path: '/', isDir: true, size: null },
            { name: 'user', path: '/home/user', isDir: true, size: null },
            { name: 'documents', path: '/home/documents', isDir: true, size: null },
            { name: 'downloads', path: '/home/downloads', isDir: true, size: null },
            { name: 'config.json', path: '/home/config.json', isDir: false, size: 512 },
            { name: 'note.txt', path: '/home/note.txt', isDir: false, size: 64 }
        ],
        '/home/user': [
            { name: '..', path: '/home', isDir: true, size: null },
            { name: 'projects', path: '/home/user/projects', isDir: true, size: null },
            { name: 'index.html', path: '/home/user/index.html', isDir: false, size: 2048 },
            { name: 'style.css', path: '/home/user/style.css', isDir: false, size: 1024 },
            { name: 'app.js', path: '/home/user/app.js', isDir: false, size: 4096 }
        ],
        '/etc': [
            { name: '..', path: '/', isDir: true, size: null },
            { name: 'nginx', path: '/etc/nginx', isDir: true, size: null },
            { name: 'ssh', path: '/etc/ssh', isDir: true, size: null },
            { name: 'hosts', path: '/etc/hosts', isDir: false, size: 256 },
            { name: 'passwd', path: '/etc/passwd', isDir: false, size: 1024 },
            { name: 'resolv.conf', path: '/etc/resolv.conf', isDir: false, size: 64 }
        ],
        '/tmp': [
            { name: '..', path: '/', isDir: true, size: null },
            { name: 'cache', path: '/tmp/cache', isDir: true, size: null },
            { name: 'temp.log', path: '/tmp/temp.log', isDir: false, size: 64 },
            { name: 'session.dat', path: '/tmp/session.dat', isDir: false, size: 128 }
        ]
    }
};