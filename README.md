<div align="center">

# 📐 Floor Planner · Kat Planı Çizici

### Interactive 2D / 3D Floor Planner — runs entirely in your browser

**No install · No build · No backend · No account**

**🤖 Or just describe it:** tell an AI agent (Claude Desktop, Claude Code, OpenCode, Cursor — any MCP client) *"add a 12 m² bathroom with a shower"* and watch it edit the plan live in your open browser tab. See [Design with AI](#-design-with-ai).

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

## 🤖 Design with AI

Describe what you want — *"add a 12 m² bathroom with a shower"* — and an AI agent edits the plan **live, in the tab you already have open**. It works with any MCP client (Claude Desktop, Claude Code, OpenCode, Cursor, …) through the optional MCP server (`mcp/server.js`, 25 tools). The app itself never needs Node; Node ≥ 16 is only for this optional MCP/bridge tooling, which is zero-dependency.

### How it works
1. Open **🤖 AI** in the top bar (or **❓ Help**).
2. Press **📋 Copy agent prompt** and paste it into your agent (OpenCode / Claude Desktop / Claude Code / Cursor).
3. The agent starts `node mcp/bridge.js`, and **the page you already have open connects to it automatically** — the deployed GitHub Pages tab, a `file://` copy, or a local server. Nothing is injected and you never open a second URL.

In Chrome/Edge the first connection may ask once for **local network** permission (allow it — only a local server can answer).

### What you can do
- **Live edits:** AI changes appear instantly in your tab and autosave to its IndexedDB, so a refresh keeps them. The agent can also read your own edits back.
- **Ask AI box:** while connected, a floating **AI** pill shows the live plan revision. Click it for bridge details and an **Ask AI** box — type *"add a 12 m² bathroom with a shower"* and the agent picks it up with `get_user_requests` (then marks it done with `ack_user_requests`). Requests are queued: the pill shows an amber counter and the panel keeps a **⏳ waiting for your agent** note until they are picked up.
- **Wake the agent (optional):** a page cannot start a model by itself, so either tell your agent *"check the app requests"* — or start the bridge with **`FP_WAKE=1`** and a request will wake your agent's session automatically (see [`mcp/README.md`](mcp/README.md#wake-the-agent-optional)).
- **Go back:** the bridge writes a JSON snapshot around **every AI edit** (the plan before and after) into `.fp-history/`. If an agent deletes more than you wanted, the **AI** panel lists the last saves with a ↩ restore button (one click, no agent needed), or just tell your agent *"go back"* — it calls `list_snapshots` / `restore_snapshot`. Restoring is a normal new revision, so it is itself undoable, and the history survives a bridge restart.
- **Opt out of syncing:** open the app with `?bridge=off` to use it without connecting to a bridge.

### Tools
Tools: `new_project` · `load_project` / `import_ifc` / `import_dxf` / `save_project` / `get_project` / `set_project` · `add_wall` / `add_rect_walls` · `add_opening` · `add_draft` (2D-only lines / circles / arcs) · `add_furniture` · **multi-part furniture:** `get_furniture_schema` / `create_furniture` / `add_component` / `update_component` / `remove_component` / `set_material` / `set_transform` / `validate_furniture` / `save_furniture` / `place_furniture` · `add_room` · `add_slab` / `add_void` · `add_text` · `update_object` / `delete_objects` · `add_floor` · `summarize` / `list_catalog` · `browser_status` / `push_to_browser` / `pull_from_browser` / `get_user_requests` / `ack_user_requests` · `list_snapshots` / `restore_snapshot`. Client configuration (Claude Desktop, OpenCode, Cursor / VS Code) and the full workflow are in [`mcp/README.md`](mcp/README.md).

---

## ✨ Features

- **2D Outline / AutoCAD View (`J` / `CAD`)** — switch between the default filled 2D plan (`2B`), a crisp CAD wireframe mode (`CAD` / footer `Outline` / key `J`) with hollow double-line walls, unfilled rooms/slabs, and architectural CAD furniture blocks (WC, sinks, stove burners, columns, trees, vehicles), and the interactive `3D` view. Exports (`SVG` / `PNG` / `PDF`) keep the active CAD style.

### 🧱 Drawing
- **Free-form walls** with live length + angle read-out; type a number and press `Enter` for an exact length.
- **Change a wall's length by number** later: select it and type the new length + `Enter`, click its length label on the canvas to edit it in place, or type a length while dragging one of its ends. The wall keeps its angle, connected corners stay joined and doors / windows stay put.
- **Room-from-rectangle** tool (4 walls + room in one drag).
- **Automatic room detection** — click inside any closed area and get its polygon, area (m²) and perimeter.
- **Polygon room** tool for irregular spaces.
- **Adjustable-angle (hinged) walls** — fix a wall at either endpoint (`Point A` or `Point B`), define **3 (or any number of) angle positions**, add or delete positions, adjust angles via the on-canvas rotation handle (`wrot`) or numeric inputs, and **click the wall in 2D or 3D** to cycle through `Position 1 → Position 2 → Position 3`.
- Wall endpoints stay **connected** when you drag a wall or a corner.
- **Wall types** — every wall can be 🧱 **Solid** (default), 🪟 **Curtain Wall** (glass facade with an aluminium frame; set the **mullion spacing** or the **number of intermediate mullions**, 0 = one pane), 🛡 **Railing / Balustrade** or 🌿 **Garden Fence** (low, open post-and-rail walls for balconies, terraces and gardens; switching a wall to one lowers it to ~1 m). Draw railings directly with the **🛡 Railing** tool (**Q**) and pick a **style**: vertical bars, glass panel, horizontal bars / cable or solid parapet — stairs and ramps use the same styles for their railings. All are drawn in 2D, 3D, sections and elevations. Doors and windows still cut curtain walls normally; on a railing or fence they leave a gap (a gate).
- **⇔ Accordion wall** — tick it in a wall's panel and its two ends stick to the wall ends they touch. When a room or group is rotated, moved or switched to another layout, the accordion wall stretches or shrinks by itself to close the gap (and disappears when the gap closes). It looks like an ordinary wall of any type; the length label shows `⇔`.
  **Fill the gap** picks how it closes the gap: a straight wall (default) or a **fan** — a pleated leaf that sweeps around the corner the walls open from, like an opened hand fan.
- **🪗 Bellows corridor** — tick it in a wall's panel and the wall remembers its first position (another layout's position, or another hinge position, when it has one). Move the wall somewhere else — drag it from A–B to C–D, switch the layout, or pull just one end from A to C — and the space between the first and the current position is closed like the bellows of an articulated bus: folded side panels from each old end to its new end (a fan when only one end moved) and a ribbed roof on top (switchable). 📍 *First position = here* restarts it; the length label shows `≋`.

