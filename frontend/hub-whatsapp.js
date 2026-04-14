// ============================================================
// hub-whatsapp.js  — WhatsApp Connection Manager
// Supports: Evolution API (QR Code) + Meta Cloud API
// ============================================================

(function() {
    'use strict';

    const EVOLUTION_URL  = 'https://evolution.7pro.tech';
    const EVOLUTION_KEY  = 'lagoinhazxcvbnm1234';
    const POLL_INTERVAL  = 3000; // ms between QR polls

    let _qrPollTimer = null;
    let _currentInstanceName = null;
    let _currentWorkspaceId = null;

    // ── Initialise on settings tab open ─────────────────────
    window.initWhatsappSettings = async function() {
        _currentWorkspaceId = window.currentWorkspaceId || window._currentWorkspace?.id;
        if (!_currentWorkspaceId) return;

        // Load saved config from workspaces.credentials
        const { data } = await window.supabaseClient
            .from('workspaces')
            .select('credentials')
            .eq('id', _currentWorkspaceId)
            .single();

        const creds = data?.credentials || {};
        const mode  = creds.whatsapp_mode || 'evolution';

        // Set active tab
        _switchWaTab(mode);

        // ── Evolution tab: restore state ──
        if (creds.evolution_instance) {
            _currentInstanceName = creds.evolution_instance;
            document.getElementById('wa-evo-instance-input').value = creds.evolution_instance;
            // Check live status
            _checkEvoStatus(creds.evolution_instance);
        }

        // ── Meta tab: pre-fill ──
        if (creds.phone_id)         document.getElementById('cloud-phone-id').value    = creds.phone_id;
        if (creds.business_id)      document.getElementById('cloud-business-id').value = creds.business_id;
        if (creds.whatsapp_token)   document.getElementById('cloud-token').value        = creds.whatsapp_token;
        if (creds.app_secret)       document.getElementById('cloud-app-secret').value   = creds.app_secret;
        if (creds.phone_id)         _showMetaConnected(creds.phone_display || creds.phone_id);
    };

    // ── Tab switcher ─────────────────────────────────────────
    window.switchWaTab = _switchWaTab;
    function _switchWaTab(tab) {
        ['evolution','meta'].forEach(t => {
            const btn  = document.getElementById('wa-tab-' + t);
            const pane = document.getElementById('wa-pane-' + t);
            const isActive = t === tab;
            if (btn) {
                btn.setAttribute('data-active', isActive ? '1' : '0');
                btn.style.border     = isActive ? '1px solid rgba(37,211,102,0.4)' : '1px solid rgba(255,255,255,0.1)';
                btn.style.background = isActive ? 'rgba(37,211,102,0.1)' : 'transparent';
                btn.style.color      = isActive ? '#25D366' : 'rgba(255,255,255,0.4)';
                btn.style.fontWeight = isActive ? '700' : '600';
            }
            if (pane) pane.style.display = isActive ? 'block' : 'none';
        });
    }

    // ════════════════════════════════════════════════════════
    // EVOLUTION API — QR Code flow
    // ════════════════════════════════════════════════════════

    // Create or reconnect instance
    window.startEvoConnection = async function() {
        const nameInput = document.getElementById('wa-evo-instance-input');
        const instanceName = (nameInput?.value.trim() || '').replace(/\s+/g, '_').toLowerCase()
                             || 'lagoinha_' + _currentWorkspaceId?.slice(0,8);
        nameInput.value = instanceName;

        _setEvoStatus('connecting');
        _clearQRCode();

        try {
            // 1. Create instance (idempotent — OK if already exists)
            const createRes = await _evoFetch('POST', `/instance/create`, {
                instanceName,
                qrcode: true,
                integration: 'WHATSAPP-BAILEYS'
            });

            if (!createRes.ok && createRes.status !== 409) {
                const err = await createRes.json().catch(() => ({}));
                throw new Error(err.message || 'Erro ao criar instância');
            }

            _currentInstanceName = instanceName;
            _setEvoStatus('waiting_qr');

            // 2. Fetch QR code
            await _fetchAndShowQR(instanceName);

            // 3. Start polling
            _startQRPolling(instanceName);

            // 4. Save instance name to DB
            await _saveEvoConfig(instanceName, 'disconnected');

        } catch(e) {
            _setEvoStatus('error', e.message);
        }
    };

    // Disconnect instance
    window.disconnectEvo = async function() {
        if (!_currentInstanceName) return;
        _stopQRPolling();
        try {
            await _evoFetch('DELETE', `/instance/logout/${_currentInstanceName}`);
        } catch(e) { /* ignore */ }
        _setEvoStatus('disconnected');
        _clearQRCode();
        await _saveEvoConfig(_currentInstanceName, 'disconnected');
    };

    // Fetch & render QR
    async function _fetchAndShowQR(instanceName) {
        try {
            const res  = await _evoFetch('GET', `/instance/connect/${instanceName}`);
            const data = await res.json();

            if (data.base64) {
                _renderQRImage(data.base64);
                return true;
            }
            if (data.instance?.state === 'open') {
                // Already connected
                _onEvoConnected(instanceName);
                return true;
            }
        } catch(e) {
            console.warn('[WA QR] fetch error:', e);
        }
        return false;
    }

    function _startQRPolling(instanceName) {
        _stopQRPolling();
        _qrPollTimer = setInterval(async () => {
            try {
                const res  = await _evoFetch('GET', `/instance/connectionState/${instanceName}`);
                const data = await res.json();
                const state = data.instance?.state || data.state;
                if (state === 'open') {
                    _stopQRPolling();
                    _onEvoConnected(instanceName);
                } else if (state === 'close' || state === 'connecting') {
                    // Refresh QR
                    await _fetchAndShowQR(instanceName);
                }
            } catch(e) { /* network hiccup, keep polling */ }
        }, POLL_INTERVAL);
    }

    function _stopQRPolling() {
        if (_qrPollTimer) { clearInterval(_qrPollTimer); _qrPollTimer = null; }
    }

    async function _checkEvoStatus(instanceName) {
        try {
            const res  = await _evoFetch('GET', `/instance/connectionState/${instanceName}`);
            const data = await res.json();
            const state = data.instance?.state || data.state;
            if (state === 'open') {
                _onEvoConnected(instanceName);
            } else {
                _setEvoStatus('disconnected');
            }
        } catch(e) {
            _setEvoStatus('disconnected');
        }
    }

    function _onEvoConnected(instanceName) {
        _stopQRPolling();
        _clearQRCode();
        _setEvoStatus('connected', instanceName);
        _saveEvoConfig(instanceName, 'connected');
        window.showToast && window.showToast('✅ WhatsApp conectado via QR Code!', 'success');
    }

    // ── Rendering helpers ────────────────────────────────────

    function _renderQRImage(base64) {
        const wrap = document.getElementById('wa-qr-wrap');
        if (!wrap) return;
        // base64 may include data URI prefix or not
        const src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
        wrap.innerHTML = `
            <div style="text-align:center;">
                <img src="${src}" alt="QR Code WhatsApp" id="wa-qr-img"
                     style="width:220px;height:220px;border-radius:16px;border:4px solid rgba(37,211,102,0.3);box-shadow:0 0 30px rgba(37,211,102,0.15);">
                <p style="font-size:0.78rem;color:rgba(255,255,255,0.4);margin-top:12px;">
                    📱 Abra o WhatsApp → Dispositivos vinculados → Vincular dispositivo
                </p>
            </div>`;
    }

    function _clearQRCode() {
        const wrap = document.getElementById('wa-qr-wrap');
        if (wrap) wrap.innerHTML = '';
    }

    function _setEvoStatus(status, detail) {
        const indicator = document.getElementById('wa-evo-status-indicator');
        const text      = document.getElementById('wa-evo-status-text');
        const connectBtn= document.getElementById('wa-evo-connect-btn');
        const disconnBtn= document.getElementById('wa-evo-disconnect-btn');
        const qrSection = document.getElementById('wa-qr-section');
        const connCard  = document.getElementById('wa-evo-connected-card');

        const states = {
            disconnected:  { dot: '#888',    label: 'Desconectado',        btn: true,  disconn: false, qr: false, card: false },
            connecting:    { dot: '#FFD700', label: 'Conectando...',        btn: false, disconn: false, qr: false, card: false },
            waiting_qr:    { dot: '#FFD700', label: 'Aguardando QR...',     btn: false, disconn: true,  qr: true,  card: false },
            connected:     { dot: '#25D366', label: 'Conectado ✅',          btn: false, disconn: true,  qr: false, card: true  },
            error:         { dot: '#FF3B30', label: `Erro: ${detail||''}`,  btn: true,  disconn: false, qr: false, card: false },
        };

        const s = states[status] || states.disconnected;
        if (indicator) { indicator.style.background = s.dot; indicator.style.boxShadow = `0 0 10px ${s.dot}80`; }
        if (text)       text.textContent = s.label;
        if (connectBtn) connectBtn.style.display = s.btn  ? 'flex' : 'none';
        if (disconnBtn) disconnBtn.style.display = s.disconn ? 'flex' : 'none';
        if (qrSection)  qrSection.style.display  = s.qr   ? 'block' : 'none';
        if (connCard)   connCard.style.display    = s.card ? 'block' : 'none';

        if (status === 'connected' && connCard) {
            document.getElementById('wa-evo-connected-name').textContent = detail || _currentInstanceName || '';
        }
    }

    // ── Supabase persistence ─────────────────────────────────

    async function _saveEvoConfig(instanceName, evoStatus) {
        if (!_currentWorkspaceId) return;
        const { data } = await window.supabaseClient
            .from('workspaces').select('credentials').eq('id', _currentWorkspaceId).single();
        const creds = data?.credentials || {};
        await window.supabaseClient.from('workspaces').update({
            credentials: {
                ...creds,
                whatsapp_mode: 'evolution',
                evolution_instance: instanceName,
                evolution_status: evoStatus
            }
        }).eq('id', _currentWorkspaceId);
    }

    // ── Meta Cloud API helpers ───────────────────────────────

    window.saveCloudCredentials = async function() {
        const id     = document.getElementById('cloud-phone-id')?.value.trim();
        const token  = document.getElementById('cloud-token')?.value.trim();
        const b_id   = document.getElementById('cloud-business-id')?.value.trim();
        const secret = document.getElementById('cloud-app-secret')?.value.trim();

        if (!id || !token) { window.showToast && window.showToast('Preencha Phone ID e Access Token', 'error'); return; }

        const { data } = await window.supabaseClient
            .from('workspaces').select('credentials').eq('id', _currentWorkspaceId).single();
        const creds = data?.credentials || {};

        const { error } = await window.supabaseClient.from('workspaces').update({
            credentials: { ...creds, whatsapp_mode: 'meta', whatsapp_token: token, phone_id: id, business_id: b_id, app_secret: secret }
        }).eq('id', _currentWorkspaceId);

        if (error) { window.showToast && window.showToast('Erro ao salvar: ' + error.message, 'error'); return; }

        window.showToast && window.showToast('✅ Credenciais Meta salvas!', 'success');
        _showMetaConnected(id);
    };

    function _showMetaConnected(display) {
        const card = document.getElementById('wa-meta-connected-card');
        const info = document.getElementById('wa-meta-connected-info');
        if (card) card.style.display = 'block';
        if (info) info.textContent   = '📱 ' + display;
    }

    window.disconnectMeta = async function() {
        const { data } = await window.supabaseClient
            .from('workspaces').select('credentials').eq('id', _currentWorkspaceId).single();
        let creds = data?.credentials || {};
        delete creds.whatsapp_token; delete creds.phone_id;
        delete creds.business_id;    delete creds.app_secret;
        creds.whatsapp_mode = 'evolution';
        await window.supabaseClient.from('workspaces').update({ credentials: creds }).eq('id', _currentWorkspaceId);
        const card = document.getElementById('wa-meta-connected-card');
        if (card) card.style.display = 'none';
        window.showToast && window.showToast('Desconectado da Meta Cloud API', 'info');
    };

    // ── Evolution API fetch helper ───────────────────────────

    async function _evoFetch(method, path, body) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY }
        };
        if (body) opts.body = JSON.stringify(body);
        return fetch(EVOLUTION_URL + path, opts);
    }

    // ── Expose checkWAStatus for backwards compat ────────────
    window.checkWAStatus = window.initWhatsappSettings;

})();
