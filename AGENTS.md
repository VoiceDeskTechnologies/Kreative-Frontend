## Project workflow

- Keep frontend application code in `frontend/` and backend services in `backend/`.
- Use Bun workspaces and preserve TanStack Start, React, Vite, and the existing browser audio engine.
- Keep DSP and live audio in the browser. Keep privileged provider credentials and operations on the backend.
- Never expose service-role, AI-provider, or PayPal secret values in frontend variables or bundles.
- Do not claim cloud persistence, billing, or AI integration is active until implemented and tested.
