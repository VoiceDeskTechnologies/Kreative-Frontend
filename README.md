# KREATIVE AI Mixing & Mastering

KREATIVE is a browser-based DAW in a Bun workspace. Its existing TanStack Start, React, and TypeScript application lives in `frontend/`; the separately deployable API foundation lives in `backend/`.

## Repository layout

- `frontend/` — DAW UI, Web Audio engine, Vite/TanStack Start config, and Vercel deployment output.
- `backend/` — Fastify API, environment validation, health/readiness/version/docs routes, and Render deployment config.
- `supabase/migrations/` — versioned profiles, entitlements, payments, and audit-log schema.

## Requirements and local development

- Bun 1.4 or newer
- Node.js 24 or newer
- A modern desktop browser with Web Audio API support

Install from the repository root:

```powershell
bun install
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

No cloud credentials are required to run the current local demo. Start the DAW and API in separate terminals:

```powershell
bun run dev
bun run dev:backend
```

Or run both workspace development processes together:

```powershell
bun run dev:all
```

The frontend uses port `3000` by default; the API uses port `3001`. Check API liveness and readiness at `http://localhost:3001/health` and `http://localhost:3001/ready`.

## Auth, admin, and one-time billing setup

Account, pricing, and checkout open as overlays inside the DAW. Apply the SQL
in `supabase/migrations/` before enabling cloud persistence. Put
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the
backend environment only, and configure `ADMIN_EMAILS` there as a
comma-separated list of verified administrator email addresses. An empty value
grants no admin access.

PayPal uses one-time Orders API purchases rather than recurring plans. Keep
`PAYPAL_ENABLED=false` until sandbox order creation, capture verification,
webhook signature validation, and idempotent entitlement fulfillment have been
tested. The backend owns prices: K-GO is $39.95 for 3 renders and K-PRO is
$59.95 for 6 renders, each for one month without automatic renewal. The
current checkout entry point reports provider configuration and does not claim
payment success before server-side capture verification is implemented.

## Browser mixer and processing

Track processing runs locally through the browser audio engine. The mixer includes adjustable channel faders, pan, meters, EQ, dynamics, modulation, sends, saturation, and circuit-inspired tube/amp voicings with cabinet filtering. Factory presets reset the track processing chain before applying their settings so they remain distinct and repeatable.

The mixer insert rack provides ten slots per track in two five-slot columns. Slots select from the browser's supported processor blocks; one instance of a processor block is supported per track. Every plugin window has an Active/Bypass button that preserves its settings and bypasses only that processor family in the live browser engine. Dynamics includes the original K-2A optical-style leveler and K-76 FET-style peak compressor names, with live threshold, ratio, attack, release, knee, makeup, blend, gain-reduction metering, and model-specific factory voicings. K1-Imager is an original stereo utility with mid/side width, balance, rotation, mono blend, stereo-field visualization, and translation-focused presets. Every plugin has source-oriented factory presets grouped by vocals, drums, instruments, and bus/general use, plus user presets saved in browser-local storage. Presets are original starting points, not copied commercial preset libraries; compare at matched loudness and adjust to the recording. The vocal-cleanup EQ starting point applies an 80 Hz high-pass with restrained low-mid cleanup; source material may need a different cutoff. Parametric EQ supports up to eight draggable, independently selectable bands with optional per-band dynamic attenuation. Right-click a graph node or enable Dynamic EQ in its band controls. The four-band console EQ has its own fixed-band controls. Smoothen is an original automatic level-riding processor with target, range, floor, response, and blend controls. KREATIVE Pitch provides original monophonic pitch correction with key/scale, retune speed, humanize, note range, transpose, reference, and blend controls; it is not a clone of a commercial pitch plugin and does not preserve formants.

## Template library

The template library is available from the wand button in the DAW toolbar. It
contains 38 versioned definitions across vocal, vocal-support, stereo
two-track, full-mix, and mastering categories. Every definition validates its
plugin references, processor-family ordering, insert limit, and parameter keys
against the existing KREATIVE registry at module load time. Applying a template
replaces the selected track's chain only after confirmation when inserts already
exist.

The mixer keeps three responsibilities separate:

