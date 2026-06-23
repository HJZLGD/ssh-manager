// ==================== WebSocket 连接管理（安全版）====================
const WebSocketManager = {
    reconnectTimer: null,
    _token: null,
    _host: null,
    _authenticated: false,
    _sessionToken: null,
    _deviceId: null,

    // 获取/生成设备指纹
    _getDeviceId() {
        let deviceId = localStorage.getItem('device_id');
        if (!deviceId) {
            const fingerprint = [
                navigator.userAgent,
                navigator.language,
                screen.width,
                screen.height,
                navigator.hardwareConcurrency
            ].join('|');

            const hash = Array.from(new Uint8Array(
                new TextEncoder().encode(fingerprint)
            )).map(b => b.toString(16).padStart(2, '0')).join('');

            deviceId = `dev_${hash.slice(0, 16)}_${Date.now().toString(36)}`;
            localStorage.setItem('device_id', deviceId);
        }
        return deviceId;
    },

    async connect(host, token) {
        if (State.ws) State.ws.close();

        this._host = host;
        this._token = token || '';
        this._authenticated = false;
        this._sessionToken = null;
        this._deviceId = this._getDeviceId();

        // 自动选择加密协议
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = host || `${protocol}//${window.location.hostname}:443`;

        console.log('正在连接:', url.replace(/\/\/.*@/, '//***@'));
        State.ws = new WebSocket(url);

        State.ws.onopen = () => {
            console.log('✅ WebSocket 已连接');
            Utils.showToast('正在认证...');
        };

        State.ws.onclose = (e) => {
            console.log('❌ 连接断开:', e.code, e.reason);
            this._authenticated = false;
            this._sessionToken = null;
            document.getElementById('menuBtn').textContent = '☰';
            document.getElementById('menuBtn').style.color = '#d4d4d4';

            if (e.code !== 4001) { // 认证失败不重连
                this.scheduleReconnect();
            }
        };

        State.ws.onerror = (err) => {
            console.log('⚠️ 连接错误');
        };

        State.ws.onmessage = async (event) => {
            try {
                const msg = JSON.parse(event.data);

                switch (msg.type) {
                    case 'auth_challenge':
                        await this._handleChallenge(msg);
                        break;

                    case 'auth_ok':
                        this._authenticated = true;
                        this._sessionToken = msg.sessionToken;
                        this._onAuthenticated();
                        break;

                    case 'error':
                        Utils.showToast(msg.message, 'error');
                        break;

                    default:
                        // 需要认证的消息必须通过 MessageHandler
                        if (!this._authenticated) {
                            console.warn('⏳ 等待认证中，忽略消息:', msg.type);
                            return;
                        }
                        MessageHandler.handle(msg);
                }
            } catch (e) {
                console.error('消息解析失败:', e);
            }
        };
    },

    // 处理挑战-响应认证
    async _handleChallenge(msg) {
        const { challenge, sessionId } = msg;
        const password = this._token || localStorage.getItem('ssh_password') || '';

        try {
            // 使用 Web Crypto API 计算 HMAC-SHA256
            const encoder = new TextEncoder();
            const key = await crypto.subtle.importKey(
                'raw',
                encoder.encode(password),
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign']
            );
            const signature = await crypto.subtle.sign(
                'HMAC',
                key,
                encoder.encode(challenge)
            );
            const response = Array.from(new Uint8Array(signature))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

            this.send({
                action: 'auth_response',
                challenge,
                response,
                deviceId: this._deviceId,
                clientVersion: '2.0.0'
            });

            Utils.showToast('🔑 正在验证身份...');
        } catch (e) {
            console.error('认证计算失败:', e);
            Utils.showToast('⚠️ 认证失败', 'error');
        }
    },

    _onAuthenticated() {
        console.log('🔑 认证通过');
        document.getElementById('menuBtn').textContent = '●';
        document.getElementById('menuBtn').style.color = '#4ec9b0';
        Utils.showToast('✅ 连接成功');
    },

    scheduleReconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            Utils.showToast('🔄 正在重连...');
            this.connect(this._host, this._token);
        }, 3000);
    },

    send(msg) {
        // 所有消息携带会话令牌
        if (this._sessionToken) {
            msg.sessionToken = this._sessionToken;
        }

        if (State.ws && State.ws.readyState === WebSocket.OPEN) {
            State.ws.send(JSON.stringify(msg));
        } else {
            console.log('⚠️ WebSocket 未连接，消息未发送:', msg.action);
        }
    },

    disconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this._authenticated = false;
        this._sessionToken = null;
        if (State.ws) {
            State.ws.close(1000, '用户主动断开');
            State.ws = null;
        }
    }
};