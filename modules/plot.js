/**
 * plot.js - Site & Plot Marking System
 */

import { units } from './units.js';

export class PlotManager {
    constructor() {
        this.plot = null; // Current active plot definition
        this.northAngle = 0; // 0 = Up (North), 90 = Right, etc.
        this.roadSide = 'front'; // 'front', 'rear', 'left', 'right'
        this.roadWidth = 360; // 30 feet road
        this.showChainedDimensions = true; // 2-Tier Chained Setback Dimension Strings
        this.showCornerMarkers = true;     // Surveyor corner nodes (A, B, C, D)
        this.showSetbackShading = true;    // Dashed buildable envelope & shading
        this.showSlabProjection = false;   // Building-wide dotted line slab projection
        this.slabProjectionOffset = 18;    // 18 inches (1'-6") standard architectural slab projection/overhang
        this.showLandscapeWash = false;    // Soft architectural watercolor lawn wash in open setbacks
        this.cornerLabels = ['A', 'B', 'C', 'D'];
    }

    /**
     * Create a standard rectangular plot
     * @param {number} x Left
     * @param {number} y Top
     * @param {number} width Inches
     * @param {number} height Inches
     */
    createRectangularPlot(x, y, width, height, setbacks = { front: 60, rear: 36, left: 36, right: 36 }) {
        this.plot = {
            type: 'polygon',
            vertices: [
                { x: x, y: y },
                { x: x + width, y: y },
                { x: x + width, y: y + height },
                { x: x, y: y + height }
            ],
            setbacks: setbacks, // in inches
            roadSide: 'front', // bottom side or user choice
            name: 'Plot Boundary'
        };
        return this.plot;
    }

    /**
     * Set a custom polygon plot
     */
    setPolygonPlot(vertices, setbacks = { front: 60, rear: 36, left: 36, right: 36 }) {
        this.plot = {
            type: 'polygon',
            vertices: vertices,
            setbacks: setbacks,
            roadSide: 'front',
            name: 'Plot Boundary'
        };
        return this.plot;
    }

    clear() {
        this.plot = null;
    }

    /**
     * Update plot setbacks
     * @param {Object} setbacks { front, rear, left, right } in inches
     */
    setSetbacks(setbacks) {
        if (!this.plot) return;
        if (!this.plot.setbacks) {
            this.plot.setbacks = { front: 60, rear: 36, left: 36, right: 36 };
        }
        if (setbacks.front !== undefined) this.plot.setbacks.front = Math.max(0, setbacks.front);
        if (setbacks.rear !== undefined) this.plot.setbacks.rear = Math.max(0, setbacks.rear);
        if (setbacks.left !== undefined) this.plot.setbacks.left = Math.max(0, setbacks.left);
        if (setbacks.right !== undefined) this.plot.setbacks.right = Math.max(0, setbacks.right);
    }

    /**
     * Get buildable bounds rectangle inside setbacks
     */
    getBuildableBounds() {
        if (!this.plot || !this.plot.setbacks) return null;
        const bounds = this.getBounds();
        if (!bounds) return null;

        const sb = this.plot.setbacks;
        const innerX = bounds.x + (sb.left || 0);
        const innerY = bounds.y + (sb.rear || 0);
        const innerW = bounds.width - ((sb.left || 0) + (sb.right || 0));
        const innerH = bounds.height - ((sb.rear || 0) + (sb.front || 0));

        if (innerW <= 0 || innerH <= 0) return null;

        return {
            x: innerX,
            y: innerY,
            width: innerW,
            height: innerH
        };
    }

    /**
     * Get buildable footprint area in square inches
     */
    getBuildableArea() {
        const bb = this.getBuildableBounds();
        if (!bb) return 0;
        return bb.width * bb.height;
    }