- `template-engine.ts` compiles a declarative template track into an ordered,
  ten-slot insert plan with starting parameters and bypass state.
- `audio-analysis.ts` measures browser `AudioBuffer` data and turns those
  measurements into explicit clipping, headroom, dynamics, compression, level,
  and DC-offset issues. It does not make processing changes.
- `ai-mix-controller.ts` validates AI actions against the supported plugin
  registry and current tracks before mutation, and provides the progress text
  explaining each supported change. The provider chooses a plan; the browser
  controller is the final safety boundary.

The current DAW model exposes independent audio-track inserts but not separate
vocal, beat, effect-send, or master-bus objects. Consequently, full-mix and
mastering templates currently apply their starting chain to the selected track
and show an explicit limitation notice; they do not pretend to create routing
that the engine cannot represent. The definitions are structured to support
future bus routing without changing their IDs or versions.

## Track routing and sends

Routing is controlled from the mixer strips, not the AI assistant sidebar.
Audio tracks expose a dedicated S1-S10 bus/send rack beside their processor
inserts. Clicking a send opens a floating fader where its destination and live
level can be changed from `-60 dB` to `+6 dB`. The `I/O` button on each strip
opens the output selector for Master or another track/bus. These controls update
the live Web Audio graph, so the receiving track's actual insert chain processes
the routed signal. Feedback-loop routes are rejected.

`+ Bus` creates a mixer bus with the same ten processor insert slots. Buses can
receive audio-track sends and route their processed output onward. Bus tracks
use a silent source buffer because their signal is supplied by routed sends.
Audio tracks retain their ten processor inserts; their additional ten slots are
dedicated to sends and buses.

## Workspace zoom and panel layout

The transport includes timeline zoom controls from 25% through 400%. Zoom
changes the horizontal editing workspace without changing audio timing.

The transport also shows a musical key selector and BPM field, defaulting to
`C` and `120.00 BPM`. Grid snapping uses the BPM value to calculate the
selected note division.

The mixer header includes a detach control and size selector. Detached mixers
can be dragged by their header and resized to 25%, 50%, 75%, or 90% of the
viewport width, with an expanded height for longer faders. The same control
docks the mixer back into the workspace.

The plugins, analysis, and AI assistant panel can be collapsed with the
right-pointing control. When collapsed, a left-pointing edge control restores
the panel.

## Empty tracks and recording

`+ Audio` in the track header creates an empty audio track immediately; it does
not open a file picker. Each audio track has an upload icon for replacing its
content, and audio files can be dragged directly onto that track. Select an
empty track and press the main Record control to capture into it. While
recording, the track displays a live peak waveform that updates from the
microphone analyser. Stopping the recording replaces the temporary silent
buffer with the decoded recording on that same track, preserving its inserts,
routing, sends, and mixer settings.

## Grid editing

The GRID selector beside the transport supports Free, 1/2, 1/4, 1/8, 1/16,
and 1/32 note divisions at the current 120 BPM timebase. In Free mode, split
points and clip moves use the smallest pointer-derived time available. In a
grid mode, split points snap to the selected division and dragging a clip in
the workspace snaps its start position to the same division. Clips can be dragged from one audio track row to another; the destination keeps
its existing audio and the dropped audio is joined into it at the snapped drop
position. The source becomes an empty track after the move. Bus tracks are not
valid audio clip destinations.

Tube and amplifier voicings are lightweight browser DSP approximations, not captures or verified emulations of specific hardware. Compare at matched loudness and use the output trim to preserve headroom.

## Commands

Run from the repository root:

```powershell
bun run build
bun run build:frontend
bun run build:backend
bun run typecheck
bun run test
bun run lint
```

The backend starts from its compiled output with `bun run start:backend`.

## Environment variables

Copy the example files to `.env` files for local development. Example files contain names and safe blank/default values only:

- [`frontend/.env.example`](./frontend/.env.example) — browser-visible configuration. `VITE_*` values are public and must never contain secrets.
- [`backend/.env.example`](./backend/.env.example) — API runtime, exact CORS origins, Supabase server credentials, AI provider selection, and PayPal settings.

