# AGENTS.md — Developer & AI-Agent Guide

Authoritative guide for anyone (human or AI) modifying **Kat Planı Çizici**, a client-side 2D/3D floor planner.

- **Live app:** <https://mewego.github.io/floorplanner/>
- **Repo:** <https://github.com/MeWeGo/floorplanner> (branch `main`, GitHub Pages serves the repo root)

---

## 1. Project at a Glance

| Item | Value |
| :-- | :-- |
| Type | Static single-page web app — no backend, no build step, no package manager |
| Language | Vanilla JavaScript (global scope, `'use strict'`), HTML, CSS |
| UI language | **Bilingual: Turkish & English (`tr` / `en`)** — auto-detected from `navigator.language`, toggled via `#bLang`, saved in `localStorage['fp_lang']` |
| Rendering | 2D → SVG (re-rendered from state) · 3D → Three.js r128 + OrbitControls (CDN) |
| Storage | IndexedDB (`FloorPlannerDB`) + JSON import/export; `localStorage` only for theme & language |
| Units | **Everything is centimetres.** Y axis points **down** (SVG convention) |

### Files

| File | Responsibility |
| :-- | :-- |
| `index.html` | DOM shell. Element **ids are the contract** with `app.js` (see §6) |
| `style.css` | CSS variables for chrome theming; layout; components |
| `app.js` | The entire application (single file, ordered by section banners `/* ---------- … ---------- */`) |
| `mcp/server.js` | **Optional** zero-dependency MCP server (stdio) so AI agents can create/edit plans as JSON — see §8 |
| `mcp/bridge.js` | Optional local HTTP bridge: SSE plan sync + user request queue (the client lives in `app.js`) — see §8 |
| `mcp/README.md` | MCP client setup (Claude Desktop, OpenCode, Cursor) + tool reference |
| `opencode.jsonc` | Registers `mcp/server.js` as a project-local OpenCode MCP server |
| `tests/` | Zero-dependency test suite (`node --test tests/*.test.js`, `node tests/browser-smoke.js`) — see §10 |
| `.github/workflows/` | `ci.yml` (tests) and `deploy.yml` (test-gated Pages publish) — see §12 |
| `legacy-index.html` | Original prototype. **Do not edit**; kept for reference only |
| `README.md` | User-facing docs. Keep shortcuts / features in sync with the code |

---

## 2. Golden Rules (read first)

1. **No dependencies, no build.** Do not introduce npm, bundlers, frameworks or TypeScript. The app must work by double-clicking `index.html`. The only exception is the optional `mcp/` tooling, which is also zero-dependency Node and must never be loaded by `app.js`.
2. **Keep all UI text bilingual (`tr` / `en`)** using `L('Türkçe', 'English')` (labels, toasts, prompts, modal text, catalog items). Code identifiers and comments may be English or Turkish — match the surrounding code.
3. **State is the single source of truth.** Mutate `P` (project) → call `commit()` → call `refresh()`/`render()`. Never read geometry back from the DOM.
4. **Always `commit()` after a completed user action** (not on every mousemove) so undo/redo and autosave work.
5. **Never hardcode plan colors** in SVG builders — use `pal()` (see §7). Exports must stay on white paper.
6. **Do not break the export pipeline:** `exportSvg()` sets `ui.exporting = true` and `view.z = 0.5` while calling builders; builders must be pure functions of `(object, live)`.
7. **Preserve existing comments/docstrings** unrelated to your change.
8. Run `node --check app.js` before every commit. There is no test suite; verify visually (see §10).

---

## 3. Data Model

All persisted state lives in one object `P` (the *project*). It is JSON-serialisable and is exactly what gets saved to IndexedDB / exported as `.json`.

```jsonc
P = {
  "v": 2,                       // schema version
  "name": "Yeni Proje",
  "grid": 10,                   // grid step in cm (any number 1..10000)
  "gridType": "square",         // "square" | "triangle" | "dots" | "none"
  "wallT": 20,                  // default wall thickness (cm) for new walls
  "wallH": 270,                 // default wall height (cm) for new walls / floor pitch in 3D
  "bg": null | { "src": "<dataURL>", "x": 0, "y": 0, "w": 1200, "h": 800, "op": 0.5 },
  "floors": [ Floor, ... ]
}

Floor = {
  "id": "…", "name": "Zemin Kat",
  "walls":  [ { id, a:{x,y}, b:{x,y}, t, h, wt?:"solid|curtain", pivot?:"a|b", angles?:[deg,…], posIdx?:0 } ],
  "ops":    [ { id, wall:<wallId>, d, w, h, sill, type, flip:0|1, side:1|-1, open?:0|90 } ],   // doors & windows
  "furn":   [ { id, type, name, icon, k, w, d, h, color, x, y, rot, label } ],
  "rooms":  [ { id, name, color, floor:"none|wood|tile|carpet", pts:[{x,y},…], vars?:[{ label, poses:{id:pose}, base?, draft? }], vIdx?:0 } ],
  "dims":   [ { id, a:{x,y}, b:{x,y}, off } ],
  "texts":  [ { id, x, y, text, size, color, rot } ],
  "sketches": [ { id, pts:[{x,y},…], w, color } ]   // pen tool: freehand strokes (already simplified)
}
```
`Floor.groups` = `[ { id, vars: [{ label, poses: {id: pose}, base?, draft? }], idx } ]` — adjustable layout records for grouped objects (see §8).

