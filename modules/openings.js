/**
 * openings.js - Architectural Doors & Windows System
 */

import { units } from './units.js';

let openingIdCounter = 1;

export class Opening {
    constructor(wallId, t, options = {}) {
        this.id = `op_${openingIdCounter++}`;
        this.wallId = wallId;
        this.t = Math.max(0.05, Math.min(0.95, t)); // ratio along wall
        this.type = options.type || 'door'; // 'door' | 'window' | 'gate'
        this.subtype = options.subtype || (this.type === 'door' ? 'single' : (this.type === 'gate' ? 'sliding' : 'standard'));
        
        // Dimensions in inches
        this.width = options.width || (this.type === 'door' ? 36 : (this.type === 'gate' ? 120 : 48)); // 36" door, 120" (10ft) gate, 48" window
        this.flipHinge = options.flipHinge || false; // flip hinge side (left / right)
        this.flipSwing = options.flipSwing || false; // flip swing side (inward / outward)
        this.label = options.label !== undefined ? options.label : (this.type === 'door' ? 'D' : (this.type === 'gate' ? 'GATE' : 'W'));
        this.showLabel = options.showLabel || false;
        this.showMeasurement = options.showMeasurement || false;
    }

    /**
     * Get world position and orientation along host wall
     */
    getGeometry(wall) {
        if (!wall) return null;
        const dx = wall.end.x - wall.start.x;
        const dy = wall.end.y - wall.start.y;
        const wallLen = Math.hypot(dx, dy);
        const wallAngle = Math.atan2(dy, dx);

        const cx = wall.start.x + this.t * dx;
        const cy = wall.start.y + this.t * dy;

        return {
            center: { x: cx, y: cy },
            angle: wallAngle,
            wallLen: wallLen,
            thickness: wall.thickness
        };
    }
}

export class OpeningManager {
    constructor() {
        this.openings = [];
        this.selectedOpeningId = null;
    }

    addOpening(wallId, t, options = {}) {
        const op = new Opening(wallId, t, options);
        this.openings.push(op);
        return op;
    }

    removeOpening(id) {
        this.openings = this.openings.filter(o => o.id !== id);
        if (this.selectedOpeningId === id) this.selectedOpeningId = null;
    }

    getOpeningById(id) {
        return this.openings.find(o => o.id === id);
    }

    clear() {
        this.openings = [];
        this.selectedOpeningId = null;
    }

    flipHinge(id) {
        const op = this.getOpeningById(id);
        if (op) op.flipHinge = !op.flipHinge;
    }

    flipSwing(id) {
        const op = this.getOpeningById(id);
        if (op) op.flipSwing = !op.flipSwing;
    }

    /**
     * Render all doors and windows
     */
    render(ctx, scale, wallManager) {
        for (const op of this.openings) {
            const wall = wallManager.getWallById(op.wallId);
            if (!wall) continue;

            const isSelected = op.id === this.selectedOpeningId;
            this.renderSingleOpening(ctx, op, wall, scale, isSelected);
        }
    }

    /**
     * Render a single opening (door, window, or gate) given its host wall
     */
    renderSingleOpening(ctx, op, wall, scale, isSelected = false) {
        if (!wall) return;
        const openingObj = (op instanceof Opening) ? op : Object.assign(new Opening(op.wallId, op.t, op), op);
        const geom = openingObj.getGeometry(wall);
        if (!geom) return;

        ctx.save();
        ctx.translate(geom.center.x, geom.center.y);
        ctx.rotate(geom.angle);

        if (openingObj.type === 'door') {
            this.renderDoor(ctx, openingObj, geom.thickness, scale, isSelected, geom.angle);
        } else if (openingObj.type === 'gate') {
            this.renderGate(ctx, openingObj, geom.thickness, scale, isSelected, geom.angle);
        } else {
            this.renderWindow(ctx, openingObj, geom.thickness, scale, isSelected, geom.angle);
        }

        ctx.restore();
    }

