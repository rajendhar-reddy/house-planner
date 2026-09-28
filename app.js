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

window.Exporter = Exporter;

export class HousePlannerApp {
    constructor() {
        // Core Managers
        this.canvasElement = document.getElementById('cadCanvas');
        this.canvasEngine = new CanvasEngine(this.canvasElement);
        this.plotManager = new PlotManager();
        this.roadManager = new RoadManager();
        this.wallManager = new WallManager();
        this.columnManager = new ColumnManager();
        this.openingManager = new OpeningManager();
        this.roomManager = new RoomManager();
        this.furnitureManager = new FurnitureManager();
        this.dimensionManager = new DimensionManager();
        this.stairManager = new StairManager();
        this.floorManager = new FloorManager(this);
        this.projectInfo = new ProjectInfoManager();

        // Active State
        this.activeTool = 'select'; // 'select' | 'plot_rect' | 'wall' | 'column' | 'door' | 'gate' | 'window' | 'room' | 'furniture' | 'dimension' | 'break_wall' | 'road' | 'stairs'
        this.selectedCategory = null; // 'plot' | 'wall' | 'column' | 'opening' | 'room' | 'furniture' | 'dimension' | 'road' | 'stair'
        this.selectedObject = null;

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

    saveToLocalStorage(state = null) {
        try {
            const dataToSave = state || {
                plot: this.plotManager.plot ? JSON.parse(JSON.stringify(this.plotManager.plot)) : null,
                northAngle: this.plotManager.northAngle,
                showLandscapeWash: this.plotManager.showLandscapeWash,
                walls: this.wallManager.walls.map(w => ({
                    id: w.id, start: { ...w.start }, end: { ...w.end },
                    thickness: w.thickness, type: w.type
                })),
                openings: this.openingManager.openings.map(o => ({
                    id: o.id, wallId: o.wallId, t: o.t, type: o.type,
                    subtype: o.subtype, width: o.width, flipHinge: o.flipHinge,
                    flipSwing: o.flipSwing, label: o.label,
                    showLabel: o.showLabel, showMeasurement: o.showMeasurement
                })),
                rooms: this.roomManager.rooms.map(r => ({
                    id: r.id, x: r.x, y: r.y, name: r.name,
                    width: r.width, height: r.height, color: r.color,
                    labelScale: r.labelScale, showDimensions: r.showDimensions, showArea: r.showArea,
                    rotation: r.rotation || 0, tagStyle: r.tagStyle || 'clean',
                    isDoubleHeight: !!r.isDoubleHeight, ceilingHeight: r.ceilingHeight || 240,
                    isVoid: !!r.isVoid, voidType: r.voidType || 'open_to_below'
                })),
                columns: this.columnManager.columns.map(c => ({
                    id: c.id, x: c.x, y: c.y, width: c.width, depth: c.depth,
                    rotation: c.rotation || 0, name: c.name, showLabel: c.showLabel || false
                })),
                furniture: this.furnitureManager.items.map(f => ({
                    id: f.id, typeId: f.typeId, x: f.x, y: f.y,
                    width: f.width, height: f.height, rotation: f.rotation
                })),
                dimensions: this.dimensionManager.dimensions.map(d => ({
                    id: d.id, start: { ...d.start }, end: { ...d.end },
                    offset: d.offset, customText: d.customText
                })),
                roads: this.roadManager.roads.map(r => ({
                    id: r.id, side: r.side, width: r.width, name: r.name, hasSidewalk: r.hasSidewalk
                })),
                stairs: this.stairManager.stairs.map(s => ({
                    id: s.id, x: s.x, y: s.y, type: s.type, flightWidth: s.flightWidth,
                    treads: s.treads, treadDepth: s.treadDepth, landingDepth: s.landingDepth,
                    wellWidth: s.wellWidth, rotation: s.rotation, turnDirection: s.turnDirection,
                    showBreakLine: s.showBreakLine, landingSteps: s.landingSteps, middleTreads: s.middleTreads
                })),
                floorManager: this.floorManager ? this.floorManager.serialize() : null,
                projectInfo: this.projectInfo ? this.projectInfo.serialize() : null
            };

            if (dataToSave.walls.length > 0 || dataToSave.plot) {
                localStorage.setItem('houseplanner_autosave', JSON.stringify(dataToSave));
                const pill = document.getElementById('autosaveStatus');
                if (pill) {
                    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    pill.innerHTML = `● Auto-saved (${time})`;
                    pill.style.color = '#22c55e';
                }
            }
        } catch (e) {
            console.warn('Auto-save error:', e);
        }
    }

    loadFromLocalStorage() {
        try {
            const raw = localStorage.getItem('houseplanner_autosave');
            if (!raw) return false;
            const state = JSON.parse(raw);
            if (state && ((state.walls && state.walls.length > 0) || state.plot)) {
                this.restoreState(state);
                const pill = document.getElementById('autosaveStatus');
                if (pill) {
                    pill.innerHTML = `● Auto-save Restored`;
                    pill.style.color = '#38bdf8';
                }
                setTimeout(() => {
                    if (this.plotManager.plot) {
                        this.canvasEngine.fitToBounds(this.plotManager.getBounds(), 60);
                    }
                }, 60);
                return true;
            }
        } catch (e) {
            console.warn('Failed to load auto-save:', e);
        }
        return false;
    }

    // Save state snapshot
    saveHistory() {
        const state = {
            plot: JSON.parse(JSON.stringify(this.plotManager.plot)),
            northAngle: this.plotManager.northAngle,
            showChainedDimensions: this.plotManager.showChainedDimensions !== undefined ? this.plotManager.showChainedDimensions : true,
            showCornerMarkers: this.plotManager.showCornerMarkers !== undefined ? this.plotManager.showCornerMarkers : true,
            showSetbackShading: this.plotManager.showSetbackShading !== undefined ? this.plotManager.showSetbackShading : true,
            showSlabProjection: this.plotManager.showSlabProjection !== undefined ? this.plotManager.showSlabProjection : false,
            slabProjectionOffset: this.plotManager.slabProjectionOffset !== undefined ? this.plotManager.slabProjectionOffset : 18,
            showLandscapeWash: !!this.plotManager.showLandscapeWash,
            walls: this.wallManager.walls.map(w => ({
                id: w.id, start: { ...w.start }, end: { ...w.end },
                thickness: w.thickness, type: w.type
            })),
            openings: this.openingManager.openings.map(o => ({
                id: o.id, wallId: o.wallId, t: o.t, type: o.type,
                subtype: o.subtype, width: o.width, flipHinge: o.flipHinge,
                flipSwing: o.flipSwing, label: o.label,
                showLabel: o.showLabel, showMeasurement: o.showMeasurement
            })),
            rooms: this.roomManager.rooms.map(r => ({
                id: r.id, x: r.x, y: r.y, name: r.name,
                width: r.width, height: r.height, color: r.color,
                labelScale: r.labelScale, showDimensions: r.showDimensions, showArea: r.showArea,
                rotation: r.rotation || 0, tagStyle: r.tagStyle || 'clean',
                isDoubleHeight: !!r.isDoubleHeight, ceilingHeight: r.ceilingHeight || 240,
                isVoid: !!r.isVoid, voidType: r.voidType || 'open_to_below',
                dottedSlabLine: !!r.dottedSlabLine, slabOffset: r.slabOffset !== undefined ? r.slabOffset : 0,
                slabLinePattern: r.slabLinePattern || 'dashed', slabLabel: r.slabLabel || '',
                dottedCutoutPerimeter: !!r.dottedCutoutPerimeter
            })),
            columns: this.columnManager.columns.map(c => ({
                id: c.id, x: c.x, y: c.y, width: c.width, depth: c.depth,
                rotation: c.rotation || 0, name: c.name, showLabel: c.showLabel || false
            })),
            furniture: this.furnitureManager.items.map(f => ({
                id: f.id, typeId: f.typeId, x: f.x, y: f.y,
                width: f.width, height: f.height, rotation: f.rotation
            })),
            dimensions: this.dimensionManager.dimensions.map(d => ({
                id: d.id, start: { ...d.start }, end: { ...d.end },
                offset: d.offset, customText: d.customText
            })),
            roads: this.roadManager.roads.map(r => ({
                id: r.id, side: r.side, width: r.width, name: r.name, hasSidewalk: r.hasSidewalk
            })),
            stairs: this.stairManager.stairs.map(s => ({
                id: s.id, x: s.x, y: s.y, type: s.type, flightWidth: s.flightWidth,
                treads: s.treads, treadDepth: s.treadDepth, landingDepth: s.landingDepth,
                wellWidth: s.wellWidth, rotation: s.rotation, turnDirection: s.turnDirection,
                showBreakLine: s.showBreakLine, landingSteps: s.landingSteps, middleTreads: s.middleTreads
            })),
            floorManager: this.floorManager ? this.floorManager.serialize() : null,
            projectInfo: this.projectInfo ? this.projectInfo.serialize() : null
        };

        this.undoStack.push(state);
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
        this.redoStack = []; // clear redo
        this.updateUndoRedoButtons();
        this.saveToLocalStorage(state);
    }

    undo() {
        if (this.undoStack.length <= 1) return;
        const current = this.undoStack.pop();
        this.redoStack.push(current);
        const prev = this.undoStack[this.undoStack.length - 1];
        this.restoreState(prev);
    }

    redo() {
        if (this.redoStack.length === 0) return;
        const next = this.redoStack.pop();
        this.undoStack.push(next);
        this.restoreState(next);
    }

    restoreState(state) {
        this.clearSelection();
        this.plotManager.plot = state.plot ? JSON.parse(JSON.stringify(state.plot)) : null;
        this.plotManager.northAngle = state.northAngle || 0;
        if (state.showChainedDimensions !== undefined) this.plotManager.showChainedDimensions = state.showChainedDimensions;
        if (state.showCornerMarkers !== undefined) this.plotManager.showCornerMarkers = state.showCornerMarkers;
        if (state.showSetbackShading !== undefined) this.plotManager.showSetbackShading = state.showSetbackShading;
        if (state.showSlabProjection !== undefined) this.plotManager.showSlabProjection = state.showSlabProjection;
        if (state.slabProjectionOffset !== undefined) this.plotManager.slabProjectionOffset = state.slabProjectionOffset;
        if (state.showLandscapeWash !== undefined) this.plotManager.showLandscapeWash = state.showLandscapeWash;

        // Restore roads
        this.roadManager.roads = (state.roads || []).map(r => {
            const road = this.roadManager.addRoad(r);
            road.id = r.id;
            return road;
        });

        // Restore stairs
        this.stairManager.stairs = (state.stairs || []).map(s => {
            const stair = this.stairManager.addStair(s);
            stair.id = s.id;
            return stair;
        });

        // Restore walls
        this.wallManager.walls = (state.walls || []).map(w => {
            const wall = new Wall(w.start, w.end, w.thickness, w.type);
            wall.id = w.id;
            return wall;
        });

        // Restore columns
        this.columnManager.columns = (state.columns || []).map(c => {
            const col = this.columnManager.addColumn(c.x, c.y, c);
            col.id = c.id;
            col.width = c.width;
            col.depth = c.depth;
            col.rotation = c.rotation || 0;
            col.name = c.name;
            col.showLabel = c.showLabel || false;
            return col;
        });

        // Restore openings
        this.openingManager.openings = (state.openings || []).map(o => {
            const op = this.openingManager.addOpening(o.wallId, o.t, o);
            op.id = o.id;
            return op;
        });

        // Restore rooms
        this.roomManager.rooms = (state.rooms || []).map(r => {
            const room = this.roomManager.addRoom(r.x, r.y, r);
            room.id = r.id;
            room.rotation = r.rotation || 0;
            room.tagStyle = r.tagStyle || 'clean';
            room.isDoubleHeight = !!r.isDoubleHeight;
            room.ceilingHeight = r.ceilingHeight || 240;
            room.isVoid = !!r.isVoid;
            room.voidType = r.voidType || 'open_to_below';
            room.dottedSlabLine = !!r.dottedSlabLine;
            room.slabOffset = r.slabOffset !== undefined ? r.slabOffset : 0;
            room.slabLinePattern = r.slabLinePattern || 'dashed';
            room.slabLabel = r.slabLabel || '';
            room.dottedCutoutPerimeter = !!r.dottedCutoutPerimeter;
            return room;
        });

        // Restore furniture
        this.furnitureManager.items = (state.furniture || []).map(f => {
            const item = this.furnitureManager.addItem(f.typeId, f.x, f.y, f.rotation);
            item.id = f.id;
            item.width = f.width;
            item.height = f.height;
            return item;
        });

        // Restore dimensions
        this.dimensionManager.dimensions = (state.dimensions || []).map(d => {
            const dim = this.dimensionManager.addDimension(d.start, d.end, d.offset, d.customText);
            if (dim) dim.id = d.id;
            return dim;
        });

        // Restore Multi-floor state
        if (state.floorManager && this.floorManager) {
            this.floorManager.deserialize(state.floorManager);
        }

        // Restore Project Info state
        if (state.projectInfo && this.projectInfo) {
            this.projectInfo.deserialize(state.projectInfo);
        }

        this.updateUndoRedoButtons();
        this.updateInspector();
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
    }

    clearSelection() {
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
        this.updateInspector();
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
        if (tool === 'select') {
            this.canvasElement.style.cursor = 'default';
        } else if (tool === 'pan') {
            this.canvasElement.style.cursor = 'grab';
        } else {
            this.canvasElement.style.cursor = 'crosshair';
        }

        // Show/hide secondary options bar for tool (e.g. furniture picker or wall thickness)
        this.updateToolSubOptions();
    }

    deleteSelected() {
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
        } else if (this.selectedCategory === 'road') {
            this.roadManager.removeRoad(this.selectedObject.id);
        } else if (this.selectedCategory === 'stair') {
            this.stairManager.removeStair(this.selectedObject.id);
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

    // ==========================================
    // MOUSE & DRAWING INTERACTIONS
    // ==========================================
    bindEvents() {
        const c = this.canvasElement;

        c.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', (e) => this.handleMouseUp(e));

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

            if (e.key === 'v' || e.key === 'V' || e.key === 'Escape') {
                this.setTool('select');
            } else if (e.key === 'w' || e.key === 'W') {
                this.setTool('wall');
            } else if (e.key === 'd' || e.key === 'D') {
                this.setTool('door');
            } else if (e.key === 'n' || e.key === 'N') {
                this.setTool('window');
            } else if (e.key === 'p' || e.key === 'P') {
                this.setTool('plot_rect');
            } else if (e.key === 'c' || e.key === 'C') {
                this.setTool('column');
            } else if (e.key === 'g' || e.key === 'G') {
                this.setTool('gate');
            } else if (e.key === 'r' || e.key === 'R') {
                if (this.selectedCategory === 'furniture' && this.selectedObject) {
                    this.furnitureManager.rotateItem(this.selectedObject.id, 90);
                    this.saveHistory();
                    this.updateInspector();
                } else if (this.selectedCategory === 'column' && this.selectedObject) {
                    this.selectedObject.rotate(90);
                    this.saveHistory();
                    this.updateInspector();
                } else if (this.selectedCategory === 'room' && this.selectedObject) {
                    this.roomManager.rotateRoom(this.selectedObject.id, 90);
                    this.saveHistory();
                    this.updateInspector();
                } else if (this.selectedCategory === 'stair' && this.selectedObject) {
                    this.stairManager.rotateStair(this.selectedObject.id, 90);
                    this.saveHistory();
                    this.updateInspector();
                } else if (this.selectedCategory === 'opening' && this.selectedObject && (this.selectedObject.type === 'door' || this.selectedObject.type === 'gate')) {
                    this.openingManager.flipSwing(this.selectedObject.id);
                    this.saveHistory();
                    this.updateInspector();
                } else {
                    this.setTool('room');
                }
            } else if (e.key === 'h' || e.key === 'H') {
                if (this.selectedCategory === 'opening' && this.selectedObject && (this.selectedObject.type === 'door' || this.selectedObject.type === 'gate')) {
                    this.openingManager.flipHinge(this.selectedObject.id);
                    this.saveHistory();
                    this.updateInspector();
                }
            } else if (e.key === 'f' || e.key === 'F') {
                if (this.selectedCategory === 'opening' && this.selectedObject && (this.selectedObject.type === 'door' || this.selectedObject.type === 'gate')) {
                    this.openingManager.flipSwing(this.selectedObject.id);
                    this.saveHistory();
                    this.updateInspector();
                } else {
                    this.setTool('furniture');
                }
            } else if (e.key === 'k' || e.key === 'K') {
                this.setTool('compound_wall');
            } else if (e.key === 'l' || e.key === 'L') {
                this.setTool('landscape');
            } else if (e.key === 'm' || e.key === 'M') {
                this.setTool('dimension');
            } else if (e.key === 'b' || e.key === 'B') {
                this.setTool('break_wall');
            } else if (e.key === 'o' || e.key === 'O') {
                this.setTool('road');
            } else if (e.key === 's' || e.key === 'S') {
                this.setTool('stairs');
            } else if (e.key === '1') {
                if (this.floorManager) {
                    this.floorManager.setViewMode('active');
                    this.floorManager.switchFloor('ground');
                }
            } else if (e.key === '2') {
                if (this.floorManager) {
                    this.floorManager.setViewMode('active');
                    this.floorManager.switchFloor('first');
                }
            } else if (e.key === '3') {
                if (this.floorManager) {
                    this.floorManager.setViewMode('active');
                    this.floorManager.switchFloor('terrace');
                }
            } else if (e.key === '0') {
                if (this.floorManager) {
                    this.floorManager.setViewMode('side_by_side');
                }
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                this.deleteSelected();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) this.redo();
                else this.undo();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                this.redo();
            }
        });

