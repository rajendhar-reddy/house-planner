/**
 * roads.js - Multi-Road Site & Street Planning System
 */

import { units } from './units.js';

let roadIdCounter = 1;

export const ROAD_PRESETS = [
    { name: '20 ft Residential Street', width: 240 }, // 20 feet
    { name: '30 ft Colony Road', width: 360 },        // 30 feet
    { name: '40 ft Sector Road', width: 480 },        // 40 feet
    { name: '60 ft Main Avenue', width: 720 },        // 60 feet
    { name: '80 ft Highway / Arterial', width: 960 }  // 80 feet
];

export class Road {
    constructor(options = {}) {
        this.id = `road_${roadIdCounter++}`;
        this.side = options.side || 'front'; // 'front' | 'rear' | 'left' | 'right' | 'custom'
        this.width = options.width || 360;   // 30 ft default
        this.name = options.name || `${units.formatLength(this.width)} Wide Road`;
        this.hasSidewalk = options.hasSidewalk !== false;
        this.sidewalkWidth = options.sidewalkWidth || 48; // 4 ft sidewalk
        this.customLine = options.customLine || null; // for arbitrary angle roads: { start, end }
    }

    /**
     * Compute boundary coordinates of the road based on plot bounds
     */
    getGeometry(plotBounds) {
        if (!plotBounds) return null;
        const b = plotBounds;
        const extension = 120; // 10 ft extra on each end for realistic CAD street drawing

        let x1, y1, x2, y2, rx, ry, rw, rh;
        const w = this.width;

        switch (this.side) {
            case 'front': // bottom of plot
                rx = b.x - extension;
                ry = b.y + b.height + 12;
                rw = b.width + extension * 2;
                rh = w;
                x1 = rx; y1 = ry + rh / 2;
                x2 = rx + rw; y2 = ry + rh / 2;
                break;

            case 'rear': // top of plot
                rx = b.x - extension;
                ry = b.y - 12 - w;
                rw = b.width + extension * 2;
                rh = w;
                x1 = rx; y1 = ry + rh / 2;
                x2 = rx + rw; y2 = ry + rh / 2;
                break;

            case 'left': // left of plot
                rx = b.x - 12 - w;
                ry = b.y - extension;
                rw = w;
                rh = b.height + extension * 2;
                x1 = rx + rw / 2; y1 = ry;
                x2 = rx + rw / 2; y2 = ry + rh;
                break;

            case 'right': // right of plot
                rx = b.x + b.width + 12;
                ry = b.y - extension;
                rw = w;
                rh = b.height + extension * 2;
                x1 = rx + rw / 2; y1 = ry;
                x2 = rx + rw / 2; y2 = ry + rh;
                break;

            default:
                return null;
        }

        return {
            bounds: { x: rx, y: ry, width: rw, height: rh },
            centerLine: { x1, y1, x2, y2 }
        };
    }

    hitTest(px, py, plotBounds) {
        const geom = this.getGeometry(plotBounds);
        if (!geom) return false;
        const b = geom.bounds;
        return px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height;
    }
}

export class RoadManager {
    constructor() {
        this.roads = [];
        this.selectedRoadId = null;
        // Default initial front road
        this.addRoad({ side: 'front', width: 360, name: '30 Ft Entry Road' });
    }

    addRoad(options = {}) {
        // Prevent duplicate roads on the exact same side
        if (options.side && options.side !== 'custom') {
            const existing = this.roads.find(r => r.side === options.side);
            if (existing) {
                existing.width = options.width || existing.width;
                if (options.name) existing.name = options.name;
                return existing;
            }
        }
        const road = new Road(options);
        this.roads.push(road);
        return road;
    }

    removeRoad(id) {
        this.roads = this.roads.filter(r => r.id !== id);
        if (this.selectedRoadId === id) this.selectedRoadId = null;
    }

    getRoadById(id) {
        return this.roads.find(r => r.id === id);
    }

    clear() {
        this.roads = [];
        this.selectedRoadId = null;
    }

