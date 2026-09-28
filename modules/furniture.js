/**
 * furniture.js - Architectural Fixtures and Furniture Library
 */

import { units } from './units.js';

let fixtureIdCounter = 1;

export const FURNITURE_CATALOG = [
    // Bedroom
    { id: 'bed_king', name: 'King Bed', category: 'Bedroom', width: 76, height: 84 },
    { id: 'bed_queen', name: 'Queen Bed', category: 'Bedroom', width: 60, height: 80 },
    { id: 'wardrobe', name: 'Wardrobe (6ft)', category: 'Bedroom', width: 72, height: 24 },

    // Living Room
    { id: 'sofa_3p', name: '3-Seater Sofa', category: 'Living', width: 84, height: 36 },
    { id: 'sofa_2p', name: '2-Seater Sofa', category: 'Living', width: 60, height: 34 },
    { id: 'armchair', name: 'Armchair', category: 'Living', width: 34, height: 34 },
    { id: 'coffee_table', name: 'Coffee Table', category: 'Living', width: 44, height: 24 },
    { id: 'tv_unit', name: 'TV Media Unit', category: 'Living', width: 64, height: 18 },

    // Dining
    { id: 'dining_6p', name: 'Dining Set (6-Seater)', category: 'Dining', width: 66, height: 38 },
    { id: 'dining_4p', name: 'Dining Set (4-Seater)', category: 'Dining', width: 42, height: 38 },

    // Kitchen
    { id: 'kitchen_counter', name: 'Kitchen Counter (Straight)', category: 'Kitchen', width: 72, height: 24 },
    { id: 'kitchen_counter_corner', name: 'Countertop Corner (L)', category: 'Kitchen', width: 36, height: 36 },
    { id: 'kitchen_island', name: 'Kitchen Island', category: 'Kitchen', width: 60, height: 36 },
    { id: 'kitchen_counter_sink', name: 'Counter with Sink', category: 'Kitchen', width: 72, height: 24 },
    { id: 'kitchen_hob', name: 'Gas Stove / Hob', category: 'Kitchen', width: 30, height: 21 },
    { id: 'kitchen_sink', name: 'Double Bowl Sink', category: 'Kitchen', width: 34, height: 21 },
    { id: 'fridge', name: 'Refrigerator', category: 'Kitchen', width: 34, height: 32 },

    // Sanitary / Bathroom
    { id: 'toilet_wc', name: 'Toilet (WC)', category: 'Sanitary', width: 18, height: 28 },
    { id: 'washbasin', name: 'Washbasin Vanity', category: 'Sanitary', width: 28, height: 20 },
    { id: 'shower', name: 'Shower Stall', category: 'Sanitary', width: 36, height: 36 },
    { id: 'bathtub', name: 'Bathtub', category: 'Sanitary', width: 60, height: 32 },

    // Outdoor / Parking & Vehicles
    { id: 'car_sedan', name: 'Sedan Car', category: 'Outdoor', width: 72, height: 180 },
    { id: 'car_suv', name: 'SUV / Crossover Car', category: 'Outdoor', width: 78, height: 192 },
    { id: 'motorcycle', name: 'Motorcycle / Scooter', category: 'Outdoor', width: 30, height: 78 },
    { id: 'plant', name: 'Potted Plant', category: 'Outdoor', width: 24, height: 24 },

    // Landscape & Greenery
    { id: 'tree_deciduous', name: 'Deciduous Canopy Tree', category: 'Landscape', width: 96, height: 96 },
    { id: 'tree_palm', name: 'Royal Palm Tree', category: 'Landscape', width: 72, height: 72 },
    { id: 'shrub_bush', name: 'Flowering Bush / Hedge', category: 'Landscape', width: 48, height: 36 },
    { id: 'planter_box', name: 'Masonry Planter Bed', category: 'Landscape', width: 72, height: 24 },
    { id: 'lawn_patch', name: 'Grass Lawn Patch', category: 'Landscape', width: 96, height: 72 },
    { id: 'driveway_pavers', name: 'Driveway Interlocking Pavers', category: 'Landscape', width: 96, height: 180 }
];

export class FurnitureItem {
    constructor(typeId, x, y, options = {}) {
        this.id = `fit_${fixtureIdCounter++}`;
        this.typeId = typeId;
        this.type = typeId; // Alias for uniform element identification
        const meta = FURNITURE_CATALOG.find(c => c.id === typeId) || {
            name: 'Fixture', width: 36, height: 36
        };
        this.name = meta.name;
        this.width = options.width || meta.width;
        this.height = options.height || meta.height;
        this.x = x;
        this.y = y;
        this.rotation = options.rotation || 0; // degrees
    }

    getBounds() {
        return {
            x: this.x - this.width / 2,
            y: this.y - this.height / 2,
            width: this.width,
            height: this.height
        };
    }

    toLocal(px, py) {
        const rad = (-this.rotation * Math.PI) / 180;
        const dx = px - this.x;
        const dy = py - this.y;
        return {
            x: dx * Math.cos(rad) - dy * Math.sin(rad),
            y: dx * Math.sin(rad) + dy * Math.cos(rad)
        };
    }

    toWorld(lx, ly) {
        const rad = (this.rotation * Math.PI) / 180;
        return {
            x: this.x + lx * Math.cos(rad) - ly * Math.sin(rad),
            y: this.y + lx * Math.sin(rad) + ly * Math.cos(rad)
        };
    }

