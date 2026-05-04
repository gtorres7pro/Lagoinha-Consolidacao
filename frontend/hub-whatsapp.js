// ============================================================
// hub-whatsapp.js  — WhatsApp Connection Manager
// Provider: Meta Cloud API only (Official)
// Auth: Facebook Embedded Signup (primary) + Manual (advanced)
// App ID: 934037612918640
// ============================================================

(function () {
    'use strict';

    const META_APP_ID = '934037612918640';
    const META_CONFIG_ID = (
        window.ZELO_META_WHATSAPP_CONFIG_ID ||
        document.querySelector('meta[name="zelo-meta-whatsapp-config-id"]')?.content ||
        ''
    ).trim();
    const META_COEXISTENCE_FEATURE = 'whatsapp_business_app_onboarding';
    const EDGE_URL = 'https://uyseheucqikgcorrygzc.supabase.co/functions/v1';

    let _wsId = null;
    let _fbSDKReady = false;

    async function _waAuth(action, body = {}) {
        const { data, error } = await window.supabaseClient.functions.invoke('whatsapp-auth', {
            body: { action, workspace_id: _wsId, ...body }
        });
        if (error || data?.error) throw new Error(error?.message || data?.error || 'Falha na operação WhatsApp');
        return data || {};
    }

    function _setSignupStatus(msg, color, bg) {
        const statusEl = document.getElementById('wa-signup-status');
        if (!statusEl) return;
        statusEl.style.display = 'block';
        statusEl.style.color = color;
        statusEl.style.background = bg;
        statusEl.style.border = `1px solid ${color}40`;
        statusEl.style.borderRadius = '8px';
        statusEl.style.padding = '12px';
        statusEl.textContent = msg;
    }

    async function _waitForSignupSessionInfo(timeoutMs = 1600) {
        const started = Date.now();
        while (!window._waSessionInfo && Date.now() - started < timeoutMs) {
            await new Promise(res => setTimeout(res, 100));
        }
        return window._waSessionInfo || {};
    }

    // ── Load Facebook SDK ─────────────────────────────────────
    function _loadFBSDK() {
        if (document.getElementById('facebook-jssdk')) return;
        window.fbAsyncInit = function () {
            FB.init({ appId: META_APP_ID, autoLogAppEvents: true, xfbml: true, version: 'v25.0' });
            _fbSDKReady = true;
            console.log('[WA] FB SDK ready');
        };
        const js = document.createElement('script');
        js.id = 'facebook-jssdk';
        js.src = 'https://connect.facebook.net/en_US/sdk.js';
        js.async = true;
        js.defer = true;
        document.head.appendChild(js);
    }

    // ── Initialise on settings tab open ──────────────────────
    window.initWhatsappSettings = async function () {
        _wsId = window.currentWorkspaceId || window._currentWorkspace?.id;
        if (!_wsId) return;

        _loadFBSDK();

        // Load saved config without exposing stored Meta tokens to the browser.
        const data = await _waAuth('status');

        // Show connection status
        if (data.connected) {
            _showConnected({
                phone_display: data.phone_display || data.phone_id,
                waba_id: data.waba_id || '—',
                connected_at: data.meta_connected_at,
            });
        } else {
            _showDisconnected();
        }

        // Pre-fill non-secret manual fields only.
        const setVal = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
        setVal('cloud-phone-id', data.phone_id);
        setVal('cloud-business-id', data.waba_id);
        setVal('cloud-token', '');
        setVal('cloud-app-secret', '');
    };

    // ── Facebook Embedded Signup ──────────────────────────────
    window.launchWhatsAppSignup = function () {
        const statusEl = document.getElementById('wa-signup-status');
        if (!window.FB) {
            _setSignupStatus('⏳ SDK do Facebook carregando... Tente novamente em 2 segundos.', '#fbbf24', 'rgba(251,191,36,0.08)');
            return;
        }

        if (!META_CONFIG_ID) {
            _setSignupStatus(
                '⚠️ Falta o Meta Configuration ID do Embedded Signup. Crie a configuração “WhatsApp Embedded Signup” no Meta e adicione o ID no Zelo.',
                '#fbbf24',
                'rgba(251,191,36,0.08)'
            );
            return;
        }

        // Reset any cached session info from a previous attempt
        window._waSessionInfo = null;
        window._waSignupError = null;

        FB.login(function (response) {
            if (response.authResponse) {
                _handleFBLoginSuccess(response.authResponse);
            } else {
                const reported = window._waSignupError?.data;
                const reportedMsg = reported?.error_message || reported?.current_step;
                _setSignupStatus(
                    reportedMsg ? `❌ Cadastro cancelado pela Meta: ${reportedMsg}` : '❌ Login cancelado ou negado. Tente novamente.',
                    '#f87171',
                    'rgba(248,113,113,0.08)'
                );
            }
        }, {
            config_id: META_CONFIG_ID,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
                version: 'v4',
                setup: {},
                featureType: META_COEXISTENCE_FEATURE,
                sessionInfoVersion: '3',
            }
        });
    };

    async function _handleFBLoginSuccess(authResponse) {
        const statusEl = document.getElementById('wa-signup-status');
        const signupBtn = document.getElementById('wa-signup-btn');

        _setSignupStatus('⏳ Processando credenciais Meta...', '#fbbf24', 'rgba(251,191,36,0.08)');
        if (signupBtn) signupBtn.disabled = true;

        try {
            const sessionInfo = await _waitForSignupSessionInfo();
            if (authResponse.code) {
                const saved = await _waAuth('complete-embedded-signup', {
                    code: authResponse.code,
                    session_info: sessionInfo,
                    signup_mode: 'coexistence',
                });
                const account = saved.account || {};
                window._waSessionInfo = null;
                _setSignupStatus(`✅ Conectado: ${account.phone_display || account.phone_id}`, '#4ade80', 'rgba(74,222,128,0.08)');
                _showConnected({
                    phone_display: account.phone_display || account.phone_id,
                    waba_id: account.waba_id,
                    connected_at: new Date().toISOString()
                });
                return;
            }

            const token = authResponse.accessToken;
            if (!token) throw new Error('Meta não retornou código ou token de autorização.');
            await new Promise(res => setTimeout(res, 800));
            const accountsData = await _waAuth('fetch-accounts', { short_lived_token: token });
            const accounts = accountsData.accounts || [];
            if (!accounts.length) {
                _setSignupStatus('⚠️ Não encontramos um número WhatsApp Business vinculado. Verifique se seu WABA está aprovado e use a configuração manual abaixo.', '#fbbf24', 'rgba(251,191,36,0.08)');
                if (signupBtn) signupBtn.disabled = false;
                return;
            }

            const selected = accounts.find(a =>
                (sessionInfo.phone_number_id && a.phone_id === sessionInfo.phone_number_id) ||
                (sessionInfo.waba_id && a.waba_id === sessionInfo.waba_id)
            ) || accounts[0];

            const saved = await _waAuth('save-account', {
                short_lived_token: token,
                account: selected,
            });

            window._waSessionInfo = null; // Clear after use

            const account = saved.account || selected;
            _setSignupStatus(`✅ Conectado: ${account.phone_display || account.phone_id}`, '#4ade80', 'rgba(74,222,128,0.08)');
            _showConnected({ phone_display: account.phone_display || account.phone_id, waba_id: account.waba_id, connected_at: new Date().toISOString() });

        } catch (e) {
            console.error('[WA] FB login error:', e);
            _setSignupStatus(`❌ Erro: ${e.message}`, '#f87171', 'rgba(248,113,113,0.08)');
        } finally {
            if (signupBtn) signupBtn.disabled = false;
        }
    }

    // ── Manual credential save ────────────────────────────────
    window.saveCloudCredentials = async function () {
        const id     = document.getElementById('cloud-phone-id')?.value.trim();
        const token  = document.getElementById('cloud-token')?.value.trim();
        const b_id   = document.getElementById('cloud-business-id')?.value.trim();
        const secret = document.getElementById('cloud-app-secret')?.value.trim();

        if (!id || !token) {
            window.showToast && window.showToast('Preencha Phone ID e Access Token', 'error');
            return;
        }

        await _saveMetaCredentials({
            phone_id: id,
            phone_display: id,
            waba_id: b_id || null,
            whatsapp_token: token,
            app_secret: secret || null,
            meta_connected_at: new Date().toISOString(),
        });

        window.showToast && window.showToast('✅ Credenciais Meta salvas!', 'success');
        _showConnected({ phone_display: id, waba_id: b_id || '—', connected_at: new Date().toISOString() });
    };

    // ── Shared credentials write ──────────────────────────────
    async function _saveMetaCredentials(fields) {
        if (!_wsId) return;
        await _waAuth('manual-save', {
            phone_id: fields.phone_id,
            token: fields.whatsapp_token,
            business_id: fields.waba_id || fields.business_id || '',
            app_secret: fields.app_secret || '',
        });
    }

    // ── Disconnect Meta ───────────────────────────────────────
    window.disconnectMeta = async function () {
        if (!confirm('Desconectar o WhatsApp desta workspace? Automações serão pausadas.')) return;

        await _waAuth('disconnect');

        _showDisconnected();
        window.showToast && window.showToast('WhatsApp desconectado.', 'info');
    };

    // ── UI state helpers ──────────────────────────────────────
    function _showConnected({ phone_display, waba_id, connected_at }) {
        const connCard = document.getElementById('wa-meta-connected-card');
        const signupBtn = document.getElementById('wa-signup-btn');
        const phoneEl = document.getElementById('wa-meta-phone');
        const wabaEl  = document.getElementById('wa-meta-waba');
        const dateEl  = document.getElementById('wa-meta-date');
        const statusDot = document.getElementById('wa-status-dot');
        const statusText = document.getElementById('wa-status-text');

        if (connCard) { connCard.style.display = 'flex'; }
        if (signupBtn) { signupBtn.style.display = 'none'; }
        if (phoneEl)  phoneEl.textContent = phone_display || '—';
        if (wabaEl)   wabaEl.textContent  = waba_id || '—';
        if (dateEl && connected_at) {
            dateEl.textContent = 'Conectado em ' + new Date(connected_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        if (statusDot)  { statusDot.style.background = '#25D366'; statusDot.style.boxShadow = '0 0 8px #25D36660'; }
        if (statusText) { statusText.textContent = 'Conectado'; statusText.style.color = '#25D366'; }
    }

    function _showDisconnected() {
        const connCard = document.getElementById('wa-meta-connected-card');
        const signupBtn = document.getElementById('wa-signup-btn');
        const statusDot = document.getElementById('wa-status-dot');
        const statusText = document.getElementById('wa-status-text');

        if (connCard) { connCard.style.display = 'none'; }
        if (signupBtn) { signupBtn.style.display = 'flex'; }
        if (statusDot)  { statusDot.style.background = '#555'; statusDot.style.boxShadow = 'none'; }
        if (statusText) { statusText.textContent = 'Desconectado'; statusText.style.color = 'rgba(255,255,255,0.4)'; }
    }

    // ── Capture Meta Embedded Signup sessionInfo via postMessage ─
    // Meta sends waba_id + phone_number_id in FINISH events during Embedded Signup.
    // This is the most reliable channel — the Graph API traversal below serves as fallback.
    window.addEventListener('message', function (event) {
        if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
        try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            if (!data || data.type !== 'WA_EMBEDDED_SIGNUP') return;
            if (String(data.event || '').startsWith('FINISH')) {
                const info = data.data || {};
                window._waSessionInfo = {
                    waba_id: info.waba_id || null,
                    waba_ids: info.waba_ids || [],
                    phone_number_id: info.phone_number_id || null,
                    business_id: info.business_id || null,
                    finish_event: data.event || null,
                };
                console.log('[WA] sessionInfo received via postMessage:', window._waSessionInfo);
            } else if (data.event === 'CANCEL' || data.event === 'ERROR') {
                window._waSignupError = data;
                console.log('[WA] Embedded Signup did not finish:', data);
            }
        } catch (_) { /* ignore non-JSON messages */ }
    });

    // ── Backwards compat ─────────────────────────────────────
    window.checkWAStatus = window.initWhatsappSettings;

    // No-ops for removed Evolution functions (defensive — prevent errors
    // if old cached HTML still references them)
    window.startEvoConnection = () => console.warn('[WA] Evolution API removed. Use Meta Cloud API.');
    window.disconnectEvo      = () => {};
    window.switchWaTab        = () => {}; // Tabs removed

})();
