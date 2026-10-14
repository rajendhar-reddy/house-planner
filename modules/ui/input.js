/**
 * input.js - Keyboard/mouse/touch handling: event binding, drafting clicks, dragging, selection, opening placement.
 *
 * These methods are mixed into HousePlannerApp (see app.js), so `this` is the app.
 */

import { ROOM_PRESETS } from '../rooms.js';
import { COLUMN_PRESETS } from '../columns.js';
import { pickRect, moveItems } from '../transform.js';

export class InputMethods {
    bindEvents() {
        const c = this.canvasElement;

        c.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', (e) => this.handleMouseUp(e));

        // Touch events for mobile/tablet drafting
        const synthesizeMouseEvent = (type, touch, originalEvent) => {
            return {
                clientX: touch.clientX,
                clientY: touch.clientY,
                button: 0,
                buttons: type === 'mouseup' ? 0 : 1,
                shiftKey: originalEvent.shiftKey || false,
                ctrlKey: originalEvent.ctrlKey || false,
                altKey: originalEvent.altKey || false,
                target: c,
                preventDefault: () => originalEvent.preventDefault && originalEvent.preventDefault(),
                stopPropagation: () => originalEvent.stopPropagation && originalEvent.stopPropagation()
            };
        };

        c.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1 && !this.canvasEngine.isTouchPinching) {
                const mouseEv = synthesizeMouseEvent('mousedown', e.touches[0], e);
                this.handleMouseDown(mouseEv);
            }
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && !this.canvasEngine.isTouchPinching) {
                const mouseEv = synthesizeMouseEvent('mousemove', e.touches[0], e);
                this.handleMouseMove(mouseEv);
            }
        }, { passive: true });

        window.addEventListener('touchend', (e) => {
            if (!this.canvasEngine.isTouchPinching) {
                const touch = e.changedTouches[0] || e.touches[0];
                if (touch) {
                    const mouseEv = synthesizeMouseEvent('mouseup', touch, e);
                    this.handleMouseUp(mouseEv);
                }
            }
        });

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

            if (e.key === 'v' || e.key === 'V' || e.key === 'Escape') {
                if (e.key === 'Escape' && this.commandLine) this.commandLine.cancel(false);
                if (e.key === 'Escape' && this.underlayEditing) { this.underlayEditing = false; this.requestRender(); }
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
            } else if (e.key === 'j' || e.key === 'J') {
                this.setTool('slab');
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
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                this.setTool('select');
                this.selectAll();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) this.redo();
                else this.undo();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                this.redo();
            }
        });

        // Leaving the page: flush the autosave first. Only warn when that save did NOT succeed
        // (e.g. storage full or blocked), because then closing the tab really would lose work.
        window.addEventListener('beforeunload', (e) => {
            this.saveToLocalStorage();
            if (this.autosaveFailed) {
                e.preventDefault();
                e.returnValue = 'Your latest changes could not be auto-saved. Use Save (JSON) before leaving, or you will lose them.';
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
            this.pushView();
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

        // A command (MOVE, COPY, ROTATE, MIRROR...) is waiting for a point: this click answers it
        if (this.commandLine && this.commandLine.wantsCanvasPoint() && this.commandLine.canvasPoint({ x: snapped.x, y: snapped.y })) return;

        switch (this.activeTool) {
            case 'select': {
                const scale = this.canvasEngine.scale;

                // Moving the background picture (switched on in the Underlay dialog)
                if (this.underlayEditing && this.underlay && this.underlay.visible && !this.underlay.locked) {
                    this.isDragging = true;
                    this.dragTarget = { type: 'underlay', start: { ...world }, orig: { x: this.underlay.x, y: this.underlay.y } };
                    this.dragHasMoved = false;
                    return;
                }

                // 0. Multi-select: Shift+click adds/removes an object; dragging any selected object moves the whole group
                const pickedItem = this.pickItemAt(world);
                if (e.shiftKey) {
                    if (pickedItem) this.toggleInSelection(pickedItem);
                    return;
                }
                if (this.selection.length > 1 && pickedItem && this.selection.some(it => it.obj === pickedItem.obj)) {
                    this.isDragging = true;
                    this.dragTarget = { type: 'group', start: { ...world }, applied: { x: 0, y: 0 } };
                    this.dragHasMoved = false;
                    return;
                }

                // A single text note / leader / angular dimension: select it and drag it
                if (pickedItem && ['text', 'leader', 'angdim'].includes(pickedItem.category)) {
                    this.clearSelection();
                    this.selectSingle(pickedItem.category, pickedItem.obj);
                    this.updateInspector();
                    this.isDragging = true;
                    this.dragTarget = { type: 'group', items: [pickedItem], start: { ...world }, applied: { x: 0, y: 0 } };
                    this.dragHasMoved = false;
                    return;
                }

                // 1. Check if clicking on compass to rotate
                if (this.plotManager.hitTestCompass(world.x, world.y, scale)) {
                    this.isDragging = true;
                    this.dragTarget = { type: 'compass' };
                    this.dragHasMoved = false;
                    return;
                }

                // 1b. Check if clicking on slab handle
                if (this.slabManager && (this.slabManager.enabled || this.activeTool === 'slab')) {
                    const slabHandle = this.slabManager.hitTestHandles(world.x, world.y, scale);
                    if (slabHandle) {
                        this.isDragging = true;
                        this.dragTarget = {
                            type: 'slab_handle',
                            handle: slabHandle,
                            startX: world.x,
                            startY: world.y
                        };
                        this.dragHasMoved = false;
                        this.selectedCategory = 'slab';
                        this.selectedObject = this.slabManager;
                        this.updateInspector();
                        return;
                    }
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
                // Nothing (or only the background plot/road/slab) was hit: a drag from here draws a selection window
                if (!this.selectedObject || ['plot', 'road', 'slab'].includes(this.selectedCategory)) {
                    this.isDragging = true;
                    this.dragTarget = { type: 'marquee', startWorld: { ...world }, startScreen: { x: screenX, y: screenY }, active: false };
                    this.dragHasMoved = false;
                }
                break;
            }

            case 'slab': {
                const scale = this.canvasEngine.scale;
                if (this.slabManager) {
                    const slabHandle = this.slabManager.hitTestHandles(world.x, world.y, scale);
                    if (slabHandle) {
                        this.isDragging = true;
                        this.dragTarget = {
                            type: 'slab_handle',
                            handle: slabHandle,
                            startX: world.x,
                            startY: world.y
                        };
                        this.dragHasMoved = false;
                        this.selectedCategory = 'slab';
                        this.selectedObject = this.slabManager;
                        this.updateInspector();
                        return;
                    }
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
                this.addDraftPoint('plot_rect', snapped);
                break;

            case 'wall':
                this.addDraftPoint('wall', snapped);
                break;

            case 'compound_wall':
                this.addDraftPoint('compound_wall', snapped);
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
                this.addDraftPoint('dimension', snapped);
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

            if (this.dragTarget.type === 'marquee') {
                this.dragHasMoved = false;                       // selecting is not an edit: nothing for undo
                this.updateMarquee(world, screenX, screenY);
                return;
            }
            if (this.dragTarget.type === 'group') {
                this.dragGroup(world, e.shiftKey);
                return;
            }
            if (this.dragTarget.type === 'underlay') {
                const t = this.dragTarget;
                this.underlay.x = t.orig.x + (world.x - t.start.x);
                this.underlay.y = t.orig.y + (world.y - t.start.y);
                this.requestRender();
                return;
            }

            if (this.dragTarget.type === 'compass') {
                this.plotManager.setCompassAngleFromPoint(world.x, world.y, scale);
                this.updateInspector();
                return;
            }

            if (this.dragTarget.type === 'slab_handle') {
                this.slabManager.handleDrag(this.dragTarget.handle, world.x, world.y, this.dragTarget.startX, this.dragTarget.startY);
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
        if (!this.isDragging && (this.activeTool === 'select' || this.activeTool === 'slab')) {
            let cursorSet = false;

            // 0. Check slab handles
            if (this.slabManager && (this.selectedCategory === 'slab' || this.activeTool === 'slab')) {
                const sh = this.slabManager.hitTestHandles(world.x, world.y, scale);
                if (sh) {
                    if (sh.id === 'front' || sh.id === 'rear') this.canvasElement.style.cursor = 'ns-resize';
                    else if (sh.id === 'left' || sh.id === 'right') this.canvasElement.style.cursor = 'ew-resize';
                    else this.canvasElement.style.cursor = 'pointer';
                    cursorSet = true;
                }
            }

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

        if (this.isDragging && this.dragTarget && this.dragTarget.type === 'marquee') {
            this.finishMarquee();
            this.isDragging = false;
            this.dragTarget = null;
            this.dragHasMoved = false;
            return;
        }

        if (this.isDragging) {
            if (this.dragTarget && this.dragTarget.type === 'slab_handle') {
                if (this.slabManager) this.slabManager.finishDrag();
            }
            if (this.dragHasMoved) {
                this.saveHistory();
            }
            this.isDragging = false;
            this.dragTarget = null;
            this.dragHasMoved = false;
            this.canvasElement.style.cursor = this.canvasEngine.isSpacePressed ? 'grab' : (this.activeTool === 'select' ? 'default' : 'crosshair');
        }
    }

    /**
     * One click (or one typed point) for a tool that works with a start point and an end point:
     * plot rectangle, wall, compound wall and dimension. The mouse and the command line both call this,
     * so a typed distance behaves exactly like a click at that spot.
     * @returns {boolean} true when the point was accepted
     */
    addDraftPoint(tool, point) {
        const pt = { x: point.x, y: point.y };
        if (!this.draftStart) { this.draftStart = pt; return true; }
        if (tool === 'plot_rect') {
            const w = Math.abs(pt.x - this.draftStart.x), h = Math.abs(pt.y - this.draftStart.y);
            const minX = Math.min(this.draftStart.x, pt.x), minY = Math.min(this.draftStart.y, pt.y);
            if (w > 24 && h > 24) {
                this.plotManager.createRectangularPlot(minX, minY, w, h);
                this.saveHistory();
                this.setTool('select');
            }
            this.draftStart = null;
            return true;
        }
        if (tool === 'wall' || tool === 'compound_wall') {
            const compound = tool === 'compound_wall';
            const wall = this.wallManager.addWall(this.draftStart, pt,
                compound ? (this.compoundWallThickness || 6) : this.wallManager.currentThickness,
                compound ? 'compound' : this.wallManager.currentType);
            if (!wall) return false;
            this.saveHistory();
            this.draftStart = { ...pt };               // chain: the next wall starts where this one ended
            return true;
        }
        if (tool === 'dimension') {
            this.dimensionManager.addDimension(this.draftStart, pt, 24);
            this.saveHistory();
            this.draftStart = null;
            this.setTool('select');
            return true;
        }
        return false;
    }

    /** The topmost selectable object under a world point, as { category, obj } (same priority as a normal click). */
    pickItemAt(world) {
        const scale = this.canvasEngine.scale;
        const ann = this.annotationManager;                                   // annotation sits on top of everything else
        const tx = ann.getTextAt(world.x, world.y, scale); if (tx) return { category: 'text', obj: tx };
        const ld = ann.getLeaderAt(world.x, world.y, scale); if (ld) return { category: 'leader', obj: ld };
        const ad = ann.getAngdimAt(world.x, world.y, scale); if (ad) return { category: 'angdim', obj: ad };
        const stair = this.stairManager.hitTest(world.x, world.y);
        if (stair) return { category: 'stair', obj: stair };
        const col = this.columnManager.getColumnAt(world.x, world.y, scale);
        if (col) return { category: 'column', obj: col };
        const fit = this.furnitureManager.getItemAt(world.x, world.y);
        if (fit) return { category: 'furniture', obj: fit };
        const op = this.openingManager.getOpeningAt(world.x, world.y, scale, this.wallManager);
        if (op) return { category: 'opening', obj: op };
        const wall = this.wallManager.getWallAt(world.x, world.y, scale);
        if (wall) return { category: 'wall', obj: wall };
        const room = this.roomManager.getRoomAt(world.x, world.y, scale);
        if (room) return { category: 'room', obj: room };
        const dim = this.dimensionManager.getDimAt(world.x, world.y, scale);
        if (dim) return { category: 'dimension', obj: dim };
        return null;
    }

    /** Shift+click: add the object to the selection, or remove it if it is already selected. */
    toggleInSelection(item) {
        const current = this.getSelectionItems().slice();
        const i = current.findIndex(it => it.obj === item.obj);
        if (i >= 0) current.splice(i, 1); else current.push(item);
        this.setSelection(current);
    }

    /** Rubber-band selection: starts after a 4 px drag so that a plain click still selects the plot/road/slab. */
    updateMarquee(world, screenX, screenY) {
        const t = this.dragTarget;
        if (!t.active) {
            if (Math.hypot(screenX - t.startScreen.x, screenY - t.startScreen.y) < 4) return;
            t.active = true;
            this.clearSelection();                                // starting a window drops the background object that was clicked
        }
        this.marquee = { x1: t.startWorld.x, y1: t.startWorld.y, x2: world.x, y2: world.y };
        this.requestRender();
    }

    /**
     * Left-to-right drag = WINDOW (only objects fully inside); right-to-left = CROSSING (anything touched).
     * Holding Shift when releasing adds to the current selection instead of replacing it.
     */
    finishMarquee() {
        const t = this.dragTarget;
        const m = this.marquee;
        this.marquee = null;
        if (!t || !t.active || !m) { this.requestRender(); return; }          // it was just a click: selection stays as the click set it
        const mode = m.x2 >= m.x1 ? 'window' : 'crossing';
        this.setSelection(pickRect(this, m, mode));
    }

    /** Dragging a group: snaps the whole move to the grid so that selected objects keep their relative spacing. */
    dragGroup(world, noSnap) {
        const t = this.dragTarget;
        let tx = world.x - t.start.x, ty = world.y - t.start.y;
        if (this.canvasEngine.snapToGrid && !noSnap) {
            const a = this.canvasEngine.getGridSnap(world.x, world.y), b = this.canvasEngine.getGridSnap(t.start.x, t.start.y);
            tx = a.x - b.x; ty = a.y - b.y;
        }
        const dx = tx - t.applied.x, dy = ty - t.applied.y;
        if (dx === 0 && dy === 0) return;
        moveItems(this, t.items || this.selection, dx, dy);
        t.applied = { x: tx, y: ty };
        this.requestRender();
    }

    handleSelectClick(worldX, worldY) {
        const scale = this.canvasEngine.scale;

        // -1. Annotation (text, leaders, angular dimensions)
        const annHit = this.pickItemAt({ x: worldX, y: worldY });
        if (annHit && ['text', 'leader', 'angdim'].includes(annHit.category)) {
            this.clearSelection();
            this.selectSingle(annHit.category, annHit.obj);
            this.updateInspector();
            return;
        }

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

        // 6b. Check Roof Slab Projection
        if (this.slabManager && this.slabManager.enabled && this.slabManager.hitTest(worldX, worldY, scale)) {
            this.clearSelection();
            this.selectedCategory = 'slab';
            this.selectedObject = this.slabManager;
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

                const fit = this.openingManager.checkPlacement(wall, proj.t, width);
                if (!fit.ok) {
                    this.setAutosavePill('● ' + fit.reason, '#f59e0b');
                    return;
                }
                const op = this.openingManager.addOpening(wall.id, fit.t, {
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
    /** Mark the canvas as needing a redraw on the next animation frame. */
}
