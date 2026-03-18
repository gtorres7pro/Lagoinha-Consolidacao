# Task Plan: Lagoinha Consolidação

## Phase 0: Initialization (Current)
- [ ] Initialize Project Memory Files (task_plan.md, findings.md, progress.md)
- [ ] Initialize gemini.md as the Project Constitution
- [ ] Ask Discovery Questions to the USER

## Phase 1: B - Vision (and Logic)
- [x] Research WhatsApp API providers (Evolution API, etc.) vs N8N.
- [x] Finalize JSON Data Schemas in `gemini.md` for KPIs and Messages.
- [x] Define database tables for multi-tenancy.
- [x] Create UI Mockups/Designs (Aesthetics: Glassmorphism, Dark Mode, Lagoinha colors).



## Phase 2: L - Link (Connectivity)
- [ ] Set up Supabase project for multi-tenant database.
- [ ] Connect Google Sheets API for the birthday checker.
- [ ] Establish WhatsApp API connection (Handshake scripts in `tools/`).
- [ ] Connect Gemini LLM (Handshake scripts in `tools/`).

## Phase 3: A - Architecture (3-Layer Build)
- [ ] **Architecture Layer:** Create POPs for:
    - New Lead ingestion and auto-reply.
    - Daily Birthday check and trigger.
    - LLM human-handover logic.
- [ ] **Navigation Layer:** Implement the "Pilot" logic to route events (Webhooks -> POPs -> Tools).
- [ ] **Tools Layer:**
    - `tools/whatsapp_tool.py`: Send/Receive messages.
    - `tools/sheets_tool.py`: Read birthday list.
    - `tools/llm_tool.py`: Gemini-powered responses with KB context.
    - `tools/db_tool.py`: Deterministic state updates.

## Phase 4: E - Style (Refinement and UI)
- [ ] Refine Payload formatting (Slack blocks, Notion layouts, Email HTML)
- [ ] Implement UI/UX if applicable
- [ ] Present styled results for feedback

## Phase 5: G - Trigger (Deployment)
- [ ] Move logic to cloud production environment
- [ ] Set up execution triggers (Cron, Webhooks, etc.)
- [ ] Finalize Maintenance Log in gemini.md
