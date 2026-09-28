/**
 * columns.js - Reinforced Cement Concrete (RCC) Structural Columns Engine
 */

import { units } from './units.js';

let columnIdCounter = 1;

export const COLUMN_PRESETS = [
    { name: '9" × 9" (Square Pier)', width: 9, depth: 9, label: 'C-9x9' },
    { name: '9" × 12" (Standard Beam Junction)', width: 9, depth: 12, label: 'C-9x12' },
    { name: '9" × 15" (Heavy Load / Multi-Floor)', width: 9, depth: 15, label: 'C-9x15' },
    { name: '9" × 18" (Stilt / Parking Column)', width: 9, depth: 18, label: 'C-9x18' },
    { name: '12" × 12" (Heavy Square Column)', width: 12, depth: 12, label: 'C-12x12' },
    { name: '12" × 18" (Commercial Span Column)', width: 12, depth: 18, label: 'C-12x18' }
];

export class Column {
    constructor(x, y, options = {}) {
        this.id = `col_${columnIdCounter++}`;
        this.x = x;
        this.y = y;
        this.width = options.width || 9;     // 9 inches default
        this.depth = options.depth || 12;    // 12 inches default
        this.rotation = options.rotation !== undefined ? options.rotation : 0; // 0 or 90
        this.type = options.type || 'standard_rcc'; // 'standard_rcc' | 'circular'
        this.name = options.name || `C${columnIdCounter - 1}`;
        this.showLabel = options.showLabel || false;
    }

    rotate(deg = 90) {
        this.rotation = ((this.rotation + deg) % 360 + 360) % 360;
    }

    getLocalDimensions() {
        const rad = (this.rotation * Math.PI) / 180;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        return {
            w: this.width * cos + this.depth * sin,
            h: this.width * sin + this.depth * cos
        };
    }

    getBounds() {
        const dim = this.getLocalDimensions();
        return {
            x: this.x - dim.w / 2,
            y: this.y - dim.h / 2,
            width: dim.w,
            height: dim.h
        };
    }

    getPolygon() {
        const hw = this.width / 2;
        const hd = this.depth / 2;
        const rad = (this.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const corners = [
            { x: -hw, y: -hd },
            { x: hw, y: -hd },
            { x: hw, y: hd },
            { x: -hw, y: hd }
        ];

        return corners.map(p => ({
            x: this.x + p.x * cos - p.y * sin,
            y: this.y + p.x * sin + p.y * cos
        }));
    }

    hitTest(px, py, scale = 1) {
        const rad = (-this.rotation * Math.PI) / 180;
        const dx = px - this.x;
        const dy = py - this.y;
        const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
        const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

        const hitTol = Math.max(6 / scale, 4); // touch tolerance
        const halfW = this.width / 2 + hitTol;
        const halfD = this.depth / 2 + hitTol;

        return Math.abs(localX) <= halfW && Math.abs(localY) <= halfD;
    }
}

export class ColumnManager {
    constructor() {
        this.columns = [];
        this.selectedColumnId = null;
        this.activePresetIndex = 1; // 9" x 12" standard
    }

    addColumn(x, y, options = {}) {
        const preset = COLUMN_PRESETS[this.activePresetIndex] || COLUMN_PRESETS[1];
        const col = new Column(x, y, {
            width: options.width || preset.width,
            depth: options.depth || preset.depth,
            rotation: options.rotation !== undefined ? options.rotation : 0,
            name: options.name || `C${this.columns.length + 1}`,
            showLabel: options.showLabel || false
        });
        this.columns.push(col);
        return col;
    }

    removeColumn(id) {
        this.columns = this.columns.filter(c => c.id !== id);
        if (this.selectedColumnId === id) this.selectedColumnId = null;
    }

    getColumnById(id) {
        return this.columns.find(c => c.id === id);
    }

    clear() {
        this.columns = [];
        this.selectedColumnId = null;
    }

