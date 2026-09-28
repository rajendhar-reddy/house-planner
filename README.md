# 📐 2D House Planner CAD

A lightweight, zero-dependency, modern 2D Architectural CAD application designed for house planning and residential drafting.

From site/plot boundary marking with setbacks, to drafting exterior and interior walls, snapping doors and windows with architectural swing arcs, room carpet area calculation, placing furniture fixtures, linear dimensioning, and exporting to AutoCAD DXF, Vector SVG, and high-resolution PNG.

---

## 🚀 Quick Start

### Method 1: Using Python (Recommended)
Run the launcher script to start a local server and automatically open your default browser:
```bash
python run.py
```

### Method 2: Direct Browser Open
Simply double-click `index.html` or open it directly in Google Chrome, Microsoft Edge, or Firefox.

---

## ✨ Features

### 1. Site & Plot Marking
- **Rectangular & Custom Plots**: Mark property boundaries by dragging or typing dimensions (e.g., `30'` × `40'`).
- **Surveyor Boundary Lines**: Standard dashed-dot boundary styling with corner markers.
- **Setback Guidelines**: Front, Rear, Left, and Right setback margins forming the buildable envelope.
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
- **Topological Corner Joining**: Clean corner miter and intersection joints.

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

### 4. Room Detection & Carpet Area
- **Auto-Calculated Area**: Calculates carpet area in Sq. Ft. and Sq. Meters.
- **Room Presets**: Living Room, Master Bedroom, Bedroom, Kitchen, Dining Room, Toilet/Bath, Balcony, Pooja Room, Car Porch, Foyer.
- **Dynamic Badges**: Displays room name, room dimensions (e.g. `12' - 0" × 14' - 0"`), and carpet area in real-time.

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
- **Printable Vector PDF**: Professional ISO-1.4 PDF export in A4, A3, and A2 sizes (Portrait or Landscape) in Clean White or Dark Blueprint styles.
- **Project JSON**: Save your work as `.json` and reopen anytime.

### 9. Structural Columns & Multi-Floor System
- **RCC Columns (`C`)**: Standard 9"×9", 9"×12", 9"×15", and 12"×12" reinforced concrete columns with crosshairs.
- **Multi-Floor Drafting**: Ground, First, and Terrace floors with ghost underlays and Side-by-Side floor viewing.
- **Double Height Volumes**: Upper floor void cutouts (`OPEN TO BELOW`) with diagonal crosshatching and ceiling volume tags.
- **2-Tier Chained Dimensions**: Segmental setback chains and overall lot dimension strings with surveyor corner nodes (A–D).
- **Dotted Line Slab Markings**: Cantilever overhangs, chajjas, balconies, and building-wide roof slab projections.
- **Compound Walls & Landscape (`K` & `L`)**: Masonry boundary walls, gate piers, pavers, SUVs, motorcycles, trees, shrubs, and setback lawn greenery wash.

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
| `Ctrl + Z` | Undo |
| `Ctrl + Y` | Redo |

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
    ├── canvas.js        # Viewport, Pan/Zoom & Snapping engine
    ├── units.js         # Imperial / Metric conversion & formatting
    ├── plot.js          # Plot boundary, setbacks & North compass
    ├── walls.js         # Wall & compound wall drafting, thickness & corner joins
    ├── openings.js      # Doors, Windows, Gate piers, swing arcs & wall cutouts
    ├── rooms.js         # Room tags, ceiling heights & carpet area calculation
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
