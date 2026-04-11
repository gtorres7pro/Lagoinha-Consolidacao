# Zelo Pro (formerly Lagoinha Consolidação) Constitution & Blueprint

## Document Scope (Last Updated: 2026-04-11)
This file represents the absolute source of truth for the **Zelo Pro** platform. It documents structural logic, behavioral rules, UI/UX aesthetics, database schema expectations, and core functional invariant features implemented.

---

## 1. Core Platform Overview 🌟
*   **Guiding Star:** A comprehensive, multi-tenant SaaS Dashboard tailored to church consolidation, visitor tracking, and member lifecycle management (Start, Batismo, Novos Membros), augmented with AI and WAHA-based WhatsApp automation.
*   **Target Audience:** Church administration, Master Admins (Zelo Support), and Church Operators (Users).
*   **Visual Identity:** 
    *   **Colors/Aesthetics:** Premium Glassmorphism. Dark mode primary. High-contrast Yellow (`#FFD700`) and Black branding. Smooth interactions, gradient highlights. Rose/pink (`#fb7185`, `#f43f5e`) used as accent in Cantina module.
    *   **Typography:** Bold, modern sans-serif (Outfit, Inter, or Montserrat).
    *   **UI Elements:** Card-based UI, mobile-responsive layout, inline-editable task controls, active tag filtering overlays.
*   **Stack:** Vanilla JS, HTML/CSS on the Frontend. Supabase (Auth, PostgreSQL DB, Storage, Edge Functions) as the robust Backend-as-a-Service, optionally interfacing with WAHA (WhatsApp API) or FastAPI.
*   **Live Domain:** `https://zelo.7prolabs.com` (deployed via Coolify on VPS `187.77.54.196`).

---

## 2. Platform Modules & Features 🧩

### A. Lifecycle Funnels
1.  **Consolidação:** Converts (salvos/decisions). Tracks tasks like AI welcome, Start invite, GC invite, and Baptism.
2.  **Visitantes:** First-time visitors. Tracks welcome messages, GC integration, and human follow-up.
3.  **Start (Dynamic Welcome):** Discipleship flow. *Feature note: Workspace-aware dynamic labeling. E.g., for the "Orlando" workspace, the interface dynamically replaces "Start" with "Welcome to the New" in KPIs, menus, and reports.*
4.  **Batismo:** Baptism candidate tracking, preparation workflow.
5.  **Novos Membros:** Moving participants into official membership status (integrates with external concepts like InPeace).

### B. Core Functional Tools
1.  **Data Export (CSV):** Completely replaces generic email reporting. The `downloadReportCSV` mechanism runs client-side, respecting currently active UI filters (search, date periods, active tags) across all modules + public report links, providing an immediate `.csv` download coupled with a 🎉 Confetti success overlay.
2.  **Módulo Tags:** Dynamic tagging engine enabling operators to segment leads directly, synchronized across all cards.
3.  **Task Manager (Kanban & List):** A dual-view architecture for internal tasks and development tracking. Allows direct, inline modifications of status, priority, due dates, and assignees.
4.  **Chat ao Vivo (Live Inbox):** Centralized WhatsApp UI connecting leads. Tracks 24-hour interaction windows, automated templates mapping, and historical AI (Mila) interactions.

### C. Mila & Developer Hub
1.  **Mila 2.0 (AI Support):** End-users can open Support Tickets with file attachments. Handled natively via Edge Functions to generate deterministic AI replies, update statuses, and notify via Resend emails.
2.  **Roadmap & Tarefas:** Internal Master Admin dashboard mapping Mila requests into actionable Developer tasks. Includes public visibility toggles to map out the platform's public roadmap.

