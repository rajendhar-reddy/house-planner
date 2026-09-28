/**
 * walls.js - Architectural Wall Drafting & Topological Connectivity Engine
 */

import { units } from './units.js';

let wallIdCounter = 1;

export class Wall {
    constructor(start, end, thickness = 9, type = 'exterior') {
        this.id = `wall_${wallIdCounter++}`;
        this.start = { x: start.x, y: start.y };
        this.end = { x: end.x, y: end.y };
        this.thickness = thickness; // 9" for exterior, 4.5" for interior
        this.type = type; // 'exterior' | 'interior'
        this.openings = []; // IDs of doors/windows placed on this wall
    }

    getLength() {
        return Math.hypot(this.end.x - this.start.x, this.end.y - this.start.y);
    }

    getAngle() {
        return Math.atan2(this.end.y - this.start.y, this.end.x - this.start.x);
    }

    getMidpoint() {
        return {
            x: (this.start.x + this.end.x) / 2,
            y: (this.start.y + this.end.y) / 2
        };
    }

    /**
     * Get the 4 corner points of this wall's polygon
     */
    getPolygon() {
        const dx = this.end.x - this.start.x;
        const dy = this.end.y - this.start.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) return [];

        const halfT = this.thickness / 2;
        // Normal vector
        const nx = (-dy / len) * halfT;
        const ny = (dx / len) * halfT;

        return [
            { x: this.start.x + nx, y: this.start.y + ny },
            { x: this.end.x + nx, y: this.end.y + ny },
            { x: this.end.x - nx, y: this.end.y - ny },
            { x: this.start.x - nx, y: this.start.y - ny }
        ];
    }

    /**
     * Project a point onto this wall's centerline segment
     * Returns { t: 0..1, point: {x,y}, dist: distance from segment }
     */
    projectPoint(p) {
        const dx = this.end.x - this.start.x;
        const dy = this.end.y - this.start.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 0.001) {
            return { t: 0, point: { ...this.start }, dist: Math.hypot(p.x - this.start.x, p.y - this.start.y) };
        }

        let t = ((p.x - this.start.x) * dx + (p.y - this.start.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const projX = this.start.x + t * dx;
        const projY = this.start.y + t * dy;
        const dist = Math.hypot(p.x - projX, p.y - projY);

        return { t, point: { x: projX, y: projY }, dist };
    }

    /**
     * Test if a point is within selection distance of this wall
     */
    hitTest(x, y, scale) {
        const proj = this.projectPoint({ x, y });
        const tolerance = Math.max(this.thickness / 2, 8 / scale);
        return proj.dist <= tolerance;
    }

    /**
     * Get distances from a point projected onto this wall's centerline
     */
    getDistancesFromPoint(p) {
        const proj = this.projectPoint(p);
        const dStart = Math.hypot(proj.point.x - this.start.x, proj.point.y - this.start.y);
        const dEnd = Math.hypot(this.end.x - proj.point.x, this.end.y - proj.point.y);
        const total = this.getLength();
        return {
            wall: this,
            point: proj.point,
            t: proj.t,
            distFromCenterline: proj.dist,
            dStart,
            dEnd,
            total,
            isNearCenter: Math.abs(dStart - dEnd) < 3.0 // within 3" of midpoint
        };
    }
}

export class WallManager {
    constructor() {
        this.walls = [];
        this.selectedWallId = null;
        this.defaultExteriorThickness = 9;  // 9 inches (230mm)
        this.defaultInteriorThickness = 4.5; // 4.5 inches (115mm)
        this.defaultCompoundThickness = 6;   // 6 inches (150mm)
        this.currentThickness = 9;
        this.currentType = 'exterior';
    }

    addWall(start, end, thickness = this.currentThickness, type = this.currentType) {
        // Prevent zero-length walls
        if (Math.hypot(end.x - start.x, end.y - start.y) < 1.0) return null;
        const wall = new Wall(start, end, thickness, type);
        this.walls.push(wall);
        return wall;
    }

