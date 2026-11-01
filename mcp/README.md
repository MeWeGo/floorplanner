# 🤖 Floor Planner MCP Server

A **zero-dependency** [Model Context Protocol](https://modelcontextprotocol.io/) server (Node.js, stdio) that lets AI agents — Claude Desktop, OpenCode, Cursor, VS Code, … — **create and edit floor plans** for the [Kat Planı Çizici](../index.html) web app.

The server speaks the **same JSON project format** the app imports and exports. There are two ways to use it:

### 1. Live browser mode (recommended)

Your agent starts the bridge; **the app connects to it by itself** — no second URL, no exported files:

```sh
node mcp/bridge.js          # the agent runs this; keep it running
```

```
AI agent                     bridge (localhost)              browser tab (any origin)
─────────                    ───────────────────             ────────────────────────
push_to_browser ───────────▶ /__plan.json ───────SSE──────▶ loadProject()
                                                               │
                                                               └─ autosave ▶ IndexedDB
                                                                               │
your edits ◀─────────────── /__plan.json ◀── autosave hook ◀─────────────────┘
refresh the page  ─────────────────────────────────────────────▶ same plan ✔
```

IndexedDB lives inside a browser **origin**, so a Node process cannot write it directly. The bridge solves that: the app applies pushed plans through its own `loadProject()`, and its autosave then stores them in *whatever origin you are using* — so a refresh shows the change. **The client lives in `app.js`**, so it works on the deployed <https://mewego.github.io/floorplanner/>, on a local `file://` copy, and on the bridge's own page; nothing is injected and no local URL has to be opened. Local edits are pushed back automatically, so `pull_from_browser` starts the agent from your latest work.

- Bind address: `127.0.0.1` only (dev tool — do not expose it).
- Port: `8787` (override with `FP_BRIDGE_PORT`); MCP tools accept a `url` argument or `FP_BRIDGE_URL`.
- Storage note: your projects stay in the origin you already use (Pages or `file://`) — the bridge only exchanges JSON with the page.
- Chrome/Edge may ask once for **local network** permission when a `https://` page talks to `127.0.0.1`. Allow it; only a local server can answer.
- The page retries every 10 s while open, so a tab that was already open picks up a bridge started later.

### Frontend indicator & Ask AI box

Once connected, the app shows a small floating **`AI`** pill (bottom-left, above the footer). It is hidden while offline:

| State | Meaning |
| :-- | :-- |
| 🟢 `AI · rev 12` | SSE connected; the AI is bridged and revision 12 is live |
| (no pill) | No bridge reachable — the ❓ Help / 🤖 AI modal shows the connection steps |

Clicking the pill opens a panel with the bridge status (plan name, revision, connected tabs, last update time) and the pending request list. Its **"How do I connect?"** section is written for non-technical users: it shows a **copy-ready prompt** ("Set up live editing for my floor planner…"), a copy button, and a one-line note that the agent starts the bridge and says which address to open. The raw `node mcp/bridge.js` command stays as a small "prefer to run it yourself" footnote. The same prompt is available in the app's **❓ Help → 🤖 Edit with AI** section, which is part of `app.js` and therefore also works when the app is opened from `file://`.

The **Ask AI** input queues an instruction — for example *"add a 12 m² bathroom with a shower and a toilet"* — through `POST /__requests`. By default it is **not** delivered to the model by itself; the agent reads it when you ask it to ("check the app / any new requests?") via `get_user_requests`, does the work, then calls `ack_user_requests`. Acknowledging clears the row live in the panel (SSE `requests-changed`).

#### Wake the agent (optional)

A web page cannot start a model on its own. If you want the AI pill to be **self-service**, start the bridge with wake enabled:

```sh
FP_WAKE=1 node mcp/bridge.js          # macOS / Linux
$env:FP_WAKE='1'; node mcp/bridge.js  # Windows PowerShell
```

Now `POST /__requests` also prompts the agent's own session, so typing a request in the pill starts a turn and the plan is edited without you repeating it in chat. How it finds the agent:

| Env | Meaning |
| :-- | :-- |
| `FP_WAKE_SESSION` | Pin the OpenCode session id to prompt. Default: the newest session whose `location.directory` is this repo, re-checked on every wake. |
| `FP_WAKE_ORIGINS` | Extra browser origins allowed to wake (comma list). Defaults already include `https://mewego.github.io` and the bridge's own origin. |
| `FP_WAKE_CMD` | Use another agent command instead of OpenCode; the request text is written to its **stdin** and it runs detached in the repo. |
| `FP_OPENCODE_CLI` | Explicit path to `opencode-cli` / `opencode` if it is not found automatically. |

Wake is deliberately gated twice: `FP_WAKE=1` must be set **and** the request must come from an allow-listed origin, so a random website that reaches `127.0.0.1:8787` can only queue a note, never start a turn. `/health` reports `wake`, `wakeAgent` and `wakeSession` so you can confirm it resolved. If the agent is busy, the prompt is queued behind the current turn (`delivery: "queue"`).

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

- [Node.js](https://nodejs.org/) ≥ 16 — for the MCP server and the local bridge. The browser side needs nothing.

## How it works

| | Live editing |
| :-- | :-- |
| Where | any open app tab (GitHub Pages, `file://`, local) |
| How | the agent runs `mcp/bridge.js`; the page connects to it by itself and calls `push_to_browser` / `pull_from_browser` |
| Needs | Node.js + the project folder on the agent's machine |
| Works on GitHub Pages | ✅ — the page stays on Pages, nothing is installed in the browser |

### Flow

The agent runs `node mcp/bridge.js` and the app tab connects automatically; after that, the user types requests in the app's **AI** panel (or in chat) and the agent edits the live plan. Start it with `FP_WAKE=1` (see above) and those requests also wake the agent, so the user does not have to repeat them in chat. The prompt in the AI modal / Help tells the agent exactly what to do.

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
| `add_slab` | Free slab without walls — balcony / terrace / deck (thickness, finish, level offset) |
| `add_void` | Stairwell / shaft / atrium hole in a floor's slab (draw it on the upper floor) |
| `add_text` | Text label |
| `update_object` | Change any property of an object by id |
| `delete_objects` | Delete by id (wall deletion cascades to its openings) |
| `browser_status` | Is the bridge running? Live revision, plan name, connected tabs |
| `push_to_browser` | Show the working project **live** in the open tab(s) + persist to IndexedDB |
| `pull_from_browser` | Load the plan currently in the browser (user's latest edits) |
| `get_user_requests` | Read instructions the user typed into the app's floating **Ask AI** box |
| `ack_user_requests` | Mark those requests handled (by id, or `all: true`) |
| `list_snapshots` | Saved plan versions around every AI edit — use it for "go back" / "undo that" |
| `restore_snapshot` | Put a saved version back (undo for AI edits; the app updates live) |

All coordinates are **centimetres**, **Y axis points down** (screen convention), ids are the 7-char strings shown by `summarize`.

### Saved versions ("go back")

An AI edit replaces the whole plan, so the bridge saves **JSON snapshots** around every agent push — the plan that is about to be overwritten (`before-ai`) and the plan installed (`after-ai`). Files go to `.fp-history/` in the project root (gitignored, `FP_HISTORY=0` disables, `FP_HISTORY_MAX` sets the count, default 60). App autosaves are **not** snapshotted; they are constant and the app already has its own undo stack.

- **Agent:** `list_snapshots` → `restore_snapshot { id }`. Pass a `label` to `push_to_browser` so the rows are readable ("add a bathroom").
- **User, without an agent:** the **AI** pill panel lists the last 8 saves with a ↩ button.
- Every agent push also returns the snapshot id, so an agent can undo its own edit immediately.
- Restoring is a normal new revision (SSE + autosave), and the outgoing plan is snapshotted first, so a restore is itself undoable. History survives a bridge restart (`index.json`).

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
| `bridge.js` | Local HTTP bridge: plan store + SSE + request queue (no injection) |
| `package.json` | Metadata only (no dependencies) |

The browser side lives in `../app.js` (section *AI köprüsü istemcisi*): it probes the bridge, applies pushed plans, mirrors local edits, and renders the `AI` pill / Ask AI box.

## Keeping it in sync

`CATALOG`, `OPENINGS` and `ROOMCOL` at the top of [`server.js`](server.js) are **mirrors of the constants in [`app.js`](../app.js)**, and the object factories mirror `mkWall` / `mkOp` / `mkFurn` / `mkRoom` / `addRectWalls` / `deleteIds`. If you change the data model, catalogue or those functions in the app, update the MCP files to match (and vice versa).
