/**
 * slab.js - Roof Slab, Cantilever Projections & RCC Chajja System
 * Fully customizable building envelope contour and bounding-box slab projection,
 * per-edge overhangs (Front portico, Rear, Left/Right sunshade chajjas),
 * architectural dashed/dotted line styles, corner detailing (L-ticks, chamfers, fillets),
 * interactive drag handles, real-time dimension callouts, and export support.
 */

import { units } from './units.js';

export class SlabManager {
    constructor(app = null) {
        this.app = app;

        // Core Slab State
        this.enabled = false;
        this.mode = 'envelope'; // 'envelope' (adaptive building contour) | 'bounds' (rectangular bounding box)
        this.isUniform = true; // true = single offset for all edges, false = per-side
        this.uniformOffset = 18; // 18 inches (1'-6") standard architectural overhang

        // Per-edge overhang offsets in inches
        this.offsets = {
            front: 18,  // Cantilever / Balcony / Portico overhang
            rear: 18,   // Rear eave projection
            left: 18,   // Left sunshade / chajja
            right: 18   // Right sunshade / chajja
        };

        // Line Styling
        this.pattern = 'dashed'; // 'dashed' | 'dotted' | 'dash_dot' | 'solid'
        this.lineWidth = 1.4; // in px
        this.lineColor = '#38bdf8'; // Blueprint cyan default

        // Corner Styling
        this.cornerStyle = 'ticks'; // 'ticks' (L-bracket ticks) | 'sharp' | 'chamfer' | 'fillet'
        this.chamferDist = 6; // inches for chamfer or fillet radius

        // Fill & Hatching
        this.fillEnabled = false;
        this.fillColor = 'rgba(56, 189, 248, 0.05)';
        this.showHatch = false; // subtle 45-degree diagonal RCC hatch lines

        // Annotations & Callouts
        this.showLabel = true;
        this.labelText = ''; // empty string => auto-generated text
        this.labelPosition = 'front'; // 'front' | 'rear' | 'center'
        this.showDimensions = true; // show real architectural dimension callouts on overhangs

        // Cached geometry
        this.cachedPolygon = null;
        this.activeDragHandle = null;
        this.dragInitialOffsets = null;
    }

    /**
     * Set uniform offset and sync all 4 edges
     */
    setUniformOffset(val) {
        val = Math.max(0, val);
        this.uniformOffset = val;
        this.offsets.front = val;
        this.offsets.rear = val;
        this.offsets.left = val;
        this.offsets.right = val;
    }

    /**
     * Set specific edge offset
     */
    setEdgeOffset(edge, val) {
        val = Math.max(0, val);
        if (this.offsets[edge] !== undefined) {
            this.offsets[edge] = val;
        }
        if (this.isUniform) {
            this.uniformOffset = val;
            this.offsets.front = val;
            this.offsets.rear = val;
            this.offsets.left = val;
            this.offsets.right = val;
        }
    }

    /**
     * Apply standard architectural presets
     */
    applyPreset(presetName) {
        switch (presetName) {
            case 'standard':
                this.isUniform = true;
                this.setUniformOffset(18); // 1'-6" standard chajja
                this.pattern = 'dashed';
                this.cornerStyle = 'ticks';
                break;
            case 'portico':
                this.isUniform = false;
                this.offsets.front = 48; // 4'-0" deep entrance cantilever portico
                this.offsets.rear = 12;  // 1'-0" rear overhang
                this.offsets.left = 18;  // 1'-6" side chajja
                this.offsets.right = 18; // 1'-6" side chajja
                this.pattern = 'dashed';
                this.cornerStyle = 'ticks';
                this.showDimensions = true;
                break;
            case 'balcony':
                this.isUniform = false;
                this.offsets.front = 60; // 5'-0" cantilever balcony
                this.offsets.rear = 0;   // flush rear wall
                this.offsets.left = 24;  // 2'-0" side projections
                this.offsets.right = 24;
                this.pattern = 'dotted';
                this.cornerStyle = 'ticks';
                this.showDimensions = true;
                break;
            case 'terrace':
                this.isUniform = true;
                this.setUniformOffset(24); // 2'-0" terrace parapet eave
                this.pattern = 'dash_dot';
                this.cornerStyle = 'sharp';
                break;
            case 'flush':
                this.isUniform = true;
                this.setUniformOffset(0);
                this.pattern = 'solid';
                this.cornerStyle = 'sharp';
                break;
        }
    }

