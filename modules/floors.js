/**
 * floors.js - Multi-Floor Architecture & Side-by-Side CAD Drafting
 * Manages Ground Floor, First Floor, and Terrace levels with spatial offsets,
 * structural column continuity, floor title banners, and underlay ghosting.
 */

import { units } from './units.js';
import { Wall } from './walls.js';
import { Room } from './rooms.js';
import { Opening } from './openings.js';
import { Stair } from './stairs.js';
import { DimensionLine } from './dimensions.js';
import { serializeEntities, restoreEntities } from './serializer.js';
import { TextNote, Leader, AngularDim } from './annotations.js';

export class Floor {
    constructor(id, name, level = 0) {
        this.id = id;
        this.name = name;
        this.level = level; // 0 = Ground, 1 = First, 2 = Terrace
        this.walls = [];
        this.openings = [];
        this.rooms = [];
        this.columns = [];
        this.furniture = [];
        this.stairs = [];
        this.dimensions = [];
        this.texts = [];
        this.leaders = [];
        this.angdims = [];
        this.slabConfig = null;
    }

    /**
     * Compute total built-up area for this floor in sq inches
     */
    getBuiltUpArea() {
        if (!this.rooms || this.rooms.length === 0) {
            // If no rooms defined yet, estimate from outer wall bounds
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            let hasWalls = false;
            for (const w of this.walls) {
                if (w.type === 'exterior') {
                    minX = Math.min(minX, w.start.x, w.end.x);
                    minY = Math.min(minY, w.start.y, w.end.y);
                    maxX = Math.max(maxX, w.start.x, w.end.x);
                    maxY = Math.max(maxY, w.start.y, w.end.y);
                    hasWalls = true;
                }
            }
            if (hasWalls) {
                return Math.max(0, (maxX - minX) * (maxY - minY));
            }
            return 0;
        }

        let total = 0;
        for (const r of this.rooms) {
            // Voids and cutouts do not contribute to slab built-up area
            if (!r.isVoid) {
                if (typeof r.getArea === 'function') {
                    total += r.getArea();
                } else if (r.width && r.height) {
                    total += r.width * r.height;
                }
            }
        }
        return total;
    }

    /**
     * Get bounding box of all elements on this floor in floor-local coordinates
     */
    getBounds() {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasElements = false;

        for (const w of this.walls) {
            minX = Math.min(minX, w.start.x, w.end.x);
            minY = Math.min(minY, w.start.y, w.end.y);
            maxX = Math.max(maxX, w.start.x, w.end.x);
            maxY = Math.max(maxY, w.start.y, w.end.y);
            hasElements = true;
        }

        for (const c of this.columns) {
            const hw = (c.width || 9) / 2;
            const hd = (c.depth || 12) / 2;
            minX = Math.min(minX, c.x - hw);
            minY = Math.min(minY, c.y - hd);
            maxX = Math.max(maxX, c.x + hw);
            maxY = Math.max(maxY, c.y + hd);
            hasElements = true;
        }

        for (const r of this.rooms) {
            const hw = (r.width || 120) / 2;
            const hh = (r.height || 120) / 2;
            minX = Math.min(minX, r.x - hw);
            minY = Math.min(minY, r.y - hh);
            maxX = Math.max(maxX, r.x + hw);
            maxY = Math.max(maxY, r.y + hh);
            hasElements = true;
        }

        if (!hasElements) {
            return { x: 0, y: 0, width: 288, height: 384 };
        }

        return {
            x: minX,
            y: minY,
            width: Math.max(maxX - minX, 100),
            height: Math.max(maxY - minY, 100)
        };
    }
}

export class FloorManager {
    constructor(app) {
        this.app = app;
        this.floors = [
            new Floor('ground', 'Ground Floor Plan', 0),
            new Floor('first', 'First Floor Plan', 1),
            new Floor('terrace', 'Terrace Plan', 2)
        ];
        this.activeFloorId = 'ground';
        this.viewMode = 'active'; // 'active' (single level focus) | 'side_by_side' (both levels rendered)
        this.showGhost = true; // show faint dashed ghost outline of ground floor on first floor
        this.floorSpacing = 180; // 15 feet horizontal gap between side-by-side floors in inches
    }