Key semantics:

- **Adjustable-angle (hinged) walls:** any wall may have `pivot` (`'a'` default or `'b'`) as its fixed point, `angles` (array of preset angles in degrees `0..360`), and `posIdx` (active position index). Clicking a hinged wall in 2D (`pointerup` without drag) or 3D (`Raycaster`) cycles `posIdx` (`1 → 2 → 3 → 1`) via `cycleWallPos(w)`. Dragging the `wrot` handle rotates the free end around `w[wallPivot(w)]` at constant length and updates `w.angles[w.posIdx]`.
- **Openings (`ops`)** are *parametric on a wall*: `d` = distance in cm from the wall's `a` end to the opening's **centre**. Moving/resizing/rotating a wall moves its openings automatically. Deleting a wall deletes its openings (`deleteIds`).
- `op.type` ∈ `door | double | slide | arch | window`. `side` (+1/−1) = which side the door swings to (local +Y = wall normal `(-uy, ux)`); `flip` mirrors the hinge / sliding direction. Clicking a door in 2D or 3D toggles `open` (`door`/`double` swing 90°, `slide` slides open).
- **Furniture** `k` ∈ `rect | round | stairs | bed | sofa` selects the 2D/3D shape. `rot` is degrees, clockwise on screen. "Back" of an item is local −Y (used by `magnet()`).
- **Rooms** are independent polygons — they do **not** follow walls when walls move. `redetect` in the room panel re-runs `detectRoom`.
- IDs are 7-char random strings from `uid()`; ids are unique across all kinds, so `find(id)` can search every array.
- Missing fields on old projects are defaulted in `loadProject()` (e.g. `gridType`, floor arrays). **When adding a field, add a default there** so old saves/JSON still load.

### Registries (constants near the top of `app.js`)

| Constant | Purpose |
| :-- | :-- |
| `CAT_DEFS` → `CATALOG`, `BYID` | Furniture catalogue `[id, catIndex, name, w, d, h3D, icon, shape, color]` |
| `OPENINGS`, `OPDEF` | Door/window presets |
| `CATS`, `LIBCATS` | Library categories (`LIBCATS[0]` = "Kapı & Pencere") |
| `FLOORS` | Floor-pattern names; patterns defined in `defsSvg()` |
| `KINDS` | Map array-name → kind (`walls→wall`, `ops→op`, …) used by `find`, selection, bbox |
| `TOOLS`, `HINTS` | Toolbar buttons and HUD hint text |
| `TEMPLATES` | Starter plans built through `tplCtx()` helpers |

---

## 4. Runtime State (module-level variables)

| Variable | Meaning |
| :-- | :-- |
| `P`, `fi` | Current project, current floor index (`F()` returns `P.floors[fi]`) |
| `hist[]`, `hi` | Undo stack of `JSON.stringify(P)` snapshots (max 150) and pointer |
| `view {x,y,z}` | Pan (px) and zoom (px per cm). World→screen: `s = w*z + view` |
| `tool`, `sel[]`, `placing` | Active tool, selected ids, item currently being placed |
| `ui` | Transient UI state: `snap, angle, dims, cur, raw, draw, typed, drag, space, cat, q, view3d, v3dFloor, dimStart, polyPts, calib, clip, ghost, exporting, btn, lastE, pen` |
| `layersVis` | Layer visibility (`bg, rooms, walls, furn, dims, sketch`) — view-only, not persisted |
| `T3` | Three.js context `{r, scene, cam, ctl, run}` (lazy-created) |

`tool` values: `select pan wall rect room poly place dim text pen eraser calib` (`door`/`window`/`furn` toolbar buttons map to `tool='place'` with `placing`).

---

## 5. Architecture & Data Flow

```
 pointer / keyboard / panel input
            │
            ▼
   mutate P (walls, ops, furn, …)
            │
            ├── mid-drag ─────────► render()                    (no history)
            │
            └── action finished ──► commit()  ─► hist push + autosave (IndexedDB, debounced 350 ms)
                                       │
                                       ▼
                                   refresh() = render() + renderProps() + renderFloors() + updateTools()
```

### `app.js` section map (in file order)

