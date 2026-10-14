# Changes in this version

## Second batch of AutoCAD-style tools
All of these are in the new **Tools** menu (top bar) and can also be typed in the command line.
- **Measure**: `DIST` (distance, direction, X/Y offsets), `AREA` (click an outline: area + perimeter), `ANGLE`; `ZOOM W` (window) and `ZOOM P`
  (previous view - also after a mouse-wheel zoom or pan).
- **Edit walls**: `OFFSET` (parallel copy), `TRIM`, `EXTEND`, `FILLET` (join two walls in a sharp corner), `CHAMFER`. Doors and windows stay
  where they are in the world when a wall is lengthened or shortened; any that no longer fit are removed and the command says so.
- **Floor finishes**: square tiles, diagonal tiles, wood planks, concrete dots and diagonal lines on rooms (Properties > Floor finish, or
  `HATCH <type> [size %]` on selected rooms). Exported to SVG and DXF (layer HATCH; not for polygon-shaped rooms).
- **Annotation**: text notes (`TEXT`), leaders with arrowheads (`LEADER`), angular dimensions (`DIMANGULAR`) and dimension styles (Standard,
  Large text, Small text, Arrowheads, Dots: `DIMSTYLE`, or per dimension in Properties). They are selectable, draggable, copyable, mirror-safe
  (text is never flipped), on their own Annotation layer, saved per floor, and exported to PNG / SVG / DXF (TEXT entities).
- **Blocks**: save a selection as a named symbol (`BLOCK`, or "Save as block" in the group panel), insert it any number of times with a
  rotation (`INSERT`), manage them in the Blocks dialog. Kept in the project and in a library in this browser for other projects. Insertion
  makes ordinary editable copies.
- **DXF import** (`IMPORTDXF`): ASCII DXF with lines, polylines, circles, arcs and text. Imports as thin reference lines to trace over (saved
  with the project, re-exported to DXF on layer REFERENCE) or as walls. Reads the file's units, shows the resulting size before importing, and
  refuses binary DXF and DWG with instructions. Blocks (INSERT), splines, hatches and dimensions are counted and reported, not imported.
- **Print at scale** (`SHEET`): choose paper (A4-A1, Letter, Tabloid, Arch D), orientation, 1:S scale (including 1:48 and 1:96) and the part of
  the drawing; title strip with scale bar; PDF with a page of exactly the paper size, or PNG. At 1:100 a 240 in wall measures 480 px at 200 dpi
  (checked on real pixels). If the drawing does not fit, it says so and offers the smallest standard scale that does. Text and line weights keep
  the same physical size at any resolution.
- **Not included**: radius and diameter dimensions (the app has no circle or arc objects to measure).

## Fixes made along the way
- Export, fit-to-drawing and print areas now include annotation (a note alone on the page used to export as "nothing").
- Autosave now keeps projects made only of notes, leaders, angular dimensions, reference lines or a traced picture (they were treated as empty).
- **Clear canvas** also removes the traced picture and imported reference lines (saved blocks are kept).
- The Properties overview refreshes after a sample plan loads (it showed zeros in the original).
- Loading a file no longer replaces an object's method with text when a saved field has the same name as the method.
- The shared block library no longer keeps "Bath" and "bath" as two blocks.
- The desktop toolbar now has a "Tools" button; it wraps onto extra rows so every control stays reachable.

## New features (AutoCAD-style, first batch)
- **Multi-select + Move / Copy / Rotate / Mirror.** Ctrl+A, Shift+click to add/remove, rubber-band drag
  (left-to-right = window: only what is fully inside; right-to-left = crossing: anything touched; works starting
  inside the plot). Drag any selected object to move the whole group. The group panel does Move/Copy by distance,
  Rotate, Mirror (with "keep original"), Layer and Delete. Doors/windows travel with their wall. Rooms swap
  width/height on a 90-degree turn (they are axis-aligned rectangles).
- **Layers.** Hide / lock / rename / colour / "draw new objects on this layer". Hidden layers are not drawn, picked,
  snapped to or exported; locked layers are drawn but cannot be picked. Saved with the project and in undo. User
  layers appear by name and colour in the DXF export (the colour is DXF-only).