    /** Back to a blank 3-floor set-up (used when a new / single-floor project is opened). */
    reset() {
        this.floors = [
            new Floor('ground', 'Ground Floor Plan', 0),
            new Floor('first', 'First Floor Plan', 1),
            new Floor('terrace', 'Terrace Plan', 2)
        ];
        this.activeFloorId = 'ground';
        this.viewMode = 'active';
        this.showGhost = true;
        this.floorSpacing = 180;
        this.updateFloorSwitcherUI();
    }

    getActiveFloor() {
        return this.floors.find(f => f.id === this.activeFloorId) || this.floors[0];
    }

    getFloor(id) {
        return this.floors.find(f => f.id === id);
    }

    /**
     * Compute the horizontal spatial drawing offset for a given floor in side-by-side mode
     */
    getFloorOffset(floorId) {
        if (this.viewMode !== 'side_by_side') {
            return { x: 0, y: 0 };
        }

        // In side-by-side mode:
        // Ground: x = 0
        // First Floor: x = GroundWidth + Spacing
        // Terrace: x = GroundWidth + Spacing + FirstWidth + Spacing
        const ground = this.getFloor('ground');
        const gb = ground ? ground.getBounds() : { width: 360 };
        const groundPlotBounds = (this.app.plotManager && this.app.plotManager.plot)
            ? this.app.plotManager.getBounds()
            : null;
        const groundPlotW = groundPlotBounds ? groundPlotBounds.width : (gb.width || 360);
        const colWidth = Math.max(groundPlotW || 0, gb.width || 0, 360);
        const shift = colWidth + (this.floorSpacing || 180);

        if (floorId === 'first') {
            return { x: shift, y: 0 };
        } else if (floorId === 'terrace') {
            return { x: shift * 2, y: 0 };
        }
        return { x: 0, y: 0 };
    }

    /**
     * Snapshot the active CAD manager state into the currently active Floor object.
     * Uses the shared serializer so a floor keeps exactly the same data as a project.
     */
    saveCurrentFloorState() {
        const floor = this.getActiveFloor();
        if (!floor) return;

        Object.assign(floor, serializeEntities(this.app));
        floor.slabConfig = this.app.slabManager ? this.app.slabManager.serialize() : null;
    }

    /**
     * Restore a target floor's state into the active CAD managers
     */
    restoreFloorState(floorId) {
        const floor = this.getFloor(floorId);
        if (!floor) return;

        this.app.clearSelection();

        const warnings = restoreEntities(this.app, floor);
        if (warnings.length) console.warn(`Floor "${floorId}" restored with warnings:`, warnings);

        // Slab Configuration
        if (floor.slabConfig && this.app.slabManager) {
            this.app.slabManager.deserialize(JSON.parse(JSON.stringify(floor.slabConfig)));
            if (this.app.plotManager) {
                this.app.plotManager.showSlabProjection = this.app.slabManager.enabled;
                this.app.plotManager.slabProjectionOffset = this.app.slabManager.uniformOffset;
            }
        }
    }

    /**
     * Switch active floor
     */
    switchFloor(targetFloorId) {
        if (this.activeFloorId === targetFloorId) return;

        // Save current floor first
        this.saveCurrentFloorState();

        this.activeFloorId = targetFloorId;

        // Restore target floor
        this.restoreFloorState(targetFloorId);

        // Update UI Tabs
        this.updateFloorSwitcherUI();

        this.app.saveHistory();
        this.app.updateInspector();
        this.app.render();
    }

    /**
     * Toggle between Single Active Floor and Side-by-Side drafting
     */
    setViewMode(mode) {
        if (this.viewMode === mode) return;
        this.saveCurrentFloorState();
        this.viewMode = mode;
        this.updateFloorSwitcherUI();

        if (mode === 'side_by_side') {
            this.fitSideBySideView();
        } else {
            const b = this.getActiveFloor().getBounds();
            this.app.canvasEngine.fitToBounds(b, 60);
        }
        this.app.render();
    }