1. **Constants & catalogue** — `CATALOG`, `OPENINGS`, helpers (`$`, `uid`, `esc`, `rnd`, `clamp`, `dist`, `fmtLen`, `fmtArea`).
2. **Project state** — `newFloor`, `newProject`, `F`, `find`, `selObjs`.
3. **Geometry** — `segProj`, `polyArea`, `polyCentroid`, `pointInPoly`, `opPos`, `furnCorners`, `bboxOf`, `contentBounds`.
4. **IndexedDB** — `openDB`, `dbPut/Get/GetAll/Del`, `migrateLegacyStorage`.
5. **History & persistence** — `commit`, `autosave`, `restore`, `undo/redo`, `loadProject`, `syncGridUI`, `toast`.
6. **View** — `w2s`, `wpos`, `applyView`, `zoomAt`, `fit`.
7. **SVG builders** — `pal`, `defsSvg`, `gridSvg`, `bgSvg`, `roomSvg`, `wallSvg`, `wallDimSvg`, `opSvg`, `furnBody/furnSvg`, `dimSvg`, `textSvg`, `layerStrings`, `handleSvg`, `render`.
8. **Snapping** — `snapToGrid`, `snapPt`, `wallNear`, `magnet`.
9. **Creation / deletion** — `mk*`, `addRectWalls`, `deleteIds`, `deleteSel`.
10. **Room detection** — `detectRoom` (raster flood-fill → boundary trace → Douglas-Peucker), `autoRoomAt`.
11. **Tools** — `TOOLS`, `setTool`, `startPlace`, `drawPreview`, `updateGhost`.
12. **Pointer interaction** — `setCursor`, `pointerdown/move/up`, `startMove/doMove`, `startHandle/doHandle`.
13. **Properties panel** — `renderProps`, `projectPanel`, `applyProp`, panel click delegation.
14. **Library, floors, clipboard, keyboard.**
15. **Modals** — help, projects gallery, templates.
16. **Export** — `exportSvg`, `exportPng`, `exportPrint`.
17. **3D** — `show3D`, `init3D`, `build3D`.
18. **Bootstrap** — event wiring and async startup (migrate → load autosave → else template picker).

### Rendering pipeline
`render()` rebuilds SVG layer strings (`layerStrings(f, live=true)`) into fixed groups: `gBg, gGrid, gRooms, gWalls, gOps, gFurn, gDims, gTexts, gSketch, gSel, gPv` (z-order bottom → top). `gPv` (preview) is redrawn alone by `drawPreview()` on mouse-move. Hit-testing uses `data-id` (objects) and `data-h` (handles) attributes with `e.target.closest(...)`; invisible `stroke="transparent"` / `fill="transparent"` shapes provide generous hit areas.

When `live=false` (export, thumbnails) builders omit `data-id` and hit shapes.

---

## 6. DOM Contract (`index.html` ids used by `app.js`)

Do not rename without updating `app.js`:

`pname, bNew, bProjects, bSave, bJson, bOpen, bUndo, bRedo, bPng, bSvg, bPrint, b2d, b3d, bTheme, bAi, bHelp, fileOpen, fileBg, tools, lib, search, cats, items, cv, defs, world, gBg…gPv, v3d, hud, zIn, zOut, zFit, toast, props, floors, cSnap, cAngle, lblAngle, cDims, sGridType, sGrid, lblGridCustom, iGridCustom, coords, zoomlbl, modalbg, modal`.

Properties-panel inputs carry `data-k` (kind: `wall|op|furn|room|dim|text|proj|bg|layer`) and `data-p` (property). `applyProp()` handles `input` (live, no history) and `change` (commit).

---

## 7. Theming (Dark / Light)

- Chrome (panels, buttons) uses CSS variables in `style.css`: dark in `:root`, light in `[data-theme=light]`. `--stage-bg` / `--cv-bg` colour the stage, canvas, 3D container and thumbnails.
- Plan graphics use **`pal()`** in `app.js`, which returns a palette (`wall, stroke, gMin, gMaj, text, sub, halo, dim, glass, swing, roomOp, furnOp, wood, tile, carpet, …`).
  - `pal()` honours `ui.exporting`: when true it **always returns the light palette** so PNG/SVG/PDF are print-ready.
  - Door/window cut-outs are filled with `pal().bg` so they "erase" the wall; keep that in sync with `--cv-bg`.
- The theme button (`bTheme`) toggles `data-theme`, persists to `localStorage['fp_theme']`, calls `render()` and rebuilds 3D if open.
- `build3D()` reads `isLight()` for sky, ground, slab, wall colour and edge lines.

**Adding a new drawable?** Pull every colour from `pal()`, give text a `paint-order="stroke"` halo using `pal().halo`, and test in both themes.

---

## 8. Subsystem Notes

### Snapping (`snapPt`, `snapToGrid`, `magnet`)
- Order: wall-end / room-corner snap (14 px radius, only if `ui.snap` and no `Shift`) → angle snap when a `from` point exists and `ui.angle` → grid snap.
- Angle step: **15°** (square/dots/none), **30°** for `gridType==='triangle'`. Length rounds to `P.grid` except when `gridType==='none'`.
- `snapToGrid` is the **only** place that knows about grid geometry. Triangle lattice vertices: rows spaced `g·√3/2`, odd rows offset by `g/2`. Use it for any new placement/move feature instead of `rnd(v, P.grid)`.
- `magnet(f)` snaps a furniture item to the nearest wall face and rotates it so its back (−Y) touches the wall.