    /**
     * Smart Snap: snaps column center or flush edges to wall corners, T-junctions, and wall lines
     */
    getSnapPoint(worldX, worldY, wallManager, snapTolerance = 16) {
        if (!wallManager || !wallManager.walls) {
            return { x: worldX, y: worldY, snapped: false };
        }

        let bestSnap = null;
        let minDist = snapTolerance;

        for (const wall of wallManager.walls) {
            // Check wall vertices (corners and endpoints)
            for (const pt of [wall.start, wall.end]) {
                const dist = Math.hypot(worldX - pt.x, worldY - pt.y);
                if (dist < minDist) {
                    minDist = dist;
                    bestSnap = { x: pt.x, y: pt.y, snapped: true, type: 'wall_corner' };
                }
            }

            // Check projection onto wall centerline
            const dx = wall.end.x - wall.start.x;
            const dy = wall.end.y - wall.start.y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq > 0.001) {
                const t = Math.max(0, Math.min(1, ((worldX - wall.start.x) * dx + (worldY - wall.start.y) * dy) / lenSq));
                const projX = wall.start.x + t * dx;
                const projY = wall.start.y + t * dy;
                const dist = Math.hypot(worldX - projX, worldY - projY);
                if (dist < minDist) {
                    minDist = dist;
                    bestSnap = { x: projX, y: projY, snapped: true, type: 'wall_line' };
                }
            }
        }

        return bestSnap || { x: worldX, y: worldY, snapped: false };
    }

    getColumnAt(x, y, scale = 1) {
        for (let i = this.columns.length - 1; i >= 0; i--) {
            if (this.columns[i].hitTest(x, y, scale)) {
                return this.columns[i];
            }
        }
        return null;
    }

    render(ctx, scale, isExport = false, style = 'blueprint') {
        const isClean = style === 'clean';
        for (const col of this.columns) {
            const isSelected = col.id === this.selectedColumnId;
            this.renderSingleColumn(ctx, col, scale, isSelected, isExport, isClean);
        }
    }

    renderSingleColumn(ctx, col, scale, isSelected, isExport = false, isClean = false) {
        ctx.save();
        ctx.translate(col.x, col.y);
        if (col.rotation) {
            ctx.rotate((col.rotation * Math.PI) / 180);
        }

        const hw = col.width / 2;
        const hd = col.depth / 2;

        // 1. Column Solid RCC Core (Executive Architectural Fill)
        if (isClean) {
            ctx.fillStyle = '#0f172a'; // Deep solid charcoal / black like reference drawing
        } else {
            // Blueprint theme: Solid dark slate with crisp cyan outline
            ctx.fillStyle = isExport ? '#1e293b' : 'rgba(30, 41, 59, 0.95)';
        }
        ctx.fillRect(-hw, -hd, col.width, col.depth);

        // 2. Structural Cross / Rebar Tie hatching inside column
        ctx.strokeStyle = isClean ? 'rgba(255, 255, 255, 0.45)' : 'rgba(56, 189, 248, 0.55)';
        ctx.lineWidth = (isExport ? 1.2 : 0.9) / scale;
        ctx.beginPath();
        ctx.moveTo(-hw, -hd);
        ctx.lineTo(hw, hd);
        ctx.moveTo(hw, -hd);
        ctx.lineTo(-hw, hd);
        ctx.stroke();

        // 3. Outer boundary border
        const strokeColor = (isSelected && !isExport)
            ? '#38bdf8'
            : (isClean ? '#000000' : '#38bdf8');
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = ((isSelected && !isExport) ? 2.5 : (isExport ? 1.6 : 1.2)) / scale;
        ctx.strokeRect(-hw, -hd, col.width, col.depth);

        // 4. Optional Column Label (e.g. "C1")
        if (col.showLabel) {
            ctx.save();
            ctx.fillStyle = isClean ? '#0f172a' : '#f8fafc';
            ctx.font = `bold ${Math.max(8 / scale, 2.5)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(col.name, 0, hd + (8 / scale));
            ctx.restore();
        }

        // 5. Interactive Selection Handles (only in editor, not in export)
        if (isSelected && !isExport) {
            const handleSize = 5 / scale;
            ctx.fillStyle = '#38bdf8';
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 1 / scale;

            // 4 corner grips
            const pts = [
                [-hw, -hd],
                [hw, -hd],
                [hw, hd],
                [-hw, hd]
            ];
            for (const [px, py] of pts) {
                ctx.fillRect(px - handleSize / 2, py - handleSize / 2, handleSize, handleSize);
                ctx.strokeRect(px - handleSize / 2, py - handleSize / 2, handleSize, handleSize);
            }

            // Top Rotation Handle
            const stemLen = 14 / scale;
            const rotY = -hd - stemLen;
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.5 / scale;
            ctx.beginPath();
            ctx.moveTo(0, -hd);
            ctx.lineTo(0, rotY);
            ctx.stroke();

            ctx.fillStyle = '#0284c7';
            ctx.beginPath();
            ctx.arc(0, rotY, 4.5 / scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.5 / scale;
            ctx.stroke();
        }

        ctx.restore();
    }
}
