/**
 * rooms.js - Room Tagging, Area Calculation & Floor Styling
 */

import { units } from './units.js';

let roomIdCounter = 1;

export const ROOM_PRESETS = [
    { name: 'Living Room', defaultW: 192, defaultH: 216, color: 'rgba(59, 130, 246, 0.08)' }, // 16' x 18'
    { name: 'Master Bedroom', defaultW: 168, defaultH: 192, color: 'rgba(168, 85, 247, 0.08)' }, // 14' x 16'
    { name: 'Bedroom', defaultW: 144, defaultH: 168, color: 'rgba(236, 72, 153, 0.08)' }, // 12' x 14'
    { name: 'Kitchen', defaultW: 120, defaultH: 144, color: 'rgba(234, 179, 8, 0.08)' }, // 10' x 12'
    { name: 'Dining', defaultW: 144, defaultH: 144, color: 'rgba(34, 197, 94, 0.08)' }, // 12' x 12'
    { name: 'Toilet / Bath', defaultW: 60, defaultH: 96, color: 'rgba(6, 182, 212, 0.08)' }, // 5' x 8'
    { name: 'Balcony', defaultW: 60, defaultH: 144, color: 'rgba(148, 163, 184, 0.08)' }, // 5' x 12'
    { name: 'Pooja Room', defaultW: 60, defaultH: 60, color: 'rgba(249, 115, 22, 0.08)' }, // 5' x 5'
    { name: 'Car Porch', defaultW: 144, defaultH: 216, color: 'rgba(100, 116, 139, 0.08)' }, // 12' x 18'
    { name: 'Foyer / Entry', defaultW: 72, defaultH: 72, color: 'rgba(203, 213, 225, 0.08)' },
    { name: 'Living (Double Height)', defaultW: 192, defaultH: 216, color: 'rgba(56, 189, 248, 0.08)', isDoubleHeight: true, ceilingHeight: 240 }, // 16' x 18'
    { name: 'Open to Below (Cutout)', defaultW: 168, defaultH: 192, color: 'rgba(148, 163, 184, 0.05)', isVoid: true, dottedCutoutPerimeter: true }, // 14' x 16'
    { name: 'Slab Projection (1\'-6")', defaultW: 60, defaultH: 144, color: 'rgba(148, 163, 184, 0.05)', dottedSlabLine: true, slabOffset: 18 },
    { name: 'Balcony (Slab)', defaultW: 60, defaultH: 144, color: 'rgba(148, 163, 184, 0.06)', dottedSlabLine: true, slabOffset: 0 },
    { name: 'Porch (Slab Projection)', defaultW: 144, defaultH: 216, color: 'rgba(100, 116, 139, 0.06)', dottedSlabLine: true, slabOffset: 18 }
];

export class Room {
    constructor(x, y, options = {}) {
        this.id = `room_${roomIdCounter++}`;
        this.x = x;
        this.y = y;
        this.name = options.name || 'Room';
        this.width = options.width || 144;   // 12 feet default
        this.height = options.height || 144; // 12 feet default
        this.color = options.color || 'rgba(56, 189, 248, 0.06)';
        this.polygon = options.polygon || null; // optional custom polygon vertices
        this.labelScale = options.labelScale !== undefined ? options.labelScale : 1.0; // 0.5 to 2.5
        this.showDimensions = options.showDimensions !== false;
        this.showArea = options.showArea !== false;
        this.rotation = options.rotation !== undefined ? options.rotation : 0; // in degrees 0..360
        this.tagStyle = options.tagStyle || 'pill'; // 'pill' | 'clean' (clean floating text like CAD drawings)
        this.autoOrientNarrow = options.autoOrientNarrow !== undefined ? options.autoOrientNarrow : true;
        this.isDoubleHeight = options.isDoubleHeight || false;
        this.ceilingHeight = options.ceilingHeight || 240; // 20 feet in inches
        this.isVoid = options.isVoid || false;
        this.voidType = options.voidType || 'open_to_below';
        this.dottedSlabLine = !!options.dottedSlabLine;
        this.slabOffset = options.slabOffset !== undefined ? options.slabOffset : 0; // offset in inches (e.g. 0, 12, 18, 24)
        this.slabLinePattern = options.slabLinePattern || 'dashed'; // 'dotted' | 'dashed' | 'dash_dot'
        this.slabLabel = options.slabLabel || '';
        this.dottedCutoutPerimeter = options.dottedCutoutPerimeter !== undefined ? options.dottedCutoutPerimeter : false;
    }

