// ============================================================
// hub-whatsapp.js  — WhatsApp Connection Manager
// Provider: Meta Cloud API only (Official)
// Auth: Facebook Embedded Signup (primary) + Manual (advanced)
// App ID: 934037612918640
// ============================================================

(function () {
    'use strict';

    const META_APP_ID = '934037612918640';
    const EDGE_URL = 'https://uyseheucqikgcorrygzc.supabase.co/functions/v1';

    let _wsId = null;
    let _fbSDKReady = false;

    // ── Load Facebook SDK ─────────────────────────────────────
    function _loadFBSDK() {
        if (document.getElementById('facebook-jssdk')) return;
        window.fbAsyncInit = function () {
            FB.init({ appId: META_APP_ID, autoLogAppEvents: true, xfbml: true, version: 'v21.0' });
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

        // Load saved config
        const { data } = await window.supabaseClient.from('workspaces')
            .select('credentials').eq('id', _wsId).single();

        const creds = data?.credentials || {};

        // Show connection status
        if (creds.phone_id && creds.whatsapp_token) {
            _showConnected({
                phone_display: creds.phone_display || creds.phone_id,
                waba_id: creds.waba_id || creds.business_id || '—',
                connected_at: creds.meta_connected_at,
            });
        } else {
            _showDisconnected();
        }

        // Pre-fill manual fields if they exist
        const setVal = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
        setVal('cloud-phone-id', creds.phone_id);
        setVal('cloud-business-id', creds.waba_id || creds.business_id);
        setVal('cloud-token', creds.whatsapp_token);
        setVal('cloud-app-secret', creds.app_secret);
    };

    // ── Facebook Embedded Signup ──────────────────────────────
    window.launchWhatsAppSignup = function () {
        const statusEl = document.getElementById('wa-signup-status');
        if (!window.FB) {
            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.style.color = '#fbbf24';
                statusEl.style.background = 'rgba(251,191,36,0.08)';
                statusEl.style.border = '1px solid rgba(251,191,36,0.2)';
                statusEl.style.borderRadius = '8px';
                statusEl.textContent = '⏳ SDK do Facebook carregando... Tente novamente em 2 segundos.';
            }
            return;
        }

        FB.login(function (response) {
            if (response.authResponse) {
                _handleFBLoginSuccess(response.authResponse);
            } else {
                if (statusEl) {
                    statusEl.style.display = 'block';
                    statusEl.style.color = '#f87171';
                    statusEl.style.background = 'rgba(248,113,113,0.08)';
                    statusEl.style.border = '1px solid rgba(248,113,113,0.2)';
                    statusEl.style.borderRadius = '8px';
                    statusEl.textContent = '❌ Login cancelado ou negado. Tente novamente.';
                }
            }
        }, {
            scope: 'whatsapp_business_management,whatsapp_business_messaging,business_management',
            extras: {
                sessionInfoVersion: 2,
                featureType: 'whatsapp_embedded_signup',
                setup: {
                    business: {},
                    phone: { display_phone_number_country_code: 'BR' },
                }
            }
        });
    };

    async function _handleFBLoginSuccess(authResponse) {
        const statusEl = document.getElementById('wa-signup-status');
        const signupBtn = document.getElementById('wa-signup-btn');

        function _setStatus(msg, color, bg) {
            if (!statusEl) return;
            statusEl.style.display = 'block';
            statusEl.style.color = color;
            statusEl.style.background = bg;
            statusEl.style.border = `1px solid ${color}40`;
            statusEl.style.borderRadius = '8px';
            statusEl.style.padding = '12px';
            statusEl.textContent = msg;
        }

        _setStatus('⏳ Processando credenciais Meta...', '#fbbf24', 'rgba(251,191,36,0.08)');
        if (signupBtn) signupBtn.disabled = true;

        try {
            // Get WABA accounts linked to this login
            const token = authResponse.accessToken;

            // Try to get WABA + phone_number_id via Graph API
            const wabaRes = await fetch(
                `https://graph.facebook.com/v21.0/me/businesses?fields=whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number}}&access_token=${token}`
            );
            const wabaData = await wabaRes.json();

            const businesses = wabaData.data || [];
            let waba = null, phoneEntry = null;

            for (const biz of businesses) {
                const accounts = biz.whatsapp_business_accounts?.data || [];
                for (const acc of accounts) {
                    const phones = acc.phone_numbers?.data || [];
                    if (phones.length > 0) {
                        waba = acc;
                        phoneEntry = phones[0];
                        break;
                    }
                }
                if (waba) break;
            }

            if (!waba || !phoneEntry) {
                // Show account picker for manual selection
                _setStatus('⚠️ Não encontramos um número WhatsApp Business vinculado. Verifique se seu WABA está aprovado e use a configuração manual abaixo.', '#fbbf24', 'rgba(251,191,36,0.08)');
                if (signupBtn) signupBtn.disabled = false;
                return;
            }

            // Save credentials
            await _saveMetaCredentials({
                whatsapp_token: token,
                phone_id: phoneEntry.id,
                phone_display: phoneEntry.display_phone_number,
                waba_id: waba.id,
                app_secret: null, // Will be filled via manual field if needed
                meta_connected_at: new Date().toISOString(),
            });

            _setStatus(`✅ Conectado: ${phoneEntry.display_phone_number}`, '#4ade80', 'rgba(74,222,128,0.08)');
            _showConnected({
                phone_display: phoneEntry.display_phone_number,
                waba_id: waba.id,
                connected_at: new Date().toISOString(),
            });

        } catch (e) {
            console.error('[WA] FB login error:', e);
            _setStatus(`❌ Erro: ${e.message}`, '#f87171', 'rgba(248,113,113,0.08)');
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
        const { data } = await window.supabaseClient.from('workspaces')
            .select('credentials').eq('id', _wsId).single();
        const creds = data?.credentials || {};

        // Remove all legacy Evolution fields
        delete creds.whatsapp_mode;
        delete creds.evolution_instance;
        delete creds.evolution_status;

        const merged = {
            ...creds,
            whatsapp_mode: 'meta',
            ...fields,
        };

        const { error } = await window.supabaseClient.from('workspaces')
            .update({ credentials: merged }).eq('id', _wsId);

        if (error) {
            window.showToast && window.showToast('Erro ao salvar: ' + error.message, 'error');
            throw error;
        }
    }

    // ── Disconnect Meta ───────────────────────────────────────
    window.disconnectMeta = async function () {
        if (!confirm('Desconectar o WhatsApp desta workspace? Automações serão pausadas.')) return;

        const { data } = await window.supabaseClient.from('workspaces')
            .select('credentials').eq('id', _wsId).single();
        const creds = { ...(data?.credentials || {}) };

        delete creds.whatsapp_token;
        delete creds.phone_id;
        delete creds.phone_display;
        delete creds.waba_id;
        delete creds.business_id;
        delete creds.app_secret;
        delete creds.meta_connected_at;
        creds.whatsapp_mode = null;

        await window.supabaseClient.from('workspaces').update({ credentials: creds }).eq('id', _wsId);

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

    // ── Backwards compat ─────────────────────────────────────
    window.checkWAStatus = window.initWhatsappSettings;

    // No-ops for removed Evolution functions (defensive — prevent errors
    // if old cached HTML still references them)
    window.startEvoConnection = () => console.warn('[WA] Evolution API removed. Use Meta Cloud API.');
    window.disconnectEvo      = () => {};
    window.switchWaTab        = () => {}; // Tabs removed

})();
