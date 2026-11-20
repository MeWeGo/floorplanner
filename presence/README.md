# Floor Planner Live Presence Worker

Optional, zero-dependency Cloudflare Worker + Durable Object that broadcasts how many browser tabs currently have **Floor Planner** open.

- **Privacy-first:** Counts open WebSocket connections in memory (`ctx.getWebSockets().length`) using the Durable Objects **WebSocket Hibernation API**. Stores no cookies, user IDs, IP logs, analytics, or floor plan data.
- **Free-tier friendly:** Uses `new_sqlite_classes` (required on Cloudflare's Workers Free plan) and `setWebSocketAutoResponse('ping', 'pong')` so client keepalive pings are answered at Cloudflare's edge without waking the Durable Object.

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