### D. CRIE Module (Events & Member App) ⭐ EXPANDED (2026-04-11)
1.  **Event Management:** Full CRUD for events, banner upload (Supabase Storage bucket `crie-banners`), public inscription page, financial reporting with ledger and KPIs.
2.  **CRIE Connect:** Community listing directory with approval/pending queue, reactivation flow, editing interface for title/category/description/badge/expiration.
3.  **CRIE Member App (PWA):** Deployed at `https://crie-app.7prolabs.com`. Allows members to register, access content, and view playlists/videos. Admin interface for workshop content (videos, playlists) and member approval workflows inside `dashboard.html`.
4.  **Financial Module (Controle tab):** Tabbed reporting (Por Evento, Financeiro, Configurações), average recurrence metric, membership fee KPIs, avulsa transaction support.
5.  **Workshop Admin (Phase 4):** 3-tab interface within `view-crie-workshop`:
    - **Conteúdos:** Grid of published videos. YouTube oEmbed auto-fetch (title + thumbnail — no API key). Filter by All/Global/Workspace/Members. Publish/Unpublish/Delete. Content visibility: `workspace`, `global`, `members_only`.
    - **Playlists:** Create/delete video series. Displayed in the PWA as sequenced collections.
    - **Comentários:** Centralized moderation view. Inline reply system. Pending comments badge (auto-updated).
6.  **Member Applications:** Pending applications banner in Membros view. Approve/Reject flow. Approval auto-creates a `crie_members` row with `source: 'app'`. **Nav sidebar badge** (`#nav-membros-badge`) shows real-time pending count, pulses red, polled every 2 minutes.
7.  **Membership & Stripe (Phase 5):**
    - Configurable membership fee + currency per workspace (stored in `workspaces.crie_settings`).
    - Stripe account connection via `crie-stripe-connect` Edge Function (validates SK against Stripe API, saves credentials encoded in crie_settings).
    - Discount coupon creation via `crie-create-coupon` Edge Function.
    - **`EDGE_URL` rule:** Always hardcode `https://uyseheucqikgcorrygzc.supabase.co/functions/v1` — do NOT derive from `window.SUPABASE_URL` (that variable is locally scoped and evaluates to `undefined` at runtime).

### E. Cantina Module ⭐ NEW (2026-04-11)
Full canteen/food-service management module. Sidebar entry below CRIE, with 5 sub-tabs:

1.  **Pedidos (Orders):** Real-time order management. Tracks online orders from `cantina.html` and POS orders. Flow: `pending → confirmed → ready → delivered`. Supports order expiration (configurable timeout, enforced via `pg_cron`), payment confirmation, and cancellation. KPIs: orders today, pending, ready, revenue today.

2.  **Estoque (Inventory):** Full product CRUD. Each product has:
    - Name, description, price (currency-aware), photos (1+ required, uploaded to bucket `cantina-products`)
    - `qty_online` (available via web), `qty_physical` (counter only), `qty_total` (generated column = online + physical)
    - `available_online` toggle, archive/unarchive, duplicate
    - Low-stock badges (≤ 2 units) and "Esgotado" state

3.  **Financeiro:** Transaction ledger (sales, expenses, donations, adjustments, refunds). Period filters (7d / 30d / All). Type filter. KPIs: receitas, despesas, saldo, vendas POS, doações. "Fechar Caixa" sends report via Resend email.

4.  **POS (Ponto de Venda):** Physical counter sales interface. Product search, cart, payment method selection (cash/pix/card/stripe), optional customer name. Registers sale directly in `cantina_orders` and `cantina_transactions`.

5.  **Configurar:** Store settings (name, description, currency/symbol, country code default, reservation timeout). Stripe integration toggle + keys. Allowed payment methods. Responsible/notification contact. QR Code of public store URL (uses `api.qrserver.com` — no JS library needed). Copy link button.

**Public Ordering Page (`cantina.html`):**
- URL pattern: `/cantina.html?ws=<workspace_id>`
- Premium gourmet design: warm dark bg (`#16141a`), rose accent (`#fb7185`), glassmorphism cards.
- Loads config (store name, currency, country code) + products (filtered: `available_online=true`, `archived=false`, `qty_online > 0`).
- Search bar + category chips (extensible).
- Cart drawer (desktop) + floating cart bar (mobile).
- Checkout modal: collects full name + phone with country code selector.
- Submits to `cantina_orders` with `order_type='online'`, unique `order_number`, and `expires_at` countdown timer.
- No external dependencies beyond Supabase JS SDK.

**Key Files:**
- `frontend/hub-cantina.js` — All Cantina module logic (state, helpers, CRUD per section)
- `frontend/cantina.html` — Public ordering page (self-contained, own Supabase client init)
- `frontend/dashboard.html` — Houses all 5 Cantina view sections + sidebar menu

**Coolify Integration:** Module sidebar patching via `patchSwitchTab()` in `hub-cantina.js` — hooks into `window.switchTab` to trigger lazy-loading per tab.

