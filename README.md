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
- **Project JSON**: Save your work as `.json` and reopen anytime.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `V` / `Esc` | Select & Move Tool |
| `W` | Wall Tool |
| `D` | Door Tool |
| `N` | Window Tool |
| `P` | Plot Tool |
| `R` | Room Tool (or Rotate Selected Fixture) |
| `F` | Fixture / Furniture Tool |
| `M` | Dimension Tool |
| `Shift` (Hold) | Ortho Angle Lock (0°, 45°, 90°) |
| `Space` (Hold) + Drag | Pan Canvas |
| `Mouse Wheel` | Zoom In / Out |
| `Delete` / `Backspace` | Delete Selected Item |
| `Ctrl + Z` | Undo |
| `Ctrl + Y` | Redo |

---

## 📁 Project Structure

```
d:/House Planner/
├── index.html           # CAD workspace UI layout
├── styles.css           # CAD studio dark theme styling
├── app.js               # Application coordinator & event dispatcher
├── run.py               # Python launcher script
├── README.md            # Documentation
└── modules/
    ├── canvas.js        # Viewport, Pan/Zoom & Snapping engine
    ├── units.js         # Imperial / Metric conversion & formatting
    ├── plot.js          # Plot boundary, setbacks & North compass
    ├── walls.js         # Wall drafting, thickness & corner joins
    ├── openings.js      # Doors, Windows, swing arcs & wall cutouts
    ├── rooms.js         # Room tags & carpet area calculation
    ├── furniture.js     # Top-down architectural fixture symbols
    ├── dimensions.js    # Architectural dimensioning tool
    ├── samples.js       # Preloaded floor plan templates
    └── exporter.js      # PNG, SVG, DXF & JSON export
```
