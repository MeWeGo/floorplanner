# AGENTS.md — Developer & AI-Agent Guide

Authoritative guide for anyone (human or AI) modifying **Kat Planı Çizici**, a client-side 2D/3D floor planner.

- **Live app:** <https://mewego.github.io/floorplanner/>
- **Repo:** <https://github.com/MeWeGo/floorplanner> (branch `main`; the deploy publishes only `index.html`, `app.js` and `style.css`)

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
| `.github/ISSUE_GUIDE.md` | How to write a GitHub issue (title, templates, rules, checklist) — see §13 |

---

## 2. Golden Rules (read first)

> **Product principle:** the app is made for **ease of use** by non-experts and is **optimised as far as possible while preserving every feature**. Prefer sensible defaults and automatic behaviour over new dialogs, modes and settings; keep pro-only extras behind advanced options. Keep hot paths cheap (render, mouse-move, 3D build): no per-frame allocation, do work lazily. Never remove an existing feature to simplify — streamline or tuck it away instead.

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
  "layers": [ { "id": "0", "name": "Varsayılan", "color": "#64748b", "vis": true, "lock": false, "print": true }, … ],   // drawing layers (issue #32); "0" = Default, cannot be deleted
  "activeLayer": "0",            // new objects are stamped with it (any object may carry "layer": id; absent = "0")
  "textures": [ { "id": "…", "name": "…", "w": 60, "h": 60 }, … ],   // custom texture metadata (issue #40); image data lives in IndexedDB
  "floors": [ Floor, ... ]
}