---

## 3. Database Schema Mapping (Supabase) 🗄️

*All tables employ Row Level Security (RLS) bound to `workspace_id` except for Master Admin override policies.*

### Key Tables
*   **workspaces:** `id, name, status, credentials (json), knowledge_base (json), crie_settings (jsonb)`
    - `crie_settings` stores: `stripe_connected`, `stripe_publishable_key`, `stripe_secret_key_enc` (base64), `stripe_account_id`, `stripe_account_name`, `stripe_account_email`, `membership_fee`, `membership_currency`.
*   **leads:** `id, workspace_id, name, phone, email, type (saved|visitor), tags (jsonb), batizado, culto, decisao, etc.`
*   **app_logs / tickets:** `id, workspace_id, type (bug|feature), status, description, attachments (text[]), public_roadmap (boolean)`
*   **tasks:** Universal tasks table. `id, workspace_id, lead_id, task_title, status, due_date, context`
*   **messages:** `id, workspace_id, lead_id, direction, content, type (text|audio|image|template), automated, created_at`
*   **start_participants:** `id, workspace_id, name, email, phone, source`
*   **start_progress:** `participant_id, lesson_number, status, timestamp`

### CRIE Tables
*   **crie_members:** `id, workspace_id, name, email, phone, app_user_id (fk), status (ativo|inativo), source (manual|app), stripe_customer_id, created_at`
*   **crie_member_applications:** `id, workspace_id, app_user_id (fk), status (pending|approved|rejected), motivation, reviewed_at, created_at`
*   **crie_membership_payments:** `id, workspace_id, member_id (fk), amount, currency, status (pending|paid|failed), stripe_payment_intent_id, stripe_subscription_id, paid_at, created_at`
*   **crie_app_users:** `id, workspace_id, name, email, phone, password_hash, created_at`
*   **crie_workshop_content:** `id, workspace_id, title, description, youtube_url, thumbnail_url, visibility (workspace|global|members_only), playlist_id (fk), published, created_at`
*   **crie_workshop_playlists:** `id, workspace_id, title, description, created_at`
*   **crie_workshop_comments:** `id, workspace_id, content_id (fk), app_user_id (fk), body, reply (text), replied_at, created_at`
    - RLS: `INSERT` allowed to `crie_app_users`; `UPDATE` (reply field) allowed to workspace admins only.

### Cantina Tables
*   **cantina_config:** `workspace_id (PK), store_name, store_description, currency, currency_symbol, default_country_code, reservation_minutes, stripe_enabled, stripe_publishable_key, stripe_secret_key, allow_counter_payment, payment_methods (text[]), responsible_name, responsible_email, responsible_phone, notif_low_stock, notif_cash_closing`
*   **cantina_products:** `id, workspace_id, name, description, price, photos (text[]), qty_online, qty_physical, qty_total (GENERATED = online+physical), available_online, archived, display_order, created_at, updated_at`
*   **cantina_orders:** `id, workspace_id, customer_name, customer_phone, items (jsonb), total, status (pending|confirmed|ready|delivered|cancelled|expired), payment_method, payment_status (unpaid|paid), order_type (online|pos), order_number (6-char), expires_at, created_at, updated_at`
*   **cantina_transactions:** `id, workspace_id, type (sale|expense|donation|adjustment|refund), description, amount, payment_method, order_id (fk), created_by, created_at`
*   **cantina_cash_closings:** `id, workspace_id, period_start, period_end, total_sales, total_expenses, total_donations, net, created_by, created_at`

**Storage Buckets:** `cantina-products` (public, product photos), `crie-banners` (public, event banners)
**pg_cron Job:** Runs every minute to expire pending cantina orders past `expires_at`.

---

## 4. Edge Functions Directory (Supabase) ⚡

