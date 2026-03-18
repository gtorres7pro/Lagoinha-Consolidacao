# gemini.md: Lagoinha Consolidação Constitution

## Discovery Answers (2026-03-17)
1. **Guiding Star:** SaaS Dashboard for church consolidation with automated WhatsApp LLM follow-up for new converts and visitors.
2. **Integrations:** Google Drive/Sheets (Birthdays), WhatsApp API (Provider TBD), LLM (Gemini).
3. **Source of Truth:** Workspace-specific forms, Google Sheets, and a central Knolwedge Base for each church.
4. **Delivery Payload:** Web Dashboard (Responsive) with real-time WhatsApp sync.
5. **Behavioral Rules:** 
    - Clean, professional UI.
    - LLM-first interactions with 15-30m human-lock period.
    - Deterministic task cards (AI vs Human).
    - Multi-level access (Master Admin, Church Admin, User).

## Data Schemas (JSON)

### Workspace (Church Settings)
```json
{
  "id": "uuid",
  "status": "draft | active",
  "name": "string",
  "crendentials": {
    "whatsapp_token": "string",
    "google_sheet_id": "string",
    "llm_config": "object"
  },
  "knowledge_base": {
    "events": [],
    "address": "string",
    "pastors": []
  }
}
```

### Lead (Person Card)
```json
{
  "id": "uuid",
  "church_id": "uuid",
  "name": "string",
  "phone": "string",
  "preferred_language": "pt | en | es",
  "type": "saved | visitor",
  "tasks": [
    {
      "task_name": "string",
      "status": "pending | completed",
      "assigned_to": "ai | human",
      "completed_at": "datetime"
    }
  ],
  "last_interaction": "datetime",
  "llm_lock_until": "datetime"
}
```

### Message Log
```json
{
  "id": "uuid",
  "lead_id": "uuid",
  "direction": "inbound | outbound",
  "type": "text | image | audio",
  "content": "string",
  "automated": "boolean",
  "sent_at": "datetime"
}
```

### Statistics (KPIs)
```json
{
  "workspace_id": "uuid",
  "total_leads": "number",
  "ai_messages_sent": "number",
  "human_messages_sent": "number",
  "conversion_rate": "number"
}
```

### App Updates & Feedback
```json
{
  "id": "uuid",
  "type": "update | bug | feature_request",
  "title": "string",
  "description": "string",
  "status": "published | pending | in_progress",
  "attached_files": ["url"],
  "submitted_by": "user_id",
  "created_at": "datetime"
}
```

## Database Schema (Supabase)

### Tables:
1.  **workspaces:** `id, name, status, credentials (jsonb), knowledge_base (jsonb)`
2.  **leads:** `id, workspace_id, name, phone, preferred_language, type, tasks (jsonb), last_interaction, llm_lock_until`
3.  **messages:** `id, lead_id, workspace_id, direction, content, type, automated, created_at`
4.  **app_logs:** `id, type, title, description, status, submitted_by, attachments (text[]), created_at`
5.  **users:** `id, email, role (master_admin | church_admin | user), workspace_id`

## Visual Identity
1. **Primary Palette:** High-contrast Yellow (#FFD700 style) and Black.
2. **Typography:** Bold, geometric sans-serif (e.g., 'Inter', 'Montserrat', or 'Outfit').
3. **Style:** Glassmorphism with Yellow/Black accents. Rounded corners (20px+). High-quality imagery/avatars.
4. **Layout:** Mobile-first approach, card-based task management, "Process Timeline" for leads.

## Behavioral Rules

1. All logic must be deterministic (scripts in `tools/`).
2. Architecture is 3rd Layer A.N.T. (Architecture, Navigation, Tools).
3. No code is written in `tools/` before the JSON Schema is confirmed here.
4. Professional delivery (Styled outcomes).
5. **Human Lock:** AI is paused for 30m if any manual message is sent.

## Architectural Invariants
- Multi-tenant database layout (Row Level Security enabled).
- Cron-based birthday checker (11 AM local).
- LLM response hierarchy: Knowledge Base -> LLM Logic -> Human Escalation.
- All outgoing WhatsApp messages must be logged in the `messages` table.

## Log de Manutenção (Maintenance Log)
- 2026-03-17: Initial Constitution established based on user discovery.