    /**
     * Get bounding box of the plot
     */
    getBounds() {
        if (!this.plot || !this.plot.vertices || this.plot.vertices.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const v of this.plot.vertices) {
            if (v.x < minX) minX = v.x;
            if (v.y < minY) minY = v.y;
            if (v.x > maxX) maxX = v.x;
            if (v.y > maxY) maxY = v.y;
        }
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /**
     * Compute expanded bounding box including 2-tier setback dimension chains
     */
    getBoundsWithDimensions() {
        const b = this.getBounds();
        if (!b) return null;
        if (!this.showChainedDimensions) return b;
        return {
            x: b.x - 72,
            y: b.y - 72,
            width: b.width + 85,
            height: b.height + 85
        };
    }

    /**
     * Compute polygon area using shoelace formula (in sq inches)
     */
    getArea() {
        if (!this.plot || !this.plot.vertices || this.plot.vertices.length < 3) return 0;
        const v = this.plot.vertices;
        let area = 0;
        for (let i = 0; i < v.length; i++) {
            const j = (i + 1) % v.length;
            area += v[i].x * v[j].y;
            area -= v[j].x * v[i].y;
        }
        return Math.abs(area) / 2;
    }

    /**
     * Get snap points (corners and midpoints of edges)
     */
    getSnapTargets() {
        if (!this.plot || !this.plot.vertices) return [];
        const targets = [];
        const v = this.plot.vertices;

        for (let i = 0; i < v.length; i++) {
            const current = v[i];
            const next = v[(i + 1) % v.length];

            // Corner
            targets.push({ x: current.x, y: current.y, type: 'endpoint' });

            // Midpoint of boundary edge
            targets.push({
                x: (current.x + next.x) / 2,
                y: (current.y + next.y) / 2,
                type: 'midpoint'
            });
        }
        return targets;
    }

    /**
     * Render the plot boundary, setbacks, dimensions, and road
     */
    render(ctx, scale, isSelected = false, wallManager = null, theme = 'blueprint', isExport = false) {
        if (!this.plot || !this.plot.vertices || this.plot.vertices.length < 3) return;
        const v = this.plot.vertices;
        const isClean = theme === 'clean';

        ctx.save();

        // 1. Plot Fill & Boundary Line
        ctx.beginPath();
        ctx.moveTo(v[0].x, v[0].y);
        for (let i = 1; i < v.length; i++) {
            ctx.lineTo(v[i].x, v[i].y);
        }
        ctx.closePath();

        // Subtle site fill
        ctx.fillStyle = isClean ? 'rgba(241, 245, 249, 0.45)' : 'rgba(234, 179, 8, 0.03)';
        ctx.fill();

        // Surveyor style boundary line: thick dashed with alternating dots
        ctx.lineWidth = (isExport ? 2.8 : 2.5) / scale;
        ctx.strokeStyle = isSelected ? '#38bdf8' : (isClean ? '#0f172a' : '#eab308');
        ctx.setLineDash([12 / scale, 4 / scale, 3 / scale, 4 / scale]);
        ctx.stroke();
        ctx.setLineDash([]); // reset

        // 2. Corner Surveyor Markers (A, B, C, D)
        if (this.showCornerMarkers) {
            this.renderCornerSurveyorMarkers(ctx, scale, isClean, isExport);
        } else {
            for (let i = 0; i < v.length; i++) {
                ctx.beginPath();
                ctx.arc(v[i].x, v[i].y, 5 / scale, 0, Math.PI * 2);
                ctx.fillStyle = '#eab308';
                ctx.fill();
                ctx.lineWidth = 1.5 / scale;
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();
            }
        }

        // 3. Setback Lines (Building Envelope)
        if (this.showSetbackShading) {
            this.renderSetbacks(ctx, scale, isClean);
        }

        // 4. 2-Tier Chained Dimensions or Edge Dimensions
        if (this.showChainedDimensions) {
            this.render2TierChainedDimensions(ctx, scale, wallManager, isClean, isExport);
        } else {
            this.renderDimensions(ctx, scale);
        }

        // 5. Roof / Cantilever Slab Markings (Dotted Line)
        if (this.showSlabProjection) {
            this.renderSlabProjection(ctx, scale, wallManager, isClean, isExport);
        }

        // 6. North Compass (interactive)
        this.renderCompass(ctx, scale, isSelected);

        ctx.restore();
    }

    /**
     * Render Roof Slab Projection / Cantilever Dotted Line around the building exterior
     */
    renderSlabProjection(ctx, scale, wallManager, isClean, isExport) {
        let b = null;
        if (wallManager) {
            if (typeof wallManager.getBounds === 'function') {
                b = wallManager.getBounds(true);
            } else if (wallManager.walls && wallManager.walls.length > 0) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                let found = false;
                for (const w of wallManager.walls) {
                    if (w.type === 'exterior') {
                        minX = Math.min(minX, w.start.x, w.end.x);
                        minY = Math.min(minY, w.start.y, w.end.y);
                        maxX = Math.max(maxX, w.start.x, w.end.x);
                        maxY = Math.max(maxY, w.start.y, w.end.y);
                        found = true;
                    }
                }
                if (found) {
                    b = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
                }
            }
        }
        if (!b) {
            b = this.getBuildableBounds();
        }
        if (!b) return;

        const off = this.slabProjectionOffset !== undefined ? this.slabProjectionOffset : 18;
        const sx = b.x - off;
        const sy = b.y - off;
        const sw = b.width + off * 2;
        const sh = b.height + off * 2;

        ctx.save();

        // Architectural dotted / dashed line for slab projection
        ctx.strokeStyle = isClean ? '#0284c7' : '#38bdf8';
        ctx.lineWidth = (isExport ? 1.6 : 1.2) / scale;
        ctx.setLineDash([8 / scale, 6 / scale]);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.setLineDash([]);

        // Corner projection ticks (L-marks)
        const tick = (isExport ? 8 : 6) / scale;
        ctx.strokeStyle = isClean ? '#0369a1' : '#7dd3fc';
        ctx.lineWidth = (isExport ? 1.2 : 1.0) / scale;
        ctx.beginPath();
        // Top-left
        ctx.moveTo(sx - tick, sy); ctx.lineTo(sx, sy); ctx.lineTo(sx, sy - tick);
        // Top-right
        ctx.moveTo(sx + sw + tick, sy); ctx.lineTo(sx + sw, sy); ctx.lineTo(sx + sw, sy - tick);
        // Bottom-left
        ctx.moveTo(sx - tick, sy + sh); ctx.lineTo(sx, sy + sh); ctx.lineTo(sx, sy + sh + tick);
        // Bottom-right
        ctx.moveTo(sx + sw + tick, sy + sh); ctx.lineTo(sx + sw, sy + sh); ctx.lineTo(sx + sw, sy + sh + tick);
        ctx.stroke();

        // Architectural Annotation Banner along bottom or top
        const fontSize = Math.max((isExport ? 10 : 8.5) / scale, 3.2);
        ctx.font = `600 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const labelText = `╌ ╌ DOTTED LINE INDICATES SLAB PROJECTION (${units.formatLength(off)}) ╌ ╌`;
        const textY = sy + sh + (14 / scale);
        const textX = sx + sw / 2;

        const tw = ctx.measureText(labelText).width;
        ctx.fillStyle = isClean ? 'rgba(255, 255, 255, 0.92)' : 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(textX - tw / 2 - (4 / scale), textY - fontSize - (2 / scale), tw + (8 / scale), fontSize + (4 / scale));

        ctx.fillStyle = isClean ? '#0369a1' : '#38bdf8';
        ctx.fillText(labelText, textX, textY);

        ctx.restore();
    }

    /**
     * Render 4 Corner Surveyor Nodes & Target Crosshairs (A, B, C, D)
     */
    renderCornerSurveyorMarkers(ctx, scale, isClean, isExport) {
        if (!this.plot || !this.plot.vertices || this.plot.vertices.length < 3) return;
        const v = this.plot.vertices;
        const cornerLabels = this.cornerLabels || ['A', 'B', 'C', 'D'];

        ctx.save();
        const r = (isExport ? 6.5 : 5.0) / scale;
        const crosshairLen = (isExport ? 11 : 8.5) / scale;
        const strokeColor = isClean ? '#0f172a' : '#eab308';
        const circleBg = isClean ? '#ffffff' : '#0f172a';
        const fontSize = Math.max((isExport ? 14 : 10) / scale, 3);

        const bounds = this.getBounds();
        const cx = bounds ? bounds.x + bounds.width / 2 : 0;
        const cy = bounds ? bounds.y + bounds.height / 2 : 0;

        for (let i = 0; i < v.length; i++) {
            const pt = v[i];
            const label = cornerLabels[i] || `P${i + 1}`;

            // 1. Crosshairs
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = (isExport ? 1.5 : 1.0) / scale;
            ctx.beginPath();
            ctx.moveTo(pt.x - crosshairLen, pt.y);
            ctx.lineTo(pt.x + crosshairLen, pt.y);
            ctx.moveTo(pt.x, pt.y - crosshairLen);
            ctx.lineTo(pt.x, pt.y + crosshairLen);
            ctx.stroke();

            // 2. Circular Target
            ctx.fillStyle = circleBg;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = (isExport ? 1.8 : 1.2) / scale;
            ctx.stroke();

            // 3. Center Solid Bullseye Dot
            ctx.fillStyle = strokeColor;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, r * 0.35, 0, Math.PI * 2);
            ctx.fill();

            // 4. Corner Designation Tag (A, B, C, D) placed diagonally outward
            const dirX = pt.x >= cx ? 1 : -1;
            const dirY = pt.y >= cy ? 1 : -1;
            const tagDist = (isExport ? 18 : 14) / scale;
            const tagX = pt.x + dirX * tagDist;
            const tagY = pt.y + dirY * tagDist;

            ctx.save();
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const tw = ctx.measureText(label).width;
            const padX = (isExport ? 5 : 3.5) / scale;
            const padY = (isExport ? 3 : 2) / scale;

            ctx.fillStyle = isClean ? '#f8fafc' : '#1e293b';
            ctx.fillRect(tagX - tw / 2 - padX, tagY - fontSize / 2 - padY, tw + padX * 2, fontSize + padY * 2);
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1 / scale;
            ctx.strokeRect(tagX - tw / 2 - padX, tagY - fontSize / 2 - padY, tw + padX * 2, fontSize + padY * 2);

            ctx.fillStyle = isClean ? '#0f172a' : '#fef08a';
            ctx.fillText(label, tagX, tagY);
            ctx.restore();
        }
        ctx.restore();
    }

    /**
     * Render 2-Tier Chained Dimension Strings matching Nirman Engineers Blueprint standard:
     * Tier 1 (Inner): Chained Setbacks & Building Width / Depth segments
     * Tier 2 (Outer): Continuous Overall Plot Dimension
     */
    render2TierChainedDimensions(ctx, scale, wallManager, isClean, isExport) {
        if (!this.plot) return;
        const bounds = this.getBounds();
        if (!bounds) return;

        const x0 = bounds.x;
        const x3 = bounds.x + bounds.width;
        const y0 = bounds.y;
        const y3 = bounds.y + bounds.height;

        // Determine Building Exterior Footprint
        let bMinX = bounds.x + (this.plot.setbacks ? (this.plot.setbacks.left || 36) : 36);
        let bMaxX = bounds.x + bounds.width - (this.plot.setbacks ? (this.plot.setbacks.right || 36) : 36);
        let bMinY = bounds.y + (this.plot.setbacks ? (this.plot.setbacks.rear || 36) : 36);
        let bMaxY = bounds.y + bounds.height - (this.plot.setbacks ? (this.plot.setbacks.front || 60) : 60);

        if (wallManager && wallManager.walls && wallManager.walls.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            let foundExterior = false;
            for (const w of wallManager.walls) {
                if (w.type === 'exterior') {
                    minX = Math.min(minX, w.start.x, w.end.x);
                    minY = Math.min(minY, w.start.y, w.end.y);
                    maxX = Math.max(maxX, w.start.x, w.end.x);
                    maxY = Math.max(maxY, w.start.y, w.end.y);
                    foundExterior = true;
                }
            }
            if (foundExterior && maxX > minX + 12 && maxY > minY + 12) {
                bMinX = minX;
                bMaxX = maxX;
                bMinY = minY;
                bMaxY = maxY;
            }
        }

        const x1 = Math.max(x0, Math.min(bMinX, x3));
        const x2 = Math.min(x3, Math.max(bMaxX, x1));
        const y1 = Math.max(y0, Math.min(bMinY, y3));
        const y2 = Math.min(y3, Math.max(bMaxY, y1));

        ctx.save();

        const dimLineColor = isClean ? '#334155' : (isExport ? '#cbd5e1' : '#94a3b8');
        const witnessColor = isClean ? 'rgba(51, 65, 85, 0.45)' : 'rgba(148, 163, 184, 0.40)';
        const tickColor = isClean ? '#0f172a' : (isExport ? '#ffffff' : '#38bdf8');
        const textColor = isClean ? '#0f172a' : (isExport ? '#ffffff' : '#f8fafc');
        const textBgColor = isClean ? '#ffffff' : '#0f172a';

        const extOverhang = (isExport ? 7 : 5) / scale;
        const tickSize = (isExport ? 7 : 5) / scale;
        const lineWidth = (isExport ? 1.4 : 1.0) / scale;
        const tickWidth = (isExport ? 2.0 : 1.5) / scale;

        const drawSlashTick = (x, y) => {
            ctx.save();
            ctx.strokeStyle = tickColor;
            ctx.lineWidth = tickWidth;
            ctx.beginPath();
            ctx.moveTo(x - tickSize, y + tickSize);
            ctx.lineTo(x + tickSize, y - tickSize);
            ctx.stroke();
            ctx.restore();
        };

        const drawDimBadge = (text, cx, cy, angle = 0) => {
            ctx.save();
            ctx.translate(cx, cy);
            if (angle !== 0) ctx.rotate(angle);

            const targetPx = isExport ? 20 : 11;
            const fontSize = Math.max(targetPx / scale, 3);
            ctx.font = `600 ${fontSize}px sans-serif`;
            const tw = ctx.measureText(text).width;
            const padX = (isExport ? 6 : 4) / scale;
            const padY = (isExport ? 3 : 2) / scale;

            ctx.fillStyle = textBgColor;
            ctx.fillRect(-tw / 2 - padX, -fontSize / 2 - padY, tw + padX * 2, fontSize + padY * 2);

            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 0, 0);
            ctx.restore();
        };

        // --- 1. TOP / REAR HORIZONTAL 2-TIER CHAIN ---
        const d1_top = 28; // Tier 1: 28 inches above plot
        const d2_top = 54; // Tier 2: 54 inches above plot
        const yTier1_top = y0 - d1_top;
        const yTier2_top = y0 - d2_top;

        // Tier 1 Witness Extension Lines (vertical lines)
        ctx.strokeStyle = witnessColor;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(x0, y0); ctx.lineTo(x0, yTier1_top - extOverhang);
        ctx.moveTo(x1, bMinY); ctx.lineTo(x1, yTier1_top - extOverhang);
        ctx.moveTo(x2, bMinY); ctx.lineTo(x2, yTier1_top - extOverhang);
        ctx.moveTo(x3, y0); ctx.lineTo(x3, yTier1_top - extOverhang);
        ctx.stroke();

        // Tier 1 Dimension Line
        ctx.strokeStyle = dimLineColor;
        ctx.beginPath();
        ctx.moveTo(x0, yTier1_top);
        ctx.lineTo(x3, yTier1_top);
        ctx.stroke();

        // Tier 1 Slash Ticks
        drawSlashTick(x0, yTier1_top);
        drawSlashTick(x1, yTier1_top);
        drawSlashTick(x2, yTier1_top);
        drawSlashTick(x3, yTier1_top);

        // Tier 1 Text Badges
        if (x1 - x0 >= 6) {
            drawDimBadge(units.formatLength(x1 - x0), (x0 + x1) / 2, yTier1_top);
        }
        if (x2 - x1 >= 12) {
            drawDimBadge(units.formatLength(x2 - x1), (x1 + x2) / 2, yTier1_top);
        }
        if (x3 - x2 >= 6) {
            drawDimBadge(units.formatLength(x3 - x2), (x2 + x3) / 2, yTier1_top);
        }

        // Tier 2 Witness Extension Lines
        ctx.strokeStyle = witnessColor;
        ctx.beginPath();
        ctx.moveTo(x0, yTier1_top); ctx.lineTo(x0, yTier2_top - extOverhang);
        ctx.moveTo(x3, yTier1_top); ctx.lineTo(x3, yTier2_top - extOverhang);
        ctx.stroke();

        // Tier 2 Dimension Line
        ctx.strokeStyle = dimLineColor;
        ctx.beginPath();
        ctx.moveTo(x0, yTier2_top);
        ctx.lineTo(x3, yTier2_top);
        ctx.stroke();

        // Tier 2 Slash Ticks
        drawSlashTick(x0, yTier2_top);
        drawSlashTick(x3, yTier2_top);

        // Tier 2 Text Badge (Overall Plot Width)
        drawDimBadge(units.formatLength(x3 - x0), (x0 + x3) / 2, yTier2_top);

        // --- 2. LEFT / SIDE VERTICAL 2-TIER CHAIN ---
        const d1_left = 28; // Tier 1: 28 inches left of plot
        const d2_left = 54; // Tier 2: 54 inches left of plot
        const xTier1_left = x0 - d1_left;
        const xTier2_left = x0 - d2_left;

        // Tier 1 Witness Extension Lines (horizontal lines)
        ctx.strokeStyle = witnessColor;
        ctx.beginPath();
        ctx.moveTo(x0, y0); ctx.lineTo(xTier1_left - extOverhang, y0);
        ctx.moveTo(bMinX, y1); ctx.lineTo(xTier1_left - extOverhang, y1);
        ctx.moveTo(bMinX, y2); ctx.lineTo(xTier1_left - extOverhang, y2);
        ctx.moveTo(x0, y3); ctx.lineTo(xTier1_left - extOverhang, y3);
        ctx.stroke();

        // Tier 1 Dimension Line (vertical line)
        ctx.strokeStyle = dimLineColor;
        ctx.beginPath();
        ctx.moveTo(xTier1_left, y0);
        ctx.lineTo(xTier1_left, y3);
        ctx.stroke();

        // Tier 1 Slash Ticks
        drawSlashTick(xTier1_left, y0);
        drawSlashTick(xTier1_left, y1);
        drawSlashTick(xTier1_left, y2);
        drawSlashTick(xTier1_left, y3);

        // Tier 1 Text Badges (vertical text, rotated -90 deg)
        if (y1 - y0 >= 6) {
            drawDimBadge(units.formatLength(y1 - y0), xTier1_left, (y0 + y1) / 2, -Math.PI / 2);
        }
        if (y2 - y1 >= 12) {
            drawDimBadge(units.formatLength(y2 - y1), xTier1_left, (y1 + y2) / 2, -Math.PI / 2);
        }
        if (y3 - y2 >= 6) {
            drawDimBadge(units.formatLength(y3 - y2), xTier1_left, (y2 + y3) / 2, -Math.PI / 2);
        }

        // Tier 2 Witness Extension Lines
        ctx.strokeStyle = witnessColor;
        ctx.beginPath();
        ctx.moveTo(xTier1_left, y0); ctx.lineTo(xTier2_left - extOverhang, y0);
        ctx.moveTo(xTier1_left, y3); ctx.lineTo(xTier2_left - extOverhang, y3);
        ctx.stroke();

        // Tier 2 Dimension Line (vertical line)
        ctx.strokeStyle = dimLineColor;
        ctx.beginPath();
        ctx.moveTo(xTier2_left, y0);
        ctx.lineTo(xTier2_left, y3);
        ctx.stroke();

        // Tier 2 Slash Ticks
        drawSlashTick(xTier2_left, y0);
        drawSlashTick(xTier2_left, y3);

        // Tier 2 Text Badge (Overall Plot Depth)
        drawDimBadge(units.formatLength(y3 - y0), xTier2_left, (y0 + y3) / 2, -Math.PI / 2);

        ctx.restore();
    }

    /**
     * Draw setback boundary lines (inner offset) and clearance dimension badges
     */
    renderSetbacks(ctx, scale, isClean = false) {
        if (!this.plot || !this.plot.setbacks) return;
        const bounds = this.getBounds();
        if (!bounds) return;

        const sb = this.plot.setbacks;
        const bb = this.getBuildableBounds();
        if (!bb) return;

        ctx.save();

        // 0. Landscape Setback Lawn Wash (if enabled)
        if (this.showLandscapeWash && bounds) {
            ctx.save();
            ctx.fillStyle = isClean ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.09)';
            // Top setback strip
            if (bb.y > bounds.y) {
                ctx.fillRect(bounds.x, bounds.y, bounds.width, bb.y - bounds.y);
            }
            // Bottom setback strip
            if (bounds.y + bounds.height > bb.y + bb.height) {
                ctx.fillRect(bounds.x, bb.y + bb.height, bounds.width, (bounds.y + bounds.height) - (bb.y + bb.height));
            }
            // Left setback strip
            if (bb.x > bounds.x) {
                ctx.fillRect(bounds.x, bb.y, bb.x - bounds.x, bb.height);
            }
            // Right setback strip
            if (bounds.x + bounds.width > bb.x + bb.width) {
                ctx.fillRect(bb.x + bb.width, bb.y, (bounds.x + bounds.width) - (bb.x + bb.width), bb.height);
            }

            // Subtle grass tufts in open setback yard
            ctx.strokeStyle = isClean ? 'rgba(22, 163, 74, 0.45)' : 'rgba(74, 222, 128, 0.35)';
            ctx.lineWidth = 1 / scale;
            const drawTuft = (tx, ty) => {
                ctx.beginPath();
                ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - 5 / scale);
                ctx.moveTo(tx, ty); ctx.lineTo(tx - 3 / scale, ty - 4 / scale);
                ctx.moveTo(tx, ty); ctx.lineTo(tx + 3 / scale, ty - 4 / scale);
                ctx.stroke();
            };
            const fy = bounds.y + bounds.height - (bounds.y + bounds.height - (bb.y + bb.height)) * 0.5;
            for (let i = 1; i <= 4; i++) {
                drawTuft(bounds.x + (bounds.width * i) / 5, fy);
            }
            ctx.restore();
        }

        // 1. Buildable envelope dashed rectangle
        ctx.strokeStyle = isClean ? '#0284c7' : '#38bdf8';
        ctx.lineWidth = 1.5 / scale;
        ctx.setLineDash([8 / scale, 6 / scale]);
        ctx.strokeRect(bb.x, bb.y, bb.width, bb.height);
        ctx.setLineDash([]);

        // Subtle buildable area shading
        ctx.fillStyle = isClean ? 'rgba(2, 132, 199, 0.03)' : 'rgba(56, 189, 248, 0.04)';
        ctx.fillRect(bb.x, bb.y, bb.width, bb.height);

        // 2. Setback Margin Dimension Badges (only if 2-tier chained dimensions are disabled)
        if (!this.showChainedDimensions) {
            const fontSize = Math.max(10 / scale, 3);
            ctx.font = `600 ${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const drawMarginBadge = (text, x, y) => {
                const padX = 5 / scale;
                const padY = 3 / scale;
                const tw = ctx.measureText(text).width;
                ctx.fillStyle = isClean ? '#ffffff' : 'rgba(15, 23, 42, 0.9)';
                ctx.fillRect(x - tw / 2 - padX, y - fontSize / 2 - padY, tw + padX * 2, fontSize + padY * 2);
                ctx.strokeStyle = isClean ? '#0284c7' : '#0284c7';
                ctx.lineWidth = 1 / scale;
                ctx.strokeRect(x - tw / 2 - padX, y - fontSize / 2 - padY, tw + padX * 2, fontSize + padY * 2);
                ctx.fillStyle = isClean ? '#0284c7' : '#38bdf8';
                ctx.fillText(text, x, y);
            };

            if (sb.front && sb.front > 0) {
                const fy = bounds.y + bounds.height - sb.front / 2;
                const fx = bounds.x + bounds.width / 2;
                drawMarginBadge(`Front: ${units.formatLength(sb.front)}`, fx, fy);
            }
            if (sb.rear && sb.rear > 0) {
                const ry = bounds.y + sb.rear / 2;
                const rx = bounds.x + bounds.width / 2;
                drawMarginBadge(`Rear: ${units.formatLength(sb.rear)}`, rx, ry);
            }
            if (sb.left && sb.left > 0) {
                const lx = bounds.x + sb.left / 2;
                const ly = bounds.y + bounds.height / 2;
                drawMarginBadge(`L: ${units.formatLength(sb.left)}`, lx, ly);
            }
            if (sb.right && sb.right > 0) {
                const rx = bounds.x + bounds.width - sb.right / 2;
                const ry = bounds.y + bounds.height / 2;
                drawMarginBadge(`R: ${units.formatLength(sb.right)}`, rx, ry);
            }
        }

        // 3. Central envelope title badge
        const badgeTitle = `Buildable Area: ${units.formatLength(bb.width)} × ${units.formatLength(bb.height)}`;
        const centerBadgeY = bb.y + bb.height / 2;
        const centerBadgeX = bb.x + bb.width / 2;
        ctx.font = `600 ${Math.max(11 / scale, 3.5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isClean ? 'rgba(2, 132, 199, 0.85)' : 'rgba(56, 189, 248, 0.85)';
        ctx.fillText(badgeTitle, centerBadgeX, centerBadgeY);

        ctx.restore();
    }

    /**
     * Render boundary length dimensions
     */
    renderDimensions(ctx, scale) {
        const v = this.plot.vertices;
        const fontSize = Math.max(12 / scale, 3);
        ctx.font = `600 ${fontSize}px "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < v.length; i++) {
            const p1 = v[i];
            const p2 = v[(i + 1) % v.length];

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);

            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;