    removeWall(id) {
        this.walls = this.walls.filter(w => w.id !== id);
        if (this.selectedWallId === id) this.selectedWallId = null;
    }

    getWallById(id) {
        return this.walls.find(w => w.id === id);
    }

    clear() {
        this.walls = [];
        this.selectedWallId = null;
    }

    /**
     * Get bounding box of walls
     */
    getBounds(onlyExterior = false) {
        if (!this.walls || this.walls.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let found = false;
        for (const w of this.walls) {
            if (onlyExterior && w.type !== 'exterior') continue;
            minX = Math.min(minX, w.start.x, w.end.x);
            minY = Math.min(minY, w.start.y, w.end.y);
            maxX = Math.max(maxX, w.start.x, w.end.x);
            maxY = Math.max(maxY, w.start.y, w.end.y);
            found = true;
        }
        if (!found && onlyExterior) return this.getBounds(false);
        return found ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
    }

    /**
     * Find walls that share a point within a small threshold
     */
    findConnectedWalls(point, threshold = 1.0) {
        const connected = [];
        for (const wall of this.walls) {
            if (Math.hypot(wall.start.x - point.x, wall.start.y - point.y) <= threshold) {
                connected.push({ wall, end: 'start' });
            } else if (Math.hypot(wall.end.x - point.x, wall.end.y - point.y) <= threshold) {
                connected.push({ wall, end: 'end' });
            }
        }
        return connected;
    }

    /**
     * Get all snap target points from existing walls
     */
    getSnapTargets() {
        const targets = [];
        for (const wall of this.walls) {
            targets.push({ x: wall.start.x, y: wall.start.y, type: 'endpoint' });
            targets.push({ x: wall.end.x, y: wall.end.y, type: 'endpoint' });
            const mid = wall.getMidpoint();
            targets.push({ x: mid.x, y: mid.y, type: 'midpoint' });
        }
        return targets;
    }

    /**
     * Parametric Length Editing: Update wall length and adjust connected walls
     * @param {string} wallId
     * @param {number} newLength In inches
     * @param {string} anchor 'start' | 'end' | 'center'
     */
    setWallLength(wallId, newLength, anchor = 'start') {
        const wall = this.getWallById(wallId);
        if (!wall || newLength < 6) return null;

        const angle = wall.getAngle();
        const oldStart = { ...wall.start };
        const oldEnd = { ...wall.end };

        if (anchor === 'start') {
            // Start stays fixed, end moves
            const newEndX = wall.start.x + Math.cos(angle) * newLength;
            const newEndY = wall.start.y + Math.sin(angle) * newLength;

            this.moveVertex(oldEnd, { x: newEndX, y: newEndY }, 2.0, [wall.id]);
            wall.end = { x: newEndX, y: newEndY };

        } else if (anchor === 'end') {
            // End stays fixed, start moves backwards
            const newStartX = wall.end.x - Math.cos(angle) * newLength;
            const newStartY = wall.end.y - Math.sin(angle) * newLength;

            this.moveVertex(oldStart, { x: newStartX, y: newStartY }, 2.0, [wall.id]);
            wall.start = { x: newStartX, y: newStartY };

        } else if (anchor === 'center') {
            // Center stays fixed, both ends move symmetrically
            const mid = wall.getMidpoint();
            const halfLen = newLength / 2;

            const newStartX = mid.x - Math.cos(angle) * halfLen;
            const newStartY = mid.y - Math.sin(angle) * halfLen;
            const newEndX = mid.x + Math.cos(angle) * halfLen;
            const newEndY = mid.y + Math.sin(angle) * halfLen;

            this.moveVertex(oldStart, { x: newStartX, y: newStartY }, 2.0, [wall.id]);
            this.moveVertex(oldEnd, { x: newEndX, y: newEndY }, 2.0, [wall.id]);
            wall.start = { x: newStartX, y: newStartY };
            wall.end = { x: newEndX, y: newEndY };
        }

        return wall;
    }

    /**
     * Move an entire wall by delta (dx, dy), and stretch connected walls
     */
    moveWall(wallId, dx, dy, moveConnected = true) {
        const wall = this.getWallById(wallId);
        if (!wall) return;

        const oldStart = { ...wall.start };
        const oldEnd = { ...wall.end };

        const newStart = { x: wall.start.x + dx, y: wall.start.y + dy };
        const newEnd = { x: wall.end.x + dx, y: wall.end.y + dy };

        if (moveConnected) {
            this.moveVertex(oldStart, newStart, 2.0, [wall.id]);
            this.moveVertex(oldEnd, newEnd, 2.0, [wall.id]);
        }

        wall.start = newStart;
        wall.end = newEnd;
    }

    /**
     * Move all wall endpoints currently meeting at oldPoint to newPoint
     * @param {Object} oldPoint
     * @param {Object} newPoint
     * @param {number} threshold
     * @param {Array<string>} excludeWallIds
     */
    moveVertex(oldPoint, newPoint, threshold = 2.0, excludeWallIds = []) {
        for (const w of this.walls) {
            if (excludeWallIds.includes(w.id)) continue;
            if (Math.hypot(w.start.x - oldPoint.x, w.start.y - oldPoint.y) <= threshold) {
                w.start.x = newPoint.x;
                w.start.y = newPoint.y;
            }
            if (Math.hypot(w.end.x - oldPoint.x, w.end.y - oldPoint.y) <= threshold) {
                w.end.x = newPoint.x;
                w.end.y = newPoint.y;
            }
        }
    }

    /**
     * Enhanced splitWall: cuts wall into two at splitPoint and migrates openings
     */
    splitWall(wallId, splitPoint, openingManager = null) {
        const wall = this.getWallById(wallId);
        if (!wall) return null;

        const proj = wall.projectPoint(splitPoint);
        if (proj.t <= 0.02 || proj.t >= 0.98) return null;

        const splitT = proj.t;
        const oldEnd = { ...wall.end };

        // Wall 1: start to split point
        wall.end = { x: proj.point.x, y: proj.point.y };

        // Wall 2: split point to oldEnd
        const newWall = new Wall(proj.point, oldEnd, wall.thickness, wall.type);
        this.walls.push(newWall);

        // Update connected walls at oldEnd to attach to newWall
        for (const w of this.walls) {
            if (w.id === wall.id || w.id === newWall.id) continue;
            if (Math.hypot(w.start.x - oldEnd.x, w.start.y - oldEnd.y) < 1.0) {
                w.start.x = newWall.end.x;
                w.start.y = newWall.end.y;
            }
            if (Math.hypot(w.end.x - oldEnd.x, w.end.y - oldEnd.y) < 1.0) {
                w.end.x = newWall.end.x;
                w.end.y = newWall.end.y;
            }
        }

        // Migrate openings if openingManager provided
        if (openingManager && openingManager.openings) {
            for (const op of openingManager.openings) {
                if (op.wallId === wall.id) {
                    if (op.t > splitT) {
                        op.wallId = newWall.id;
                        op.t = (op.t - splitT) / (1 - splitT);
                    } else {
                        op.t = op.t / splitT;
                    }
                    op.t = Math.max(0.05, Math.min(0.95, op.t));
                }
            }
        }

        return { wall1: wall, wall2: newWall };
    }

    /**
     * Render all walls
     */
    render(ctx, scale, openingManager = null, style = 'blueprint') {
        for (const wall of this.walls) {
            const isSelected = wall.id === this.selectedWallId;
            this.renderSingleWall(ctx, wall, scale, isSelected, openingManager, style);
        }
    }

    renderSingleWall(ctx, wall, scale, isSelected, openingManager, style = 'blueprint') {
        const poly = wall.getPolygon();
        if (poly.length < 4) return;

        ctx.save();

        // Wall fill
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        ctx.lineTo(poly[1].x, poly[1].y);
        ctx.lineTo(poly[2].x, poly[2].y);
        ctx.lineTo(poly[3].x, poly[3].y);
        ctx.closePath();

        const isClean = style === 'clean';

        // Architectural wall hatching / fill
        if (isSelected) {
            ctx.fillStyle = 'rgba(56, 189, 248, 0.45)'; // bright cyan highlight
            ctx.strokeStyle = '#38bdf8';
        } else if (wall.type === 'compound') {
            ctx.fillStyle = isClean ? '#cbd5e1' : '#475569'; // distinct compound wall fill
            ctx.strokeStyle = isClean ? '#0f172a' : '#94a3b8'; // crisp masonry boundary
        } else if (wall.type === 'exterior') {
            ctx.fillStyle = '#334155'; // dark slate for exterior load-bearing walls
            ctx.strokeStyle = '#0f172a';
        } else {
            ctx.fillStyle = '#475569'; // slate for interior partitions
            ctx.strokeStyle = '#1e293b';
        }

        ctx.fill();
        ctx.lineWidth = (wall.type === 'compound' ? 2.0 : 1.5) / scale;
        ctx.stroke();

        // Compound wall endpoint masonry pier posts
        if (wall.type === 'compound') {
            const pierHalf = Math.max(wall.thickness * 0.75, 4.5);
            ctx.fillStyle = isClean ? '#94a3b8' : '#334155';
            ctx.strokeStyle = isClean ? '#0f172a' : '#94a3b8';
            ctx.lineWidth = 1.2 / scale;
            ctx.fillRect(wall.start.x - pierHalf, wall.start.y - pierHalf, pierHalf * 2, pierHalf * 2);
            ctx.strokeRect(wall.start.x - pierHalf, wall.start.y - pierHalf, pierHalf * 2, pierHalf * 2);
            ctx.fillRect(wall.end.x - pierHalf, wall.end.y - pierHalf, pierHalf * 2, pierHalf * 2);
            ctx.strokeRect(wall.end.x - pierHalf, wall.end.y - pierHalf, pierHalf * 2, pierHalf * 2);
        } else {
            // Corner joint caps (smooth joins at endpoints)
            ctx.beginPath();
            ctx.arc(wall.start.x, wall.start.y, wall.thickness / 2, 0, Math.PI * 2);
            ctx.arc(wall.end.x, wall.end.y, wall.thickness / 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Centerline guide (subtle dashed line for drafting precision)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 0.8 / scale;
        ctx.setLineDash([3 / scale, 3 / scale]);
        ctx.beginPath();
        ctx.moveTo(wall.start.x, wall.start.y);
        ctx.lineTo(wall.end.x, wall.end.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Render wall length dimension badge
        this.renderWallDimension(ctx, wall, scale);

        // Corner drag handles when selected
        if (isSelected) {
            const rHandle = Math.max(5 / scale, 2.5);
            // Start handle
            ctx.beginPath();
            ctx.arc(wall.start.x, wall.start.y, rHandle, 0, Math.PI * 2);
            ctx.fillStyle = '#38bdf8';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.8 / scale;
            ctx.stroke();

            // End handle
            ctx.beginPath();
            ctx.arc(wall.end.x, wall.end.y, rHandle, 0, Math.PI * 2);
            ctx.fillStyle = '#38bdf8';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.8 / scale;
            ctx.stroke();
        }

        ctx.restore();
    }

    renderWallDimension(ctx, wall, scale) {
        const len = wall.getLength();
        if (len < 18) return; // don't crowd tiny walls

        const mid = wall.getMidpoint();
        const angle = wall.getAngle();
        const label = units.formatLength(len);

        ctx.save();
        ctx.translate(mid.x, mid.y);

        let drawAngle = angle;
        if (drawAngle > Math.PI / 2) drawAngle -= Math.PI;
        if (drawAngle < -Math.PI / 2) drawAngle += Math.PI;
        ctx.rotate(drawAngle);

        const fontSize = Math.max(10 / scale, 3);
        ctx.font = `600 ${fontSize}px sans-serif`;
        const textW = ctx.measureText(label).width;
        const padX = 3 / scale;
        const padY = 2 / scale;

        // Position pill slightly above wall centerline
        const offsetY = -(wall.thickness / 2 + 7 / scale);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(-textW / 2 - padX, offsetY - fontSize / 2 - padY, textW + padX * 2, fontSize + padY * 2);

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.lineWidth = 0.75 / scale;
        ctx.strokeRect(-textW / 2 - padX, offsetY - fontSize / 2 - padY, textW + padX * 2, fontSize + padY * 2);

        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 0, offsetY);

        ctx.restore();
    }

    /**
     * Hit test all walls to find clicked wall
     */
    getWallAt(x, y, scale, toleranceExtra = 0) {
        for (let i = this.walls.length - 1; i >= 0; i--) {
            const proj = this.walls[i].projectPoint({ x, y });
            const tolerance = Math.max(this.walls[i].thickness / 2, 8 / scale) + toleranceExtra;
            if (proj.dist <= tolerance) {
                return this.walls[i];
            }
        }
        return null;
    }

    /**
     * Render dynamic dual dimension lines showing distances from hovered point to both ends of the wall
     */
    renderHoverDistances(ctx, hoverInfo, scale) {
        if (!hoverInfo || !hoverInfo.wall) return;
        const { wall, point, dStart, dEnd, total, isNearCenter } = hoverInfo;
        const angle = wall.getAngle();
        if (total < 1.0) return;

        ctx.save();

        // 1. Normal vector (offset outward perpendicular to wall)
        const halfT = wall.thickness / 2;
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);

        const offsetDist = halfT + (18 / scale);
        const tickLen = 6 / scale;

        // Points on the offset dimension line
        const pStartOff = { x: wall.start.x + nx * offsetDist, y: wall.start.y + ny * offsetDist };
        const pMidOff   = { x: point.x + nx * offsetDist, y: point.y + ny * offsetDist };
        const pEndOff   = { x: wall.end.x + nx * offsetDist, y: wall.end.y + ny * offsetDist };

        // 2. Extension lines
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)'; // cyan
        ctx.lineWidth = 1 / scale;
        ctx.setLineDash([3 / scale, 3 / scale]);
        ctx.beginPath();
        // Start extension
        ctx.moveTo(wall.start.x, wall.start.y);
        ctx.lineTo(pStartOff.x + nx * (4 / scale), pStartOff.y + ny * (4 / scale));
        // Hover point extension across wall and to dim line
        ctx.moveTo(point.x - nx * halfT, point.y - ny * halfT);
        ctx.lineTo(pMidOff.x + nx * (4 / scale), pMidOff.y + ny * (4 / scale));
        // End extension
        ctx.moveTo(wall.end.x, wall.end.y);
        ctx.lineTo(pEndOff.x + nx * (4 / scale), pEndOff.y + ny * (4 / scale));
        ctx.stroke();
        ctx.setLineDash([]);

        // 3. Dual dimension lines
        ctx.strokeStyle = '#38bdf8'; // bright cyan
        ctx.lineWidth = 1.5 / scale;
        ctx.beginPath();
        // Segment 1 (start to point)
        ctx.moveTo(pStartOff.x, pStartOff.y);
        ctx.lineTo(pMidOff.x, pMidOff.y);
        // Segment 2 (point to end)
        ctx.moveTo(pMidOff.x, pMidOff.y);
        ctx.lineTo(pEndOff.x, pEndOff.y);
        ctx.stroke();

        // Architectural 45-degree ticks at start, mid, and end
        const drawTick = (px, py) => {
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(angle + Math.PI / 4);
            ctx.beginPath();
            ctx.moveTo(-tickLen, 0);
            ctx.lineTo(tickLen, 0);
            ctx.stroke();
            ctx.restore();
        };
        drawTick(pStartOff.x, pStartOff.y);
        drawTick(pMidOff.x, pMidOff.y);
        drawTick(pEndOff.x, pEndOff.y);

        // 4. Projection point marker on wall centerline
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(4 / scale, 2), 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();

        // Crosshair line across wall thickness at hover point
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2 / scale;
        ctx.beginPath();
        ctx.moveTo(point.x - nx * halfT, point.y - ny * halfT);
        ctx.lineTo(point.x + nx * halfT, point.y + ny * halfT);
        ctx.stroke();

        // 5. Dimension labels for Segment 1 & Segment 2
        let textAngle = angle;
        if (textAngle > Math.PI / 2) textAngle -= Math.PI;
        if (textAngle < -Math.PI / 2) textAngle += Math.PI;

        const fontSize = Math.max(10 / scale, 3);
        ctx.font = `600 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const renderLabelPill = (cx, cy, text, isCenter = false) => {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(textAngle);
            const tw = ctx.measureText(text).width;
            const padX = 4 / scale;
            const padY = 2 / scale;

            ctx.fillStyle = isCenter ? 'rgba(16, 185, 129, 0.95)' : 'rgba(15, 23, 42, 0.92)';
            ctx.fillRect(-tw / 2 - padX, -fontSize / 2 - padY, tw + padX * 2, fontSize + padY * 2);

            ctx.strokeStyle = isCenter ? '#10b981' : '#38bdf8';
            ctx.lineWidth = 1 / scale;
            ctx.strokeRect(-tw / 2 - padX, -fontSize / 2 - padY, tw + padX * 2, fontSize + padY * 2);

            ctx.fillStyle = '#ffffff';
            ctx.fillText(text, 0, 0);
            ctx.restore();
        };

        // Midpoint of segment 1
        if (dStart > 4) {
            const m1 = { x: (pStartOff.x + pMidOff.x) / 2, y: (pStartOff.y + pMidOff.y) / 2 };
            renderLabelPill(m1.x, m1.y, `⇦ ${units.formatLength(dStart)}`);
        }

        // Midpoint of segment 2
        if (dEnd > 4) {
            const m2 = { x: (pMidOff.x + pEndOff.x) / 2, y: (pMidOff.y + pEndOff.y) / 2 };
            renderLabelPill(m2.x, m2.y, `${units.formatLength(dEnd)} ⇨`);
        }

        // If hovering near exact center (midpoint), show center tag
        if (isNearCenter) {
            renderLabelPill(pMidOff.x, pMidOff.y - (14 / scale), `★ MIDPOINT (${units.formatLength(total / 2)})`, true);
        }

        ctx.restore();
    }

    /**
     * Automatically erect 4 compound perimeter walls around the plot with gate placement
     */
    createCompoundWallPerimeter(plotBounds, options = {}) {
        if (!plotBounds) return { walls: [], gate: null };
        const thickness = options.thickness || 6;
        const gateWidth = options.gateWidth || 120;
        const openingManager = options.openingManager || null;

        // Clear existing compound walls
        this.walls = this.walls.filter(w => w.type !== 'compound');

        const { x, y, width: w, height: h } = plotBounds;

        // 4 boundary walls along plot perimeter
        // Rear (Top): (x, y) -> (x + w, y)
        const wRear = this.addWall({ x, y }, { x: x + w, y }, thickness, 'compound');
        // Right: (x + w, y) -> (x + w, y + h)
        const wRight = this.addWall({ x: x + w, y }, { x: x + w, y: y + h }, thickness, 'compound');
        // Front (Bottom): (x + w, y + h) -> (x, y + h)
        const wFront = this.addWall({ x: x + w, y: y + h }, { x, y: y + h }, thickness, 'compound');
        // Left: (x, y + h) -> (x, y)
        const wLeft = this.addWall({ x, y: y + h }, { x, y }, thickness, 'compound');

        const createdWalls = [wRear, wRight, wFront, wLeft].filter(Boolean);

        // Add gate on front wall if openingManager supplied
        let createdGate = null;
        if (openingManager && wFront) {
            const tGate = options.gateT !== undefined ? options.gateT : 0.65;
            createdGate = openingManager.addOpening(wFront.id, tGate, {
                type: 'gate',
                subtype: options.gateSubtype || 'sliding',
                width: gateWidth,
                label: 'MAIN GATE'
            });
        }

        return { walls: createdWalls, gate: createdGate };
    }
}