    /**
     * Auto fit both Ground & First Floor on screen
     */
    fitSideBySideView() {
        const bounds = this.getSideBySideTotalBounds();
        this.app.canvasEngine.fitToBounds(bounds, 60);
    }

    /**
     * Compute unified bounding box covering Ground Floor, First Floor, and Roads
     */
    getSideBySideTotalBounds() {
        const ground = this.getFloor('ground');
        const first = this.getFloor('first');
        const gb = ground ? ground.getBounds() : { x: 0, y: 0, width: 360, height: 480 };
        const fb = first ? first.getBounds() : { x: 0, y: 0, width: 360, height: 480 };

        const offset1 = this.getFloorOffset('first');

        let minX = Math.min(gb.x, fb.x + offset1.x);
        let minY = Math.min(gb.y, fb.y + offset1.y);
        let maxX = Math.max(gb.x + gb.width, fb.x + offset1.x + fb.width);
        let maxY = Math.max(gb.y + gb.height, fb.y + offset1.y + fb.height);

        // Include plot boundary and 2-tier setback dimension strings
        if (this.app.plotManager && this.app.plotManager.plot) {
            const pbDim = (typeof this.app.plotManager.getBoundsWithDimensions === 'function')
                ? this.app.plotManager.getBoundsWithDimensions()
                : this.app.plotManager.getBounds();
            if (pbDim) {
                minX = Math.min(minX, pbDim.x);
                minY = Math.min(minY, pbDim.y);
                maxX = Math.max(maxX, pbDim.x + pbDim.width);
                maxY = Math.max(maxY, pbDim.y + pbDim.height);
            }
        }

        // Include road if present on ground floor
        if (this.app.roadManager && this.app.roadManager.roads.length > 0 && this.app.plotManager && this.app.plotManager.plot) {
            const pb = this.app.plotManager.getBounds();
            for (const r of this.app.roadManager.roads) {
                const g = r.getGeometry(pb);
                if (g && g.bounds) {
                    minX = Math.min(minX, g.bounds.x);
                    minY = Math.min(minY, g.bounds.y);
                    maxX = Math.max(maxX, g.bounds.x + g.bounds.width);
                    maxY = Math.max(maxY, g.bounds.y + g.bounds.height);
                }
            }
        }

        // Add 60 inches margin for floor title banners below
        return {
            x: minX,
            y: minY,
            width: Math.max(maxX - minX, 100),
            height: Math.max(maxY - minY + 70, 100)
        };
    }

    /**
     * Copy structural core (RCC Columns, Perimeter Walls, and Double Height Voids) to Upper Floor
     */
    copyStructureToFloor(sourceFloorId = 'ground', targetFloorId = 'first') {
        this.saveCurrentFloorState();
        const src = this.getFloor(sourceFloorId);
        const tgt = this.getFloor(targetFloorId);
        if (!src || !tgt) return;

        // 1. Copy RCC structural columns (identical coordinates for load transfer)
        tgt.columns = src.columns.map((c, i) => ({
            ...c,
            id: `col_f_${i + 1}`
        }));

        // 2. Copy exterior perimeter walls (structural load-bearing perimeter)
        const extWalls = src.walls.filter(w => w.type === 'exterior');
        tgt.walls = extWalls.map((w, i) => ({
            ...w,
            id: `wall_f_${i + 1}`
        }));

        // 3. For any Ground Floor room with double height ceiling, automatically create an 'OPEN TO BELOW' void.
        //    Voids made by an earlier "Copy Structure" are replaced, not stacked on top of each other.
        tgt.rooms = tgt.rooms.filter(r => !(typeof r.id === 'string' && r.id.startsWith('room_void_')));
        let voidSeq = 0;
        for (const rm of src.rooms) {
            if (rm.isDoubleHeight) {
                tgt.rooms.push({
                    id: `room_void_${Date.now()}_${++voidSeq}`,
                    x: rm.x,
                    y: rm.y,
                    name: 'Open to Below',
                    width: rm.width,
                    height: rm.height,
                    color: 'rgba(148, 163, 184, 0.05)',
                    tagStyle: 'clean',
                    isVoid: true,
                    voidType: 'open_to_below'
                });
            }
        }

        // If target floor is currently active, reload managers
        if (this.activeFloorId === targetFloorId) {
            this.restoreFloorState(targetFloorId);
        }

        this.app.saveHistory();
        this.app.updateInspector();
        this.app.render();

        const pill = document.getElementById('autosaveStatus');
        if (pill) {
            pill.innerHTML = `● Copied Structure to ${tgt.name}`;
            pill.style.color = '#38bdf8';
        }
    }