| Slug | verify_jwt | Purpose |
|---|---|---|
| `whatsapp-webhook` | false | Receives WAHA WhatsApp events |
| `whatsapp-processor` | false | Processes queued WhatsApp messages |
| `whatsapp-flush` | false | Flushes WhatsApp send queue |
| `whatsapp-send` | false | Sends WhatsApp messages via WAHA |
| `whatsapp-auth` | false | WAHA session auth helper |
| `mila-chat` | false | AI response generation (Gemini) |
| `resolve-ticket` | false | Resolves Mila support tickets |
| `send-report-email` | true | Sends weekly lead report via Resend |
| `financial-report-email` | false | Sends CRIE financial report via Resend |
| `broadcast-email` | false | Bulk email sending via Resend |
| `public-report` | false | Generates public report data |
| `batismo-email` | false | Batismo confirmation email |
| `novos-membros-email-confirmed` | false | Novos Membros confirmation email |
| `novos-membros-email-pending` | false | Novos Membros pending notification |
| `trigger-birthdays` | false | Birthday trigger automation |
| `log-deploy` | false | Logs Coolify deployment events |
| `gemini-test` | false | Gemini API test endpoint |
| `connect-sendcontact` | false | CRIE Connect contact send |
| `connect-notify-reviewers` | false | Notifies reviewers of new Connect listings |
| `crie-send-report` | false | Sends CRIE event report via Resend |
| `crie-stripe-connect` | **false** | Validates Stripe SK against API, saves credentials encoded to `workspaces.crie_settings`. Does internal JWT auth via `supabaseAdmin.auth.getUser(token)`. |
| `crie-create-coupon` | true | Creates Stripe discount coupon for CRIE memberships |
| `crie-membership-webhook` | false | Stripe webhook listener: handles `payment_intent.succeeded/failed`, `invoice.payment_succeeded/failed`, `customer.subscription.deleted`. Requires `STRIPE_WEBHOOK_SECRET` env var. |
| `crie-member-welcome` | false | Sends branded HTML welcome email via Resend when a member application is approved. Requires `RESEND_API_KEY` + `APP_FROM_EMAIL` env vars. |

---

## 5. Architectural Invariants & Rules ⚠️

1.  **No Vanilla Breakage:** Features must be built cleanly over the established Vanilla JS + Supabase JS SDK architectures. Do not inject heavy frameworks inside established monolithic dashboard files.
2.  **Front-end Filter Fidelity:** When building exporters (like the CSV download) or charts, they MUST adhere to the globally scoped filtered arrays (e.g., `window._filteredConsolidados`, `window._filteredPublicLeads`) — never bypass visual filters to dump the raw DB.
3.  **Graceful Degradation:** Features reliant on API tokens (WAHA WhatsApp, Resend Emails) must fail gracefully with appropriate user feedback rather than blanking the screen.
4.  **Human Over AI:** "Human Lock" mechanism dictates that AI automation is paused for 30-minutes if a human sends a direct message to a lead inside the Live Chat module.
5.  **Master Admin vs Church Admin:** Certain modules (Deploy, Global Variables, Dev Roadmap full administration, All-Workspaces viewer) must remain hidden from standard or single-church admins.
6.  **QR Code Generation:** Use `api.qrserver.com/v1/create-qr-code/?size=NxN&data=<encoded_url>` as `<img src>`. Do NOT use `QRCode.js` canvas — it is not loaded in the dashboard bundle.
7.  **Cantina Public Page Auth:** `cantina.html` is fully public (no auth). It identifies the workspace via `?ws=<workspace_id>` URL param. The Supabase anon key is safe here as RLS restricts reads to `available_online=true` products.
8.  **Module Lazy Loading Pattern:** All new modules must patch `window.switchTab` via an IIFE in their `hub-<module>.js` file to trigger data loading only when the user navigates to that tab.
9.  **Edge Function EDGE_URL:** Always hardcode `https://uyseheucqikgcorrygzc.supabase.co/functions/v1` when calling Edge Functions from the frontend. **Never derive it from `window.SUPABASE_URL`** — that variable is `const`-scoped inside an IIFE and evaluates to `undefined` at call sites, resulting in a malformed URL that hits local Nginx and returns an HTML 404.
10. **Edge Function JWT:** New Edge Functions that handle sensitive operations should use `verify_jwt: false` + manual validation via `supabaseAdmin.auth.getUser(token)` inside the function body. This avoids Supabase gateway rejecting tokens from local dev environments or clock-skewed clients.
11. **hub-field-input CSS class:** All `<input>`, `<textarea>`, and `<select>` elements inside CRIE modals must use the class `hub-field-input` (defined in `hub.css`). This ensures dark glassmorphism styling (no browser-default white background). Focus state uses gold accent `rgba(245,158,11,0.55)`.

---

## 6. Known Workspaces (Demo/Test)