    /**
     * Render Architectural 2D Door
     */
    renderDoor(ctx, door, wallThickness, scale, isSelected, wallAngle = 0) {
        const halfW = door.width / 2;
        const halfT = wallThickness / 2;

        // 1. Clear Wall Opening Cutout
        ctx.fillStyle = '#0f172a'; // canvas background color (mask wall)
        ctx.fillRect(-halfW, -halfT - 1 / scale, door.width, wallThickness + 2 / scale);

        // 2. Door Jambs (frames on each side)
        const jambW = Math.min(2.5, door.width * 0.08); // 2-2.5 inches
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(-halfW, -halfT, jambW, wallThickness);
        ctx.fillRect(halfW - jambW, -halfT, jambW, wallThickness);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1 / scale;
        ctx.strokeRect(-halfW, -halfT, jambW, wallThickness);
        ctx.strokeRect(halfW - jambW, -halfT, jambW, wallThickness);

        // 3. Selection Glow
        if (isSelected) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2 / scale;
            ctx.strokeRect(-halfW - 3 / scale, -halfT - 3 / scale, door.width + 6 / scale, wallThickness + 6 / scale);
        }

        const swingSign = door.flipSwing ? -1 : 1;
        const hingeLeft = !door.flipHinge;

        if (door.subtype === 'single') {
            // Single Swing Door
            const hingeX = hingeLeft ? -halfW + jambW : halfW - jambW;
            const hingeY = swingSign * halfT;
            const openAngle = swingSign > 0 ? Math.PI / 2 : -Math.PI / 2;
            const arcRadius = door.width - jambW * 2;
            const leafThick = 1.75; // 1.75 inches

            ctx.save();
            ctx.translate(hingeX, hingeY);

            // Swing Arc (dashed 90 degree quadrant)
            ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(148, 163, 184, 0.7)';
            ctx.lineWidth = 1 / scale;
            ctx.setLineDash([3 / scale, 3 / scale]);
            ctx.beginPath();
            const arcStart = hingeLeft ? 0 : Math.PI;
            const arcEnd = swingSign > 0 ? Math.PI / 2 : (hingeLeft ? -Math.PI / 2 : 1.5 * Math.PI);
            const anticlockwise = hingeLeft ? (swingSign < 0) : (swingSign > 0);
            ctx.arc(0, 0, arcRadius, arcStart, arcEnd, anticlockwise);
            ctx.stroke();
            ctx.setLineDash([]);

            // Door Leaf (panel rotated open 90 degrees into the room)
            ctx.save();
            ctx.rotate(openAngle);
            ctx.fillStyle = isSelected ? '#38bdf8' : '#cbd5e1';
            ctx.strokeStyle = isSelected ? '#0284c7' : '#475569';
            ctx.lineWidth = 1.2 / scale;
            ctx.fillRect(0, -leafThick / 2, arcRadius, leafThick);
            ctx.strokeRect(0, -leafThick / 2, arcRadius, leafThick);
            ctx.restore();

            // Hinge Pin
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(2 / scale, 1.5), 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? '#38bdf8' : '#94a3b8';
            ctx.fill();

            ctx.restore();

        } else if (door.subtype === 'double') {
            // Double Swing Door
            const leafW = (door.width - jambW * 2) / 2;
            const hingeY = swingSign * halfT;
            const openAngle = swingSign > 0 ? Math.PI / 2 : -Math.PI / 2;
            const leafThick = 1.75;

            // Left leaf & arc
            const hx1 = -halfW + jambW;
            ctx.save();
            ctx.translate(hx1, hingeY);

            ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(148, 163, 184, 0.7)';
            ctx.lineWidth = 1 / scale;
            ctx.setLineDash([3 / scale, 3 / scale]);
            ctx.beginPath();
            ctx.arc(0, 0, leafW, 0, openAngle, swingSign < 0);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.save();
            ctx.rotate(openAngle);
            ctx.fillStyle = isSelected ? '#38bdf8' : '#cbd5e1';
            ctx.strokeStyle = isSelected ? '#0284c7' : '#475569';
            ctx.lineWidth = 1.2 / scale;
            ctx.fillRect(0, -leafThick / 2, leafW, leafThick);
            ctx.strokeRect(0, -leafThick / 2, leafW, leafThick);
            ctx.restore();

            ctx.beginPath();
            ctx.arc(0, 0, Math.max(2 / scale, 1.5), 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? '#38bdf8' : '#94a3b8';
            ctx.fill();
            ctx.restore();

            // Right leaf & arc
            const hx2 = halfW - jambW;
            ctx.save();
            ctx.translate(hx2, hingeY);

            ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(148, 163, 184, 0.7)';
            ctx.lineWidth = 1 / scale;
            ctx.setLineDash([3 / scale, 3 / scale]);
            ctx.beginPath();
            ctx.arc(0, 0, leafW, Math.PI, swingSign > 0 ? Math.PI / 2 : 1.5 * Math.PI, swingSign > 0);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.save();
            ctx.rotate(openAngle);
            ctx.fillStyle = isSelected ? '#38bdf8' : '#cbd5e1';
            ctx.strokeStyle = isSelected ? '#0284c7' : '#475569';
            ctx.lineWidth = 1.2 / scale;
            ctx.fillRect(0, -leafThick / 2, leafW, leafThick);
            ctx.strokeRect(0, -leafThick / 2, leafW, leafThick);
            ctx.restore();

            ctx.beginPath();
            ctx.arc(0, 0, Math.max(2 / scale, 1.5), 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? '#38bdf8' : '#94a3b8';
            ctx.fill();
            ctx.restore();

        } else if (door.subtype === 'sliding') {
            // Sliding / Patio Door: two overlapping panels
            const panelW = (door.width - jambW * 2) * 0.55;
            ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.3)' : 'rgba(203, 213, 225, 0.2)';
            ctx.strokeStyle = isSelected ? '#38bdf8' : '#94a3b8';
            ctx.lineWidth = 1.5 / scale;
            // Panel 1
            ctx.fillRect(-halfW + jambW, -halfT * 0.5, panelW, 2);
            ctx.strokeRect(-halfW + jambW, -halfT * 0.5, panelW, 2);
            // Panel 2
            ctx.fillRect(halfW - jambW - panelW, halfT * 0.5 - 2, panelW, 2);
            ctx.strokeRect(halfW - jambW - panelW, halfT * 0.5 - 2, panelW, 2);
        } else {
            // Cased Arch Opening: just open gap with dashed header
            ctx.strokeStyle = 'rgba(203, 213, 225, 0.5)';
            ctx.lineWidth = 1 / scale;
            ctx.setLineDash([4 / scale, 4 / scale]);
            ctx.beginPath();
            ctx.moveTo(-halfW + jambW, -halfT);
            ctx.lineTo(halfW - jambW, -halfT);
            ctx.moveTo(-halfW + jambW, halfT);
            ctx.lineTo(halfW - jambW, halfT);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Door Label / Measurement (measurement removed by default as requested)
        if (door.showMeasurement || door.showLabel) {
            let labelText = '';
            if (door.showLabel && door.label && door.showMeasurement) {
                labelText = `${door.label} (${units.formatLength(door.width)})`;
            } else if (door.showMeasurement) {
                labelText = units.formatLength(door.width);
            } else if (door.showLabel && door.label) {
                labelText = door.label;
            }

            if (labelText) {
                const fontSize = Math.max(8.5 / scale, 2.2);
                ctx.font = `600 ${fontSize}px sans-serif`;
                ctx.fillStyle = isSelected ? '#38bdf8' : '#94a3b8';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const normAngle = ((wallAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                const isUpsideDown = normAngle > Math.PI / 2 && normAngle < Math.PI * 1.5;
                if (isUpsideDown) {
                    ctx.save();
                    ctx.rotate(Math.PI);
                    ctx.fillText(labelText, 0, 0);
                    ctx.restore();
                } else {
                    ctx.fillText(labelText, 0, 0);
                }
            }
        }
    }

    /**
     * Render Architectural Compound Wall Gate (Sliding or Double Swing)
     */
    renderGate(ctx, gate, wallThickness, scale, isSelected, wallAngle = 0) {
        const halfW = gate.width / 2;
        const halfT = wallThickness / 2;
        const pillarSize = Math.max(16, wallThickness * 1.8); // 16"-18" standard Indian compound wall gate pier

        // 1. Clear wall cutout
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-halfW, -halfT - 1 / scale, gate.width, wallThickness + 2 / scale);

        // 2. Gate Piers on each side (Solid RCC / Masonry Piers with Pyramid Coping)
        const renderPier = (cx) => {
            const px = cx - pillarSize / 2;
            const py = -pillarSize / 2;
            ctx.fillStyle = '#1e293b';
            ctx.strokeStyle = isSelected ? '#38bdf8' : '#94a3b8';
            ctx.lineWidth = 1.5 / scale;
            ctx.fillRect(px, py, pillarSize, pillarSize);
            ctx.strokeRect(px, py, pillarSize, pillarSize);

            // Inner pyramid coping cap
            const inset = 3;
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
            ctx.lineWidth = 0.9 / scale;
            ctx.strokeRect(px + inset, py + inset, pillarSize - inset * 2, pillarSize - inset * 2);

            // Pyramid apex diagonals
            ctx.beginPath();
            ctx.moveTo(px, py); ctx.lineTo(px + inset, py + inset);
            ctx.moveTo(px + pillarSize, py); ctx.lineTo(px + pillarSize - inset, py + inset);
            ctx.moveTo(px + pillarSize, py + pillarSize); ctx.lineTo(px + pillarSize - inset, py + pillarSize - inset);
            ctx.moveTo(px, py + pillarSize); ctx.lineTo(px + inset, py + pillarSize - inset);
            // Center apex dot
            ctx.moveTo(cx - 1.5, 0); ctx.lineTo(cx + 1.5, 0);
            ctx.moveTo(cx, -1.5); ctx.lineTo(cx, 1.5);
            ctx.stroke();
        };

        // Left Pier
        renderPier(-halfW);
        // Right Pier
        renderPier(halfW);

        // 3. Gate Leaves
        const swingSign = gate.flipSwing ? -1 : 1;
        if (gate.subtype === 'swing') {
            // Double leaf swing gate
            const leafW = halfW - 2;
            const hingeY = swingSign * halfT;
            const openAngle = swingSign > 0 ? Math.PI / 2 : -Math.PI / 2;

            // Swing arcs
            ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(239, 68, 68, 0.65)';
            ctx.lineWidth = 1 / scale;
            ctx.setLineDash([4 / scale, 3 / scale]);
            ctx.beginPath();
            ctx.arc(-halfW, hingeY, leafW, 0, openAngle, swingSign < 0);
            ctx.arc(halfW, hingeY, leafW, Math.PI, swingSign > 0 ? Math.PI / 2 : 1.5 * Math.PI, swingSign > 0);
            ctx.stroke();
            ctx.setLineDash([]);

            // Gate leaves (iron grill / frame)
            ctx.strokeStyle = isSelected ? '#38bdf8' : '#cbd5e1';
            ctx.lineWidth = 2 / scale;
            ctx.beginPath();
            ctx.moveTo(-halfW, 0);
            ctx.lineTo(-2, 0);
            ctx.moveTo(halfW, 0);
            ctx.lineTo(2, 0);
            ctx.stroke();
        } else {
            // Sliding Gate (default)
            // Long sliding gate panel running parallel along wall
            const offsetDist = halfT + 3;
            ctx.strokeStyle = isSelected ? '#38bdf8' : '#e2e8f0';
            ctx.lineWidth = 2.5 / scale;
            ctx.beginPath();
            ctx.moveTo(-halfW, offsetDist);
            ctx.lineTo(halfW, offsetDist);
            ctx.stroke();

            // Sliding track dashed line
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
            ctx.lineWidth = 1 / scale;
            ctx.setLineDash([4 / scale, 3 / scale]);
            ctx.beginPath();
            ctx.moveTo(-halfW - 20, offsetDist);
            ctx.lineTo(halfW + 20, offsetDist);
            ctx.stroke();
            ctx.setLineDash([]);

            // Gate panel grill markers
            const grillCount = Math.max(4, Math.floor(gate.width / 16));
            ctx.lineWidth = 1 / scale;
            ctx.beginPath();
            for (let i = 1; i < grillCount; i++) {
                const gx = -halfW + (gate.width * i) / grillCount;
                ctx.moveTo(gx, offsetDist - 2);
                ctx.lineTo(gx, offsetDist + 2);
            }
            ctx.stroke();
        }

        // 4. Gate Architectural Badge / Label
        const labelText = gate.label ? gate.label : 'GATE';
        const fontSize = Math.max(9.5 / scale, 2.8);
        ctx.font = `bold ${fontSize}px sans-serif`;
        const tw = ctx.measureText(labelText).width;
        const padX = 6 / scale;
        const padY = 3 / scale;

        // Label box with dashed border
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(-tw / 2 - padX, -fontSize / 2 - padY, tw + padX * 2, fontSize + padY * 2);

        ctx.strokeStyle = isSelected ? '#38bdf8' : '#ef4444'; // distinctive red/cyan gate indicator
        ctx.lineWidth = 1.2 / scale;
        ctx.setLineDash([2 / scale, 2 / scale]);
        ctx.strokeRect(-tw / 2 - padX, -fontSize / 2 - padY, tw + padX * 2, fontSize + padY * 2);
        ctx.setLineDash([]);

        ctx.fillStyle = isSelected ? '#38bdf8' : '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const normAngle = ((wallAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const isUpsideDown = normAngle > Math.PI / 2 && normAngle < Math.PI * 1.5;
        if (isUpsideDown) {
            ctx.save();
            ctx.rotate(Math.PI);
            ctx.fillText(labelText, 0, 0);
            ctx.restore();
        } else {
            ctx.fillText(labelText, 0, 0);
        }

        // 5. Selection highlight
        if (isSelected) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.5 / scale;
            ctx.strokeRect(-halfW - pillarSize / 2 - 2 / scale, -pillarSize / 2 - 2 / scale, gate.width + pillarSize + 4 / scale, pillarSize + 4 / scale);
        }
    }

    /**
     * Render Architectural 2D Window
     */
    renderWindow(ctx, win, wallThickness, scale, isSelected, wallAngle = 0) {
        const halfW = win.width / 2;
        const halfT = wallThickness / 2;

        // 1. Clear Wall Opening Cutout
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-halfW, -halfT - 1 / scale, win.width, wallThickness + 2 / scale);

        // 2. Window Sill (outer lines representing masonry opening and sill projection)
        const sillProj = 2; // 2" projection
        ctx.strokeStyle = isSelected ? '#38bdf8' : '#e2e8f0';
        ctx.lineWidth = 1.8 / scale;

        // Interior wall line (stool)
        ctx.beginPath();
        ctx.moveTo(-halfW, halfT);
        ctx.lineTo(halfW, halfT);
        // Exterior sill line (with slight overhang)
        ctx.moveTo(-halfW - sillProj, -halfT - sillProj);
        ctx.lineTo(halfW + sillProj, -halfT - sillProj);
        ctx.stroke();

        // 3. Window Frame End Jambs
        ctx.lineWidth = 1 / scale;
        ctx.beginPath();
        ctx.moveTo(-halfW, -halfT);
        ctx.lineTo(-halfW, halfT);
        ctx.moveTo(halfW, -halfT);
        ctx.lineTo(halfW, halfT);
        ctx.stroke();

        // 4. Double Glass Pane Lines (Standard 2D architectural window symbol)
        ctx.strokeStyle = isSelected ? '#38bdf8' : '#38bdf8';
        ctx.lineWidth = 1.5 / scale;
        ctx.beginPath();
        ctx.moveTo(-halfW, -1.5);
        ctx.lineTo(halfW, -1.5);
        ctx.moveTo(-halfW, 1.5);
        ctx.lineTo(halfW, 1.5);
        ctx.stroke();

        // Selection highlight
        if (isSelected) {
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 1.5 / scale;
            ctx.strokeRect(-halfW - 2 / scale, -halfT - 2 / scale, win.width + 4 / scale, wallThickness + 4 / scale);
        }

        // Window Label / Measurement (measurement removed by default as requested)
        if (win.showMeasurement || win.showLabel) {
            let labelText = '';
            if (win.showLabel && win.label && win.showMeasurement) {
                labelText = `${win.label} (${units.formatLength(win.width)})`;
            } else if (win.showMeasurement) {
                labelText = units.formatLength(win.width);
            } else if (win.showLabel && win.label) {
                labelText = win.label;
            }

            if (labelText) {
                const fontSize = Math.max(9 / scale, 2.5);
                ctx.font = `600 ${fontSize}px sans-serif`;
                ctx.fillStyle = isSelected ? '#38bdf8' : '#38bdf8';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';

                const normAngle = ((wallAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                const isUpsideDown = normAngle > Math.PI / 2 && normAngle < Math.PI * 1.5;
                if (isUpsideDown) {
                    ctx.save();
                    ctx.rotate(Math.PI);
                    ctx.fillText(labelText, 0, halfT + (12 / scale));
                    ctx.restore();
                } else {
                    ctx.fillText(labelText, 0, -halfT - (3 / scale));
                }
            }
        }
    }

    /**
     * Hit test openings
     */
    getOpeningAt(x, y, scale, wallManager) {
        for (let i = this.openings.length - 1; i >= 0; i--) {
            const op = this.openings[i];
            const wall = wallManager.getWallById(op.wallId);
            if (!wall) continue;

            const geom = op.getGeometry(wall);
            if (!geom) continue;

            // Distance to opening center
            const d = Math.hypot(x - geom.center.x, y - geom.center.y);
            const radius = Math.max(op.type === 'door' ? op.width * 1.1 : op.width / 2, 16 / scale);
            if (d <= radius) {
                return op;
            }
        }
        return null;
    }
}
