# Floor Planner for Revit

This pyRevit add-in imports a `.fp-revit.json` file exported from Floor Planner into an open Revit project. It builds native Revit levels, walls, doors, windows, floors, and rooms. Anything without a matching Revit family is built as a `DirectShape` using the app's 3D model and colors.

## What you need

- **Revit 2022 or newer** is recommended. Older Revit versions work too, except floor holes are skipped.
- **pyRevit** installed.

## Install

Choose one of these two ways:

1. **Link the repo folder (recommended for updates):**
   - In Revit, open **pyRevit → Settings → Custom Extension Directories**.
   - Add the `revit` folder of this repository.
   - Click **Save Settings and Reload** (or **pyRevit → Reload**).

2. **Copy the extension:**
   - Copy `revit/FloorPlanner.extension` into `%APPDATA%\pyRevit\Extensions`.
   - In Revit, click **pyRevit → Reload**.

After reloading, the **Floor Planner** tab appears on the Revit ribbon.

## Use

1. In Floor Planner, click **⬇ Revit** in the top bar (or press `:`, type `revit`, and press Enter). This saves a `.fp-revit.json` file.
2. Open a project in Revit.
3. Click **Floor Planner → Import Plan** and select the `.fp-revit.json` file.
4. Read the report window when it finishes. It lists how many items were created, reused, or skipped, along with any notes.

## What comes across as what

| Floor Planner | Revit |
| :--- | :--- |
| Floors (storeys) | `Level` (reuses an existing level at the same elevation; creates a floor plan view if `planViews` is `true`). |
| Solid walls | Basic `Wall` using types named `FP Wall <thickness> cm` (or with `#hex` if colored). |
| Curtain walls | Curtain `Wall` using `curtainWallType` (or the first curtain wall type in the project). |
| Railings & fences | `Railing` using `railingType` (or the first railing type in the project). |
| Doors & windows | Hosted `FamilyInstance` with sized types named `FP <width> x <height> cm` (for example, `FP 90 x 210 cm`). Without a mapped family, the first door / window family in the project is used. |
| Arches (open passages) | Rectangular wall opening. Doors and windows become one too when the project has no door / window family at all. |
| Slabs & free slabs | `Floor` using types named `FP Floor <thickness> cm`. Includes void holes in Revit 2022+. |
| Rooms | `Room` placed inside the polygon. Adds room separation lines if walls do not enclose it. |
| Furniture | `FamilyInstance` when a family matches in `family-map.json`; otherwise `DirectShape` with the app's 3D model and colors. Tilted items are always `DirectShape`. The item name and catalogue type go into **Comments**. |
| Stairs, ramps & roofs | `DirectShape` under the matching Revit category (`OST_Stairs`, `OST_Ramps`, `OST_Roofs`) with the app's 3D model and colors. |

## `family-map.json`

Edit `FloorPlanner.extension/family-map.json` to control which Revit types and families are used. Save the file and run **Import Plan** again — no Revit restart is needed.

### Keys

- `wallType`, `curtainWallType`, `railingType`, `floorType`: Exact type names in your Revit project to duplicate from or use. Leave `""` to pick the first matching kind in the project.
- `planViews`: `true` or `false`. Creates a floor plan view for each new level.
- `roomSeparationLines`: `true` or `false`. Draws room separation lines in the plan view if a room is not closed by walls.
- `doors`: Has two flags, `swingToFacing` and `hingeToHand` (both `false` by default). Set either to `true` if your door family comes out mirrored or swings the wrong way.
- `familyFolders`: List of folder paths (for example, `["C:\\Revit Families"]`) where the add-in looks for `.rfa` files when a mapped furniture family is not already loaded in the project.
- `openings`: Maps `door`, `double`, `slide`, and `window` to a family name or a list of candidate names.
- `furniture`: Maps Floor Planner item keys (such as `sofa3`, `wc`, `desk`) to a family name or a list of candidate names.

### Matching rules

- Matching is case-insensitive.
- An **exact** family name match is tried first. If none is found, a **contains** match is tried (for example, `"Single-Flush"` also matches `"M_Single-Flush"`).
- Lists are tried in order.
- You can use `{"family": "Name", "type": "TypeName"}` instead of a plain string to narrow the match to a specific type.

## Limits

- **Sloped wall tops** are built flat at their highest point. Attach their tops in Revit if needed.
- **Curtain wall grids** come from the Revit curtain wall type, not from the bay count in Floor Planner.
- **Furniture families** keep their own `.rfa` dimensions and are not resized to match the plan.
- **Textures** are not carried over. Solid colors and glass transparency are carried over.
- **Door swing** depends on how each Revit door family is built. Use `swingToFacing` and `hingeToHand` in `family-map.json` if doors face or hinge the wrong way.
- The add-in is tested against a mocked Revit API (`tests/revit-addin/`), not inside every Revit version. If something fails, the report names the element and the reason; please open an issue with that text.

## File format

The `.fp-revit.json` file is plain JSON (`format: "floorplanner-revit"`, `v: 1`) using Revit internal units: coordinates and dimensions are in **feet** (`1 ft = 30.48 cm`), the **Y axis points up** (flipped from the 2D plan), and angles are in **counter-clockwise degrees**.