Floor = {
  "id": "…", "name": "Zemin Kat", "slabFloor": "none", "slabColor": null,   // 3D slab finish (same kinds as room floors)
  "wallH"?: 350, "glass"?: "clear|frosted",   // optional per-floor wall height (#59; absent = P.wallH) and glass kind when slabFloor is "glass" (#57)
  "walls":  [ { id, a:{x,y}, b:{x,y}, t, h, wt?:"solid|curtain|railing|fence", mul?:cm, mulN?:n (curtain mullions, #71), rs?:"bars|glass|cable|solid" (railing style; also on stairs / ramps), color?:"#hex" (paint; absent = theme default), pivot?:"a|b", angles?:[deg,…], posIdx?:0 } ],
  "ops":    [ { id, wall:<wallId>, d, w, h, sill, type, flip:0|1, side:1|-1, open?:0|90, mat?:"wood|glass|paneled|metal", color?:"#hex", frameCol?:"#hex", glass?:"clear|frosted" } ],   // doors & windows
  "furn":   [ { id, type, name, icon, k, w, d, h, color, x, y, rot, label, stepN?, stairType?:"straight|l|u|spiral", railing?:"none|left|right|both", rampType?:"accessible|vehicle|landscape",   // stair fields for k:"stairs" (#33); ramps (k:"ramp", #58) use rampType + railing
                faces?:[[[x,y,z],…],…], fbase?:{w,d,h} (k:"roof" only: IFC roof faces, local cm, z from the item base),
                parts?:[{ name?, type:"box|cyl|sphere|extrude", x, y, z, w, d, h, rot?, color?, mat?:"gloss|metal|glass", axis?:"x|y", pts? }], pbase?:{w,d,h}, partsV?:1 } ],   // multi-part furniture (see §8)
  "rooms":  [ { id, name, color, floor:"none|wood|tile|carpet|marble|concrete|stone|grass|water|gravel|deck|asphalt|glass|tex:<id>", glass?:"clear|frosted", slabT?:20, pts:[{x,y},…], vars?:[{ label, poses:{id:pose}, base?, draft? }], vIdx?:0 } ],
  "slabs":  [ { id, name, floor:"concrete|…", glass?:"clear|frosted", color:null|"#hex", t:20, off:0, pts:[{x,y},…] } ],   // free slabs: balconies / terraces (issue #22)
  "voids":  [ { id, name, type:"stair|shaft|atrium", pts:[{x,y},…] } ],                     // holes in this floor's slab (issue #23)
  "sections": [ { id, name:"A", a:{x,y}, b:{x,y}, dir:1|-1 } ],                            // section lines (issue #30); view direction = normal of a→b × dir
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
| `ui` | Transient UI state: `snap, angle, dims, cur, raw, draw, typed, drag, space, cat, q, view3d, v3dFloor, dimStart, polyPts, calib, clip, ghost, exporting, btn, lastE, pen, shot` |
| `layersVis` | Layer visibility (`bg, rooms, walls, furn, dims, sketch, underlay`) — view-only, not persisted |
| `underlay` | Floor underlay view settings `{ floor: 'prev' or a floor id, op }` (issue #26) — view-only, not persisted |
| `tabs[]`, `tabIdx` | Open project tabs (issue #17): `{ id, P, hist, hi, fi, view, sel }` per tab; the **active** tab's live state is the globals above |
| `T3` | Three.js context `{r, scene, cam, ctl, run}` (lazy-created) |

`tool` values: `select pan wall rect room poly slab void place dim text pen eraser trim mirror section calib` (`door`/`window`/`furn` toolbar buttons map to `tool='place'` with `placing`).

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

`pname, ptabs, bNew, bProjects, bSave, bJson, bOpen, bUndo, bRedo, bPng, bSvg, bPrint, b2d, b3d, b3dFit, b3dTop, b3dEye, b3dShot, bTheme, bAi, bHelp, fileOpen, fileBg, tools, lib, search, cats, items, cv, defs, world, gBg…gPv, v3d, hud, zIn, zOut, zFit, toast, props, floors, cSnap, cAngle, lblAngle, cDims, sLayer, lblLayer, b3dN, b3dE, b3dS, b3dW, b3dStudio, sGridType, sGrid, lblGridCustom, iGridCustom, coords, gridlbl, zoomlbl, modalbg, modal`.

Properties-panel inputs carry `data-k` (kind: `wall|op|furn|room|dim|text|proj|bg|layer`) and `data-p` (property). `applyProp()` handles `input` (live, no history) and `change` (commit).

---

## 7. Theming (Dark / Light)

- Chrome (panels, buttons) uses CSS variables in `style.css`: dark in `:root`, light in `[data-theme=light]`. `--stage-bg` / `--cv-bg` colour the stage, canvas, 3D container and thumbnails.
- Plan graphics use **`pal()`** in `app.js`, which returns a palette (`wall, stroke, gMin, gMaj, text, sub, halo, dim, glass, swing, roomOp, furnOp, wood, tile, carpet, marble, concrete, stone, …`).
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
- **Object snap tracking (issue #16):** after end-snap, `snapPt` aligns with reference points from `trackRefs()` (wall ends, room corners, in-progress `ui.polyPts`; excluding `ignore` and `from`). With `from` + angle lock it intersects the angle ray with each reference's vertical/horizontal line and locks the length (overriding grid rounding); otherwise x and y lock independently (both = the crossing of two references). Tolerance `10 / view.z`. The result carries `guides: [{from, axis}]`; `drawPreview()` draws them dashed (only while drawing or dragging a handle). `doHandle` sets `ui.cur` for `wa/wb`, `v<i>` and `da/db` so drags show guides too. `ignore` may hold wall ids **and** point objects (a dragged room vertex skips itself). Guard: `tests/snap-tracking.test.js`.
- **Midpoint / centre / underlay snap (issues #25, #26):** when no wall end or corner is within the 14 px radius, `snapPt` takes the nearest of `underlayPts()` (`hit: 'under'`), `snapMids(f, ignore)` (wall + dim midpoints, `'mid'`) and `snapCenters(f, ignore)` (room / slab / void centroids + group bbox centres, `'center'`). `ignore` keeps a dragged wall / dim / room vertex / group member from snapping to its own moving midpoint or centre (dim handles pass `new Set([o.a, o.b])`). `drawPreview()` draws the glyph with `snapGlyph()` (▲ / ⨁ / ◇ + a bilingual label) and, while a drawing or place tool is active, a faint ⨁ at the centre of the room under the cursor. Furniture locks to `nearCenter()` (18 px) in `updateGhost()` and in a single-item `doMove` instead of `magnet()`. Guard: `tests/snap-mid-underlay.test.js` + a smoke check.
- **Floor underlay (issue #26):** `underlayFloor()` = the floor picked in **Project ▸ Layers** (`underlay.floor`), else the floor below; `null` when `layersVis.underlay` is off, there is one floor, or the ground floor has nothing below. A floor picked as its own reference falls back to the floor below. `underlaySvg()` draws it into `#gBg` at `underlay.op` (10–50 %) with `pointer-events="none"`: wall joints + walls, slab outlines (dashed), voids, and stairs / columns (`isStructFurn`). Never exported. `underlayPts()` feeds both `snapPt` and `trackRefs`.
- `magnet(f)` snaps a furniture item to the nearest wall face and rotates it so its back (−Y) touches the wall.

### Grids (`defsSvg`, `gridSvg`)
- Patterns `g-minor/g-major`, `g-tri-*`, `g-dots-*` are rebuilt on every render (stroke widths depend on `view.z` to stay hairline).
- **Adaptive metric grid (issue #38).** The drawn interval comes from `gridScale(z)` = `{ minor, major, minorPx, majorPx }`: `minor` is `P.grid` while its spacing is ≥ `GRID_MINOR_PX` (6 px), else 0 (hidden — the old "hide the minor grid" rule, now explicit); `major` starts at the classic fixed interval (`P.grid ≥ 100 → 5×`, `≥ 25 → 4×`, else 1 m — rounded up to a multiple of `P.grid` when 1 m is not one) and climbs the `gridFactor()` ladder (×2 / ×5 / ×10 / ×20 …) only while it is closer than `GRID_MAJOR_PX` (46 px), so it is **always** drawn, always a multiple of `P.grid` (major lines sit on minor lines), and the grid looks exactly as before at normal zoom. For the default 10 cm step (and 25 cm) this walks 1 m → 2 m → 5 m → 10 m → 20 m → 50 m → 100 m → 500 m as you zoom out. `defsSvg()` sizes the tiles from `gridScale()` (falling back to `P.grid` when the minor grid is hidden); `gridSvg()` has no `view.z` gate any more.
- **Zoom range.** `MIN_ZOOM = 0.002` / `MAX_ZOOM = 8` (≈ 2 km across a 1000 px canvas, ~5 km at 1400 px) are shared by `zoomAt()` and `fit()`, so a site plan can be framed with **0 / Fit**. `applyView()` prints the active interval in `#gridlbl` ("Izgara 1 m") and keeps `#zoomlbl` readable below 1 % (one decimal).
- **Snapping stays on `P.grid`.** `snapToGrid()`, `snapPt()` and the adaptive grid are deliberately independent: the drawn step is visual only, so pointing never jumps when the grid coarsens.
- `syncGridUI()` must be called whenever `P.grid` / `P.gridType` changes outside the footer controls (load, undo/redo) — it handles the "Özel…" custom-step input.

### Wall corners (`wallJoints`, issue #14)
Wall bodies end **butt** (flat) at their endpoints in 2D and 3D. `wallJoints(f)` groups coincident endpoints (≤ 1 cm), sorts the walls by outward angle and intersects neighbouring face lines to find each miter point; the convex hull of the butt corners plus the outward miter points is the filler polygon. Miters longer than 2.5 × max thickness are dropped (bevel). `jointsSvg()` fills it with `pal().wall` in 2D; `build3D()` extrudes it to the lowest solid wall height. T-junctions (an end on another wall's middle) need no filler — the through-wall covers the butt end. Guard: `tests/wall-joints.test.js` runs the real functions cut out of `app.js`.

### Numeric wall length (issue #36)
`applyWallLength(w, len, end = wallFree(w), conn = ui.connWalls)` moves the free end along the wall's own direction (a hinged wall keeps its pivot), drags coincident ends of other walls (< 1 cm) when `conn`, and keeps openings in place (`d` shifts when the `a` end moved) clamped to the new length — for the wall and for every connected wall it moved. Three entry points: a single selected wall + digits / `Enter` (`ui.lenTyped`, shown by `drawPreview`; `Backspace` edits the buffer instead of deleting); the canvas length label (`wallDimSvg` carries `data-wdim` except while exporting → `openWallDimInput()` puts a fixed `#wdimInput` over it); digits typed while dragging a `wa`/`wb` handle (`ui.drag.typed`; `doHandle` places the end exactly that far from the other end, toward the cursor). The panel `len` field uses the same routine on `change` only, so half-typed values never squeeze openings. Guard: `tests/wall-length.test.js` + a smoke check.

### Trim / split / corner (issue #15)
`trim` tool (`X`): `wallCuts(w)` lists where other wall centrelines cross `w` (cm from `a`, ends excluded); `trimPlan(w, click)` picks the nearest crossing on each side of the click and `trimWall()` removes that piece — an end overhang moves the end, a piece between two crossings splits the wall (`splitWallAt`). Openings on the kept part are re-based, those on the removed part are deleted via `deleteIds`. The hover preview paints the doomed piece red. Wall panel: **✂ Split at intersection** (`splitx`, one wall) and **⌐ Join corner** (`corner`, exactly two walls → `joinCorner()` moves each wall's nearer end to the line intersection, trimming or extending). Guard: `tests/wall-trim.test.js`.

### Free slabs & floor voids (issues #22, #23)
- `slab` (`K`) and `void` (`Y`) are polygon tools like `poly` (`POLY_TOOLS`): the first press starts a `prect` drag — dragging makes a rectangle, a plain click starts click-the-corners (Enter / first point / double-click finishes). `addPolyObj(tool, pts)` creates the room, `mkSlab` or `mkVoid`.
- Both are ordinary kinds in `KINDS` (`slabs → slab`, `voids → void`), so find/select/delete/copy/undo work unchanged. Point-list kinds are listed in `PTS_KINDS` (move, rotate, bbox, paste) and closed polygons in `POLY_KINDS` (vertex/edge handles, X/Y/W/D fields). **Add new pts-based kinds to these sets, not to scattered `kind === 'room'` checks.**
- 2D (`layerStrings` rooms layer): slabs under rooms, voids over them. Their hit shapes carry `data-low` (void 1, slab 2) so `pickDataId()` only picks them when nothing else is under the cursor — a large balcony must not steal clicks from furniture or room labels.
- 3D: free slabs are extruded `t` cm down from `elev + off + 0.2` (+0.1 per overlap level) so their top never z-fights the automatic slab; furniture whose centre is on a slab is raised/lowered by that slab's `off`. `voidHoles(voids, pts)` returns the voids that lie inside a polygon (edge-touching counts — stairwells snap to room corners) pulled 0.5 cm inward, and `build3D` adds them as `Shape.holes` to the automatic slab, the free slabs and the room floors of **that floor**. A void on floor N is the hole in floor N's slab, i.e. the ceiling of floor N-1. Voids that straddle a polygon edge are skipped (no CSG).
- A floor with no walls gets no automatic slab from slabs/voids alone (`slabPolys` ignores them). Guard: `tests/slabs-voids.test.js` + a smoke check.

### Parametric stairs (issue #33)
- `stairSteps(o)` is the single source of treads for `k: 'stairs'`: `{ n, riser, tread, type, steps: [{ x, y, w, d, a, z, dx, dy, across, run, flight, landing }] }` in local plan coordinates (climbing toward −y on a straight stair, like the 2D arrow). `n = stairN(o)` = `stepN` or `round(h / 17.5)`, clamped 2–60 — legacy stairs without fields open as straight with a right-hand rail. L and U stairs get one landing (one riser); spiral sweeps 270° around a pole.
- `furnBody` draws every step with `stepCorners()` + a walking line and arrow; `furn3D` extrudes the same steps (open treads on a spiral) and builds railings from `stairRails()` (posts every third step, sloped handrail boxes with Euler order `YZX`). Up to ~45 meshes with rails on both sides.
- Panel: type, riser count, railing, riser / tread readout, `blondel(riser, tread)` (60–64 cm ✓, 57–67 ≈) and `stairfit` (h = wallH + 20, risers re-derived). Guard: `tests/stairs.test.js` + a smoke check.

### Wall types: curtain mullions, railings & fences (issues #71, #73)
- `WALL_TYPES` = `solid | curtain | railing | fence`; `isLowWall(w)` is true for railing / fence, `isSolidWall(w)` for solid (or no `wt`). **Use these instead of `wt === 'curtain'` checks.** `setWallType(w, v)` is the panel / undo-safe switch: a full-height wall going to railing / fence drops to `LOW_WALL[v].h` / `.t` (railing 100 / 6, fence 110 / 8) unless it is already low; going back raises it to `curFloorH()` / `P.wallT`; leaving curtain drops `mul` / `mulN`.
- **Curtain mullions:** `curtainBays(w)` is the only reader: `mulN` (intermediate mullion count, 0 = one pane) wins, else `round(L / (mul || MUL_DEF = 120))`. Absent fields = the old 120 cm module, so old projects are unchanged. Panel fields `mul` / `mulN` show only when every selected wall is a curtain wall (batch edit through `applyProp`); setting `mul` clears `mulN`. 2D ticks (`wallSvg`) and 3D mullions (`build3D`) both use it.
- **Railings / fences:** `lowWallSolid(L, ops)` = the runs between openings (a door on a fence is a gate gap), `lowWallPosts(w, L, ops)` = posts every ≤ `LOW_WALL[wt].post` (120 / 200 cm). 2D `lowWallSvg(w, C, f)` (two thin rails / a centre line with pickets + square posts, `pal()` or the wall paint), 3D `lowWall3D()` (posts, handrail + bottom rail + balusters, or posts + two rails + pickets; no skirting / cap), sections and elevations `railElevSvg()` (open rails, posts and bars). `wallJoints()` skips low walls, so they get no corner fillers. `wallSvg(w, live, f)` now takes the floor so railings can leave gaps at openings. MCP `add_wall` / `update_object` accept `wt` railing / fence, `mul` / `mulN` and `rs` (`cleanMullions`).
- **Railing styles.** `RAIL_STYLES` / `railStyle(o)` (the only reader; absent = `bars`) for railing walls **and** stairs / ramps: `bars` (posts + balusters), `glass` (shoe, glass panel, handrail), `cable` (handrail + horizontal bars), `solid` (parapet + cap, no posts). Drawn by `lowWallSvg` / `lowWall3D` / `railElevSvg` (the face prim carries `rs`), the stair rails in `furn3D` (`piece()` along each flight) and the ramp rails (`slope()`). Panel field `rs` for railings and for stairs / ramps that have a railing; the last style picked is remembered in `ui.railRs` for the next drawn railing.
- **Railing tool** (`Q`, `TOOLS` entry `railing`): `setTool('railing')` sets `tool = 'wall'` and keeps `ui.btn = 'railing'`, so the wall tool's snapping, typed lengths and preview are reused; new pieces come from `toolWall()`, which turns them into railings. The HUD shows `HINTS.railing`.

### Ramps (issue #58)
- Catalogue item `ramp` (`k: 'ramp'`): `w` = width, `d` = horizontal length, `h` = rise. Like stairs it climbs toward local −y (low end at +d/2). `rampType(o)` (`RAMP_TYPES`: accessible / vehicle / landscape, default accessible) and `rampRail(o)` (`railing`, default `both`, `none` for vehicle ramps) are the only readers of the optional fields, so legacy-free defaults need no `normalizeProject` work.
- `rampSlope(o)` → `{ pct, ratio, deg, cls }`; `cls` (`RAMP_CLS`): ≤ 6 % `ideal`, ≤ 8 % `access`, ≤ 15 % `vehicle`, else `steep`. The panel shows % / 1:X / degrees with a coloured badge; an accessible ramp steeper than 8 % offers **↔ Lengthen to 8 %** (`rampfit`, keeps the rise).
- 2D (`furnBody`): outline, anti-slip lines, curb lines (accessible), rail lines, an up arrow and a `%6.7 · ↑40` label (exported too). 3D (`furn3D` case `ramp`): one `ExtrudeGeometry` wedge, 5 cm curbs (accessible), grooves (vehicle, detail only), posts about every 150 cm and handrails at 90 cm (+ 70 cm on accessible ramps) parallel to the slope. `isStructFurn` includes ramps for the floor underlay.

### Height above floor (issue #61)
- Furniture may carry an optional `elev` (cm above the floor, 0–`FURN_ELEV_MAX` = 500). `furnElev(o)` is the only reader (absent / ≤ 0 = 0), so old projects need no default. `build3D` lifts the furniture group by it on top of the free-slab offset (`fy = elev + furnOff(o) + furnElev(o)`); `g.userData.elev` already carries it, so `moveFurn3D` and 3D drags keep the height.
- Wall-mounted catalogue items get a default from `CAT_ELEV` in `mkFurn` (only when `o.elev == null`, so a preset's own value wins): `tvw` Wall TV 80, `art` 120, `shelfW` 150, `ac` 220, `cabU` Wall Cabinet 145, `wmirror` 110. The floor-standing `tv` unit is deliberately not in it.
- 2D (`furnSvg`): a raised item is drawn dashed (the usual "above the cut" convention) with a `▲ +80` tag in front of it (exported too). Panel: **Height above floor (cm)** for every item except stairs and ramps; `applyProp` clamps it. `PRESET_FURN_EXTRA` includes `elev`.
- MCP: `CAT_ELEV` and the six items are mirrored in `mcp/server.js`; `add_furniture` takes `elev` (0–500), `list_catalog` and `summarize` show it. Walls and rooms have no offset on purpose: short walls already make parapets, and free slabs have **Level offset** for platforms. Guard: `tests/furn-elev.test.js` + a smoke check.

### Per-floor wall height (issue #59)
- `Floor.wallH` is optional: `floorH(f)` = `f.wallH` or `P.wallH`; `curFloorH()` for the active floor. `mkWall` (and the MCP `mkWall` / `add_rect_walls`) default new walls to it; `add_floor` accepts `wallH`.
- Floor pitch is `floorH(f) + 20`: `floorElev(i)` sums it over the floors below and is the single source for `archPrims`, `show3D`'s focus elevation and `walkElev`; `build3D` adds `floorH(f) + 20` per drawn floor. **Never use `P.wallH + 20` for stacking again.** Stairs' **Match storey height** uses `curFloorH() + 20`.
- Bulk actions (`applyAct`): `wallhfloor` (wall panel + project panel floor section) sets every wall on the floor to the selected wall's height (or the floor height) and stores it as the floor default (cleared when equal to `P.wallH`); `wallhall` (project panel) sets every wall on every floor to `P.wallH` and clears per-floor heights; `floorhreset` drops only the floor default. All three `commit()`, so undo restores the walls. `fitOpsToWall(f, w)` keeps doors and windows inside a lowered wall (height first, then sill; windows keep a 5 cm lintel). The floor height field and MCP `add_floor` share `FLOOR_H_MIN`/`FLOOR_H_MAX` (100–800); entering the project default clears `f.wallH`. The wall-panel button only shows when every selected wall has the same height.

### Drawing layers (issue #32)
- `P.layers` / `P.activeLayer` are project data (undo, save, tabs). An object's `layer` field is **optional: absent = '0'** so projects without custom layers stay byte-identical. `commit()` calls `stampLayers()`, which stamps objects without a layer with the active layer — only when the active layer is not '0'. Because of that, `layerAct('lyradd')` first stamps every unlayered object '0' (`stampLayers(true)`), and `normalizeProject()` does the same whenever a project has more than one layer.
- `visFloor(f, print)` is the single filter: a shallow copy of the floor without objects on hidden layers (and, with `print`, layers whose `print` is false); openings on hidden walls drop too. Used by `layerStrings` (`print` = exporting), the underlay, `build3D`'s floor loop and `archPrims`. `pickable(id)` (visible and unlocked) gates `pickDataId`, `idsAt`, box select, Ctrl+A, `deleteSel` and 3D picking.
- UI: `layersPanelHtml()` in the project panel (radio = active, colour, name, 👁 / 🔒 / 🖨, 🗑 moves objects to Default), `selLayerHtml()` in every selection panel (`data-k="sellayer"`), footer `#sLayer` synced by `syncLayerUI()` from `refresh()`. Guard: `tests/drawing-layers.test.js` + a smoke check.

### Sections & elevations (issues #30, #31)
- One projection engine: `archPrims(spec)` projects **every floor** onto a vertical plane (`spec = { O, n, cut, crop }`, view direction `n`, drawing axis `u = (-n.y, n.x)` = the viewer's right, height `z` from `floorElev(i) = i·(wallH + 20)` like `build3D`). It returns pure data (`face` / `cut` / `glass` / `label` prims + `levels`); `archSvg(spec, title)` paints it far-to-near on white paper (`pal(true)`) with level datums (`fmtLevel`: ±0.00, +2.90), a ground line, title and 2 m scale bar.
- **Section** (`cut: true`): walls crossing the plane become solid cut bands (split around an opening at the cut point; width = `t / sin` of the crossing angle), the part beyond becomes a face; slabs (`slabPolys` + free slabs) are cut with `lineCutIntervals` minus voids (`subIntervals`); rooms crossing the line are labelled; everything is cropped to the section line's extent. **Elevation** (`cut: false`): `elevationSpec(dir)` puts the plane outside the building looking along `ELEV_DIRS[dir]`; every wall is a face with its openings as holes.
- **Section objects** live in `Floor.sections` and are an ordinary kind (`KINDS.sections`) drawn in the dims layer by `sectionSvg()`. Line-type kinds share `AB_KINDS` (`wall`, `dim`, `section`) in move / rotate / mirror (mirroring negates `dir`) / scale / paste / nudge / 3D drag; endpoints reuse the `da`/`db` handles. Tool `section` (`L`, `ui.secStart`); `nextSectionName()` hands out A, B, C….
- **3D cutaway:** `ui.secCut` = section id; `applySecClip()` sets `T3.r.clippingPlanes` to the plane (keeps `d > 0`) and runs at the end of every `build3D`; `lookAtSection()` / `camAlong()` face the cut. **Facade cameras:** `set3DCam('north'|'east'|'south'|'west')` (`#b3dN/E/S/W`, labels K/D/G/B in Turkish).
- `archModal(key)` (`ui.modal === 'arch'`, keys `sec:<id>` / `elev:<dir>`) tabs through all sections and the four elevations and downloads SVG / PNG (`svgToPng`). Guard: `tests/section-elevation.test.js` + a smoke check.

### Command line (issue #43)
- `:` (any layout that produces `e.key === ":"`, no Ctrl/Alt, no open modal) opens `openCmdPalette()` — checked in the window `keydown` handler **before** the 3D branch, after the `typing` early return, so text / number fields never trigger it and wall-length digits are untouched. The overlay (`#cmdPal` / `#cmdIn`, created on demand like `#ctxMenu`, not in `index.html`) stops propagation of its own keys, so walk keys and single-key tools never fire while typing.
- `cmdList()` is built only from existing actions: every `TOOLS` entry (`setTool`, which already leaves 3D) plus undo / redo, 2D / 3D, fit, save, print, PNG / SVG / JSON, open, new, flip H / V, scale, select all, delete, duplicate, group, elevations, layers, render studio, snap, theme, language, help — each with its existing shortcut label. `in3d: true` runs in place in 3D; anything else calls `show3D(false)` first (`runCmd`). **Add new actions here** when you add a toolbar button or shortcut.
- `cmdFilter(cmds, q)` folds case and accents with `foldText()` (ı / İ / I → i, then NFD without marks), requires every query word somewhere in EN + TR names, aliases and key, and ranks name-prefix > word-start / exact key > substring. Guard: `tests/command-line.test.js` + a smoke check.

### Multi-part furniture (programmable furniture, parts schema v1)
- A furniture item may carry `parts` (≤ `PARTS_MAX` = 64, warn above 40): `{ type: box|cyl|sphere|extrude, x, y, z, w, d, h, rot?, color?, mat?, axis?, pts?, name? }` in **item-local cm** (centre 0,0, y down, **`z` = bottom elevation**). `cyl` is upright unless `axis: 'x'|'y'` (lying; `w × d × h` is always the bounding box); `extrude` lifts the `pts` outline (relative to `x, y`) by `h`. `mat`: `matte` (default, omitted) / `gloss` / `metal` / `glass`. `pbase` = the box the parts were designed in; `partsScale(o)` scales them when `w/d/h` differ, so resize / group scale need no special code. `partsV` = schema version.
- **One engine, two copies:** the block between `/* PARTS-ENGINE:BEGIN` and `/* PARTS-ENGINE:END */` (`cleanPart`, `cleanParts`, `partIssues`, `partBounds`, `partsScale`, `validateParts`, `billiardParts`) is pure JS and is pasted **verbatim** into `app.js` and `mcp/server.js`; `tests/furniture-parts.test.js` fails if they differ. Change it in one file, copy it to the other.
- `cleanParts(o)` (lenient) runs in `normalizeProject()` of both files; items **without** a `parts` field are not touched, so old projects stay byte-identical. `partIssues(p, base)` (strict) is what the MCP tools use to reject bad parts.
- 2D: `furnBody()` → `partsSvg()` draws the parts top-down, lowest top first, as one group at `pal().furnOp`, stroked with `pal().furnStroke` (`vector-effect="non-scaling-stroke"`); a transparent bbox rect is the hit area, and the emoji icon is skipped. 3D: `furn3D()` → `parts3D()` reuses the shared unit box / cylinder / sphere geometries (only `extrude` allocates) inside a group scaled by `partsScale`; `C.pmat(color, mat)` caches Phong materials in `matCache` so they are disposed with the rest. One mesh per part, no edge lines.
- Mirror negates part `x` / `rot` (and `pts` x); **⇄ Swap W/D** turns the parts 90° and swaps `pbase.w/d`. Library presets carry `parts`, `pbase`, `partsV` through `PRESET_FURN_EXTRA`. Catalogue items can be part-based via `CAT_PARTS` (`billiard` → `billiardParts`), applied in `mkFurn` in both files. The panel shows a 🧩 part count (red ⚠ when `validateParts` fails).
- MCP: `get_furniture_schema`, `create_furniture` (`template`: any `FURN_TEMPLATES` key, e.g. `'chair'`, `'billiards'`), `add_component` (single or `parts: [...]`, all-or-nothing), `update_component`, `remove_component`, `set_material`, `set_transform` (`scaleParts`), `validate_furniture`, `save_furniture`, `place_furniture`, plus resources `floorplanner://schema/furniture-parts` and `floorplanner://example/billiards-table`. `update_object` with `props.parts` is cleaned too. Not built yet (later phases): a furniture library shared across projects, the built-in AI assistant, a CodeAct sandbox, per-item version history.
- **Furniture studio (visual creator / editor).** A full-screen overlay `#fstudio` (created on demand, not in `index.html`; `ui.modal === 'parts'`, `body.fs-open`). Entry points: panel button `data-act="parts"` → `pbStart(o)`; the **Create furniture** card `[data-fsnew]` in My Library and the `furnstudio` command → `fsNew(tpl?)`. State: `ui.pb = { id (null = new), name, sel, d: { w, d, h, color, parts }, hist, hi, snap, guide, f3 }` — a **draft** in the design box (`pbase`) with its own history (`fsPush()` after every finished action, `fsUndo(±1)`). Views: `fsViewSvg(view)` for `top` (x, y) / `front` (x, −z) / `side` (−y, −z), one `[data-pi]` group per part, handles `fsHandles` (`w± d± rot` in top, `a± top bot` in front / side; `fsHorizKey` maps a rotated part's w ↔ d). `fsStartDrag` moves / resizes with `fsMoveAxis` → `fsMagnet` (edges and centres stick to other parts, the box and the floor; z sticks to tops) or 1 cm grid (**Snap** off = free). Blocks `FS_BLOCKS` are functions of the box; a block with its own `z` keeps it, others `fsSitOnTop`; drag-and-drop uses `text/plain` `fsblk:<key>` and `fsDrop`. 3D: `fs3DInit` (own `WebGLRenderer` + `OrbitControls`; raycast select, drag on a horizontal plane, Shift = vertical), `fs3DBuild` reuses `parts3D` with its own `pmat` / unit geometries, `fs3DDispose` on close. Keys go to `fsKey` (the window `keydown` routes there before anything else touches the plan). `pbApply(toLib)` refuses while `pbIssues()` has errors, keeps an existing item's scale, places a new piece at `view2DCenter()` and adds a library preset (always for new pieces), then `commit()` **once**. `closeModal()` calls `fsClose()`, so an AI bridge push also closes the studio. Templates live in `FURN_TEMPLATES` inside the shared PARTS-ENGINE block (also `create_furniture { template }` in MCP). Guard: `tests/parts-builder.test.js` + a smoke check (drop, front-view drag, resize handle, Fit box, keys, studio undo / redo, mirror, 3D select + drag, Place in plan + library, template, Esc).
- Guard: `tests/furniture-parts.test.js` (engine parity, defaults, validation, billiards reference, app wiring, MCP round-trip) + a smoke check (one item, 2D shapes per part, felt at 79 cm and balls on it in 3D, the cue lies along the table and turns with ⇄ Swap W/D, mirror stays valid). MCP tools that edit parts refuse items without `parts` (only `add_component` converts one, after its parts validate), and `set_transform` without `scaleParts` keeps the parts' current visible size.

### Library presets (issue #42)
- `P.lib.presets = [{ id, name, kind: 'op'|'furn', type, w, h, sill?, flip?, side?, d?, k?, icon?, color?, extra? }]` lives next to `P.lib.shapes` (one project library, tab **⬡ Kütüphanem / My Library**). `presetFromObj(kind, o, name)` copies the placement-relevant fields; `extra` deep-copies optional fields (`PRESET_OP_EXTRA`: #41 `mat/color/frameCol/glass`; `PRESET_FURN_EXTRA`: stair fields, `pts`) — add new optional object fields there. Presets copy values at placement time only; they are **not** linked types.
- `presetDef(p)` turns a preset into a `startPlace()` def (op presets borrow the `OPDEF` id whose `opType` matches); `mkOp` / `mkFurn` copy `def.extra`. Placement stays in the tool, so several copies go down in a row. Swing side follows the cursor like built-ins (a stored `side` is meaningless on another wall); `flip` is applied.
- Cards (`data-type="pre"`, `presetSize()`) show in My Library, op presets also under Doors & Windows, and in search; `data-renpre` / `data-delpre` rename / delete with `commit()`, so undo restores them — `restore()`, `loadProject()` and `activateTab()` now call `buildLib()`.
- Session quick win: `ui.opLast[defId]` remembers the last edited `w/h/sill` of a built-in opening (`rememberOpSize` on a final panel change; `ui.opSrc` maps openings placed this session to their card, other openings map by type except windows). `opDefLast()` applies it to the built-in card and its label. Not persisted.
- `mcp/server.js` defaults `lib.presets` in `normalizeProject` / `newProject`, so `load_project` / `get_project` / `set_project` keep them. Guard: `tests/library-presets.test.js` + a smoke check.

### Mirror & scale (issue #28)
- `mirrorObjs(os, o, u)` reflects a selection about the line through `o` with unit direction `u` (`reflectPoint`). Walls keep `a`/`b` order, so openings keep `d` and only `side` is negated; hinged-wall `angles` become `2·axis − a`; dims negate `off`; `PTS_KINDS` polygons are reflected **and reversed** (winding kept); furniture gets `rot = 2·axis − rot + 180` so its back (−Y) still faces the same wall (`poly` shapes mirror local x); text stays readable. Ops are only moved through their walls.
- `flipSel('h'|'v')` mirrors about the selection bbox centre (`Shift+H` / `Shift+V`). The `mirror` tool (`I`) picks a two-point axis (`ui.mAxis`, snapped, angle-locked) with a dashed axis + mirrored-outline preview, then asks whether to erase the originals; keeping them copies the selection in place with `paste(true, 0)` (attached openings included) and mirrors the copy.
- `scaleObjs(os, orig, tx, ty, sx, sy, scaleT)` is the single scaling routine, shared by the `g0..g3` group handles and `scaleSelection()`/`scaleSelPrompt()`. `parseScale()` accepts `1.5`, `150%`, `=450` (target width) and `300:450` (reference → target). Wall thickness is kept unless `scaleT`. Panel row (`flipH flipV mirror scale`) and right-click entries (`data-cmxf`). Guard: `tests/mirror-scale.test.js`.

### Project tabs (issue #17)
- `#ptabs` (below the header) lists `tabs[]`; click switches, double-click renames, `×` closes, `＋` opens the template picker. `switchTab()` = `syncTab()` (globals → current tab) + `activateTab()` (tab → globals, then `refresh()`, `updateUndo()`, `autosave()`, 3D rebuild if open). Each tab keeps its own `hist`/`hi`, floor, view and selection; `ui.clip` is global, so copy/paste works across projects.
- **Opening never destroys work:** the template picker, *My Projects* and *Open file* call `newTabSlot()` before `loadProject()` — if the current plan is not pristine (`isPristine()`), a new tab is inserted next to it. `loadProject()` ends with `syncTab()`. The AI bridge still loads into the **active** tab, and only the active tab is pushed to it.
- Persistence: `autosave()` also writes `tabsState()` to IndexedDB `state`/`'tabs'` (project JSON only, not history; empty list with a single tab). Boot loads `'auto'` as before, then `restoreTabs()`; the active tab's content comes from `'auto'`.
- `closeTab()` asks to confirm unless the plan is pristine or identical to its saved copy in the `projects` store; closing the last tab opens a blank project. `normalizeProject()` is the back-compat default filler shared by `loadProject()` and tab restore.

### Layering / overlapping objects
- **Order = array order** within a kind (`LAYER_ARR`: furn, rooms, texts, sketches, dims); later draws on top in 2D. `reorderSel('front'|'back'|'up'|'down')` rewrites those arrays — `up`/`down` jump past the next *overlapping* item (bbox), so one step always changes what is visible. Panel row (`data-act="layer"`), right-click menu and `Ctrl+]` / `Ctrl+[` (`e.code`, so it works on non-US layouts; `Shift` = to front/back).
- **Picking:** `idsAt(x, y)` lists every `data-id` under the cursor (top first). `Ctrl+click` (`cycleStackAt`) selects the next one down; it clears `ui.drag.clickedId` so it never toggles a door or cycles a layout. In the select tool, right-click opens `#ctxMenu` (created on demand, not in `index.html`).
- **3D:** `stackLevels(list, kind)` gives each item 1 + the level of the highest earlier item whose bbox it overlaps. Rooms sit at `elev + 0.6 + level·0.5`, furniture is built inside an inner group lifted by `level·0.5` cm. Without this, coplanar surfaces (overlapping room floors, pools laid end to end) z-fight and flicker, and the 3D stacking ignored the 2D order. Guard: `tests/layers.test.js`.

### Floor finishes & custom textures (issues #39, #40)
- **Glass floor (issue #57):** `glass` in `FLOORS`/`FLOORS_EN` for rooms, free slabs and the floor slab, with `glass: 'clear' | 'frosted'` (`glassFld()` shows the picker only when the finish is glass). 2D: `p-glass` (100 cm panels + sheen lines, `pal().glass` tint). 3D (`build3D`): `glassCuts` (glass rooms and glass free slabs) are passed to `voidHoles()` like voids, so they cut the automatic slab, free slabs and any room that contains them; `glassFloor(pts, top, th, frosted, holes)` builds a translucent `MeshPhongMaterial` panel (0.35 clear / 0.65 frosted, `depthWrite: false`, `userData.glassFloor`), a 6 cm perimeter frame and, with detail on, 100 cm joints via `lineCutIntervals` (max 80). A glass free slab is a glass panel instead of an opaque extrusion; `slabFloor: 'glass'` makes the whole floor slab glass. Sections/elevations still draw glass as an ordinary slab.
- **Outdoor finishes (issue #39):** `grass`, `water`, `gravel`, `deck`, `asphalt` added to `FLOORS`/`FLOORS_EN` for rooms, free slabs and floor slabs. 2D: hatch patterns in `defsSvg()` styled via `pal()`. 3D: procedural `CanvasTexture`s via `floorTexture()`; `water` creates a translucent shiny `MeshPhongMaterial` (`transparent: true, depthWrite: false`) built as a separate water surface above an opaque `waterBed(col)` to prevent z-fighting; catalogue `pool` furniture is untouched.
- **Custom textures (issue #40):** `P.textures = [{ id, name, w, h }]` holds metadata only (real-world repeat size `w`/`h` in cm). Image payloads live outside `P` in IndexedDB store `textures` (`DB_VER = 2`) and in the runtime `TEX` map (`blob:` URLs for live canvas, `data:` URLs for exports), keeping undo snapshots (`hist[]`) lightweight.
- Surfaces use `floor: "tex:<id>"`. `finishKind(kind)` checks builtins or ready custom textures (`texIdOf`, `texMeta`); `finishPat(kind)` maps to SVG pattern ids (`p-tex-<id>`). `floorOpts()` populates `<select>` pickers. Upload via Project panel or room panel downscales images to ≤ 1024 px (`TEX_MAX`) and prompts for name and repeat size (`parseTexSize`).
- Deleting a texture resets referencing surfaces to solid color (`none`), keeping the image in IndexedDB so undo restores it without re-uploading. `bundleTextures(p)` bundles `texData: { [id]: dataUrl }` for JSON download; `absorbTextures(p)` caches and saves imported textures to IndexedDB and strips `texData` before `normalizeProject()`. MCP tools accept `tex:<id>` for project textures. Guard: `tests/finishes-doors.test.js`.

### Door materials (issue #41)
- Door leaf material `op.mat` ∈ `wood | glass | paneled | metal` (`DOOR_MATS`). Defaults: `slide` defaults to `glass`, hinged doors to `wood`. `op.glass` ∈ `clear | frosted` (`GLASS_KINDS`) picks a clear (opacity 0.38) or frosted (whiter, 0.72) pane on glass / paneled leaves.
- Colours: `op.color` overrides leaf colour (`doorLeafCol()`, default `#b08968`), `op.frameCol` overrides the frame/casing colour (3D jambs + head; panel field on doors and windows). Side panel exposes material, glass, leaf colour, frame colour and a **Default colours** reset (`opcolreset`).
- 2D: `opSvg()` uses `leafLn()` for the leaf: glass = glass-filled line with a thin edge, paneled = heavy line with a glass core, metal = heavier line; sliding glass panels are filled with `pal().glass`.
- 3D: `doorLeaf3D()` builds the leaf (wood: inset panel + lever; glass: pane + pivot blocks + steel pull bars; paneled: stiles/rails around a pane; metal: grooved slab) inside the existing hinge / slide groups, so `open`/`side`/`flip` are unchanged. Legacy glass sliders keep their original panels. MCP `add_opening` exposes `material`, `glass`, `color` and `frameColor`. Guard: `tests/finishes-doors.test.js`.

### IFC import (Revit / BIM)
- **One parser, two copies.** The block between `/* IFC-IMPORT:BEGIN` and `/* IFC-IMPORT:END */` is pure JS (no DOM, no globals) and is pasted **verbatim** into `app.js` and `mcp/server.js`; `tests/ifc-import.test.js` fails if they differ. `ifcToProject(text, { uid, L, colors, name })` → `{ project, stats }` (`stats`: `schema, floors, walls, ops, rooms, slabs, voids, skipped`). Entry points: `openPlanFile(file)` (`#fileOpen`, which now accepts `.ifc`, and a file drop on `#stage`) → `importIfcText()` → `newTabSlot()` + `loadProject()`; MCP `import_ifc { path }`.
- **Reading STEP.** `ifcParse` makes one pass over `DATA;` and indexes `#id → { t, s, e }` plus `byType`; parameters are parsed on first use (`ifcValues`: `$`/`*` → null, `#12` → `{ r }`, `.X.` → `{ e }`, `TYPE(v)` → `{ tv, v }`, strings via `ifcStr` for `\X2\ \X\ \S\`). ifcXML, ifcZIP and non-STEP text throw. Units: `LENGTHUNIT` (SI prefixes, `IfcConversionBasedUnit` such as feet) → cm, `PLANEANGLEUNIT` → radians. Plan `x = X`, `y = −Y`.
- **Geometry.** `place()` resolves local placements / axis placements / transformation operators to `{ o, x, y, z }` frames. `solid()` collects world points from extrusions (rectangle, circle, arbitrary, derived and composite profiles), the **first operand** of boolean results (the second too only for `UNION`), mapped items, faceted breps / shells, polygonal and triangulated face sets and bounding boxes; vertical extrusions and the largest bottom brep face also give a footprint polygon. Representations used: `Axis`, `FootPrint`, `Body` (and `Box` as a fallback).
- **Walls.** The body's extent across the axis gives the thickness **and** the true centreline (Revit's location line may be a face); then material layer sets, then 20 cm (10 for curtain walls). Curved axes (trimmed circles) become segments every 10°; a wall without an axis uses `ifcPca` (minimum-area rectangle of the convex hull). Curtain walls take the points of their aggregated children; stacked-wall parents whose parts are walls are skipped. `ifcJoinWalls` then moves nearby ends to the intersection of the two centrelines (corners) or extends an end that stops short of another wall's body (T), so `wallJoints()` closes them.
- **Openings.** `IfcRelFillsElement` / `IfcRelVoidsElement` link door / window → opening → host wall; the opening's body gives `d`, `w`, `h` and `sill` (relative to the wall's base), with the door / window body and `OverallWidth/Height` as fallbacks and the nearest wall (≤ `t/2 + 60` cm) when there is no relationship. Type: windows → `window`; doors → `slide` / `double` from the operation type, else `double` when ≥ 150 cm wide; unfilled openings → `arch` (or `window` with a sill). Swing side is always the default (`side: 1, flip: 0`).
- **Rooms, slabs, voids, floors.** `IfcSpace` → room (name = `LongName`, else `Name`); `IfcSlab` except `ROOF` → free slab (`t` = depth, `off` = top − storey elevation); openings in slabs → voids. **Storeys by elevation (#72):** `storeyOf(id, z)` trusts containment / aggregation only while the geometry lies inside that storey's band (`z ≥ storey − 30` and `< next storey − 30`), else the storey at that elevation — Revit elements hosted on an upper level with a negative offset land where they are. `spanOf(id, z0, z1, h)` returns one piece per storey a wall or column overlaps by more than 30 cm (the piece under a storey stops 20 cm below it, like the floor pitch); openings pick the piece whose height range holds them. Empty storeys are dropped.
- **Columns, railings, components (#72, #73).** `IfcColumn` → catalogue `column` (round footprint) or `colSq` (rectangle, `ifcRect()` = minimum-area rectangle → `w`, `d`, `rot`), else a `shape` polygon, one per storey spanned, with `elev` when its base is off the floor. `IfcRailing`, and proxies whose name / type says railing (`RAIL_RX`: railing, handrail, korkuluk, fence…; Revit often exports railings as proxies), become `railing` (or `fence`) walls (6 cm default, ≤ 10 cm, sloped stair rails → 100 cm). **Path:** `railSegs()` clusters the long plan edges of the railing's faces by direction and offset (≤ 15 cm apart, same line), so one-piece L / U / bent railings come in as several joined segments (`ifcJoinWalls` closes the corners) and the glass / rail thickness becomes `t`. **Style:** `IFC_RAIL_STYLE` word matches on names and materials (cam / glass → glass, kablo / cable / halat → cable, parapet / beton → solid; a transparent style → glass). Railings inside a stair or ramp are not walls: `railInfo()` sets the stair's / ramp's `railing` side (left / right / both, by the rail centre against the flight frame) and `rs`. `IfcBuildingElementProxy`, `IfcFurnishingElement`, `IfcFurniture`, `IfcSystemFurnitureElement`, `IfcSanitaryTerminal`, `IfcElementAssembly` (children of an imported assembly are skipped) → `type: 'shape'`, `k: 'poly'` with the plan footprint, `h` = height and `elev`. A component made of **2–64 separate solids** (`leavesOf`: body items, mapped sources and aggregated parts) becomes **one multi-part item** (`partsItem`: a box part per rectangular solid, an extrude part otherwise, each with its own `z` / `h` and style colour; `pbase` = the item box, `partsV: 1`), so e.g. Revit box-profile bands on several floors are no longer extruded into one tall block. Component footprints use the minimum-area rectangle (`ifcRect` → true `w` / `d` and `rot`, `pts` local to it); a footprint that the 5 mm outline cleanup collapses (2 mm steel sections) falls back to the body hull, and only footprints under 0.5 cm² are skipped. I / T / L / U / C / Z profile defs give their outer rectangle. **Proxy windows / doors:** Revit often exports window and door families as `IfcBuildingElementProxy` with no `IfcRelFillsElement`; a proxy whose body centre lies in an unfilled opening (±10 cm, `proxyFill`) becomes that opening's window / door (name says door / kapı → door, window / pencere → window, else by sill), takes its colours, and is not imported again as a shape. Names drop Revit's trailing `:123456` id. `stats` adds `columns`, `railings`, `components`, `roofs`, `stairs`, `ramps`.
- **Roofs.** `IfcRoof` (its own body, else its aggregated parts) and `IfcSlab` `ROOF` not inside an imported roof → one furniture item `{ type: 'roof', k: 'roof', faces, fbase, elev }`. `solid()` takes an optional `fc` array and emits face polygons (extrusions: base, top and sides; breps: outer bounds only; polygonal / triangulated face sets); `facesOf(id)` collects them for the body. More than `IFC_ROOF_MAX_FACES` (600) faces → the hull of the footprint extruded to the roof height. App side: `roofFaces(o)` scales the faces by `w / d / h ÷ fbase` (so resize and group scale need nothing else), `roofSvg()` draws the upward faces lowest first, `roof3D()` triangulates each face in its own plane (`THREE.ShapeUtils`) into one mesh, `mirrorObjs` / **Swap W/D** transform the faces, `archPrims` projects them as `rpoly` prims (sections: only faces beyond the cut), `PRESET_FURN_EXTRA` keeps `faces` / `fbase` / `elev`; the parts studio is hidden for roofs.
- **Ramps.** `IfcRamp` (one catalogue `ramp` per `IfcRampFlight`, else the whole ramp) and flights without a ramp → `k: 'ramp'`. Direction and frame as for stairs (shared `climb()`); `h` = rise of the **top surface** between the two ends (highest point in the end 10 % at each end, so the slab thickness does not count), `elev` = top of the low end; `rampType` `vehicle` when a name says car / vehicle / garage / parking / otopark / araç or the ramp is ≥ 250 cm wide, else `accessible`; `railing` both / none from the railings inside it. Switchback ramps come in as several straight ramps.
- **Colours & materials.** `styleOf()` reads `IfcSurfaceStyleRendering` / `Shading` colour + transparency (through `IfcPresentationStyleAssignment` in IFC2x3). `itemStyle` maps geometry items (`IfcStyledItem.Item`) to styles, `matStyle` maps materials through `IfcMaterialDefinitionRepresentation`; `matsOf()` opens layer set usages, layer / profile / constituent sets and material lists. `looksOf(id)` walks the body items (into mapped sources and the first boolean operand — Revit styles the mapped **source** items), falls back to material styles, and returns `{ col: first opaque colour, glass: any transparency ≥ 0.5, names }`; `looksDeep` tries aggregated parts. Applied: wall paint `w.color` (not for curtain walls, and only when `!ifcNeutral(col)`, so grey / white Revit defaults keep the theme wall colour), railings always; doors `mat` from `IFC_DOOR_MAT` word matches (glass / metal / wood; glass-only styles → glass) and leaf `color`, windows `frameCol`; slabs `floor` from `IFC_FINISH` word matches (Turkish and English names: beton / betonarme / gazbeton → concrete, parke → wood, mermer, seramik, taş, cam…, glass styles → glass) and `color` when not neutral; columns, components, roofs, stairs and ramps `color`. Not imported: textures / images, rooms' colours (rooms keep the palette).
- **Stairs.** `IfcStair` (and flights without a stair) → catalogue `stairs` (`k: 'stairs'`). The first flight's climb direction (low → high end along its long axis) gives `rot` (local −y = up); `w` / `d` / centre are the extents in that frame; `stairType` from `ShapeType` / `PredefinedType` (straight / quarter → `l` / half → `u` / spiral), else from the angle between the first and last flight; `stepN` = sum of `NumberOfRisers`, else h / 17.5; `railing` = both / right / none from the railings inside the stair, which are **not** imported as walls; landings and other stair or roof parts are not imported as slabs or components. The app's L / U stairs turn one way only, so a stair turning the other way keeps its footprint and first flight but its turn is mirrored. Coordinates are shifted so the plan starts near 0 (multiples of 1 m); `P.wallH` = median solid wall height and `Floor.wallH` = storey pitch − 20 when it differs. Not imported: textures / images, full 3D meshes of components (extruded footprints).

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
- Bumping `DB_VER` requires handling in `onupgradeneeded`; currently version 2 with stores `projects`, `state`, and `textures` (keyPath `'id'`, holds uploaded texture images outside `P` and undo history).

### Adjustable layouts & groups (vars)
- Groups: members carry `o.grp`; per-floor `groups[]` holds `{ id, vars: [{ label, poses: {id: pose}, base?, draft? }], idx }`. Room variants live on the room itself (`r.vars`, `r.vIdx`). Clicking a room/group on canvas cycles layouts (`switchRoomVarTo` / `switchGroupVarTo`).
- `snapPose(kind, o)` snapshots an object pose (walls also keep `angles`/`posIdx`; rooms also keep `floor`, `color`, `glass` and `slabT` — #66, restored only when present so old pts-only poses keep the current finish); `applyVarPoses()` restores them — for legacy poses without angles it re-shifts existing presets by the body's rotation delta. `syncActiveVars()` refreshes the active variant's poses while the user edits.
- **First-come ownership:** `poseOwners()` maps id → owning layouts; `roomPoses` / `groupPoses` skip objects already claimed by another layout, so a wall shared by two rooms or furniture shared with a group layout is not double-moved. `dropPoseOrphans()` removes stale poses after ungroup / re-group / delete.
- A room polygon is clickable (`data-rpoly`) while it is selected, has its own layouts or belongs to a group with layouts (`grpHasVars`). In 3D, room floors (and their slab blocks / glass panels) carry `userData.roomId`; the click handler cycles the group or room layout (current floor only, `pickable`), `Alt` selects the room, and a room without layouts still behaves like empty floor (deselect).
- **Room slab thickness (#63):** `roomSlabT(r)` = `r.slabT` (0–200) or `ROOM_SLAB_T` (20) when absent, so old projects need no default. `build3D` extrudes a block of that depth 0.3 cm under the room finish (sides in the floor slab colour), which gives balconies and terraces drawn with the room tools a real edge; `0` keeps the old flat surface, glass rooms get none. Panel field `slabT` (hidden for glass), MCP `add_room` `slabThickness`.
- Alt+click selects a single group member **without** cycling its layout; the layout badge erased with the eraser deletes the whole group.
- **Editing members** (`ui.grpEdit = { id, fl, known }`, view-only): the group panel's **✏️ Edit members** (`grpEditHtml`) makes `grpEditing(o)` true for that group's members, so a click (2D and 3D) selects / drags a single member and never cycles the layout; `Esc` or **✓ Done** (`stopGrpEdit`) ends it. While it is on, `commit()` runs `grpEditAbsorb()` first: groupable objects that were not on the floor when editing began (`known`) join the group through `joinGroup(rec, objs)`, which also writes their current pose into **every** layout's `poses` / `base`, so each layout can then place them separately. Selecting a group plus ungrouped objects gives `varContainer()` type `join` → **➕ Add to group** (same `joinGroup`; `groupSel()` uses it too when it extends a single existing group). Guard: smoke check "adjustable group: edit members…".

### 3D interaction notes
- Picking uses `findAnyFloor()` (ids are unique across floors) and respects **occluders**: only the closest mesh hit is considered — walls/slabs/room floors hide furniture behind them.
- 3D group drags mirror 2D `doMove`: connected wall ends follow (`conn`), hinge pins translate (`pins`), room/sketch polygons update in the plan and are rebuilt into the scene on drop (`schedBuild3D`).
- `h3[]` holds one `BoxHelper` per selected furniture item, wall group or opening group, so grouped selections highlight too.
- **Walls & openings in 3D (issue #29).** Every opening is its own `THREE.Group` with `userData = { opId, elev }` inside the wall group (windows and arches included, not just door leaves). The 3D `pointerdown` handler starts `d3 = { op: true, … }` on an opening and stops propagation (no orbit); `pointermove` slides it with `opDragHit(ray, wall, elev)` — the ray hits the wall's vertical plane (floor plane fallback) and gives the distance along the wall — clamped like 2D and snapped to 5 cm, rebuilt via `schedBuild3D()`; `pointerup` commits after a drag, otherwise toggles a door (`Alt` = select only) or selects a window. The click handler selects plain walls (`Alt` also selects hinged / grouped walls instead of cycling) and always clears `downPt` first so a stale press cannot fire a second click. Height / thickness / type / paint and opening `w/h/sill` edits already rebuild through `affects3D`. Guard: `tests/edit-3d.test.js` + a smoke check.
- **Keyboard while in 3D.** The `if (ui.view3d)` branch of the window `keydown` handler owns the keyboard in 3D: `Escape` leaves, `WASD`/arrows/`Q`/`E`/`Shift` feed `keys3D`, and a **`ctrl` layer runs first** for `Z`/`Y` (undo/redo), `S`, `A`, `G`, `C`, `V`, `D` — plus `Delete`/`Backspace`. Ordering matters twice over: the ctrl layer must come **before** the walk-key capture (otherwise `Ctrl+A` would push `a` into `keys3D` and strafe the camera) and before the branch's early `return` (that return is what made `Ctrl+Z` dead in 3D — the most-pressed key in the app silently doing nothing). `restore()` already calls `schedBuild3D()`, so undo rebuilds the model and keeps the user in 3D; use `refreshSel3D()` after anything that changes `sel` without rebuilding. Guards: `tests/shortcuts-3d.test.js` (handler shape + ordering) and a real `Input.dispatchKeyEvent` check in `browser-smoke.js` that fails with "Ctrl+Z did nothing in 3D".
- `build3D()` disposes previous geometries/materials (`T3.mats`) before rebuilding; `affects3D(k, p)` gates which panel properties trigger `schedBuild3D()`.
- **Walk mode (issue #46).** The 👁 eye button (`#b3dEye`) enters walk mode (`T3.walk = { fi, x, y, yaw, pitch, drag }`; orbit camera saved in `T3.walkSaved`). OrbitControls are disabled (`ctl.enabled = false`, `maxPolarAngle = π` so `ctl.update()` never clamps the look). Drag looks around (yaw unlimited, pitch clamped `±WALK.pitch`). WASD / arrows walk at `WALK.eye` (165 cm) above the floor (`walkElev`), Shift runs, speed is time-based (`WALK.speed` / `WALK.run` cm/s × `dt` from `performance.now`; orbit fly keys are time-based too), Q/E ignored. Collision: `walkSegs(f)` yields wall boxes minus passable openings (`walkPassable`: arch, or open door/double/slide); `walkMove(p, mv, segs, r)` slides a circle (`WALK.r = 20 cm`) along walls with sub-stepping against tunnelling. Clicking (`walkClick`) toggles doors via shared `toggleDoor3D(o)` (`Alt` = select only), selects furniture/walls/windows. `Esc` restores the saved orbit camera (second `Esc` leaves 3D); presets (Fit/Top/facades) and section views (`camAlong`) leave walk mode and apply their view; leaving 3D restores orbit. Floor selector moves walker (`walkToFloor`). `build3D` re-applies walk camera at the end. Bilingual `#walkHint` created on demand inside `#v3d` (hidden outside walk mode); orbit `#hud` hidden while walking. Guard: `tests/walk-mode.test.js` + a smoke check.

### 3D (`build3D`, `furn3D`, `loop3D`)
- Plan `(x, y)` → Three `(x, elevation, z=y)`. Rotation: `mesh.rotation.y = -θ` (SVG clockwise → Three counter-clockwise). Room polygons use `rotation.x = +π/2`.
- Walls are split into boxes around each opening (below-sill, above-head). Every opening gets jambs + head (and a sill board for windows); windows add a translucent pane plus a mullion when wide; doors/double doors get a frame, an inset panel and a handle while keeping the existing `open`/`side`/`flip` rotation; sliding doors get two offset panels + a top track. Solid walls also get **skirting** (both faces, skipping door gaps) and a thin **top cap** — `wt: 'curtain'` walls are skipped.
- Furniture detail is **parametric on the catalog id** in `furn3D(g, o, ctx)`: `sofa3/sofa2/armchair`, `chair`, `ochair`, `coffee|table*|desk|meet|vanity`, `tableR`, `bed*|bunk|crib`, `wardrobe`, `dresser|night|shelf|bookcase` (`shelf|bookcase` are open carcasses with visible shelf boards, and bookcase adds book rows when detail is on), `fridge|dish|wm`, `stove`, `sinkK|counter*|island`, `basin*`, `wc|bidet`, `tub|shower`, `plant|tree`, `tv`, `rug`, `car`, `pool`, `column|colSq`, `fireplace`, `printer`, `stairs`. Everything else (custom `poly` library shapes included) falls back to the old `k`-based box/cylinder/extrude. All proportions derive from `o.w/d/h` and shades from `o.color` (`shade()`), so 2D resize/rotate/swap never breaks it. **No new data fields.**
- `box/cyl/sph` share one unit `BoxGeometry` / `CylinderGeometry` / `SphereGeometry` and scale the mesh — do not allocate geometry per part. `EdgesGeometry` rides along with the unit box and is only added to silhouettes (the `edges` flag). Keep `furn3D` at ≤ ~12 meshes per item (~20 for stairs).
- Room floors use `r.floor` (`wood|tile|carpet|marble|concrete|stone|grass|water|gravel|deck|asphalt` or custom `tex:<id>`) to build cached `CanvasTexture`s tinted with `r.color` (`floorTexture()`, one texture per kind + colour + theme; `water` uses a translucent `MeshPhongMaterial` over a `waterBed`); `none` keeps the flat fill. The same textures finish the **floor slab** when `Floor.slabFloor` / `Floor.slabColor` are set (project panel → *Floor slab*); such slabs keep their material in the studio render (`userData.slab` is only set on default slabs). Painted walls (`w.color`) drive `wCol` in 3D, so skirting and top cap follow via `shade()`; in 2D `wallPaintSvg()` draws thin paint strips on both faces over the dark poché.
- Lighting: hemisphere + a shadow-casting directional light fitted to `contentBounds` (1024/2048 shadow map) + a low fill light. The renderer uses `PCFSoftShadowMap`, `outputEncoding = sRGBEncoding` and `ACESFilmicToneMapping` at ~1.05 exposure; ground, slabs and floors receive, large walls/furniture cast.
- Detail level: `build3D()` estimates the object count and drops part edges / frames / floor textures above ~3000 objects (`det` flag) instead of exposing a user setting.
- **Perspective / parallel camera (#74).** `T3.pcam` (perspective, `CAM_FOV`) and `T3.ocam` (orthographic, near −40000) share the orbit controls; `T3.cam` is the active one and **everything must read `T3.cam`, never a cached camera**. `setProjection(ortho)` copies position / orientation and keeps the image size (ortho half-height = distance · tan(fov/2), and back), and sets `T3.ctl.object`; `fitOrtho()` re-frames the ortho camera after every preset (`camAlong`, `set3DCam`, `orient3DFrom2D`, the default build camera). `setCamAspect(cam, a)` / `camAspectOf(cam)` replace `cam.aspect` (resize, captures, `render3DHQ`, whose jitter writes `elements[12/13]` for ortho instead of `[8/9]`). Picking goes through `camRay(ndc)` (ortho rays start far behind the camera). `#b3dProj` toggles (△ / ▱, `syncProjUI()`), `#b3dIso` / `set3DCam('iso')` = 45° azimuth from the south-east, 35.26° up, switching to parallel; facades, sections and the section clip work in both. Walk mode is always perspective (`T3.orthoAfterWalk` restores parallel on exit). Commands `iso` / `proj`.
- Camera presets: `set3DCam('fit'|'top'|'eye')` backs the three small buttons next to `#s3dFloor` (`#b3dFit/#b3dTop/#b3dEye` in `.ctl3dCam`; `'eye'` enters walk mode, see issue #46); `T3.fit` caches `{cx, cz, sz, elev}` during `build3D`. The markup must stay in sync — `applyLangUI()` uses `$()` guards but the bootstrap binds the three ids directly.
- **2D → 3D camera hand-off (issue #37).** `show3D(true)` no longer starts from a generic distant view. `view3DFocus()` returns the selection's bbox centre/span (via `selectionBounds`) or else `view2DCenter()` — the world point under the middle of the 2D canvas — and `orient3DFrom2D()` aims `T3.ctl.target` there, with the distance scaled by the 2D zoom (`span ≈ max(screen)/2 / view.z`, clamped) and the target clamped ~35 % outside `T3.fit` so a far-panned 2D view still shows the plan. `show3D(false)` stores `T3.lastCam`; re-entry restores it (`build3D(keep)`) unless the 2D centre moved more than `CAM_KEEP_RADIUS` (200 cm) or the selection changed (`T3.selKey`), in which case the camera re-orients. The presets (including facade views) still reset on demand, and the theme toggle rebuilds with `build3D(true)` so it no longer throws the orbit away. Guards: `tests/camera-sync.test.js` (focus maths, zoom scaling, keep/re-orient decisions) and a real toggle check in `browser-smoke.js`.
- **3D render export (issue #13).** `#b3dShot` (🎬, fourth button in `.ctl3dCam`) and the top-bar `#bPng` both produce a **rendered image**; `#bPng` is context-aware (`ui.view3d ? export3DRender(e.shiftKey) : exportPng()`) and `syncExportTitles()` keeps its tooltip honest (called from `show3D` + `applyLangUI`). Two paths, chosen by `Shift`:
  - **`export3DRender()` (default, `-3d-render.png`)** → `render3DHQ()`. This is a render, not a screenshot: (1) a studio preset (`opts.preset !== 'viewport'`) swaps `scene.background` to white, the ground to `0xf3f1ec` and every `userData.slab` mesh to the light slab colour, because in dark theme the near-black floor slab reads like a heavy drop shadow on white; (2) `LineSegments` (the per-box CAD outlines) are hidden for the passes — they are the single biggest "viewport" tell; (3) the shadow map is rebuilt **once** at 4096² with a frustum tightened to `T3.fit` and `r.shadowMap.autoUpdate = false` (re-rasterising it per pass cost seconds on a software rasteriser); (4) the scene is rendered into a `bufK` (2×) supersampled buffer over `frames` passes with Halton(2,3) sub-pixel jitter in `projectionMatrix.elements[8..9]`, each pass composited with `globalAlpha = 1/(i+1)` — a running mean on the GPU. `readPixels` + a JS sum loop did the same thing but was slower and allocated hundreds of MB; (5) the buffer is downscaled to `outW/outH` with `imageSmoothingQuality='high'` plus `sharpenCanvas()` (mild unsharp, 0.25 with supersampling / 0.6 without); (6) **everything is restored in `finally`** (background, ground/slab materials, edge visibility, shadow mapSize + frustum + autoUpdate, pixel ratio, aspect, `T3.run`, HUD).
  - **`export3DRender(true)` (Shift, `-3d-view.png`)** → `render3DDataUrl()`: one synchronous capture of the live view, for when the user wants exactly what is on screen fast.
  - `render3DDataUrl()` must stay **synchronous**: the renderer has no `preserveDrawingBuffer`, so `r.render()` and `toDataURL()` cannot be split by an await/`toBlob`/`setTimeout` or the PNG comes back blank. `render3DHQ()` has no such constraint (it reads the canvas inside the same pass loop).
  - Sizing: `shot3DScale(w, h, maxSide, maxPixels)` — 2–3×, capped, never below 1×. The render additionally caps the final image at 2600 px / 6 MP and the *buffer* at 4096 px. `ui.shot` is the re-entrancy guard.
  - **Render studio (issue #34).** `#b3dStudio` (🎨) opens `openRenderStudio()` (`ui.modal === 'studio'`, settings in `ui.studio`); 🎬 and `#bPng` keep their old contract. `render3DHQ(opts)` takes `style` (`RENDER_STYLES`: `realistic` = the studio above; `technical` / `clay` / `sketch` swap every mesh to one matte material, glass stays translucent; `technical` and `sketch` keep the `LineSegments` and ink them; `sketch` adds `sketchFilter()` — grayscale, contrast, light hatching), `sun: { az, alt }` (`sunVector()`, north = −z; the shadow light moves and turns warm below 20°), `longSide` (1920 / 2560 / 3840; otherwise `shot3DScale`) and `format` (`jpeg` → `toDataURL('image/jpeg', 0.92)`). Every swap — materials, ink, light position and colour — is restored in `finally`. Preview = the same call at 720 px, one pass. Guard: `tests/render-studio.test.js` + a smoke check.
  - **Sky backdrop + toon style (issue #45).** `opts.backdrop` is `'studio'` (white sweep) or `'sky'`; when absent, `realistic` uses the sky and every other style the studio (`studioBackdrop()` mirrors this for the dialog's `data-rs-bg` buttons, `RENDER_BACKDROPS`). `makeSky(sunDir, cam, fit)` adds a 20 000 cm `BackSide` sphere centred on the camera with an inline `ShaderMaterial` (zenith / horizon / below-horizon gradient + sun glow, `gl_FragCoord` dither against banding) and a `THREE.Fog` in the horizon colour that starts past the building and is opaque well before the ground plane's edge. Colours come from `skyColors(alt)` (sun altitude; `lightSunVector()` when no `opts.sun`). **In r128 fog mixes in after tone mapping and sRGB encoding**, so the sky writes its sRGB colours as-is (`toneMapped: false`, no encoding chunk) — that is what makes fogged ground and sky meet without a seam. The ground gets a mid-tone material in sky mode. `toon` swaps every mesh (cached per original material) to `MeshToonMaterial` with the original colour / map and a 3-step `LuminanceFormat` gradient (`NearestFilter`), and inks the `LineSegments` like technical. `finally` restores `scene.fog`, removes and disposes the sky, and disposes the toon materials + gradient with `styleMats`. The live viewport never shows the sky. Guards: `tests/render3d.test.js` + a smoke check (eye-level noon is blue, golden hour warmer, scene byte-identical afterwards).
  - **SVG and PDF stay 2D-only on purpose** (they carry a title block and scale bar). Tests: `tests/render3d.test.js` (scale maths, the synchronous-capture contract, the render-vs-screenshot guards) and a real render check in `browser-smoke.js` that fails on a blank PNG or an unrestored shadow map/viewport.
- Floors stack with pitch `P.wallH + 20`. Floor slabs follow the outer contour of walls and enclosed spaces (via `slabPolys` and `ExtrudeGeometry`) rather than axis-aligned bounding boxes, eliminating overhang on angled walls. Built once on entering 3D (and on theme change) — it does **not** live-update; leave 3D (`Esc` or `2B`) to edit.
- Camera travel: `keys3D` tracks held keys (`W/A/S/D`, Arrow keys, `Q/E`, `Shift`); movement is time-based (`dt` from `performance.now`). `loop3D()` translates both `T3.cam.position` and `T3.ctl.target` along the horizontal XZ camera forward/right vectors (or Y for `Q/E`), while walk mode has its own step (`walkStep`) on the floor with collision.
- Floor visibility: the `#s3dFloor` select (`.ctl3d`, top-left of the 3D overlay) + `sync3DFloors()`; `ui.v3dFloor` is `'all'` or a floor id. `build3D()` skips hidden floors, so an isolated floor is drawn at ground level (elevation counter only accumulates over shown floors).
- If CDN scripts fail, `show3D` shows a toast and stays in 2D.

### Export
**Plot dialog (issue #35).** `#bPrint` → `exportPrint()` → `openPlotDialog()` (`ui.modal === 'plot'`, settings in `ui.plot`). `plotSheetSvg()` builds a sheet sized in **millimetres** (`width="297mm"`, viewBox in mm) from the same `layerStrings` as `exportSvg` under one transform: `calcPlotTransform(paper, scale, bounds, margin, center)` → `k` = mm per cm (`10 / N` for 1:N, or fit), plan size, origin and `overflow`. The plan is clipped to plan-rect ∩ printable area (`#plotclip`), with a frame, a title strip (project, floor, date, scale, paper) and a scale bar of `plotBarCm(k)` (≥ 25 mm). Areas: `all` (content + 60 cm), `view` (visible canvas) or `window` (`ui.plot.win`, picked with the transient `plotwin` tool: a `plotbox` drag that reopens the dialog). `plotPrint()` writes `@page { size: A3 landscape; margin: 0 }` and the mm-sized SVG, so the browser prints at true scale. Guard: `tests/plot-dialog.test.js` + a smoke check.

`exportSvg()` → `{svg,w,h}`; PNG rasterises that SVG via `Image` + canvas; PDF goes through the plot dialog above (`plotPrint()`: `window.open` + `print()`). Includes a title block (project, floor, date, total room area) and a 2 m scale bar. Background image is included only if its layer is visible.

### MCP server (`mcp/server.js`)
- **Optional tooling, not part of the app.** A zero-dependency Node (≥ 16) MCP server over stdio — JSON-RPC 2.0 is implemented by hand, so there is no `npm install` and no build. It lets AI agents (Claude Desktop, OpenCode, Cursor, …) author plans as JSON: `new_project`, `add_wall` / `add_rect_walls`, `add_opening`, `add_furniture`, `add_room`, `add_slab`, `add_void`, `add_text`, `update_object`, `delete_objects`, `add_floor`, `summarize`, `list_catalog`, `load_project` / `save_project` / `get_project` / `set_project`.
- **Live browser bridge (`mcp/bridge.js`).** IndexedDB is per-origin and a Node process cannot write it, so a tiny local server keeps the plan for the agent. **The client lives in `app.js`** (section *AI köprüsü istemcisi*), so the app connects to `http://127.0.0.1:8787` from **any origin** — the GitHub Pages build, a `file://` copy, or the bridge's own page. Nothing is injected and no script is loaded from the bridge. Pushed plans (`push_to_browser` → `PUT /__plan.json` → SSE `event: plan`) are applied through the app's own `loadProject()`, so autosave persists them to this origin's IndexedDB (refresh keeps them); local edits are pushed back on every `autosave()` (debounced, guarded by `brgApplying`). `brgProbe()` tries once on boot and then every 10 s while the tab is open, so a page that was already open connects as soon as the agent starts the bridge.
- **`?bridge=off`.** Opening the app with this query (`BRIDGE_OFF`) disables the bridge client entirely — `brgFetch` throws, `brgConnect` returns false, `brgStartProbe` never polls. `tests/browser-smoke.js` always opens the app this way: it loads test plans, and a tab connected to a running bridge would push them over the user's live AI plan (it did, before this switch). Users can use it too, e.g. to look at a plan without syncing it.
- **Which plan wins on first contact.** `brgInitialSync()` compares the bridge revision with `localStorage[fp_bridge_rev]`: a returning browser adopts the agent's plan only when `rev > seen`; a **brand-new** browser (no `seen`) adopts it only if the local plan is pristine (no walls), otherwise its own plan wins and is pushed. After that, sync is revision-ordered, so a reload never re-pushes or oscillates.
- **CORS / Local Network Access.** The bridge sends `Access-Control-Allow-Origin: *` plus `Access-Control-Allow-Private-Network: true` on every response (including preflights and SSE). Chrome 152+ (desktop) reaches `127.0.0.1` from `https://mewego.github.io` directly; newer builds may show a one-time **local network** permission prompt, and headless Chrome denies it outright (`LocalNetworkAccessPermissionDenied`) unless `--disable-features=LocalNetworkAccessChecks` is passed.
- **AI modal (`aiModal`).** The **🤖 AI** toolbar button (`ui.modal === 'ai'`) is a single-purpose panel: it reports live-connection state (`aiSyncLiveRow`), offers **📋 Copy agent prompt** (`aiSetupPrompt()` + `copyText()`, `navigator.clipboard` with a textarea/`execCommand` fallback because `file://` often blocks the async API) and **🔌 Try to connect** (`brgConnect()` + `brgInitialSync()`). There is deliberately **no copy/paste-the-JSON path** — the agent edits the plan directly, and a second weaker flow only confused users.
- **User → agent request queue.** The bridge client in `app.js` renders a floating, read-only **`AI` pill** (only when a bridge is connected; green dot + live revision) that opens a panel with bridge details and an **Ask AI** box. The agent prompt lives in `aiSetupPrompt()` and is offered in the **AI modal** (path 1) and **❓ Help**; it tells the agent to start `mcp/bridge.js` — no `http://127.0.0.1:8787/` visit, no file juggling. Submissions go to `POST /__requests`, are kept in bridge memory, and are read by the agent with `get_user_requests` / cleared with `ack_user_requests` (SSE `requests-changed` refreshes the open panel). Requests are **not** pushed to the model automatically unless the bridge was started with `FP_WAKE=1`; the UI must stay honest about that: the pill carries an amber **pending counter** (`data-ai-pending`, fed by `brgRefreshPending()`/`brgSetPending()` on SSE `request` + `requests-changed`) and the panel keeps "⏳ N request(s) waiting - tell your agent" visible until the queue drains, then shows "✓ Your agent picked it up" (`aiSyncSendState()`). Do not replace that with a short timer: a 5 s confirmation that disappears is indistinguishable from a request that vanished. UI is bilingual via `L()` and repaints on `data-theme` changes (MutationObserver); the pill has no pause switch by design.
- **Optional auto-wake (`FP_WAKE=1`).** When a request arrives the bridge can prompt the agent's own runtime instead of waiting for the human: it shells out to `opencode-cli api post /api/session/{id}/prompt --data {text, delivery:"queue"}` (the body tells the agent to call `get_user_requests` → edit → `push_to_browser` → `ack_user_requests`). `newestSession()` picks the newest session whose `location.directory` equals the repo; note `/api/session` returns `{ data: [...] }`, not `{data:{sessions}}`. `FP_WAKE_SESSION` pins a session (no re-resolve), `FP_WAKE_CMD` is a generic escape hatch (request text on **stdin**, detached, `parseCmd()` avoids `shell:true` quoting bugs on Windows), `FP_OPENCODE_CLI` overrides path discovery. Two gates: `FP_WAKE=1` **and** `originMayWake()` (browser origins must be in `FP_WAKE_ORIGINS` ∪ `mewego.github.io` ∪ the bridge's own origin; no `Origin` header = local process, allowed) — otherwise any website reaching 127.0.0.1 could drive the agent. `/health` and `GET /__requests` expose `wake`/`wakeAgent`/`wakeSession`; the client reads it into `brgWake` and swaps the pending text to "waking your agent…". Wakes are debounced 900 ms so a burst is batched.
- **Pill placement.** `placeAiPill()` positions the host above the footer using its measured height (re-run on `resize` and when built), and the panel gets a computed `max-height` so it never runs off short windows. The host uses `z-index: 95` — below `#modalbg` (100) — and opening Help closes the panel.
- **Saved versions / "go back" (snapshots).** AI edits replace the whole plan, so `mcp/bridge.js` writes JSON snapshots to `.fp-history/` (gitignored): `checkpoint(plan, 'before-ai'|'after-ai'|'before-restore', label)` runs only when the push's `tab` looks like an agent (`/^(mcp|agent|ai)/i`), because app autosaves are constant and the app already has `hist[]`. `checkpoint()` dedupes identical JSON (`lastHistJson`), keeps `FP_HISTORY_MAX` (default 60) files, and maintains `index.json` so history survives a bridge restart (`loadHistory()` at boot). `GET /__snapshots` lists metadata newest-first; `POST /__snapshots/restore {id}` validates the id against `/^h[a-z0-9]+-[a-z0-9]+$/i` (no traversal), checkpoints the outgoing plan, installs the old one and bumps `rev` with `tab: 'restore'` — so a restore is a normal revision, reaches the app through the existing SSE path, and is itself undoable. MCP side: `list_snapshots` / `restore_snapshot`, plus a `label` argument on `push_to_browser`. Client side: `aiRefreshSnapshots()` renders the last 8 rows with a ↩ button in the AI panel, `aiRestoreSnapshot()` confirms then posts (applying the response only if SSE has not already done so). `brgApply(plan, rev, kind)` takes `'restore'` to toast "↩ restored" instead of "AI plan applied". **Do not snapshot browser autosaves** — that would fill the history with noise and slow every push.
- The bridge client is now part of `app.js` (section *AI köprüsü istemcisi*), so it depends on normal module scope rather than injected globals: `loadProject`, `autosave` (wrapped), `toast`, `L`, `schedBuild3D`, `ui`, `closeModal`. `mcp/bridge.js` no longer injects anything and serves only the endpoints below.
- The workflow is file-based too: the agent saves a plan `.json`, the user opens it in the app via **📂 Aç**; exports from the app (**⬇ JSON**) can be loaded back with `load_project`.
- `CATALOG`, `OPENINGS`, `ROOMCOL`, `newProject`/`newFloor` defaults and the `mkWall`/`mkOp`/`mkFurn`/`mkRoom`/`addRectWalls`/`deleteIds` mirrors must stay **in sync with `app.js`** — when you change the data model or catalogue, update both files (and run `node --check mcp/server.js`).
- `opencode.jsonc` registers the server for OpenCode (`node mcp/server.js`). Never `require()`/import it from `app.js`: the app must remain dependency-free and `file://`-runnable.

---

## 9. Common Tasks (recipes)

### Add a furniture item
For a part-based item, also add a parts generator to `CAT_PARTS` in **both** `app.js` and `mcp/server.js` (put the generator inside the shared `PARTS-ENGINE` block). Append a row to `CAT_DEFS`: `['id', catIndex, 'Türkçe Ad', w, d, h3D, 'emoji', 'rect|round|bed|sofa|stairs', '#hexColor', 'English Name']`. Optionally reference it in a template via `c.fu('id', x, y, rot)`. For a new *shape kind*, extend `furnBody()` (2D) **and** the `build3D()` furniture branch.

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
| `tests/bridge.test.js` | plan store/revisioning, the request queue, SSE, **`FP_WAKE`** (a request reaches the agent, an unknown origin only queues), **snapshot save/restore** (AI pushes only, restore is a new rev, history survives a restart) and the **`Access-Control-Allow-Private-Network`** header the deployed page needs |
| `tests/render3d.test.js` | the 3D render export: oversampling maths (2–3×, ≤4K/12 MP), the **synchronous** `render()` → `toDataURL()` contract for the quick path, the render-vs-screenshot guarantees (no CAD outlines, studio backdrop, single shadow build, jittered passes) and viewport restore; sky backdrop defaults, inline-shader sky with sun-driven colours and horizon fog, toon materials, and their restore (#45) |
| `tests/camera-sync.test.js` | the 2D → 3D hand-off (issue #37): the target lands on the 2D viewport centre or the selected object, distance follows `view.z`, and a plain 2D ⇄ 3D round-trip keeps the orbit unless the user panned > 200 cm |
| `tests/wall-joints.test.js` | wall corners closing: miter/bevel maths of `wallJoints()` and that both 2D and 3D draw the fillers |
| `tests/wall-trim.test.js` | trim tool / split at intersection / join corner geometry and opening re-basing |
| `tests/snap-tracking.test.js` | object snap tracking: L→U closes exactly with/without angle lock, Shift disables it, guides reach the preview |
| `tests/snap-mid-underlay.test.js` | midpoint / centre / group-centre snap, ends still winning, no self-snap while dragging, underlay reference-floor choice and snap, panel + glyph wiring |
| `tests/slabs-voids.test.js` | free slabs / floor voids: which voids become holes (edge-touching stairwells too), data-model defaults, tools, 2D X notation, 3D extrusion + holes, MCP mirror |
| `tests/mirror-scale.test.js` | mirror / flip / scale maths on the real functions: openings keep swinging inward, polygon winding kept, furniture backs, readable text, double mirror = identity, scale with/without wall thickness, `parseScale` formats, panel / menu / key wiring |
| `tests/edit-3d.test.js` | 3D editing of walls and openings: opening groups carry `opId`, `opDragHit` maths (both wall directions), drag handlers ordered before OrbitControls, Alt / door toggle rules, plain-wall selection, highlight of walls and openings |
| `tests/section-elevation.test.js` | section / elevation engine on the real functions: line-polygon intervals, void subtraction, section frame direction, cut walls / slabs / openings for a 2-floor building, near side dropped, elevation faces and window holes, tool / kind / 3D clip / facade camera / modal wiring |
| `tests/drawing-layers.test.js` | custom drawing layers on the real functions: old projects stay unchanged, stamping rules, hidden / non-printing filter, lock / hide picking, and the 2D / 3D / export / selection wiring |
| `tests/stairs.test.js` | parametric stairs on the real functions: legacy defaults, riser count / landings / final height for all four types, treads inside the footprint, Blondel rule, railing sides, 2D / 3D / panel wiring |
| `tests/render-studio.test.js` | render studio: sun direction maths, the four styles and output sizes, material / ink / light swaps restored in `finally`, JPEG encoding, the 🎨 button and studio controls |
| `tests/plot-dialog.test.js` | plot dialog: ISO paper sizes / orientation, mm-per-cm for 1:50 / 1:100 / 1:200 / fit, centring and overflow, scale-bar choice, the print → dialog → window-pick wiring |
| `tests/wall-length.test.js` | numeric wall length on the real `applyWallLength`: direction kept, connected corners follow (or not), pivot end, openings kept in place / clamped, bad input rejected, and the label / keyboard / drag wiring |
| `tests/layers.test.js` | layer reordering (front/back/step past overlaps), 3D stack levels that stop coplanar overlaps from z-fighting |
| `tests/adaptive-grid.test.js` | site-plan zoom + adaptive grid (issue #38): the metric ladder, major grid legible at every zoom, minor hiding, major staying a multiple of `P.grid`, 2 km fitting at `MIN_ZOOM`, footer labels, and `snapToGrid` still following `P.grid` |
| `tests/shortcuts-3d.test.js` | keyboard parity in 3D: the ctrl layer exists, runs **before** walk-key capture, and undo/redo still route through `restore()` → `schedBuild3D()` |
| `tests/ai-bridge-ui.test.js` | the request-feedback UI: the pill's pending counter, no timer that hides a queued request, the reconnect probe after a bridge restart, the "go back" list |
| `tests/command-line.test.js` | command line (#43): accent / case folding, ranking, every `TOOLS` entry listed with its key, 3D rules (`in3d`), the `:` trigger placed after the input-field guard and before the 3D branch, palette key handling |
| `tests/library-presets.test.js` | library presets (#42): what a saved door / window / furniture preset copies (deep, with #41 extras), placement defs and factories, card sizes, last-used opening size, back-compat defaults, library wiring and undo, MCP mirror |
| `tests/finishes-doors.test.js` | outdoor finishes (grass, water, gravel, deck, asphalt) in 2D/3D (#39), custom floor textures (metadata in P, images in IndexedDB, JSON bundle/absorb) (#40), door materials (wood, glass, paneled, metal) and leaf/frame colors (#41) |
| `tests/walk-mode.test.js` | walk mode collision & controls (#46): wall-box slicing minus passable openings, circle-vs-box collision, sliding along walls, tunnelling prevention, door gap traversal, frame-rate independence, and source guards |
| `tests/furniture-parts.test.js` | multi-part furniture: the `PARTS-ENGINE` block identical in `app.js` and `mcp/server.js`, lenient defaults (old items untouched), strict validation (sizes, box, heights, floating parts), the billiards reference, 2D / 3D / preset / mirror wiring, and an MCP build of a billiards table as one item |
| `tests/parts-builder.test.js` | furniture studio: the starting draft for parts / plain / round / poly items, bilingual problem list, top + front preview with one clickable group per part, Apply refusing problems, committing once and keeping an item's scale, and the panel / keyboard wiring |
| `tests/bookcase.test.js` | bookcase / shelf 3D models (#54): open front carcass, visible shelves, bookcase book rows gated by detail flag, dresser/nightstand drawer fronts kept |
| `tests/glass-ramp-floorh.test.js` | glass floor / ramp / per-floor height (#57–#59) on the real functions: ramp slope % and code classes, railing defaults, `floorH` fallback and mixed-height `floorElev`, `mkWall` taking the floor height, glass holes + slab wiring in `build3D`, MCP catalogue / finish mirror |
| `tests/furn-elev.test.js` | height above floor (#61) on the real functions: `furnElev` defaults / cap, `CAT_ELEV` items and the app ↔ MCP mirror, catalogue default only when unset, dashed + tagged 2D, panel / clamp / preset / 3D wiring, the TV unit's 16:9 screen, MCP `elev` round trip and range |
| `tests/room-slab-variants.test.js` | room slab thickness and room layouts (#63, #66) on the real functions: `roomSlabT` defaults / caps, room poses carrying finish / colour / glass / thickness, slab and void poses unchanged, guarded restore, clickable room bodies, 3D room picking, MCP `slabThickness` range |
| `tests/walls-camera.test.js` | curtain mullion maths (#71), railing / fence types, defaults and posts (#73), perspective / orthographic wiring, aspect / frustum helpers and the iso preset (#74) |
| `tests/ifc-import.test.js` | IFC import on the real parser: block parity with `mcp/server.js`, STEP value decoding, rejected formats, the `tests/fixtures/*.ifc` models (IFC4 / mm and IFC2x3 / feet: storeys, walls, curved and curtain walls, doors / windows, rooms, slabs, voids), corner cleanup, file-open / drop wiring and the MCP `import_ifc` tool |
| `tests/browser-smoke.js` | runtime crashes the static checks cannot see: boot, all templates, draw→undo→redo, `exportSvg`, AI + Help modals, theme switch, 3D build, a **real 3D capture** (a blank PNG fails), and **real key events in 3D** (`Ctrl+Z`/`Ctrl+Y`, walk keys not swallowed, walk mode collision: stops at closed doors, passes open ones, Q height locked, Esc restores orbit) |

`browser-smoke.js` opens the app with `?bridge=off`, so it is safe to run while `mcp/bridge.js` is up. It skips itself (exit 0) when no Chromium is found; set `CHROME_BIN` to point at one. In CI it always runs.

**Still verify by eye** (the suite cannot judge these):

1. **Both themes:** toggle 🌓 and confirm walls, openings, rooms, furniture, labels, grid and 3D are legible.
2. **Grid modes:** square / triangle / dots / off; presets `1 m`, `3 m`, `5 m` and **Özel…**.
3. **Exports:** PNG/SVG/PDF come out on white paper in dark mode; the **3D render** (`📸` or `🖼 PNG` while in 3D) matches the visible camera in both themes and is sharp, not upscaled.
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
- Body: summary, current behaviour, repro steps (bugs) or scope / non-goals (features), acceptance criteria, test notes. **Follow [`.github/ISSUE_GUIDE.md`](.github/ISSUE_GUIDE.md)** for the title format, section templates, what to leave out (line numbers, mockups, exact UI text) and the pre-filing checklist.

```bash
gh issue create --title "..." \
  --label bug --label "severity: medium" --label "priority: high" \
  --body-file issue.md
```

---

## 14. Roadmap Ideas (not implemented)

Imperial units · roof & terrain in 3D · cost / materials list · wall-linked room polygons (auto-update) · PWA / offline caching of Three.js · custom user templates · touch-gesture pinch-zoom · curved walls · LICENSE file.