    getHandles(scale = 1.0) {
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        const rotDist = 16 / scale;

        return [
            { id: 'rot', x: 0, y: -halfH - rotDist, type: 'rotate' },
            // Corner handles (2-axis resize)
            { id: 'tl', x: -halfW, y: -halfH, type: 'corner', baseAngle: 45 },
            { id: 'tr', x: halfW, y: -halfH, type: 'corner', baseAngle: 135 },
            { id: 'br', x: halfW, y: halfH, type: 'corner', baseAngle: 45 },
            { id: 'bl', x: -halfW, y: halfH, type: 'corner', baseAngle: 135 },
            // Edge handles (1-axis drag-to-fit)
            { id: 't', x: 0, y: -halfH, type: 'edge', baseAngle: 90 },
            { id: 'b', x: 0, y: halfH, type: 'edge', baseAngle: 90 },
            { id: 'l', x: -halfW, y: 0, type: 'edge', baseAngle: 0 },
            { id: 'r', x: halfW, y: 0, type: 'edge', baseAngle: 0 }
        ];
    }

    getCursorForHandle(handle) {
        if (!handle) return 'default';
        if (handle.id === 'rot') return 'grab';
        const totalAngle = (((handle.baseAngle + this.rotation) % 180) + 180) % 180;
        if (totalAngle >= 22.5 && totalAngle < 67.5) return 'nwse-resize';
        if (totalAngle >= 67.5 && totalAngle < 112.5) return 'ns-resize';
        if (totalAngle >= 112.5 && totalAngle < 157.5) return 'nesw-resize';
        return 'ew-resize';
    }

    hitHandle(px, py, scale = 1.0) {
        const local = this.toLocal(px, py);
        const handles = this.getHandles(scale);
        const hitTol = Math.max(9 / scale, 4);

        // Check rotation handle first
        const rotH = handles.find(h => h.id === 'rot');
        if (rotH && Math.hypot(local.x - rotH.x, local.y - rotH.y) <= hitTol + 2 / scale) {
            return rotH;
        }

        // Check corner handles
        for (const h of handles.filter(h => h.type === 'corner')) {
            if (Math.hypot(local.x - h.x, local.y - h.y) <= hitTol) {
                return h;
            }
        }

        // Check edge handles
        for (const h of handles.filter(h => h.type === 'edge')) {
            if (Math.hypot(local.x - h.x, local.y - h.y) <= hitTol) {
                return h;
            }
        }

        return null;
    }

    hitTest(px, py) {
        const local = this.toLocal(px, py);
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        return Math.abs(local.x) <= halfW && Math.abs(local.y) <= halfH;
    }
}

export class FurnitureManager {
    constructor() {
        this.items = [];
        this.selectedItemId = null;
    }

    addItem(typeId, x, y, rotation = 0) {
        const item = new FurnitureItem(typeId, x, y, { rotation });
        this.items.push(item);
        return item;
    }

    removeItem(id) {
        this.items = this.items.filter(i => i.id !== id);
        if (this.selectedItemId === id) this.selectedItemId = null;
    }

    getItemById(id) {
        return this.items.find(i => i.id === id);
    }

    clear() {
        this.items = [];
        this.selectedItemId = null;
    }

    rotateItem(id, deg = 90) {
        const item = this.getItemById(id);
        if (item) {
            item.rotation = (item.rotation + deg) % 360;
        }
    }

    render(ctx, scale) {
        for (const item of this.items) {
            const isSelected = item.id === this.selectedItemId;
            this.renderSingleItem(ctx, item, scale, isSelected);
        }
    }

    renderSingleItem(ctx, item, scale, isSelected) {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate((item.rotation * Math.PI) / 180);

        const halfW = item.width / 2;
        const halfH = item.height / 2;

        // Base styles
        ctx.lineWidth = 1.2 / scale;
        ctx.strokeStyle = isSelected ? '#38bdf8' : '#94a3b8';
        ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';

        switch (item.typeId) {
            case 'bed_king':
            case 'bed_queen': {
                // Mattress body
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);

                // Headboard (top edge)
                ctx.fillStyle = '#475569';
                ctx.fillRect(-halfW, -halfH, item.width, 6);
                ctx.strokeRect(-halfW, -halfH, item.width, 6);

                // Pillows
                const pillowW = Math.max(12, (item.width - 12) / 2);
                const pillowH = Math.min(18, Math.max(10, item.height * 0.2));
                ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.fillRect(-halfW + 4, -halfH + 8, pillowW, pillowH);
                ctx.strokeRect(-halfW + 4, -halfH + 8, pillowW, pillowH);
                ctx.fillRect(halfW - 4 - pillowW, -halfH + 8, pillowW, pillowH);
                ctx.strokeRect(halfW - 4 - pillowW, -halfH + 8, pillowW, pillowH);

                // Blanket fold line
                const foldY = Math.min(halfH - 10, -halfH + Math.max(24, item.height * 0.4));
                ctx.beginPath();
                ctx.moveTo(-halfW, foldY);
                ctx.lineTo(halfW, foldY);
                ctx.stroke();
                break;
            }

            case 'sofa_3p':
            case 'sofa_2p': {
                const count = item.typeId === 'sofa_3p' ? 3 : 2;
                // Outer frame
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);

                // Backrest (top)
                const backrestH = Math.min(10, Math.max(6, item.height * 0.25));
                ctx.fillStyle = '#334155';
                ctx.fillRect(-halfW, -halfH, item.width, backrestH);
                ctx.strokeRect(-halfW, -halfH, item.width, backrestH);

                // Armrests (sides)
                const armW = Math.min(8, Math.max(4, item.width * 0.12));
                ctx.fillRect(-halfW, -halfH, armW, item.height);
                ctx.strokeRect(-halfW, -halfH, armW, item.height);
                ctx.fillRect(halfW - armW, -halfH, armW, item.height);
                ctx.strokeRect(halfW - armW, -halfH, armW, item.height);

                // Seat cushions
                const innerW = item.width - armW * 2;
                const cushionW = innerW / count;
                ctx.fillStyle = 'rgba(148, 163, 184, 0.2)';
                for (let i = 0; i < count; i++) {
                    const cx = -halfW + armW + (i * cushionW);
                    ctx.fillRect(cx, -halfH + backrestH, cushionW, item.height - backrestH);
                    ctx.strokeRect(cx, -halfH + backrestH, cushionW, item.height - backrestH);
                }
                break;
            }