    /**
     * Render multi-floor canvas:
     * - If in side-by-side mode, renders all floors with title banners.
     * - If in single-floor mode, renders active floor with optional ghost outline of lower floor.
     */
    render(ctx, scale, isExport = false, style = 'blueprint') {
        const isClean = style === 'clean';

        if (this.viewMode === 'side_by_side' || isExport) {
            this.saveCurrentFloorState();

            // Render Ground Floor at offset (0, 0)
            const ground = this.getFloor('ground');
            if (ground) {
                this.renderSingleFloorInstance(ctx, ground, { x: 0, y: 0 }, scale, isExport, style);
                this.renderFloorTitleBanner(ctx, ground, { x: 0, y: 0 }, scale, isClean);
            }

            // Render First Floor at offset
            const first = this.getFloor('first');
            if (first && (first.walls.length > 0 || first.rooms.length > 0 || first.columns.length > 0)) {
                const off1 = this.getFloorOffset('first');
                this.renderSingleFloorInstance(ctx, first, off1, scale, isExport, style);
                this.renderFloorTitleBanner(ctx, first, off1, scale, isClean);
            }

            // Render Terrace Floor if has content
            const terrace = this.getFloor('terrace');
            if (terrace && terrace.walls.length > 0) {
                const off2 = this.getFloorOffset('terrace');
                this.renderSingleFloorInstance(ctx, terrace, off2, scale, isExport, style);
                this.renderFloorTitleBanner(ctx, terrace, off2, scale, isClean);
            }
        } else {
            // Single Floor view
            // If on First Floor and showGhost is true, render faint dashed underlay of Ground Floor
            if (this.activeFloorId === 'first' && this.showGhost) {
                this.renderGhostUnderlay(ctx, scale, isClean);
            }

            // Floor banner under active floor
            const active = this.getActiveFloor();
            if (active) {
                this.renderFloorTitleBanner(ctx, active, { x: 0, y: 0 }, scale, isClean);
            }
        }
    }

    /**
     * Render faint dashed ghost underlay of Ground Floor walls and columns
     */
    renderGhostUnderlay(ctx, scale, isClean) {
        const ground = this.getFloor('ground');
        if (!ground || ground.walls.length === 0) return;

        ctx.save();
        ctx.strokeStyle = isClean ? 'rgba(148, 163, 184, 0.40)' : 'rgba(56, 189, 248, 0.25)';
        ctx.lineWidth = 1.0 / scale;
        ctx.setLineDash([6 / scale, 6 / scale]);

        for (const w of ground.walls) {
            ctx.beginPath();
            ctx.moveTo(w.start.x, w.start.y);
            ctx.lineTo(w.end.x, w.end.y);
            ctx.stroke();
        }

        // Faint column indicators
        ctx.fillStyle = isClean ? 'rgba(148, 163, 184, 0.25)' : 'rgba(56, 189, 248, 0.15)';
        for (const c of ground.columns) {
            const hw = (c.width || 9) / 2;
            const hd = (c.depth || 12) / 2;
            ctx.fillRect(c.x - hw, c.y - hd, c.width || 9, c.depth || 12);
            ctx.strokeRect(c.x - hw, c.y - hd, c.width || 9, c.depth || 12);
        }

        ctx.setLineDash([]);
        ctx.restore();
    }

