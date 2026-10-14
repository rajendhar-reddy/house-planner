/**
 * app.js - Main Application Orchestrator & CAD State Controller
 */

import { units, UnitSystem } from './modules/units.js';
import { CanvasEngine } from './modules/canvas.js';
import { PlotManager } from './modules/plot.js';
import { WallManager, Wall } from './modules/walls.js';
import { OpeningManager } from './modules/openings.js';
import { RoomManager, ROOM_PRESETS } from './modules/rooms.js';
import { FurnitureManager, FURNITURE_CATALOG } from './modules/furniture.js';
import { DimensionManager } from './modules/dimensions.js';
import { RoadManager, ROAD_PRESETS } from './modules/roads.js';
import { StairManager, STAIR_PRESETS, Stair } from './modules/stairs.js';
import { ColumnManager, COLUMN_PRESETS } from './modules/columns.js';
import { Exporter } from './modules/exporter.js';
import { loadSamplePlan } from './modules/samples.js';
import { FloorManager } from './modules/floors.js';
import { ProjectInfoManager } from './modules/project_info.js';
import { SlabManager } from './modules/slab.js';
import { LayerManager } from './modules/layers.js';
import { SELECTABLE, applyTransform, deleteItems, allSelectable } from './modules/transform.js';
import { serializeProject, restoreProject } from './modules/serializer.js';
import { mixin } from './modules/util.js';
import { InputMethods } from './modules/ui/input.js';
import { OverlayMethods } from './modules/ui/overlays.js';
import { ToolOptionMethods } from './modules/ui/tool_options.js';
import { InspectorMethods } from './modules/ui/inspector.js';
import { SelectionPanelMethods } from './modules/ui/selection_panels.js';
import { CommandBarMethods } from './modules/ui/command_bar.js';
import { SchedulePanelMethods } from './modules/ui/schedule_panel.js';
import { UnderlayMethods } from './modules/ui/underlay_panel.js';
import { AnnotationManager } from './modules/annotations.js';
import { AnnotationPanelMethods } from './modules/ui/annotation_panel.js';
import { BlocksPanelMethods } from './modules/ui/blocks_panel.js';
import { DxfImportMethods } from './modules/ui/dxf_import_panel.js';
import { SheetPanelMethods } from './modules/ui/sheet_panel.js';
import { ToolsMenuMethods } from './modules/ui/tools_menu.js';
import { SnapPanelMethods } from './modules/ui/snap_panel.js';

window.Exporter = Exporter;