### Grids (`defsSvg`, `gridSvg`)
- Patterns `g-minor/g-major`, `g-tri-*`, `g-dots-*` are rebuilt on every render (stroke widths depend on `view.z` to stay hairline).
- Major interval `ms`: `s≥100 → 5s`, `s≥25 → 4s`, else 100 cm. Minor grid hidden when `P.grid*view.z < 6`; major hidden when `view.z ≤ 0.12`.
- `syncGridUI()` must be called whenever `P.grid` / `P.gridType` changes outside the footer controls (load, undo/redo) — it handles the "Özel…" custom-step input.

### Room detection (`detectRoom`)
Rasterises walls to an offscreen canvas (resolution ≥ 2 cm/px, max ≈ 1800 px), flood-fills from the click, returns `'open'` if the fill reaches the border (leak), otherwise traces the outer boundary and simplifies it (Douglas-Peucker, ε≈1.1·res). Doors/windows do **not** open rooms because the walls underneath are rasterised solid.

### Moving things (`startMove` / `doMove`)
- Snapshot originals in `ui.drag.orig`; apply a snapped **delta** from the first object's anchor (so off-grid objects keep their offset).
- Selected walls also drag coincident endpoints of non-selected walls (`conn`) so corners stay joined.
- Single furniture runs `magnet()`; openings re-project onto the nearest wall within 60 cm.
- Dragging a **single room** moves its contents too (`roomInner`: furniture + texts inside, captured in `startMove`); the panel's X/Y fields apply the same delta.

### Handles (`handleSvg` / `startHandle` / `doHandle`)
Handle ids: `wa/wb` (wall ends), `v<i>` (room vertex), `da/db/doff` (dimension), `rot` (furniture rotation), `c0..c3` (furniture resize), `bg0..bg3` (background image corner resize; preserves aspect ratio unless `Shift` is held). Shown only for a single selection. Background image (`id === 'bg'`) is selectable and movable on the canvas unless `P.bg.lock` is true. `g0..g3` (multi-selection bbox resize) appear when at least one *group-resizable* kind is selected (wall/dim/room/furn/text/sketch/bg — pure-op selections show none); scaling a wall re-projects its attached openings and shifts hinged-wall angle presets by the rotation delta.

### Storage
- `autosave()` (debounced) writes `P` to IndexedDB `state` store key `'auto'`; `beforeunload` also writes. Fallback to `localStorage['fp_auto']` if IndexedDB fails.
- Named projects live in the `projects` store (`{name, updatedAt, project}`, keyPath `name`). Saving with an existing name **overwrites**.
- `migrateLegacyStorage()` moves old `localStorage` keys (`fp_projects`, `fp_auto`) into IndexedDB once, then deletes them.
- Bumping `DB_VER` requires handling in `onupgradeneeded`; currently version 1 with stores `projects`, `state`.

### Adjustable layouts & groups (vars)
- Groups: members carry `o.grp`; per-floor `groups[]` holds `{ id, vars: [{ label, poses: {id: pose}, base?, draft? }], idx }`. Room variants live on the room itself (`r.vars`, `r.vIdx`). Clicking a room/group on canvas cycles layouts (`switchRoomVarTo` / `switchGroupVarTo`).
- `snapPose(kind, o)` snapshots an object pose (walls also keep `angles`/`posIdx`); `applyVarPoses()` restores them — for legacy poses without angles it re-shifts existing presets by the body's rotation delta. `syncActiveVars()` refreshes the active variant's poses while the user edits.
- **First-come ownership:** `poseOwners()` maps id → owning layouts; `roomPoses` / `groupPoses` skip objects already claimed by another layout, so a wall shared by two rooms or furniture shared with a group layout is not double-moved. `dropPoseOrphans()` removes stale poses after ungroup / re-group / delete.
- Alt+click selects a single group member **without** cycling its layout; the layout badge erased with the eraser deletes the whole group.

### 3D interaction notes
- Picking uses `findAnyFloor()` (ids are unique across floors) and respects **occluders**: only the closest mesh hit is considered — walls/slabs/room floors hide furniture behind them.
- 3D group drags mirror 2D `doMove`: connected wall ends follow (`conn`), hinge pins translate (`pins`), room/sketch polygons update in the plan and are rebuilt into the scene on drop (`schedBuild3D`).
- `h3[]` holds one `BoxHelper` per selected furniture item, so grouped selections highlight too.
- `build3D()` disposes previous geometries/materials (`T3.mats`) before rebuilding; `affects3D(k, p)` gates which panel properties trigger `schedBuild3D()`.