    /**
     * Turn saved floor data into real objects ONCE per data array, instead of rebuilding them on
     * every redraw (which also burned an id per object per frame). The cache is keyed on the array
     * itself and its length, so replacing the array (every save/restore does) or pushing to it
     * invalidates it.
     */
    _hydrated(list, build) {
        if (!list) return [];
        if (!this._hydrationCache) this._hydrationCache = new WeakMap();
        let hit = this._hydrationCache.get(list);
        if (!hit || hit.len !== list.length) {
            hit = { len: list.length, items: list.map(build) };
            this._hydrationCache.set(list, hit);
        }
        return hit.items;
    }

    /**
     * Render a floor instance with a translation offset
     */
    renderSingleFloorInstance(ctx, floor, offset, scale, isExport, style) {
        ctx.save();
        ctx.translate(offset.x, offset.y);

        // If this floor is the active one in the editor, delegate to active managers
        if (floor.id === this.activeFloorId && !isExport) {
            // Active managers handle rendering in main loop
            ctx.restore();
            return;
        }

        // Otherwise render from floor data
        const isClean = style === 'clean';

        // 1. Rooms
        for (const roomObj of this._hydrated(floor.rooms, r => (r instanceof Room) ? r : Object.assign(new Room(r.x, r.y, r), r))) {
            this.app.roomManager.renderSingleRoom(ctx, roomObj, scale, false, isExport, style);
        }

        // 2. Walls
        const wallObjs = this._hydrated(floor.walls, w => (w instanceof Wall) ? w : Object.assign(new Wall(w.start, w.end, w.thickness, w.type), w));
        const joins = this.app.wallManager.getJoinedPolygons(wallObjs);
        for (const wallObj of wallObjs) {
            this.app.wallManager.renderSingleWall(ctx, wallObj, scale, false, null, style, joins);
        }

        // 3. Openings (Doors, Windows, and Gates)
        const wallById = new Map(wallObjs.map(w => [w.id, w]));
        for (const openObj of this._hydrated(floor.openings, o => (o instanceof Opening) ? o : Object.assign(new Opening(o.wallId, o.t, o), o))) {
            const wallObj = wallById.get(openObj.wallId);
            if (wallObj) this.app.openingManager.renderSingleOpening(ctx, openObj, wallObj, scale, false);
        }

        // 4. Columns
        for (const c of floor.columns) {
            this.app.columnManager.renderSingleColumn(ctx, c, scale, false, isExport, isClean);
        }

        // 5. Furniture
        for (const f of floor.furniture) {
            this.app.furnitureManager.renderSingleItem(ctx, f, scale, false);
        }

        // 6. Stairs
        if (floor.stairs && floor.stairs.length > 0) {
            for (const stairObj of this._hydrated(floor.stairs, s => (s instanceof Stair) ? s : new Stair(s))) {
                stairObj.render(ctx, scale, false);
            }
        }

        // 6b. Annotation (text notes, leaders, angular dimensions)
        const ann = this.app.annotationManager;
        if (ann) {
            for (const t of this._hydrated(floor.texts, r => (r instanceof TextNote) ? r : Object.assign(new TextNote(r.x, r.y, r), r))) ann.renderText(ctx, t, scale, false, isClean);
            for (const l of this._hydrated(floor.leaders, r => (r instanceof Leader) ? r : Object.assign(new Leader(r.points, r), r))) ann.renderLeader(ctx, l, scale, false, isClean);
            for (const d of this._hydrated(floor.angdims, r => (r instanceof AngularDim) ? r : Object.assign(new AngularDim(r.vertex, r.p1, r.p2, r), r))) ann.renderAngular(ctx, d, scale, false, isClean, isExport);
        }

        // 7. Dimensions
        if (floor.dimensions && floor.dimensions.length > 0 && this.app.dimensionManager) {
            const dimObjs = this._hydrated(floor.dimensions, d => {
                const startPt = d.start || d.p1 || { x: 0, y: 0 };
                const endPt = d.end || d.p2 || { x: 0, y: 0 };
                return (d instanceof DimensionLine) ? d : Object.assign(new DimensionLine(startPt, endPt, d.offset, d.customText || d.text), d);
            });
            for (const dimObj of dimObjs) {
                this.app.dimensionManager.renderSingleDimension(ctx, dimObj, scale, false, isExport, style);
            }
        }

        ctx.restore();
    }