    /**
     * Get effective overhang offsets
     */
    getEffectiveOffsets() {
        if (this.isUniform) {
            const u = this.uniformOffset;
            return { front: u, rear: u, left: u, right: u };
        }
        return {
            front: this.offsets.front !== undefined ? this.offsets.front : 18,
            rear: this.offsets.rear !== undefined ? this.offsets.rear : 18,
            left: this.offsets.left !== undefined ? this.offsets.left : 18,
            right: this.offsets.right !== undefined ? this.offsets.right : 18
        };
    }

    /**
     * Compute bounding box of building base (exterior walls)
     */
    getBaseBounds(wallManager, plotManager) {
        if (wallManager) {
            if (typeof wallManager.getBounds === 'function') {
                const b = wallManager.getBounds(true);
                if (b && b.width > 0 && b.height > 0) return b;
                const bAll = wallManager.getBounds(false);
                if (bAll && bAll.width > 0 && bAll.height > 0) return bAll;
            }
        }
        if (plotManager && typeof plotManager.getBuildableBounds === 'function') {
            return plotManager.getBuildableBounds();
        }
        return null;
    }

    /**
     * Compute the full slab polygon based on mode and offsets
     */
    getSlabPolygon(wallManager, plotManager) {
        const off = this.getEffectiveOffsets();
        const baseBounds = this.getBaseBounds(wallManager, plotManager);
        if (!baseBounds) return null;

        // Mode 1: Envelope (Adaptive Contour of Exterior Walls)
        if (this.mode === 'envelope' && wallManager && wallManager.walls) {
            const contour = this.computeContourPolygon(wallManager.walls, off);
            if (contour && contour.length >= 3) {
                return contour;
            }
        }

        // Mode 2: Rectangular Bounding Box (or fallback for open/incomplete walls)
        const x1 = baseBounds.x - off.left;
        const y1 = baseBounds.y - off.rear;
        const x2 = baseBounds.x + baseBounds.width + off.right;
        const y2 = baseBounds.y + baseBounds.height + off.front;

        let rectPts = [
            { x: x1, y: y1 },
            { x: x2, y: y1 },
            { x: x2, y: y2 },
            { x: x1, y: y2 }
        ];

        if (this.cornerStyle === 'chamfer' && this.chamferDist > 0) {
            rectPts = this.applyChamfer(rectPts, this.chamferDist);
        }

        return rectPts;
    }

    /**
     * Compute adaptive outward contour polygon from exterior walls
     */
    computeContourPolygon(walls, off) {
        // Filter exterior walls
        let extWalls = walls.filter(w => w.type === 'exterior');
        if (extWalls.length < 3) {
            extWalls = walls.filter(w => w.type !== 'compound');
        }
        if (extWalls.length < 3) return null;

        // Try chaining walls into a closed loop
        const loop = this.chainWallsIntoLoop(extWalls);
        if (!loop || loop.length < 3) return null;

        // Ensure CCW winding (outward normal is to the right in screen coordinates)
        const pts = this.ensureCCWWinding(loop);
        const n = pts.length;
        if (n < 3) return null;

        // Compute outward offset lines for each edge
        const offsetLines = [];
        for (let i = 0; i < n; i++) {
            const p1 = pts[i];
            const p2 = pts[(i + 1) % n];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy);
            if (len < 0.001) continue;

            // In screen coords (Y down, CCW): Outward normal is (dy/len, -dx/len)
            const nx = dy / len;
            const ny = -dx / len;

            // Determine appropriate offset distance based on edge orientation
            let edgeDist = off.front;
            if (ny > 0.5) {
                edgeDist = off.front; // South / Bottom edge
            } else if (ny < -0.5) {
                edgeDist = off.rear;  // North / Top edge
            } else if (nx < -0.5) {
                edgeDist = off.left;  // West / Left edge
            } else if (nx > 0.5) {
                edgeDist = off.right; // East / Right edge
            } else {
                // Diagonal: blend based on angle
                const wX = Math.abs(nx);
                const wY = Math.abs(ny);
                const dX = nx > 0 ? off.right : off.left;
                const dY = ny > 0 ? off.front : off.rear;
                edgeDist = (wX * dX + wY * dY) / Math.max(0.001, wX + wY);
            }

            offsetLines.push({
                p1: { x: p1.x + nx * edgeDist, y: p1.y + ny * edgeDist },
                p2: { x: p2.x + nx * edgeDist, y: p2.y + ny * edgeDist },
                dir: { x: dx / len, y: dy / len },
                dist: edgeDist,
                normal: { x: nx, y: ny }
            });
        }