export class HousePlannerApp {
    constructor() {
        // Core Managers
        this.canvasElement = document.getElementById('cadCanvas');
        this.canvasEngine = new CanvasEngine(this.canvasElement);
        this.plotManager = new PlotManager();
        this.plotManager.app = this;
        this.slabManager = new SlabManager(this);
        this.plotManager.slabManager = this.slabManager;
        this.roadManager = new RoadManager();
        this.plotManager.roadSidesProvider = () => this.roadManager.roads;   // front setback = the road side
        this.wallManager = new WallManager();
        this.columnManager = new ColumnManager();
        this.openingManager = new OpeningManager();
        this.roomManager = new RoomManager();
        this.furnitureManager = new FurnitureManager();
        this.dimensionManager = new DimensionManager();
        this.annotationManager = new AnnotationManager();
        this.dimensionManager.styleSource = () => this.annotationManager.currentDimStyle;   // new dimensions get the current dimension style
        this.stairManager = new StairManager();
        this.floorManager = new FloorManager(this);
        this.projectInfo = new ProjectInfoManager();

        // Layers: one shared manager, attached to every manager that owns layered objects
        this.layerManager = new LayerManager();
        for (const m of [this.wallManager, this.openingManager, this.roomManager, this.columnManager,
                         this.furnitureManager, this.stairManager, this.dimensionManager, this.annotationManager]) {
            m.layers = this.layerManager;
        }

        // Active State
        this.activeTool = 'select'; // 'select' | 'plot_rect' | 'wall' | 'column' | 'door' | 'gate' | 'window' | 'room' | 'furniture' | 'dimension' | 'break_wall' | 'road' | 'stairs'
        this.selectedCategory = null; // 'plot' | 'wall' | 'column' | 'opening' | 'room' | 'furniture' | 'dimension' | 'road' | 'stair'
        this.selectedObject = null;
        this.selection = [];   // multi-selection: [{ category, obj }] (2 or more objects); a single pick uses selectedCategory/selectedObject
        this.marquee = null;   // live rubber-band rectangle while dragging a selection window
        this.underlay = null;  // background picture for tracing (see modules/underlay.js)
        this.blocks = {};      // user blocks of this project (see modules/blocks.js)
        this.refGeometry = null; // imported DXF reference lines { name, visible, segments:[[x1,y1,x2,y2]...] } - replaced, never edited in place
        this.underlayEditing = false;

        // Drafting & Dragging Interaction State
        this.draftStart = null;
        this.draftCurrent = null;
        this.hoveredWallInfo = null; // Live distance measurements to wall ends
        this.activeFurnitureType = 'bed_king';
        this.doorSubtype = 'single';
        this.windowSubtype = 'standard';
        this.gateSubtype = 'sliding';
        this.activeDoorWidth = 36;
        this.activeWindowWidth = 48;
        this.activeGateWidth = 120; // 10 ft
        this.activeColumnPresetIndex = 1; // 9" x 12"
        this.activeColumnRotation = 0;
        this.activeRoadWidth = 360; // 30 ft
        this.activeStairType = 'dogleg';
        this.activeStairFlightWidth = 36;
        this.activeStairTreads = 16;
        this.activeStairLandingSteps = 3; // 0: flat, 2: split, 3: 2-turn winders
        this.compoundWallThickness = 6; // 4.5", 6", 9" compound wall thickness
        this.activeLandscapeType = 'tree_deciduous';
        this.activeLandscapeCategory = 'All';

        // Dragging state for walls, corner vertices, and compass
        this.isDragging = false;
        this.dragTarget = null; // { type: 'wall' | 'vertex' | 'compass', ... }
        this.dragHasMoved = false;

        // History Stack (Undo/Redo)
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 30;

        // View settings
        this.theme = 'blueprint'; // 'blueprint' | 'clean'
        this.snapGuide = null;

        this.initUI();
        this.bindEvents();
        this.initCommandLine();
        this.canvasEngine.onBeforeViewChange = () => this.pushView();     // so ZOOM PREVIOUS can undo a wheel zoom
        this.initSnapControls();
        this.initToolsMenu();
        // Lines available for intersection / perpendicular / nearest snaps: visible wall centrelines + plot edges
        this.canvasEngine.segmentProvider = () => {
            const segs = [];
            for (const w of this.wallManager.walls) if (this.layerManager.isVisible(w, 'wall')) segs.push({ a: w.start, b: w.end });
            const v = this.plotManager.plot && this.plotManager.plot.vertices;
            if (v && v.length > 2) for (let i = 0; i < v.length; i++) segs.push({ a: v[i], b: v[(i + 1) % v.length] });
            for (const s of this.referenceSnapSegments()) segs.push(s);
            return segs;
        };

        // URL Parameter handling for deep-linking, testing, and clean export presentation
        const urlParams = new URLSearchParams(window.location.search);
        const sampleParam = urlParams.get('sample');

        if (sampleParam) {
            loadSamplePlan(this, sampleParam);
        } else {
            // Restore auto-saved session if present, else load default starter sample
            const restored = this.loadFromLocalStorage();
            if (!restored) {
                loadSamplePlan(this, '30x40_2bhk');
            }
        }

        this.saveHistory(); // initial state
        this.updateInspector();   // the overview must describe the plan that was just loaded
        this.startRenderLoop();
        const zoomParam = parseFloat(urlParams.get('zoom'));
        if (zoomParam && !isNaN(zoomParam)) {
            this.canvasEngine.scale = zoomParam;
            this.updateStatusBar(0, 0);
        }
        if (urlParams.get('selectCol')) {
            if (this.columnManager && this.columnManager.columns.length > 0) {
                const col = this.columnManager.columns[0];
                this.clearSelection();
                this.selectedCategory = 'column';
                this.selectedObject = col;
                this.columnManager.selectedColumnId = col.id;
                this.updateInspector();
                if (this.plotManager && this.plotManager.plot) {
                    this.canvasEngine.fitToBounds(this.plotManager.getBounds(), 60);
                }
                this.render();
            }
        }
        const selectRoomParam = urlParams.get('selectRoom');
        if (selectRoomParam && this.roomManager) {
            const rm = this.roomManager.rooms.find(r => r.name.toLowerCase().includes(selectRoomParam.toLowerCase())) || this.roomManager.rooms[0];
            if (rm) {
                this.clearSelection();
                this.selectedCategory = 'room';
                this.selectedObject = rm;
                this.roomManager.selectedRoomId = rm.id;
                this.updateInspector();
                this.render();
            }
        }
        if (urlParams.get('exportView') === 'clean') {
            const overlay = document.createElement('div');
            overlay.id = 'cleanExportViewModal';
            overlay.style.position = 'fixed';
            overlay.style.inset = '0';
            overlay.style.background = '#090d16';
            overlay.style.zIndex = '99999';
            overlay.style.display = 'flex';
            overlay.style.flexDirection = 'column';
            overlay.style.alignItems = 'center';
            overlay.style.padding = '24px';
            overlay.style.overflowY = 'auto';

            const badge = document.createElement('div');
            badge.style.padding = '8px 20px';
            badge.style.background = '#1e293b';
            badge.style.color = '#38bdf8';
            badge.style.borderRadius = '9999px';
            badge.style.fontWeight = '600';
            badge.style.fontSize = '14px';
            badge.style.marginBottom = '16px';
            badge.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
            badge.innerText = '🏛 Executive CAD Architectural Drawing Sheet (Ground + First Floor Side-by-Side & Title Block)';
            overlay.appendChild(badge);

            const c = document.createElement('canvas');
            c.style.maxWidth = '1350px';
            c.style.width = '100%';
            c.style.height = 'auto';
            c.style.borderRadius = '6px';
            c.style.boxShadow = '0 25px 50px -12px rgba(0,0,0,0.7)';
            c.style.background = '#ffffff';
            overlay.appendChild(c);
            document.body.appendChild(overlay);

            Exporter.renderToCanvas(c, this, {
                style: 'clean',
                title: this.projectInfo ? this.projectInfo.projectTitle : "PROPOSED RESIDENTIAL BUILDING (G+1)",
                client: this.projectInfo ? this.projectInfo.clientName : 'Nirman Engineers Blueprint Standard'
            });
        }

        window.app = this;
        if (urlParams.get('openPdfModal')) {
            setTimeout(() => {
                if (typeof this.openPdfModal === 'function') this.openPdfModal();
            }, 300);
        }
        if (urlParams.get('openTitleBlockModal')) {
            setTimeout(() => {
                if (typeof this.openProjectInfoModal === 'function') this.openProjectInfoModal();
            }, 300);
        }
        if (urlParams.get('floor')) {
            const fParam = urlParams.get('floor');
            if (fParam === 'side_by_side') {
                this.floorManager.setViewMode('side_by_side');
            } else {
                this.floorManager.setViewMode('active');
                this.floorManager.switchFloor(fParam);
            }
        }
    }

    // ==========================================
    // PERSISTENCE (autosave, undo history, load)
    // All of it goes through modules/serializer.js - there is exactly one
    // place that knows which fields make up a project.
    // ==========================================

    /** Ortho on/off (keeps the toolbar button and its label in step). */
    setOrtho(on) {
        this.canvasEngine.orthoMode = !!on;
        const b = document.getElementById('orthoBtn');
        if (b) { b.classList.toggle('active', !!on); const t = b.querySelector('.btn-text'); if (t) t.textContent = `Ortho: ${on ? 'ON' : 'OFF'}`; }
    }