    /**
     * Render architectural floor title banner directly under each floor plan
     */
    renderFloorTitleBanner(ctx, floor, offset, scale, isClean) {
        const bounds = floor.getBounds();
        const cx = offset.x + bounds.x + bounds.width / 2;
        const cy = offset.y + bounds.y + bounds.height + 42; // 3.5 ft below floor

        const builtUpSqInches = floor.getBuiltUpArea();
        const builtUpFormatted = units.formatArea(builtUpSqInches).primary;

        const titleText = floor.name.toUpperCase().split('').join(' ');
        const subText = `BUILT-UP AREA = ${builtUpFormatted}`;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Primary Floor Title Banner
        const titleFontSize = 13.0; // world units
        ctx.font = `bold ${titleFontSize}px sans-serif`;
        ctx.fillStyle = isClean ? '#0f172a' : '#f8fafc';
        ctx.fillText(titleText, cx, cy);

        // Subtitle: Built-up area
        const subFontSize = 9.0;
        ctx.font = `600 ${subFontSize}px sans-serif`;
        ctx.fillStyle = isClean ? '#0284c7' : '#38bdf8';
        ctx.fillText(subText, cx, cy + 18);

        // Architectural divider line under floor title
        const lineW = Math.max(bounds.width * 0.70, 160);
        ctx.strokeStyle = isClean ? 'rgba(15, 23, 42, 0.40)' : 'rgba(56, 189, 248, 0.50)';
        ctx.lineWidth = 1.2 / scale;
        ctx.beginPath();
        ctx.moveTo(cx - lineW / 2, cy + 30);
        ctx.lineTo(cx + lineW / 2, cy + 30);
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Update Floor Switcher UI tab states in the top toolbar
     */
    updateFloorSwitcherUI() {
        document.querySelectorAll('.floor-tab-btn').forEach(btn => {
            const fid = btn.dataset.floor;
            if (this.viewMode === 'side_by_side') {
                btn.classList.toggle('active', fid === 'side_by_side');
            } else {
                btn.classList.toggle('active', fid === this.activeFloorId);
            }
        });
    }

    serialize() {
        this.saveCurrentFloorState();
        return {
            activeFloorId: this.activeFloorId,
            viewMode: this.viewMode,
            showGhost: this.showGhost,
            floorSpacing: this.floorSpacing,
            floors: this.floors.map(f => ({
                id: f.id,
                name: f.name,
                level: f.level,
                walls: f.walls,
                openings: f.openings,
                rooms: f.rooms,
                columns: f.columns,
                furniture: f.furniture,
                stairs: f.stairs,
                dimensions: f.dimensions,
                texts: f.texts || [],
                leaders: f.leaders || [],
                angdims: f.angdims || [],
                slabConfig: f.slabConfig || null
            }))
        };
    }

    deserialize(data) {
        if (!data) return;
        this.activeFloorId = data.activeFloorId || 'ground';
        this.viewMode = data.viewMode || 'active';
        this.showGhost = data.showGhost !== undefined ? data.showGhost : true;
        this.floorSpacing = data.floorSpacing || 180;
        if (data.floors && Array.isArray(data.floors)) {
            data.floors.forEach(df => {
                const fl = this.getFloor(df.id);
                if (fl) {
                    fl.name = df.name || fl.name;
                    fl.level = df.level !== undefined ? df.level : fl.level;
                    fl.walls = df.walls || [];
                    fl.openings = df.openings || [];
                    fl.rooms = df.rooms || [];
                    fl.columns = df.columns || [];
                    fl.furniture = df.furniture || [];
                    fl.stairs = df.stairs || [];
                    fl.dimensions = df.dimensions || [];
                    fl.texts = df.texts || [];
                    fl.leaders = df.leaders || [];
                    fl.angdims = df.angdims || [];
                    fl.slabConfig = df.slabConfig || null;
                }
            });
        }
        this.updateFloorSwitcherUI();
    }
}
