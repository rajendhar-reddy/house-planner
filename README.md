# 📐 2D House Planner CAD

A lightweight, zero-dependency, modern 2D Architectural CAD application designed for house planning and residential drafting.

From site/plot boundary marking with setbacks, to drafting exterior and interior walls, snapping doors and windows with architectural swing arcs, room area calculation, placing furniture fixtures, linear dimensioning, and exporting to AutoCAD DXF, Vector SVG, and high-resolution PNG.

---

## 🚀 Quick Start

### Method 1: Using Python (Recommended)
Run the launcher script to start a local server and automatically open your default browser:
```bash
python run.py
```

### Method 2: Any other static web server
The app is made of ES modules, so browsers will **not** run it when `index.html` is opened directly
from disk (`file://`) - you would get a blank page. Serve the folder over HTTP instead, for example:
```bash
npx serve .          # or:  python -m http.server 8080
```
and open the printed `http://localhost:...` address in Chrome, Edge, or Firefox.

---

## ✨ Features

### 1. Site & Plot Marking
- **Rectangular & Custom Plots**: Mark property boundaries by dragging or typing dimensions (e.g., `30'` × `40'`).
- **Surveyor Boundary Lines**: Standard dashed-dot boundary styling with corner markers.
- **Setback Guidelines**: Front, Rear, Left, and Right setback margins forming the buildable envelope. "Front" is the side facing the (widest) road, so moving the road moves the front setback; Left/Right are as seen standing on the road.
- **Road Frontage**: Automatic road indicator marking the entrance road.
- **North Compass**: Customizable orientation angle with cardinal indicator.
- **Real-Time Area Metrics**: Computes Total Plot Area dynamically in **Square Feet**, **Square Yards**, and **Square Meters**.