    /** Grid snapping on/off. */
    setGridSnap(on) {
        this.canvasEngine.snapToGrid = !!on;
        const b = document.getElementById('snapGridBtn');
        if (b) { b.classList.toggle('active', !!on); const t = b.querySelector('.btn-text'); if (t) t.textContent = `Snap: ${on ? 'ON' : 'OFF'}`; }
    }

    setUnits(system) {
        units.setSystem(system);
        const btn = document.getElementById('unitToggleBtn');
        if (btn) btn.textContent = system === UnitSystem.IMPERIAL ? "Units: Imperial (Ft/In)" : "Units: Metric (m/mm)";
        this.updateInspector();
        this.requestRender();
    }

    /** The wall under a world point (hidden / locked layers excluded), for commands that ask "click a wall". */
    pickWall(point) {
        return this.wallManager.getWallAt(point.x, point.y, this.canvasEngine.scale);
    }

    /** Remember the current view so ZOOM PREVIOUS can come back to it (repeated calls within half a second count once). */
    pushView() {
        const now = Date.now();
        if (this._lastViewPush && now - this._lastViewPush < 500) return;
        this._lastViewPush = now;
        const ce = this.canvasEngine;
        this.viewHistory = this.viewHistory || [];
        this.viewHistory.push({ scale: ce.scale, offsetX: ce.offsetX, offsetY: ce.offsetY });
        if (this.viewHistory.length > 20) this.viewHistory.shift();
    }

    /** Go back to the previous view. Returns false when there is none. */
    zoomPrevious() {
        const v = this.viewHistory && this.viewHistory.pop();
        if (!v) return false;
        const ce = this.canvasEngine;
        ce.scale = v.scale; ce.offsetX = v.offsetX; ce.offsetY = v.offsetY;
        this._lastViewPush = 0;
        this.requestRender();
        return true;
    }

    zoomExtents() {
        this.pushView();
        const bounds = Exporter.getProjectBounds(this);
        if (bounds) this.canvasEngine.fitToBounds(bounds, 60);
        this.requestRender();
    }

    syncCornerStyleButton() {
        const btn = document.getElementById('cornerStyleBtn');
        if (!btn) return;
        const mitre = this.wallManager.cornerStyle !== 'round';
        btn.classList.toggle('active', mitre);
        const label = btn.querySelector('.btn-text');
        if (label) label.textContent = mitre ? 'Corners: Mitred' : 'Corners: Rounded';
    }

    /** True if the serialized project has anything worth saving. */
    stateHasContent(state) {
        if (!state) return false;
        if (state.plot || state.underlay || state.refGeometry) return true;
        const lists = ['walls', 'openings', 'rooms', 'columns', 'furniture', 'dimensions', 'roads', 'stairs', 'texts', 'leaders', 'angdims'];
        if (lists.some(k => Array.isArray(state[k]) && state[k].length > 0)) return true;
        const floors = state.floorManager && state.floorManager.floors;
        return !!(floors && floors.some(f => lists.some(k => Array.isArray(f[k]) && f[k].length > 0)));
    }

    setAutosavePill(text, color) {
        const pill = document.getElementById('autosaveStatus');
        if (pill) {
            pill.textContent = text;
            pill.style.color = color;
        }
    }

    /**
     * Write the current project to localStorage. Always serializes the LIVE state,
     * so nothing can be missed, and reports failures (e.g. quota exceeded) to the user.
     */
    saveToLocalStorage() {
        clearTimeout(this._autosaveTimer);
        this._autosaveTimer = null;
        try {
            const state = serializeProject(this);
            if (!this.stateHasContent(state)) {
                localStorage.removeItem('houseplanner_autosave');
                return;
            }
            localStorage.setItem('houseplanner_autosave', JSON.stringify(state));
            this.autosaveFailed = false;
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            this.setAutosavePill(`● Auto-saved (${time})`, '#22c55e');
        } catch (e) {
            console.warn('Auto-save error:', e);
            this.autosaveFailed = true;
            this.setAutosavePill('● Auto-save FAILED - use Save (JSON)', '#ef4444');
        }
    }

    /** Debounced autosave: a burst of edits produces a single write. */
    scheduleAutosave(delay = 500) {
        clearTimeout(this._autosaveTimer);
        this._autosaveTimer = setTimeout(() => this.saveToLocalStorage(), delay);
    }

    loadFromLocalStorage() {
        let raw = null;
        try {
            raw = localStorage.getItem('houseplanner_autosave');
            if (!raw) return false;
            const state = JSON.parse(raw);
            if (!this.stateHasContent(state)) return false;
            this.restoreState(state);
            this.setAutosavePill('● Auto-save Restored', '#38bdf8');
            setTimeout(() => {
                if (this.plotManager.plot) {
                    this.canvasEngine.fitToBounds(this.plotManager.getBounds(), 60);
                }
                this.requestRender();
            }, 60);
            return true;
        } catch (e) {
            console.warn('Failed to load auto-save:', e);
            // Keep the unreadable data so it can be recovered instead of silently overwritten.
            try { if (raw) localStorage.setItem('houseplanner_autosave_corrupt', raw); } catch (_) { /* ignore */ }
            this.setAutosavePill('● Auto-save unreadable (kept as backup)', '#f59e0b');
        }
        return false;
    }

    /**
     * Like saveHistory(), but repeated calls with the same `key` within `windowMs` update ONE
     * undo step instead of adding a new one each time. Use it for typing and slider drags, so a
     * burst of input is a single undo step and cannot flush the (limited) history.
     */
    saveHistoryCoalesced(key, windowMs = 800) {
        const now = performance.now();
        const last = this._coalesce;
        if (last && last.key === key && now - last.time < windowMs && this.undoStack.length > 1) {
            this.undoStack[this.undoStack.length - 1] = serializeProject(this);
            this.redoStack = [];
            last.time = now;
            this.updateUndoRedoButtons();
            this.scheduleAutosave();
            return;
        }
        this.saveHistory();
        this._coalesce = { key, time: now };
    }