### 3D (`build3D`, `furn3D`, `loop3D`)
- Plan `(x, y)` → Three `(x, elevation, z=y)`. Rotation: `mesh.rotation.y = -θ` (SVG clockwise → Three counter-clockwise). Room polygons use `rotation.x = +π/2`.
- Walls are split into boxes around each opening (below-sill, above-head). Every opening gets jambs + head (and a sill board for windows); windows add a translucent pane plus a mullion when wide; doors/double doors get a frame, an inset panel and a handle while keeping the existing `open`/`side`/`flip` rotation; sliding doors get two offset panels + a top track. Solid walls also get **skirting** (both faces, skipping door gaps) and a thin **top cap** — `wt: 'curtain'` walls are skipped.
- Furniture detail is **parametric on the catalog id** in `furn3D(g, o, ctx)`: `sofa3/sofa2/armchair`, `chair`, `ochair`, `coffee|table*|desk|meet|vanity`, `tableR`, `bed*|bunk|crib`, `wardrobe`, `dresser|night|shelf|bookcase`, `fridge|dish|wm`, `stove`, `sinkK|counter*|island`, `basin*`, `wc|bidet`, `tub|shower`, `plant|tree`, `tv`, `rug`, `car`, `pool`, `column|colSq`, `fireplace`, `printer`, `stairs`. Everything else (custom `poly` library shapes included) falls back to the old `k`-based box/cylinder/extrude. All proportions derive from `o.w/d/h` and shades from `o.color` (`shade()`), so 2D resize/rotate/swap never breaks it. **No new data fields.**
- `box/cyl/sph` share one unit `BoxGeometry` / `CylinderGeometry` / `SphereGeometry` and scale the mesh — do not allocate geometry per part. `EdgesGeometry` rides along with the unit box and is only added to silhouettes (the `edges` flag). Keep `furn3D` at ≤ ~12 meshes per item (~20 for stairs).
- Room floors use `r.floor` (`wood|tile|carpet`) to build small cached `CanvasTexture`s tinted with `r.color` (`floorTexture()`, one texture per kind + colour + theme); `none` keeps the flat fill.
- Lighting: hemisphere + a shadow-casting directional light fitted to `contentBounds` (1024/2048 shadow map) + a low fill light. The renderer uses `PCFSoftShadowMap`, `outputEncoding = sRGBEncoding` and `ACESFilmicToneMapping` at ~1.05 exposure; ground, slabs and floors receive, large walls/furniture cast.
- Detail level: `build3D()` estimates the object count and drops part edges / frames / floor textures above ~3000 objects (`det` flag) instead of exposing a user setting.
- Camera presets: `set3DCam('fit'|'top'|'eye')` backs the three small buttons next to `#s3dFloor` (`#b3dFit/#b3dTop/#b3dEye` in `.ctl3dCam`); `T3.fit` caches `{cx, cz, sz, elev}` during `build3D`. The markup must stay in sync — `applyLangUI()` uses `$()` guards but the bootstrap binds the three ids directly.
- Floors stack with pitch `P.wallH + 20`. Floor slabs follow the outer contour of walls and enclosed spaces (via `slabPolys` and `ExtrudeGeometry`) rather than axis-aligned bounding boxes, eliminating overhang on angled walls. Built once on entering 3D (and on theme change) — it does **not** live-update; leave 3D (`Esc` or `2B`) to edit.
- Camera travel: `keys3D` tracks held keys (`W/A/S/D`, Arrow keys, `Q/E`, `Shift`) and `loop3D()` translates both `T3.cam.position` and `T3.ctl.target` along the horizontal XZ camera forward/right vectors (or Y for `Q/E`).
- Floor visibility: the `#s3dFloor` select (`.ctl3d`, top-left of the 3D overlay) + `sync3DFloors()`; `ui.v3dFloor` is `'all'` or a floor id. `build3D()` skips hidden floors, so an isolated floor is drawn at ground level (elevation counter only accumulates over shown floors).
- If CDN scripts fail, `show3D` shows a toast and stays in 2D.

### Export
`exportSvg()` → `{svg,w,h}`; PNG rasterises that SVG via `Image` + canvas; PDF opens a print window (`window.open` + `print()`). Includes a title block (project, floor, date, total room area) and a 2 m scale bar. Background image is included only if its layer is visible.