    render(ctx, scale, plotBounds, isExport = false, style = 'blueprint') {
        if (!plotBounds) return;

        for (const road of this.roads) {
            const isSelected = road.id === this.selectedRoadId;
            this.renderSingleRoad(ctx, road, scale, plotBounds, isSelected, isExport, style);
        }
    }

    renderSingleRoad(ctx, road, scale, plotBounds, isSelected, isExport = false, style = 'blueprint') {
        const geom = road.getGeometry(plotBounds);
        if (!geom) return;
        const b = geom.bounds;
        const cl = geom.centerLine;
        const isClean = style === 'clean';

        ctx.save();

        // 1. Asphalt / Street Pavement Fill
        if (isClean) {
            ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.12)' : 'rgba(248, 250, 252, 0.95)';
        } else {
            ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.15)' : 'rgba(51, 65, 85, 0.28)'; // slate asphalt
        }
        ctx.fillRect(b.x, b.y, b.width, b.height);

        // 2. Road Kerb / Edges
        ctx.strokeStyle = isSelected ? '#38bdf8' : (isClean ? '#0f172a' : '#64748b');
        ctx.lineWidth = (isClean ? 2.2 : 1.8) / scale;
        ctx.strokeRect(b.x, b.y, b.width, b.height);

        // Inner Kerb Edge (double line for authentic CAD street dressing)
        const kerbInset = 3.5;
        ctx.strokeStyle = isSelected ? 'rgba(56, 189, 248, 0.5)' : (isClean ? 'rgba(15, 23, 42, 0.35)' : 'rgba(100, 116, 139, 0.35)');
        ctx.lineWidth = 1 / scale;
        ctx.strokeRect(b.x + kerbInset, b.y + kerbInset, b.width - kerbInset * 2, b.height - kerbInset * 2);

        // 3. Center Dividing Line (dashed divider)
        ctx.strokeStyle = isClean ? '#64748b' : '#facc15'; // clean grey or yellow road divider
        ctx.lineWidth = 1.5 / scale;
        ctx.setLineDash([16 / scale, 10 / scale]);
        ctx.beginPath();
        ctx.moveTo(cl.x1, cl.y1);
        ctx.lineTo(cl.x2, cl.y2);
        ctx.stroke();
        ctx.setLineDash([]);

        // 4. Architectural Wide-Spaced Road Name & Width Dimension
        const midX = (cl.x1 + cl.x2) / 2;
        const midY = (cl.y1 + cl.y2) / 2;
        const isVertical = road.side === 'left' || road.side === 'right';

        ctx.save();
        ctx.translate(midX, midY);
        if (isVertical) {
            ctx.rotate(-Math.PI / 2);
        }

        // Space out uppercase letters for executive architectural blueprint aesthetic
        const cleanName = (road.name || 'ROAD').trim().toUpperCase();
        const spacedName = cleanName.split('').join(' ');
        const title = `${spacedName}   ( ${units.formatLength(road.width)} WIDE )`;

        const fontSize = Math.max(12 / scale, 4.0);
        ctx.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
        const tw = ctx.measureText(title).width;
        const padX = 10 / scale;
        const padY = 4 / scale;

        if (isClean) {
            // Clean architectural floating lettering with crisp white halo (no heavy dark box)
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 5 / scale;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeText(title, 0, 0);

            ctx.fillStyle = isSelected ? '#0284c7' : '#0f172a';
            ctx.fillText(title, 0, 0);
        } else {
            // Blueprint theme: Slate pill box with cyan border
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.fillRect(-tw / 2 - padX, -fontSize / 2 - padY, tw + padX * 2, fontSize + padY * 2);

            ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(148, 163, 184, 0.5)';
            ctx.lineWidth = 1 / scale;
            ctx.strokeRect(-tw / 2 - padX, -fontSize / 2 - padY, tw + padX * 2, fontSize + padY * 2);

            ctx.fillStyle = isSelected ? '#38bdf8' : '#e2e8f0';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(title, 0, 0);
        }

        ctx.restore();
        ctx.restore();
    }

    getRoadAt(x, y, plotBounds) {
        for (let i = this.roads.length - 1; i >= 0; i--) {
            if (this.roads[i].hitTest(x, y, plotBounds)) {
                return this.roads[i];
            }
        }
        return null;
    }
}
