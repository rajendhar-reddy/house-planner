/**
 * dimensions.js - Linear Architectural Dimensioning & Annotation Engine
 */

import { units } from './units.js';

let dimIdCounter = 1;

export class DimensionLine {
    constructor(start, end, offset = 24, customText = null) {
        this.id = `dim_${dimIdCounter++}`;
        this.start = { x: start.x, y: start.y };
        this.end = { x: end.x, y: end.y };
        this.offset = offset; // perpendicular offset in inches
        this.customText = customText;
    }

    getLength() {
        return Math.hypot(this.end.x - this.start.x, this.end.y - this.start.y);
    }

    getAngle() {
        return Math.atan2(this.end.y - this.start.y, this.end.x - this.start.x);
    }

    /**
     * Compute offset points for the dimension line
     */
    getGeometry() {
        const dx = this.end.x - this.start.x;
        const dy = this.end.y - this.start.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) return null;

        const nx = -dy / len;
        const ny = dx / len;

        const p1 = {
            x: this.start.x + nx * this.offset,
            y: this.start.y + ny * this.offset
        };
        const p2 = {
            x: this.end.x + nx * this.offset,
            y: this.end.y + ny * this.offset
        };

        return {
            p1,
            p2,
            nx,
            ny,
            len,
            angle: Math.atan2(p2.y - p1.y, p2.x - p1.x)
        };
    }

    hitTest(px, py, scale) {
        const geom = this.getGeometry();
        if (!geom) return false;

        const dx = geom.p2.x - geom.p1.x;
        const dy = geom.p2.y - geom.p1.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 0.001) return false;

        let t = ((px - geom.p1.x) * dx + (py - geom.p1.y) * dy) / lenSq;
        if (t < 0 || t > 1) return false;

        const projX = geom.p1.x + t * dx;
        const projY = geom.p1.y + t * dy;
        const dist = Math.hypot(px - projX, py - projY);

        return dist <= 8 / scale;
    }
}

export class DimensionManager {
    constructor() {
        this.dimensions = [];
        this.selectedDimId = null;
    }

    addDimension(start, end, offset = 24, customText = null) {
        if (Math.hypot(end.x - start.x, end.y - start.y) < 1.0) return null;
        const dim = new DimensionLine(start, end, offset, customText);
        this.dimensions.push(dim);
        return dim;
    }

    removeDimension(id) {
        this.dimensions = this.dimensions.filter(d => d.id !== id);
        if (this.selectedDimId === id) this.selectedDimId = null;
    }

    getDimById(id) {
        return this.dimensions.find(d => d.id === id);
    }

    clear() {
        this.dimensions = [];
        this.selectedDimId = null;
    }

    render(ctx, scale, isExport = false, style = 'blueprint') {
        for (const dim of this.dimensions) {
            const isSelected = dim.id === this.selectedDimId;
            this.renderSingleDimension(ctx, dim, scale, isSelected, isExport, style);
        }
    }

    renderSingleDimension(ctx, dim, scale, isSelected, isExport = false, style = 'blueprint') {
        const startPt = dim.start || dim.p1 || { x: 0, y: 0 };
        const endPt = dim.end || dim.p2 || { x: 0, y: 0 };
        const dimObj = (dim instanceof DimensionLine) ? dim : Object.assign(new DimensionLine(startPt, endPt, dim.offset, dim.customText || dim.text), dim);
        const geom = dimObj.getGeometry();
        if (!geom) return;

        const isClean = style === 'clean';
        const label = dimObj.customText || units.formatLength(geom.len);
        const lineColor = (isSelected && !isExport)
            ? '#38bdf8'
            : (isClean ? '#334155' : (isExport ? '#cbd5e1' : '#94a3b8'));
        const tickColor = (isSelected && !isExport)
            ? '#38bdf8'
            : (isClean ? '#0f172a' : '#f8fafc');

        ctx.save();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = (isExport ? 1.5 : 1) / scale;

        // 1. Extension lines from measured points to past dimension line
        const extendPast = (isExport ? 8 : 6) / scale;
        const extP1_end = {
            x: geom.p1.x + geom.nx * (dimObj.offset > 0 ? extendPast : -extendPast),
            y: geom.p1.y + geom.ny * (dimObj.offset > 0 ? extendPast : -extendPast)
        };
        const extP2_end = {
            x: geom.p2.x + geom.nx * (dimObj.offset > 0 ? extendPast : -extendPast),
            y: geom.p2.y + geom.ny * (dimObj.offset > 0 ? extendPast : -extendPast)
        };

        ctx.beginPath();
        // Start extension
        ctx.moveTo(dimObj.start.x, dimObj.start.y);
        ctx.lineTo(extP1_end.x, extP1_end.y);
        // End extension
        ctx.moveTo(dimObj.end.x, dimObj.end.y);
        ctx.lineTo(extP2_end.x, extP2_end.y);
        ctx.stroke();

        // 2. Dimension line
        ctx.beginPath();
        ctx.moveTo(geom.p1.x, geom.p1.y);
        ctx.lineTo(geom.p2.x, geom.p2.y);
        ctx.stroke();

        // 3. Architectural 45-degree tick marks
        const tickSize = (isExport ? 9 : 6) / scale;
        this.drawArchitecturalTick(ctx, geom.p1.x, geom.p1.y, geom.angle, tickSize, tickColor, scale, isExport);
        this.drawArchitecturalTick(ctx, geom.p2.x, geom.p2.y, geom.angle, tickSize, tickColor, scale, isExport);

        // 4. Dimension text label
        const midX = (geom.p1.x + geom.p2.x) / 2;
        const midY = (geom.p1.y + geom.p2.y) / 2;

        ctx.save();
        ctx.translate(midX, midY);

        let textAngle = geom.angle;
        if (textAngle > Math.PI / 2) textAngle -= Math.PI;
        if (textAngle < -Math.PI / 2) textAngle += Math.PI;
        ctx.rotate(textAngle);

        const targetFontPx = isExport ? 22 : 11;
        const fontSize = Math.max(targetFontPx / scale, 3);
        ctx.font = `600 ${fontSize}px sans-serif`;
        const textW = ctx.measureText(label).width;
        const padX = (isExport ? 6 : 4) / scale;
        const padY = (isExport ? 3 : 2) / scale;

        // Cutout background behind text
        ctx.fillStyle = isClean ? '#ffffff' : '#0f172a';
        ctx.fillRect(-textW / 2 - padX, -fontSize / 2 - padY, textW + padX * 2, fontSize + padY * 2);

        ctx.fillStyle = (isSelected && !isExport)
            ? '#38bdf8'
            : (isClean ? '#0f172a' : '#f8fafc');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 0, 0);

        ctx.restore();
        ctx.restore();
    }

    drawArchitecturalTick(ctx, x, y, angle, size, color, scale, isExport = false) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + Math.PI / 4); // 45 degree architectural slash
        ctx.strokeStyle = color;
        ctx.lineWidth = (isExport ? 2.2 : 1.8) / scale;
        ctx.beginPath();
        ctx.moveTo(-size, 0);
        ctx.lineTo(size, 0);
        ctx.stroke();
        ctx.restore();
    }

    getDimAt(x, y, scale) {
        for (let i = this.dimensions.length - 1; i >= 0; i--) {
            if (this.dimensions[i].hitTest(x, y, scale)) {
                return this.dimensions[i];
            }
        }
        return null;
    }
}
