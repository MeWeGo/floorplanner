<div align="center">

# 📐 Floor Planner · Kat Planı Çizici

### Interactive 2D / 3D Floor Planner — runs entirely in your browser

**No install · No build · No backend · No account**

[**🚀 Live Demo**](https://mewego.github.io/floorplanner/) · [**📦 Repository**](https://github.com/MeWeGo/floorplanner) · [**🐞 Issues**](https://github.com/MeWeGo/floorplanner/issues)

![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-f7df1e?logo=javascript&logoColor=black)
![Three.js](https://img.shields.io/badge/3D-Three.js_r128-black?logo=threedotjs)
![Storage](https://img.shields.io/badge/Storage-IndexedDB_+_JSON-6366f1)
![Hosting](https://img.shields.io/badge/Hosting-GitHub_Pages-222?logo=github)
![UI](https://img.shields.io/badge/UI-English_%7C_Türkçe-10b981)

</div>

---

## 🔗 Quick Links

| | |
| :-- | :-- |
| **Live app** | <https://mewego.github.io/floorplanner/> |
| **Source code** | <https://github.com/MeWeGo/floorplanner> |
| **Developer / AI-agent guide** | [`AGENTS.md`](AGENTS.md) |
| **AI / MCP server** | [`mcp/README.md`](mcp/README.md) |
| **Original prototype** | [`legacy-index.html`](legacy-index.html) |

> **Bilingual UI (English & Turkish):** Automatically detects your browser language (`en` / `tr`) on first visit, and lets you switch anytime with the **🌐 EN / TR** button in the top bar.

---

## ✨ Features

### 🧱 Drawing
- **Free-form walls** with live length + angle read-out; type a number and press `Enter` for an exact length.
- **Room-from-rectangle** tool (4 walls + room in one drag).
- **Automatic room detection** — click inside any closed area and get its polygon, area (m²) and perimeter.
- **Polygon room** tool for irregular spaces.
- **Adjustable-angle (hinged) walls** — fix a wall at either endpoint (`Point A` or `Point B`), define **3 (or any number of) angle positions**, add or delete positions, adjust angles via the on-canvas rotation handle (`wrot`) or numeric inputs, and **click the wall in 2D or 3D** to cycle through `Position 1 → Position 2 → Position 3`.
- Wall endpoints stay **connected** when you drag a wall or a corner.
- **Wall types** — every wall can be 🧱 **Solid** (default) or 🪟 **Curtain Wall**: a glass facade with an aluminium frame and mullions (~1.2 m modules), drawn with a glass band in 2D and built as translucent glass panels with rails in 3D. Doors and windows still cut curtain walls normally.

### 🧲 Grids & Snapping
| Grid type | Description |
| :-- | :-- |
| ⊞ **Square** | Classic architectural grid, 15° angle snap |
| △ **Triangle (60°)** | Isometric / equilateral lattice, 30° angle snap |
| ⁙ **Dots** | Dot-matrix grid |
| ∅ **Off (free draw)** | No grid, no step rounding |

- **Step presets:** 5 cm · 10 cm · 25 cm · 50 cm · **1 m · 3 m · 5 m** · **Custom…** (any value, 1–10 000 cm).
- Snap to wall ends and room corners. Toggle snapping with `G`, or hold `Shift` for a temporary override.

### 🚪 Objects
- **7 door / window types** (single, double, sliding, opening, window, wide window, small window) that snap onto walls with hinge-side and swing-direction controls.
- **Click a door to open / close it (90° / slide)** — works in 2D and in the 3D view; hinged doors swing 90° with a visible dashed arc, sliding doors slide horizontally.
- **~48 furniture & structure items** in 6 categories with search (living, bedroom, kitchen, bath, office, structure & outdoor — stairs, columns, trees, pool…).
- Furniture **magnets to walls** and rotates to face the room.
- **Group objects** — select 2+ items (walls, rooms, furniture, texts, dimensions) and press **Group** (or `Ctrl+G`); grouped items select, move and rotate together, `Ctrl+Shift+G` ungroups. Drag the group rotation handle or use `[` / `]` to turn the whole layout around its centre without breaking wall corners.
- **Adjustable layouts (1a / 1b / 1c)** — with a group or a room selected, press **🔄 Make Adjustable** to snapshot the current layout; rearrange, press **➕ New** to save more layouts, then simply **click the room / group on the canvas to cycle** through them (1a → 1b → 1c → 1a). Room variants move the furniture inside; group variants move every member — walls, room shapes and all.
- **Connected-wall dragging** — dragging a wall keeps neighbouring wall ends glued so corners stay closed; uncheck **Connected walls** in the footer (or hold **Alt** while dragging) to move a wall independently.
- **Room drag moves contents** — dragging a single room takes the furniture and text labels inside it along (the panel's X/Y fields behave the same); room resize only reshapes the polygon.
- Resize / rotate with on-canvas handles; edit numeric properties in the side panel.
- Dimension lines, text labels, and live wall-length labels.
- **✏️ Pen tool** — freehand sketches anywhere on the plan: hold and drag to draw any shape, arrow or note stroke; the stroke is simplified to few points, and you can move it, restyle it (stroke width & color in the side panel), copy/paste or delete it like any object. Shown as a line on the floor in 3D and included in SVG/PNG/PDF exports.

- **⬡ Shape tool (`S`)** — draw anything the catalogue doesn't have: **triangle**, **quad**, **N-gon** (3–24 sides, adjustable in the top bar), **circle/ellipse** (drag corner to corner) or **freeform** (hold-drag-release). Two modes: **Object** creates a nameable custom item (move/rotate/resize like furniture, extruded in 3D); **Walls** draws the same outline as real walls you can attach doors to and auto-detect a room inside. Press **💾 Save shape to library** in the side panel to name it and reuse it from the **⬡ My Shapes** library category (✕ removes a saved shape).

### 🏢 Project Tools
- **Multiple floors** — add, duplicate, rename, delete; the floor below is shown faintly for alignment.
- **Background image** import with **on-canvas drag & corner/edge resize**, numeric `X / Y / W / H / Opacity` inputs, **position lock**, and a **scale-calibration** tool (click two known points, enter the real distance).
- Layer visibility toggles, floor patterns (wood, tile, carpet), room colors.
- Unlimited **undo / redo**, copy / paste / duplicate, box & multi-select with a **box-select scope** (All / Walls / Furniture) in the footer.
- Starter templates: Blank · Studio 1+0 · 2+1 Apartment · Office.

### 💾 Storage — fully local
| Layer | Used for |
| :-- | :-- |
| **IndexedDB** (`FloorPlannerDB`) | Background autosave + named projects with live SVG thumbnails — hundreds of MB capacity |
| **JSON files** | Backup, sharing, moving between machines (`⬇ JSON` / `📂 Aç`) |
| `localStorage` | Theme & language preferences only (legacy data is auto-migrated to IndexedDB) |

### 📤 Export
- **PNG**, **SVG**, and **PDF / Print** (A4 landscape) with title block and scale bar.
- Exports always render on **white paper** regardless of the editor theme.

### 🤖 AI Integration

Let an AI agent edit the plan for you. It uses the optional MCP server (`mcp/server.js`, 21 tools, Node ≥ 16): your agent starts `node mcp/bridge.js`, and **the page you already have open connects to it automatically** — the deployed GitHub Pages tab, a `file://` copy, or a local one. AI edits then appear instantly in that tab and autosave to its IndexedDB, so a refresh keeps them; the agent can pull your own edits back. Nothing is injected and you never open a second URL. In Chrome/Edge the first connection may ask once for **local network** permission (allow it — only a local server can answer).

**Getting started:** open **🤖 AI** in the top bar (or **❓ Help**) and press **📋 Copy agent prompt**, then paste it into OpenCode / Claude Desktop / Cursor. The agent sets everything up; after that you just type what you want.

**Frontend indicator:** while connected, a floating **AI** pill shows the live plan revision. Click it for bridge details and an **Ask AI** box — type *"add a 12 m² bathroom with a shower"* and the agent can pick it up with `get_user_requests` (then mark it done with `ack_user_requests`).

Tools: `new_project` · `load_project` / `save_project` / `get_project` / `set_project` · `add_wall` / `add_rect_walls` · `add_opening` · `add_furniture` · `add_room` · `add_text` · `update_object` / `delete_objects` · `add_floor` · `summarize` / `list_catalog` · `browser_status` / `push_to_browser` / `pull_from_browser` / `get_user_requests` / `ack_user_requests`. Client configuration and the full workflow are in [`mcp/README.md`](mcp/README.md).

### 🧊 3D View & WASD Walk
One click turns the plan into an interactive 3D model — walls with real door/window openings, furniture, stairs, room floors and stacked floors. Orbit/zoom with the mouse, or walk around with **`WASD` / Arrow keys** (`Q`/`E` for down/up, `Shift` for faster travel).

**3D editing:** click furniture to select and highlight it (orange box), drag it across the floor (`Shift` = no grid snap; a single item magnets to the nearest wall on drop), and edit width / depth / height / rotation / color in the side panel — the 3D model refreshes live. Clicking a door opens/closes it; clicking a hinged wall (or a group with saved layouts) cycles its positions.

**Floor selector:** the menu at the top-left of the 3D view shows **🏢 all floors stacked**, or **only the selected floor** (e.g. just the 1st or 2nd floor) — the isolated floor is drawn at ground level for a clean, unobstructed look.

### 🌗 Dark & Light Mode
Every surface — panels, canvas, grid, walls, openings, rooms, furniture, dimensions, text and the 3D scene — adapts to the selected theme.

---

## 🚀 Getting Started

### Use it online
Open **<https://mewego.github.io/floorplanner/>** — nothing to install.

### Run locally
```bash
git clone https://github.com/MeWeGo/floorplanner.git
cd floorplanner
# Option A: just double-click index.html
# Option B: any static server, e.g.
python -m http.server 8080      # then open http://localhost:8080
```

> **Internet note:** the 3D view loads Three.js from a CDN (cdnjs / jsDelivr). The 2D editor works fully offline.

### Quick start workflow
1. Press **`R`** and drag to draw a room (walls + room in one step).
2. Press **`D`** / **`N`** and click near a wall to place doors / windows.
3. Press **`F`**, choose furniture from the left panel and click to place it.
4. Click **3B** to see it in 3D, **💾 Kaydet** to save, **🖼 PNG** to export.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :-- | :-- |
| `V` / `H` | Select / Pan (hold `Space` for temporary pan) |
| `W` | Draw walls (type digits + `Enter` for exact length) |
| `R` | Room from rectangle |
| `O` | Detect room from a closed area |
| `P` | Polygon room |
| `S` | Shape tool (triangle / quad / N-gon / circle / free) |
| `D` / `N` | Door / Window |
| `F` | Furniture library |
| `M` | Dimension line |
| `T` | Text |
| `B` | Pen – freehand sketch (drag to draw, release to finish) |
| `E` | Eraser |
| `C` | Calibrate background scale |
| `G` | Toggle snapping |
| `Shift` | Hold to bypass snapping · multi-select |
| `[` / `]` | Rotate selection −15° / +15° (multi-selections rotate as one rigid layout) |
| `R` / `S` *(while placing)* | Rotate furniture / flip door hinge · flip swing side |
| Arrow keys | Nudge selection / background image 1 cm (`Shift` = 10 cm) |
| `WASD` / `Q` / `E` *(in 3D)* | Walk around in 3D view (`Q`/`E`: down/up, `Shift`: faster) |
| `Ctrl+C / V / D` | Copy / Paste / Duplicate |
| `Ctrl+Z / Ctrl+Y` | Undo / Redo |
| `Ctrl+A` · `Ctrl+S` · `Del` | Select all · Save to browser · Delete |
| `0` · `+` · `−` | Fit view · Zoom in · Zoom out |
| Double-click | Rename room / edit text |

---

## 🗂️ Project Structure

```
floorplanner/
├── index.html          # App shell: header, tool rail, library, canvas, panels, footer
├── style.css           # Theme variables (dark default, [data-theme=light]) and layout
├── app.js              # All application logic (~1 500 lines, no dependencies)
├── mcp/server.js       # Optional MCP server for AI agents (zero-dependency, Node ≥ 16)
├── mcp/README.md       # MCP setup: Claude Desktop / OpenCode / Cursor + tool list
├── opencode.jsonc      # Registers the MCP server for OpenCode
├── legacy-index.html   # Original single-file prototype (kept for reference)
├── README.md           # You are here
└── AGENTS.md           # Architecture & conventions for developers / AI agents
```

**Tech stack:** vanilla JavaScript (ES2020), SVG rendering, IndexedDB, [Three.js r128](https://threejs.org/) + OrbitControls (CDN, 3D only). No bundler, no framework, no package manager.

---

## 🌐 Hosting

The app is 100 % static, so it can be hosted anywhere:

| Platform | Notes |
| :-- | :-- |
| **GitHub Pages** *(current)* | Served from `main` branch root → <https://mewego.github.io/floorplanner/> |
| Cloudflare Pages | Connect repo, no build command, output dir `/` |
| Vercel / Netlify | Import repo or drag-and-drop the folder |
| Local file | Open `index.html` directly |

Every `git push` to `main` updates the GitHub Pages site automatically.

---

## 🛠️ Contributing

1. Fork and clone the repo.
2. Read [`AGENTS.md`](AGENTS.md) — it documents the data model, rendering pipeline, conventions and common pitfalls.
3. Edit, then validate: `node --check app.js` and test in a browser.
4. Open a pull request with a short description and screenshots for UI changes.

## 📄 License

No license has been declared yet. Add a `LICENSE` file (e.g. MIT) to define reuse terms.
