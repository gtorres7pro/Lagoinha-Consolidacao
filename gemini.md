# Zelo Pro (formerly Lagoinha Consolidação) Constitution & Blueprint

## Document Scope (Last Updated: 2026-04-07)
This file represents the absolute source of truth for the **Zelo Pro** platform. It documents structural logic, behavioral rules, UI/UX aesthetics, database schema expectations, and core functional invariant features implemented.

---

## 1. Core Platform Overview 🌟
*   **Guiding Star:** A comprehensive, multi-tenant SaaS Dashboard tailored to church consolidation, visitor tracking, and member lifecycle management (Start, Batismo, Novos Membros), augmented with AI and WAHA-based WhatsApp automation.
*   **Target Audience:** Church administration, Master Admins (Zelo Support), and Church Operators (Users).
*   **Visual Identity:** 
    *   **Colors/Aesthetics:** Premium Glassmorphism. Dark mode primary. High-contrast Yellow (`#FFD700`) and Black branding. Smooth interactions, gradient highlights.
    *   **Typography:** Bold, modern sans-serif (Outfit, Inter, or Montserrat).
    *   **UI Elements:** Card-based UI, mobile-responsive layout, inline-editable task controls, active tag filtering overlays.
*   **Stack:** Vanilla JS, HTML/CSS on the Frontend. Supabase (Auth, PostgreSQL DB, Storage, Edge Functions) as the robust Backend-as-a-Service, optionally interfacing with WAHA (WhatsApp API) or FastAPI.

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

---

## 3. Database Schema Mapping (Supabase) 🗄️

*All tables employ Row Level Security (RLS) bound to `workspace_id` except for Master Admin override policies.*

### Key Tables
*   **workspaces:** `id, name, status, credentials (json), knowledge_base (json)`
*   **leads:** `id, workspace_id, name, phone, email, type (saved|visitor), tags (jsonb), batizado, culto, decisao, etc.`
*   **app_logs / tickets:** `id, workspace_id, type (bug|feature), status, description, attachments (text[]), public_roadmap (boolean)`
*   **tasks:** Universal tasks table. `id, workspace_id, lead_id, task_title, status, due_date, context`
*   **messages:** `id, workspace_id, lead_id, direction, content, type (text|audio|image|template), automated, created_at`
*   **start_participants:** `id, workspace_id, name, email, phone, source`
*   **start_progress:** `participant_id, lesson_number, status, timestamp`

---

## 4. Architectural Invariants & Rules ⚠️

1.  **No Vanilla Breakage:** Features must be built cleanly over the established Vanilla JS + Supabase JS SDK architectures. Do not inject heavy frameworks inside established monolithic dashboard files.
2.  **Front-end Filter Fidelity:** When building exporters (like the CSV download) or charts, they MUST adhere to the globally scoped filtered arrays (e.g., `window._filteredConsolidados`, `window._filteredPublicLeads`) — never bypass visual filters to dump the raw DB.
3.  **Graceful Degradation:** Features reliant on API tokens (WAHA WhatsApp, Resend Emails) must fail gracefully with appropriate user feedback rather than blanking the screen.
4.  **Human Over AI:** "Human Lock" mechanism dictates that AI automation is paused for 30-minutes if a human sends a direct message to a lead inside the Live Chat module.
5.  **Master Admin vs Church Admin:** Certain modules (Deploy, Global Variables, Dev Roadmap full administration, All-Workspaces viewer) must remain hidden from standard or single-church admins.

---

## 5. Maintenance Log 🛠️

*   **2026-03-17:** Initial Constitution created based on client discovery.
*   **2026-04-03:** "Chat ao vivo", WhatsApp (WAHA) infra optimizations implemented.
*   **2026-04-04:** Support structure "Mila" created, integrated file upload routing and Dev Roadmap (Tarefas).
*   **2026-04-04:** Rebranding execution: "Lago Hub" fully migrated to "Zelo Pro" visually and conceptually.
*   **2026-04-06:** Cross-Platform UI standardization. "Welcome to the New" dynamic workspace labeling deployed.
*   **2026-04-07:** Replaced erratic email-based reporting with direct, filter-aware CSV Client downloading coupled with highly-polished visual feedback (Confetti) across `dashboard.html` and `relatorio-publico.html`.