- **Command line** (bottom of the window; `/` focuses it). Direct distance entry: while drawing a wall, aim with the
  mouse, type `12'` + Enter (digits typed while drawing go straight to it). Typed points: `5',3'` absolute (Y down,
  as in the status-bar readout), `@5',3'` relative and `@12'<30` polar (Y up / counter-clockwise, as in AutoCAD).
  Commands: tool names, MOVE, COPY, ROTATE, MIRROR, ERASE, ALL, UNDO, REDO, ZOOM, ORTHO, SNAP, POLAR, OSNAP, UNITS,
  LAYER ..., LAYERS, SCHEDULE, UNDERLAY ..., HELP. Enter on an empty line repeats the last command.
- **Schedules.** Door / window / gate schedule (grouped by type and size, marks D1/W1/G1, counts per floor) and room
  schedule with totals, across all floors; CSV download (UTF-8, formula-injection safe) and copy.
- **More snaps + polar tracking.** Intersection, perpendicular and nearest-point snaps, polar tracking in 5-90 degree
  steps (Polar button), a Snaps popover to switch each snap on/off. Choices are remembered between sessions.
- **Trace image (underlay).** Load a PNG/JPEG/WebP scan or sketch under the drawing, set its real scale by clicking two
  points and typing the real distance, move / lock / hide / fade it. Saved with the project; never exported.
  (PDF files are not supported - export the page as an image first.)

## Toolbar
- The desktop toolbar now **wraps** instead of hiding buttons off-screen. In the original, PNG / PDF / SVG / DXF and
  the clear button were unreachable on a 1400 px wide window. (Below 1024 px it still scrolls sideways.)
- The Ortho and Snap button labels now follow their state ("Ortho: ON").

## Data safety
- **Collision-proof IDs** (`modules/ids.js`): IDs restored from a saved project are now reserved, so new
  objects can never reuse an existing id (previously possible after any page reload).
- **One serializer** (`modules/serializer.js`) now powers undo/redo, autosave, Save/Open JSON, sample
  projects and the per-floor snapshots. The four hand-copied field lists are gone.
  - Fields that used to be silently lost are now kept: column `type`, room `polygon`/`autoOrientNarrow`,
    road `sidewalkWidth`/`customLine`, and each floor's slab settings.
  - Opening a file validates it first, skips unusable records, repairs duplicate ids (the bundled
    `my_50x52` project had a duplicate `room_5`), drops doors/windows whose wall is missing, and rolls
    back to the previous drawing if anything fails. Newer-format files are refused with a clear message.
  - Undo snapshots no longer share nested objects with live objects.
- **Autosave**: now also saves projects that contain only rooms/furniture/etc., is debounced, runs after
  undo/redo, shows an error when the browser refuses the write, and keeps an unreadable autosave as
  `houseplanner_autosave_corrupt` instead of overwriting it.
- **Save JSON** exports the live drawing (it used to export the last history snapshot).
- **Clear canvas** now also clears the upper floors and slab projection.

## Security / correctness
- User text (room/road/column/door names, slab labels) is HTML-escaped in the inspector.
- SVG export XML-escapes names, so "Bed & Bath" no longer produces a broken file.
- DXF layer table declares the right number of layers and gives them distinct colours.

## Geometry review fixes
- **Typed measurements were silently misread** (`units.parseInput`): `6 inches` became 6 *feet*,
  `36 inch` -> 36 ft, `12' 6 1/2"` dropped the 6 1/2", `3 feet 4 inches` dropped the 4", `1/2"` -> 12",
  `2.5 meters` -> 2.5 ft, `1,5m` -> 1 m, and junk like `10abc` was accepted as 10 ft. Parsing is now a strict
  grammar (words, fractions, decimal commas supported); unclear text is rejected instead of guessed.
- **Doors/windows/gates** can no longer be placed (or resized in the inspector) so that they are wider than
  their wall, or on top of another opening.
- **Clean-theme exports** (PNG/PDF default) drew every door/window cut-out as a dark navy block because the
  cut-out colour was hard-coded to the dark canvas. It now follows the theme. PNG export also passes the theme
  to walls now.
- **Undo history was flushed by typing**: 8 inspector inputs (room/road/column/door names, slab label/tag/colour,
  north-angle slider) saved a full snapshot per keystroke/tick, so one 14-letter name used 14 of the 30 undo
  steps. A burst of input is now one undo step.

## Your six decisions
1. **Stairs**: the plan now states what it really draws, e.g. "16 RISES / 15 TREADS" (inspector "Plan shows", DXF and SVG
   labels); the input is labelled "Total Steps (rises)". Verified against the tread lines the renderer actually draws.