    // Save state snapshot (undo history)
    saveHistory() {
        this._coalesce = null;
        this.undoStack.push(serializeProject(this));
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
        this.redoStack = []; // clear redo
        this.updateUndoRedoButtons();
        this.scheduleAutosave();
        this.requestRender();
    }

    undo() {
        this._coalesce = null;
        if (this.undoStack.length <= 1) return;
        const prev = this.undoStack[this.undoStack.length - 2];
        try {
            this.restoreState(prev);
        } catch (e) {
            console.error('Undo failed:', e);
            return;
        }
        this.redoStack.push(this.undoStack.pop());
        this.updateUndoRedoButtons();
        this.scheduleAutosave();
    }

    redo() {
        this._coalesce = null;
        if (this.redoStack.length === 0) return;
        const next = this.redoStack[this.redoStack.length - 1];
        try {
            this.restoreState(next);
        } catch (e) {
            console.error('Redo failed:', e);
            return;
        }
        this.undoStack.push(this.redoStack.pop());
        this.updateUndoRedoButtons();
        this.scheduleAutosave();
    }

    /**
     * Replace the whole project with a saved state. Validates it, repairs duplicate
     * IDs, and rolls back automatically (then throws) if the state is unusable.
     * @returns {string[]} non-fatal warnings
     */
    restoreState(state) {
        const warnings = restoreProject(this, state);
        this.syncCornerStyleButton();
        this.updateUndoRedoButtons();
        this.updateInspector();
        this.requestRender();
        return warnings;
    }

    clearAll() {
        this.clearSelection();
        this.plotManager.clear();
        this.roadManager.clear();
        this.stairManager.clear();
        this.wallManager.clear();
        this.columnManager.clear();
        this.openingManager.clear();
        this.roomManager.clear();
        this.furnitureManager.clear();
        this.dimensionManager.clear();
        this.annotationManager.clear();
        // The traced picture and imported reference lines are part of the drawing too (saved blocks are not: they are a library)
        this.underlay = null; this.underlayEditing = false; this.refGeometry = null;
        // Also reset multi-floor data and the slab projection, otherwise the previous
        // project's upper floors leak into whatever is loaded next.
        if (this.floorManager) this.floorManager.reset();
        if (this.slabManager) this.slabManager.enabled = false;
        this.plotManager.showSlabProjection = false;
    }

    clearSelection() {
        this.selection = [];
        this.marquee = null;
        this.selectedCategory = null;
        this.selectedObject = null;
        this.roadManager.selectedRoadId = null;
        this.stairManager.selectedStairId = null;
        this.wallManager.selectedWallId = null;
        this.columnManager.selectedColumnId = null;
        this.openingManager.selectedOpeningId = null;
        this.roomManager.selectedRoomId = null;
        this.furnitureManager.selectedItemId = null;
        this.dimensionManager.selectedDimId = null;
        this.annotationManager.selectedId = null;
        this.updateInspector();
    }

    // ==========================================
    // MULTI-SELECTION  (see modules/transform.js)
    // ==========================================

    /** The selected objects as [{category, obj}], whether one or many are selected. */
    getSelectionItems() {
        if (this.selection.length) return this.selection;
        if (this.selectedObject && SELECTABLE.includes(this.selectedCategory)) return [{ category: this.selectedCategory, obj: this.selectedObject }];
        return [];
    }

    /** Make exactly one object the (normal) selection. */
    selectSingle(category, obj) {
        const ids = { wall: ['wallManager', 'selectedWallId'], opening: ['openingManager', 'selectedOpeningId'], room: ['roomManager', 'selectedRoomId'],
            column: ['columnManager', 'selectedColumnId'], furniture: ['furnitureManager', 'selectedItemId'], stair: ['stairManager', 'selectedStairId'],
            dimension: ['dimensionManager', 'selectedDimId'], text: ['annotationManager', 'selectedId'], leader: ['annotationManager', 'selectedId'], angdim: ['annotationManager', 'selectedId'] }[category];
        this.selectedCategory = category;
        this.selectedObject = obj;
        if (ids) this[ids[0]][ids[1]] = obj.id;
    }

    /** Replace the selection with `items` (0 = none, 1 = normal single selection, 2+ = group). */
    setSelection(items) {
        this.clearSelection();
        if (items.length === 1) {
            this.selectSingle(items[0].category, items[0].obj);
        } else if (items.length > 1) {
            this.selection = items.slice();
            this.selectedCategory = 'multi';
        }
        this.updateInspector();
        this.requestRender();
    }

    selectAll() {
        this.setSelection(allSelectable(this));
    }

    /**
     * Move / Copy / Rotate / Mirror the selection.
     *  kind 'move'   : { dx, dy, copy }
     *  kind 'rotate' : { degrees, pivot?, copy }       (pivot defaults to the centre of the selection)
     *  kind 'mirror' : { p1, p2, copy }                (mirror line through p1 and p2; copy = keep the original)
     * Returns the resulting selection, or null when nothing was selected.
     */
    runTransform(kind, p = {}) {
        const items = this.getSelectionItems();
        if (!items.length) return null;
        const targets = applyTransform(this, items, kind, p);
        // doors/windows are carried by their walls, so they are not part of the visible selection unless copied with it
        this.setSelection(targets.filter(t => t.category !== 'opening' || p.copy));
        this.saveHistory();
        return targets;
    }

