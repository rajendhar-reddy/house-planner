/**
 * stairs.js - Architectural Stairs & Staircase System
 */

import { units } from './units.js';

let stairIdCounter = 1;

export const STAIR_PRESETS = [
    {
        type: 'dogleg',
        landingSteps: 3,
        name: 'Dog-Legged with Winder Landing (2-Turn Steps)',
        flightWidth: 36, // 3 ft
        treads: 17,
        treadDepth: 10,  // 10 inches
        landingDepth: 36, // 3 ft landing
        wellWidth: 6     // 6 inch gap between flights
    },
    {
        type: 'dogleg',
        landingSteps: 0,
        name: 'Standard Dog-Legged (Flat Landing)',
        flightWidth: 36, // 3 ft
        treads: 16,
        treadDepth: 10,
        landingDepth: 36,
        wellWidth: 6
    },
    {
        type: 'open_well',
        landingSteps: 0,
        name: 'Open-Well (3 Flights / 2 Turns)',
        flightWidth: 36,
        treads: 18,
        treadDepth: 10,
        landingDepth: 36,
        wellWidth: 30,
        middleTreads: 3
    },
    {
        type: 'dogleg_wide',
        landingSteps: 0,
        name: 'Wide Dog-Legged (3.5 ft)',
        flightWidth: 42, // 3.5 ft
        treads: 18,
        treadDepth: 10,
        landingDepth: 42,
        wellWidth: 6
    },
    {
        type: 'straight',
        name: 'Straight Flight',
        flightWidth: 36,
        treads: 14,
        treadDepth: 10,
        landingDepth: 0,
        wellWidth: 0
    },
    {
        type: 'l_shape',
        name: 'L-Shaped (Quarter-Turn)',
        flightWidth: 36,
        treads: 16,
        treadDepth: 10,
        landingDepth: 36,
        wellWidth: 0
    },
    {
        type: 'spiral',
        name: 'Circular / Spiral Staircase',
        flightWidth: 30, // 2.5 ft radius flight
        treads: 16,
        treadDepth: 9,
        landingDepth: 0,
        wellWidth: 6 // central pole radius
    }
];

export class Stair {
    constructor(options = {}) {
        this.id = `stair_${stairIdCounter++}`;
        this.x = options.x || 0;
        this.y = options.y || 0;
        this.type = options.type || 'dogleg'; // 'dogleg' | 'straight' | 'l_shape' | 'spiral' | 'open_well'
        this.flightWidth = options.flightWidth || 36; // 3 ft
        this.treads = options.treads || (options.type === 'dogleg' && options.landingSteps === 3 ? 17 : 16);
        this.treadDepth = options.treadDepth || 10;
        this.landingDepth = options.landingDepth || (this.type === 'straight' ? 0 : 36);
        this.wellWidth = options.wellWidth !== undefined ? options.wellWidth : (this.type === 'open_well' ? 30 : 6);
        this.rotation = options.rotation || 0; // 0, 90, 180, 270
        this.turnDirection = options.turnDirection || 'left'; // 'left' | 'right'
        this.showBreakLine = options.showBreakLine !== false; // true by default
        this.landingSteps = options.landingSteps !== undefined ? options.landingSteps : 0; // 0: flat, 2: split, 3: 2-turn winders, 4: 4-winders
        this.middleTreads = options.middleTreads || 3; // for open_well
    }

    /**
     * Compute unrotated local dimensions
     */
    getLocalDimensions() {
        if (this.type === 'straight') {
            const totalLength = this.treads * this.treadDepth;
            return { width: this.flightWidth, height: totalLength };
        } else if (this.type === 'dogleg' || this.type === 'dogleg_wide') {
            const landingStepsCount = this.landingSteps || 0;
            const treadsPerFlight = Math.max(1, Math.floor((this.treads - landingStepsCount) / 2));
            const flightRun = treadsPerFlight * this.treadDepth;
            const totalHeight = flightRun + this.landingDepth;
            const totalWidth = this.flightWidth * 2 + this.wellWidth;
            return { width: totalWidth, height: totalHeight };
        } else if (this.type === 'open_well') {
            const midTreads = this.middleTreads || 3;
            const treadsPerFlight = Math.max(1, Math.floor((this.treads - midTreads) / 2));
            const flightRun = treadsPerFlight * this.treadDepth;
            const totalHeight = flightRun + this.flightWidth;
            const totalWidth = this.flightWidth * 2 + Math.max(this.wellWidth, 24);
            return { width: totalWidth, height: totalHeight };
        } else if (this.type === 'l_shape') {
            const treadsPerFlight = Math.max(1, Math.floor((this.treads - 2) / 2));
            const flightRun = treadsPerFlight * this.treadDepth;
            const totalWidth = flightRun + this.flightWidth;
            const totalHeight = flightRun + this.flightWidth;
            return { width: totalWidth, height: totalHeight };
        } else if (this.type === 'spiral') {
            const diameter = (this.flightWidth + this.wellWidth) * 2;
            return { width: diameter, height: diameter };
        }
        return { width: 72, height: 120 };
    }