### MCP server (`mcp/server.js`)
- **Optional tooling, not part of the app.** A zero-dependency Node (≥ 16) MCP server over stdio — JSON-RPC 2.0 is implemented by hand, so there is no `npm install` and no build. It lets AI agents (Claude Desktop, OpenCode, Cursor, …) author plans as JSON: `new_project`, `add_wall` / `add_rect_walls`, `add_opening`, `add_furniture`, `add_room`, `add_text`, `update_object`, `delete_objects`, `add_floor`, `summarize`, `list_catalog`, `load_project` / `save_project` / `get_project` / `set_project`.
- **Live browser bridge (`mcp/bridge.js`).** IndexedDB is per-origin and a Node process cannot write it, so a tiny local server keeps the plan for the agent. **The client lives in `app.js`** (section *AI köprüsü istemcisi*), so the app connects to `http://127.0.0.1:8787` from **any origin** — the GitHub Pages build, a `file://` copy, or the bridge's own page. Nothing is injected and no script is loaded from the bridge. Pushed plans (`push_to_browser` → `PUT /__plan.json` → SSE `event: plan`) are applied through the app's own `loadProject()`, so autosave persists them to this origin's IndexedDB (refresh keeps them); local edits are pushed back on every `autosave()` (debounced, guarded by `brgApplying`). `brgProbe()` tries once on boot and then every 10 s while the tab is open, so a page that was already open connects as soon as the agent starts the bridge.
- **Which plan wins on first contact.** `brgInitialSync()` compares the bridge revision with `localStorage[fp_bridge_rev]`: a returning browser adopts the agent's plan only when `rev > seen`; a **brand-new** browser (no `seen`) adopts it only if the local plan is pristine (no walls), otherwise its own plan wins and is pushed. After that, sync is revision-ordered, so a reload never re-pushes or oscillates.
- **CORS / Local Network Access.** The bridge sends `Access-Control-Allow-Origin: *` plus `Access-Control-Allow-Private-Network: true` on every response (including preflights and SSE). Chrome 152+ (desktop) reaches `127.0.0.1` from `https://mewego.github.io` directly; newer builds may show a one-time **local network** permission prompt, and headless Chrome denies it outright (`LocalNetworkAccessPermissionDenied`) unless `--disable-features=LocalNetworkAccessChecks` is passed.
- **AI modal (`aiModal`).** The **🤖 AI** toolbar button (`ui.modal === 'ai'`) is a single-purpose panel: it reports live-connection state (`aiSyncLiveRow`), offers **📋 Copy agent prompt** (`aiSetupPrompt()` + `copyText()`, `navigator.clipboard` with a textarea/`execCommand` fallback because `file://` often blocks the async API) and **🔌 Try to connect** (`brgConnect()` + `brgInitialSync()`). There is deliberately **no copy/paste-the-JSON path** — the agent edits the plan directly, and a second weaker flow only confused users.
- **User → agent request queue.** The bridge client in `app.js` renders a floating, read-only **`AI` pill** (only when a bridge is connected; green dot + live revision) that opens a panel with bridge details and an **Ask AI** box. The agent prompt lives in `aiSetupPrompt()` and is offered in the **AI modal** (path 1) and **❓ Help**; it tells the agent to start `mcp/bridge.js` — no `http://127.0.0.1:8787/` visit, no file juggling. Submissions go to `POST /__requests`, are kept in bridge memory, and are read by the agent with `get_user_requests` / cleared with `ack_user_requests` (SSE `requests-changed` refreshes the open panel). Requests are **not** pushed to the model automatically — the user asks the agent to check them. UI is bilingual via `L()` and repaints on `data-theme` changes (MutationObserver); the pill has no pause switch by design.
- **Pill placement.** `placeAiPill()` positions the host above the footer using its measured height (re-run on `resize` and when built), and the panel gets a computed `max-height` so it never runs off short windows. The host uses `z-index: 95` — below `#modalbg` (100) — and opening Help closes the panel.
- The bridge client is now part of `app.js` (section *AI köprüsü istemcisi*), so it depends on normal module scope rather than injected globals: `loadProject`, `autosave` (wrapped), `toast`, `L`, `schedBuild3D`, `ui`, `closeModal`. `mcp/bridge.js` no longer injects anything and serves only the endpoints below.
- The workflow is file-based too: the agent saves a plan `.json`, the user opens it in the app via **📂 Aç**; exports from the app (**⬇ JSON**) can be loaded back with `load_project`.
- `CATALOG`, `OPENINGS`, `ROOMCOL`, `newProject`/`newFloor` defaults and the `mkWall`/`mkOp`/`mkFurn`/`mkRoom`/`addRectWalls`/`deleteIds` mirrors must stay **in sync with `app.js`** — when you change the data model or catalogue, update both files (and run `node --check mcp/server.js`).
- `opencode.jsonc` registers the server for OpenCode (`node mcp/server.js`). Never `require()`/import it from `app.js`: the app must remain dependency-free and `file://`-runnable.

---

## 9. Common Tasks (recipes)

### Add a furniture item
Append a row to `CAT_DEFS`: `['id', catIndex, 'Türkçe Ad', w, d, h3D, 'emoji', 'rect|round|bed|sofa|stairs', '#hexColor', 'English Name']`. Optionally reference it in a template via `c.fu('id', x, y, rot)`. For a new *shape kind*, extend `furnBody()` (2D) **and** the `build3D()` furniture branch.

### Add a door/window type
Add to `OPENINGS` (`id,name,en,w,h,sill,icon`), map its `id` to a `type` in `opType()`, draw it in `opSvg()` (use `pal()`), add a 3D representation in `build3D()` if needed, and add the option to the `type` `<select>` in `renderProps()`.