    setTool(tool) {
        this.activeTool = tool;
        this.draftStart = null;
        this.draftCurrent = null;
        this.clearSelection();

        // Update active class on toolbar buttons
        document.querySelectorAll('.tool-btn').forEach(btn => {
            if (btn.dataset.tool === tool) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update cursor style
        if (tool === 'select' || tool === 'slab') {
            this.canvasElement.style.cursor = 'default';
        } else if (tool === 'pan') {
            this.canvasElement.style.cursor = 'grab';
        } else {
            this.canvasElement.style.cursor = 'crosshair';
        }

        if (tool === 'slab') {
            if (this.slabManager) {
                this.slabManager.enabled = true;
                this.plotManager.showSlabProjection = true;
                this.selectedCategory = 'slab';
                this.selectedObject = this.slabManager;
                this.updateInspector();
            }
        }

        // Show/hide secondary options bar for tool (e.g. furniture picker or wall thickness)
        this.updateToolSubOptions();
    }

    deleteSelected() {
        if (this.selection.length > 1) {
            deleteItems(this, this.selection);
            this.clearSelection();
            this.saveHistory();
            return;
        }
        if (!this.selectedObject) return;

        if (this.selectedCategory === 'wall') {
            // Also remove openings attached to this wall
            const wallId = this.selectedObject.id;
            this.openingManager.openings = this.openingManager.openings.filter(o => o.wallId !== wallId);
            this.wallManager.removeWall(wallId);
        } else if (this.selectedCategory === 'column') {
            this.columnManager.removeColumn(this.selectedObject.id);
        } else if (this.selectedCategory === 'opening') {
            this.openingManager.removeOpening(this.selectedObject.id);
        } else if (this.selectedCategory === 'room') {
            this.roomManager.removeRoom(this.selectedObject.id);
        } else if (this.selectedCategory === 'furniture') {
            this.furnitureManager.removeItem(this.selectedObject.id);
        } else if (this.selectedCategory === 'dimension') {
            this.dimensionManager.removeDimension(this.selectedObject.id);
        } else if (this.selectedCategory === 'text') {
            this.annotationManager.removeText(this.selectedObject.id);
        } else if (this.selectedCategory === 'leader') {
            this.annotationManager.removeLeader(this.selectedObject.id);
        } else if (this.selectedCategory === 'angdim') {
            this.annotationManager.removeAngdim(this.selectedObject.id);
        } else if (this.selectedCategory === 'road') {
            this.roadManager.removeRoad(this.selectedObject.id);
        } else if (this.selectedCategory === 'stair') {
            this.stairManager.removeStair(this.selectedObject.id);
        } else if (this.selectedCategory === 'slab') {
            if (this.slabManager) this.slabManager.enabled = false;
            this.plotManager.showSlabProjection = false;
        } else if (this.selectedCategory === 'plot') {
            this.plotManager.clear();
        }

        this.clearSelection();
        this.saveHistory();
    }

    /**
     * Build snap targets list across all geometry
     */
    getAllSnapTargets() {
        let targets = [];
        targets = targets.concat(this.plotManager.getSnapTargets());
        targets = targets.concat(this.wallManager.getSnapTargets());
        return targets;
    }

    requestRender() {
        this._needsRender = true;
    }

    startRenderLoop() {
        // Redraw only when something may have changed, instead of 60 full redraws a
        // second forever. Input events mark the frame dirty; a slow heartbeat is a safety
        // net for anything that changes state without going through an event.
        this._needsRender = true;
        let lastDraw = 0;
        const HEARTBEAT_MS = 500;

        const markDirty = () => { this._needsRender = true; };
        const canvas = this.canvasElement;
        const opts = { capture: true, passive: true };
        ['mousedown', 'mouseup', 'keydown', 'keyup', 'wheel', 'touchstart', 'touchmove', 'touchend',
         'touchcancel', 'input', 'change', 'click', 'dblclick', 'contextmenu', 'resize', 'focus']
            .forEach(type => window.addEventListener(type, markDirty, opts));
        window.addEventListener('mousemove', (e) => {
            if (e.target === canvas || this.isDragging || this.canvasEngine.isPanning) this._needsRender = true;
        }, opts);

        const loop = (now) => {
            if (this._needsRender || now - lastDraw > HEARTBEAT_MS) {
                this._needsRender = false;
                lastDraw = now;
                try {
                    this.render();
                } catch (err) {
                    console.error('Render error:', err);
                }
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    render() {
        this.canvasEngine.beginFrame();
        const ctx = this.canvasEngine.ctx;
        const scale = this.canvasEngine.scale;

        // 1. CAD Background Grid
        this.canvasEngine.drawGrid(this.theme);
        this.renderUnderlay(ctx, scale);
        this.renderReference(ctx, scale);

        // 1b. Roads & Streets (Ground level)
        this.roadManager.render(ctx, scale, this.plotManager.getBounds(), false, this.theme);

        // 2. Plot Boundary, 2-Tier Setback Dimensions & Surveyor Markers (Ground level)
        this.plotManager.render(ctx, scale, this.selectedCategory === 'plot', this.wallManager, this.theme);

        const isSideBySide = this.floorManager && this.floorManager.viewMode === 'side_by_side';
        const activeOff = (isSideBySide && this.floorManager)
            ? this.floorManager.getFloorOffset(this.floorManager.activeFloorId)
            : { x: 0, y: 0 };

        // Render multi-floor system (other floors, ghost underlays, and floor title banners)
        if (this.floorManager) {
            this.floorManager.render(ctx, scale, false, this.theme);
        }

        // Active CAD Layers (translated to floor offset in side-by-side mode)
        ctx.save();
        if (activeOff.x !== 0 || activeOff.y !== 0) {
            ctx.translate(activeOff.x, activeOff.y);
        }

        // 3. Room Floor Tiles & Labels
        this.roomManager.render(ctx, scale);

        // 3b. Stairs & Staircases
        this.stairManager.render(ctx, scale);

        // 4. Walls
        this.wallManager.render(ctx, scale, this.openingManager);

        // 4b. RCC Structural Columns (render on top of walls at corners/intersections)
        this.columnManager.render(ctx, scale, false, this.theme);

        // 4c. Dynamic Wall Hover Distance Measurements
        if (this.hoveredWallInfo && !this.draftStart) {
            this.wallManager.renderHoverDistances(ctx, this.hoveredWallInfo, scale);
            this.renderHoverHUD(ctx, this.hoveredWallInfo, scale);
        }

        // 5. Doors & Windows
        this.openingManager.render(ctx, scale, this.wallManager, this.theme);

        // 6. Fixtures & Furniture
        this.furnitureManager.render(ctx, scale);

        // 7. Dimensions
        this.dimensionManager.render(ctx, scale);

        // 7b. Annotation: text notes, leaders, angular dimensions
        this.annotationManager.render(ctx, scale, false, this.theme);

        // 8. Live Drafting Overlays (Preview while drawing)
        this.renderDraftingPreviews(ctx, scale);
        this.renderSelectionOverlays(ctx, scale);

        ctx.restore();

        this.canvasEngine.endFrame();
    }

    // ==========================================
    // UI BINDINGS & CONTROLS
    // ==========================================
    initUI() {
        // Toolbar buttons
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setTool(btn.dataset.tool);
            });
        });

        // Units toggle
        const unitToggleBtn = document.getElementById('unitToggleBtn');
        if (unitToggleBtn) {
            unitToggleBtn.addEventListener('click', () => {
                const newSys = units.getSystem() === UnitSystem.IMPERIAL ? UnitSystem.METRIC : UnitSystem.IMPERIAL;
                units.setSystem(newSys);
                unitToggleBtn.textContent = newSys === UnitSystem.IMPERIAL ? "Units: Imperial (Ft/In)" : "Units: Metric (m/mm)";
                this.updateInspector();
            });
        }

        // Snap Grid toggle
        document.getElementById('snapGridBtn')?.addEventListener('click', () => this.setGridSnap(!this.canvasEngine.snapToGrid));

        // Ortho toggle
        document.getElementById('orthoBtn')?.addEventListener('click', () => this.setOrtho(!this.canvasEngine.orthoMode));

        document.getElementById('layersBtn')?.addEventListener('click', () => this.openLayersPanel());
        document.getElementById('schedulesBtn')?.addEventListener('click', () => this.openSchedulePanel());
        document.getElementById('underlayBtn')?.addEventListener('click', () => this.openUnderlayPanel());

        // Wall corner style (mitred / rounded) - saved with the project, so it is also part of undo history
        document.getElementById('cornerStyleBtn')?.addEventListener('click', () => {
            this.wallManager.cornerStyle = this.wallManager.cornerStyle === 'round' ? 'mitre' : 'round';
            this.syncCornerStyleButton();
            this.saveHistory();
        });
        this.syncCornerStyleButton();

        // Undo / Redo buttons
        document.getElementById('undoBtn')?.addEventListener('click', () => this.undo());
        document.getElementById('redoBtn')?.addEventListener('click', () => this.redo());
        document.getElementById('deleteBtn')?.addEventListener('click', () => this.deleteSelected());

        // Zoom controls
        document.getElementById('zoomInBtn')?.addEventListener('click', () => {
            this.pushView();
            this.canvasEngine.scale = Math.min(this.canvasEngine.scale * 1.25, 30.0);
        });
        document.getElementById('zoomOutBtn')?.addEventListener('click', () => {
            this.pushView();
            this.canvasEngine.scale = Math.max(this.canvasEngine.scale * 0.8, 0.1);
        });
        document.getElementById('zoomFitBtn')?.addEventListener('click', () => this.zoomExtents());

        // Sample Plans Dropdown
        document.getElementById('samplePlansSelect')?.addEventListener('change', (e) => {
            if (e.target.value) {
                loadSamplePlan(this, e.target.value);
                this.saveHistory();
                this.updateInspector();
                e.target.value = '';
            }
        });

        // Clear All
        document.getElementById('clearAllBtn')?.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear your entire drawing? This will also clear your auto-saved session.')) {
                this.clearAll();
                localStorage.removeItem('houseplanner_autosave');
                this.saveHistory();
                const pill = document.getElementById('autosaveStatus');
                if (pill) {
                    pill.innerHTML = `● Canvas Cleared`;
                    pill.style.color = '#ef4444';
                }
            }
        });

        // Export Handlers
        document.getElementById('exportPngBtn')?.addEventListener('click', () => {
            Exporter.exportPNG(this.canvasElement, this, { style: this.theme, title: 'RESIDENTIAL FLOOR PLAN' });
        });

        // Architectural PDF Export Modal & Action Wiring
        const pdfModal = document.getElementById('exportPdfModal');
        const openPdfModal = () => {
            if (pdfModal) {
                const titleInput = document.getElementById('pdfTitleInput');
                if (titleInput && this.projectInfo) {
                    titleInput.value = this.projectInfo.projectTitle || 'RESIDENTIAL BUILDING PLAN';
                }
                const clientInput = document.getElementById('pdfClientInput');
                if (clientInput && this.projectInfo) {
                    clientInput.value = this.projectInfo.clientName || 'Custom Architectural Plan';
                }
                pdfModal.style.display = 'flex';
            }
        };
        const closePdfModal = () => {
            if (pdfModal) pdfModal.style.display = 'none';
        };

        this.openPdfModal = openPdfModal;
        this.closePdfModal = closePdfModal;

        document.getElementById('exportPdfBtn')?.addEventListener('click', openPdfModal);
        document.getElementById('closeExportPdfModal')?.addEventListener('click', closePdfModal);
        document.getElementById('cancelExportPdfBtn')?.addEventListener('click', closePdfModal);

        pdfModal?.addEventListener('click', (e) => {
            if (e.target === pdfModal) closePdfModal();
        });

        document.getElementById('confirmExportPdfBtn')?.addEventListener('click', async () => {
            const paperSize = document.getElementById('pdfPaperSizeSelect')?.value || 'a4';
            const style = document.getElementById('pdfStyleSelect')?.value || 'clean';
            const title = document.getElementById('pdfTitleInput')?.value || 'RESIDENTIAL BUILDING PLAN';
            const client = document.getElementById('pdfClientInput')?.value || 'Custom Architectural Plan';

            const btn = document.getElementById('confirmExportPdfBtn');
            const origText = btn ? btn.innerText : '';
            if (btn) {
                btn.innerText = '⏳ Generating PDF...';
                btn.disabled = true;
            }

            try {
                await Exporter.exportPDF(this, {
                    paperSize,
                    style,
                    title,
                    client,
                    orientation: 'landscape'
                });
                closePdfModal();
                const pill = document.getElementById('autosaveStatus');
                if (pill) {
                    pill.innerHTML = `● PDF Exported (${paperSize.toUpperCase()})`;
                    pill.style.color = '#38bdf8';
                }
            } catch (err) {
                console.error(err);
                alert('PDF generation failed: ' + err.message);
            } finally {
                if (btn) {
                    btn.innerText = origText;
                    btn.disabled = false;
                }
            }
        });

        document.getElementById('printPdfPreviewBtn')?.addEventListener('click', () => {
            const style = document.getElementById('pdfStyleSelect')?.value || 'clean';
            const title = document.getElementById('pdfTitleInput')?.value || 'RESIDENTIAL BUILDING PLAN';
            const client = document.getElementById('pdfClientInput')?.value || 'Custom Architectural Plan';

            const printCanvas = document.createElement('canvas');
            Exporter.renderToCanvas(printCanvas, this, {
                style,
                title,
                client,
                width: 3200
            });

            const printWin = window.open('', '_blank');
            if (printWin) {
                printWin.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>${title} - HousePlanner CAD</title>
                        <style>
                            @page { size: landscape; margin: 8mm; }
                            body { margin: 0; padding: 0; background: #fff; display: flex; justify-content: center; align-items: center; }
                            img { max-width: 100%; height: auto; display: block; box-shadow: 0 0 10px rgba(0,0,0,0.15); }
                            @media print {
                                body { margin: 0; padding: 0; }
                                img { width: 100% !important; box-shadow: none !important; }
                            }
                        </style>
                    </head>
                    <body>
                        <img src="${printCanvas.toDataURL('image/jpeg', 0.96)}" onload="window.print();" />
                    </body>
                    </html>
                `);
                printWin.document.close();
            }
        });

        document.getElementById('exportSvgBtn')?.addEventListener('click', () => {
            Exporter.exportSVG(this, 'house_plan.svg');
        });
        document.getElementById('exportDxfBtn')?.addEventListener('click', () => {
            Exporter.exportDXF(this, 'house_plan.dxf');
        });
        document.getElementById('saveJsonBtn')?.addEventListener('click', () => {
            Exporter.exportJSON(serializeProject(this), 'house_plan.json');
            const pill = document.getElementById('autosaveStatus');
            if (pill) {
                pill.innerHTML = `● Saved to File`;
                pill.style.color = '#22c55e';
            }
        });

        // Load JSON file input
        const fileInput = document.getElementById('loadJsonInput');
        document.getElementById('loadJsonBtn')?.addEventListener('click', () => fileInput.click());
        fileInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                let loaded;
                try {
                    loaded = JSON.parse(evt.target.result);
                } catch (err) {
                    alert('This file is not valid JSON, so it cannot be opened as a project.');
                    return;
                }
                try {
                    const warnings = this.restoreState(loaded);
                    this.saveHistory();
                    if (this.plotManager.plot) {
                        this.canvasEngine.fitToBounds(this.plotManager.getBounds(), 60);
                    }
                    if (warnings.length) {
                        alert('Project opened, but some problems were repaired:\n\n- ' +
                            warnings.slice(0, 8).join('\n- ') +
                            (warnings.length > 8 ? `\n...and ${warnings.length - 8} more` : ''));
                    }
                } catch (err) {
                    // restoreProject already rolled back, so the current drawing is untouched.
                    alert('Could not open this project: ' + err.message + '\nYour current drawing was left unchanged.');
                }
            };
            reader.readAsText(file);
            fileInput.value = '';
        });

        // Floor Switcher Tab buttons
        document.querySelectorAll('.floor-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const floorMode = btn.dataset.floor;
                if (floorMode === 'side_by_side') {
                    this.floorManager.setViewMode('side_by_side');
                } else {
                    this.floorManager.setViewMode('active');
                    this.floorManager.switchFloor(floorMode);
                    if (this.plotManager.plot) {
                        this.canvasEngine.fitToBounds(this.plotManager.getBounds(), 60);
                    }
                }
            });
        });

        // Copy Structure to First Floor button
        document.getElementById('copyStructureBtn')?.addEventListener('click', () => {
            this.floorManager.copyStructureToFloor('ground', 'first');
        });

        // Ghost Underlay toggle button
        const ghostBtn = document.getElementById('ghostToggleBtn');
        if (ghostBtn) {
            ghostBtn.addEventListener('click', () => {
                this.floorManager.showGhost = !this.floorManager.showGhost;
                ghostBtn.classList.toggle('active', this.floorManager.showGhost);
                ghostBtn.textContent = this.floorManager.showGhost ? "👻 Ghost Underlay: ON" : "👻 Ghost Underlay: OFF";
                this.render();
            });
        }

        // Title Block Modal buttons
        document.getElementById('openProjectInfoModalBtn')?.addEventListener('click', () => {
            this.openProjectInfoModal();
        });
        document.getElementById('closeProjectInfoModal')?.addEventListener('click', () => {
            this.closeProjectInfoModal();
        });
        document.getElementById('cancelProjectInfoBtn')?.addEventListener('click', () => {
            this.closeProjectInfoModal();
        });
        document.getElementById('saveProjectInfoBtn')?.addEventListener('click', () => {
            this.saveProjectInfoFromModal();
        });

        // Responsive Mobile / Tablet Inspector Drawer Toggle
        document.getElementById('toggleInspectorBtn')?.addEventListener('click', () => {
            this.toggleInspector();
        });
        document.getElementById('floatPropsBtn')?.addEventListener('click', () => {
            this.toggleInspector();
        });
        document.getElementById('closeInspectorBtn')?.addEventListener('click', () => {
            this.toggleInspector(false);
        });
        document.getElementById('inspectorBackdrop')?.addEventListener('click', () => {
            this.toggleInspector(false);
        });

        // Floating Canvas Zoom & Fit Buttons for touchscreens
        document.getElementById('floatZoomInBtn')?.addEventListener('click', () => {
            this.canvasEngine.scale = Math.min(this.canvasEngine.scale * 1.25, 30.0);
            this.render();
        });
        document.getElementById('floatZoomOutBtn')?.addEventListener('click', () => {
            this.canvasEngine.scale = Math.max(this.canvasEngine.scale * 0.8, 0.1);
            this.render();
        });
        document.getElementById('floatZoomFitBtn')?.addEventListener('click', () => {
            const bounds = Exporter.getProjectBounds(this);
            if (bounds) this.canvasEngine.fitToBounds(bounds, 60);
            this.render();
        });
    }

    toggleInspector(forceState = null) {
        const sidebar = document.getElementById('rightSidebar');
        const backdrop = document.getElementById('inspectorBackdrop');
        const toggleBtn = document.getElementById('toggleInspectorBtn');
        const floatPropsBtn = document.getElementById('floatPropsBtn');
        if (!sidebar) return;

        const isOpen = forceState !== null ? forceState : !sidebar.classList.contains('open');
        sidebar.classList.toggle('open', isOpen);
        if (backdrop) backdrop.classList.toggle('active', isOpen);
        if (toggleBtn) toggleBtn.classList.toggle('active', isOpen);
        if (floatPropsBtn) floatPropsBtn.classList.toggle('active', isOpen);
    }

    openProjectInfoModal() {
        if (!this.projectInfo) return;
        const modal = document.getElementById('projectInfoModal');
        if (!modal) return;
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        };
        setVal('tbProjectTitle', this.projectInfo.projectTitle);
        setVal('tbDrawingTitle', this.projectInfo.drawingTitle);
        setVal('tbClientName', this.projectInfo.clientName);
        setVal('tbSiteDetails', this.projectInfo.siteDetails);
        setVal('tbArchitectFirm', this.projectInfo.architectFirm);
        setVal('tbEngineerRegNo', this.projectInfo.engineerRegNo);
        setVal('tbDrawingNumber', this.projectInfo.drawingNumber);
        setVal('tbScaleText', this.projectInfo.scaleText);
        modal.style.display = 'flex';
    }

    closeProjectInfoModal() {
        const modal = document.getElementById('projectInfoModal');
        if (modal) modal.style.display = 'none';
    }

    saveProjectInfoFromModal() {
        if (!this.projectInfo) return;
        const getVal = (id, fallback) => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : fallback;
        };
        this.projectInfo.projectTitle = getVal('tbProjectTitle', this.projectInfo.projectTitle);
        this.projectInfo.drawingTitle = getVal('tbDrawingTitle', this.projectInfo.drawingTitle);
        this.projectInfo.clientName = getVal('tbClientName', this.projectInfo.clientName);
        this.projectInfo.siteDetails = getVal('tbSiteDetails', this.projectInfo.siteDetails);
        this.projectInfo.architectFirm = getVal('tbArchitectFirm', this.projectInfo.architectFirm);
        this.projectInfo.engineerRegNo = getVal('tbEngineerRegNo', this.projectInfo.engineerRegNo);
        this.projectInfo.drawingNumber = getVal('tbDrawingNumber', this.projectInfo.drawingNumber);
        this.projectInfo.scaleText = getVal('tbScaleText', this.projectInfo.scaleText);

        this.closeProjectInfoModal();
        this.saveHistory();
        this.render();

        const pill = document.getElementById('autosaveStatus');
        if (pill) {
            pill.innerHTML = `● Updated Project Title Block`;
            pill.style.color = '#38bdf8';
        }
    }

    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        if (undoBtn) undoBtn.disabled = this.undoStack.length <= 1;
        if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
    }

    updateCoordinatesBar(worldX, worldY) {
        const coordSpan = document.getElementById('coordReadout');
        if (coordSpan) {
            if (this.hoveredWallInfo) {
                const h = this.hoveredWallInfo;
                coordSpan.innerHTML = `X: ${units.formatLength(worldX)} | Y: ${units.formatLength(worldY)} &nbsp;&nbsp;|&nbsp;&nbsp; <span style="color:var(--accent-blue); font-weight:600;">📏 Wall Hover: [ ⇦ ${units.formatLength(h.dStart)} &nbsp;|&nbsp; ${units.formatLength(h.dEnd)} ⇨ &nbsp;|&nbsp; Total: ${units.formatLength(h.total)} ]</span>`;
            } else {
                coordSpan.textContent = `X: ${units.formatLength(worldX)}  |  Y: ${units.formatLength(worldY)}`;
            }
        }
        const scaleSpan = document.getElementById('scaleReadout');
        if (scaleSpan) {
            const ftPer100px = (100 / this.canvasEngine.scale) / 12;
            scaleSpan.textContent = `Zoom: ${Math.round(this.canvasEngine.scale * 100)}% (100px ≈ ${ftPer100px.toFixed(1)} ft)`;
        }
    }

}

// Attach the UI method groups that live in modules/ui/ (must happen before the app is created)
mixin(HousePlannerApp, InputMethods, OverlayMethods, ToolOptionMethods, InspectorMethods, SelectionPanelMethods, CommandBarMethods, SchedulePanelMethods, UnderlayMethods, SnapPanelMethods, AnnotationPanelMethods, BlocksPanelMethods, DxfImportMethods, SheetPanelMethods, ToolsMenuMethods);

// Bootstrap application on DOM load or immediately if already loaded
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
        window.app = new HousePlannerApp();
    });
} else {
    window.app = new HousePlannerApp();
}