        // Prevent accidental page reload or exit
        window.addEventListener('beforeunload', (e) => {
            this.saveToLocalStorage();
            if (this.wallManager.walls.length > 0 || this.plotManager.plot) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes in your house plan drawing. Are you sure you want to leave?';
                return e.returnValue;
            }
        });
    }

    handleMouseDown(e) {
        const rect = this.canvasElement.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Middle mouse or Spacebar = Pan
        if (e.button === 1 || this.canvasEngine.isSpacePressed || this.activeTool === 'pan') {
            this.canvasEngine.isPanning = true;
            this.canvasEngine.panStartX = screenX - this.canvasEngine.offsetX;
            this.canvasEngine.panStartY = screenY - this.canvasEngine.offsetY;
            this.canvasElement.style.cursor = 'grabbing';
            return;
        }

        if (e.button !== 0) return; // Only left click for drafting

        const rawWorld = this.canvasEngine.screenToWorld(screenX, screenY);
        const isSideBySide = this.floorManager && this.floorManager.viewMode === 'side_by_side';

        // In side-by-side mode, clicking on another floor switches active floor
        if (isSideBySide && this.floorManager && !this.isDragging && !this.draftStart) {
            const offFirst = this.floorManager.getFloorOffset('first');
            if (rawWorld.x >= offFirst.x - 40 && this.floorManager.activeFloorId !== 'first') {
                this.floorManager.switchFloor('first');
            } else if (rawWorld.x < offFirst.x - 40 && this.floorManager.activeFloorId !== 'ground') {
                this.floorManager.switchFloor('ground');
            }
        }

        const activeOff = (isSideBySide && this.floorManager)
            ? this.floorManager.getFloorOffset(this.floorManager.activeFloorId)
            : { x: 0, y: 0 };
        const world = { x: rawWorld.x - activeOff.x, y: rawWorld.y - activeOff.y };

        const snapped = this.canvasEngine.getSnapPoint(
            world.x, world.y,
            this.getAllSnapTargets(),
            this.draftStart,
            e.shiftKey
        );

        switch (this.activeTool) {
            case 'select': {
                const scale = this.canvasEngine.scale;

                // 1. Check if clicking on compass to rotate
                if (this.plotManager.hitTestCompass(world.x, world.y, scale)) {
                    this.isDragging = true;
                    this.dragTarget = { type: 'compass' };
                    this.dragHasMoved = false;
                    return;
                }

                // 2. Check if clicking a corner handle of the selected wall
                if (this.selectedCategory === 'wall' && this.selectedObject) {
                    const w = this.selectedObject;
                    const rHandle = Math.max(12 / scale, 6);
                    if (Math.hypot(world.x - w.start.x, world.y - w.start.y) <= rHandle) {
                        this.isDragging = true;
                        this.dragTarget = { type: 'vertex', vertexPoint: { ...w.start } };
                        this.dragHasMoved = false;
                        return;
                    } else if (Math.hypot(world.x - w.end.x, world.y - w.end.y) <= rHandle) {
                        this.isDragging = true;
                        this.dragTarget = { type: 'vertex', vertexPoint: { ...w.end } };
                        this.dragHasMoved = false;
                        return;
                    }
                }

                // 2c. Check if clicking rotation handle of the selected room label
                if (this.selectedCategory === 'room' && this.selectedObject) {
                    if (this.selectedObject.hitRotationHandle(world.x, world.y, scale)) {
                        this.isDragging = true;
                        this.dragTarget = {
                            type: 'room_rotate',
                            room: this.selectedObject,
                            centerX: this.selectedObject.x,
                            centerY: this.selectedObject.y
                        };
                        this.dragHasMoved = false;
                        return;
                    }
                }

                // 2c-2. Check if clicking rotation handle of the selected column
                if (this.selectedCategory === 'column' && this.selectedObject) {
                    const col = this.selectedObject;
                    const hd = col.depth / 2;
                    const stemLen = 14 / scale;
                    const rad = (col.rotation * Math.PI) / 180;
                    const hx = col.x + stemLen * Math.sin(rad);
                    const hy = col.y - (hd + stemLen) * Math.cos(rad);
                    if (Math.hypot(world.x - hx, world.y - hy) <= 8 / scale) {
                        col.rotate(90);
                        this.saveHistory();
                        this.updateInspector();
                        return;
                    }
                }

                // 2c-3. Check if clicking on a column to select & drag move
                const clickedColumn = this.columnManager.getColumnAt(world.x, world.y, scale);
                if (clickedColumn) {
                    this.clearSelection();
                    this.selectedCategory = 'column';
                    this.selectedObject = clickedColumn;
                    this.columnManager.selectedColumnId = clickedColumn.id;
                    this.updateInspector();

                    this.isDragging = true;
                    this.dragTarget = {
                        type: 'column',
                        column: clickedColumn,
                        startX: clickedColumn.x,
                        startY: clickedColumn.y,
                        clickX: world.x,
                        clickY: world.y
                    };
                    this.dragHasMoved = false;
                    return;
                }

                // 2d. Check if clicking handle of the selected furniture item (resize or rotate)
                if (this.selectedCategory === 'furniture' && this.selectedObject) {
                    const item = this.selectedObject;
                    const handle = item.hitHandle ? item.hitHandle(world.x, world.y, scale) : null;
                    if (handle) {
                        this.isDragging = true;
                        if (handle.id === 'rot') {
                            this.dragTarget = {
                                type: 'furniture_rotate',
                                item,
                                centerX: item.x,
                                centerY: item.y
                            };
                            this.canvasElement.style.cursor = 'grabbing';
                        } else {
                            this.dragTarget = {
                                type: 'furniture_resize',
                                item,
                                handleId: handle.id,
                                initW: item.width,
                                initH: item.height,
                                initX: item.x,
                                initY: item.y,
                                initAngle: item.rotation || 0,
                                clickX: world.x,
                                clickY: world.y
                            };
                            this.canvasElement.style.cursor = item.getCursorForHandle(handle);
                        }
                        this.dragHasMoved = false;
                        return;
                    }
                }

                // 2e. Check if clicking on furniture to select & drag move
                const clickedFurniture = this.furnitureManager.getItemAt(world.x, world.y);
                if (clickedFurniture) {
                    this.clearSelection();
                    this.selectedCategory = 'furniture';
                    this.selectedObject = clickedFurniture;
                    this.furnitureManager.selectedItemId = clickedFurniture.id;
                    this.updateInspector();

                    this.isDragging = true;
                    this.dragTarget = {
                        type: 'furniture',
                        item: clickedFurniture,
                        startX: clickedFurniture.x,
                        startY: clickedFurniture.y,
                        clickX: world.x,
                        clickY: world.y
                    };
                    this.dragHasMoved = false;
                    return;
                }

                // 3. Check if clicking on a wall to select & drag
                const clickedWall = this.wallManager.getWallAt(world.x, world.y, scale);
                if (clickedWall) {
                    this.clearSelection();
                    this.selectedCategory = 'wall';
                    this.selectedObject = clickedWall;
                    this.wallManager.selectedWallId = clickedWall.id;
                    this.updateInspector();

                    this.isDragging = true;
                    this.dragTarget = { type: 'wall', wallId: clickedWall.id, lastPoint: { ...world } };
                    this.dragHasMoved = false;
                    return;
                }

                // 3b. Check if clicking on stairs to select & drag
                const clickedStair = this.stairManager.hitTest(world.x, world.y);
                if (clickedStair) {
                    this.clearSelection();
                    this.selectedCategory = 'stair';
                    this.selectedObject = clickedStair;
                    this.stairManager.selectedStairId = clickedStair.id;
                    this.updateInspector();

                    this.isDragging = true;
                    this.dragTarget = {
                        type: 'stair',
                        stair: clickedStair,
                        startX: clickedStair.x,
                        startY: clickedStair.y,
                        clickX: world.x,
                        clickY: world.y
                    };
                    this.dragHasMoved = false;
                    return;
                }

                // 3c. Check if clicking on room label/room to select & drag
                const clickedRoom = this.roomManager.getRoomAt(world.x, world.y, scale);
                if (clickedRoom) {
                    this.clearSelection();
                    this.selectedCategory = 'room';
                    this.selectedObject = clickedRoom;
                    this.roomManager.selectedRoomId = clickedRoom.id;
                    this.updateInspector();

                    this.isDragging = true;
                    this.dragTarget = {
                        type: 'room',
                        room: clickedRoom,
                        startX: clickedRoom.x,
                        startY: clickedRoom.y,
                        clickX: world.x,
                        clickY: world.y
                    };
                    this.dragHasMoved = false;
                    return;
                }

                this.handleSelectClick(world.x, world.y);
                break;
            }

            case 'break_wall': {
                const scale = this.canvasEngine.scale;
                const wallToSplit = this.wallManager.getWallAt(world.x, world.y, scale, 12 / scale);
                if (wallToSplit) {
                    const res = this.wallManager.splitWall(wallToSplit.id, world, this.openingManager);
                    if (res) {
                        this.saveHistory();
                        this.selectedCategory = 'wall';
                        this.selectedObject = res.wall1;
                        this.wallManager.selectedWallId = res.wall1.id;
                        this.updateInspector();
                    }
                }
                break;
            }

            case 'road':
                break;

            case 'stairs': {
                const stair = this.stairManager.addStair({
                    x: snapped.x,
                    y: snapped.y,
                    type: this.activeStairType,
                    flightWidth: this.activeStairFlightWidth,
                    treads: this.activeStairTreads,
                    landingSteps: this.activeStairLandingSteps !== undefined ? this.activeStairLandingSteps : (this.activeStairType === 'dogleg' ? 3 : 0)
                });
                this.saveHistory();
                this.clearSelection();
                this.selectedCategory = 'stair';
                this.selectedObject = stair;
                this.stairManager.selectedStairId = stair.id;
                this.updateInspector();
                this.setTool('select');
                break;
            }

            case 'plot_rect':
                if (!this.draftStart) {
                    this.draftStart = { x: snapped.x, y: snapped.y };
                } else {
                    const w = Math.abs(snapped.x - this.draftStart.x);
                    const h = Math.abs(snapped.y - this.draftStart.y);
                    const minX = Math.min(this.draftStart.x, snapped.x);
                    const minY = Math.min(this.draftStart.y, snapped.y);
                    if (w > 24 && h > 24) {
                        this.plotManager.createRectangularPlot(minX, minY, w, h);
                        this.saveHistory();
                        this.setTool('select');
                    }
                    this.draftStart = null;
                }
                break;

            case 'wall':
                if (!this.draftStart) {
                    this.draftStart = { x: snapped.x, y: snapped.y };
                } else {
                    const wall = this.wallManager.addWall(
                        this.draftStart,
                        { x: snapped.x, y: snapped.y },
                        this.wallManager.currentThickness,
                        this.wallManager.currentType
                    );
                    if (wall) {
                        this.saveHistory();
                        // Chain wall to next point
                        this.draftStart = { x: snapped.x, y: snapped.y };
                    }
                }
                break;

            case 'compound_wall':
                if (!this.draftStart) {
                    this.draftStart = { x: snapped.x, y: snapped.y };
                } else {
                    const wall = this.wallManager.addWall(
                        this.draftStart,
                        { x: snapped.x, y: snapped.y },
                        this.compoundWallThickness || 6,
                        'compound'
                    );
                    if (wall) {
                        this.saveHistory();
                        // Chain wall to next point
                        this.draftStart = { x: snapped.x, y: snapped.y };
                    }
                }
                break;

            case 'column': {
                const snap = this.columnManager.getSnapPoint(snapped.x, snapped.y, this.wallManager, 16);
                const preset = COLUMN_PRESETS[this.activeColumnPresetIndex] || COLUMN_PRESETS[1];
                const col = this.columnManager.addColumn(snap.x, snap.y, {
                    width: preset.width,
                    depth: preset.depth,
                    rotation: this.activeColumnRotation || 0
                });
                this.saveHistory();
                this.clearSelection();
                this.selectedCategory = 'column';
                this.selectedObject = col;
                this.columnManager.selectedColumnId = col.id;
                this.updateInspector();
                this.setTool('select');
                break;
            }

            case 'gate':
            case 'door':
            case 'window':
                this.handleOpeningPlacement(world.x, world.y);
                break;

            case 'room': {
                const roomPreset = ROOM_PRESETS[0];
                this.roomManager.addRoom(snapped.x, snapped.y, {
                    name: 'Living Room',
                    width: roomPreset.defaultW,
                    height: roomPreset.defaultH
                });
                this.saveHistory();
                this.setTool('select');
                break;
            }

            case 'furniture': {
                this.furnitureManager.addItem(this.activeFurnitureType, snapped.x, snapped.y);
                this.saveHistory();
                this.setTool('select');
                break;
            }

            case 'landscape': {
                const itemType = this.activeLandscapeType || 'tree_deciduous';
                const item = this.furnitureManager.addItem(itemType, snapped.x, snapped.y);
                this.saveHistory();
                this.clearSelection();
                this.selectedCategory = 'furniture';
                this.selectedObject = item;
                this.furnitureManager.selectedItemId = item.id;
                this.updateInspector();
                this.setTool('select');
                break;
            }

            case 'dimension':
                if (!this.draftStart) {
                    this.draftStart = { x: snapped.x, y: snapped.y };
                } else {
                    this.dimensionManager.addDimension(this.draftStart, { x: snapped.x, y: snapped.y }, 24);
                    this.saveHistory();
                    this.draftStart = null;
                    this.setTool('select');
                }
                break;
        }
    }

    handleMouseMove(e) {
        const rect = this.canvasElement.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        if (this.canvasEngine.isPanning) {
            this.canvasEngine.offsetX = screenX - this.canvasEngine.panStartX;
            this.canvasEngine.offsetY = screenY - this.canvasEngine.panStartY;
            return;
        }

        const rawWorld = this.canvasEngine.screenToWorld(screenX, screenY);
        const isSideBySide = this.floorManager && this.floorManager.viewMode === 'side_by_side';
        const activeOff = (isSideBySide && this.floorManager)
            ? this.floorManager.getFloorOffset(this.floorManager.activeFloorId)
            : { x: 0, y: 0 };
        const world = { x: rawWorld.x - activeOff.x, y: rawWorld.y - activeOff.y };

        const snapped = this.canvasEngine.getSnapPoint(
            world.x, world.y,
            this.getAllSnapTargets(),
            this.draftStart,
            e.shiftKey
        );

        this.draftCurrent = snapped;

        // Handle active dragging of walls, vertices, compass, or stairs
        if (this.isDragging && this.dragTarget) {
            this.dragHasMoved = true;
            const scale = this.canvasEngine.scale;

            if (this.dragTarget.type === 'compass') {
                this.plotManager.setCompassAngleFromPoint(world.x, world.y, scale);
                this.updateInspector();
                return;
            }

            if (this.dragTarget.type === 'column') {
                const dx = world.x - this.dragTarget.clickX;
                const dy = world.y - this.dragTarget.clickY;
                let targetX = this.dragTarget.startX + dx;
                let targetY = this.dragTarget.startY + dy;

                const snap = this.columnManager.getSnapPoint(targetX, targetY, this.wallManager, 16);
                this.dragTarget.column.x = Math.round((snap.snapped ? snap.x : targetX) * 10) / 10;
                this.dragTarget.column.y = Math.round((snap.snapped ? snap.y : targetY) * 10) / 10;
                this.updateInspector();
                return;
            }

            if (this.dragTarget.type === 'furniture') {
                const dx = world.x - this.dragTarget.clickX;
                const dy = world.y - this.dragTarget.clickY;
                let targetX = this.dragTarget.startX + dx;
                let targetY = this.dragTarget.startY + dy;
                if (this.canvasEngine.snapToGrid && !e.shiftKey) {
                    const gridSnap = this.canvasEngine.getGridSnap(targetX, targetY);
                    targetX = gridSnap.x;
                    targetY = gridSnap.y;
                }
                this.dragTarget.item.x = Math.round(targetX * 10) / 10;
                this.dragTarget.item.y = Math.round(targetY * 10) / 10;
                this.updateInspector();
                return;
            }

            if (this.dragTarget.type === 'furniture_rotate') {
                const item = this.dragTarget.item;
                const dx = world.x - item.x;
                const dy = world.y - item.y;
                let deg = Math.round((Math.atan2(dy, dx) * 180 / Math.PI) + 90);
                deg = ((deg % 360) + 360) % 360;
                if (!e.shiftKey) {
                    deg = Math.round(deg / 15) * 15;
                }
                item.rotation = deg % 360;
                this.updateInspector();
                return;
            }

            if (this.dragTarget.type === 'furniture_resize') {
                const { item, handleId, initW, initH, initX, initY, initAngle } = this.dragTarget;
                const rad = (-initAngle * Math.PI) / 180;
                const dwx = world.x - initX;
                const dwy = world.y - initY;
                const lx = dwx * Math.cos(rad) - dwy * Math.sin(rad);
                const ly = dwx * Math.sin(rad) + dwy * Math.cos(rad);

                let newW = initW;
                let newH = initH;
                let deltaXLoc = 0;
                let deltaYLoc = 0;

                const minDim = 12; // Minimum 12 inches (1 ft)

                if (e.altKey) {
                    // Center-symmetric resize
                    if (['r', 'l', 'tl', 'tr', 'bl', 'br'].includes(handleId)) {
                        newW = Math.max(minDim, Math.round(Math.abs(lx) * 2 * 10) / 10);
                    }
                    if (['t', 'b', 'tl', 'tr', 'bl', 'br'].includes(handleId)) {
                        newH = Math.max(minDim, Math.round(Math.abs(ly) * 2 * 10) / 10);
                    }
                    deltaXLoc = 0;
                    deltaYLoc = 0;
                } else {
                    // Drag to fit: opposite edge/corner stays strictly anchored
                    switch (handleId) {
                        case 'r':
                            newW = Math.max(minDim, lx + initW / 2);
                            deltaXLoc = (newW - initW) / 2;
                            break;
                        case 'l':
                            newW = Math.max(minDim, initW / 2 - lx);
                            deltaXLoc = (initW - newW) / 2;
                            break;
                        case 'b':
                            newH = Math.max(minDim, ly + initH / 2);
                            deltaYLoc = (newH - initH) / 2;
                            break;
                        case 't':
                            newH = Math.max(minDim, initH / 2 - ly);
                            deltaYLoc = (initH - newH) / 2;
                            break;
                        case 'br':
                            newW = Math.max(minDim, lx + initW / 2);
                            newH = Math.max(minDim, ly + initH / 2);
                            if (e.shiftKey) {
                                const ratio = initW / initH;
                                if (newW / initW > newH / initH) {
                                    newH = newW / ratio;
                                } else {
                                    newW = newH * ratio;
                                }
                            }
                            deltaXLoc = (newW - initW) / 2;
                            deltaYLoc = (newH - initH) / 2;
                            break;
                        case 'bl':
                            newW = Math.max(minDim, initW / 2 - lx);
                            newH = Math.max(minDim, ly + initH / 2);
                            if (e.shiftKey) {
                                const ratio = initW / initH;
                                if (newW / initW > newH / initH) {
                                    newH = newW / ratio;
                                } else {
                                    newW = newH * ratio;
                                }
                            }
                            deltaXLoc = (initW - newW) / 2;
                            deltaYLoc = (newH - initH) / 2;
                            break;
                        case 'tr':
                            newW = Math.max(minDim, lx + initW / 2);
                            newH = Math.max(minDim, initH / 2 - ly);
                            if (e.shiftKey) {
                                const ratio = initW / initH;
                                if (newW / initW > newH / initH) {
                                    newH = newW / ratio;
                                } else {
                                    newW = newH * ratio;
                                }
                            }
                            deltaXLoc = (newW - initW) / 2;
                            deltaYLoc = (initH - newH) / 2;
                            break;
                        case 'tl':
                            newW = Math.max(minDim, initW / 2 - lx);
                            newH = Math.max(minDim, initH / 2 - ly);
                            if (e.shiftKey) {
                                const ratio = initW / initH;
                                if (newW / initW > newH / initH) {
                                    newH = newW / ratio;
                                } else {
                                    newW = newH * ratio;
                                }
                            }
                            deltaXLoc = (initW - newW) / 2;
                            deltaYLoc = (initH - newH) / 2;
                            break;
                    }
                }

                const worldRad = (initAngle * Math.PI) / 180;
                item.width = Math.round(newW * 10) / 10;
                item.height = Math.round(newH * 10) / 10;
                item.x = Math.round((initX + Math.cos(worldRad) * deltaXLoc - Math.sin(worldRad) * deltaYLoc) * 10) / 10;
                item.y = Math.round((initY + Math.sin(worldRad) * deltaXLoc + Math.cos(worldRad) * deltaYLoc) * 10) / 10;
                this.updateInspector();
                return;
            }

            if (this.dragTarget.type === 'stair') {
                const dx = world.x - this.dragTarget.clickX;
                const dy = world.y - this.dragTarget.clickY;
                this.dragTarget.stair.x = this.dragTarget.startX + dx;
                this.dragTarget.stair.y = this.dragTarget.startY + dy;
                this.updateInspector();
                return;
            }

            if (this.dragTarget.type === 'room') {
                const dx = world.x - this.dragTarget.clickX;
                const dy = world.y - this.dragTarget.clickY;
                this.dragTarget.room.x = this.dragTarget.startX + dx;
                this.dragTarget.room.y = this.dragTarget.startY + dy;
                this.updateInspector();
                return;
            }

            if (this.dragTarget.type === 'room_rotate') {
                const r = this.dragTarget.room;
                const dx = world.x - this.dragTarget.centerX;
                const dy = world.y - this.dragTarget.centerY;
                let deg = Math.round((Math.atan2(dy, dx) * 180 / Math.PI) + 90);
                deg = ((deg % 360) + 360) % 360;
                if (!e.shiftKey) {
                    deg = Math.round(deg / 15) * 15;
                }
                r.rotation = deg % 360;
                this.updateInspector();
                return;
            }

            if (this.dragTarget.type === 'vertex') {
                const snappedV = this.canvasEngine.getSnapPoint(
                    world.x, world.y,
                    this.getAllSnapTargets(),
                    null,
                    e.shiftKey
                );
                this.wallManager.moveVertex(this.dragTarget.vertexPoint, snappedV, 2.5);
                this.dragTarget.vertexPoint = { ...snappedV };
                if (this.selectedCategory === 'wall' && this.selectedObject) {
                    this.updateInspector();
                }
                return;
            }

            if (this.dragTarget.type === 'wall') {
                const dx = world.x - this.dragTarget.lastPoint.x;
                const dy = world.y - this.dragTarget.lastPoint.y;
                this.wallManager.moveWall(this.dragTarget.wallId, dx, dy, true);
                this.dragTarget.lastPoint = { ...world };
                this.updateInspector();
                return;
            }
        }

        // Check hover cursors
        const scale = this.canvasEngine.scale;
        if (!this.isDragging && this.activeTool === 'select') {
            let cursorSet = false;

            // 1. Check selected furniture handles
            if (this.selectedCategory === 'furniture' && this.selectedObject) {
                const handle = this.selectedObject.hitHandle ? this.selectedObject.hitHandle(world.x, world.y, scale) : null;
                if (handle) {
                    this.canvasElement.style.cursor = this.selectedObject.getCursorForHandle(handle);
                    cursorSet = true;
                }
            }

            // 2. Check room rotation handle
            if (!cursorSet && this.selectedCategory === 'room' && this.selectedObject) {
                if (this.selectedObject.hitRotationHandle && this.selectedObject.hitRotationHandle(world.x, world.y, scale)) {
                    this.canvasElement.style.cursor = 'grab';
                    cursorSet = true;
                }
            }

            // 3. Check hovering over any furniture item (indicate draggable)
            if (!cursorSet) {
                const hoveredFurniture = this.furnitureManager.getItemAt(world.x, world.y);
                if (hoveredFurniture) {
                    this.canvasElement.style.cursor = 'move';
                    cursorSet = true;
                }
            }

            // 3b. Check hovering over any column (indicate draggable)
            if (!cursorSet) {
                const hoveredCol = this.columnManager.getColumnAt(world.x, world.y, scale);
                if (hoveredCol) {
                    this.canvasElement.style.cursor = 'move';
                    cursorSet = true;
                }
            }

            if (!cursorSet && !this.canvasEngine.isSpacePressed) {
                this.canvasElement.style.cursor = 'default';
            }
        }

        // Check if cursor is hovering over or near any wall to calculate live distances to ends
        const hoverTol = Math.max(16 / scale, 6);
        const hoveredWall = this.wallManager.getWallAt(world.x, world.y, scale, hoverTol);
        if (hoveredWall) {
            this.hoveredWallInfo = hoveredWall.getDistancesFromPoint(world);
        } else {
            this.hoveredWallInfo = null;
        }

        // Update status bar cursor coordinates readout
        this.updateCoordinatesBar(snapped.x, snapped.y);
    }

    handleMouseUp(e) {
        if (this.canvasEngine.isPanning) {
            this.canvasEngine.isPanning = false;
            this.canvasElement.style.cursor = this.canvasEngine.isSpacePressed ? 'grab' : (this.activeTool === 'select' ? 'default' : 'crosshair');
        }

        if (this.isDragging) {
            if (this.dragHasMoved) {
                this.saveHistory();
            }
            this.isDragging = false;
            this.dragTarget = null;
            this.dragHasMoved = false;
            this.canvasElement.style.cursor = this.canvasEngine.isSpacePressed ? 'grab' : (this.activeTool === 'select' ? 'default' : 'crosshair');
        }
    }

    handleSelectClick(worldX, worldY) {
        const scale = this.canvasEngine.scale;

        // 0. Check Stairs
        const stair = this.stairManager.hitTest(worldX, worldY);
        if (stair) {
            this.clearSelection();
            this.selectedCategory = 'stair';
            this.selectedObject = stair;
            this.stairManager.selectedStairId = stair.id;
            this.updateInspector();
            return;
        }

        // 0b. Check Columns
        const col = this.columnManager.getColumnAt(worldX, worldY, scale);
        if (col) {
            this.clearSelection();
            this.selectedCategory = 'column';
            this.selectedObject = col;
            this.columnManager.selectedColumnId = col.id;
            this.updateInspector();
            return;
        }

        // 1. Check Furniture
        const item = this.furnitureManager.getItemAt(worldX, worldY);
        if (item) {
            this.clearSelection();
            this.selectedCategory = 'furniture';
            this.selectedObject = item;
            this.furnitureManager.selectedItemId = item.id;
            this.updateInspector();
            return;
        }

        // 2. Check Openings (Doors / Windows / Gates)
        const op = this.openingManager.getOpeningAt(worldX, worldY, scale, this.wallManager);
        if (op) {
            this.clearSelection();
            this.selectedCategory = 'opening';
            this.selectedObject = op;
            this.openingManager.selectedOpeningId = op.id;
            this.updateInspector();
            return;
        }

        // 3. Check Walls
        const wall = this.wallManager.getWallAt(worldX, worldY, scale);
        if (wall) {
            this.clearSelection();
            this.selectedCategory = 'wall';
            this.selectedObject = wall;
            this.wallManager.selectedWallId = wall.id;
            this.updateInspector();
            return;
        }

        // 4. Check Rooms
        const room = this.roomManager.getRoomAt(worldX, worldY, scale);
        if (room) {
            this.clearSelection();
            this.selectedCategory = 'room';
            this.selectedObject = room;
            this.roomManager.selectedRoomId = room.id;
            this.updateInspector();
            return;
        }

        // 5. Check Dimensions
        const dim = this.dimensionManager.getDimAt(worldX, worldY, scale);
        if (dim) {
            this.clearSelection();
            this.selectedCategory = 'dimension';
            this.selectedObject = dim;
            this.dimensionManager.selectedDimId = dim.id;
            this.updateInspector();
            return;
        }

        // 6. Check Roads
        const road = this.roadManager.getRoadAt(worldX, worldY, this.plotManager.getBounds());
        if (road) {
            this.clearSelection();
            this.selectedCategory = 'road';
            this.selectedObject = road;
            this.roadManager.selectedRoadId = road.id;
            this.updateInspector();
            return;
        }

        // 7. Check Plot
        if (this.plotManager.plot && this.plotManager.hitTest(worldX, worldY)) {
            this.clearSelection();
            this.selectedCategory = 'plot';
            this.selectedObject = this.plotManager.plot;
            this.updateInspector();
            return;
        }

        // Clicked on empty space
        this.clearSelection();
    }

    handleOpeningPlacement(worldX, worldY, explicitType = null) {
        const scale = this.canvasEngine.scale;
        const wall = this.wallManager.getWallAt(worldX, worldY, scale);

        if (wall) {
            const proj = wall.projectPoint({ x: worldX, y: worldY });
            if (proj.t >= 0.05 && proj.t <= 0.95) {
                const opType = explicitType || (this.activeTool === 'gate' ? 'gate' : (this.activeTool === 'door' ? 'door' : 'window'));
                let subtype, width, label;
                if (opType === 'gate') {
                    subtype = this.gateSubtype || 'sliding';
                    width = this.activeGateWidth || 120;
                    label = 'GATE';
                } else if (opType === 'door') {
                    subtype = this.doorSubtype || 'single';
                    width = this.activeDoorWidth || 36;
                    label = 'D';
                } else {
                    subtype = this.windowSubtype || 'standard';
                    width = this.activeWindowWidth || 48;
                    label = 'W';
                }

                const op = this.openingManager.addOpening(wall.id, proj.t, {
                    type: opType,
                    subtype,
                    width,
                    label
                });
                this.saveHistory();
                this.clearSelection();
                this.selectedCategory = 'opening';
                this.selectedObject = op;
                this.openingManager.selectedOpeningId = op.id;
                this.updateInspector();
                this.setTool('select');
            }
        }
    }

    // ==========================================
    // RENDERING LOOP
    // ==========================================
    startRenderLoop() {
        const loop = () => {
            try {
                this.render();
            } catch (err) {
                console.error('Render error:', err);
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
        this.openingManager.render(ctx, scale, this.wallManager);

        // 6. Fixtures & Furniture
        this.furnitureManager.render(ctx, scale);

        // 7. Dimensions
        this.dimensionManager.render(ctx, scale);

        // 8. Live Drafting Overlays (Preview while drawing)
        this.renderDraftingPreviews(ctx, scale);

        ctx.restore();

        this.canvasEngine.endFrame();
    }

    renderDraftingPreviews(ctx, scale) {
        // Furniture resize live HUD badge (always show during dragging)
        if (this.isDragging && this.dragTarget && this.dragTarget.type === 'furniture_resize') {
            const item = this.dragTarget.item;
            ctx.save();
            ctx.translate(item.x, item.y);
            ctx.rotate((item.rotation * Math.PI) / 180);

            const badgeText = `${units.formatLength(item.width)} × ${units.formatLength(item.height)}`;
            const fontSize = Math.max(12 / scale, 4);
            ctx.font = `bold ${fontSize}px sans-serif`;
            const tw = ctx.measureText(badgeText).width;
            const padX = 8 / scale;
            const padY = 5 / scale;
            const badgeW = tw + padX * 2;
            const badgeH = fontSize + padY * 2;
            const isTopHandle = ['t', 'tl', 'tr'].includes(this.dragTarget.handleId);
            const badgeY = isTopHandle ? (-item.height / 2 - badgeH - 12 / scale) : (item.height / 2 + 12 / scale);

            ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.2 / scale;
            ctx.beginPath();
            ctx.roundRect(-badgeW / 2, badgeY, badgeW, badgeH, 4 / scale);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(badgeText, 0, badgeY + badgeH / 2);
            ctx.restore();
        }

        // Furniture rotate live HUD badge
        if (this.isDragging && this.dragTarget && this.dragTarget.type === 'furniture_rotate') {
            const item = this.dragTarget.item;
            ctx.save();
            ctx.translate(item.x, item.y);
            const badgeText = `${Math.round(item.rotation)}°`;
            const fontSize = Math.max(12 / scale, 4);
            ctx.font = `bold ${fontSize}px sans-serif`;
            const tw = ctx.measureText(badgeText).width;
            const padX = 8 / scale;
            const padY = 5 / scale;
            const badgeW = tw + padX * 2;
            const badgeH = fontSize + padY * 2;
            const badgeY = -item.height / 2 - 28 / scale;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.2 / scale;
            ctx.beginPath();
            ctx.roundRect(-badgeW / 2, badgeY, badgeW, badgeH, 4 / scale);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#38bdf8';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(badgeText, 0, badgeY + badgeH / 2);
            ctx.restore();
        }

        if (!this.draftCurrent) return;

        // Wall / Compound Wall drafting ghost line & live measurement
        if ((this.activeTool === 'wall' || this.activeTool === 'compound_wall') && this.draftStart) {
            const isCompound = this.activeTool === 'compound_wall';
            const thick = isCompound ? (this.compoundWallThickness || 6) : this.wallManager.currentThickness;

            ctx.save();
            ctx.strokeStyle = isCompound ? '#94a3b8' : '#38bdf8';
            ctx.lineWidth = thick * scale > 2 ? thick : 2 / scale;
            ctx.setLineDash([4 / scale, 4 / scale]);
            ctx.beginPath();
            ctx.moveTo(this.draftStart.x, this.draftStart.y);
            ctx.lineTo(this.draftCurrent.x, this.draftCurrent.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Live dimension badge
            const dx = this.draftCurrent.x - this.draftStart.x;
            const dy = this.draftCurrent.y - this.draftStart.y;
            const len = Math.hypot(dx, dy);
            const midX = (this.draftStart.x + this.draftCurrent.x) / 2;
            const midY = (this.draftStart.y + this.draftCurrent.y) / 2;

            const label = units.formatLength(len);
            ctx.font = `bold ${Math.max(12 / scale, 3.5)}px sans-serif`;
            const tw = ctx.measureText(label).width;

            ctx.fillStyle = isCompound ? '#334155' : '#0284c7';
            ctx.fillRect(midX - tw / 2 - 4 / scale, midY - 14 / scale, tw + 8 / scale, 18 / scale);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, midX, midY - 5 / scale);
            ctx.restore();
        }

        // Plot Rect preview
        if (this.activeTool === 'plot_rect' && this.draftStart) {
            ctx.save();
            ctx.strokeStyle = '#eab308';
            ctx.lineWidth = 2 / scale;
            ctx.setLineDash([6 / scale, 6 / scale]);
            const w = this.draftCurrent.x - this.draftStart.x;
            const h = this.draftCurrent.y - this.draftStart.y;
            ctx.strokeRect(this.draftStart.x, this.draftStart.y, w, h);
            ctx.setLineDash([]);
            ctx.restore();
        }

        // Door / Window / Gate ghost preview when hovering near wall
        if (this.activeTool === 'door' || this.activeTool === 'window' || this.activeTool === 'gate') {
            const wall = this.wallManager.getWallAt(this.draftCurrent.x, this.draftCurrent.y, scale);
            if (wall) {
                const proj = wall.projectPoint(this.draftCurrent);
                ctx.save();
                ctx.translate(proj.point.x, proj.point.y);
                ctx.rotate(wall.getAngle());
                ctx.strokeStyle = this.activeTool === 'gate' ? '#ef4444' : '#22c55e'; // red for gate, green for door/window
                ctx.lineWidth = 2 / scale;
                const previewW = this.activeTool === 'gate' ? (this.activeGateWidth || 120) : (this.activeTool === 'door' ? this.activeDoorWidth : this.activeWindowWidth);
                ctx.strokeRect(-previewW / 2, -wall.thickness / 2, previewW, wall.thickness);
                ctx.restore();
            }
        }

        // Column ghost placement preview with smart snap indicator
        if (this.activeTool === 'column') {
            const snap = this.columnManager.getSnapPoint(this.draftCurrent.x, this.draftCurrent.y, this.wallManager, 16);
            const preset = COLUMN_PRESETS[this.activeColumnPresetIndex] || COLUMN_PRESETS[1];
            ctx.save();
            ctx.translate(snap.x, snap.y);
            if (this.activeColumnRotation) {
                ctx.rotate((this.activeColumnRotation * Math.PI) / 180);
            }
            const hw = preset.width / 2;
            const hd = preset.depth / 2;

            // Ghost column
            ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
            ctx.fillRect(-hw, -hd, preset.width, preset.depth);
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.5 / scale;
            ctx.strokeRect(-hw, -hd, preset.width, preset.depth);

            // Rebar tie cross
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1 / scale;
            ctx.beginPath();
            ctx.moveTo(-hw, -hd); ctx.lineTo(hw, hd);
            ctx.moveTo(hw, -hd); ctx.lineTo(-hw, hd);
            ctx.stroke();

            // Snap indicator ring if snapped to corner/wall
            if (snap.snapped) {
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 2 / scale;
                ctx.setLineDash([3 / scale, 2 / scale]);
                ctx.beginPath();
                ctx.arc(0, 0, Math.max(preset.width, preset.depth) * 0.75, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.restore();
        }

        // Break Wall tool preview
        if (this.activeTool === 'break_wall') {
            const wall = this.wallManager.getWallAt(this.draftCurrent.x, this.draftCurrent.y, scale, 12 / scale);
            if (wall) {
                const proj = wall.projectPoint(this.draftCurrent);
                const angle = wall.getAngle();
                const halfT = wall.thickness / 2;
                const nx = -Math.sin(angle);
                const ny = Math.cos(angle);

                ctx.save();
                // Scissor / cut line across wall
                ctx.strokeStyle = '#ef4444'; // red cut line
                ctx.lineWidth = 2.5 / scale;
                ctx.setLineDash([3 / scale, 3 / scale]);
                ctx.beginPath();
                ctx.moveTo(proj.point.x - nx * (halfT + 6 / scale), proj.point.y - ny * (halfT + 6 / scale));
                ctx.lineTo(proj.point.x + nx * (halfT + 6 / scale), proj.point.y + ny * (halfT + 6 / scale));
                ctx.stroke();
                ctx.setLineDash([]);

                // Scissor cut marker
                ctx.beginPath();
                ctx.arc(proj.point.x, proj.point.y, 4 / scale, 0, Math.PI * 2);
                ctx.fillStyle = '#ef4444';
                ctx.fill();

                // Pill label: Split Here
                const dStart = Math.hypot(proj.point.x - wall.start.x, proj.point.y - wall.start.y);
                const dEnd = Math.hypot(wall.end.x - proj.point.x, wall.end.y - proj.point.y);
                const label = `✂ Break: [ ${units.formatLength(dStart)} | ${units.formatLength(dEnd)} ]`;
                const fontSize = Math.max(11 / scale, 3.5);
                ctx.font = `bold ${fontSize}px sans-serif`;
                const tw = ctx.measureText(label).width;

                ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
                ctx.fillRect(proj.point.x - tw / 2 - 4 / scale, proj.point.y - (halfT + 18 / scale), tw + 8 / scale, 18 / scale);
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, proj.point.x, proj.point.y - (halfT + 9 / scale));
                ctx.restore();
            }
        }

        // Stairs placement ghost preview
        if (this.activeTool === 'stairs' && this.draftCurrent) {
            ctx.save();
            ctx.globalAlpha = 0.65;
            const ghostStair = new Stair({
                x: this.draftCurrent.x,
                y: this.draftCurrent.y,
                type: this.activeStairType,
                flightWidth: this.activeStairFlightWidth,
                treads: this.activeStairTreads,
                landingSteps: this.activeStairLandingSteps !== undefined ? this.activeStairLandingSteps : (this.activeStairType === 'dogleg' ? 3 : 0)
            });
            ghostStair.render(ctx, scale, false);
            ctx.restore();
        }
    }

    /**
     * Render floating HUD card next to cursor showing distances to wall ends
     */
    renderHoverHUD(ctx, hoverInfo, scale) {
        if (!hoverInfo || !this.draftCurrent) return;
        const { dStart, dEnd, total, isNearCenter } = hoverInfo;

        const screenPos = this.canvasEngine.worldToScreen(this.draftCurrent.x, this.draftCurrent.y);
        const hudX = screenPos.x + 16;
        const hudY = screenPos.y + 16;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); // screen space for razor-sharp rendering
        const dpr = this.canvasEngine.dpr || 1;
        ctx.scale(dpr, dpr);

        const boxW = 195;
        const boxH = isNearCenter ? 80 : 66;

        // Keep HUD inside canvas view bounds
        const canvasW = this.canvasElement.width / dpr;
        const canvasH = this.canvasElement.height / dpr;
        const renderX = hudX + boxW > canvasW - 10 ? screenPos.x - boxW - 16 : hudX;
        const renderY = hudY + boxH > canvasH - 10 ? screenPos.y - boxH - 16 : hudY;

        // Background card with shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
        ctx.beginPath();
        ctx.roundRect(renderX, renderY, boxW, boxH, 6);
        ctx.fill();

        ctx.shadowColor = 'transparent'; // reset shadow
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Header
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('📏 WALL DISTANCES', renderX + 10, renderY + 8);

        // Distance items
        ctx.font = '600 12px "SF Mono", Consolas, monospace, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(`⇦ To Start: ${units.formatLength(dStart)}`, renderX + 10, renderY + 26);
        ctx.fillText(`⇨ To End:   ${units.formatLength(dEnd)}`, renderX + 10, renderY + 44);

        if (isNearCenter) {
            ctx.font = 'bold 10.5px sans-serif';
            ctx.fillStyle = '#10b981'; // emerald green
            ctx.fillText(`★ CENTER / MIDPOINT`, renderX + 10, renderY + 62);
        }

        ctx.restore();
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
        const snapGridBtn = document.getElementById('snapGridBtn');
        if (snapGridBtn) {
            snapGridBtn.addEventListener('click', () => {
                this.canvasEngine.snapToGrid = !this.canvasEngine.snapToGrid;
                snapGridBtn.classList.toggle('active', this.canvasEngine.snapToGrid);
            });
        }

        // Ortho toggle
        const orthoBtn = document.getElementById('orthoBtn');
        if (orthoBtn) {
            orthoBtn.addEventListener('click', () => {
                this.canvasEngine.orthoMode = !this.canvasEngine.orthoMode;
                orthoBtn.classList.toggle('active', this.canvasEngine.orthoMode);
            });
        }

        // Undo / Redo buttons
        document.getElementById('undoBtn')?.addEventListener('click', () => this.undo());
        document.getElementById('redoBtn')?.addEventListener('click', () => this.redo());
        document.getElementById('deleteBtn')?.addEventListener('click', () => this.deleteSelected());

        // Zoom controls
        document.getElementById('zoomInBtn')?.addEventListener('click', () => {
            this.canvasEngine.scale = Math.min(this.canvasEngine.scale * 1.25, 30.0);
        });
        document.getElementById('zoomOutBtn')?.addEventListener('click', () => {
            this.canvasEngine.scale = Math.max(this.canvasEngine.scale * 0.8, 0.1);
        });
        document.getElementById('zoomFitBtn')?.addEventListener('click', () => {
            const bounds = Exporter.getProjectBounds(this);
            if (bounds) this.canvasEngine.fitToBounds(bounds, 60);
        });

        // Sample Plans Dropdown
        document.getElementById('samplePlansSelect')?.addEventListener('change', (e) => {
            if (e.target.value) {
                loadSamplePlan(this, e.target.value);
                this.saveHistory();
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
            const current = this.undoStack[this.undoStack.length - 1];
            Exporter.exportJSON(current, 'house_plan.json');
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
                try {
                    const loaded = JSON.parse(evt.target.result);
                    this.restoreState(loaded);
                    this.saveHistory();
                } catch (err) {
                    alert('Invalid JSON project file.');
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

    updateToolSubOptions() {
        const subBar = document.getElementById('toolSubBar');
        if (!subBar) return;

        if (this.activeTool === 'wall') {
            subBar.style.display = 'flex';
            subBar.innerHTML = `
                <span class="sub-label">Wall Thickness:</span>
                <button class="sub-btn ${this.wallManager.currentThickness === 9 ? 'active' : ''}" id="wallExtBtn">Exterior 9" (230mm)</button>
                <button class="sub-btn ${this.wallManager.currentThickness === 4.5 ? 'active' : ''}" id="wallIntBtn">Interior 4.5" (115mm)</button>
            `;
            document.getElementById('wallExtBtn').onclick = () => {
                this.wallManager.currentThickness = 9;
                this.wallManager.currentType = 'exterior';
                this.updateToolSubOptions();
            };
            document.getElementById('wallIntBtn').onclick = () => {
                this.wallManager.currentThickness = 4.5;
                this.wallManager.currentType = 'interior';
                this.updateToolSubOptions();
            };
        } else if (this.activeTool === 'column') {
            subBar.style.display = 'flex';
            let html = '<span class="sub-label">RCC Column Size:</span>';
            COLUMN_PRESETS.forEach((p, idx) => {
                const active = this.activeColumnPresetIndex === idx ? 'active' : '';
                html += `<button class="sub-btn ${active}" data-cidx="${idx}">${p.name}</button>`;
            });
            html += '<span style="color:var(--border-color); margin: 0 4px;">|</span>';
            html += `<button class="sub-btn" id="colRot90Btn" title="Rotate 90°">↻ Rotate (${this.activeColumnRotation || 0}°)</button>`;
            subBar.innerHTML = html;

            subBar.querySelectorAll('button[data-cidx]').forEach(b => {
                b.onclick = () => {
                    this.activeColumnPresetIndex = parseInt(b.dataset.cidx);
                    this.updateToolSubOptions();
                };
            });
            document.getElementById('colRot90Btn').onclick = () => {
                this.activeColumnRotation = ((this.activeColumnRotation || 0) + 90) % 360;
                this.updateToolSubOptions();
            };
        } else if (this.activeTool === 'door') {
            subBar.style.display = 'flex';
            subBar.innerHTML = `
                <span class="sub-label">Door Type:</span>
                <button class="sub-btn ${this.doorSubtype === 'single' ? 'active' : ''}" id="doorSingleBtn">Single Swing (3')</button>
                <button class="sub-btn ${this.doorSubtype === 'double' ? 'active' : ''}" id="doorDoubleBtn">Double Swing (5')</button>
                <button class="sub-btn ${this.doorSubtype === 'sliding' ? 'active' : ''}" id="doorSlidingBtn">Sliding (6')</button>
                <button class="sub-btn ${this.doorSubtype === 'arch' ? 'active' : ''}" id="doorArchBtn">Arch Opening</button>
            `;
            document.getElementById('doorSingleBtn').onclick = () => { this.doorSubtype = 'single'; this.activeDoorWidth = 36; this.updateToolSubOptions(); };
            document.getElementById('doorDoubleBtn').onclick = () => { this.doorSubtype = 'double'; this.activeDoorWidth = 60; this.updateToolSubOptions(); };
            document.getElementById('doorSlidingBtn').onclick = () => { this.doorSubtype = 'sliding'; this.activeDoorWidth = 72; this.updateToolSubOptions(); };
            document.getElementById('doorArchBtn').onclick = () => { this.doorSubtype = 'arch'; this.activeDoorWidth = 42; this.updateToolSubOptions(); };
        } else if (this.activeTool === 'gate') {
            subBar.style.display = 'flex';
            subBar.innerHTML = `
                <span class="sub-label">Gate Type:</span>
                <button class="sub-btn ${this.gateSubtype === 'sliding' ? 'active' : ''}" id="gateSlidingBtn">Sliding Gate</button>
                <button class="sub-btn ${this.gateSubtype === 'swing' ? 'active' : ''}" id="gateSwingBtn">Double Swing Gate</button>
                <span style="color:var(--border-color); margin: 0 4px;">|</span>
                <span class="sub-label">Width:</span>
                <button class="sub-btn ${this.activeGateWidth === 96 ? 'active' : ''}" data-gw="96">8 ft</button>
                <button class="sub-btn ${this.activeGateWidth === 120 ? 'active' : ''}" data-gw="120">10 ft (Standard)</button>
                <button class="sub-btn ${this.activeGateWidth === 144 ? 'active' : ''}" data-gw="144">12 ft</button>
                <button class="sub-btn ${this.activeGateWidth === 180 ? 'active' : ''}" data-gw="180">15 ft</button>
            `;
            document.getElementById('gateSlidingBtn').onclick = () => { this.gateSubtype = 'sliding'; this.updateToolSubOptions(); };
            document.getElementById('gateSwingBtn').onclick = () => { this.gateSubtype = 'swing'; this.updateToolSubOptions(); };
            subBar.querySelectorAll('button[data-gw]').forEach(b => {
                b.onclick = () => {
                    this.activeGateWidth = parseInt(b.dataset.gw);
                    this.updateToolSubOptions();
                };
            });
        } else if (this.activeTool === 'furniture') {
            subBar.style.display = 'flex';
            if (!this.activeFurnitureCategory) this.activeFurnitureCategory = 'Kitchen';
            const categories = ['All', 'Kitchen', 'Bedroom', 'Living', 'Dining', 'Sanitary', 'Outdoor'];

            let html = '<span class="sub-label">Category:</span>';
            for (const cat of categories) {
                html += `<button class="sub-btn ${this.activeFurnitureCategory === cat ? 'active' : ''}" data-cat="${cat}" style="font-size:11px; padding:2px 8px;">${cat}</button>`;
            }
            html += '<span style="color:var(--border-color); margin: 0 4px;">|</span>';
            html += '<span class="sub-label">Symbol:</span>';

            const filtered = this.activeFurnitureCategory === 'All' 
                ? FURNITURE_CATALOG 
                : FURNITURE_CATALOG.filter(f => f.category === this.activeFurnitureCategory);

            for (const f of filtered) {
                html += `<button class="sub-btn ${this.activeFurnitureType === f.id ? 'active' : ''}" data-fid="${f.id}">${f.name}</button>`;
            }
            subBar.innerHTML = html;

            subBar.querySelectorAll('button[data-cat]').forEach(b => {
                b.onclick = () => {
                    this.activeFurnitureCategory = b.dataset.cat;
                    const catItems = this.activeFurnitureCategory === 'All' 
                        ? FURNITURE_CATALOG 
                        : FURNITURE_CATALOG.filter(f => f.category === this.activeFurnitureCategory);
                    if (catItems.length > 0 && !catItems.some(f => f.id === this.activeFurnitureType)) {
                        this.activeFurnitureType = catItems[0].id;
                    }
                    this.updateToolSubOptions();
                };
            });

            subBar.querySelectorAll('button[data-fid]').forEach(b => {
                b.onclick = () => {
                    this.activeFurnitureType = b.dataset.fid;
                    this.updateToolSubOptions();
                };
            });
        } else if (this.activeTool === 'break_wall') {
            subBar.style.display = 'flex';
            subBar.innerHTML = `
                <span class="sub-label">✂ Break Wall Tool:</span>
                <span class="hint-text" style="margin:0; align-self:center; color:var(--text-main);">Click anywhere along any wall to split it into two independent walls.</span>
            `;
        } else if (this.activeTool === 'road') {
            subBar.style.display = 'flex';
            subBar.innerHTML = `
                <span class="sub-label">Add Road:</span>
                <button class="sub-btn" id="addFrontRoadBtn">+ Front Road</button>
                <button class="sub-btn" id="addRearRoadBtn">+ Rear Road</button>
                <button class="sub-btn" id="addLeftRoadBtn">+ Left Road</button>
                <button class="sub-btn" id="addRightRoadBtn">+ Right Road</button>
                <span style="color:var(--border-color); margin: 0 4px;">|</span>
                <span class="sub-label">Width:</span>
                <button class="sub-btn ${this.activeRoadWidth === 240 ? 'active' : ''}" data-rw="240">20 ft</button>
                <button class="sub-btn ${this.activeRoadWidth === 360 ? 'active' : ''}" data-rw="360">30 ft</button>
                <button class="sub-btn ${this.activeRoadWidth === 480 ? 'active' : ''}" data-rw="480">40 ft</button>
                <button class="sub-btn ${this.activeRoadWidth === 720 ? 'active' : ''}" data-rw="720">60 ft</button>
            `;
            const setupRoadBtn = (btnId, side, defaultName) => {
                document.getElementById(btnId)?.addEventListener('click', () => {
                    const road = this.roadManager.addRoad({ side, width: this.activeRoadWidth, name: defaultName });
                    this.clearSelection();
                    this.selectedCategory = 'road';
                    this.selectedObject = road;
                    this.roadManager.selectedRoadId = road.id;
                    this.saveHistory();
                    this.updateInspector();
                });
            };
            setupRoadBtn('addFrontRoadBtn', 'front', 'Front Entry Road');
            setupRoadBtn('addRearRoadBtn', 'rear', 'Rear Service Road');
            setupRoadBtn('addLeftRoadBtn', 'left', 'West Cross Road');
            setupRoadBtn('addRightRoadBtn', 'right', 'East Cross Road');

            subBar.querySelectorAll('button[data-rw]').forEach(b => {
                b.onclick = () => {
                    this.activeRoadWidth = parseInt(b.dataset.rw);
                    this.updateToolSubOptions();
                };
            });
        } else if (this.activeTool === 'stairs') {
            subBar.style.display = 'flex';
            const isDogleg = this.activeStairType === 'dogleg';
            subBar.innerHTML = `
                <span class="sub-label">Stair Type:</span>
                <button class="sub-btn ${isDogleg && this.activeStairLandingSteps === 3 ? 'active' : ''}" data-stype="dogleg" data-slanding="3">Dog-Legged (Winders)</button>
                <button class="sub-btn ${isDogleg && this.activeStairLandingSteps === 0 ? 'active' : ''}" data-stype="dogleg" data-slanding="0">Dog-Legged (Flat)</button>
                <button class="sub-btn ${this.activeStairType === 'open_well' ? 'active' : ''}" data-stype="open_well">Open-Well (3 Flights)</button>
                <button class="sub-btn ${this.activeStairType === 'straight' ? 'active' : ''}" data-stype="straight">Straight Flight</button>
                <button class="sub-btn ${this.activeStairType === 'l_shape' ? 'active' : ''}" data-stype="l_shape">L-Shaped</button>
                <button class="sub-btn ${this.activeStairType === 'spiral' ? 'active' : ''}" data-stype="spiral">Spiral</button>
                <span style="color:var(--border-color); margin: 0 4px;">|</span>
                <span class="sub-label">Flight Width:</span>
                <button class="sub-btn ${this.activeStairFlightWidth === 36 ? 'active' : ''}" data-sfw="36">3' - 0"</button>
                <button class="sub-btn ${this.activeStairFlightWidth === 42 ? 'active' : ''}" data-sfw="42">3' - 6"</button>
                <button class="sub-btn ${this.activeStairFlightWidth === 48 ? 'active' : ''}" data-sfw="48">4' - 0"</button>
            `;
            subBar.querySelectorAll('button[data-stype]').forEach(b => {
                b.onclick = () => {
                    this.activeStairType = b.dataset.stype;
                    if (b.dataset.slanding !== undefined) {
                        this.activeStairLandingSteps = parseInt(b.dataset.slanding);
                    }
                    this.updateToolSubOptions();
                };
            });
            subBar.querySelectorAll('button[data-sfw]').forEach(b => {
                b.onclick = () => {
                    this.activeStairFlightWidth = parseInt(b.dataset.sfw);
                    this.updateToolSubOptions();
                };
            });
        } else if (this.activeTool === 'compound_wall') {
            subBar.style.display = 'flex';
            subBar.innerHTML = `
                <span class="sub-label">Compound Wall:</span>
                <button class="sub-btn ${this.compoundWallThickness === 4.5 ? 'active' : ''}" data-cwt="4.5">4.5" Brick</button>
                <button class="sub-btn ${this.compoundWallThickness === 6 ? 'active' : ''}" data-cwt="6">6" Block (Standard)</button>
                <button class="sub-btn ${this.compoundWallThickness === 9 ? 'active' : ''}" data-cwt="9">9" Masonry</button>
                <span style="color:var(--border-color); margin: 0 4px;">|</span>
                <button class="sub-btn highlight" id="autoPlotCompoundBtn" title="Automatically build 4 compound perimeter walls around plot with main gate">⚡ Erect Plot Boundary Walls</button>
            `;
            subBar.querySelectorAll('button[data-cwt]').forEach(b => {
                b.onclick = () => {
                    this.compoundWallThickness = parseFloat(b.dataset.cwt);
                    this.updateToolSubOptions();
                };
            });
            document.getElementById('autoPlotCompoundBtn').onclick = () => {
                if (!this.plotManager.plot) {
                    alert('Please create or define a plot boundary first.');
                    return;
                }
                const b = this.plotManager.getBounds();
                if (b) {
                    const res = this.wallManager.createCompoundWallPerimeter(b, {
                        thickness: this.compoundWallThickness || 6,
                        openingManager: this.openingManager,
                        gateWidth: 120
                    });
                    this.saveHistory();
                    this.render();
                    const pill = document.getElementById('autosaveStatus');
                    if (pill) {
                        pill.innerHTML = `● Plot Compound Wall Erected`;
                        pill.style.color = '#38bdf8';
                    }
                }
            };
        } else if (this.activeTool === 'landscape') {
            subBar.style.display = 'flex';
            if (!this.activeLandscapeCategory) this.activeLandscapeCategory = 'All';
            const categories = ['All', 'Trees', 'Hardscape', 'Vehicles'];

            let html = '<span class="sub-label">Landscape:</span>';
            for (const cat of categories) {
                html += `<button class="sub-btn ${this.activeLandscapeCategory === cat ? 'active' : ''}" data-lcat="${cat}" style="font-size:11px; padding:2px 8px;">${cat}</button>`;
            }
            html += '<span style="color:var(--border-color); margin: 0 4px;">|</span>';

            const landscapeItems = [
                { id: 'tree_deciduous', name: '🌳 Canopy Tree', cat: 'Trees' },
                { id: 'tree_palm', name: '🌴 Palm Tree', cat: 'Trees' },
                { id: 'shrub_bush', name: '🌿 Bush / Hedge', cat: 'Trees' },
                { id: 'planter_box', name: '🪴 Planter Bed', cat: 'Hardscape' },
                { id: 'lawn_patch', name: '🌱 Lawn Patch', cat: 'Hardscape' },
                { id: 'driveway_pavers', name: '🧱 Pavers', cat: 'Hardscape' },
                { id: 'car_suv', name: '🚙 SUV', cat: 'Vehicles' },
                { id: 'motorcycle', name: '🏍 Scooter', cat: 'Vehicles' }
            ];

            const filtered = this.activeLandscapeCategory === 'All'
                ? landscapeItems
                : landscapeItems.filter(i => i.cat === this.activeLandscapeCategory);

            for (const item of filtered) {
                const active = (this.activeLandscapeType === item.id) ? 'active' : '';
                html += `<button class="sub-btn ${active}" data-lid="${item.id}">${item.name}</button>`;
            }

            html += '<span style="color:var(--border-color); margin: 0 4px;">|</span>';
            const washActive = this.plotManager.showLandscapeWash ? 'active' : '';
            html += `<button class="sub-btn ${washActive}" id="toggleLawnWashSubBtn" title="Toggle architectural watercolor grass wash across open setback yard">🌿 Setback Lawn Wash</button>`;

            subBar.innerHTML = html;

            subBar.querySelectorAll('button[data-lcat]').forEach(b => {
                b.onclick = () => {
                    this.activeLandscapeCategory = b.dataset.lcat;
                    const catItems = this.activeLandscapeCategory === 'All'
                        ? landscapeItems
                        : landscapeItems.filter(i => i.cat === this.activeLandscapeCategory);
                    if (catItems.length > 0 && !catItems.some(i => i.id === this.activeLandscapeType)) {
                        this.activeLandscapeType = catItems[0].id;
                    }
                    this.updateToolSubOptions();
                };
            });

            subBar.querySelectorAll('button[data-lid]').forEach(b => {
                b.onclick = () => {
                    this.activeLandscapeType = b.dataset.lid;
                    this.updateToolSubOptions();
                };
            });

            document.getElementById('toggleLawnWashSubBtn')?.addEventListener('click', () => {
                this.plotManager.showLandscapeWash = !this.plotManager.showLandscapeWash;
                this.saveHistory();
                this.updateToolSubOptions();
                this.updateInspector();
                this.render();
            });
        } else {
            subBar.style.display = 'none';
        }
    }

    /**
     * Update Right-Side Properties Inspector Panel
     */
    updateInspector() {
        const panel = document.getElementById('inspectorBody');
        if (!panel) return;

        if (!this.selectedObject) {
            // Default: Project Overview & Site Metrics
            let totalPlotArea = '0 Sq Ft';
            let plotBoundsW = '0"';
            let plotBoundsH = '0"';

            if (this.plotManager.plot) {
                const b = this.plotManager.getBounds();
                totalPlotArea = units.formatArea(this.plotManager.getArea()).primary;
                plotBoundsW = units.formatLength(b.width);
                plotBoundsH = units.formatLength(b.height);
            }

            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>Project Overview</h3>
                    <div class="prop-row">
                        <span class="prop-label">Units</span>
                        <span class="prop-val">${units.getSystem().toUpperCase()}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Plot Size</span>
                        <span class="prop-val">${plotBoundsW} × ${plotBoundsH}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Plot Area</span>
                        <span class="prop-val highlight">${totalPlotArea}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Total Walls</span>
                        <span class="prop-val">${this.wallManager.walls.length}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Rooms</span>
                        <span class="prop-val">${this.roomManager.rooms.length}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Openings</span>
                        <span class="prop-val">${this.openingManager.openings.length}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Fixtures</span>
                        <span class="prop-val">${this.furnitureManager.items.length}</span>
                    </div>
                </div>

                ${this.plotManager.plot ? `
                <div class="inspector-section">
                    <h3>Site Setbacks & Markings</h3>
                    <p class="hint-text">Municipal clear setbacks & annotations:</p>
                    <div class="input-grid" style="margin-bottom:8px;">
                        <div>
                            <label>Front (Road)</label>
                            <input type="text" id="quickSbFront" value="${units.formatLength((this.plotManager.plot.setbacks && this.plotManager.plot.setbacks.front) || 60)}">
                        </div>
                        <div>
                            <label>Rear (Back)</label>
                            <input type="text" id="quickSbRear" value="${units.formatLength((this.plotManager.plot.setbacks && this.plotManager.plot.setbacks.rear) || 36)}">
                        </div>
                        <div>
                            <label>Left (Side 1)</label>
                            <input type="text" id="quickSbLeft" value="${units.formatLength((this.plotManager.plot.setbacks && this.plotManager.plot.setbacks.left) || 36)}">
                        </div>
                        <div>
                            <label>Right (Side 2)</label>
                            <input type="text" id="quickSbRight" value="${units.formatLength((this.plotManager.plot.setbacks && this.plotManager.plot.setbacks.right) || 36)}">
                        </div>
                    </div>

                    <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">Setback Presets:</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:10px;">
                        <button class="sub-btn" id="qSbPresetStd">Standard (5', 3', 3')</button>
                        <button class="sub-btn" id="qSbPresetVilla">Villa (10', 5', 5')</button>
                    </div>

                    <div style="border-top:1px solid var(--border-color); margin: 8px 0; padding-top: 8px; display:flex; flex-direction:column; gap:6px;">
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="toggleChainedDims" ${this.plotManager.showChainedDimensions ? 'checked' : ''}>
                            <span>2-Tier Setback Dimensions</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="toggleCornerMarkers" ${this.plotManager.showCornerMarkers ? 'checked' : ''}>
                            <span>Surveyor Corner Nodes (A-D)</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="toggleSetbackShading" ${this.plotManager.showSetbackShading ? 'checked' : ''}>
                            <span>Buildable Envelope Shading</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="toggleSlabProjection" ${this.plotManager.showSlabProjection ? 'checked' : ''}>
                            <span>Roof Slab Line (Dotted Line)</span>
                        </label>
                        <div id="slabProjDetails" style="display:${this.plotManager.showSlabProjection ? 'flex' : 'none'}; align-items:center; justify-content:space-between; padding-left:22px; font-size:11px;">
                            <span style="color:var(--text-secondary);">Slab Overhang:</span>
                            <input type="text" id="slabProjOffsetInput" value="${units.formatLength(this.plotManager.slabProjectionOffset || 18)}" style="width:80px; padding:2px 6px; font-size:11px; background:var(--bg-panel); border:1px solid var(--border-color); color:var(--text-main); border-radius:4px;">
                        </div>
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="toggleLandscapeWash" ${this.plotManager.showLandscapeWash ? 'checked' : ''}>
                            <span>Landscape Lawn Wash (Yard Greenery)</span>
                        </label>
                    </div>
                </div>
                ` : `
                <div class="inspector-section">
                    <h3>Quick Plot Setup</h3>
                    <p class="hint-text">Set site boundary dimensions:</p>
                    <div class="input-grid">
                        <div>
                            <label>Width</label>
                            <input type="text" id="quickPlotW" value="30'" placeholder="e.g. 30'">
                        </div>
                        <div>
                            <label>Length</label>
                            <input type="text" id="quickPlotH" value="40'" placeholder="e.g. 40'">
                        </div>
                    </div>
                    <button class="action-btn primary" id="applyPlotBtn" style="margin-top:8px; width:100%;">Create Plot Boundary</button>
                </div>
                `}

                <div class="inspector-section">
                    <h3>Drafting Tips</h3>
                    <ul class="tips-list">
                        <li><b>W:</b> Wall tool (click & drag or click-to-click)</li>
                        <li><b>K:</b> Compound / Boundary Wall tool</li>
                        <li><b>L:</b> Landscape & Greenery tool</li>
                        <li><b>D:</b> Door tool (snaps automatically to walls)</li>
                        <li><b>G:</b> Compound Entrance Gate tool</li>
                        <li><b>N:</b> Window tool</li>
                        <li><b>Shift:</b> Hold for straight angle lock (0°, 45°, 90°)</li>
                        <li><b>Space+Drag:</b> Pan canvas smoothly</li>
                        <li><b>Mouse Wheel:</b> Zoom in and out</li>
                    </ul>
                </div>
            `;

            if (!this.plotManager.plot) {
                document.getElementById('applyPlotBtn')?.addEventListener('click', () => {
                    const wText = document.getElementById('quickPlotW').value;
                    const hText = document.getElementById('quickPlotH').value;
                    const wInches = units.parseInput(wText);
                    const hInches = units.parseInput(hText);
                    if (wInches && hInches) {
                        this.plotManager.createRectangularPlot(0, 0, wInches, hInches);
                        this.canvasEngine.fitToBounds(this.plotManager.getBounds(), 60);
                        this.saveHistory();
                        this.updateInspector();
                    } else {
                        alert('Invalid dimension format. Example: 30\' or 10m');
                    }
                });
            } else {
                const applyQuickSb = (newSb) => {
                    this.plotManager.setSetbacks(newSb);
                    this.saveHistory();
                    this.updateInspector();
                    this.render();
                };
                document.getElementById('quickSbFront')?.addEventListener('change', (e) => {
                    const val = units.parseInput(e.target.value);
                    if (val !== null && val >= 0) applyQuickSb({ front: val });
                });
                document.getElementById('quickSbRear')?.addEventListener('change', (e) => {
                    const val = units.parseInput(e.target.value);
                    if (val !== null && val >= 0) applyQuickSb({ rear: val });
                });
                document.getElementById('quickSbLeft')?.addEventListener('change', (e) => {
                    const val = units.parseInput(e.target.value);
                    if (val !== null && val >= 0) applyQuickSb({ left: val });
                });
                document.getElementById('quickSbRight')?.addEventListener('change', (e) => {
                    const val = units.parseInput(e.target.value);
                    if (val !== null && val >= 0) applyQuickSb({ right: val });
                });
                document.getElementById('qSbPresetStd')?.addEventListener('click', () => {
                    applyQuickSb({ front: 60, rear: 36, left: 36, right: 36 });
                });
                document.getElementById('qSbPresetVilla')?.addEventListener('click', () => {
                    applyQuickSb({ front: 120, rear: 60, left: 60, right: 60 });
                });

                document.getElementById('toggleChainedDims')?.addEventListener('change', (e) => {
                    this.plotManager.showChainedDimensions = e.target.checked;
                    this.saveHistory();
                    this.render();
                });
                document.getElementById('toggleCornerMarkers')?.addEventListener('change', (e) => {
                    this.plotManager.showCornerMarkers = e.target.checked;
                    this.saveHistory();
                    this.render();
                });
                document.getElementById('toggleSetbackShading')?.addEventListener('change', (e) => {
                    this.plotManager.showSetbackShading = e.target.checked;
                    this.saveHistory();
                    this.render();
                });
                document.getElementById('toggleSlabProjection')?.addEventListener('change', (e) => {
                    this.plotManager.showSlabProjection = e.target.checked;
                    const d = document.getElementById('slabProjDetails');
                    if (d) d.style.display = e.target.checked ? 'flex' : 'none';
                    this.saveHistory();
                    this.render();
                });
                document.getElementById('slabProjOffsetInput')?.addEventListener('change', (e) => {
                    const val = units.parseInput(e.target.value);
                    if (val !== null && val >= 0) {
                        this.plotManager.slabProjectionOffset = val;
                        this.saveHistory();
                        this.render();
                    }
                });
                document.getElementById('toggleLandscapeWash')?.addEventListener('change', (e) => {
                    this.plotManager.showLandscapeWash = e.target.checked;
                    this.saveHistory();
                    this.render();
                });
            }

            return;
        }

        // ==========================================
        // WALL SELECTED
        // ==========================================
        if (this.selectedCategory === 'wall') {
            const w = this.selectedObject;
            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>Wall Properties</h3>
                    <div class="prop-row">
                        <span class="prop-label">Length</span>
                        <div style="display:flex; gap:4px; align-items:center;">
                            <input type="text" id="wallLengthInput" class="prop-input" value="${units.formatLength(w.getLength())}" style="width:82px; font-weight:600;">
                            <button class="sub-btn active" id="applyWallLenBtn" title="Apply new length">Apply</button>
                        </div>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Anchor Point</span>
                        <select id="wallAnchorSelect" class="prop-input" style="width:115px;">
                            <option value="start">Corner 1 (Start)</option>
                            <option value="end">Corner 2 (End)</option>
                            <option value="center">Symmetric (Center)</option>
                        </select>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Type</span>
                        <select id="wallTypeSelect" class="prop-input">
                            <option value="exterior" ${w.type === 'exterior' ? 'selected' : ''}>Exterior (9" / 230mm)</option>
                            <option value="interior" ${w.type === 'interior' ? 'selected' : ''}>Interior (4.5" / 115mm)</option>
                            <option value="compound" ${w.type === 'compound' ? 'selected' : ''}>Compound (6" / 150mm)</option>
                        </select>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Thickness</span>
                        <input type="text" id="wallThickInput" class="prop-input" value="${units.formatLength(w.thickness)}">
                    </div>

                    <div style="display:flex; gap:6px; margin-top:12px;">
                        <button class="action-btn" id="splitMidBtn" style="flex:1;">✂ Split Midpoint</button>
                        <button class="action-btn" id="splitHoverBtn" style="flex:1;" ${this.hoveredWallInfo ? '' : 'disabled'}>✂ Split at Cursor</button>
                    </div>

                    <button class="action-btn danger" id="deleteSelectedBtn" style="margin-top:10px; width:100%;">Delete Wall</button>
                </div>
            `;

            const applyLengthChange = () => {
                const text = document.getElementById('wallLengthInput').value;
                const newLen = units.parseInput(text);
                const anchor = document.getElementById('wallAnchorSelect').value;
                if (newLen && newLen >= 6) {
                    this.wallManager.setWallLength(w.id, newLen, anchor);
                    this.saveHistory();
                    this.updateInspector();
                } else {
                    alert('Please enter a valid length (e.g. 14\' or 14\' 6" or 4.5m).');
                }
            };
            document.getElementById('applyWallLenBtn')?.addEventListener('click', applyLengthChange);
            document.getElementById('wallLengthInput')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') applyLengthChange();
            });

            document.getElementById('splitMidBtn')?.addEventListener('click', () => {
                const mid = w.getMidpoint();
                const res = this.wallManager.splitWall(w.id, mid, this.openingManager);
                if (res) {
                    this.saveHistory();
                    this.selectedCategory = 'wall';
                    this.selectedObject = res.wall1;
                    this.wallManager.selectedWallId = res.wall1.id;
                    this.updateInspector();
                }
            });

            document.getElementById('splitHoverBtn')?.addEventListener('click', () => {
                if (this.hoveredWallInfo && this.hoveredWallInfo.wall.id === w.id) {
                    const res = this.wallManager.splitWall(w.id, this.hoveredWallInfo.point, this.openingManager);
                    if (res) {
                        this.saveHistory();
                        this.selectedCategory = 'wall';
                        this.selectedObject = res.wall1;
                        this.wallManager.selectedWallId = res.wall1.id;
                        this.updateInspector();
                    }
                }
            });

            document.getElementById('wallTypeSelect')?.addEventListener('change', (e) => {
                w.type = e.target.value;
                if (w.type === 'compound') {
                    w.thickness = 6;
                } else {
                    w.thickness = w.type === 'exterior' ? 9 : 4.5;
                }
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('wallThickInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val > 0) {
                    w.thickness = val;
                    this.saveHistory();
                }
            });

            document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.deleteSelected());
            return;
        }

        // ==========================================
        // COLUMN SELECTED
        // ==========================================
        if (this.selectedCategory === 'column') {
            const col = this.selectedObject;
            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>RCC Column Properties</h3>
                    <div class="prop-row">
                        <span class="prop-label">Column ID</span>
                        <input type="text" id="colNameInput" class="prop-input" value="${col.name || 'C1'}" style="width:90px;">
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Standard Preset</span>
                        <select id="colPresetSelect" class="prop-input" style="width:140px; font-size:11px;">
                            ${COLUMN_PRESETS.map((p, idx) => `<option value="${idx}" ${col.width === p.width && col.depth === p.depth ? 'selected' : ''}>${p.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="input-grid" style="margin-top:10px;">
                        <div>
                            <label>Width</label>
                            <input type="text" id="colWInput" value="${units.formatLength(col.width)}">
                        </div>
                        <div>
                            <label>Depth</label>
                            <input type="text" id="colDInput" value="${units.formatLength(col.depth)}">
                        </div>
                    </div>
                    <div class="prop-row" style="margin-top:10px;">
                        <span class="prop-label">Orientation</span>
                        <span class="prop-val highlight">${col.rotation || 0}°</span>
                    </div>
                    <div style="display:flex; gap:8px; margin-top:8px;">
                        <button class="action-btn" id="colRotateBtn" style="flex:1;" title="Rotate 90 degrees (Hotkey: R)">↻ Rotate 90°</button>
                    </div>
                    <div class="prop-row" style="margin-top:10px;">
                        <span class="prop-label">Show Label</span>
                        <input type="checkbox" id="colShowLabelCheck" ${col.showLabel ? 'checked' : ''} style="accent-color:var(--accent-blue); width:16px; height:16px; cursor:pointer;">
                    </div>
                    <button class="action-btn danger" id="deleteColBtn" style="margin-top:14px; width:100%;">Delete Column</button>
                </div>
            `;

            document.getElementById('colNameInput')?.addEventListener('input', (e) => {
                col.name = e.target.value;
                this.saveHistory();
            });
            document.getElementById('colPresetSelect')?.addEventListener('change', (e) => {
                const preset = COLUMN_PRESETS[parseInt(e.target.value)];
                if (preset) {
                    col.width = preset.width;
                    col.depth = preset.depth;
                    this.saveHistory();
                    this.updateInspector();
                }
            });
            document.getElementById('colWInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val >= 4) {
                    col.width = val;
                    this.saveHistory();
                    this.updateInspector();
                }
            });
            document.getElementById('colDInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val >= 4) {
                    col.depth = val;
                    this.saveHistory();
                    this.updateInspector();
                }
            });
            document.getElementById('colRotateBtn')?.addEventListener('click', () => {
                col.rotate(90);
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('colShowLabelCheck')?.addEventListener('change', (e) => {
                col.showLabel = e.target.checked;
                this.saveHistory();
            });
            document.getElementById('deleteColBtn')?.addEventListener('click', () => this.deleteSelected());
            return;
        }

        // ==========================================
        // OPENING (DOOR / WINDOW / GATE) SELECTED
        // ==========================================
        if (this.selectedCategory === 'opening') {
            const op = this.selectedObject;
            const isGate = op.type === 'gate';
            const isDoor = op.type === 'door';
            const titleName = isGate ? 'Compound Gate' : (isDoor ? 'Door' : 'Window');

            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>${titleName} Properties</h3>
                    <div class="prop-row">
                        <span class="prop-label">Width</span>
                        <input type="text" id="opWidthInput" class="prop-input" value="${units.formatLength(op.width)}">
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Subtype</span>
                        ${isGate ? `
                        <select id="gateSubtypeSelect" class="prop-input" style="width:130px; font-size:11px;">
                            <option value="sliding" ${op.subtype === 'sliding' ? 'selected' : ''}>Sliding Gate</option>
                            <option value="swing" ${op.subtype === 'swing' ? 'selected' : ''}>Double Swing</option>
                        </select>
                        ` : `<span class="prop-val">${op.subtype}</span>`}
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Label</span>
                        <input type="text" id="opLabelInput" class="prop-input" value="${op.label || ''}" style="width:80px;">
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Show Dimension</span>
                        <input type="checkbox" id="opShowDimCheck" ${op.showMeasurement ? 'checked' : ''} style="accent-color:var(--accent-blue); width:16px; height:16px; cursor:pointer;">
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Show Label</span>
                        <input type="checkbox" id="opShowLabelCheck" ${op.showLabel ? 'checked' : ''} style="accent-color:var(--accent-blue); width:16px; height:16px; cursor:pointer;">
                    </div>
                    ${(isDoor || isGate) ? `
                    <div class="prop-row">
                        <span class="prop-label">Orientation / Swing</span>
                        <span class="prop-val highlight">${op.flipSwing ? 'Flipped (Side B)' : 'Standard (Side A)'}</span>
                    </div>
                    <div style="display:flex; gap:8px; margin-top:10px;">
                        ${isDoor ? `<button class="action-btn" id="flipHingeBtn" style="flex:1;" title="Toggle hinge side between left and right jambs (Hotkey: H)">Flip Hinge</button>` : ''}
                        <button class="action-btn" id="flipSwingBtn" style="flex:1;" title="Toggle swing direction (Hotkey: R or F)">Flip Swing</button>
                    </div>
                    ` : ''}
                    <button class="action-btn danger" id="deleteSelectedBtn" style="margin-top:12px; width:100%;">Delete ${titleName}</button>
                </div>
            `;

            document.getElementById('opWidthInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val > 12) {
                    op.width = val;
                    this.saveHistory();
                }
            });

            document.getElementById('gateSubtypeSelect')?.addEventListener('change', (e) => {
                op.subtype = e.target.value;
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('opLabelInput')?.addEventListener('input', (e) => {
                op.label = e.target.value;
                this.saveHistory();
            });

            document.getElementById('opShowDimCheck')?.addEventListener('change', (e) => {
                op.showMeasurement = e.target.checked;
                this.saveHistory();
            });

            document.getElementById('opShowLabelCheck')?.addEventListener('change', (e) => {
                op.showLabel = e.target.checked;
                this.saveHistory();
            });

            document.getElementById('flipHingeBtn')?.addEventListener('click', () => {
                this.openingManager.flipHinge(op.id);
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('flipSwingBtn')?.addEventListener('click', () => {
                this.openingManager.flipSwing(op.id);
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.deleteSelected());
            return;
        }

        // ==========================================
        // ROOM SELECTED
        // ==========================================
        if (this.selectedCategory === 'room') {
            const r = this.selectedObject;
            const area = units.formatArea(r.getArea());
            const currentScale = r.labelScale !== undefined ? r.labelScale : 1.0;
            const pct = Math.round(currentScale * 100);
            const rotNorm = ((r.rotation || 0) % 360 + 360) % 360;

            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>Room Inspector</h3>
                    <div class="prop-row">
                        <span class="prop-label">Room Name</span>
                        <input type="text" id="roomNameInput" class="prop-input" value="${r.name}">
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Carpet Area</span>
                        <span class="prop-val highlight">${area.primary}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Alternate</span>
                        <span class="prop-val">${area.secondary}</span>
                    </div>
                    <div class="input-grid" style="margin-top:10px;">
                        <div>
                            <label>Width</label>
                            <input type="text" id="roomWInput" value="${units.formatLength(r.width)}">
                        </div>
                        <div>
                            <label>Height</label>
                            <input type="text" id="roomHInput" value="${units.formatLength(r.height)}">
                        </div>
                    </div>

                    <!-- Room Label Resizing Controls -->
                    <div style="border-top:1px solid var(--border-color); margin: 12px 0 8px 0; padding-top: 10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                            <span class="prop-label" style="font-weight:600; color:#38bdf8;">Label Size</span>
                            <span id="labelScaleVal" style="font-size:12px; font-weight:bold; color:#38bdf8;">${pct}%</span>
                        </div>

                        <!-- Size Preset Buttons -->
                        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:5px; margin-bottom:8px;">
                            <button class="sub-btn ${currentScale <= 0.8 ? 'active' : ''}" id="lblSizeS">Small</button>
                            <button class="sub-btn ${currentScale > 0.8 && currentScale <= 1.15 ? 'active' : ''}" id="lblSizeM">Medium</button>
                            <button class="sub-btn ${currentScale > 1.15 && currentScale <= 1.55 ? 'active' : ''}" id="lblSizeL">Large</button>
                            <button class="sub-btn ${currentScale > 1.55 ? 'active' : ''}" id="lblSizeXL">X-Large</button>
                        </div>

                        <!-- Range Slider with Step Buttons -->
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                            <button class="sub-btn" id="lblScaleDec" title="Decrease Size (Hotkey: [)" style="padding:4px 8px; font-weight:bold;">A-</button>
                            <input type="range" id="labelScaleSlider" min="50" max="250" step="5" value="${pct}" style="flex:1; cursor:pointer;">
                            <button class="sub-btn" id="lblScaleInc" title="Increase Size (Hotkey: ])" style="padding:4px 8px; font-weight:bold;">A+</button>
                        </div>

                        <!-- Display Toggles -->
                        <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
                            <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer; color:var(--text-secondary);">
                                <input type="checkbox" id="showDimCheck" ${r.showDimensions !== false ? 'checked' : ''}>
                                Show Dimensions
                            </label>
                            <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer; color:var(--text-secondary);">
                                <input type="checkbox" id="showAreaCheck" ${r.showArea !== false ? 'checked' : ''}>
                                Show Carpet Area
                            </label>
                        </div>
                    </div>

                    <!-- Room Label Orientation & Rotation Controls -->
                    <div style="border-top:1px solid var(--border-color); margin: 12px 0 8px 0; padding-top: 10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                            <span class="prop-label" style="font-weight:600; color:#38bdf8;">Label Orientation</span>
                            <span id="roomRotVal" style="font-size:12px; font-weight:bold; color:#38bdf8;">${rotNorm}°</span>
                        </div>

                        <!-- Rotation Presets -->
                        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:5px; margin-bottom:8px;">
                            <button class="sub-btn ${rotNorm === 0 ? 'active' : ''}" id="rotPreset0">0°</button>
                            <button class="sub-btn ${rotNorm === 90 ? 'active' : ''}" id="rotPreset90">90°</button>
                            <button class="sub-btn ${rotNorm === 180 ? 'active' : ''}" id="rotPreset180">180°</button>
                            <button class="sub-btn ${rotNorm === 270 ? 'active' : ''}" id="rotPreset270">270°</button>
                        </div>

                        <!-- Quick Rotate Buttons (⟲ -90°, ⟳ +90°, +45°) -->
                        <div style="display:flex; gap:6px; margin-bottom:8px;">
                            <button class="sub-btn" id="roomRotNeg90Btn" style="flex:1;" title="Rotate Counter-Clockwise 90°">⟲ -90°</button>
                            <button class="sub-btn" id="roomRot90Btn" style="flex:1;" title="Rotate Clockwise 90° (Hotkey: R)">⟳ +90°</button>
                            <button class="sub-btn" id="roomRot45Btn" style="flex:1;" title="Rotate Clockwise 45°">+45°</button>
                        </div>

                        <!-- Angle Slider (0 to 360) -->
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                            <span style="font-size:10px; color:var(--text-secondary);">0°</span>
                            <input type="range" id="roomRotSlider" min="0" max="360" step="15" value="${rotNorm}" style="flex:1; cursor:pointer;">
                            <span style="font-size:10px; color:var(--text-secondary);">360°</span>
                        </div>
                    </div>

                    <!-- Room Tag Style: Pill Badge vs Clean Floating CAD Style -->
                    <div style="border-top:1px solid var(--border-color); margin: 12px 0 8px 0; padding-top: 10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                            <span class="prop-label" style="font-weight:600; color:#38bdf8;">Tag Style</span>
                            <span class="prop-val highlight">${r.tagStyle === 'clean' ? 'Clean Floating' : 'Pill Badge'}</span>
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; margin-bottom:8px;">
                            <button class="sub-btn ${r.tagStyle !== 'clean' ? 'active' : ''}" id="roomTagPillBtn">🏷 Pill Badge</button>
                            <button class="sub-btn ${r.tagStyle === 'clean' ? 'active' : ''}" id="roomTagCleanBtn">📄 Clean Floating</button>
                        </div>
                        <button class="action-btn" id="applyCleanAllRoomsBtn" style="width:100%; font-size:11px; padding:4px;" title="Switch all room tags to clean floating CAD style">Apply Clean Style to All Rooms</button>
                    </div>

                    <!-- Ceiling, Volume & Slab Markings -->
                    <div style="border-top:1px solid var(--border-color); margin: 12px 0 8px 0; padding-top: 10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                            <span class="prop-label" style="font-weight:600; color:#38bdf8;">Ceiling & Slab Markings</span>
                            <span class="prop-val highlight" id="roomVolumeBadge">${r.isDoubleHeight ? 'Double Height' : r.isVoid ? 'Slab Cutout' : r.dottedSlabLine ? 'Dotted Slab' : 'Standard 10\''}</span>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px;">
                            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; color:var(--text-main); font-weight:500;">
                                <input type="checkbox" id="doubleHeightCheck" ${r.isDoubleHeight ? 'checked' : ''}>
                                <span>✦ Double Height Ceiling</span>
                            </label>

                            <div id="doubleHeightDetails" style="display:${r.isDoubleHeight ? 'block' : 'none'}; padding-left:22px;">
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
                                    <span style="font-size:11px; color:var(--text-secondary);">Clear Height:</span>
                                    <input type="text" id="ceilingHeightInput" value="${units.formatLength(r.ceilingHeight || 240)}" style="width:95px; padding:3px 8px; font-size:12px; background:var(--bg-panel); border:1px solid var(--border-color); color:var(--text-main); border-radius:4px;">
                                </div>
                                <div style="font-size:11px; color:#38bdf8; line-height:1.3;">
                                    Extends through 2 floors. Displays volume tag and corner brackets on plan.
                                </div>
                            </div>

                            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; color:var(--text-main); font-weight:500;">
                                <input type="checkbox" id="voidCutoutCheck" ${r.isVoid ? 'checked' : ''}>
                                <span>☒ Slab Cutout / Open to Below</span>
                            </label>
                            <div id="voidCutoutDetails" style="display:${r.isVoid ? 'block' : 'none'}; padding-left:22px; font-size:11px; color:var(--text-secondary); line-height:1.3;">
                                <div>Architectural diagonal cross (X) representing floor void / upper level cutout.</div>
                                <label style="display:flex; align-items:center; gap:6px; margin-top:5px; font-size:11px; color:var(--text-main); cursor:pointer;">
                                    <input type="checkbox" id="voidDottedPerimeterCheck" ${r.dottedCutoutPerimeter ? 'checked' : ''}>
                                    <span>╌ Dotted Line Cutout Perimeter</span>
                                </label>
                            </div>

                            <!-- Dotted Line to Slab Markings / Projection -->
                            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; color:var(--text-main); font-weight:500;">
                                <input type="checkbox" id="dottedSlabCheck" ${r.dottedSlabLine ? 'checked' : ''}>
                                <span>╌ Dotted Line Slab Marking</span>
                            </label>
                            <div id="dottedSlabDetails" style="display:${r.dottedSlabLine ? 'block' : 'none'}; padding-left:22px; font-size:11px; color:var(--text-secondary); line-height:1.3;">
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
                                    <span style="font-size:11px; color:var(--text-secondary);">Slab Overhang / Offset:</span>
                                    <input type="text" id="slabOffsetInput" value="${units.formatLength(r.slabOffset || 0)}" style="width:95px; padding:3px 8px; font-size:12px; background:var(--bg-panel); border:1px solid var(--border-color); color:var(--text-main); border-radius:4px;">
                                </div>
                                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:4px; margin-bottom:6px;">
                                    <button class="sub-btn" id="slabOffPreset0">Flush 0'</button>
                                    <button class="sub-btn" id="slabOffPreset18">1'-6"</button>
                                    <button class="sub-btn" id="slabOffPreset24">2'-0"</button>
                                    <button class="sub-btn" id="slabOffPreset36">3'-0"</button>
                                </div>
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
                                    <span style="font-size:11px; color:var(--text-secondary);">Line Pattern:</span>
                                    <select id="slabPatternSelect" style="width:110px; padding:3px 6px; font-size:11px; background:var(--bg-panel); border:1px solid var(--border-color); color:var(--text-main); border-radius:4px;">
                                        <option value="dashed" ${r.slabLinePattern === 'dashed' ? 'selected' : ''}>Dashed (╌ ╌)</option>
                                        <option value="dotted" ${r.slabLinePattern === 'dotted' ? 'selected' : ''}>Dotted (······)</option>
                                        <option value="dash_dot" ${r.slabLinePattern === 'dash_dot' ? 'selected' : ''}>Dash-Dot (— · —)</option>
                                    </select>
                                </div>
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                                    <span style="font-size:11px; color:var(--text-secondary);">Slab Tag Note:</span>
                                    <input type="text" id="slabTagNoteInput" value="${r.slabLabel || ''}" placeholder="e.g. SLAB PROJECTION" style="width:110px; padding:3px 6px; font-size:11px; background:var(--bg-panel); border:1px solid var(--border-color); color:var(--text-main); border-radius:4px;">
                                </div>
                            </div>
                        </div>
                    </div>

                    <button class="action-btn danger" id="deleteSelectedBtn" style="margin-top:12px; width:100%;">Delete Room</button>
                </div>
            `;

            document.getElementById('roomNameInput')?.addEventListener('input', (e) => {
                r.name = e.target.value;
                this.saveHistory();
            });

            document.getElementById('roomWInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val > 0) { r.width = val; this.saveHistory(); this.updateInspector(); }
            });

            document.getElementById('roomHInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val > 0) { r.height = val; this.saveHistory(); this.updateInspector(); }
            });

            // Label Size Slider
            const slider = document.getElementById('labelScaleSlider');
            const scaleValSpan = document.getElementById('labelScaleVal');
            slider?.addEventListener('input', (e) => {
                const val = parseInt(e.target.value) / 100;
                r.labelScale = val;
                if (scaleValSpan) scaleValSpan.textContent = `${Math.round(val * 100)}%`;
            });
            slider?.addEventListener('change', () => {
                this.saveHistory();
                this.updateInspector();
            });

            // Preset Buttons
            document.getElementById('lblSizeS')?.addEventListener('click', () => {
                r.labelScale = 0.75;
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('lblSizeM')?.addEventListener('click', () => {
                r.labelScale = 1.0;
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('lblSizeL')?.addEventListener('click', () => {
                r.labelScale = 1.4;
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('lblSizeXL')?.addEventListener('click', () => {
                r.labelScale = 1.8;
                this.saveHistory();
                this.updateInspector();
            });

            // Step Buttons (A- and A+)
            document.getElementById('lblScaleDec')?.addEventListener('click', () => {
                r.labelScale = Math.max(0.5, Math.round(((r.labelScale || 1.0) - 0.1) * 100) / 100);
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('lblScaleInc')?.addEventListener('click', () => {
                r.labelScale = Math.min(2.5, Math.round(((r.labelScale || 1.0) + 0.1) * 100) / 100);
                this.saveHistory();
                this.updateInspector();
            });

            // Rotation controls
            const rotSlider = document.getElementById('roomRotSlider');
            const rotValSpan = document.getElementById('roomRotVal');
            rotSlider?.addEventListener('input', (e) => {
                const deg = parseInt(e.target.value) || 0;
                r.rotation = deg % 360;
                if (rotValSpan) rotValSpan.textContent = `${r.rotation}°`;
            });
            rotSlider?.addEventListener('change', () => {
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('rotPreset0')?.addEventListener('click', () => {
                r.rotation = 0;
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('rotPreset90')?.addEventListener('click', () => {
                r.rotation = 90;
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('rotPreset180')?.addEventListener('click', () => {
                r.rotation = 180;
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('rotPreset270')?.addEventListener('click', () => {
                r.rotation = 270;
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('roomRotNeg90Btn')?.addEventListener('click', () => {
                r.rotate(-90);
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('roomRot90Btn')?.addEventListener('click', () => {
                r.rotate(90);
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('roomRot45Btn')?.addEventListener('click', () => {
                r.rotate(45);
                this.saveHistory();
                this.updateInspector();
            });

            // Toggles
            document.getElementById('showDimCheck')?.addEventListener('change', (e) => {
                r.showDimensions = e.target.checked;
                this.saveHistory();
            });
            document.getElementById('showAreaCheck')?.addEventListener('change', (e) => {
                r.showArea = e.target.checked;
                this.saveHistory();
            });

            // Tag Style Toggles
            document.getElementById('roomTagPillBtn')?.addEventListener('click', () => {
                r.tagStyle = 'pill';
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('roomTagCleanBtn')?.addEventListener('click', () => {
                r.tagStyle = 'clean';
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('applyCleanAllRoomsBtn')?.addEventListener('click', () => {
                this.roomManager.rooms.forEach(rm => rm.tagStyle = 'clean');
                this.saveHistory();
                this.updateInspector();
            });

            // Ceiling & Double Height Controls
            document.getElementById('doubleHeightCheck')?.addEventListener('change', (e) => {
                r.isDoubleHeight = e.target.checked;
                if (r.isDoubleHeight) {
                    r.isVoid = false;
                    r.ceilingHeight = r.ceilingHeight || 240;
                }
                this.saveHistory();
                this.updateInspector();
                this.render();
            });

            document.getElementById('ceilingHeightInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val > 0) {
                    r.ceilingHeight = val;
                    this.saveHistory();
                    this.updateInspector();
                    this.render();
                }
            });

            document.getElementById('voidCutoutCheck')?.addEventListener('change', (e) => {
                r.isVoid = e.target.checked;
                if (r.isVoid) {
                    r.isDoubleHeight = false;
                    if (!r.name || r.name === 'Room' || r.name === 'Living Room') {
                        r.name = 'Open to Below';
                    }
                }
                this.saveHistory();
                this.updateInspector();
                this.render();
            });

            document.getElementById('voidDottedPerimeterCheck')?.addEventListener('change', (e) => {
                r.dottedCutoutPerimeter = e.target.checked;
                this.saveHistory();
                this.render();
            });

            document.getElementById('dottedSlabCheck')?.addEventListener('change', (e) => {
                r.dottedSlabLine = e.target.checked;
                this.saveHistory();
                this.updateInspector();
                this.render();
            });

            document.getElementById('slabOffsetInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) {
                    r.slabOffset = val;
                    this.saveHistory();
                    this.updateInspector();
                    this.render();
                }
            });

            const setSlabOff = (inInches) => {
                r.slabOffset = inInches;
                this.saveHistory();
                this.updateInspector();
                this.render();
            };
            document.getElementById('slabOffPreset0')?.addEventListener('click', () => setSlabOff(0));
            document.getElementById('slabOffPreset18')?.addEventListener('click', () => setSlabOff(18));
            document.getElementById('slabOffPreset24')?.addEventListener('click', () => setSlabOff(24));
            document.getElementById('slabOffPreset36')?.addEventListener('click', () => setSlabOff(36));

            document.getElementById('slabPatternSelect')?.addEventListener('change', (e) => {
                r.slabLinePattern = e.target.value;
                this.saveHistory();
                this.render();
            });

            document.getElementById('slabTagNoteInput')?.addEventListener('input', (e) => {
                r.slabLabel = e.target.value;
                this.saveHistory();
                this.render();
            });

            document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.deleteSelected());
            return;
        }

        // ==========================================
        // FURNITURE SELECTED
        // ==========================================
        if (this.selectedCategory === 'furniture') {
            const item = this.selectedObject;
            const catalogItem = FURNITURE_CATALOG.find(c => c.id === item.typeId);
            const defaultW = catalogItem ? catalogItem.width : 36;
            const defaultH = catalogItem ? catalogItem.height : 36;
            const isCustomSize = Math.abs(item.width - defaultW) > 0.5 || Math.abs(item.height - defaultH) > 0.5;

            // Generate category-specific quick preset pills
            let presetsHtml = '';
            if (item.typeId.startsWith('bed')) {
                presetsHtml = `
                    <div style="margin-top:8px;">
                        <span class="prop-label" style="font-size:11px; color:#94a3b8;">Bed Presets:</span>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 76) < 1 && Math.abs(item.height - 84) < 1 ? 'active' : ''}" data-w="76" data-h="84">King (6'4"×7')</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 60) < 1 && Math.abs(item.height - 80) < 1 ? 'active' : ''}" data-w="60" data-h="80">Queen (5'×6'8")</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 48) < 1 && Math.abs(item.height - 75) < 1 ? 'active' : ''}" data-w="48" data-h="75">Double (4'×6'3")</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 36) < 1 && Math.abs(item.height - 75) < 1 ? 'active' : ''}" data-w="36" data-h="75">Single (3'×6'3")</button>
                        </div>
                    </div>
                `;
            } else if (item.typeId === 'wardrobe') {
                presetsHtml = `
                    <div style="margin-top:8px;">
                        <span class="prop-label" style="font-size:11px; color:#94a3b8;">Wardrobe Width:</span>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 48) < 1 ? 'active' : ''}" data-w="48" data-h="24">4 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 60) < 1 ? 'active' : ''}" data-w="60" data-h="24">5 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 72) < 1 ? 'active' : ''}" data-w="72" data-h="24">6 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 96) < 1 ? 'active' : ''}" data-w="96" data-h="24">8 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 120) < 1 ? 'active' : ''}" data-w="120" data-h="24">10 ft</button>
                        </div>
                    </div>
                `;
            } else if (item.typeId.startsWith('sofa') || item.typeId === 'armchair') {
                presetsHtml = `
                    <div style="margin-top:8px;">
                        <span class="prop-label" style="font-size:11px; color:#94a3b8;">Sofa Presets:</span>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 84) < 1 ? 'active' : ''}" data-w="84" data-h="36">3-Seater (7')</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 60) < 1 ? 'active' : ''}" data-w="60" data-h="34">2-Seater (5')</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 34) < 1 ? 'active' : ''}" data-w="34" data-h="34">Armchair</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 96) < 1 ? 'active' : ''}" data-w="96" data-h="36">4-Seater (8')</button>
                        </div>
                    </div>
                `;
            } else if (item.typeId.startsWith('dining')) {
                presetsHtml = `
                    <div style="margin-top:8px;">
                        <span class="prop-label" style="font-size:11px; color:#94a3b8;">Dining Presets:</span>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 84) < 1 ? 'active' : ''}" data-w="84" data-h="42">8-Seater (7'×3'6")</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 66) < 1 ? 'active' : ''}" data-w="66" data-h="38">6-Seater (5'6"×3'2")</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 42) < 1 ? 'active' : ''}" data-w="42" data-h="38">4-Seater (3'6"×3'2")</button>
                        </div>
                    </div>
                `;
            } else if (item.typeId === 'bathtub' || item.typeId === 'shower') {
                presetsHtml = `
                    <div style="margin-top:8px;">
                        <span class="prop-label" style="font-size:11px; color:#94a3b8;">Bath Presets:</span>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 36) < 1 ? 'active' : ''}" data-w="36" data-h="36">3' × 3'</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 48) < 1 ? 'active' : ''}" data-w="48" data-h="36">4' × 3'</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 60) < 1 ? 'active' : ''}" data-w="60" data-h="32">5' × 2'8"</button>
                        </div>
                    </div>
                `;
            } else if (item.typeId.startsWith('kitchen_counter') || item.typeId === 'kitchen_island') {
                presetsHtml = `
                    <div style="margin-top:8px;">
                        <span class="prop-label" style="font-size:11px; color:#94a3b8;">Counter Length Presets:</span>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 48) < 1 ? 'active' : ''}" data-w="48" data-h="${item.height}">4 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 60) < 1 ? 'active' : ''}" data-w="60" data-h="${item.height}">5 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 72) < 1 ? 'active' : ''}" data-w="72" data-h="${item.height}">6 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 96) < 1 ? 'active' : ''}" data-w="96" data-h="${item.height}">8 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 120) < 1 ? 'active' : ''}" data-w="120" data-h="${item.height}">10 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 144) < 1 ? 'active' : ''}" data-w="144" data-h="${item.height}">12 ft</button>
                        </div>
                    </div>
                    <div style="margin-top:6px;">
                        <span class="prop-label" style="font-size:11px; color:#94a3b8;">Counter Depth:</span>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.height - 24) < 1 ? 'active' : ''}" data-w="${item.width}" data-h="24">24" (Standard)</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.height - 28) < 1 ? 'active' : ''}" data-w="${item.width}" data-h="28">28" (Deep)</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.height - 36) < 1 ? 'active' : ''}" data-w="${item.width}" data-h="36">36" (Island/Bar)</button>
                        </div>
                    </div>
                `;
            }

            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>Fixture Properties</h3>
                    <div class="prop-row">
                        <span class="prop-label">Name</span>
                        <span class="prop-val">${item.name}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Width (W)</span>
                        <input type="text" id="furnWInput" class="prop-input" value="${units.formatLength(item.width)}">
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Depth (D)</span>
                        <input type="text" id="furnHInput" class="prop-input" value="${units.formatLength(item.height)}">
                    </div>
                    ${presetsHtml}
                    ${catalogItem ? `
                    <button class="sub-btn" id="furnResetSizeBtn" style="margin-top:8px; width:100%; font-size:11px; ${isCustomSize ? 'border-color:var(--accent-blue);' : 'opacity:0.6;'}" ${isCustomSize ? '' : 'title="Already catalog size"'}>
                        Reset to Catalog Size (${units.formatLength(defaultW)} × ${units.formatLength(defaultH)})
                    </button>` : ''}
                    <div class="prop-row" style="margin-top:12px;">
                        <span class="prop-label">Rotation</span>
                        <span class="prop-val">${Math.round(item.rotation)}°</span>
                    </div>
                    <div style="display:flex; gap:8px; margin-top:6px;">
                        <button class="action-btn" id="rot90Btn" style="flex:1;">Rotate 90°</button>
                        <button class="action-btn" id="rot45Btn" style="flex:1;">Rotate 45°</button>
                    </div>
                    <div style="background:rgba(15,23,42,0.6); border:1px solid rgba(56,189,248,0.2); border-radius:6px; padding:8px 10px; margin-top:12px; font-size:11px; color:#94a3b8; line-height:1.4;">
                        <span style="color:#38bdf8; font-weight:600;">Drag to Fit:</span> Drag any edge or corner handle on canvas to stretch or fit fixture into wall cavities. Hold <kbd style="background:#1e293b; padding:1px 4px; border-radius:3px;">Alt</kbd> to resize from center.
                    </div>
                    <button class="action-btn danger" id="deleteSelectedBtn" style="margin-top:12px; width:100%;">Delete Item</button>
                </div>
            `;

            document.getElementById('furnWInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val >= 12) {
                    item.width = Math.round(val * 10) / 10;
                    this.saveHistory();
                    this.updateInspector();
                } else {
                    e.target.value = units.formatLength(item.width);
                }
            });

            document.getElementById('furnHInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val >= 12) {
                    item.height = Math.round(val * 10) / 10;
                    this.saveHistory();
                    this.updateInspector();
                } else {
                    e.target.value = units.formatLength(item.height);
                }
            });

            document.querySelectorAll('.furn-preset-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const w = parseFloat(btn.dataset.w);
                    const h = parseFloat(btn.dataset.h);
                    if (w && h) {
                        item.width = w;
                        item.height = h;
                        this.saveHistory();
                        this.updateInspector();
                    }
                });
            });

            document.getElementById('furnResetSizeBtn')?.addEventListener('click', () => {
                if (catalogItem) {
                    item.width = defaultW;
                    item.height = defaultH;
                    this.saveHistory();
                    this.updateInspector();
                }
            });

            document.getElementById('rot90Btn')?.addEventListener('click', () => {
                this.furnitureManager.rotateItem(item.id, 90);
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('rot45Btn')?.addEventListener('click', () => {
                this.furnitureManager.rotateItem(item.id, 45);
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.deleteSelected());
            return;
        }

        // ==========================================
        // ROAD SELECTED
        // ==========================================
        if (this.selectedCategory === 'road') {
            const road = this.selectedObject;
            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>Road / Street Properties</h3>
                    <div class="prop-row">
                        <span class="prop-label">Road Name</span>
                        <input type="text" id="roadNameInput" class="prop-input" value="${road.name}">
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Width</span>
                        <input type="text" id="roadWidthInput" class="prop-input" value="${units.formatLength(road.width)}">
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Position</span>
                        <select id="roadSideSelect" class="prop-input">
                            <option value="front" ${road.side === 'front' ? 'selected' : ''}>Front (South)</option>
                            <option value="rear" ${road.side === 'rear' ? 'selected' : ''}>Rear (North)</option>
                            <option value="left" ${road.side === 'left' ? 'selected' : ''}>Left (West)</option>
                            <option value="right" ${road.side === 'right' ? 'selected' : ''}>Right (East)</option>
                        </select>
                    </div>
                    <button class="action-btn danger" id="deleteSelectedBtn" style="margin-top:12px; width:100%;">Delete Road</button>
                </div>
            `;

            document.getElementById('roadNameInput')?.addEventListener('input', (e) => {
                road.name = e.target.value;
                this.saveHistory();
            });

            document.getElementById('roadWidthInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val >= 60) {
                    road.width = val;
                    this.saveHistory();
                }
            });

            document.getElementById('roadSideSelect')?.addEventListener('change', (e) => {
                road.side = e.target.value;
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.deleteSelected());
            return;
        }

        // ==========================================
        // STAIR SELECTED
        // ==========================================
        if (this.selectedCategory === 'stair') {
            const stair = this.selectedObject;
            const dim = stair.getLocalDimensions();
            const isDogleg = stair.type === 'dogleg' || stair.type === 'dogleg_wide';
            const isOpenWell = stair.type === 'open_well';

            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>Staircase Properties</h3>
                    <div class="prop-row">
                        <span class="prop-label">Stair Type</span>
                        <select id="stairTypeSelect" class="prop-input">
                            <option value="dogleg" ${isDogleg ? 'selected' : ''}>Dog-Legged (U-Turn)</option>
                            <option value="open_well" ${isOpenWell ? 'selected' : ''}>Open-Well (3 Flights)</option>
                            <option value="straight" ${stair.type === 'straight' ? 'selected' : ''}>Straight Flight</option>
                            <option value="l_shape" ${stair.type === 'l_shape' ? 'selected' : ''}>L-Shaped</option>
                            <option value="spiral" ${stair.type === 'spiral' ? 'selected' : ''}>Spiral</option>
                        </select>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Footprint</span>
                        <span class="prop-val highlight">${units.formatLength(dim.width)} × ${units.formatLength(dim.height)}</span>
                    </div>

                    ${isDogleg ? `
                    <div class="prop-row" style="margin-top:10px;">
                        <span class="prop-label">Mid-Landing</span>
                        <select id="stairLandingStepsSelect" class="prop-input">
                            <option value="3" ${stair.landingSteps === 3 ? 'selected' : ''}>3 Steps (2-Turn Winders)</option>
                            <option value="0" ${stair.landingSteps === 0 ? 'selected' : ''}>Flat Landing (No Steps)</option>
                            <option value="2" ${stair.landingSteps === 2 ? 'selected' : ''}>2 Steps (Split Landing)</option>
                            <option value="4" ${stair.landingSteps >= 4 ? 'selected' : ''}>4 Steps (Quarter Winders)</option>
                        </select>
                    </div>
                    ` : ''}

                    ${isOpenWell ? `
                    <div class="input-grid" style="margin-top:10px;">
                        <div>
                            <label>Mid Steps</label>
                            <input type="number" id="stairMidTreadsInput" min="1" max="8" value="${stair.middleTreads || 3}">
                        </div>
                        <div>
                            <label>Well Gap</label>
                            <input type="text" id="stairWellWidthInput" value="${units.formatLength(stair.wellWidth)}">
                        </div>
                    </div>
                    ` : ''}

                    <div class="input-grid" style="margin-top:10px;">
                        <div>
                            <label>Flight Width</label>
                            <input type="text" id="stairWidthInput" value="${units.formatLength(stair.flightWidth)}">
                        </div>
                        <div>
                            <label>Total Steps</label>
                            <input type="number" id="stairTreadsInput" min="4" max="40" value="${stair.treads}">
                        </div>
                    </div>
                    <div class="input-grid" style="margin-top:8px;">
                        <div>
                            <label>Tread Depth</label>
                            <input type="text" id="stairTreadDepthInput" value="${units.formatLength(stair.treadDepth)}">
                        </div>
                        <div>
                            <label>Landing Depth</label>
                            <input type="text" id="stairLandingInput" value="${units.formatLength(stair.landingDepth)}">
                        </div>
                    </div>
                    <div class="prop-row" style="margin-top:10px;">
                        <span class="prop-label">Turn Direction</span>
                        <select id="stairTurnSelect" class="prop-input">
                            <option value="left" ${stair.turnDirection === 'left' ? 'selected' : ''}>Turn Left (CCW)</option>
                            <option value="right" ${stair.turnDirection === 'right' ? 'selected' : ''}>Turn Right (CW)</option>
                        </select>
                    </div>
                    <div class="prop-row" style="margin-top:8px;">
                        <span class="prop-label">Break Line</span>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="stairBreakCheck" ${stair.showBreakLine ? 'checked' : ''}>
                            Floor Cut Break
                        </label>
                    </div>
                    <div class="prop-row" style="margin-top:8px;">
                        <span class="prop-label">Rotation</span>
                        <span class="prop-val">${stair.rotation}°</span>
                    </div>
                    <div style="display:flex; gap:8px; margin-top:10px;">
                        <button class="action-btn" id="stairRot90Btn" style="flex:1;">Rotate 90°</button>
                        <button class="action-btn" id="stairRot45Btn" style="flex:1;">Rotate 45°</button>
                    </div>
                    <button class="action-btn danger" id="deleteSelectedBtn" style="margin-top:12px; width:100%;">Delete Staircase</button>
                </div>
            `;

            document.getElementById('stairTypeSelect')?.addEventListener('change', (e) => {
                stair.type = e.target.value;
                if (stair.type === 'dogleg' && stair.landingSteps === undefined) {
                    stair.landingSteps = 3;
                }
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('stairLandingStepsSelect')?.addEventListener('change', (e) => {
                stair.landingSteps = parseInt(e.target.value);
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('stairMidTreadsInput')?.addEventListener('change', (e) => {
                const val = parseInt(e.target.value);
                if (val >= 1 && val <= 10) {
                    stair.middleTreads = val;
                    this.saveHistory();
                    this.updateInspector();
                }
            });

            document.getElementById('stairWellWidthInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val >= 12) {
                    stair.wellWidth = val;
                    this.saveHistory();
                    this.updateInspector();
                }
            });

            document.getElementById('stairWidthInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val >= 18) {
                    stair.flightWidth = val;
                    this.saveHistory();
                    this.updateInspector();
                }
            });

            document.getElementById('stairTreadsInput')?.addEventListener('change', (e) => {
                const val = parseInt(e.target.value);
                if (val && val >= 4 && val <= 40) {
                    stair.treads = val;
                    this.saveHistory();
                    this.updateInspector();
                }
            });

            document.getElementById('stairTreadDepthInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val >= 6) {
                    stair.treadDepth = val;
                    this.saveHistory();
                    this.updateInspector();
                }
            });

            document.getElementById('stairLandingInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) {
                    stair.landingDepth = val;
                    this.saveHistory();
                    this.updateInspector();
                }
            });

            document.getElementById('stairTurnSelect')?.addEventListener('change', (e) => {
                stair.turnDirection = e.target.value;
                this.saveHistory();
            });

            document.getElementById('stairBreakCheck')?.addEventListener('change', (e) => {
                stair.showBreakLine = e.target.checked;
                this.saveHistory();
            });

            document.getElementById('stairRot90Btn')?.addEventListener('click', () => {
                this.stairManager.rotateStair(stair.id, 90);
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('stairRot45Btn')?.addEventListener('click', () => {
                this.stairManager.rotateStair(stair.id, 45);
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.deleteSelected());
            return;
        }

        // ==========================================
        // PLOT SELECTED
        // ==========================================
        if (this.selectedCategory === 'plot') {
            const b = this.plotManager.getBounds();
            const area = units.formatArea(this.plotManager.getArea());
            const sb = this.plotManager.plot?.setbacks || { front: 60, rear: 36, left: 36, right: 36 };
            const bb = this.plotManager.getBuildableBounds();
            const buildableArea = this.plotManager.getBuildableArea();
            const totalArea = this.plotManager.getArea();
            const coveragePct = totalArea > 0 ? ((buildableArea / totalArea) * 100).toFixed(1) : 0;
            const buildableAreaFormatted = units.formatArea(buildableArea);

            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>Plot Boundary</h3>
                    <div class="prop-row">
                        <span class="prop-label">Total Area</span>
                        <span class="prop-val highlight">${area.primary}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">In Sq Yards</span>
                        <span class="prop-val">${area.secondary}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Plot Dimensions</span>
                        <span class="prop-val">${units.formatLength(b.width)} × ${units.formatLength(b.height)}</span>
                    </div>

                    <div style="border-top:1px solid var(--border-color); margin: 12px 0 8px 0; padding-top: 8px;">
                        <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #38bdf8;">Custom Setbacks</h4>
                        <div class="input-grid" style="margin-bottom:8px;">
                            <div>
                                <label>Front (Road)</label>
                                <input type="text" id="sbFrontInput" value="${units.formatLength(sb.front)}">
                            </div>
                            <div>
                                <label>Rear (Back)</label>
                                <input type="text" id="sbRearInput" value="${units.formatLength(sb.rear)}">
                            </div>
                            <div>
                                <label>Left (Side 1)</label>
                                <input type="text" id="sbLeftInput" value="${units.formatLength(sb.left)}">
                            </div>
                            <div>
                                <label>Right (Side 2)</label>
                                <input type="text" id="sbRightInput" value="${units.formatLength(sb.right)}">
                            </div>
                        </div>

                        <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">Setback Presets:</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:10px;">
                            <button class="sub-btn" id="sbPresetStandard">Standard (5', 3', 3')</button>
                            <button class="sub-btn" id="sbPresetVilla">Villa (10', 5', 5')</button>
                            <button class="sub-btn" id="sbPresetRow">Row House (3', 0', 0')</button>
                            <button class="sub-btn" id="sbPresetEqual">Equal 5' (5', 5', 5')</button>
                        </div>

                        <div class="prop-row">
                            <span class="prop-label">Buildable Envelope</span>
                            <span class="prop-val" style="color:#38bdf8;">${bb ? `${units.formatLength(bb.width)} × ${units.formatLength(bb.height)}` : 'N/A'}</span>
                        </div>
                        <div class="prop-row">
                            <span class="prop-label">Ground Coverage</span>
                            <span class="prop-val highlight">${buildableAreaFormatted.primary} (${coveragePct}%)</span>
                        </div>

                        <div style="border-top:1px solid var(--border-color); margin: 8px 0; padding-top: 8px; display:flex; flex-direction:column; gap:6px;">
                            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                                <input type="checkbox" id="plotChainedDimsCheck" ${this.plotManager.showChainedDimensions ? 'checked' : ''}>
                                <span>2-Tier Setback Dimensions</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                                <input type="checkbox" id="plotCornerMarkersCheck" ${this.plotManager.showCornerMarkers ? 'checked' : ''}>
                                <span>Surveyor Corner Nodes (A-D)</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                                <input type="checkbox" id="plotSetbackShadingCheck" ${this.plotManager.showSetbackShading ? 'checked' : ''}>
                                <span>Buildable Envelope Shading</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                                <input type="checkbox" id="plotSlabProjectionCheck" ${this.plotManager.showSlabProjection ? 'checked' : ''}>
                                <span>Roof Slab Line (Dotted Line)</span>
                            </label>
                            <div id="plotSlabProjDetails" style="display:${this.plotManager.showSlabProjection ? 'flex' : 'none'}; align-items:center; justify-content:space-between; padding-left:22px; font-size:11px;">
                                <span style="color:var(--text-secondary);">Slab Overhang:</span>
                                <input type="text" id="plotSlabProjOffsetInput" value="${units.formatLength(this.plotManager.slabProjectionOffset || 18)}" style="width:80px; padding:2px 6px; font-size:11px; background:var(--bg-panel); border:1px solid var(--border-color); color:var(--text-main); border-radius:4px;">
                            </div>
                            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                                <input type="checkbox" id="plotLandscapeWashCheck" ${this.plotManager.showLandscapeWash ? 'checked' : ''}>
                                <span>Landscape Lawn Wash (Yard Greenery)</span>
                            </label>
                        </div>
                    </div>

                    <div style="border-top:1px solid var(--border-color); margin: 12px 0 8px 0; padding-top: 8px;">
                        <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #facc15;">North Compass</h4>
                        <div class="prop-row">
                            <span class="prop-label">Angle</span>
                            <div style="display:flex; gap:6px; align-items:center;">
                                <input type="range" id="northSlider" min="0" max="360" value="${this.plotManager.northAngle}" style="width:75px;">
                                <input type="number" id="northNumberInput" min="0" max="360" value="${this.plotManager.northAngle}" class="prop-input" style="width:48px;">
                            </div>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px;">
                            <button class="sub-btn" id="presetNorthBtn">North (0°)</button>
                            <button class="sub-btn" id="presetEastBtn">East (90°)</button>
                            <button class="sub-btn" id="presetSouthBtn">South (180°)</button>
                            <button class="sub-btn" id="presetWestBtn">West (270°)</button>
                        </div>
                    </div>

                    <button class="action-btn danger" id="deleteSelectedBtn" style="margin-top:14px; width:100%;">Delete Plot</button>
                </div>
            `;

            const applySetbacks = (newSb) => {
                this.plotManager.setSetbacks(newSb);
                this.saveHistory();
                this.updateInspector();
            };

            document.getElementById('sbFrontInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) applySetbacks({ front: val });
            });
            document.getElementById('sbRearInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) applySetbacks({ rear: val });
            });
            document.getElementById('sbLeftInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) applySetbacks({ left: val });
            });
            document.getElementById('sbRightInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) applySetbacks({ right: val });
            });

            // Presets
            document.getElementById('sbPresetStandard')?.addEventListener('click', () => {
                applySetbacks({ front: 60, rear: 36, left: 36, right: 36 });
            });
            document.getElementById('sbPresetVilla')?.addEventListener('click', () => {
                applySetbacks({ front: 120, rear: 60, left: 60, right: 60 });
            });
            document.getElementById('sbPresetRow')?.addEventListener('click', () => {
                applySetbacks({ front: 36, rear: 0, left: 0, right: 0 });
            });
            document.getElementById('sbPresetEqual')?.addEventListener('click', () => {
                applySetbacks({ front: 60, rear: 60, left: 60, right: 60 });
            });

            const updateCompassAngle = (deg) => {
                this.plotManager.northAngle = (parseInt(deg) + 360) % 360;
                const s = document.getElementById('northSlider');
                const n = document.getElementById('northNumberInput');
                if (s) s.value = this.plotManager.northAngle;
                if (n) n.value = this.plotManager.northAngle;
                this.saveHistory();
            };

            document.getElementById('northSlider')?.addEventListener('input', (e) => updateCompassAngle(e.target.value));
            document.getElementById('northNumberInput')?.addEventListener('change', (e) => updateCompassAngle(e.target.value));
            document.getElementById('presetNorthBtn')?.addEventListener('click', () => updateCompassAngle(0));
            document.getElementById('presetEastBtn')?.addEventListener('click', () => updateCompassAngle(90));
            document.getElementById('presetSouthBtn')?.addEventListener('click', () => updateCompassAngle(180));
            document.getElementById('presetWestBtn')?.addEventListener('click', () => updateCompassAngle(270));

            document.getElementById('plotChainedDimsCheck')?.addEventListener('change', (e) => {
                this.plotManager.showChainedDimensions = e.target.checked;
                this.saveHistory();
                this.render();
            });
            document.getElementById('plotCornerMarkersCheck')?.addEventListener('change', (e) => {
                this.plotManager.showCornerMarkers = e.target.checked;
                this.saveHistory();
                this.render();
            });
            document.getElementById('plotSetbackShadingCheck')?.addEventListener('change', (e) => {
                this.plotManager.showSetbackShading = e.target.checked;
                this.saveHistory();
                this.render();
            });
            document.getElementById('plotSlabProjectionCheck')?.addEventListener('change', (e) => {
                this.plotManager.showSlabProjection = e.target.checked;
                const d = document.getElementById('plotSlabProjDetails');
                if (d) d.style.display = e.target.checked ? 'flex' : 'none';
                this.saveHistory();
                this.render();
            });
            document.getElementById('plotSlabProjOffsetInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) {
                    this.plotManager.slabProjectionOffset = val;
                    this.saveHistory();
                    this.render();
                }
            });
            document.getElementById('plotLandscapeWashCheck')?.addEventListener('change', (e) => {
                this.plotManager.showLandscapeWash = e.target.checked;
                this.saveHistory();
                this.render();
            });

            document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.deleteSelected());
            return;
        }
    }
}

// Bootstrap application on DOM load or immediately if already loaded
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
        window.app = new HousePlannerApp();
    });
} else {
    window.app = new HousePlannerApp();
}
