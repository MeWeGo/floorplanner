# Floor Planner Live Presence & Collaboration Worker

Optional, zero-dependency Cloudflare Worker + Durable Objects that power:

1. **`PresenceRoom` (`/ws`, `/count`):** broadcasts how many people currently have **Floor Planner** open: open sockets, with tabs of the same browser counted once (the app sends a random anonymous `?d=` id kept in `localStorage['fp_dev']`; the Worker keeps it only in the socket's attachment; sockets without one count on their own) using the Durable Objects **WebSocket Hibernation API**. Stores no cookies, user IDs, IP logs, analytics, or floor plan data.
2. **`CollabRoom` (`/collab/<roomId>`):** per-room Durable Object relay for simultaneous real-time editing (object-level patches, live cursors, selection highlights, drag ghosts, view-only links via `?v=<viewToken>`, background/texture asset sync up to 400 KB, and follow mode). Ephemeral by default (room state stays in memory while connected and clears when the last participant leaves), with optional editor-toggled room persistence (`ctx.storage`).
- **Free-tier friendly:** Uses `new_sqlite_classes` (migrations `v1` and `v2`, required on Cloudflare's Workers Free plan) and `setWebSocketAutoResponse('ping', 'pong')` so client keepalive pings are answered at Cloudflare's edge without waking the Durable Object.

## Deploy (3 steps)

1. Deploy from this folder with Wrangler (creates a `*.workers.dev` endpoint on your free Cloudflare account):

   ```bash
   cd presence
   npx wrangler login
   npx wrangler deploy
   ```

2. Copy the deployed URL printed by `wrangler deploy` (for example `https://floorplanner-presence.<your-subdomain>.workers.dev`) and set `PRESENCE_URL` in `app.js`:

   ```js
   const PRESENCE_URL = 'wss://floorplanner-presence.<your-subdomain>.workers.dev/ws';
   ```

   (`https://...` also works — the client converts it to `wss://.../ws` automatically.)

3. Verify the deployed endpoint:

   ```bash
   curl https://floorplanner-presence.<your-subdomain>.workers.dev/count
   # -> {"online":0}
   ```

## Local testing

1. Start the Worker locally with your local static server origin allowed:

   ```bash
   cd presence
   npx wrangler dev --var ALLOWED_ORIGINS:http://127.0.0.1:8080
   ```

2. Serve the repository root (e.g. `python -m http.server 8080` or `npx serve`) and open:

   ```
   http://127.0.0.1:8080/?presence=ws://127.0.0.1:8787/ws
   ```

   Open a second tab to watch the footer badge climb from `1` to `2` in real time.

## Notes & URL overrides

- **Free tier limits:** Cloudflare Workers Free includes 100,000 requests/day across the account. Outbound broadcasts and edge-handled `'ping'`/`'pong'` heartbeats do not wake the Durable Object or count against daily requests.
- **Origin restriction:** `ALLOWED_ORIGINS` in `wrangler.toml` defaults to `https://mewego.github.io`. Add a comma-separated origin if you host a custom domain or fork.
- **Opt-out / testing overrides:**
  - `?presence=off` disables the live presence socket for that tab (used by `tests/browser-smoke.js`).
  - `?presence=ws://...` or `?presence=wss://...` overrides `PRESENCE_URL` for testing (works on `localhost` and `file://` too; by default local hosts skip `PRESENCE_URL`).
  - `?collab=off` disables live collaboration sockets; `?collab=ws://127.0.0.1:8787` overrides the collaboration server URL for local `wrangler dev` testing (`http://127.0.0.1:8080/?collab=ws://127.0.0.1:8787`).