            case 'armchair': {
                // Outer frame
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);

                // Backrest (top)
                const backrestH = Math.min(10, Math.max(6, item.height * 0.25));
                ctx.fillStyle = '#334155';
                ctx.fillRect(-halfW, -halfH, item.width, backrestH);
                ctx.strokeRect(-halfW, -halfH, item.width, backrestH);

                // Armrests (sides)
                const armW = Math.min(7, Math.max(4, item.width * 0.18));
                ctx.fillRect(-halfW, -halfH, armW, item.height);
                ctx.strokeRect(-halfW, -halfH, armW, item.height);
                ctx.fillRect(halfW - armW, -halfH, armW, item.height);
                ctx.strokeRect(halfW - armW, -halfH, armW, item.height);

                // Cushion
                ctx.fillStyle = 'rgba(148, 163, 184, 0.2)';
                ctx.fillRect(-halfW + armW, -halfH + backrestH, item.width - armW * 2, item.height - backrestH);
                ctx.strokeRect(-halfW + armW, -halfH + backrestH, item.width - armW * 2, item.height - backrestH);
                break;
            }

            case 'wardrobe': {
                // Main cabinet body
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);

                // Hanging rod along length
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
                ctx.lineWidth = 1 / scale;
                ctx.beginPath();
                ctx.moveTo(-halfW + 4, 0);
                ctx.lineTo(halfW - 4, 0);
                ctx.stroke();

                // Hanger marks along rod
                const hangerSpacing = Math.max(8, item.width / 6);
                for (let x = -halfW + hangerSpacing / 2; x <= halfW - hangerSpacing / 2; x += hangerSpacing) {
                    ctx.beginPath();
                    ctx.moveTo(x - 3, -4);
                    ctx.lineTo(x + 3, 4);
                    ctx.stroke();
                }

                // Door division lines (1 door per ~2ft / 24in)
                const doors = Math.max(2, Math.round(item.width / 24));
                const doorW = item.width / doors;
                ctx.strokeStyle = '#475569';
                ctx.lineWidth = 1.2 / scale;
                for (let i = 1; i < doors; i++) {
                    const dx = -halfW + i * doorW;
                    ctx.beginPath();
                    ctx.moveTo(dx, -halfH);
                    ctx.lineTo(dx, halfH);
                    ctx.stroke();
                }
                break;
            }

            case 'coffee_table': {
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);
                // Glass center inlay
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
                ctx.strokeRect(-halfW + 3, -halfH + 3, item.width - 6, item.height - 6);
                break;
            }

            case 'tv_unit': {
                // Media console table
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);

                // TV screen mounted on unit
                const tvW = Math.min(item.width - 8, Math.max(24, item.width * 0.75));
                const tvH = Math.min(4, item.height * 0.25);
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(-tvW / 2, -tvH / 2, tvW, tvH);
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 1.2 / scale;
                ctx.strokeRect(-tvW / 2, -tvH / 2, tvW, tvH);
                break;
            }

            case 'toilet_wc': {
                // Cistern / Tank (top)
                const tankH = Math.min(9, item.height * 0.35);
                ctx.fillStyle = '#cbd5e1';
                ctx.fillRect(-halfW, -halfH, item.width, tankH);
                ctx.strokeRect(-halfW, -halfH, item.width, tankH);

                // Bowl (ellipse extending forward)
                ctx.beginPath();
                ctx.ellipse(0, (tankH) / 2, halfW - 1, (item.height - tankH) / 2, 0, 0, Math.PI * 2);
                ctx.fillStyle = '#f8fafc';
                ctx.fill();
                ctx.stroke();

                // Inner hole
                ctx.beginPath();
                ctx.ellipse(0, (tankH) / 2 + 3, Math.max(3, halfW - 5), Math.max(3, (item.height - tankH - 12) / 2), 0, 0, Math.PI * 2);
                ctx.strokeStyle = '#94a3b8';
                ctx.stroke();
                break;
            }

            case 'washbasin': {
                // Countertop
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);

                // Oval Basin
                ctx.beginPath();
                ctx.ellipse(0, 0, Math.max(4, halfW - 4), Math.max(4, halfH - 4), 0, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.stroke();

                // Faucet dot
                ctx.beginPath();
                ctx.arc(0, -halfH + 5, 2.5, 0, Math.PI * 2);
                ctx.fillStyle = '#475569';
                ctx.fill();
                break;
            }

            case 'bathtub': {
                // Outer tub rim
                ctx.fillStyle = '#1e293b';
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);

                // Inner tub basin (rounded rectangle)
                ctx.fillStyle = '#f8fafc';
                ctx.beginPath();
                ctx.roundRect(-halfW + 4, -halfH + 4, Math.max(8, item.width - 8), Math.max(8, item.height - 8), Math.min(halfH - 4, 12));
                ctx.fill();
                ctx.strokeStyle = '#94a3b8';
                ctx.stroke();

                // Drain hole at one end
                ctx.beginPath();
                ctx.arc(-halfW + 12, 0, 2.5, 0, Math.PI * 2);
                ctx.fillStyle = '#475569';
                ctx.fill();
                break;
            }

            case 'shower': {
                // Shower base stall
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);

                // Inner enclosure line
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
                ctx.lineWidth = 1 / scale;
                ctx.strokeRect(-halfW + 3, -halfH + 3, Math.max(6, item.width - 6), Math.max(6, item.height - 6));

                // Center drain
                ctx.beginPath();
                ctx.arc(0, 0, 3, 0, Math.PI * 2);
                ctx.strokeStyle = '#94a3b8';
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(-2, 0); ctx.lineTo(2, 0);
                ctx.moveTo(0, -2); ctx.lineTo(0, 2);
                ctx.stroke();
                break;
            }

            case 'kitchen_counter': {
                // Countertop slab body
                ctx.fillStyle = '#1e293b';
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);

                // Backsplash strip along top edge (wall side)
                const splashH = Math.min(2.5, item.height * 0.1);
                ctx.fillStyle = '#475569';
                ctx.fillRect(-halfW, -halfH, item.width, splashH);
                ctx.strokeRect(-halfW, -halfH, item.width, splashH);

                // Front counter nosing line (1.5 inches from bottom edge)
                const nosingY = halfH - Math.min(2, item.height * 0.1);
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
                ctx.lineWidth = 1 / scale;
                ctx.beginPath();
                ctx.moveTo(-halfW, nosingY);
                ctx.lineTo(halfW, nosingY);
                ctx.stroke();

                // Modular cabinet base divisions (~every 24 inches / 2 ft)
                const cabinetCount = Math.max(1, Math.round(item.width / 24));
                if (cabinetCount > 1) {
                    const cabW = item.width / cabinetCount;
                    ctx.strokeStyle = '#475569';
                    ctx.lineWidth = 1.2 / scale;
                    for (let i = 1; i < cabinetCount; i++) {
                        const cx = -halfW + i * cabW;
                        ctx.beginPath();
                        ctx.moveTo(cx, -halfH + splashH);
                        ctx.lineTo(cx, halfH);
                        ctx.stroke();

                        // Drawer pull / handle tick mark
                        ctx.beginPath();
                        ctx.moveTo(cx - 3, halfH - 4);
                        ctx.lineTo(cx + 3, halfH - 4);
                        ctx.stroke();
                    }
                }
                break;
            }

            case 'kitchen_counter_corner': {
                // Outer L or chamfered corner unit (e.g. 36" x 36")
                const depth = Math.min(24, Math.min(item.width, item.height) * 0.67);
                
                // Draw L-shaped countertop slab
                ctx.fillStyle = '#1e293b';
                ctx.beginPath();
                ctx.moveTo(-halfW, -halfH); // Top-left (corner against walls)
                ctx.lineTo(halfW, -halfH);  // Top-right
                ctx.lineTo(halfW, -halfH + depth); // End of top leg
                ctx.lineTo(-halfW + depth, halfH); // Diagonal transition
                ctx.lineTo(-halfW, halfH);  // Bottom-left
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // Backsplash along top and left wall edges
                const splashH = Math.min(2.5, depth * 0.1);
                ctx.fillStyle = '#475569';
                ctx.fillRect(-halfW, -halfH, item.width, splashH);
                ctx.strokeRect(-halfW, -halfH, item.width, splashH);
                ctx.fillRect(-halfW, -halfH, splashH, item.height);
                ctx.strokeRect(-halfW, -halfH, splashH, item.height);

                // Diagonal joint line (45 deg)
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
                ctx.lineWidth = 1 / scale;
                ctx.beginPath();
                ctx.moveTo(-halfW, -halfH);
                ctx.lineTo(-halfW + depth, -halfH + depth);
                ctx.stroke();
                break;
            }

            case 'kitchen_island': {
                // Main countertop slab
                ctx.fillStyle = '#1e293b';
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);

                // Base cabinet line (showing 12" overhang for breakfast bar stools on bottom)
                const overhang = Math.min(12, item.height * 0.35);
                const cabBottom = halfH - overhang;
                ctx.strokeStyle = '#475569';
                ctx.lineWidth = 1.2 / scale;
                ctx.setLineDash([4 / scale, 4 / scale]);
                ctx.beginPath();
                ctx.moveTo(-halfW + 4, cabBottom);
                ctx.lineTo(halfW - 4, cabBottom);
                ctx.stroke();
                ctx.setLineDash([]);

                // Stool indicators on the overhang side (circles)
                const stoolCount = Math.max(2, Math.min(4, Math.round(item.width / 24)));
                const stoolSpacing = item.width / stoolCount;
                const stoolR = Math.min(6, overhang * 0.4);
                ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
                ctx.lineWidth = 1 / scale;
                for (let i = 0; i < stoolCount; i++) {
                    const sx = -halfW + stoolSpacing * (i + 0.5);
                    const sy = halfH - overhang / 2;
                    ctx.beginPath();
                    ctx.arc(sx, sy, stoolR, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                }

                // Decorative bevel/nosing border
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
                ctx.strokeRect(-halfW + 2, -halfH + 2, item.width - 4, item.height - 4);
                break;
            }

            case 'kitchen_counter_sink': {
                // Base counter
                ctx.fillStyle = '#1e293b';
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);

                // Backsplash
                const splashH = Math.min(2.5, item.height * 0.1);
                ctx.fillStyle = '#475569';
                ctx.fillRect(-halfW, -halfH, item.width, splashH);
                ctx.strokeRect(-halfW, -halfH, item.width, splashH);

                // Front nosing
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
                ctx.lineWidth = 1 / scale;
                ctx.beginPath();
                ctx.moveTo(-halfW, halfH - 2);
                ctx.lineTo(halfW, halfH - 2);
                ctx.stroke();

                // Double bowl sink in center
                const sinkW = Math.min(34, item.width * 0.6);
                const sinkH = Math.min(18, item.height * 0.75);
                const sinkX = -sinkW / 2;
                const sinkY = -sinkH / 2 + splashH / 2;
                ctx.fillStyle = '#334155';
                ctx.fillRect(sinkX, sinkY, sinkW, sinkH);
                ctx.strokeStyle = '#94a3b8';
                ctx.lineWidth = 1.2 / scale;
                ctx.strokeRect(sinkX, sinkY, sinkW, sinkH);

                // Left & Right bowls
                const bowlW = (sinkW - 4) / 2;
                ctx.fillStyle = '#f8fafc';
                ctx.fillRect(sinkX + 1, sinkY + 1, bowlW, sinkH - 2);
                ctx.strokeRect(sinkX + 1, sinkY + 1, bowlW, sinkH - 2);
                ctx.fillRect(sinkX + 3 + bowlW, sinkY + 1, bowlW, sinkH - 2);
                ctx.strokeRect(sinkX + 3 + bowlW, sinkY + 1, bowlW, sinkH - 2);

                // Faucet
                ctx.beginPath();
                ctx.arc(0, sinkY + 3, 2, 0, Math.PI * 2);
                ctx.fillStyle = '#38bdf8';
                ctx.fill();
                break;
            }

            case 'kitchen_hob': {
                // Hob surface
                ctx.fillStyle = '#1e293b';
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);

                // 4 Burners
                const r1 = Math.min(halfW * 0.25, 4.5);
                const r2 = Math.min(halfW * 0.2, 3.5);
                const bxOff = Math.max(r1 + 2, halfW * 0.5);
                const byOff = Math.max(r1 + 2, halfH * 0.5);
                const burners = [
                    { x: -bxOff, y: -byOff, r: r1 },
                    { x: bxOff, y: -byOff, r: r2 },
                    { x: -bxOff, y: byOff, r: r2 },
                    { x: bxOff, y: byOff, r: r1 }
                ];
                for (const b of burners) {
                    ctx.beginPath();
                    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
                    ctx.strokeStyle = '#f59e0b';
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(b.x, b.y, 1.5, 0, Math.PI * 2);
                    ctx.fillStyle = '#f59e0b';
                    ctx.fill();
                }
                break;
            }

            case 'kitchen_sink': {
                // Frame
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);

                // Left bowl
                const bowlW = (item.width - 6) / 2;
                ctx.strokeRect(-halfW + 2, -halfH + 2, bowlW, item.height - 4);
                // Right bowl
                ctx.strokeRect(-halfW + 4 + bowlW, -halfH + 2, bowlW, item.height - 4);
                // Faucet center
                ctx.beginPath();
                ctx.arc(0, -halfH + 5, 2, 0, Math.PI * 2);
                ctx.fillStyle = '#38bdf8';
                ctx.fill();
                break;
            }

            case 'dining_6p':
            case 'dining_4p': {
                // Table
                ctx.fillRect(-halfW + 6, -halfH + 6, Math.max(8, item.width - 12), Math.max(8, item.height - 12));
                ctx.strokeRect(-halfW + 6, -halfH + 6, Math.max(8, item.width - 12), Math.max(8, item.height - 12));

                // Chairs top & bottom
                const chairsPerSide = item.typeId === 'dining_6p' ? 3 : 2;
                const chairW = Math.max(8, (item.width - 16) / chairsPerSide);
                for (let i = 0; i < chairsPerSide; i++) {
                    const cx = -halfW + 8 + i * chairW;
                    // Top chair
                    ctx.strokeRect(cx, -halfH, chairW - 2, 5);
                    // Bottom chair
                    ctx.strokeRect(cx, halfH - 5, chairW - 2, 5);
                }
                break;
            }

            case 'car_sedan': {
                // Vehicle body
                ctx.fillStyle = '#334155';
                ctx.beginPath();
                ctx.roundRect(-halfW, -halfH, item.width, item.height, Math.min(8, halfW));
                ctx.fill();
                ctx.stroke();

                // Windshield and Roof
                ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
                const wTopH = Math.min(20, item.height * 0.12);
                const wBotH = Math.min(18, item.height * 0.1);
                // Front windshield
                ctx.fillRect(-halfW + 6, -halfH + Math.min(40, item.height * 0.2), Math.max(8, item.width - 12), wTopH);
                // Rear window
                ctx.fillRect(-halfW + 6, halfH - Math.min(50, item.height * 0.25), Math.max(8, item.width - 12), wBotH);
                // Roof
                ctx.fillStyle = '#1e293b';
                const roofTop = -halfH + Math.min(40, item.height * 0.2) + wTopH;
                const roofBot = halfH - Math.min(50, item.height * 0.25);
                const roofH = Math.max(10, roofBot - roofTop);
                ctx.fillRect(-halfW + 6, roofTop, Math.max(8, item.width - 12), roofH);
                ctx.strokeRect(-halfW + 6, roofTop, Math.max(8, item.width - 12), roofH);
                break;
            }

            case 'plant': {
                ctx.beginPath();
                ctx.arc(0, 0, Math.min(halfW, halfH), 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
                ctx.fill();
                ctx.strokeStyle = '#22c55e';
                ctx.stroke();

                // Leaf spokes
                const rad = Math.min(halfW, halfH);
                for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
                    ctx.stroke();
                }
                break;
            }

            case 'car_suv': {
                // SUV body (more muscular, flared fenders)
                ctx.fillStyle = '#1e293b';
                ctx.strokeStyle = '#475569';
                ctx.lineWidth = 1.6 / scale;
                ctx.beginPath();
                ctx.roundRect(-halfW, -halfH, item.width, item.height, Math.min(10, halfW));
                ctx.fill();
                ctx.stroke();

                // Side mirrors
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(-halfW - 5, -halfH + item.height * 0.22, 6, 12);
                ctx.fillRect(halfW - 1, -halfH + item.height * 0.22, 6, 12);

                // Windshield and Windows
                ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
                const fWinY = -halfH + item.height * 0.2;
                const fWinH = item.height * 0.14;
                ctx.fillRect(-halfW + 7, fWinY, item.width - 14, fWinH);

                const rWinY = halfH - item.height * 0.22;
                const rWinH = item.height * 0.12;
                ctx.fillRect(-halfW + 7, rWinY, item.width - 14, rWinH);

                // Side quarter windows
                ctx.fillRect(-halfW + 4, fWinY + fWinH + 4, 4, rWinY - (fWinY + fWinH) - 8);
                ctx.fillRect(halfW - 8, fWinY + fWinH + 4, 4, rWinY - (fWinY + fWinH) - 8);

                // Panoramic Sunroof
                const roofTop = fWinY + fWinH + 4;
                const roofH = rWinY - roofTop - 4;
                ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
                ctx.fillRect(-halfW + 10, roofTop, item.width - 20, roofH);
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
                ctx.strokeRect(-halfW + 10, roofTop, item.width - 20, roofH);

                // Roof rails (left & right)
                ctx.fillStyle = '#cbd5e1';
                ctx.fillRect(-halfW + 8, roofTop, 3, roofH);
                ctx.fillRect(halfW - 11, roofTop, 3, roofH);

                // Hood ribs
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
                ctx.lineWidth = 1 / scale;
                ctx.beginPath();
                ctx.moveTo(-halfW + item.width * 0.3, -halfH + 6);
                ctx.lineTo(-halfW + item.width * 0.3, fWinY - 4);
                ctx.moveTo(halfW - item.width * 0.3, -halfH + 6);
                ctx.lineTo(halfW - item.width * 0.3, fWinY - 4);
                ctx.stroke();
                break;
            }

            case 'motorcycle': {
                // Top-down motorcycle / scooter
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(-3, -halfH, 6, Math.min(18, item.height * 0.22));

                // Handlebars & Grips
                ctx.strokeStyle = '#cbd5e1';
                ctx.lineWidth = 2 / scale;
                ctx.beginPath();
                ctx.moveTo(-halfW + 2, -halfH + 14);
                ctx.lineTo(halfW - 2, -halfH + 14);
                ctx.stroke();

                // Mirrors
                ctx.fillStyle = '#38bdf8';
                ctx.beginPath();
                ctx.arc(-halfW + 2, -halfH + 12, 2.5, 0, Math.PI * 2);
                ctx.arc(halfW - 2, -halfH + 12, 2.5, 0, Math.PI * 2);
                ctx.fill();

                // Body / Fuel Tank
                ctx.fillStyle = '#dc2626'; // sporty red
                ctx.strokeStyle = '#991b1b';
                ctx.beginPath();
                ctx.roundRect(-halfW + 6, -halfH + 16, item.width - 12, item.height * 0.35, 6);
                ctx.fill();
                ctx.stroke();

                // Seat (dark leather)
                ctx.fillStyle = '#1e293b';
                ctx.beginPath();
                ctx.roundRect(-halfW + 7, -halfH + 16 + item.height * 0.35, item.width - 14, item.height * 0.35, 5);
                ctx.fill();

                // Rear tire & Fender
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(-3.5, halfH - Math.min(20, item.height * 0.25), 7, Math.min(20, item.height * 0.25));
                break;
            }

            case 'tree_deciduous': {
                // Top-down architectural deciduous shade tree
                const rad = Math.min(halfW, halfH);
                const lobes = 10;

                ctx.beginPath();
                for (let i = 0; i <= lobes; i++) {
                    const angle = (i * 2 * Math.PI) / lobes;
                    const lobeR = rad * 0.32;
                    const cx = Math.cos(angle) * (rad - lobeR);
                    const cy = Math.sin(angle) * (rad - lobeR);
                    if (i === 0) {
                        ctx.moveTo(cx + Math.cos(angle - Math.PI * 0.6) * lobeR, cy + Math.sin(angle - Math.PI * 0.6) * lobeR);
                    }
                    ctx.arc(cx, cy, lobeR, angle - Math.PI * 0.6, angle + Math.PI * 0.6);
                }
                ctx.closePath();
                ctx.fillStyle = 'rgba(34, 197, 94, 0.22)';
                ctx.fill();
                ctx.strokeStyle = '#16a34a';
                ctx.lineWidth = 1.6 / scale;
                ctx.stroke();

                // Inner soft canopy texture ring
                ctx.strokeStyle = 'rgba(34, 197, 94, 0.35)';
                ctx.lineWidth = 1 / scale;
                ctx.beginPath();
                ctx.arc(0, 0, rad * 0.55, 0, Math.PI * 2);
                ctx.stroke();

                // Organic radiating branches from center
                ctx.strokeStyle = 'rgba(21, 128, 61, 0.75)';
                ctx.lineWidth = 1.5 / scale;
                for (let i = 0; i < 6; i++) {
                    const bAngle = (i * Math.PI) / 3;
                    const bDist = rad * 0.72;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(bAngle) * bDist, Math.sin(bAngle) * bDist);
                    // Fork
                    ctx.lineTo(Math.cos(bAngle + 0.2) * (rad * 0.88), Math.sin(bAngle + 0.2) * (rad * 0.88));
                    ctx.moveTo(Math.cos(bAngle) * bDist, Math.sin(bAngle) * bDist);
                    ctx.lineTo(Math.cos(bAngle - 0.2) * (rad * 0.88), Math.sin(bAngle - 0.2) * (rad * 0.88));
                    ctx.stroke();
                }

                // Central trunk
                ctx.beginPath();
                ctx.arc(0, 0, Math.max(3.5, rad * 0.08), 0, Math.PI * 2);
                ctx.fillStyle = '#15803d';
                ctx.fill();
                ctx.strokeStyle = '#064e3b';
                ctx.lineWidth = 1 / scale;
                ctx.stroke();
                break;
            }

            case 'tree_palm': {
                // Royal Palm Tree top-down
                const rad = Math.min(halfW, halfH);

                ctx.save();
                for (let i = 0; i < 8; i++) {
                    const frondAngle = (i * Math.PI) / 4;
                    ctx.save();
                    ctx.rotate(frondAngle);

                    ctx.strokeStyle = '#16a34a';
                    ctx.lineWidth = 1.8 / scale;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(rad * 0.5, rad * 0.15, rad, 0);
                    ctx.stroke();

                    ctx.strokeStyle = 'rgba(34, 197, 94, 0.7)';
                    ctx.lineWidth = 1 / scale;
                    const leafPairs = 6;
                    for (let j = 1; j <= leafPairs; j++) {
                        const t = j / (leafPairs + 1);
                        const lx = t * rad;
                        const ly = (1 - t) * t * rad * 0.3;
                        const leafLen = (1 - t * 0.5) * (rad * 0.25);
                        ctx.beginPath();
                        ctx.moveTo(lx, ly);
                        ctx.lineTo(lx - 2, ly - leafLen);
                        ctx.moveTo(lx, ly);
                        ctx.lineTo(lx + 2, ly + leafLen);
                        ctx.stroke();
                    }
                    ctx.restore();
                }
                ctx.restore();

                // Core trunk
                ctx.beginPath();
                ctx.arc(0, 0, Math.max(5, rad * 0.12), 0, Math.PI * 2);
                ctx.fillStyle = '#065f46';
                ctx.fill();
                ctx.strokeStyle = '#022c22';
                ctx.lineWidth = 1.2 / scale;
                ctx.stroke();
                break;
            }

            case 'shrub_bush': {
                // Flowering bush / hedge cluster
                const lobes = 7;
                ctx.beginPath();
                for (let i = 0; i <= lobes; i++) {
                    const a = (i * 2 * Math.PI) / lobes;
                    const lx = Math.cos(a) * (halfW * 0.65);
                    const ly = Math.sin(a) * (halfH * 0.65);
                    const lr = Math.min(halfW, halfH) * 0.38;
                    ctx.arc(lx, ly, lr, a - Math.PI * 0.6, a + Math.PI * 0.6);
                }
                ctx.closePath();
                ctx.fillStyle = 'rgba(74, 222, 128, 0.25)';
                ctx.fill();
                ctx.strokeStyle = '#16a34a';
                ctx.lineWidth = 1.4 / scale;
                ctx.stroke();

                // Subtle inner flower florets
                ctx.fillStyle = '#f59e0b';
                const floretPoints = [
                    { x: -halfW * 0.3, y: -halfH * 0.2 },
                    { x: halfW * 0.3, y: -halfH * 0.25 },
                    { x: 0, y: halfH * 0.2 },
                    { x: -halfW * 0.25, y: halfH * 0.25 },
                    { x: halfW * 0.25, y: halfH * 0.2 }
                ];
                for (const fp of floretPoints) {
                    ctx.beginPath();
                    ctx.arc(fp.x, fp.y, 2.5 / scale, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
            }

            case 'planter_box': {
                // Masonry planter box with soil & plants
                ctx.fillStyle = '#334155';
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 1.5 / scale;
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);

                const borderT = 3;
                const inW = item.width - borderT * 2;
                const inH = item.height - borderT * 2;
                ctx.fillStyle = 'rgba(120, 53, 15, 0.35)'; // soil brown
                ctx.fillRect(-halfW + borderT, -halfH + borderT, inW, inH);

                const count = Math.max(2, Math.floor(item.width / 20));
                const step = inW / count;
                ctx.fillStyle = 'rgba(34, 197, 94, 0.8)';
                ctx.strokeStyle = '#15803d';
                ctx.lineWidth = 1 / scale;
                for (let i = 0; i < count; i++) {
                    const px = -halfW + borderT + step * (i + 0.5);
                    const pr = Math.min(step * 0.42, inH * 0.42);
                    ctx.beginPath();
                    ctx.arc(px, 0, pr, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                }
                break;
            }

            case 'lawn_patch': {
                // Grass lawn patch with architectural tufts
                ctx.fillStyle = 'rgba(34, 197, 94, 0.12)';
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 1 / scale;
                ctx.setLineDash([4 / scale, 3 / scale]);
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);
                ctx.setLineDash([]);

                ctx.strokeStyle = '#16a34a';
                ctx.lineWidth = 1.1 / scale;
                const nx = Math.max(2, Math.floor(item.width / 28));
                const ny = Math.max(2, Math.floor(item.height / 28));
                const dx = item.width / (nx + 1);
                const dy = item.height / (ny + 1);

                for (let ix = 1; ix <= nx; ix++) {
                    for (let iy = 1; iy <= ny; iy++) {
                        const tx = -halfW + ix * dx + ((iy % 2 === 0) ? dx * 0.25 : -dx * 0.25);
                        const ty = -halfH + iy * dy;
                        ctx.beginPath();
                        ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - 6 / scale);
                        ctx.moveTo(tx, ty); ctx.lineTo(tx - 4 / scale, ty - 5 / scale);
                        ctx.moveTo(tx, ty); ctx.lineTo(tx + 4 / scale, ty - 5 / scale);
                        ctx.stroke();
                    }
                }
                break;
            }

            case 'driveway_pavers': {
                // Interlocking paver texture
                ctx.fillStyle = 'rgba(148, 163, 184, 0.15)';
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeStyle = '#64748b';
                ctx.lineWidth = 1.5 / scale;
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);

                ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
                ctx.lineWidth = 0.8 / scale;
                const courseH = 12; // 12 inches per row
                const brickW = 16;
                const rows = Math.floor(item.height / courseH);

                ctx.beginPath();
                for (let r = 0; r <= rows; r++) {
                    const y = -halfH + r * courseH;
                    ctx.moveTo(-halfW, y);
                    ctx.lineTo(halfW, y);

                    const offset = (r % 2 === 0) ? 0 : brickW / 2;
                    const cols = Math.floor((item.width + offset) / brickW);
                    for (let c = 0; c <= cols; c++) {
                        const x = -halfW + c * brickW - offset;
                        if (x >= -halfW && x <= halfW && r < rows) {
                            ctx.moveTo(x, y);
                            ctx.lineTo(x, y + courseH);
                        }
                    }
                }
                ctx.stroke();
                break;
            }

            default: {
                // Default generic furniture rectangle
                ctx.fillRect(-halfW, -halfH, item.width, item.height);
                ctx.strokeRect(-halfW, -halfH, item.width, item.height);
                // Diagonal cross
                ctx.beginPath();
                ctx.moveTo(-halfW, -halfH);
                ctx.lineTo(halfW, halfH);
                ctx.moveTo(halfW, -halfH);
                ctx.lineTo(-halfW, halfH);
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
                ctx.stroke();
                break;
            }
        }

        // ==========================================
        // SELECTION BOUNDS & INTERACTIVE RESIZE HANDLES
        // Rendered on top of furniture body
        // ==========================================
        if (isSelected) {
            // Selection outer bounding box
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.5 / scale;
            ctx.setLineDash([4 / scale, 3 / scale]);
            ctx.strokeRect(-halfW, -halfH, item.width, item.height);
            ctx.setLineDash([]);

            // Rotation handle stem & circle at top
            const rotY = -halfH - 16 / scale;
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.2 / scale;
            ctx.beginPath();
            ctx.moveTo(0, -halfH);
            ctx.lineTo(0, rotY);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(0, rotY, 4.5 / scale, 0, Math.PI * 2);
            ctx.fillStyle = '#38bdf8';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.2 / scale;
            ctx.stroke();

            // 4 Corner Resize Handles (white squares with cyan border)
            const handleSize = 7 / scale;
            const halfS = handleSize / 2;
            const corners = [
                [-halfW, -halfH],
                [halfW, -halfH],
                [halfW, halfH],
                [-halfW, halfH]
            ];
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 1.4 / scale;
            for (const [cx, cy] of corners) {
                ctx.fillRect(cx - halfS, cy - halfS, handleSize, handleSize);
                ctx.strokeRect(cx - halfS, cy - halfS, handleSize, handleSize);
            }

            // 4 Edge Resize Handles (cyan pills along edges for 1-axis drag-to-fit)
            const edgePillL = 12 / scale;
            const edgePillT = 4 / scale;
            ctx.fillStyle = '#38bdf8';
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 1 / scale;

            // Top & Bottom edge pills
            ctx.fillRect(-edgePillL / 2, -halfH - edgePillT / 2, edgePillL, edgePillT);
            ctx.strokeRect(-edgePillL / 2, -halfH - edgePillT / 2, edgePillL, edgePillT);
            ctx.fillRect(-edgePillL / 2, halfH - edgePillT / 2, edgePillL, edgePillT);
            ctx.strokeRect(-edgePillL / 2, halfH - edgePillT / 2, edgePillL, edgePillT);

            // Left & Right edge pills
            ctx.fillRect(-halfW - edgePillT / 2, -edgePillL / 2, edgePillT, edgePillL);
            ctx.strokeRect(-halfW - edgePillT / 2, -edgePillL / 2, edgePillT, edgePillL);
            ctx.fillRect(halfW - edgePillT / 2, -edgePillL / 2, edgePillT, edgePillL);
            ctx.strokeRect(halfW - edgePillT / 2, -edgePillL / 2, edgePillT, edgePillL);
        }

        ctx.restore();
    }

    getItemAt(x, y) {
        for (let i = this.items.length - 1; i >= 0; i--) {
            if (this.items[i].hitTest(x, y)) {
                return this.items[i];
            }
        }
        return null;
    }
}