`PAYPAL_ENABLED=false` remains the safe payment default. The example backend
configuration is set to `AI_PROVIDER=gemini` with Gemini 3.8 Flash for both
structured mix plans and consent-gated audio analysis. Set `GEMINI_API_KEY` in
the backend environment; optionally override `GEMINI_MODEL` or
`GEMINI_AUDIO_MODEL`. Use `AI_PROVIDER=none` when running without a provider.
The first assistant request analyzes browser audio through Gemini; follow-up
mix requests reuse the cached analysis until the source audio changes. Keep AI
keys, the PayPal client secret, Supabase service-role key, and all other
privileged values exclusively in Render's environment settings. Do not commit
`.env` files.

## Deploy frontend to Vercel

1. Import the repository in Vercel and set the project root directory to `frontend/`.
2. Use Bun as the package manager and Node.js 24 or newer. Keep dependency installation at the workspace root so Bun can read the root lockfile and link the frontend workspace.
3. Use `bun install --frozen-lockfile` for install and `bun run build` for the build from the frontend project root.
4. Allow the Nitro Vite plugin to select its Vercel preset in the Vercel build environment. To verify locally in PowerShell:

   ```powershell
   $env:NITRO_PRESET = "vercel"
   bun run build
   Remove-Item Env:NITRO_PRESET
   ```

5. Set the public frontend variables from `.env.example` (the frontend project root) in Vercel. Use the deployed Render API URL for `VITE_API_BASE_URL` once the API features are implemented.

The DAW can run without a Render API or Supabase credentials. AI chat requires the backend and a configured provider; the browser sends only chat text and track names, mixer settings, insert names, and measured file statistics after the user consents. Raw audio stays in the browser. The assistant returns schema-validated, allowlisted mix actions that the frontend applies in sequence and can undo as a plan. It cannot hear the audio, so it must not claim to have listened or infer musical key/pitch from file statistics. Artist references are translated into broad mix attributes rather than imitated. The AI endpoint has per-IP rate limiting but no user authentication yet; do not expose provider-backed chat publicly until the API has an appropriate authentication layer.

## Deploy API to Render

The root [`render.yaml`](./render.yaml) blueprint configures one Node 24 web service from the workspace root. Render installs Bun, installs the workspace lockfile, builds `@kreative/backend`, starts the compiled API, and checks `/health`.

1. Create the Render service from the blueprint.
2. Set `CORS_ALLOWED_ORIGINS` to the exact HTTPS origin of the deployed Vercel app (no wildcard).
3. Keep optional provider credentials unset unless you intend to enable their implemented server-side features.
4. Check `/health`, `/ready`, `/version`, and `/docs` after deployment.

The backend serves health, readiness, version, API-description, and AI chat/status routes. `/ready` separately reports whether integrations are configured and implemented.

## Supabase, PayPal, and AI status

Supabase authentication, SQL schema/RLS policies, private Storage upload flows, PayPal order verification, webhook processing, and entitlement management remain to be implemented. The AI chat route is rate-limited per client IP, but user authentication is not yet implemented; protect the API appropriately before exposing provider-backed chat publicly. The AI provider receives user text and project metadata only, never audio files.

Use `supabase/migrations/` for SQL migrations. Never place a service-role key, AI API key, or PayPal secret in `frontend/.env`, Vercel client variables, or browser code.

The admin console requires the `202610170002_admin_console.sql` migration in
addition to the billing migration. It creates the admin-managed projects,
support tickets, settings, and pricing-plan tables. The service-role key is
used only by the backend admin routes; the browser receives filtered,
schema-shaped responses after administrator authorization.

Support tickets and unread badges work with the same migration. To enable
admin replies by email, configure both `RESEND_API_KEY` and
`SUPPORT_EMAIL_FROM` in the backend environment. Ticket replies are rejected
with an explicit configuration error until both values are present; the
application never reports an email as delivered when no mail provider is
configured.

## Deployment smoke checks

- Vercel production build serves `/` and supports direct reloads.
- Render `/health` returns 200 and `/ready` accurately reports integration state.
- Render CORS allows the Vercel origin and omits untrusted origins.
- Production API startup rejects localhost CORS configuration.
- After the relevant integrations are implemented: test Supabase RLS isolation and private asset URLs, PayPal sandbox and verified webhook replay, and AI provider failure/consent behavior.