2. **Front setback follows the road**: "Front" is the side of the widest road (bottom if there is none, so existing plans
   are unchanged); "Left/Right" are as seen standing on the road. Buildable area, dimension chains and margin badges all
   use the physical edges. Also fixed: a setback of **0** was shown/treated as 36" or 60".
3. **Room area** is labelled "Nominal Area" (width x height; it does not subtract wall thickness).
4. **Mitred wall corners** are now the default, with a toolbar toggle "Corners: Mitred / Rounded" (saved with the project,
   part of undo). Free wall ends are square; compound walls keep their piers. SVG and DXF exports use the same corners.
5. Slab over two detached buildings: not changed (still follows the first building only).
6. Circular columns: not implemented; the misleading code comment was corrected.

## Inspector fix found while testing
- **Inch marks were being cut off** in 32 length fields (wall length/thickness, door width, stair depths, setbacks...):
  `16' - 8"` was shown as `16' - 8` because the `"` ended the HTML attribute. All are escaped now.

## Exports (DXF / PDF / SVG / PNG)
- **DXF rewritten** (`modules/dxf.js`, pure + unit-tested): doors/windows/gates now follow the wall angle (they were
  always horizontal); walls have real thickness (both faces + end caps; centreline on its own layer); furniture keeps
  its rotation; room name/size/area, stair labels, column labels and dimension text are exported as TEXT; dimension
  extension lines added; non-Latin text is escaped to `\U+XXXX`; LTYPE table added. Units are inches.
  Validated with a strict structural checker, NOT in a CAD program - please open one export in AutoCAD/LibreCAD.
- **PDF metadata**: titles/clients/authors are now written as proper PDF text strings (UTF-16BE when non-Latin), so
  non-Latin names no longer show as mojibake and "(", ")" and "/" are no longer stripped. The PDF is a JPEG of the
  sheet, not vector data; the README no longer says "vector".
- Furniture bounds now account for rotation (affects export extents).

## Floors
- "Copy Structure" no longer stacks duplicate "Open to Below" rooms when pressed twice, and void ids are unique.
- Other floors are no longer rebuilt as new objects on every redraw (it also burned an id per object per frame).

## Fixtures
- The Refrigerator had no drawing code and rendered as the generic box with an X; it now has its own symbol.

## Behaviour
- Leaving the page now warns only if the autosave could not be written (it used to claim "unsaved changes" every time).
- Bundled project `my_50x52_residential_plan`: duplicate `room_5` renumbered (`user_projects.js` regenerated).

## Canvas
- **Dragging furniture/fixtures was broken**: `app.js` called `canvasEngine.getGridSnap()`, which did not
  exist, so every mouse move while dragging threw an error (with grid snap on, the default). Added it.
- Rendering is on demand (was a full redraw 60x/second even when idle).
- Grid snapping follows the active unit system (metric mode snapped to 1 ft before).
- Ortho lock can no longer be broken by an endpoint/grid snap.
- Grid lines are computed from integer indices (no float drift in metric mode).
- Space-to-pan no longer scrolls the page / clicks a focused button, and ignores textareas/selects.

## Docs
- README no longer claims the app runs by double-clicking `index.html` (browsers block ES modules on
  `file://`); the page now shows instructions if opened that way.

## Code structure
- `app.js` shrank from ~4,900 to ~970 lines. The large UI method groups were moved **unchanged** into
  `modules/ui/` and are attached to the app class with `mixin()` (`modules/util.js`):
  `input.js` (mouse/keyboard/touch), `overlays.js` (drafting previews, hover HUD),
  `tool_options.js` (options bar), `inspector.js` (properties panel).
- Verified by: static undeclared-identifier scan of every module, the 20-check behaviour suite,
  pixel-identical renders of all sample plans, and side-by-side mouse/keyboard interaction runs.

## Tests
- `node --test` (or `npm test`) - 208 unit tests: walls, mitres, openings, rooms, columns, dimensions, stairs, ids, units, DXF, PDF,
  slab geometry, rendering of every fixture, layers, multi-select transforms, snapping, command line, schedules and underlay
  (mutation-checked: deliberately breaking the code makes them fail).
- `tests/browser_tests.py` - 99 browser checks; `tests/interaction_check.py` - mouse/keyboard session.