            // Offset dimension text perpendicular to line outward
            const perpAngle = angle + Math.PI / 2;
            const offsetDist = 18 / scale;
            const textX = midX + Math.cos(perpAngle) * offsetDist;
            const textY = midY + Math.sin(perpAngle) * offsetDist;

            const label = units.formatLength(length);

            // Draw pill background
            ctx.save();
            ctx.translate(textX, textY);
            let drawAngle = angle;
            if (drawAngle > Math.PI / 2) drawAngle -= Math.PI;
            if (drawAngle < -Math.PI / 2) drawAngle += Math.PI;
            ctx.rotate(drawAngle);

            const textWidth = ctx.measureText(label).width;
            const pad = 4 / scale;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.fillRect(-textWidth / 2 - pad, -fontSize / 2 - pad, textWidth + pad * 2, fontSize + pad * 2);

            ctx.strokeStyle = '#eab308';
            ctx.lineWidth = 1 / scale;
            ctx.strokeRect(-textWidth / 2 - pad, -fontSize / 2 - pad, textWidth + pad * 2, fontSize + pad * 2);

            ctx.fillStyle = '#fef08a';
            ctx.fillText(label, 0, 0);
            ctx.restore();
        }
    }

    /**
     * Render road in front of plot
     */
    renderRoad(ctx, scale) {
        const bounds = this.getBounds();
        if (!bounds) return;

        // Draw road at the front (bottom by default)
        const roadY = bounds.y + bounds.height + (12 / scale);
        const roadHeight = 40 / scale;
        const roadX1 = bounds.x - (60 / scale);
        const roadX2 = bounds.x + bounds.width + (60 / scale);

        ctx.save();
        ctx.fillStyle = 'rgba(100, 116, 139, 0.2)';
        ctx.fillRect(roadX1, roadY, roadX2 - roadX1, roadHeight);

        // Road centerline
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.5 / scale;
        ctx.setLineDash([8 / scale, 8 / scale]);
        ctx.beginPath();
        ctx.moveTo(roadX1, roadY + roadHeight / 2);
        ctx.lineTo(roadX2, roadY + roadHeight / 2);
        ctx.stroke();

        // Text
        ctx.font = `italic 600 ${Math.max(11 / scale, 3)}px sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.fillText('ROAD (ENTRY FRONT)', bounds.x + bounds.width / 2, roadY + roadHeight / 2 - (6 / scale));
        ctx.restore();
    }

    /**
     * Get compass center and radius in world space
     */
    getCompassBounds(scale = 1.0) {
        const bounds = this.getBounds();
        if (!bounds) return null;
        return {
            cx: bounds.x + bounds.width + (60 / scale),
            cy: bounds.y + (30 / scale),
            r: 26 / scale
        };
    }

    /**
     * Hit test compass for interactive rotation
     */
    hitTestCompass(x, y, scale = 1.0) {
        const cb = this.getCompassBounds(scale);
        if (!cb) return false;
        const dist = Math.hypot(x - cb.cx, y - cb.cy);
        return dist <= cb.r + (10 / scale);
    }

    /**
     * Rotate compass to point towards cursor
     */
    setCompassAngleFromPoint(worldX, worldY, scale = 1.0) {
        const cb = this.getCompassBounds(scale);
        if (!cb) return;
        const dx = worldX - cb.cx;
        const dy = worldY - cb.cy;
        const angleDeg = Math.round((Math.atan2(dy, dx) * 180 / Math.PI) + 90);
        this.northAngle = (angleDeg + 360) % 360;
    }

    /**
     * Render North compass arrow
     */
    renderCompass(ctx, scale, isSelected = false) {
        const cb = this.getCompassBounds(scale);
        if (!cb) return;

        const { cx, cy, r } = cb;

        ctx.save();
        ctx.translate(cx, cy);

        // Interactive outer rotation ring if selected or hovered
        if (isSelected) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.8 / scale;
            ctx.setLineDash([4 / scale, 4 / scale]);
            ctx.beginPath();
            ctx.arc(0, 0, r + 6 / scale, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Rotation handle dot at North
            ctx.save();
            ctx.rotate((this.northAngle * Math.PI) / 180);
            ctx.beginPath();
            ctx.arc(0, -r - 12 / scale, 4 / scale, 0, Math.PI * 2);
            ctx.fillStyle = '#38bdf8';
            ctx.fill();
            ctx.restore();
        }

        ctx.rotate((this.northAngle * Math.PI) / 180);

        // Compass background circle
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();

        // North arrow (top half dark, bottom half light)
        // Red North pointer
        ctx.beginPath();
        ctx.moveTo(0, -r + 2 / scale);
        ctx.lineTo(r * 0.35, 0);
        ctx.lineTo(0, -r * 0.2);
        ctx.closePath();
        ctx.fillStyle = '#ef4444';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, -r + 2 / scale);
        ctx.lineTo(-r * 0.35, 0);
        ctx.lineTo(0, -r * 0.2);
        ctx.closePath();
        ctx.fillStyle = '#dc2626';
        ctx.fill();

        // South pointer
        ctx.beginPath();
        ctx.moveTo(0, r - 2 / scale);
        ctx.lineTo(r * 0.35, 0);
        ctx.lineTo(0, -r * 0.2);
        ctx.closePath();
        ctx.fillStyle = '#cbd5e1';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, r - 2 / scale);
        ctx.lineTo(-r * 0.35, 0);
        ctx.lineTo(0, -r * 0.2);
        ctx.closePath();
        ctx.fillStyle = '#94a3b8';
        ctx.fill();

        // "N" label
        ctx.font = `bold ${Math.max(12 / scale, 4)}px sans-serif`;
        ctx.fillStyle = '#ef4444';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('N', 0, -r - (2 / scale));

        // Angle badge below compass
        ctx.font = `600 ${Math.max(9 / scale, 3)}px sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${this.northAngle}°`, 0, r + 4 / scale);

        ctx.restore();
    }

    /**
     * Hit test if point is inside plot or on edges
     */
    hitTest(x, y) {
        if (!this.plot || !this.plot.vertices) return false;
        const v = this.plot.vertices;
        let inside = false;
        for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
            const xi = v[i].x, yi = v[i].y;
            const xj = v[j].x, yj = v[j].y;
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
}
