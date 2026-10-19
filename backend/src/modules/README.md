# Backend module layout

Feature folders are reserved for incremental, tested implementations:

- `auth/` — Supabase token verification and authorization
- `projects/` — project persistence and ownership checks
- `assets/` — signed upload/download authorization
- `ai/` — validated OpenAI/Gemini chat adapters and allowlisted mix-plan schemas
- `plugins/` — shared plugin registry and plan validation
- `billing/` — PayPal order verification and entitlements
- `usage/` — server-side usage accounting
- `exports/` — export coordination and metadata
- `webhooks/` — signature verification and idempotent event handling
- `admin/` — restricted administration

The AI chat/status routes are implemented when a provider is configured. Chat requests send project metadata and file statistics only; raw audio is not accepted. Supabase authentication and persistence, private Storage flows, payment verification, usage accounting, exports, and signed webhooks are still unimplemented.