### Add a property to an object
1. Default it in the `mk*` factory **and** `loadProject()` (back-compat).
2. Add an input in `renderProps()` with `data-k`/`data-p` using `fld(L('TR', 'EN'), ...)`.
3. Use it in the SVG builder (and `build3D` if relevant).
4. `applyProp` already handles generic `o[p] = v`; add special cases only if needed.

### Add a tool
Add to `TOOLS` (`['id', 'icon', 'TR', 'Key', 'EN']`) + `HINTS` / `HINTS_EN`, handle it in the `pointerdown` `switch(tool)` (and `pointermove/up` if it drags), draw previews in `drawPreview()`, add a key in the `map` object in the `keydown` handler, document it in `helpModal()` and the README shortcut table.

### Add a grid type
Add `<option>` in `index.html#sGridType`; add patterns in `defsSvg()`, selection in `gridSvg()`, snapping in `snapToGrid()`, and (if angular) the angle step in `snapPt()` / label in `syncGridUI`.

### Add a template
Push an entry to `TEMPLATES` using `tplCtx()` helpers: `rect(x0,y0,x1,y1)` returns `[top,right,bottom,left]` walls, `W()` extra walls, `op(wall, d, openingId, extra)`, `fu()`, `room(x,y,name,color,floor)`. Door `side=1` on the outer rectangle swings **inward**. Check the thumbnail renders (templates modal).

### Bump schema
Increment `P.v` in `newProject()`, add a migration branch in `loadProject()`, keep reading older versions.

---

## 10. Verification Checklist

Run the suite first — it covers what used to be manual and is what CI enforces:

```bash
node --test tests/*.test.js     # fast, no browser: syntax, DOM contract, MCP, bridge
node tests/browser-smoke.js     # boots the app in headless Chromium and drives it
```

| File | Guards against |
| :-- | :-- |
| `tests/syntax.test.js` | a JS parse error; inline `<script>` creeping back; a broken `opencode.jsonc` |
| `tests/dom-contract.test.js` | **`$('#id')` lookups with no element** — the `#b3dFit` class of crash that once shipped to main; also duplicate ids |
| `tests/mcp.test.js` | tool surface shrinking, a broken plan round-trip, `CATALOG`/`OPENINGS` drifting from `app.js` |
| `tests/bridge.test.js` | plan store/revisioning, the request queue, SSE, and the **`Access-Control-Allow-Private-Network`** header the deployed page needs |
| `tests/browser-smoke.js` | runtime crashes the static checks cannot see: boot, all templates, draw→undo→redo, `exportSvg`, AI + Help modals, theme switch, 3D build |

`browser-smoke.js` skips itself (exit 0) when no Chromium is found; set `CHROME_BIN` to point at one. In CI it always runs.

**Still verify by eye** (the suite cannot judge these):

1. **Both themes:** toggle 🌓 and confirm walls, openings, rooms, furniture, labels, grid and 3D are legible.
2. **Grid modes:** square / triangle / dots / off; presets `1 m`, `3 m`, `5 m` and **Özel…**.
3. **Exports:** PNG/SVG/PDF come out on white paper in dark mode.
4. **Old data:** open a JSON saved before your change.
5. **AI flow:** `node mcp/bridge.js`, then confirm the floating `AI` pill appears and a `push_to_browser` lands in the tab.

### Adding a test

Tests are **zero-dependency** (`node:test`, `node:assert`, global `fetch`/`WebSocket`). No `package.json`, no `npm install` — keep it that way so the app stays double-clickable. Put pure logic in `tests/helpers/` so it can be proven against synthetic input (see the `#b3dFit` regression test).

When you add a toolbar button or panel, add its id to `index.html` **and** to the `DOM contract` expectation list in `tests/dom-contract.test.js` if it is user-facing.

Headless screenshot (Windows, Edge) — useful for visual regression:

```powershell
$e="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
& $e --headless=new --window-size=1500,900 --virtual-time-budget=4500 `
  --screenshot="$PWD\shot.png" "file:///d:/Project/floorplanner/index.html"
