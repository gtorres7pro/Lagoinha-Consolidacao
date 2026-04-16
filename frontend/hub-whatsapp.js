// ============================================================
// hub-whatsapp.js  — WhatsApp Connection Manager
// Supports: Evolution API (QR Code) + Meta Cloud API
// ============================================================

(function() {
    'use strict';

    // Evolution calls are proxied through the `whatsapp-proxy` Edge Function
    // so the server-side Evolution admin key is never exposed to the browser.
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
            // 1. Create instance (idempotent — OK if already exists; 409 means exists)
            const createRes = await _evoProxy('instance_create', {
                params: { instanceName }
            });

            console.log('[WA EVO] create response:', createRes.status, createRes._data);

            if (!createRes.ok && createRes.status !== 409) {
                throw new Error(createRes._data?.message || createRes._data?.error || `Erro ${createRes.status} ao criar instância`);
            }

            _currentInstanceName = instanceName;
            _setEvoStatus('waiting_qr');

            // Evolution API takes ~10-15s to establish WebSocket to WhatsApp and generate QR
            // We wait progressively: 4s → try, +4s → try again, then hand off to polling
            const waitAndTry = async (delay) => {
                await new Promise(r => setTimeout(r, delay));
                return _fetchAndShowQR(instanceName);
            };

            let gotQR = await waitAndTry(4000);
            if (!gotQR) gotQR = await waitAndTry(4000);
            if (!gotQR) gotQR = await waitAndTry(4000);

            // Start ongoing polling regardless (handles both QR display + connection detection)
            _startQRPolling(instanceName);

            // 4. Save instance name to DB
            await _saveEvoConfig(instanceName, 'disconnected');

        } catch(e) {
            console.error('[WA EVO] startEvoConnection error:', e);
            _setEvoStatus('error', e.message);
        }
    };

    // Disconnect instance
    window.disconnectEvo = async function() {
        if (!_currentInstanceName) return;
        _stopQRPolling();
        try {
            await _evoProxy('instance_logout', { instance_name: _currentInstanceName });
        } catch(e) { /* ignore */ }
        _setEvoStatus('disconnected');
        _clearQRCode();
        await _saveEvoConfig(_currentInstanceName, 'disconnected');
    };

    // Fetch & render QR — handles Evolution v2 response variants
    async function _fetchAndShowQR(instanceName) {
        try {
            const res  = await _evoProxy('instance_connect', { instance_name: instanceName });
            const data = res._data || {};
            console.log('[WA QR] connect response:', res.status, JSON.stringify(data).slice(0, 300));

            // Evolution v2.1.x: QR is inside data.base64 directly
            // or inside data.qrcode.base64, or data.code (pairing code)
            const base64 = data.base64
                        || data.qrcode?.base64
                        || data.instance?.qrcode?.base64;

            if (base64) {
                _renderQRImage(base64);
                return true;
            }

            // Already connected (instance was already open)
            const state = data.instance?.state || data.state;
            if (state === 'open') {
                _onEvoConnected(instanceName);
                return true;
            }

            // No QR yet — show placeholder text
            const wrap = document.getElementById('wa-qr-wrap');
            if (wrap && !wrap.querySelector('img')) {
                wrap.innerHTML = `<p style="color:rgba(255,255,255,0.3);font-size:.8rem;text-align:center;">
                    Gerando QR Code...<br>
                    <span style="font-size:.7rem;color:rgba(255,255,255,0.2);">(state: ${state || 'unknown'})</span>
                </p>`;
            }

        } catch(e) {
            console.warn('[WA QR] fetch error:', e);
        }
        return false;
    }

    function _startQRPolling(instanceName) {
        _stopQRPolling();
        let attempts = 0;
        const MAX_ATTEMPTS = 90; // 90 × 2s = 3 minutes max wait

        _qrPollTimer = setInterval(async () => {
            attempts++;

            // Update "still waiting" counter for user feedback
            const waitText = document.getElementById('wa-qr-wait-counter');
            if (waitText) waitText.textContent = `Aguardando QR... (${attempts * 2}s)`;

            try {
                // First: check if already fully connected
                const stateRes  = await _evoProxy('instance_state', { instance_name: instanceName });
                const stateData = stateRes._data || {};
                const state = stateData.instance?.state || stateData.state;

                if (state === 'open') {
                    _stopQRPolling();
                    _onEvoConnected(instanceName);
                    return;
                }

                // Try to fetch QR (only while not fully connected)
                await _fetchAndShowQR(instanceName);

            } catch(e) { /* network hiccup, keep polling */ }

            if (attempts >= MAX_ATTEMPTS) {
                _stopQRPolling();
                _setEvoStatus('error', 'Tempo esgotado — tente novamente');
            }
        }, 2000); // poll every 2 seconds
    }

    function _stopQRPolling() {
        if (_qrPollTimer) { clearInterval(_qrPollTimer); _qrPollTimer = null; }
    }

    async function _checkEvoStatus(instanceName) {
        try {
            const res  = await _evoProxy('instance_state', { instance_name: instanceName });
            const data = res._data || {};
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

    // ── Evolution proxy helper ───────────────────────────────
    // Calls the `whatsapp-proxy` Edge Function with the current workspace_id.
    // Returns a Response-like object: { ok, status, _data } so call sites can
    // keep their shape (await res._data instead of await res.json()).
    async function _evoProxy(action, opts = {}) {
        const body = { action, workspace_id: _currentWorkspaceId, ...opts };
        try {
            const { data, error } = await window.supabaseClient.functions.invoke('whatsapp-proxy', { body });
            if (error) {
                const status = error.context?.status ?? 500;
                let respData = {};
                try { respData = await error.context?.json(); } catch { /* ignore */ }
                return { ok: false, status, _data: respData };
            }
            return { ok: true, status: 200, _data: data ?? {} };
        } catch (e) {
            return { ok: false, status: 0, _data: { error: e.message } };
        }
    }

    // ── Expose checkWAStatus for backwards compat ────────────
    window.checkWAStatus = window.initWhatsappSettings;

})();