### 🧲 Grids & Snapping
| Grid type | Description |
| :-- | :-- |
| ⊞ **Square** | Classic architectural grid, 15° angle snap |
| △ **Triangle (60°)** | Isometric / equilateral lattice, 30° angle snap |
| ⁙ **Dots** | Dot-matrix grid |
| ∅ **Off (free draw)** | No grid, no step rounding |

- **Step presets:** 5 cm · 10 cm · 25 cm · 50 cm · **1 m · 3 m · 5 m** · **Custom…** (any value, 1–10 000 cm).
- Snap to wall ends and room corners, **wall / dimension midpoints** (▲) and **room, slab and group centres** (⨁). Furniture you place or drag locks to a room centre, so a lamp, rug or table lands dead centre. Toggle snapping with `G`, or hold `Shift` for a temporary override.
- **Floor underlay:** on an upper floor the floor below shows faintly — walls, columns, stairs, slab / balcony edges and voids — and walls you draw snap to its corners (◇) so load-bearing walls line up. **Project ▸ Layers** turns it off, picks another reference floor (e.g. the ground floor from floor 2, or the floor above) and sets its opacity.
- **Site plans:** zoom out until a couple of kilometres fit across the screen. Instead of vanishing, the grid steps up through 1 m · 5 m · 10 m · 50 m · 100 m … (fine lines hide once they would blur together), and the footer always shows the active spacing — while snapping keeps following the **Step** setting.

