# 🤖 Floor Planner MCP Server

A **zero-dependency** [Model Context Protocol](https://modelcontextprotocol.io/) server (Node.js, stdio) that lets AI agents — Claude Desktop, OpenCode, Cursor, VS Code, … — **create and edit floor plans** for the [Kat Planı Çizici](../index.html) web app.

The server speaks the **same JSON project format** the app imports and exports. There are two ways to use it:

### 1. Live browser mode (recommended)

Run the bridge, open the app once, and AI edits appear **instantly in the open tab** and **survive a refresh**:

```sh
node mcp/bridge.js          # → open http://127.0.0.1:8787/
```

```
AI agent                     bridge (localhost)              browser tab
─────────                    ───────────────────             ───────────
push_to_browser ───────────▶ /__plan.json ───────SSE──────▶ loadProject()
                                                              │
                                                              └─ autosave ▶ IndexedDB
                                                                              │
your edits ◀─────────────── /__plan.json ◀── autosave hook ◀─────────────────┘
refresh the page  ─────────────────────────────────────────────▶ same plan ✔
```

IndexedDB lives inside a browser **origin**, so a Node process cannot write it directly. The bridge solves that: it serves the app at `http://127.0.0.1:8787/` and injects a small client script (`mcp/bridge-client.js`) on the fly — **`index.html` / `app.js` are not modified** and GitHub Pages is unaffected. The client applies pushed plans through the app's own `loadProject()`, and the app's autosave then stores them in that origin's IndexedDB, so a refresh (or a later visit) shows the change. Local edits are pushed back to the bridge automatically, so `pull_from_browser` starts the AI from your latest work.

- Bind address: `127.0.0.1` only (dev tool — do not expose it).
- Port: `8787` (override with `FP_BRIDGE_PORT`); MCP tools accept a `url` argument or `FP_BRIDGE_URL`.
- Storage note: plans made on `http://127.0.0.1:8787/` live in a **separate IndexedDB origin** from `file:///…/index.html`. Use the bridge URL while working with the AI; export JSON if you want to carry plans between origins.

### Frontend indicator & Ask AI box

The injected client adds a small floating **`AI`** pill to the app (bottom-left, above the footer):

| State | Meaning |
| :-- | :-- |
| 🟢 `AI · rev 12` | SSE connected; the AI is bridged and revision 12 is live |
| ⚪ `AI` | Bridge unreachable (not running / tab opened without the bridge) |

Clicking the pill opens a panel with the bridge status (plan name, revision, connected tabs, last update time) and the pending request list. Its **"How do I connect?"** section is written for non-technical users: it shows a **copy-ready prompt** ("Set up live editing for my floor planner…"), a copy button, and a one-line note that the agent starts the bridge and says which address to open. The raw `node mcp/bridge.js` command stays as a small "prefer to run it yourself" footnote. The same prompt is available in the app's **❓ Help → 🤖 Edit with AI** section, which is part of `app.js` and therefore also works when the app is opened from `file://`.

The **Ask AI** input queues an instruction — for example *"add a 12 m² bathroom with a shower and a toilet"* — through `POST /__requests`. It is **not** delivered to the model by itself; the agent reads it when you ask it to ("check the app / any new requests?") via `get_user_requests`, does the work, then calls `ack_user_requests`. Acknowledging clears the row live in the panel (SSE `requests-changed`).

The panel is bilingual (`tr`/`en` via the app's `L()`) and follows the dark/light theme.

### 2. File mode

```
AI agent                          You (in the app)
─────────                         ─────────────────
add_rect_walls / add_wall            │
add_opening (door / window)          │
add_furniture / add_room             │
save_project ──── plan.json ────► 📂 Aç (File ▸ Open JSON)
                                     │ edit visually, 3D, export PNG…
⬇ JSON export ─── plan.json ────◄   │
load_project                         │
```

## Requirements

- [Node.js](https://nodejs.org/) ≥ 16 (no `npm install` — there are no dependencies; Node ≥ 18 also gives the MCP server global `fetch`-free HTTP via `http`)

## Tools exposed

| Tool | What it does |
| :-- | :-- |
| `new_project` | Start an empty project (name, grid, wall thickness/height) |
| `load_project` / `save_project` | Read / write the app's `.json` project files |
| `get_project` / `set_project` | Get or replace the full working project JSON |
| `summarize` | Floors, wall ids & lengths, openings, room areas, furniture — with ids |
| `list_catalog` | Furniture catalogue + door/window presets with ids and sizes |
| `add_floor` | New floor, returns its index |
| `add_wall` | One wall (cm, Y-down, solid or curtain) |
| `add_rect_walls` | Rectangle of 4 walls, optional room polygon inside |
| `add_opening` | Door/window on a wall (parametric `d` from wall end A) |
| `add_furniture` | Catalogue item at x,y with rotation |
| `add_room` | Room polygon (name, color, wood/tile/carpet pattern) |
| `add_text` | Text label |
| `update_object` | Change any property of an object by id |
| `delete_objects` | Delete by id (wall deletion cascades to its openings) |
| `browser_status` | Is the bridge running? Live revision, plan name, connected tabs |
| `push_to_browser` | Show the working project **live** in the open tab(s) + persist to IndexedDB |
| `pull_from_browser` | Load the plan currently in the browser (user's latest edits) |
| `get_user_requests` | Read instructions the user typed into the app's floating **Ask AI** box |
| `ack_user_requests` | Mark those requests handled (by id, or `all: true`) |

All coordinates are **centimetres**, **Y axis points down** (screen convention), ids are the 7-char strings shown by `summarize`.

## Configure your client

### OpenCode

Already committed in [`../opencode.jsonc`](../opencode.jsonc). Or add it yourself:

```sh
opencode mcp add floorplanner -- node mcp/server.js
```

### Claude Desktop

`claude_desktop_config.json` (Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "floorplanner": {
      "command": "node",
      "args": ["D:\\path\\to\\floorplanner\\mcp\\server.js"]
    }
  }
}
```

### Cursor / VS Code (`.cursor/mcp.json` or `.vscode/mcp.json`)

```json
{
  "mcpServers": {
    "floorplanner": {
      "command": "node",
      "args": ["mcp/server.js"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

## Try it from the terminal

A round-trip without any AI client:

```sh
node mcp/bridge.js &                 # start the bridge (keep it running)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node mcp/server.js
```

Or ask an agent: *"Load plan.json, add a 3×4 m bathroom with a toilet and a shower, then push it to my browser."*

## Files

| File | Purpose |
| :-- | :-- |
| `server.js` | MCP stdio server (JSON-RPC 2.0, hand-rolled) |
| `bridge.js` | Local HTTP bridge + app server with script injection |
| `bridge-client.js` | Injected in the app page: apply pushed plans, push local edits, AI pill + Ask AI box |
| `package.json` | Metadata only (no dependencies) |

## Keeping it in sync

`CATALOG`, `OPENINGS` and `ROOMCOL` at the top of [`server.js`](server.js) are **mirrors of the constants in [`app.js`](../app.js)**, and the object factories mirror `mkWall` / `mkOp` / `mkFurn` / `mkRoom` / `addRectWalls` / `deleteIds`. The bridge client hooks `loadProject()` / `autosave()` / `templatesModal()` by name. If you change the data model, catalogue or those functions in the app, update the MCP files to match (and vice versa).