    /**
     * Bounding box in world coordinates
     */
    getBounds() {
        const dim = this.getLocalDimensions();
        const rad = (this.rotation * Math.PI) / 180;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        const bbW = dim.width * cos + dim.height * sin;
        const bbH = dim.width * sin + dim.height * cos;

        return {
            x: this.x - bbW / 2,
            y: this.y - bbH / 2,
            width: bbW,
            height: bbH
        };
    }

    /**
     * Hit test point against rotated staircase
     */
    hitTest(px, py) {
        const rad = (-this.rotation * Math.PI) / 180;
        const dx = px - this.x;
        const dy = py - this.y;
        const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ly = dx * Math.sin(rad) + dy * Math.cos(rad);

        const dim = this.getLocalDimensions();
        const halfW = dim.width / 2;
        const halfH = dim.height / 2;

        return lx >= -halfW && lx <= halfW && ly >= -halfH && ly <= halfH;
    }

    /**
     * Render the architectural staircase
     */
    render(ctx, scale, isSelected = false) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);

        const dim = this.getLocalDimensions();
        const halfW = dim.width / 2;
        const halfH = dim.height / 2;

        // Selection / Hover Outline
        if (isSelected) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2 / scale;
            ctx.setLineDash([6 / scale, 4 / scale]);
            ctx.strokeRect(-halfW - 4 / scale, -halfH - 4 / scale, dim.width + 8 / scale, dim.height + 8 / scale);
            ctx.setLineDash([]);
        }

        // Render specific stair geometry
        if (this.type === 'straight') {
            this.renderStraight(ctx, scale, dim, halfW, halfH);
        } else if (this.type === 'dogleg' || this.type === 'dogleg_wide') {
            this.renderDogLeg(ctx, scale, dim, halfW, halfH);
        } else if (this.type === 'open_well') {
            this.renderOpenWell(ctx, scale, dim, halfW, halfH);
        } else if (this.type === 'l_shape') {
            this.renderLShape(ctx, scale, dim, halfW, halfH);
        } else if (this.type === 'spiral') {
            this.renderSpiral(ctx, scale, dim);
        }

        ctx.restore();
    }

    /**
     * Render Straight Flight Staircase
     */
    renderStraight(ctx, scale, dim, halfW, halfH) {
        const fw = this.flightWidth;
        const numTreads = this.treads;
        const td = this.treadDepth;
        const totalLen = numTreads * td;
        const startY = halfH; // bottom of stairs (start)
        const endY = -halfH;  // top of stairs (end)

        // 1. Background Fill
        ctx.fillStyle = 'rgba(30, 41, 59, 0.65)';
        ctx.fillRect(-halfW, -halfH, fw, totalLen);

        // 2. Outer Stringers (side rails)
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2.5 / scale;
        ctx.strokeRect(-halfW, -halfH, fw, totalLen);

        // 3. Treads (Steps)
        const breakIndex = this.showBreakLine ? Math.min(8, Math.floor(numTreads * 0.55)) : numTreads + 1;

        for (let i = 1; i < numTreads; i++) {
            const stepY = startY - i * td;
            const isAboveBreak = i >= breakIndex;

            ctx.beginPath();
            ctx.strokeStyle = isAboveBreak ? '#64748b' : '#cbd5e1';
            ctx.lineWidth = 1.2 / scale;
            if (isAboveBreak) {
                ctx.setLineDash([4 / scale, 3 / scale]);
            } else {
                ctx.setLineDash([]);
            }
            ctx.moveTo(-halfW, stepY);
            ctx.lineTo(halfW, stepY);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // 4. Floor Break Line (Zigzag Cut)
        if (this.showBreakLine && breakIndex < numTreads) {
            const by = startY - breakIndex * td;
            this.drawBreakLine(ctx, -halfW, by, halfW, by, scale);
        }

        // 5. Walk Path Line & "UP" Arrow
        const walkX = 0;
        const walkStartY = startY - td * 0.5;
        const walkEndY = endY + td * 0.8;

        // Ground Step Circle (●)
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(walkX, walkStartY, 3.5 / scale, 0, Math.PI * 2);
        ctx.fill();

        // Path Line
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.6 / scale;
        ctx.beginPath();
        ctx.moveTo(walkX, walkStartY);
        ctx.lineTo(walkX, walkEndY);
        ctx.stroke();

        // Arrow Head (▲)
        this.drawArrowHead(ctx, walkX, walkEndY, -Math.PI / 2, scale);

        // "UP" Label
        ctx.fillStyle = '#38bdf8';
        ctx.font = `bold ${Math.max(10 / scale, 3.2)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('UP', walkX + 6 / scale, walkStartY - 12 / scale);
    }

    /**
     * Render Dog-Legged (U-Turn) Staircase
     */
    renderDogLeg(ctx, scale, dim, halfW, halfH) {
        const fw = this.flightWidth;
        const ld = this.landingDepth;
        const ww = this.wellWidth;
        const landingSteps = this.landingSteps || 0;
        const treadsPerFlight = Math.max(1, Math.floor((this.treads - landingSteps) / 2));
        const td = this.treadDepth;
        const flightRun = treadsPerFlight * td;

        const leftFlightX = -halfW;
        const rightFlightX = halfW - fw;
        const landingY = -halfH; // landing at top
        const flightStartY = -halfH + ld; // where steps begin below landing
        const flightEndY = flightStartY + flightRun;

        // 1. Background fill
        ctx.fillStyle = 'rgba(30, 41, 59, 0.65)';
        ctx.fillRect(-halfW, -halfH, dim.width, dim.height);

        // 2. Outer Stringers (Enclosing Box)
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2.5 / scale;
        ctx.strokeRect(-halfW, -halfH, dim.width, dim.height);

        // 3. Central Well / Handrail Divider
        const wellLeft = leftFlightX + fw;
        const wellRight = rightFlightX;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(wellLeft, flightStartY, ww, flightRun);
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5 / scale;
        ctx.strokeRect(wellLeft, flightStartY, ww, flightRun);

        // 4. Mid-Landing Step Configuration
        const isLeftTurn = this.turnDirection === 'left';
        const f1X = isLeftTurn ? leftFlightX : rightFlightX;
        const f2X = isLeftTurn ? rightFlightX : leftFlightX;

        // Base flight boundary line
        ctx.beginPath();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2 / scale;
        ctx.moveTo(-halfW, flightStartY);
        ctx.lineTo(halfW, flightStartY);
        ctx.stroke();

        if (landingSteps === 0) {
            // Flat Mid-Landing
            ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
            ctx.font = `600 ${Math.max(9 / scale, 3)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('MID-LANDING', 0, -halfH + ld / 2);
        } else if (landingSteps === 2) {
            // 2 Steps / Split Landing (Center vertical dividing line)
            ctx.beginPath();
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1.8 / scale;
            ctx.moveTo(0, landingY);
            ctx.lineTo(0, flightStartY);
            ctx.stroke();

            // Labels for Turn 1 and Turn 2
            ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
            ctx.font = `bold ${Math.max(8.5 / scale, 2.8)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const f1MidX = isLeftTurn ? (-halfW + wellLeft) / 2 : (wellRight + halfW) / 2;
            const f2MidX = isLeftTurn ? (wellRight + halfW) / 2 : (-halfW + wellLeft) / 2;
            ctx.fillText('TURN 1', f1MidX, -halfH + ld / 2);
            ctx.fillText('TURN 2', f2MidX, -halfH + ld / 2);
        } else if (landingSteps === 3) {
            // 3 Winder Steps: 2-Turn Winders (Turn 1 diagonal + Middle step + Turn 2 diagonal)
            // Diagonals radiate from the inner well corners to the top outer corners
            ctx.beginPath();
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1.8 / scale;

            // Left diagonal: (wellLeft, flightStartY) -> (-halfW, landingY)
            ctx.moveTo(wellLeft, flightStartY);
            ctx.lineTo(-halfW, landingY);

            // Right diagonal: (wellRight, flightStartY) -> (halfW, landingY)
            ctx.moveTo(wellRight, flightStartY);
            ctx.lineTo(halfW, landingY);
            ctx.stroke();

            // Labels for Turn 1, Step 2, Turn 2
            ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
            ctx.font = `bold ${Math.max(8 / scale, 2.6)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (isLeftTurn) {
                ctx.fillText('TURN 1', -halfW + fw * 0.4, flightStartY - ld * 0.38);
                ctx.fillText('STEP 2', 0, landingY + ld * 0.32);
                ctx.fillText('TURN 2', halfW - fw * 0.4, flightStartY - ld * 0.38);
            } else {
                ctx.fillText('TURN 1', halfW - fw * 0.4, flightStartY - ld * 0.38);
                ctx.fillText('STEP 2', 0, landingY + ld * 0.32);
                ctx.fillText('TURN 2', -halfW + fw * 0.4, flightStartY - ld * 0.38);
            }
        } else if (landingSteps >= 4) {
            // 4 Winder Steps: 2 diagonals + center vertical divider
            ctx.beginPath();
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1.8 / scale;
            ctx.moveTo(wellLeft, flightStartY);
            ctx.lineTo(-halfW, landingY);
            ctx.moveTo(wellRight, flightStartY);
            ctx.lineTo(halfW, landingY);
            ctx.moveTo(0, landingY);
            ctx.lineTo(0, flightStartY);
            ctx.stroke();

            ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
            ctx.font = `bold ${Math.max(7.5 / scale, 2.5)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('WINDERS (4)', 0, landingY + ld * 0.25);
        }

        // 5. Treads for Flight 1 (Ascending) and Flight 2 (Upper)
        const breakIndex = this.showBreakLine ? Math.min(6, Math.floor(treadsPerFlight * 0.65)) : treadsPerFlight + 1;

        // Flight 1 Treads (Bottom to Landing)
        for (let i = 1; i <= treadsPerFlight; i++) {
            const stepY = flightEndY - i * td;
            const isAboveBreak = i >= breakIndex;

            ctx.beginPath();
            ctx.strokeStyle = isAboveBreak ? '#64748b' : '#cbd5e1';
            ctx.lineWidth = 1.2 / scale;
            if (isAboveBreak) {
                ctx.setLineDash([4 / scale, 3 / scale]);
            } else {
                ctx.setLineDash([]);
            }
            ctx.moveTo(f1X, stepY);
            ctx.lineTo(f1X + fw, stepY);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // Flight 1 Floor Break Line
        if (this.showBreakLine && breakIndex <= treadsPerFlight) {
            const by = flightEndY - breakIndex * td;
            this.drawBreakLine(ctx, f1X, by, f1X + fw, by, scale);
        }

        // Flight 2 Treads (Landing to Upper Floor - Upper Flight)
        for (let i = 1; i <= treadsPerFlight; i++) {
            const stepY = flightStartY + i * td;
            ctx.beginPath();
            ctx.strokeStyle = '#64748b';
            ctx.lineWidth = 1.2 / scale;
            ctx.setLineDash([4 / scale, 3 / scale]);
            ctx.moveTo(f2X, stepY);
            ctx.lineTo(f2X + fw, stepY);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // 6. Walk Path Line with Turn & "UP" Arrow
        const f1CenterX = f1X + fw / 2;
        const f2CenterX = f2X + fw / 2;
        const walkStartY = flightEndY - td * 0.5;

        // Start circle (●)
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(f1CenterX, walkStartY, 3.5 / scale, 0, Math.PI * 2);
        ctx.fill();

        // Path Line
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.6 / scale;
        ctx.beginPath();
        ctx.moveTo(f1CenterX, walkStartY);

        if (landingSteps === 3) {
            // Smooth 2-turn path through Turn 1 winder -> Middle step -> Turn 2 winder
            const t1X = isLeftTurn ? -halfW + fw * 0.45 : halfW - fw * 0.45;
            const t1Y = flightStartY - ld * 0.35;
            const midX = 0;
            const midY = landingY + ld * 0.35;
            const t2X = isLeftTurn ? halfW - fw * 0.45 : -halfW + fw * 0.45;
            const t2Y = flightStartY - ld * 0.35;

            ctx.lineTo(f1CenterX, flightStartY);
            ctx.lineTo(t1X, t1Y);
            ctx.lineTo(midX, midY);
            ctx.lineTo(t2X, t2Y);
            ctx.lineTo(f2CenterX, flightStartY);
            ctx.lineTo(f2CenterX, flightEndY - td * 0.8);
        } else {
            const landingMidY = -halfH + ld / 2;
            ctx.lineTo(f1CenterX, landingMidY);
            ctx.lineTo(f2CenterX, landingMidY);
            ctx.lineTo(f2CenterX, flightEndY - td * 0.8);
        }
        ctx.stroke();

        // Arrow head at flight 2 end
        this.drawArrowHead(ctx, f2CenterX, flightEndY - td * 0.8, Math.PI / 2, scale);

        // "UP" text
        ctx.fillStyle = '#38bdf8';
        ctx.font = `bold ${Math.max(10 / scale, 3.2)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('UP', f1CenterX, walkStartY - 14 / scale);
    }

    /**
     * Render Open-Well Staircase (3 Flights / 2 Intermediate Corner Landings)
     */
    renderOpenWell(ctx, scale, dim, halfW, halfH) {
        const fw = this.flightWidth;
        const ww = Math.max(24, this.wellWidth);
        const ld = fw; // corner landing square fw x fw
        const midTreads = this.middleTreads || 3;
        const treadsPerFlight = Math.max(1, Math.floor((this.treads - midTreads) / 2));
        const td = this.treadDepth;
        const flightRun = treadsPerFlight * td;

        const isLeftTurn = this.turnDirection === 'left';
        const leftFlightX = -halfW;
        const rightFlightX = halfW - fw;
        const landingY = -halfH;
        const flightStartY = -halfH + ld;
        const flightEndY = flightStartY + flightRun;

        // 1. Background fill
        ctx.fillStyle = 'rgba(30, 41, 59, 0.65)';
        ctx.fillRect(leftFlightX, -halfH, fw, dim.height);
        ctx.fillRect(rightFlightX, -halfH, fw, dim.height);
        ctx.fillRect(leftFlightX + fw, -halfH, ww, ld);

        // 2. Outer Stringers
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2.5 / scale;
        ctx.strokeRect(leftFlightX, -halfH, fw, dim.height);
        ctx.strokeRect(rightFlightX, -halfH, fw, dim.height);
        ctx.beginPath();
        ctx.moveTo(leftFlightX, -halfH);
        ctx.lineTo(rightFlightX + fw, -halfH);
        ctx.stroke();

        // 3. Corner Landing Squares
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.8 / scale;
        ctx.strokeRect(leftFlightX, -halfH, fw, ld);
        ctx.strokeRect(rightFlightX, -halfH, fw, ld);

        // Landing Labels
        ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.font = `bold ${Math.max(8 / scale, 2.6)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isLeftTurn ? 'TURN 1' : 'TURN 2', leftFlightX + fw / 2, -halfH + ld / 2);
        ctx.fillText(isLeftTurn ? 'TURN 2' : 'TURN 1', rightFlightX + fw / 2, -halfH + ld / 2);

        // 4. Intermediate Steps across the well
        const midStepW = ww / (midTreads + 1);
        const midStartX = leftFlightX + fw;
        for (let i = 1; i <= midTreads; i++) {
            const sx = midStartX + i * midStepW;
            ctx.beginPath();
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1.2 / scale;
            ctx.moveTo(sx, -halfH);
            ctx.lineTo(sx, -halfH + ld);
            ctx.stroke();
        }

        // Border for the mid landing stairs (front edge / riser separating mid-landing from the well)
        ctx.beginPath();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.8 / scale;
        ctx.moveTo(leftFlightX + fw, flightStartY);
        ctx.lineTo(rightFlightX, flightStartY);
        ctx.stroke();

        // Open well void outline (clean, transparent opening without black fill)
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5 / scale;
        ctx.strokeRect(leftFlightX + fw, flightStartY, ww, flightRun);

        // 5. Treads on Flight 1 & Flight 2
        const f1X = isLeftTurn ? leftFlightX : rightFlightX;
        const f2X = isLeftTurn ? rightFlightX : leftFlightX;
        const breakIndex = this.showBreakLine ? Math.min(6, Math.floor(treadsPerFlight * 0.65)) : treadsPerFlight + 1;

        // Flight 1 Treads (Ascending)
        for (let i = 1; i <= treadsPerFlight; i++) {
            const stepY = flightEndY - i * td;
            const isAboveBreak = i >= breakIndex;
            ctx.beginPath();
            ctx.strokeStyle = isAboveBreak ? '#64748b' : '#cbd5e1';
            ctx.lineWidth = 1.2 / scale;
            if (isAboveBreak) ctx.setLineDash([4 / scale, 3 / scale]);
            else ctx.setLineDash([]);
            ctx.moveTo(f1X, stepY);
            ctx.lineTo(f1X + fw, stepY);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        if (this.showBreakLine && breakIndex <= treadsPerFlight) {
            const by = flightEndY - breakIndex * td;
            this.drawBreakLine(ctx, f1X, by, f1X + fw, by, scale);
        }

        // Flight 2 Treads (Upper Flight)
        for (let i = 1; i <= treadsPerFlight; i++) {
            const stepY = flightStartY + i * td;
            ctx.beginPath();
            ctx.strokeStyle = '#64748b';
            ctx.lineWidth = 1.2 / scale;
            ctx.setLineDash([4 / scale, 3 / scale]);
            ctx.moveTo(f2X, stepY);
            ctx.lineTo(f2X + fw, stepY);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // 6. Walk Path Line & "UP" Arrow
        const f1CenterX = f1X + fw / 2;
        const f2CenterX = f2X + fw / 2;
        const landingMidY = -halfH + ld / 2;
        const walkStartY = flightEndY - td * 0.5;

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(f1CenterX, walkStartY, 3.5 / scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.6 / scale;
        ctx.beginPath();
        ctx.moveTo(f1CenterX, walkStartY);
        ctx.lineTo(f1CenterX, landingMidY);
        ctx.lineTo(f2CenterX, landingMidY);
        ctx.lineTo(f2CenterX, flightEndY - td * 0.8);
        ctx.stroke();

        this.drawArrowHead(ctx, f2CenterX, flightEndY - td * 0.8, Math.PI / 2, scale);

        ctx.fillStyle = '#38bdf8';
        ctx.font = `bold ${Math.max(10 / scale, 3.2)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('UP', f1CenterX, walkStartY - 14 / scale);
    }

    /**
     * Render L-Shaped Staircase
     */
    renderLShape(ctx, scale, dim, halfW, halfH) {
        const fw = this.flightWidth;
        const ld = fw; // corner landing is square fw x fw
        const treadsPerFlight = Math.max(1, Math.floor((this.treads - 2) / 2));
        const td = this.treadDepth;

        // Background fill
        ctx.fillStyle = 'rgba(30, 41, 59, 0.65)';
        ctx.fillRect(-halfW, -halfH, fw, dim.height); // vertical leg
        ctx.fillRect(-halfW, -halfH, dim.width, fw);  // horizontal leg

        // Outer borders
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2.5 / scale;
        ctx.strokeRect(-halfW, -halfH, fw, dim.height);
        ctx.strokeRect(-halfW, -halfH, dim.width, fw);

        // Corner Landing Square (-halfW, -halfH, fw, fw)
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.5 / scale;
        ctx.strokeRect(-halfW, -halfH, fw, fw);

        // Treads on Vertical Flight
        const vStartY = -halfH + fw;
        for (let i = 1; i <= treadsPerFlight; i++) {
            const sy = vStartY + i * td;
            ctx.beginPath();
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1.2 / scale;
            ctx.moveTo(-halfW, sy);
            ctx.lineTo(-halfW + fw, sy);
            ctx.stroke();
        }

        // Treads on Horizontal Flight
        const hStartX = -halfW + fw;
        for (let i = 1; i <= treadsPerFlight; i++) {
            const sx = hStartX + i * td;
            ctx.beginPath();
            ctx.strokeStyle = '#64748b';
            ctx.lineWidth = 1.2 / scale;
            ctx.setLineDash([4 / scale, 3 / scale]);
            ctx.moveTo(sx, -halfH);
            ctx.lineTo(sx, -halfH + fw);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // Walk Path Line
        const startX = -halfW + fw / 2;
        const startY = halfH - td * 0.5;
        const cornerX = -halfW + fw / 2;
        const cornerY = -halfH + fw / 2;
        const endX = halfW - td * 0.5;
        const endY = -halfH + fw / 2;

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(startX, startY, 3.5 / scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.6 / scale;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(cornerX, cornerY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        this.drawArrowHead(ctx, endX, endY, 0, scale);

        ctx.fillStyle = '#38bdf8';
        ctx.font = `bold ${Math.max(10 / scale, 3.2)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('UP', startX, startY - 12 / scale);
    }

    /**
     * Render Spiral Staircase
     */
    renderSpiral(ctx, scale, dim) {
        const radius = dim.width / 2;
        const poleRadius = Math.max(4, this.wellWidth);
        const steps = this.treads;
        const stepAngle = (Math.PI * 1.8) / steps; // around 320 degrees total sweep

        // Outer Ring & Pole Fill
        ctx.fillStyle = 'rgba(30, 41, 59, 0.65)';
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2.5 / scale;
        ctx.stroke();

        // Central Column (Pole)
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(0, 0, poleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();

        // Radial Treads (Spokes)
        for (let i = 0; i < steps; i++) {
            const a = i * stepAngle;
            ctx.beginPath();
            ctx.strokeStyle = i > 8 && this.showBreakLine ? '#64748b' : '#cbd5e1';
            ctx.lineWidth = 1.2 / scale;
            if (i > 8 && this.showBreakLine) ctx.setLineDash([4 / scale, 3 / scale]);
            else ctx.setLineDash([]);

            ctx.moveTo(Math.cos(a) * poleRadius, Math.sin(a) * poleRadius);
            ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // Spiral Arc Arrow
        const midR = (radius + poleRadius) / 2;
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.6 / scale;
        ctx.beginPath();
        ctx.arc(0, 0, midR, 0, stepAngle * (steps - 1));
        ctx.stroke();

        const endA = stepAngle * (steps - 1);
        const endX = Math.cos(endA) * midR;
        const endY = Math.sin(endA) * midR;
        this.drawArrowHead(ctx, endX, endY, endA + Math.PI / 2, scale);

        // Start Circle
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(midR, 0, 3.5 / scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = `bold ${Math.max(10 / scale, 3.2)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('UP', midR, -10 / scale);
    }

    /**
     * Architectural Zigzag Break Line
     */
    drawBreakLine(ctx, x1, y1, x2, y2, scale) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const zig = 8 / scale;

        ctx.save();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.8 / scale;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(midX - 10 / scale, midY);
        ctx.lineTo(midX - 5 / scale, midY - zig);
        ctx.lineTo(midX + 5 / scale, midY + zig);
        ctx.lineTo(midX + 10 / scale, midY);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Helper to draw arrowhead for walk lines
     */
    drawArrowHead(ctx, x, y, angle, scale) {
        const headLen = 8 / scale;
        ctx.save();
        ctx.fillStyle = '#38bdf8';
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-headLen, -headLen * 0.5);
        ctx.lineTo(-headLen, headLen * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

export class StairManager {
    constructor() {
        this.stairs = [];
        this.selectedStairId = null;
    }

    addStair(options = {}) {
        const stair = new Stair(options);
        this.stairs.push(stair);
        return stair;
    }

    removeStair(id) {
        this.stairs = this.stairs.filter(s => s.id !== id);
        if (this.selectedStairId === id) this.selectedStairId = null;
    }

    getStairById(id) {
        return this.stairs.find(s => s.id === id);
    }

    hitTest(px, py) {
        for (let i = this.stairs.length - 1; i >= 0; i--) {
            if (this.stairs[i].hitTest(px, py)) {
                return this.stairs[i];
            }
        }
        return null;
    }

    rotateStair(id, deg = 90) {
        const s = this.getStairById(id);
        if (s) {
            s.rotation = (s.rotation + deg) % 360;
        }
    }

    clear() {
        this.stairs = [];
        this.selectedStairId = null;
    }

    render(ctx, scale) {
        for (const stair of this.stairs) {
            stair.render(ctx, scale, stair.id === this.selectedStairId);
        }
    }
}