### 2. Wall Drafting System
- **Exterior Walls (9" / 230mm)**: Heavy load-bearing exterior perimeter walls.
- **Interior Walls (4.5" / 115mm)**: Partition walls for room divisions.
- **Continuous Drafting**: Chained wall drawing with live measurement badges.
- **Smart Snapping**:
  - Snap to Wall Endpoints (green square).
  - Snap to Wall Midpoints (cyan triangle).
  - Snap to CAD Grid.
  - Ortho Angle Lock (0°, 45°, 90°) by holding `Shift` or toggling Ortho mode.
- **Corner joints**: where two walls meet they are cut to a sharp mitre, and free wall ends are square. The **Corners** button in the top bar switches to the original rounded look (the choice is saved with the project).

### 3. Smart Doors & Windows
- **Wall Auto-Snapping**: Hovering near any wall automatically aligns the door or window to the wall's angle and position.
- **Wall Cutouts**: Cleanly masks wall hatches and renders jambs.
- **Door Types**:
  - Single Swing (with 90° clearance arc).
  - Double Swing Door.
  - Sliding / Patio Glass Door.
  - Cased Archway Opening.
- **Interactive Controls**: 1-click **Flip Hinge** (left/right) and **Flip Swing** (inward/outward).
- **Window Types**: Standard casement, sliding window, and fixed glass with sill overhangs and double-glazing lines.

### 4. Room Tags & Nominal Area
- **Nominal Area**: Each room is a rectangle you place and size; its area (Sq. Ft. and Sq. Meters) is simply width × height as drawn. It does not subtract wall thickness, so it is larger than the true usable (carpet) area, and rooms are not detected automatically from the walls.
- **Room Presets**: Living Room, Master Bedroom, Bedroom, Kitchen, Dining Room, Toilet/Bath, Balcony, Pooja Room, Car Porch, Foyer.
- **Dynamic Badges**: Displays room name, room dimensions (e.g. `12' - 0" × 14' - 0"`), and nominal area in real-time.

### 5. Architectural Fixture Library
2D vector top-down symbols for interior space planning:
- **Bedroom**: King Bed, Queen Bed, Wardrobe.
- **Living**: 3-Seater Sofa, 2-Seater Sofa, Armchair, Coffee Table, TV Console.
- **Dining**: 6-Seater and 4-Seater Dining Sets.
- **Kitchen**: Gas Stove / Hob, Double-Bowl Sink, Refrigerator.
- **Sanitary**: Toilet (WC with cistern), Vanity Washbasin, Shower Stall, Bathtub.
- **Outdoor**: Sedan Car, Potted Plants.
- Rotate items with `R` or Inspector buttons.

### 6. Dimensioning & Annotations
- Linear dimensioning tool with extension lines, architectural 45° tick marks, and formatted measurement text.

### 7. Multi-Unit System
- **Imperial**: Feet and Inches (e.g., `12' - 6"`).
- **Metric**: Meters and Millimeters (e.g., `3.81 m`, `230 mm`).
- Switch anytime from the top bar with instant recalculation.

### 8. Multi-Format Export
- **High-Res PNG**: Includes an architectural title block (Project title, client, date, total plot area, scale).
- **Vector SVG**: Infinite resolution scalable vector graphic.
- **AutoCAD DXF (R12 ASCII)**: Standard CAD format compatible with AutoCAD, LibreCAD, SketchUp, and Revit.
- **Printable PDF**: PDF-1.4 export in A4, A3, A2 or fit-to-drawing sizes (Portrait or Landscape) in Clean White or Dark Blueprint styles. The drawing is embedded as a high-resolution JPEG image of the sheet (not vector data), so text is not selectable; use SVG or DXF when you need vector output.
- **Project JSON**: Save your work as `.json` and reopen anytime.

### 9. Structural Columns & Multi-Floor System
- **RCC Columns (`C`)**: Standard 9"×9", 9"×12", 9"×15", and 12"×12" reinforced concrete columns with crosshairs.
- **Multi-Floor Drafting**: Ground, First, and Terrace floors with ghost underlays and Side-by-Side floor viewing.
- **Double Height Volumes**: Upper floor void cutouts (`OPEN TO BELOW`) with diagonal crosshatching and ceiling volume tags.
- **2-Tier Chained Dimensions**: Segmental setback chains and overall lot dimension strings with surveyor corner nodes (A–D).
- **Dotted Line Slab Markings**: Cantilever overhangs, chajjas, balconies, and building-wide roof slab projections.
- **Compound Walls & Landscape (`K` & `L`)**: Masonry boundary walls, gate piers, pavers, SUVs, motorcycles, trees, shrubs, and setback lawn greenery wash.

---

### 10. AutoCAD-style tools
- **Select many, edit together**: `Ctrl+A` selects everything, `Shift+click` adds/removes, and dragging on empty space draws a selection window (left-to-right = only what is fully inside, right-to-left = anything touched). Drag a selected object to move the whole group; the Properties panel then offers Move / Copy by distance, Rotate, Mirror, Layer and Delete.
- **Layers**: show / hide / lock / colour groups of objects (top bar → Layers). Hidden layers are not drawn, picked or exported; user layers keep their names in the DXF.
- **Command line** (bottom of the window, press `/`): type `HELP` for the list. While drawing a wall, aim with the mouse and type a length such as `12'` then Enter; `5',3'` is an absolute point, `@5',3'` relative (Y up) and `@12'<30` polar (counter-clockwise), as in AutoCAD. `MOVE`, `COPY`, `ROTATE`, `MIRROR`, `ERASE`, `ZOOM`, `LAYER`, ... work on the current selection; Enter on an empty line repeats the last command.
- **Schedules** (top bar): door / window / gate schedule and room schedule for all floors, with CSV download.
- **Snaps and polar tracking** (top bar: Polar, Snaps): endpoint, midpoint, intersection, perpendicular and nearest-point snaps; polar tracking in steps from 5 to 90 degrees.
- **Trace image** (top bar): load a PNG / JPEG / WebP scan under the drawing, set its true scale with two clicks and a typed distance, then draw over it. Saved with the project, never exported. (PDFs are not supported; export the page as an image first.)

---

### 11. More AutoCAD-style tools (top bar -> Tools)
- **Measure**: Distance, Area, Angle; **Zoom window** and **Previous view**.
- **Edit walls**: Offset (parallel copy), Trim, Extend, Corner (join two walls), Chamfer. Doors and windows keep their place when a wall changes length.
- **Floor finish**: tiles, diagonal tiles, wood, concrete or diagonal lines on selected rooms (also in Properties); exported to SVG and DXF.
- **Annotate**: text notes, leaders with arrowheads, angular dimensions, and dimension styles (large / small text, arrowheads, dots).
- **Blocks**: save a selection as a symbol and insert it again (rotated if you like); blocks travel with the project and are also kept in this browser.
- **Import DXF**: bring in a 2D ASCII DXF as reference lines to trace over, or as walls. Choose the drawing's units; the dialog shows the resulting size first.
- **Print at scale**: pick the paper and a scale such as 1:100 or 1:50 and download a PDF whose page is exactly the paper size, so that 100 mm on paper is 10 m in the building at 1:100. Print at 100% (not "fit to page").
- Everything above can also be typed in the command line (`HELP` lists the commands).

---

## ⌨️ Keyboard Shortcuts

| Key | Tool / Action |
| --- | --- |
| `V` / `Esc` | Select & Move Tool |
| `W` | Wall Tool |
| `K` | Compound / Boundary Wall Tool |
| `C` | RCC Column Tool |
| `D` | Door Tool |
| `G` | Compound Entrance Gate Tool |
| `N` | Window Tool |
| `L` | Landscape & Site Elements Tool |
| `P` | Plot Tool |
| `R` | Room Tool (or Rotate Selected Fixture) |
| `F` | Furniture & Fixtures Tool |
| `S` | Staircase Tool |
| `O` | Road Tool |
| `M` | Dimension Tool |
| `B` | Break Wall Tool |
| `Shift` (Hold) | Ortho Angle Lock (0°, 45°, 90°) |
| `Space` (Hold) + Drag | Pan Canvas |
| `Mouse Wheel` | Zoom In / Out |
| `Delete` / `Backspace` | Delete Selected Item |
| `Ctrl + A` | Select everything |
| `Shift` + click | Add / remove an object from the selection |
| `/` | Jump to the command line (type `HELP`) |
| `Ctrl + Z` | Undo |
| `Ctrl + Y` | Redo |

---

## 🧪 Tests

```bash
node --test                                   # 208 unit tests (needs Node 18+)
python run.py                                 # then, in another terminal:
python tests/browser_tests.py http://localhost:8080   # needs: pip install playwright
```

---

## 🌐 Deploy to GitHub Pages (Access from Anywhere)

Because HousePlanner CAD is built with 100% zero-dependency modern client-side standards, you can host it for free on GitHub Pages:

1. **Create a new GitHub repository**:
   - Go to [github.com/new](https://github.com/new) and create a repository (e.g., `house-planner`).
2. **Push your code**:
   ```bash
   git remote add origin https://github.com/rajendhar-reddy/house-planner.git
   git push -u origin main
   ```
3. **Enable GitHub Pages**:
   - Go to your repository on GitHub $\rightarrow$ **Settings** $\rightarrow$ **Pages** (in the left sidebar).
   - Under **Build and deployment** $\rightarrow$ **Source**, choose **Deploy from a branch**.
   - Select Branch: **`main`** and Folder: **`/ (root)`**, then click **Save**.
4. **Access your live app**:
   - In ~30-60 seconds, your CAD app will be live at:
     `https://rajendhar-reddy.github.io/house-planner/`

---

## 📁 Project Structure

```
D:/House Planner/
├── index.html           # CAD workspace UI layout
├── styles.css           # CAD studio dark theme styling
├── app.js               # Application coordinator & event dispatcher
├── run.py               # Python launcher script
├── README.md            # Documentation
└── modules/
    ├── ui/              # Large UI method groups mixed into the app class
    │   ├── input.js         # Mouse / keyboard / touch handling
    │   ├── overlays.js      # Drafting previews & hover HUD
    │   ├── tool_options.js  # Tool options bar
    │   ├── inspector.js     # Properties inspector panels
    │   ├── selection_panels.js  # Group panel, layer row, Layers dialog
    │   ├── command_bar.js   # Command line UI
    │   ├── snap_panel.js    # Polar button + Snaps popover
    │   ├── schedule_panel.js    # Schedules dialog
    │   ├── underlay_panel.js    # Trace image dialog
    │   ├── annotation_panel.js  # Text / leader / angular-dimension panels
    │   ├── blocks_panel.js      # Blocks dialog and library
    │   ├── dxf_import_panel.js  # DXF import dialog, reference lines
    │   ├── sheet_panel.js       # Print at scale dialog
    │   └── tools_menu.js        # The Tools menu
    ├── canvas.js        # Viewport, Pan/Zoom & Snapping engine
    ├── ids.js           # Shared collision-proof ID generator (wall_1, op_2, ...)
    ├── layers.js        # Layers: hide / lock / colour / current layer
    ├── transform.js     # Multi-select, Move / Copy / Rotate / Mirror / Delete
    ├── commands.js      # Command line: typed points, MOVE/COPY/..., direct distance entry
    ├── snap.js          # Snapping maths: endpoint, midpoint, intersection, perpendicular, nearest, polar
    ├── schedules.js     # Door / window / room schedules + CSV
    ├── underlay.js      # Trace-image rules: validation and scale calibration
    ├── wall_edit.js     # Offset / trim / extend / fillet / chamfer for walls
    ├── measure.js       # Distance, area, angle
    ├── hatch.js         # Floor-finish patterns
    ├── annotations.js   # Text notes, leaders, angular dimensions
    ├── dimstyles.js     # Dimension style presets and line ends
    ├── blocks.js        # User blocks (symbols)
    ├── dxf_import.js    # DXF reader / converter
    ├── sheet.js         # Print-to-scale layout maths
    ├── sheet_render.js  # Draws a sheet (frame, plan at 1:S, title strip, scale bar)
    ├── commands_ext.js  # Interactive commands: measure, wall editing, text, blocks, import, print
    ├── point_input.js   # Typed point / angle grammar shared by the command modules
    ├── dxf.js           # DXF writer (layers, text, wall thickness)
    ├── util.js          # Shared helpers (HTML escaping)
    ├── serializer.js    # Single save/restore engine (undo, autosave, JSON files, floors)
    ├── units.js         # Imperial / Metric conversion & formatting
    ├── plot.js          # Plot boundary, setbacks & North compass
    ├── walls.js         # Wall & compound wall drafting, thickness & corner joins
    ├── openings.js      # Doors, Windows, Gate piers, swing arcs & wall cutouts
    ├── rooms.js         # Room tags, ceiling heights & nominal area
    ├── furniture.js     # Top-down architectural fixtures & landscape site library
    ├── columns.js       # RCC structural columns
    ├── stairs.js        # Straight, dog-legged & L-shaped staircases
    ├── roads.js         # Frontage roads & street markings
    ├── floors.js        # Multi-floor coordination & side-by-side drawing layout
    ├── project_info.js  # Executive title block engineering stamps
    ├── dimensions.js    # Architectural dimensioning tool & 2-tier chains
    ├── samples.js       # Preloaded floor plan templates (2BHK, Villa, Duplex G+1)
    ├── pdf.js           # Client-side ISO-1.4 PDF engine
    └── exporter.js      # PNG, SVG, DXF & PDF export
```