    isNarrow() {
        const bounds = this.getBounds();
        const w = bounds.width || this.width || 120;
        const h = bounds.height || this.height || 120;
        const ratio = Math.max(w / Math.max(h, 1), h / Math.max(w, 1));
        const nameUpper = (this.name || '').toUpperCase();
        const isNarrowName = nameUpper.includes('BALCONY') || nameUpper.includes('UTILITY') || nameUpper.includes('PASSAGE') || nameUpper.includes('CORRIDOR');
        return ratio >= 1.9 || isNarrowName;
    }

    rotate(deg = 90) {
        this.rotation = ((this.rotation + deg) % 360 + 360) % 360;
    }

    getArea() {
        if (this.polygon && this.polygon.length >= 3) {
            let a = 0;
            for (let i = 0; i < this.polygon.length; i++) {
                const j = (i + 1) % this.polygon.length;
                a += this.polygon[i].x * this.polygon[j].y;
                a -= this.polygon[j].x * this.polygon[i].y;
            }
            return Math.abs(a) / 2;
        }
        return this.width * this.height;
    }

    getBounds() {
        if (this.polygon && this.polygon.length >= 3) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of this.polygon) {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
            }
            return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
        return {
            x: this.x - this.width / 2,
            y: this.y - this.height / 2,
            width: this.width,
            height: this.height
        };
    }

    getDynamicScale() {
        const bounds = this.getBounds();
        const w = Math.max(bounds.width || this.width || 144, 24);
        const h = Math.max(bounds.height || this.height || 144, 24);
        const minDim = Math.min(w, h);
        const meanDim = Math.sqrt(w * h);
        // Effective room scale based on room dimensions
        // A 12' x 12' (144" x 144") room gives ratio 1.0
        const effectiveDim = 0.65 * minDim + 0.35 * meanDim;
        const ratio = effectiveDim / 144;
        const sRoom = Math.pow(ratio, 0.52);
        return Math.max(0.58, Math.min(1.90, sRoom));
    }

    getBadgeMetrics(scale = 1, isExport = false) {
        const dynScale = this.getDynamicScale();
        const userScale = this.labelScale !== undefined ? this.labelScale : 1.0;
        const totalScale = dynScale * userScale;

        const bounds = this.getBounds();
        const showDim = this.showDimensions !== false;
        const showArea = this.showArea !== false;
        const showTag = !!(this.isDoubleHeight || this.isVoid || this.dottedSlabLine);

        let linesCount = 1;
        if (showTag) linesCount++;
        if (showDim) linesCount++;
        if (showArea) linesCount++;

        let tagText = '';
        if (this.isDoubleHeight) {
            tagText = `✦ DOUBLE HT (${units.formatLength(this.ceilingHeight || 240)})`;
        } else if (this.isVoid) {
            tagText = 'OPEN TO BELOW (VOID)';
        } else if (this.dottedSlabLine) {
            tagText = this.slabLabel || (this.slabOffset > 0 ? `╌ SLAB PROJ (${units.formatLength(this.slabOffset)})` : '╌ SLAB MARKING');
        }

        // Base font sizes in physical WORLD UNITS (inches)
        let titleSize = 11.5 * totalScale;
        let subSize = 8.0 * totalScale;

        // Line spacing derived from font sizes to guarantee zero overlap and clean breathing space
        let lineSpacing = Math.max(titleSize * 1.15, subSize * 1.35);
        let padX = 12 * totalScale;
        let padY = 7 * totalScale;

        // Estimate text width in world units (inches)
        const nameLen = (this.name || 'Room').length;
        const estNameW = nameLen * titleSize * 0.65;
        const estTagW = showTag ? tagText.length * subSize * 0.58 : 0;
        const estDimW = showDim ? 18 * subSize * 0.58 : 0;
        const estAreaW = showArea ? 14 * subSize * 0.60 : 0;
        const maxEstTextW = Math.max(estNameW, estTagW, estDimW, estAreaW);

        let badgeW = Math.max(54 * totalScale, maxEstTextW + padX * 2);
        let badgeH = linesCount === 4
            ? (lineSpacing * 3.15 + padY * 2)
            : linesCount === 3
                ? (lineSpacing * 2.25 + padY * 2)
                : linesCount === 2
                    ? (lineSpacing * 1.30 + padY * 2)
                    : (titleSize + padY * 2.0);

        // Keep badge well-proportioned within physical room boundaries
        const maxAllowedW = Math.max(bounds.width * 0.88, 16);
        const maxAllowedH = Math.max(bounds.height * 0.82, 14);
        if (badgeW > maxAllowedW || badgeH > maxAllowedH) {
            const fitScale = Math.min(maxAllowedW / badgeW, maxAllowedH / badgeH);
            badgeW *= fitScale;
            badgeH *= fitScale;
            titleSize *= fitScale;
            subSize *= fitScale;
            padX *= fitScale;
            padY *= fitScale;
            lineSpacing *= fitScale;
        }

        return {
            titleSize,
            subSize,
            badgeW,
            badgeH,
            padX,
            padY,
            lineSpacing,
            linesCount,
            showDim,
            showArea,
            showTag,
            tagText,
            totalScale,
            dynScale
        };
    }

    getBadgeBounds(scale = 1, isExport = false) {
        const m = this.getBadgeMetrics(scale, isExport);
        return {
            x: this.x - m.badgeW / 2,
            y: this.y - m.badgeH / 2,
            width: m.badgeW,
            height: m.badgeH
        };
    }

    hitBadge(px, py, scale = 1) {
        const rot = this.rotation || 0;
        const rad = (-rot * Math.PI) / 180;
        const dx = px - this.x;
        const dy = py - this.y;
        const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
        const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

        const bb = this.getBadgeBounds(scale, false);
        const halfW = bb.width / 2;
        const halfH = bb.height / 2;
        return Math.abs(localX) <= halfW && Math.abs(localY) <= halfH;
    }

    getRotationHandlePoint(scale = 1) {
        const m = this.getBadgeMetrics(scale, false);
        const stemLen = 16 * m.totalScale;
        const localY = -m.badgeH / 2 - stemLen;
        const rot = this.rotation || 0;
        const rad = (rot * Math.PI) / 180;
        return {
            x: this.x - localY * Math.sin(rad),
            y: this.y + localY * Math.cos(rad),
            radius: Math.max(5 * m.totalScale, 6 / scale)
        };
    }

    hitRotationHandle(px, py, scale = 1) {
        const pt = this.getRotationHandlePoint(scale);
        const hitTol = Math.max(pt.radius * 2, 14 / scale);
        return Math.hypot(px - pt.x, py - pt.y) <= hitTol;
    }

    hitTest(px, py, scale = 1) {
        // Direct hit on rotated badge pill
        return this.hitBadge(px, py, scale);
    }
}