### 🚪 Objects
- **7 door / window types** (single, double, sliding, opening, window, wide window, small window) that snap onto walls with hinge-side and swing-direction controls.
- **Click a door to open / close it (90° / slide)** — works in 2D and in the 3D view; hinged doors swing 90° with a visible dashed arc, sliding doors slide horizontally.
- **Door materials & colours** — set door leaf material (**wood**, **glass**, **paneled**, **metal**), glass type (**clear**, **frosted**), custom leaf colour, and custom frame colour for any opening; styled leaf lines in 2D and 3D leaves with frames and handles (with a "Default colours" reset).
- **~60 furniture, structure & lighting items** in 7 categories with search (living, bedroom, kitchen, bath, office, structure & outdoor — stairs, columns, trees, pool… — and lighting).
- **Light fixtures (💡 Lighting):** ceiling light, pendant, chandelier, recessed spot, track spots, wall sconce, floor and table lamps, LED strip and outdoor lights (bollard, street lamp, wall light). Ceiling fixtures stay on the ceiling when you change the storey height. Select one to switch it **on / off**, set its **brightness** (Dim / Normal / Bright or lumens), **colour** (warm / neutral / cool or a custom colour) and, for spots, the beam angle; a room shows how many of its lights are on with **All on / All off**. The plan uses standard lighting symbols (a lit fixture shows a dot in its light colour). Lights go to IFC (`IfcLightFixture`) and Revit (Lighting Fixtures) and come back from IFC files. In **3D** every fixture has its own model; a lit one glows, lights the room around it (the nearest and brightest fixtures are real lights — the four most important cast shadows, so walls and furniture block their light — and the rest glow and light the floor below them) and a click turns it on or off (`Alt`+click selects). **Project ▸ Layers ▸ Light areas** shows how far each light reaches on the plan.
- **Night mode (🌙):** one click in 3D turns the live realistic view to night: a starry sky with the moon, dim moonlight outside, warm glowing windows seen from outside and the lights on inside. Rooms without a lamp get a soft automatic ceiling light (command palette: *Automatic room lights*). In walk mode, press **F** for a flashlight. 🌙 again returns to your daytime sun. The render studio has a **Night** atmosphere, **Dusk exterior** and **Night interior** presets and lets the sun go below the horizon; night renders use more lamps as real lights, cast shadows from the strongest spots and add a soft glow around bright lamps.
- Furniture **magnets to walls** and rotates to face the room.
- **Group objects** — select 2+ items (walls, rooms, furniture, texts, dimensions) and press **Group** (or `Ctrl+G`); grouped items select, move and rotate together, `Ctrl+Shift+G` ungroups. Drag the group rotation handle or use `[` / `]` to turn the whole layout around its centre without breaking wall corners.
- **Adjustable layouts (1a / 1b / 1c)** — with a group or a room selected, press **🔄 Make Adjustable** to snapshot the current layout; rearrange, press **➕ New** to save more layouts, then simply **click the room / group on the canvas to cycle** through them (1a → 1b → 1c → 1a). Room variants move the furniture inside; group variants move every member — walls, room shapes and all. A room layout also remembers its **floor finish and colour**, so 1a can be tile and 1b wood; click anywhere on the room (or its floor in 3D) to switch.
- **Layouts across floors** — select a group (or any objects) on one floor and pick **🔗 Link to a group on another floor** in the side panel: both floors now share the same layouts, so clicking a layout in 2D or 3D moves the members on every linked floor at once (one undo step). **🔗✕ Unlink floors** separates them again and keeps each floor's layouts.
- **Furniture labels and icons on / off** — **Project ▸ Layers** has separate switches for furniture labels and furniture icons (emoji), so a plan can show labels only, icons only, or clean outlines. Exports follow the switches; nothing is deleted.
- **Room slab thickness** — every room has a *Slab thickness* field (default 20 cm, 0 = flat). Balconies and terraces drawn with the room tools get a solid slab with a visible edge in 3D. To add a wall (or anything else) to an adjustable group, press **✏️ Edit members**: new walls and objects you draw join the group, and clicking a member selects and moves just that member in the active layout instead of cycling (`Esc` / **✓ Done** to finish). You can also select the group plus existing objects and press **➕ Add to group**.
- **Connected-wall dragging** — dragging a wall keeps neighbouring wall ends glued so corners stay closed; uncheck **Connected walls** in the footer (or hold **Alt** while dragging) to move a wall independently.
- **Room drag moves contents** — dragging a single room takes the furniture and text labels inside it along (the panel's X/Y fields behave the same); room resize only reshapes the polygon.
- Resize / rotate with on-canvas handles; edit numeric properties in the side panel.
- Dimension lines, text labels, and live wall-length labels.
- **📐 Draft tool (2D only)** — precise drafting geometry that never becomes a wall, slab or furniture in 3D: pick **Line / Polyline / Rectangle / Circle / Arc** in the bar above the canvas and click point by point with the usual snapping (grid, ends, midpoints, centres, angle lock, tracking). Type a number + `Enter` for an exact length or radius (`300x200` for a rectangle). The side panel sets line weight, line type (solid / dashed / dotted / centre), colour and an optional fill or hatch for closed shapes, and shows length, radius / diameter and area. Move, mirror, scale, copy, layer and reorder them like any other object; they export to SVG / PNG / PDF.
- **✏️ Pen tool** — freehand sketches anywhere on the plan: hold and drag to draw any shape, arrow or note stroke; the stroke is simplified to few points, and you can move it, restyle it (stroke width & color in the side panel), copy/paste or delete it like any object. Shown as a line on the floor in 3D and included in SVG/PNG/PDF exports.

- **⬡ Shape tool (`S`)** — draw anything the catalogue doesn't have: **triangle**, **quad**, **N-gon** (3–24 sides, adjustable in the top bar), **circle/ellipse** (drag corner to corner) or **freeform** (hold-drag-release). Two modes: **Object** creates a nameable custom item (move/rotate/resize like furniture, extruded in 3D); **Walls** draws the same outline as real walls you can attach doors to and auto-detect a room inside. Press **💾 Save shape to library** in the side panel to name it and reuse it from the **⬡ My Library** category (✕ removes a saved shape).
- **🧩 Multi-part furniture** — an item can be built from parts (boxes, cylinders, spheres, extruded outlines), each with its own height above the floor, colour and finish, so a billiards table has real legs, rails, felt at playing height, pockets and balls lying on the cloth. 2D draws the parts from above; 3D builds every part; resizing the item scales its parts. Try **🎱 Billiards Table** in *Living*, or ask an AI agent for any custom piece — it builds it as **one** item through the MCP tools instead of stacking separate boxes on the floor. The side panel shows the part count (⚠ when a part sticks out of the item).
- **🧩 Furniture studio** — design your own furniture. Open it with **🧩 Create furniture** in **⬡ My Library** (or `:` → *Furniture studio*), or select any item and press **🧩 Edit parts · studio**. It fills the screen: a **3D view** (orbit; click a part to select it, drag it to move, **Shift**-drag to raise / lower) and **top, front and side views** where you drag parts to move them and pull the blue dots to resize or rotate. Edges **snap** to the box, the floor and nearby parts, so stacking a top on legs is one drag. **Drag building blocks** (box, cylinder, sphere, rod, leg, top, shelf, side / back panel, door, drawer front, handle, cushion, glass, and the light blocks **💡 bulb**, **🔦 spotlight** and **📏 LED strip**) from the left onto any view, or click them. Start from a **template** (table, desk, chair, stool, bed, bookcase, cabinet, sofa, coffee table, wardrobe, nightstand, billiards table, table lamp, LED-lit wall shelf) and adjust it. **Light parts:** any part can give light (**💡 Light ▸ Gives light**: bulb, spot shining down, or LED strip along its length) with its own brightness (lm), warm / neutral / cool or custom colour and, for spots, beam angle — so you can build your own lamps, lit shelves, cabinet and TV backlights. The finished item glows and lights the room in 3D like a catalogue light; its panel has an **On** switch, a click in 3D toggles it and the room **All on / All off** buttons include it. The right panel has the part list and exact fields (position, height above floor, size, rotation, colour, finish: matte, gloss, metal, glass or a textured wood, fabric, leather, stone, marble, porcelain, chrome, plastic, rubber or foliage tinted by the part colour, or one of your project textures) plus **⬆ Sit on top**, **⤓ Put on floor**, **↔ Centre**, **⇋ Mirror copy**, **⧉ Duplicate** and **📦 Fit box to parts**. The studio has its own undo (**Ctrl+Z / Ctrl+Y**); **arrow keys** nudge 1 cm (**Shift** 10, **PgUp / PgDn** up / down), **Del** deletes, **Ctrl+D** duplicates. **Group parts** with **Ctrl / Shift + click** (Ctrl+click in 3D) and **Ctrl+G**: the group moves and rotates as one (grab the round handle above it in the top view), **Ctrl+Shift+G** ungroups and **Alt+click** edits a single member; the group is saved with the item. **✓ Place in plan** puts a new piece in the middle of the view and adds it to **⬡ My Library**; for an existing item **✓ Apply** writes it as one undo step. **Cancel / Esc** leave the plan untouched.
- **Library presets** — select a door, window or furniture item and press **💾 Save to library**: name it (e.g. *K1 85×210*) and it appears in **⬡ My Library** (doors and windows also under *Doors & Windows*) with its key sizes, e.g. `100×70 · sill 110`. Click it to place copies with exactly those values, as many as you like; ✎ renames, ✕ deletes (undoable). Presets are saved with the project and its JSON. Changing a door's width also makes the next door you place from the built-in card that size for the rest of the session.

### 🏢 Project Tools
- **Multiple floors** — add, duplicate, rename, delete; the floor below is shown faintly for alignment.
- **Background image** import with **on-canvas drag & corner/edge resize**, numeric `X / Y / W / H / Opacity` inputs, **position lock**, and a **scale-calibration** tool (click two known points, enter the real distance).
- Object snap tracking: while drawing walls / rooms / dimensions or dragging wall ends and room corners, the cursor aligns with existing corners horizontally and vertically and shows a dashed guide (Shift or Snap off disables it).
- Project tabs: keep several projects open, switch with one click (each keeps its own undo history and view), copy/paste between them, ＋ for a new tab, double-click to rename, × to close (asks if unsaved). Opening a template, saved project or file never replaces work in progress — it opens a new tab.
- **Import from Revit / ArchiCAD (IFC):** export IFC from Revit (**File > Export > IFC**) or ArchiCAD and open it with the **📂 Aç / Open** button or by dropping the `.ifc` file onto the canvas (opens in a new tab). What comes in: storeys as floors, walls (including curved walls as segments and curtain walls), doors/windows on their walls, rooms from `IfcSpace`, floor slabs, slab openings as voids, columns, railings (with their real L / U shape, style and the side of the stair they belong to), roofs (with their real slopes in 3D, in plan and in elevations), stairs (as editable straight / L / U / spiral stairs with their riser count), ramps (as editable ramps with their slope), colours (wall paint, door and window colours, item colours) and materials (floor finishes such as concrete, wood, tile, marble, stone or glass, and wood / glass / metal doors, recognised from English and Turkish material names), and custom components / furniture (as shapes with their footprint and height). Elements are placed on the floor they physically sit on (Revit negative offsets included), and walls or columns that run through several floors appear on each. What does not: textures / images (door swing sides take defaults; one-way, no export back to IFC). Supported: **IFC2x3** and **IFC4** STEP `.ifc` files (not `ifcXML` or `ifcZIP`).
- **Render studio (🎨 in 3D):** pick a style — **realistic**, **shaded technical** (white model, ink edges), **pencil sketch**, **white clay** or **toon / cel** (flat shade bands + ink outlines, in the objects' own colours) — and a backdrop: a white **studio** sweep or a **sky** that follows the sun (blue at noon, warm at golden hour, the ground fading into the horizon; the default for realistic renders). Set the sun by azimuth / altitude or a preset (morning, noon, golden hour), preview it, then render at the viewport size, **1080p, 2K or 4K** as PNG or JPEG. Everything runs in the browser.
- **Parametric stairs:** select a staircase to set its type (**straight, L or U with a landing, spiral**), the number of risers and the railing (none / left / right / both sides). The panel shows riser height and tread depth with a **Blondel comfort check** (2 × riser + tread ≈ 63 cm), and **⇕ Match storey height** sets the stair to one floor pitch. The 2D plan and the 3D model draw exactly the same treads.
- **Stairs that line up and connect floors:** a stair from the library is already one floor high with comfortable treads. Bring it to a **door** and it centres on the doorway and climbs away from it (leaving room for the door leaf); bring it **between two walls** and it runs along them and stops at the wall at the end. **Width: fit to space** makes it as wide as the gap or door, **free** keeps its own width (press **S** while placing, or use the button in the panel); **R** reverses it. A stair that reaches the next floor opens a **stairwell** in the floor above that follows it when you move or resize it. **⧉ Continue to the floor above** puts the same stair on the next floor (and adds the floor if there is none) — repeat it for a tall building.
- **Resize arrows in 3D:** select one item in 3D and drag the arrows on its sides to change its width or length; the opposite side stays where it is.
- **Drawing layers:** add your own CAD-style layers (**Project ▸ Drawing layers**) with a name and colour; new objects go onto the **active layer** (footer selector). Each layer can be hidden (gone from 2D, 3D and exports), **locked** (cannot be clicked, box-selected, Ctrl+A-selected or deleted) or kept off the printouts. Move a selection to another layer from its side panel. Old projects open unchanged on the Default layer.
- **Sections & elevations:** draw a section line (`L`) — A–A' balloons and arrows show where you look. From its panel, **✂ 3D cutaway** slices the 3D model along it and turns the camera to face the cut, and **📐 Section drawing** opens a printable 2D section through every floor (cut walls and slabs solid, openings, room names, ±0.00 / +2.90 level datums, scale bar). **Project ▸ Sections & elevations** shows the four facade elevations; all sheets download as SVG or PNG. In 3D, the **N / E / S / W** buttons square the camera to each facade.
- **Mirror & scale:** flip any selection horizontally / vertically (`Shift+H` / `Shift+V`), mirror it about a two-point axis (`I`, as a copy or a move) or scale it by a factor (`1.5`, `150%`), a target width (`=450`) or a reference length (`300:450`). Doors keep swinging into the room, sofas keep their backs to the wall, text stays readable and wall thickness is kept unless you ask. Panel buttons and the right-click menu offer the same commands.
- Layering: overlapping objects can be picked with Ctrl+click or the right-click list, and reordered (front / forward / backward / back). 3D follows the 2D order, so overlapping rooms or items (e.g. a river made of pools) no longer flicker.
- **Which one?** A plain click where several objects overlap (a sofa on a rug, a lamp on a table) opens a small list at the cursor: hover a row to preview it, click to select it, **Esc** keeps the top one. Rooms, slabs and voids count as background and a door's own wall is left out, so clicking furniture in a room or a door never asks.
- **🔒 Lock** (side panel or right-click menu) stops an object from being dragged, resized, rotated, nudged, mirrored, erased or deleted by accident, in 2D and 3D. It can still be selected, edited in the panel's fields and unlocked with **🔓 Unlock**; copies are not locked.
- Layer visibility toggles, floor patterns (`wood`, `tile`, `carpet`, `marble`, `concrete`, `stone`, outdoor finishes: `grass`, `water`, `gravel`, `deck`, `asphalt`, and a walkable **glass floor**), room colors.
- **Glass floor:** set a room, a free slab or the whole floor slab to **Glass floor** (clear or frosted). The slab under it is cut away in 3D, so you can look down through the glass at the floor below; the panel has a metal frame and 1 m joints, and the plan shows a glass hatch.
- **Wall-mounted items:** **Wall TV**, **Wall Art**, **Wall Shelf**, **Air Conditioner** (Living), **Wall Cabinet** (Kitchen) and **Mirror** (Bathroom) hang at a typical height. Any furniture has a **Height above floor (cm)** field (0–500) for anything else you want off the floor. Raised items are drawn dashed in 2D with a `▲ +80` tag and float at that height in 3D.
- **Rotate on every axis:** besides the plan angle, any furniture item can be tilted forward / back (**Tilt X**) or sideways (**Tilt Y**) — or use **⤾ X 90°** / **⤿ Y 90°** to lay it down and **↺ Upright** to stand it up again. In 3D it rests on the floor; in 2D its real footprint is drawn. In the furniture studio every part has the same Turn (Z) / Tilt X / Tilt Y controls.
- **Roofs:** place **🏠 Roof** from *Structure & Outdoor* (or type `:roof`) and press **⌂ Fit to walls**: the roof takes the outer line and height of the walls on that floor, and the gable walls grow up to it. Pick the type — **flat, gable, hip or shed** — then set the **pitch**, the **ridge direction** and an **off-centre ridge**, the **hip end** length, the **eaves overhang**, the **thickness** and the **covering** (clay tile, shingle, standing-seam metal, slate or concrete terrace; each with a matching default colour). The plan shows the ridge / hip lines and the tile courses or metal seams, 3D shows the textured roof, and sections, elevations, the attach-to-surface tool (**A**), IFC and Revit export all use the same faces.
- **Ramps:** place **♿ Ramp** from *Structure & Outdoor*. Width, length and rise are the W / D / H fields; the panel shows the slope as %, 1:X and degrees with a badge (≤ 6 % ideal accessible, ≤ 8 % accessible, ≤ 15 % vehicle, steeper = too steep) and can lengthen an accessible ramp to 8 %. Types: accessible (curbs + handrails at 70 and 90 cm), vehicle and landscape; railing none / left / right / both. 3D draws a true slope with rails that follow it.
- **Wall heights per floor:** select a wall and press **⬆ Apply to all walls on floor**, or set **Floor height** in the project panel (nothing selected). New walls on that floor get its height and the floors above stack on it in 3D. **⬆ Apply to all existing walls** under the project wall height resets every wall on every floor.
- **Basements & floor levels:** **＋ Basement** (floor bar) adds a floor under the lowest one, underground, and keeps the ground floor at **±0.00**. With nothing selected, the project panel's **📏 Floor level** section sets where the floor runs, in metres: **Floor level** (e.g. −3.50) and **Ceiling level** (e.g. −0.30). Floors without their own level stack on the floor below (height + 20 cm slab), as before; **↺ Stack on the floor below** clears a typed level, and a warning shows when a floor overlaps the one below. The floor tabs show each level once a basement or a typed level exists. Stairs, walking between floors, sections / elevations, IFC and Revit export use the real levels, and an IFC model with underground storeys keeps them. In 3D the ground sits at ±0.00 and opens over visible basements, so you can look down into them.
- **Custom textures** — **🎨 Create / upload texture…** (Project, room and slab panels, or `:texture` in the command line) opens one dialog with three tabs: **Create pattern** (seamless tiles, brick, planks, basket weave, hex tiles, checkerboard, terrazzo or stripes, with colours, unit size, joint width and shade variation, live preview, works offline), **Upload image** (pick or drop a photo, set its name and real-world repeat size in cm; scaled to 1024 px) and **With AI** (describe the texture and your connected AI agent creates it and applies it). A new texture goes straight onto the selected room / slab. Textures apply to rooms, free slabs and floor slabs and tile to scale in 2D and 3D; images stay in the browser (IndexedDB) and travel inside JSON exports.
- **⊹ Axes (Z):** structural axes with numbered (1, 2, 3…) and lettered (A, B, C…) bubbles; walls snap to axis crossings. **⊞ Axis grid** builds a whole grid from spacings (e.g. `3x500`), **⧉ Copy to all floors** repeats it on every floor.
- Sloped floors: select a room or slab, open **⛰ Slope (height points)**, add points (on corners, edges or inside) and type their height — the surface slopes evenly between them (terraces, drains, ramps, landscaping). 2D shows the levels and downhill arrows with %, 3D and furniture follow the slope.
- **✒ Line weights** (Project panel): make walls in the CAD view, doors & windows, furniture, room / slab edges and dimension / section lines thinner or heavier (×0.5 … ×3); the plan, CAD view and every export follow. 2D drafting lines (📐) have weight buttons in their toolbar.
- **Stair types:** straight, L / U with a landing, **L / U with winders** (turning steps instead of the landing), **spiral** (centre pole) and **curved** (half turn, open well) — pick them in the stair panel; 2D, 3D, walk mode and exports follow.
- Wall paint: pick a colour or a preset swatch for one or many selected walls (2D paint strips, full colour in 3D). **Paint / cover each face** gives the two sides of a wall their own colour and finish (tiles, wood, stone or your own texture — wallpaper, patterned tiles); each side is named after the room it faces.
- Floor slab material per floor (project panel): areas without a room — balconies, hallways, terraces — get a finish in 3D too.
- **Slab tool** (`K`): draw a balcony, terrace, porch or deck with no walls around it (click corners or drag a rectangle). In 3D it is a solid slab with its own thickness, finish and level offset, and furniture on it sits on top.
- **Void tool** (`Y`): cut a stairwell, shaft or atrium through the floor. 2D draws the architectural dashed outline with an X; in 3D it is a real hole in that floor's slab, so stairs from the floor below rise through it. Draw it anywhere on the slab, just like a slab (drag a rectangle or click the corners). **Put furniture into a void:** an item placed in an open void goes down to the floor below (to the ground on the lowest floor); give the void a **Pit depth** (cm) and it becomes a pit with its own floor and walls (a sunken pool, lift pit, sunken seating), and items in it sit on the pit floor. Stairs, ramps, ceiling-mounted items and stairwells linked to a stair are not moved.
- Unlimited **undo / redo**, copy / paste / duplicate, box & multi-select with a **box-select scope** (All / Walls / Furniture) in the footer.
- Starter templates: Blank · Studio 1+0 · 2+1 Apartment · Office.

### 💾 Storage — fully local
| Layer | Used for |
| :-- | :-- |
| **IndexedDB** (`FloorPlannerDB`) | Background autosave + named projects with live SVG thumbnails, plus custom texture image data (`textures` store) kept outside undo snapshots — hundreds of MB capacity |
| **JSON files** | Backup, sharing, moving between machines (`⬇ JSON` / `📂 Aç`); exports bundle custom texture data, imports absorb them into IndexedDB |
| `localStorage` | Theme & language preferences, Google Drive sync settings (legacy data is auto-migrated to IndexedDB) |

### ☁ Sync & share
Click **☁ Sync** in the top bar to keep your plans on every device or to hand one over:

- **Google Drive:** connect once and the project you are working on is saved to a **Floor Planner** folder in your own Google Drive. It stays up to date on every device where you open the app with the same Google account — the app picks up changes from the other device by itself. If a plan was changed on two devices, it asks which one to keep (or keeps both). A green dot on ☁ means syncing; amber means it needs a click (sign in again after about an hour, or choose a version). **💾 Save** syncs with Drive right away when it is connected; if the sign-in has expired, the save message has a **Reconnect** button, and if Drive was never connected it offers **☁ Also save to Google Drive** once per session.
- **Send to another device:** make a **link** with the plan inside it (shown as a **QR code** for small plans — scan it with the phone), a short **Drive link** (same Google account), or **send the JSON file** through the share menu.
- **Several windows:** with the same project open in two browser windows, the one you save last updates the other instead of overwriting it.
- **Privacy:** a plan link carries the plan itself — anyone with the link can see it. Drive sync uses the `drive.file` permission, so the app can only see the files it created. Nothing goes to any other server.

#### Setting up Google Drive sync (site owners)
The public site needs a Google OAuth client ID once (forks and self-hosted copies need their own):
1. [Google Cloud Console](https://console.cloud.google.com/) → create a project → **APIs & Services → Library** → enable **Google Drive API**.
2. **OAuth consent screen**: *External*, app name and support e-mail, add the scope `.../auth/drive.file`, then **Publish app** (`drive.file` is a non-sensitive scope, so no Google verification review is needed).
3. **Credentials → Create credentials → OAuth client ID → Web application**, *Authorised JavaScript origins*: `https://mewego.github.io` (add `http://localhost:8080` or similar for local testing). No redirect URI is needed.
4. Put the client ID into `GDRIVE_CLIENT_ID` in `app.js` — or paste it under **☁ Sync → Advanced** (stored in that browser only). Drive sync does not work from a `file://` copy; the dialog links to the web version.

### 📤 Export
- **PNG** and **SVG** with title block and scale bar.
- **🖨 PDF / Print** opens a **plot setup** dialog: paper **A4–A0**, landscape / portrait, a true architectural **scale** (1:50, 1:100, 1:200, 1:500 — 1:100 prints 1 m as 10 mm) or *fit to paper*, the area to print (**whole plan**, **current view** or a **window** you drag on the canvas), centring and margins. The preview warns when the plan does not fit; print it (or save as PDF from the print dialog) or download the sheet as SVG.
- Exports always render on **white paper** regardless of the editor theme.
- **3D render:** while the 3D view is open, the **🖼 PNG** button renders the scene (and the **🎬** button in the 3D overlay does the same from inside the view). This is a real render, not a screenshot: the camera outlines are removed, the backdrop becomes a studio white, shadows are rebuilt at high resolution and several supersampled passes are averaged, so edges come out smooth instead of jagged. Files are named `<project>-3d-render.png`. **Shift-click** either button for a quick capture of exactly what is on screen (`-3d-view.png`). SVG and PDF always describe the **2D plan**.

### 🧊 3D View & WASD Walk
One click turns the plan into an interactive 3D model — walls with real door/window openings, furniture, stairs, room floors and stacked floors. Orbit/zoom with the mouse (the wheel zooms toward the point under the cursor and keeps going — it never stalls at the orbit centre, and you can zoom through a wall into the room behind it), or fly around with **`WASD` / Arrow keys** (`Q`/`E` for down/up, `Shift` for faster travel).

**Walk mode (👁):** click the **👁** eye button to explore at eye level (165 cm). Walk with **`WASD` / Arrow keys** and hold **`Shift`** to run (movement is time-based); drag the mouse to look around in yaw and pitch (`Q`/`E` height keys are disabled). Collision detection stops you at walls and closed doors while sliding along them; open doors and arches are passable. Click any door to open or close it (or `Alt`+click to select). Press **`Esc`** to return to the saved orbit camera. **Stairs and ramps can be climbed:** walk onto them and you go up step by step; at the top you arrive on the floor above. To walk back down there must be a stairwell in the upper floor — a stair placed from the library opens one by itself; otherwise draw a floor void (**Y**) over it — without one the slab is closed there, just as it looks in 3D.

**Detail comes from the plan, not from extra settings:** furniture is modelled per catalogue item (sofa cushions and pillows, chairs and an office chair on casters, an L-shaped desk, a computer desk with two monitors, a glass-sided PC tower, keyboard and mouse, beds with headboards and duvets, a bunk bed with ladder and guardrail, a slatted crib, kitchen cabinets with doors, drawers and a stone worktop, sinks and basins with real bowls and faucets, a stove with grates and an oven window, WC, bathtub and a framed glass shower, plants and trees, a patterned rug, a car with windows and wheels, a pool with coping and water, a fireplace with glowing logs, stairs with a handrail …) purely from its type, size and colour, so existing plans and saved JSON improve with no migration. Each part has its own surface (wood grain, woven fabric, granite and marble, brushed metal, chrome, porcelain, foliage) tinted by the item's colour, so recolouring a sofa or a door still works, and the live realistic view and renders give each surface its own shine and relief. Openings get frames, sills and handles (doors with panels, hinges and casings; windows with sashes and double glazing), solid walls get skirting boards and a top cap, `wood`/`tile`/`carpet`/`marble`/`concrete`/`stone` plus outdoor `grass`/`water`/`gravel`/`deck`/`asphalt` (or custom textures) room floors and floor slabs become tiled textures tinted with the room colour (water draws as a translucent shiny surface), and a soft-shadowed sun lights the scene.

**Live realistic view (🌤):** the **🌤** button switches the 3D viewport between the CAD look and a live rendered look — sky, sunlight and shadows from the Render studio sun, clean surfaces without edge lines — while you orbit or walk. Click it again for the CAD view.
**Realistic materials:** the realistic render and the live realistic view use physically based surfaces — matte plaster walls, satin wood, polished tile and marble with relief in the joints, glossy porcelain, soft fabric, glass and water that reflect the sky — with lighting that follows the sun height and soft contact shading under furniture and along walls. Floors always render in their true, light colours, even from the dark theme, and rooms without a finish get a neutral screed. The Render studio adds an **Atmosphere** switch (☀ Daylight / 🌇 Warm evening) and a **🏛 Maquette** style (white card model with wood-toned floors).

**Selecting in 3D:** clicking a wall, door, window, furniture item or free slab shows it in the side panel, on any visible floor (the active floor follows the selection; `Alt`+click selects a room). On narrow screens the **ℹ️** button opens the panel.

**Camera presets:** three small buttons next to the floor selector give **fit**, **top-down** and **walk mode (👁 eye level, 1.65 m)** views. The **🎬** button beside them renders the current view to a high-resolution PNG (the top-bar **🖼 PNG** does the same while you are in 3D; hold **Shift** for a quick capture). **◇** jumps to an **isometric** view, and **△ / ▱** switches between **perspective** and **parallel (orthographic)** projection at any time, keeping the view direction; facade views (K/D/G/B), section cutaways and renders work in both, while walk mode always uses perspective.

**Picks up where you left off:** switching from 2D to 3D aims the camera at whatever is in the middle of your 2D canvas — or frames the object you have selected — and the distance follows your 2D zoom, so a close-up in 2D opens as a close-up in 3D instead of a distant view of the whole building. The orbit you leave behind is restored next time you press **3B**, unless you panned somewhere else in 2D in between; **Fit** always returns to the whole building.

**3D editing:** click furniture to select and highlight it (orange box), drag it across the floor (`Shift` = no grid snap; a single item magnets to the nearest wall on drop), and edit width / depth / height / rotation / color in the side panel — the 3D model refreshes live. Click a **wall** or a **window** to select it (orange box) and edit its height, thickness, type, paint, or the opening's width / height / sill in the side panel — 3D follows live; **drag a door or window along its wall** to slide it (`Shift` = no 5 cm snap). Clicking a door opens/closes it (`Alt+click` selects it without toggling, and selects a hinged / grouped wall without cycling it); clicking a hinged wall (or a group with saved layouts) cycles its positions. The usual editing shortcuts keep working **without leaving 3D**: `Ctrl+Z` / `Ctrl+Y`, `Del`, and `Ctrl+A` / `C` / `V` / `D` / `G` / `S`.

**Export IFC:** **⬇ IFC** in the top bar saves an IFC4 file that Revit (**Open ▸ IFC** or **Link IFC**), ArchiCAD and any BIM viewer can open: storeys, walls (curtain walls and railings too), doors and windows cut into their walls with their swing side, floor slabs with their openings, rooms with their names and floor finish, and furniture, stairs, ramps and roofs with their full 3D shape and colours. Opening the file back in the app gives the same plan.

**Export to Revit:** **⬇ Revit** in the top bar saves a `.fp-revit.json` file. The pyRevit add-in in [`revit/`](revit/README.md) turns it into real Revit levels, walls, doors, windows, floors and rooms; furniture becomes the Revit family you map in `family-map.json`, or keeps the app's own 3D model and colours as a DirectShape.

**IFC or Revit?** Both buttons first open a short window that explains the two formats side by side. Choose **IFC** to send the plan to anyone, in any BIM program, with no add-in. Choose **Revit** when you or your team work in Revit and want native, editable Revit elements; this needs pyRevit and the add-in. Tick *Don't show this again* to make the buttons download straight away. The command line (`:` → "IFC or Revit") opens the window again.

**Revit / IFC import:** besides walls, openings, rooms, slabs, stairs, ramps and roofs, the importer keeps concave (L / U) slab and room outlines, turns shaft cut-outs into floor voids, reads the door swing side and hinge, counts curtain-wall mullions, and turns recognised Revit families (toilets, basins, tubs, showers, kitchen appliances, sofas, beds, tables, chairs, wardrobes, cars …) into the app's own catalogue items with their real size and rotation. Room floor finishes come from the IFC properties; if the file has no rooms ("Export rooms" was off in Revit) they are detected from the walls, and a model exported at an angle is turned to line up with the plan axes.

**CAD / DXF import:** open or drop an ASCII `.dxf` file (AutoCAD, BricsCAD, DraftSight, LibreCAD, QCAD — save a `.dwg` as DXF first) and the drawing opens in a new tab. Layers keep their names, colours and on / off state; lines, polylines, arcs, circles, ellipses, splines, hatches, texts and dimensions keep their colour, line type and weight as 2D drafting. Blocks are exploded, and blocks named after furniture (bed, sofa, chair, table, WC …) become the app's own furniture. Parallel lines, wide polylines and multilines on a wall layer (WALL, DUVAR, A-WALL …) become real walls, with doors and windows found from door arcs, window lines or door / window blocks, and rooms are detected and named from the text inside them. If the file does not say its unit, it is guessed and the import notice has a **Units…** button; if the walls are on a layer with another name, click **🧱** next to that layer in **Project ▸ Drawing layers** to turn its line pairs into walls.
**Floors in 3D:** the menu at the top-left of the 3D view shows **🏢 all floors stacked** or **only one floor**, and the **☰** button next to it opens a checklist to switch each floor on or off in any combination (for example hide the roof and the top floor, keep the two below). Visible floors keep their real spacing and the lowest visible one sits on the ground. This is a view setting only: the plan and undo history are not touched.

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
5. Or skip the drawing: open **🤖 AI**, copy the agent prompt into your AI agent and just describe the plan — see [Design with AI](#-design-with-ai).

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :-- | :-- |
| `V` / `H` | Select / Pan (hold `Space` for temporary pan) |
| `W` | Draw walls (type digits + `Enter` for exact length) |
| `Q` | Draw railings (balcony, terrace, stair opening; style in the panel) |
| `R` | Room from rectangle |
| `O` | Detect room from a closed area |
| `P` | Polygon room |
| `K` | Slab — balcony / terrace floor without walls (click corners or drag) |
| `Y` | Void — stairwell / shaft / atrium hole in the floor slab |
| `S` | Shape tool (triangle / quad / N-gon / circle / free) |
| `D` / `N` | Door / Window |
| `F` | Furniture library |
| `M` | Dimension line |
| `T` | Text |
| `B` | Pen – freehand sketch (drag to draw, release to finish) |
| `U` | Draft – 2D-only line, polyline, rectangle, circle, arc (type a length / radius + `Enter`) |
| `E` | Eraser |
| `X` | Trim — cut a crossing wall back to the intersection |
| `L` | Section line — click both ends; then 3D cutaway or 2D section drawing from the panel |
| `Z` | Axis — click both ends; numbered / lettered bubbles, walls snap to crossings; ⊞ Axis grid in the panel |
| `A` | Attach to surface — click a roof or tilted item, then the walls whose top should follow its slope |
| `I` | Mirror — mirror the selection about an axis you click (keep or erase the original) |
| `Shift+H` / `Shift+V` | Flip the selection horizontally / vertically |
| `:` | **Command line** — type a tool or action by name in English or Turkish (*wall*, *duvar*, *aynala*, *print*, *undo* …; accents optional), see its shortcut, `↑↓` / `Tab` to pick, `Enter` to run. Works in 3D too: view, save and undo run there, drawing tools switch to 2D |
| `Ctrl+click` | Select the object underneath (repeat to go deeper) |
| Right-click | List of objects under the cursor + layer order |
| `Ctrl+]` / `Ctrl+[` | Bring forward / send backward (`Shift`: to front / to back) |
| `C` | Calibrate background scale |
| `G` | Toggle snapping |
| `J` | Toggle 2D Outline / CAD wireframe view (`CAD`) |
| `Shift` | Hold to bypass snapping · multi-select |
| `[` / `]` | Rotate selection −15° / +15° (multi-selections rotate as one rigid layout) |
| `R` / `S` *(while placing)* | Rotate furniture / flip door hinge · flip swing side |
| Arrow keys | Nudge selection / background image 1 cm (`Shift` = 10 cm) |
| `WASD` / `Q` / `E` *(in 3D orbit)* | Fly / move camera in 3D orbit (`Q`/`E`: down/up, `Shift`: faster) |
| `👁` *(in 3D)* | **Walk mode** — first click where you want to stand (a marker follows the cursor; press 👁 again or `Enter` to start in the largest room, `Esc` cancels), then walk at eye level: `WASD` / Arrow keys walk, `Shift` runs, drag to look around, collision blocks walls/closed doors, open doors pass, click door to open/close, walk onto stairs / ramps to climb to the next floor, `Esc` returns to orbit |
| `Ctrl+C / V / D` | Copy / Paste / Duplicate |
| `Ctrl+Z / Ctrl+Y` | Undo / Redo (also works while the 3D view is open) |
| `Ctrl+A` · `Ctrl+S` · `Del` | Select all · Save to browser · Delete |
| `0` · `+` · `−` | Fit view · Zoom in · Zoom out (2D zooms in to 1 mm = 4 px; a short note tells you when the limit is reached) |
| Double-click | Rename room / edit text |

**Phones and tablets (no keyboard):** as soon as you touch the screen with a finger or pen, a small bar appears at the bottom of the canvas (it hides again when you use a mouse) with **↶ Undo**, **↷ Redo**, **📋 Copy**, **📥 Paste**, **⧉ Duplicate**, **🗑 Delete**, **⬚ Select all** and **✕ Deselect**. The copy is shared between project tabs, so you can copy something (for example a piece the AI drew in another tab), switch tabs and paste it there. **Copy / Paste** are also in the side panel (with nothing selected it shows **📥 Paste** at the top while something is copied) and the right-click menu. While placing it shows **⟳ Rotate** (doors: **⇋ Hinge**, **⇅ Swing**) and **✓ Done**; while drawing **⏎ Finish** and **✓ Done**. **Press and hold** an object for the menu that a right-click opens on a computer (objects under your finger, bring to front, flip, copy…). On phones and touch tablets the library opens from **📚** at the top-left of the plan (or the 🛋️ Furniture tool) and closes when you pick an item, so you tap the plan to place it. On phones the top bar is one row you can swipe, and the grid / snap settings sit behind **⚙** in the bottom bar. Drag handles are bigger to the finger. **📏 Length** sets an exact wall length: draw a segment roughly with two taps, tap 📏 and type the length (the number keypad opens); the direction is kept and the wall chain continues from the new end. With one wall selected the same button changes its length. **☐ Multi** on the bar turns taps into add / remove from the selection (like Shift+click). **✎** next to the floor tabs renames the current floor.

---

## 🗂️ Project Structure

```
floorplanner/
├── index.html          # App shell: header, tool rail, library, canvas, panels, footer
├── style.css           # Theme variables (dark default, [data-theme=light]) and layout
├── app.js              # All application logic (~4 900 lines, no dependencies)
├── mcp/server.js       # Optional MCP server for AI agents (zero-dependency, Node ≥ 16)
├── mcp/bridge.js       # Optional local bridge: live plan sync + request queue (zero-dependency, Node ≥ 16)
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

Kat Planı Çizici is **source-available for noncommercial use** under the [PolyForm Noncommercial License 1.0.0](LICENSE.md).

- ✅ **Allowed:** personal use, study, research and experiments, hobby projects, teaching, and use by schools, universities, public research organisations, charities and government institutions. You may change the code and share it, as long as the use stays noncommercial and you keep the license and the `Required Notice` line from [`LICENSE.md`](LICENSE.md).
- ❌ **Not allowed without permission:** any commercial use. That includes selling the app or a modified version, offering it as a paid service, or using it inside a product or paid work for a company.

Want to use it commercially? Open an issue or contact the author through [GitHub](https://github.com/MeWeGo) to ask about a commercial license.

Bundled third-party code keeps its own license: Three.js (loaded from a CDN) is MIT-licensed.

**Contributions are welcome:** fork it, improve it, open issues and pull requests. By contributing a pull request you agree that your contribution is released under the same license and that the author may also offer it under other terms (for example, a commercial license).