        if (offsetLines.length < 3) return null;

        // Intersect adjacent offset lines to find new vertices
        const poly = [];
        const m = offsetLines.length;
        for (let i = 0; i < m; i++) {
            const l1 = offsetLines[(i - 1 + m) % m];
            const l2 = offsetLines[i];
            const inter = this.intersectLines(l1.p1, l1.p2, l2.p1, l2.p2);
            if (inter) {
                poly.push(inter);
            } else {
                poly.push({ x: l2.p1.x, y: l2.p1.y });
            }
        }

        if (this.cornerStyle === 'chamfer' && this.chamferDist > 0) {
            return this.applyChamfer(poly, this.chamferDist);
        }

        return poly;
    }

    /**
     * Chain walls into an ordered loop of vertices
     */
    chainWallsIntoLoop(walls) {
        if (!walls || walls.length === 0) return null;
        const segs = walls.map(w => ({
            p1: { x: w.start.x, y: w.start.y },
            p2: { x: w.end.x, y: w.end.y },
            used: false
        }));

        const snapDist = 4.0; // 4 inch tolerance for wall joint snaps
        const loop = [{ ...segs[0].p1 }];
        let curr = { ...segs[0].p2 };
        segs[0].used = true;
        loop.push(curr);

        let safety = segs.length * 2;
        while (safety-- > 0) {
            let foundNext = false;
            for (const s of segs) {
                if (s.used) continue;
                if (Math.hypot(s.p1.x - curr.x, s.p1.y - curr.y) <= snapDist) {
                    curr = { ...s.p2 };
                    s.used = true;
                    loop.push(curr);
                    foundNext = true;
                    break;
                } else if (Math.hypot(s.p2.x - curr.x, s.p2.y - curr.y) <= snapDist) {
                    curr = { ...s.p1 };
                    s.used = true;
                    loop.push(curr);
                    foundNext = true;
                    break;
                }
            }
            if (!foundNext) break;
            // Check if loop closed back to start
            if (Math.hypot(curr.x - loop[0].x, curr.y - loop[0].y) <= snapDist) {
                loop.pop(); // Remove duplicate closing vertex
                break;
            }
        }

        return loop.length >= 3 ? loop : null;
    }

    /**
     * Ensure polygon vertices are wound CCW in screen coords
     */
    ensureCCWWinding(pts) {
        let area = 0;
        for (let i = 0; i < pts.length; i++) {
            const j = (i + 1) % pts.length;
            area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
        }
        if (area < 0) {
            return [...pts].reverse();
        }
        return pts;
    }

    /**
     * Intersect two 2D lines
     */
    intersectLines(p1, p2, p3, p4) {
        const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
        const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
        const det = d1x * d2y - d1y * d2x;
        if (Math.abs(det) < 1e-5) return null; // Parallel

        const dx = p3.x - p1.x;
        const dy = p3.y - p1.y;
        const t1 = (dx * d2y - dy * d2x) / det;
        return {
            x: p1.x + t1 * d1x,
            y: p1.y + t1 * d1y
        };
    }

    /**
     * Apply 45-degree chamfer to polygon corners
     */
    applyChamfer(pts, chamfer) {
        if (!pts || pts.length < 3 || chamfer <= 0) return pts;
        const res = [];
        const n = pts.length;
        for (let i = 0; i < n; i++) {
            const prev = pts[(i - 1 + n) % n];
            const curr = pts[i];
            const next = pts[(i + 1) % n];

            const d1x = prev.x - curr.x, d1y = prev.y - curr.y;
            const d2x = next.x - curr.x, d2y = next.y - curr.y;
            const l1 = Math.hypot(d1x, d1y);
            const l2 = Math.hypot(d2x, d2y);

            const c = Math.min(chamfer, l1 * 0.45, l2 * 0.45);
            if (c > 1.0) {
                res.push({ x: curr.x + (d1x / l1) * c, y: curr.y + (d1y / l1) * c });
                res.push({ x: curr.x + (d2x / l2) * c, y: curr.y + (d2y / l2) * c });
            } else {
                res.push(curr);
            }
        }
        return res;
    }

    /**
     * Render complete slab projection on canvas
     */
    render(ctx, scale, isSelected = false, wallManager = null, isClean = false, isExport = false) {
        if (!this.enabled) return;

        const poly = this.getSlabPolygon(wallManager, this.app ? this.app.plotManager : null);
        if (!poly || poly.length < 3) return;

        ctx.save();

        // 1. Optional Shading Fill & Concrete Hatch
        if (this.fillEnabled || this.showHatch) {
            ctx.beginPath();
            ctx.moveTo(poly[0].x, poly[0].y);
            for (let i = 1; i < poly.length; i++) {
                ctx.lineTo(poly[i].x, poly[i].y);
            }
            ctx.closePath();

            if (this.fillEnabled) {
                ctx.fillStyle = isClean ? 'rgba(2, 132, 199, 0.04)' : (this.fillColor || 'rgba(56, 189, 248, 0.05)');
                ctx.fill();
            }

            if (this.showHatch) {
                ctx.save();
                ctx.clip();
                this.renderHatchLines(ctx, poly, scale, isClean);
                ctx.restore();
            }
        }

        // 2. Slab Projection Line
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) {
            ctx.lineTo(poly[i].x, poly[i].y);
        }
        ctx.closePath();

        const strokeColor = isSelected ? '#38bdf8' : (isClean ? '#0284c7' : (this.lineColor || '#38bdf8'));
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = (this.lineWidth * (isExport ? 1.3 : 1.0)) / scale;

        // Apply line dash pattern
        switch (this.pattern) {
            case 'dotted':
                ctx.setLineDash([3 / scale, 4 / scale]);
                break;
            case 'dashed':
                ctx.setLineDash([8 / scale, 5 / scale]);
                break;
            case 'dash_dot':
                ctx.setLineDash([12 / scale, 4 / scale, 3 / scale, 4 / scale]);
                break;
            case 'solid':
                ctx.setLineDash([]);
                break;
            default:
                ctx.setLineDash([8 / scale, 5 / scale]);
        }

        ctx.stroke();
        ctx.setLineDash([]);

        // 3. Corner Detailing (L-bracket crosshairs)
        if (this.cornerStyle === 'ticks') {
            this.renderCornerTicks(ctx, poly, scale, isClean, isExport);
        }

        // 4. Overhang Dimension Callouts
        if (this.showDimensions) {
            this.renderOverhangDimensions(ctx, poly, scale, wallManager, isClean, isExport);
        }

        // 5. Text Annotation Banner
        if (this.showLabel) {
            this.renderAnnotationBanner(ctx, poly, scale, isClean, isExport);
        }

        // 6. Interactive Drag Handles (when selected or hovered)
        if (isSelected && !isExport) {
            this.renderInteractiveHandles(ctx, poly, scale);
        }

        ctx.restore();
    }

    /**
     * Render subtle diagonal 45° RCC hatch lines
     */
    renderHatchLines(ctx, poly, scale, isClean) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of poly) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }

        const step = 24; // 24 inches spacing
        ctx.strokeStyle = isClean ? 'rgba(2, 132, 199, 0.12)' : 'rgba(56, 189, 248, 0.10)';
        ctx.lineWidth = 0.8 / scale;
        ctx.beginPath();
        for (let x = minX - (maxY - minY); x < maxX + (maxY - minY); x += step) {
            ctx.moveTo(x, minY);
            ctx.lineTo(x + (maxY - minY), maxY);
        }
        ctx.stroke();
    }

    /**
     * Render architectural L-bracket ticks at all polygon corners
     */
    renderCornerTicks(ctx, poly, scale, isClean, isExport) {
        const tick = (isExport ? 8 : 6) / scale;
        ctx.strokeStyle = isClean ? '#0369a1' : '#7dd3fc';
        ctx.lineWidth = (isExport ? 1.2 : 1.0) / scale;
        ctx.beginPath();

        const n = poly.length;
        for (let i = 0; i < n; i++) {
            const curr = poly[i];
            const prev = poly[(i - 1 + n) % n];
            const next = poly[(i + 1) % n];

            const v1x = prev.x - curr.x, v1y = prev.y - curr.y;
            const v2x = next.x - curr.x, v2y = next.y - curr.y;
            const l1 = Math.hypot(v1x, v1y);
            const l2 = Math.hypot(v2x, v2y);
            if (l1 < 0.1 || l2 < 0.1) continue;

            // Arms extending along outward perpendicular directions
            ctx.moveTo(curr.x, curr.y);
            ctx.lineTo(curr.x + (v1x / l1) * tick, curr.y + (v1y / l1) * tick);

            ctx.moveTo(curr.x, curr.y);
            ctx.lineTo(curr.x + (v2x / l2) * tick, curr.y + (v2y / l2) * tick);
        }
        ctx.stroke();
    }

    /**
     * Render architectural dimension callouts showing overhang on each side
     */
    renderOverhangDimensions(ctx, poly, scale, wallManager, isClean, isExport) {
        const baseBounds = this.getBaseBounds(wallManager, this.app ? this.app.plotManager : null);
        if (!baseBounds) return;

        const off = this.getEffectiveOffsets();
        const fontSize = Math.max((isExport ? 9 : 7.5) / scale, 3);
        ctx.font = `600 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const textColor = isClean ? '#0369a1' : '#38bdf8';
        const dimLineColor = isClean ? 'rgba(3, 105, 161, 0.45)' : 'rgba(56, 189, 248, 0.45)';

        // 1. Front Overhang Callout (at bottom)
        if (off.front > 0) {
            const cx = baseBounds.x + baseBounds.width / 2;
            const yWall = baseBounds.y + baseBounds.height;
            const ySlab = yWall + off.front;
            const label = off.front >= 36 ? `↕ ${units.formatLength(off.front)} CANTILEVER` : `↕ ${units.formatLength(off.front)}`;

            this.drawDimensionCallout(ctx, cx, yWall, ySlab, label, fontSize, scale, isClean, textColor, dimLineColor, 'vertical');
        }

        // 2. Rear Overhang Callout (at top)
        if (off.rear > 0 && (!this.isUniform || off.front === 0)) {
            const cx = baseBounds.x + baseBounds.width / 2;
            const yWall = baseBounds.y;
            const ySlab = yWall - off.rear;
            const label = `↕ ${units.formatLength(off.rear)}`;

            this.drawDimensionCallout(ctx, cx, yWall, ySlab, label, fontSize, scale, isClean, textColor, dimLineColor, 'vertical');
        }

        // 3. Left Overhang Callout
        if (off.left > 0 && (!this.isUniform || (off.front === 0 && off.rear === 0))) {
            const cy = baseBounds.y + baseBounds.height / 2;
            const xWall = baseBounds.x;
            const xSlab = xWall - off.left;
            const label = `↔ ${units.formatLength(off.left)}`;

            this.drawDimensionCallout(ctx, cy, xWall, xSlab, label, fontSize, scale, isClean, textColor, dimLineColor, 'horizontal');
        }

        // 4. Right Overhang Callout
        if (off.right > 0 && !this.isUniform) {
            const cy = baseBounds.y + baseBounds.height / 2;
            const xWall = baseBounds.x + baseBounds.width;
            const xSlab = xWall + off.right;
            const label = `↔ ${units.formatLength(off.right)}`;

            this.drawDimensionCallout(ctx, cy, xWall, xSlab, label, fontSize, scale, isClean, textColor, dimLineColor, 'horizontal');
        }
    }

    /**
     * Draw single dimension callout line with text pill
     */
    drawDimensionCallout(ctx, coord, valWall, valSlab, text, fontSize, scale, isClean, textColor, dimLineColor, orient) {
        ctx.save();
        ctx.strokeStyle = dimLineColor;
        ctx.lineWidth = 1.0 / scale;
        ctx.setLineDash([2 / scale, 2 / scale]);

        const tickHalf = 3 / scale;
        if (orient === 'vertical') {
            const x = coord;
            ctx.beginPath();
            ctx.moveTo(x, valWall);
            ctx.lineTo(x, valSlab);
            // End ticks
            ctx.moveTo(x - tickHalf, valWall); ctx.lineTo(x + tickHalf, valWall);
            ctx.moveTo(x - tickHalf, valSlab); ctx.lineTo(x + tickHalf, valSlab);
            ctx.stroke();

            // Text pill
            const midY = (valWall + valSlab) / 2;
            const tw = ctx.measureText(text).width;
            ctx.setLineDash([]);
            ctx.fillStyle = isClean ? 'rgba(255, 255, 255, 0.92)' : 'rgba(15, 23, 42, 0.90)';
            ctx.fillRect(x - tw / 2 - 3 / scale, midY - fontSize / 2 - 2 / scale, tw + 6 / scale, fontSize + 4 / scale);
            ctx.fillStyle = textColor;
            ctx.fillText(text, x, midY);
        } else {
            const y = coord;
            ctx.beginPath();
            ctx.moveTo(valWall, y);
            ctx.lineTo(valSlab, y);
            // End ticks
            ctx.moveTo(valWall, y - tickHalf); ctx.lineTo(valWall, y + tickHalf);
            ctx.moveTo(valSlab, y - tickHalf); ctx.lineTo(valSlab, y + tickHalf);
            ctx.stroke();

            // Text pill
            const midX = (valWall + valSlab) / 2;
            const tw = ctx.measureText(text).width;
            ctx.setLineDash([]);
            ctx.fillStyle = isClean ? 'rgba(255, 255, 255, 0.92)' : 'rgba(15, 23, 42, 0.90)';
            ctx.fillRect(midX - tw / 2 - 3 / scale, y - fontSize / 2 - 2 / scale, tw + 6 / scale, fontSize + 4 / scale);
            ctx.fillStyle = textColor;
            ctx.fillText(text, midX, y);
        }
        ctx.restore();
    }

    /**
     * Render architectural annotation banner
     */
    renderAnnotationBanner(ctx, poly, scale, isClean, isExport) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of poly) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }

        const off = this.getEffectiveOffsets();
        let text = this.labelText ? this.labelText.trim() : '';
        if (!text) {
            if (this.isUniform) {
                text = `╌ ╌ DOTTED LINE INDICATES SLAB PROJECTION (${units.formatLength(this.uniformOffset)}) ╌ ╌`;
            } else {
                text = `╌ ╌ ROOF SLAB PROJECTION (FRONT: ${units.formatLength(off.front)}, REAR: ${units.formatLength(off.rear)}, SIDES: ${units.formatLength(off.left)}) ╌ ╌`;
            }
        }

        const fontSize = Math.max((isExport ? 10 : 8.5) / scale, 3.2);
        ctx.font = `600 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        let textX = (minX + maxX) / 2;
        let textY = maxY + (14 / scale);

        if (this.labelPosition === 'rear') {
            textY = minY - (6 / scale);
        } else if (this.labelPosition === 'center') {
            textY = (minY + maxY) / 2;
            ctx.textBaseline = 'middle';
        }

        const tw = ctx.measureText(text).width;
        ctx.fillStyle = isClean ? 'rgba(255, 255, 255, 0.94)' : 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(textX - tw / 2 - (5 / scale), textY - fontSize - (2 / scale), tw + (10 / scale), fontSize + (4 / scale));

        ctx.fillStyle = isClean ? '#0369a1' : '#38bdf8';
        ctx.fillText(text, textX, textY);
    }

    /**
     * Render interactive midpoint edge drag handles and corner nodes
     */
    renderInteractiveHandles(ctx, poly, scale) {
        const bounds = this.getPolygonBounds(poly);
        if (!bounds) return;

        const handles = this.getHandleCoordinates(poly, bounds);
        const rHandle = 6.5 / scale;

        // Glowing selection boundary
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = 4 / scale;
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
        ctx.closePath();
        ctx.stroke();

        // 1. Edge Midpoint Handles (Front, Rear, Left, Right)
        for (const h of handles.edges) {
            ctx.beginPath();
            ctx.arc(h.x, h.y, rHandle, 0, Math.PI * 2);
            ctx.fillStyle = '#0284c7';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.8 / scale;
            ctx.stroke();

            // Directional arrow icon inside handle
            ctx.font = `bold ${Math.max(9 / scale, 3)}px sans-serif`;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(h.symbol, h.x, h.y);
        }

        // 2. Corner Handles
        for (const c of handles.corners) {
            ctx.beginPath();
            ctx.arc(c.x, c.y, 4.5 / scale, 0, Math.PI * 2);
            ctx.fillStyle = '#38bdf8';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.2 / scale;
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * Compute polygon bounding box
     */
    getPolygonBounds(poly) {
        if (!poly || poly.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of poly) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    /**
     * Get handle coordinates for interaction
     */
    getHandleCoordinates(poly, bounds) {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;

        return {
            edges: [
                { id: 'front', x: cx, y: bounds.y + bounds.height, symbol: '↕', label: 'Front Overhang' },
                { id: 'rear', x: cx, y: bounds.y, symbol: '↕', label: 'Rear Overhang' },
                { id: 'left', x: bounds.x, y: cy, symbol: '↔', label: 'Left Overhang' },
                { id: 'right', x: bounds.x + bounds.width, y: cy, symbol: '↔', label: 'Right Overhang' }
            ],
            corners: poly.map((p, idx) => ({ id: `corner_${idx}`, x: p.x, y: p.y, index: idx }))
        };
    }

    /**
     * Hit test slab polygon perimeter or body
     */
    hitTest(x, y, scale) {
        if (!this.enabled) return false;
        const poly = this.getSlabPolygon(this.app ? this.app.wallManager : null, this.app ? this.app.plotManager : null);
        if (!poly || poly.length < 3) return false;

        const tolerance = Math.max(12 / scale, 6);

        // Check proximity to any slab edge
        const n = poly.length;
        for (let i = 0; i < n; i++) {
            const p1 = poly[i];
            const p2 = poly[(i + 1) % n];
            const dist = this.pointToSegmentDistance({ x, y }, p1, p2);
            if (dist <= tolerance) {
                return true;
            }
        }
        return false;
    }

    /**
     * Hit test interactive drag handles
     */
    hitTestHandles(x, y, scale) {
        if (!this.enabled) return null;
        const poly = this.getSlabPolygon(this.app ? this.app.wallManager : null, this.app ? this.app.plotManager : null);
        if (!poly || poly.length < 3) return null;

        const bounds = this.getPolygonBounds(poly);
        if (!bounds) return null;

        const handles = this.getHandleCoordinates(poly, bounds);
        const rHit = Math.max(12 / scale, 8);

        // Check edge handles first
        for (const h of handles.edges) {
            if (Math.hypot(x - h.x, y - h.y) <= rHit) {
                return { type: 'edge', id: h.id, label: h.label, x: h.x, y: h.y };
            }
        }

        // Check corner handles
        for (const c of handles.corners) {
            if (Math.hypot(x - c.x, y - c.y) <= rHit) {
                return { type: 'corner', id: c.id, index: c.index, x: c.x, y: c.y };
            }
        }

        return null;
    }

    /**
     * Handle mouse dragging of slab handles
     */
    handleDrag(handle, currentX, currentY, startX, startY) {
        if (!handle) return;
        const dx = currentX - startX;
        const dy = currentY - startY;

        if (!this.dragInitialOffsets) {
            this.dragInitialOffsets = {
                uniform: this.uniformOffset,
                front: this.offsets.front,
                rear: this.offsets.rear,
                left: this.offsets.left,
                right: this.offsets.right
            };
        }

        const init = this.dragInitialOffsets;

        if (handle.type === 'edge') {
            switch (handle.id) {
                case 'front': {
                    const newOff = Math.max(0, Math.round(init.front + dy));
                    if (this.isUniform) {
                        this.setUniformOffset(newOff);
                    } else {
                        this.offsets.front = newOff;
                    }
                    break;
                }
                case 'rear': {
                    const newOff = Math.max(0, Math.round(init.rear - dy));
                    if (this.isUniform) {
                        this.setUniformOffset(newOff);
                    } else {
                        this.offsets.rear = newOff;
                    }
                    break;
                }
                case 'left': {
                    const newOff = Math.max(0, Math.round(init.left - dx));
                    if (this.isUniform) {
                        this.setUniformOffset(newOff);
                    } else {
                        this.offsets.left = newOff;
                    }
                    break;
                }
                case 'right': {
                    const newOff = Math.max(0, Math.round(init.right + dx));
                    if (this.isUniform) {
                        this.setUniformOffset(newOff);
                    } else {
                        this.offsets.right = newOff;
                    }
                    break;
                }
            }
        } else if (handle.type === 'corner') {
            // Dragging corner scales uniform offset proportionally
            const deltaMax = Math.max(Math.abs(dx), Math.abs(dy));
            const sign = (dx + dy) >= 0 ? 1 : -1;
            const newOff = Math.max(0, Math.round(init.uniform + sign * deltaMax));
            this.setUniformOffset(newOff);
        }
    }

    /**
     * Finish dragging
     */
    finishDrag() {
        this.dragInitialOffsets = null;
    }

    /**
     * Helper: Point to segment distance
     */
    pointToSegmentDistance(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-4) return Math.hypot(p.x - a.x, p.y - a.y);
        let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }

    /**
     * Serialize state to JSON object
     */
    serialize() {
        return {
            enabled: this.enabled,
            mode: this.mode,
            isUniform: this.isUniform,
            uniformOffset: this.uniformOffset,
            offsets: { ...this.offsets },
            pattern: this.pattern,
            lineWidth: this.lineWidth,
            lineColor: this.lineColor,
            cornerStyle: this.cornerStyle,
            chamferDist: this.chamferDist,
            fillEnabled: this.fillEnabled,
            fillColor: this.fillColor,
            showHatch: this.showHatch,
            showLabel: this.showLabel,
            labelText: this.labelText,
            labelPosition: this.labelPosition,
            showDimensions: this.showDimensions
        };
    }

    /**
     * Deserialize state from JSON object
     */
    deserialize(data) {
        if (!data) return;
        if (data.enabled !== undefined) this.enabled = !!data.enabled;
        if (data.mode !== undefined) this.mode = data.mode;
        if (data.isUniform !== undefined) this.isUniform = !!data.isUniform;
        if (data.uniformOffset !== undefined) this.uniformOffset = data.uniformOffset;
        if (data.offsets) {
            this.offsets = {
                front: data.offsets.front !== undefined ? data.offsets.front : 18,
                rear: data.offsets.rear !== undefined ? data.offsets.rear : 18,
                left: data.offsets.left !== undefined ? data.offsets.left : 18,
                right: data.offsets.right !== undefined ? data.offsets.right : 18
            };
        }
        if (data.pattern !== undefined) this.pattern = data.pattern;
        if (data.lineWidth !== undefined) this.lineWidth = data.lineWidth;
        if (data.lineColor !== undefined) this.lineColor = data.lineColor;
        if (data.cornerStyle !== undefined) this.cornerStyle = data.cornerStyle;
        if (data.chamferDist !== undefined) this.chamferDist = data.chamferDist;
        if (data.fillEnabled !== undefined) this.fillEnabled = !!data.fillEnabled;
        if (data.fillColor !== undefined) this.fillColor = data.fillColor;
        if (data.showHatch !== undefined) this.showHatch = !!data.showHatch;
        if (data.showLabel !== undefined) this.showLabel = !!data.showLabel;
        if (data.labelText !== undefined) this.labelText = data.labelText;
        if (data.labelPosition !== undefined) this.labelPosition = data.labelPosition;
        if (data.showDimensions !== undefined) this.showDimensions = !!data.showDimensions;
    }
}