| Workspace | ID | Notes |
|---|---|---|
| Lagoinha Demo Beta | `dddddddd-0001-0001-0001-000000000001` | Main test workspace. Cantina populated with 5 sample products. |
| Lagoinha Orlando | `9c4e23cf-26e3-4632-addb-f28325aedac3` | Uses "Welcome to the New" label instead of "Start" |
| Lagoinha Porto Velho | `07920b5d-63a2-49d7-bd3b-93a3e887f1e3` | — |
| Lagoinha Braga | `1a638c1c-9da8-40a2-bc40-d9057736ecfb` | — |

---

## 7. Deployment Infrastructure

*   **Frontend + PWA:** Coolify app UUID `k35fyrf6n6q1uanbg7ej8iga` → `https://zelo.7prolabs.com` + `https://crie-app.7prolabs.com`
*   **Backend (FastAPI):** Coolify app UUID `xkvsasmhjv0zyhw1hoko8o75` → `https://api.consolidacao.7pro.tech`
*   **GitHub Repo:** `gtorres7pro/Lagoinha-Consolidacao` (branch `main`)
*   **Supabase Project:** `uyseheucqikgcorrygzc` (us-east-1)
*   **Coolify Panel:** `http://187.77.54.196:8000` (access by IP to avoid DNS issues)

---

## 8. Maintenance Log 🛠️

*   **2026-03-17:** Initial Constitution created based on client discovery.
*   **2026-04-03:** "Chat ao vivo", WhatsApp (WAHA) infra optimizations implemented.
*   **2026-04-04:** Support structure "Mila" created, integrated file upload routing and Dev Roadmap (Tarefas).
*   **2026-04-04:** Rebranding execution: "Lago Hub" fully migrated to "Zelo Pro" visually and conceptually.
*   **2026-04-06:** Cross-Platform UI standardization. "Welcome to the New" dynamic workspace labeling deployed.
*   **2026-04-07:** Replaced erratic email-based reporting with direct, filter-aware CSV Client downloading coupled with highly-polished visual feedback (Confetti) across `dashboard.html` and `relatorio-publico.html`.
*   **2026-04-10:** CRIE module completed — event management, financial reporting, CRIE Connect listings, CRIE Member App PWA deployed at `crie-app.7prolabs.com`.
*   **2026-04-11:** **Cantina module fully implemented.** Dashboard admin (5 tabs: Pedidos, Estoque, Financeiro, POS, Configurar) + public ordering page `cantina.html` with gourmet dark design. DB tables created (`cantina_config`, `cantina_products`, `cantina_orders`, `cantina_transactions`, `cantina_cash_closings`). QR code switched from broken canvas approach to `api.qrserver.com`. Demo Beta workspace populated with 5 sample products. Deployed live.
*   **2026-04-11:** **CRIE Phase 4 — Workshop Admin & Member Management.** 3-tab admin interface (Conteúdos, Playlists, Comentários) with YouTube oEmbed auto-fetch. Member application approval workflow with auto `crie_members` creation. `crie_workshop_comments` table + RLS. Source column added to `crie_members`.
*   **2026-04-11:** **CRIE Phase 5 — Stripe Webhook, Welcome Email, Nav Badge.** Deployed 2 new Edge Functions: `crie-membership-webhook` (Stripe event sync) and `crie-member-welcome` (branded Resend email on approval). Added pulsing red badge to "Membros" nav item, auto-polled every 2 min. DB columns added: `stripe_payment_intent_id`, `stripe_subscription_id`, `paid_at` on `crie_membership_payments`; `stripe_customer_id` on `crie_members`.
*   **2026-04-11:** **CSS premium refinement.** Added `.hub-field-input` class to `hub.css` (dark glassmorphism inputs, gold focus ring). Workshop modals upgraded with animated entry (`wsModalIn`), gold accent top line, and deep shadow. Fixed `hub-field-label` text style.
*   **2026-04-11:** **Bug fix — Stripe Connect 401/HTML error.** Root cause: `window.SUPABASE_URL` was `undefined` → malformed EDGE URL → Nginx returned HTML 404 → `res.json()` threw `Unexpected token '<'`. Fixed by hardcoding the Supabase URL. Also changed `crie-stripe-connect` to `verify_jwt: false` with internal auth to prevent Supabase gateway rejecting valid tokens during local dev.