# 3D needs: --enable-gpu --use-angle=swiftshader --enable-unsafe-swiftshader
```

To script UI state, create a temporary copy of `index.html` that appends a `<script>` after `app.js` (e.g. click `[data-tpl="2"]`, set `document.documentElement.dataset.theme="light"`), screenshot it, then **delete the temp file** — never commit test pages or screenshots.

---

## 11. Pitfalls & Gotchas

- **Do not call `commit()` inside `render()` or per-mousemove** — it floods history.
- `render()` rewrites `innerHTML` of every layer; keep references to DOM nodes out of long-lived variables.
- `renderProps()` rebuilds the panel — don't call it while the user is typing in a panel input (use `render()` for live feedback; `renderProps()` only on `change`/selection change).
- Selection ids may refer to objects on **another floor** after switching floors — `find()` searches only the current floor; filter `sel` when changing floors/undoing (already done in `restore`).
- `ui.exporting` and `view.z` are temporarily mutated inside `exportSvg()`, `thumbSvg()`, `projectThumbSvg()`; they restore in `finally`. Preserve that pattern (these swap the global `P`/`fi` too).
- Wall length labels use `view.z` for font size; builders called outside the live canvas must set `view.z` first.
- `prompt()` / `confirm()` are used for rename, calibration distance and delete confirmations — wrap strings in `L(tr, en)`.
- `localStorage` writes can throw (quota/private mode) — keep them in `try/catch`.
- Room polygons are **not** linked to walls; don't assume they update when walls move.
- Emoji icons in furniture/library depend on the OS font; always keep a text name.
- Heavy rooms: `detectRoom` allocates up to ~3.2 M pixels; avoid calling it in loops or on mousemove.

### Editing-tool caveats (for AI agents)
- `app.js` and other files may have **CRLF** line endings depending on the platform/git config (git warns "LF will be replaced by CRLF"). Exact-match edit tools can fail on multi-line targets — prefer **small single-line targets**, or do a scripted replace (Node/PowerShell) and re-run `node --check`.
- When rewriting via PowerShell, write files as **UTF-8 without BOM** (`[IO.File]::WriteAllText(path, text, (New-Object Text.UTF8Encoding $false))`). Turkish characters (ı ğ ş ç ö ü İ) must survive — console output may display them wrongly even when the file is correct; verify via a screenshot instead of the terminal.
- Backticks/`$` inside JS template literals are easy to corrupt through shell quoting — write a small `.js` fix script instead of one-liners, then delete it.

---

## 12. Git & Deployment

- Default branch: `main`. Remote: `origin` → `git@github.com:MeWeGo/floorplanner.git`.
- **Deployment is gated by CI.** `.github/workflows/deploy.yml` runs the whole test suite (`ci.yml`) and only then publishes to <https://mewego.github.io/floorplanner/>. A failing test on `main` leaves the live site on the previous good build.
- **Pages source must be "GitHub Actions"**, not "Deploy from a branch". The old branch mode published every push immediately, which is how a boot crash reached production. `configure-pages` asks to switch it (`enablement: true`); if the token lacks admin rights, set it once in **Settings ▸ Pages ▸ Source**.
- Workflow map:
  | File | Trigger | What it does |
  | :-- | :-- | :-- |
  | `ci.yml` | push to any non-`main` branch, all PRs, `workflow_call` | static tests + browser smoke |
  | `deploy.yml` | push to `main`, manual dispatch | calls `ci.yml`, then publishes |
- Commit style: short imperative subject (`Add triangle grid`, `Fix door swing on flipped walls`), body for rationale if non-obvious.
- Typical flow:
  ```bash
  node --test tests/*.test.js
  node tests/browser-smoke.js
  git add index.html app.js style.css tests .github README.md AGENTS.md
  git commit -m "<message>"
  git push
  ```
- Prefer a PR for risky changes: CI runs on the branch, and branch protection (if enabled) blocks a red merge. A direct push to `main` still cannot deploy broken code, but it does consume a failed deploy run.
- Do **not** commit: temp test pages, screenshots, scratch scripts, `node_modules`.
- Keep `legacy-index.html` untouched.

---

## 13. GitHub Issues

Issues live at <https://github.com/MeWeGo/floorplanner/issues>. Every new issue must carry:

- exactly **one type label** — what kind of work it is;
- exactly **one priority label** — when it should be picked up.

Bugs also get a `severity:` label (impact). Severity is separate from priority: severity says how bad it is, priority says when to schedule it.

| Group | Label | Use for |
| :-- | :-- | :-- |
| Type | `bug` | Broken behaviour, regressions, crashes |
| Type | `enhancement` | New features and user-visible improvements |
| Type | `documentation` | README / AGENTS.md / help text only |
| Type | `question` | Clarification, design discussion, support |
| Priority | `priority: high` | Blocks a release or a core workflow; pick up next |
| Priority | `priority: medium` | Important, but a workaround exists; schedule after high |
| Priority | `priority: low` | Nice-to-have, polish, long-term ideas |
| Severity (bugs) | `severity: high` / `medium` / `low` | Impact if the bug is hit |

- `duplicate`, `invalid` and `wontfix` are closing states, not types. `accessibility`, `help wanted` and `good first issue` are optional extras.
- A high-severity bug is not automatically high priority (e.g. a rare crash on an unused path), and a low-severity bug can be high priority (e.g. a typo in the main toolbar).
- Do not invent labels — check `gh label list` first.
- Body: summary, current behaviour, repro steps (bugs) or scope / non-goals (features), acceptance criteria, test notes.

```bash
gh issue create --title "..." \
  --label bug --label "severity: medium" --label "priority: high" \
  --body-file issue.md
```

---

## 14. Roadmap Ideas (not implemented)

Imperial units · roof & terrain in 3D · cost / materials list · wall-linked room polygons (auto-update) · PWA / offline caching of Three.js · custom user templates · touch-gesture pinch-zoom · curved walls · LICENSE file.
