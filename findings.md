## Research Findings
- Initial project structure created based on VLAEG protocol.
- **Project Type:** SaaS Dashboard for Church Consolidation (Lagoinha Consolidação).
- **Core Requirements:**
    - Responsive Dashboard (Desktop/Mobile).
    - Forms for "Saved" and "Visitors".
    - Follow-up cards (CRM-style) for task management.
    - WhatsApp Integration: LLM automated messages, birthday alerts (Google Sheets at 11am), and human inbox.
    - LLM features: Context-aware responses, 15-30m "human-lock" after manual intervention, Knowledge Base for church details.
    - Multi-tenancy: Master Admin, Church Admin, Team levels, Workspace configuration (draft/active).
    - KPIs: Stats on AI vs Human tasks, message counts by category.

## Discoveries & Constraints
- The project follows the 3-layer A.N.T. architecture (Architecture, Navigation, Tools).
- Database: Needs multi-tenant support (likely Supabase given the MCP available).
- WhatsApp: Comparison between Evolution API and N8N:
    - **Evolution API:** Best for direct programmatic control (REST API), supports both unofficial (Baileys) and official Cloud API. Highly recommended for the "Tools Layer" of this project.
    - **N8N:** Best for workflow orchestration. While powerful, this project's A.N.T. architecture favors Python-based deterministic control.
    - **Decision:** Recommended to use **Evolution API** (v2) for its robust REST interface and native support for various providers.
- Logic: Daily 11 AM cron job for birthdays.
- **Visual Identity Findings:**
    - Source: Lagoinha Orlando Church website screenshots.
    - Core Colors: Vibrant Yellow (Primary), Black (Secondary), White (Background/Text contrast).
    - Aesthetic: High-contrast, modern, "clean-cut" but using the soft layouts from the user's "example" screenshot (glassmorphism/rounded cards).
    - Typography: Needs to be bold and sans-serif (Outfit or Montserrat recommended).