export class RoomManager {
    constructor() {
        this.rooms = [];
        this.selectedRoomId = null;
    }

    addRoom(x, y, options = {}) {
        const room = new Room(x, y, options);
        this.rooms.push(room);
        return room;
    }

    removeRoom(id) {
        this.rooms = this.rooms.filter(r => r.id !== id);
        if (this.selectedRoomId === id) this.selectedRoomId = null;
    }

    getRoomById(id) {
        return this.rooms.find(r => r.id === id);
    }

    clear() {
        this.rooms = [];
        this.selectedRoomId = null;
    }

    rotateRoom(id, deg = 90) {
        const room = this.getRoomById(id);
        if (room) {
            room.rotate(deg);
            return room;
        }
        return null;
    }

    render(ctx, scale, isExport = false, style = 'blueprint') {
        for (const room of this.rooms) {
            const isSelected = room.id === this.selectedRoomId;
            this.renderSingleRoom(ctx, room, scale, isSelected, isExport, style);
        }
    }

    renderSingleRoom(ctx, room, scale, isSelected, isExport = false, style = 'blueprint') {
        const roomObj = (room instanceof Room) ? room : Object.assign(new Room(room.x, room.y, room), room);
        ctx.save();

        const metrics = roomObj.getBadgeMetrics(scale, isExport);
        const areaSqInches = roomObj.getArea();
        const areaFormatted = units.formatArea(areaSqInches);
        const dimFormatted = `${units.formatLength(roomObj.width)} × ${units.formatLength(roomObj.height)}`;

        const cx = roomObj.x;
        const cy = roomObj.y;
        const isClean = style === 'clean';

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const roomName = (roomObj.name || 'Room').toUpperCase();
        ctx.font = `bold ${metrics.titleSize}px sans-serif`;
        const nameW = ctx.measureText(roomName).width;
        ctx.font = `600 ${metrics.subSize}px sans-serif`;
        const dimW = metrics.showDim ? ctx.measureText(dimFormatted).width : 0;
        ctx.font = `600 ${metrics.subSize}px sans-serif`;
        const areaW = metrics.showArea ? ctx.measureText(areaFormatted.primary).width : 0;
        const maxTextW = Math.max(nameW, dimW, areaW);

        const badgeW = Math.max(metrics.badgeW, maxTextW + metrics.padX * 2);
        const badgeH = metrics.badgeH;

        // Draw Void Cutout cross (X) or Double Height volume brackets
        const b = roomObj.getBounds();
        if (roomObj.isVoid) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x + b.width, b.y + b.height);
            ctx.moveTo(b.x + b.width, b.y);
            ctx.lineTo(b.x, b.y + b.height);
            ctx.strokeStyle = isClean ? 'rgba(100, 116, 139, 0.45)' : 'rgba(56, 189, 248, 0.40)';
            ctx.lineWidth = (isExport ? 1.5 : 1.2) / scale;
            ctx.setLineDash([8 / scale, 6 / scale]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Void boundary perimeter
            ctx.strokeStyle = isClean ? 'rgba(71, 85, 105, 0.70)' : 'rgba(56, 189, 248, 0.60)';
            ctx.lineWidth = (isExport ? 1.8 : 1.4) / scale;
            if (roomObj.dottedCutoutPerimeter || roomObj.dottedSlabLine) {
                ctx.setLineDash([8 / scale, 5 / scale]);
            }
            ctx.strokeRect(b.x, b.y, b.width, b.height);
            ctx.setLineDash([]);

            // Subtle inner balustrade railing indicator (offset by 4 inches)
            const rOff = 4;
            if (b.width > rOff * 2 && b.height > rOff * 2) {
                ctx.strokeStyle = isClean ? 'rgba(148, 163, 184, 0.40)' : 'rgba(56, 189, 248, 0.25)';
                ctx.lineWidth = 0.8 / scale;
                ctx.setLineDash([3 / scale, 3 / scale]);
                ctx.strokeRect(b.x + rOff, b.y + rOff, b.width - rOff * 2, b.height - rOff * 2);
                ctx.setLineDash([]);
            }
            ctx.restore();
        } else if (roomObj.isDoubleHeight) {
            const arm = Math.min(Math.min(b.width, b.height) * 0.18, 28);
            ctx.save();
            ctx.strokeStyle = isClean ? '#0284c7' : '#38bdf8';
            ctx.lineWidth = (isExport ? 1.8 : 1.3) / scale;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y + arm); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x + arm, b.y);
            ctx.moveTo(b.x + b.width - arm, b.y); ctx.lineTo(b.x + b.width, b.y); ctx.lineTo(b.x + b.width, b.y + arm);
            ctx.moveTo(b.x, b.y + b.height - arm); ctx.lineTo(b.x, b.y + b.height); ctx.lineTo(b.x + arm, b.y + b.height);
            ctx.moveTo(b.x + b.width - arm, b.y + b.height); ctx.lineTo(b.x + b.width, b.y + b.height); ctx.lineTo(b.x + b.width, b.y + b.height - arm);
            ctx.stroke();
            ctx.restore();
        }

        // Draw Dotted Line Slab Marking / Projection
        if (roomObj.dottedSlabLine && !roomObj.isVoid) {
            ctx.save();
            const off = roomObj.slabOffset !== undefined ? roomObj.slabOffset : 0;
            const sx = b.x - off;
            const sy = b.y - off;
            const sw = b.width + off * 2;
            const sh = b.height + off * 2;

            ctx.strokeStyle = isClean ? '#0284c7' : '#38bdf8';
            ctx.lineWidth = (isExport ? 1.6 : 1.3) / scale;

            if (roomObj.slabLinePattern === 'dotted') {
                ctx.setLineDash([3 / scale, 4 / scale]);
            } else if (roomObj.slabLinePattern === 'dash_dot') {
                ctx.setLineDash([10 / scale, 4 / scale, 3 / scale, 4 / scale]);
            } else {
                ctx.setLineDash([8 / scale, 5 / scale]);
            }

            ctx.strokeRect(sx, sy, sw, sh);
            ctx.setLineDash([]);

            // Corner L-bracket ticks
            const tick = (isExport ? 7 : 5) / scale;
            ctx.strokeStyle = isClean ? '#0369a1' : '#7dd3fc';
            ctx.lineWidth = (isExport ? 1.2 : 1.0) / scale;
            ctx.beginPath();
            ctx.moveTo(sx - tick, sy); ctx.lineTo(sx, sy); ctx.lineTo(sx, sy - tick);
            ctx.moveTo(sx + sw + tick, sy); ctx.lineTo(sx + sw, sy); ctx.lineTo(sx + sw, sy - tick);
            ctx.moveTo(sx - tick, sy + sh); ctx.lineTo(sx, sy + sh); ctx.lineTo(sx, sy + sh + tick);
            ctx.moveTo(sx + sw + tick, sy + sh); ctx.lineTo(sx + sw, sy + sh); ctx.lineTo(sx + sw, sy + sh + tick);
            ctx.stroke();

            // Subtle cantilever tint if overhang exists
            if (off > 0) {
                ctx.fillStyle = isClean ? 'rgba(2, 132, 199, 0.03)' : 'rgba(56, 189, 248, 0.04)';
                ctx.fillRect(sx, sy, sw, sh);
            }
            ctx.restore();
        }

        // Apply local rotation transform to label badge
        ctx.save();
        ctx.translate(cx, cy);
        if (roomObj.rotation) {
            ctx.rotate((roomObj.rotation * Math.PI) / 180);
        }

        const isPill = roomObj.tagStyle !== 'clean';

        if (isPill) {
            // Background pill
            if (isClean) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            } else {
                ctx.fillStyle = isExport ? 'rgba(15, 23, 42, 0.95)' : 'rgba(15, 23, 42, 0.90)';
            }

            const cornerR = Math.min(4 * metrics.totalScale, Math.min(badgeW, badgeH) / 3);
            const strokeColor = (isSelected && !isExport)
                ? (isClean ? '#0284c7' : '#38bdf8')
                : (isClean ? 'rgba(15, 23, 42, 0.35)' : (isExport ? 'rgba(56, 189, 248, 0.55)' : 'rgba(56, 189, 248, 0.40)'));
            const strokeW = ((isSelected && !isExport) ? 2 : (isExport ? 1.5 : 1)) / scale;

            let drewRoundRect = false;
            if (typeof ctx.roundRect === 'function') {
                try {
                    ctx.beginPath();
                    ctx.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, cornerR);
                    ctx.fill();
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = strokeW;
                    ctx.stroke();
                    drewRoundRect = true;
                } catch (err) {
                    drewRoundRect = false;
                }
            }
            if (!drewRoundRect) {
                ctx.fillRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = strokeW;
                ctx.strokeRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
            }
        } else if (isSelected && !isExport) {
            // Clean floating style: subtle dashed boundary box when selected
            ctx.strokeStyle = isClean ? '#0284c7' : '#38bdf8';
            ctx.lineWidth = 1.2 / scale;
            ctx.setLineDash([4 / scale, 4 / scale]);
            ctx.strokeRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
            ctx.setLineDash([]);
        }

        // Interactive rotation handle stem & circular grip (only in editor, not in export)
        if (isSelected && !isExport) {
            const stemLen = 16 * metrics.totalScale;
            const dotR = Math.max(5 * metrics.totalScale, 6 / scale);
            const topY = -badgeH / 2;

            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.5 / scale;
            ctx.beginPath();
            ctx.moveTo(0, topY);
            ctx.lineTo(0, topY - stemLen);
            ctx.stroke();

            // Circular rotation grip
            ctx.fillStyle = '#0284c7';
            ctx.beginPath();
            ctx.arc(0, topY - stemLen, dotR, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2 / scale;
            ctx.stroke();

            // Inner dot
            ctx.fillStyle = '#f8fafc';
            ctx.beginPath();
            ctx.arc(0, topY - stemLen, dotR * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }

        // Color definitions for maximum contrast and sharpness
        const titleColor = isClean ? '#0f172a' : '#ffffff';
        const dimColor = isClean ? '#1e293b' : '#f1f5f9';
        const areaColor = isClean ? '#0284c7' : '#38bdf8';
        const tagColor = isClean ? '#0284c7' : '#38bdf8';
        const tagSize = Math.max(metrics.subSize * 0.90, 7 * metrics.totalScale);

        const linesCount = metrics.linesCount;
        const lineSpacing = metrics.lineSpacing;

        let displayName = roomName;
        if (roomObj.isNarrow() && (roomName.includes('BALCONY') || roomName.includes('UTILITY') || roomName.includes('PASSAGE') || roomName.includes('CORRIDOR'))) {
            displayName = roomName.split('').join(' ');
        }

        // Protective text halo for clean floating style
        if (!isPill) {
            ctx.shadowColor = isClean ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.95)';
            ctx.shadowBlur = 4 / scale;
        }

        if (linesCount === 4) {
            // Room Name
            ctx.font = `bold ${metrics.titleSize}px sans-serif`;
            ctx.fillStyle = titleColor;
            ctx.fillText(displayName, 0, -lineSpacing * 1.50);

            // Double Height / Cutout tag
            ctx.font = `bold ${tagSize}px sans-serif`;
            ctx.fillStyle = tagColor;
            ctx.fillText(metrics.tagText, 0, -lineSpacing * 0.50);

            // Dimensions
            ctx.font = `600 ${metrics.subSize}px sans-serif`;
            ctx.fillStyle = dimColor;
            ctx.fillText(dimFormatted, 0, lineSpacing * 0.50);

            // Area
            ctx.font = `600 ${metrics.subSize}px sans-serif`;
            ctx.fillStyle = areaColor;
            ctx.fillText(areaFormatted.primary, 0, lineSpacing * 1.50);
        } else if (linesCount === 3) {
            if (metrics.showTag) {
                // Room Name
                ctx.font = `bold ${metrics.titleSize}px sans-serif`;
                ctx.fillStyle = titleColor;
                ctx.fillText(displayName, 0, -lineSpacing * 1.05);

                // Tag
                ctx.font = `bold ${tagSize}px sans-serif`;
                ctx.fillStyle = tagColor;
                ctx.fillText(metrics.tagText, 0, 0);

                // Third line (dim or area)
                const thirdText = metrics.showDim ? dimFormatted : areaFormatted.primary;
                const thirdColor = metrics.showDim ? dimColor : areaColor;
                ctx.font = `600 ${metrics.subSize}px sans-serif`;
                ctx.fillStyle = thirdColor;
                ctx.fillText(thirdText, 0, lineSpacing * 1.05);
            } else {
                // Room Name
                ctx.font = `bold ${metrics.titleSize}px sans-serif`;
                ctx.fillStyle = titleColor;
                ctx.fillText(displayName, 0, -lineSpacing * 1.05);

                // Dimensions
                ctx.font = `600 ${metrics.subSize}px sans-serif`;
                ctx.fillStyle = dimColor;
                ctx.fillText(dimFormatted, 0, 0);

                // Area
                ctx.font = `600 ${metrics.subSize}px sans-serif`;
                ctx.fillStyle = areaColor;
                ctx.fillText(areaFormatted.primary, 0, lineSpacing * 1.05);
            }
        } else if (linesCount === 2) {
            // Room Name
            ctx.font = `bold ${metrics.titleSize}px sans-serif`;
            ctx.fillStyle = titleColor;
            ctx.fillText(displayName, 0, -lineSpacing * 0.55);

            // Second line (tag, dim or area)
            const secondText = metrics.showTag ? metrics.tagText : (metrics.showDim ? dimFormatted : areaFormatted.primary);
            const secondColor = metrics.showTag ? tagColor : (metrics.showDim ? dimColor : areaColor);
            ctx.font = `600 ${metrics.subSize}px sans-serif`;
            ctx.fillStyle = secondColor;
            ctx.fillText(secondText, 0, lineSpacing * 0.55);
        } else {
            // Only Room Name
            ctx.font = `bold ${metrics.titleSize}px sans-serif`;
            ctx.fillStyle = titleColor;
            ctx.fillText(displayName, 0, 0);
        }

        if (!isPill) {
            ctx.shadowBlur = 0;
        }

        ctx.restore(); // restore local rotation transform
        ctx.restore(); // restore global room save
    }

    getRoomAt(x, y, scale = 1) {
        // Check badge pill for selection and dragging
        for (let i = this.rooms.length - 1; i >= 0; i--) {
            if (this.rooms[i].hitBadge(x, y, scale)) {
                return this.rooms[i];
            }
        }
        return null;
    }
}
