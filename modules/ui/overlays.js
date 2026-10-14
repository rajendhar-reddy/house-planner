/**
 * overlays.js - Live drafting previews and wall-hover HUD drawn on top of the plan.
 *
 * These methods are mixed into HousePlannerApp (see app.js), so `this` is the app.
 */

import { units } from '../units.js';
import { Wall } from '../walls.js';
import { Stair } from '../stairs.js';
import { COLUMN_PRESETS } from '../columns.js';
import { boundsOf, selectionBounds } from '../transform.js';

export class OverlayMethods {
    /** Dashed outlines on every object of a multi-selection, and the live selection window while dragging. */
    renderSelectionOverlays(ctx, scale) {
        if (this.selection && this.selection.length > 1) {
            ctx.save();
            ctx.lineWidth = 1.5 / scale;
            ctx.strokeStyle = '#38bdf8';
            ctx.fillStyle = 'rgba(56, 189, 248, 0.10)';
            ctx.setLineDash([5 / scale, 3 / scale]);
            const pad = 3 / scale;
            for (const item of this.selection) {
                const b = boundsOf(this, item);
                if (!b) continue;
                ctx.fillRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
                ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
            }
            const all = selectionBounds(this, this.selection);
            if (all) {
                ctx.setLineDash([]);
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
                const g = 8 / scale;
                ctx.strokeRect(all.x - g, all.y - g, all.width + g * 2, all.height + g * 2);
            }
            ctx.restore();
        }
        const pend = this.commandLine && this.commandLine.pending;
        if (pend && pend.base && this.draftCurrent) {
            ctx.save();
            ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.3 / scale; ctx.setLineDash([6 / scale, 4 / scale]);
            ctx.beginPath(); ctx.moveTo(pend.base.x, pend.base.y); ctx.lineTo(this.draftCurrent.x, this.draftCurrent.y); ctx.stroke();
            ctx.setLineDash([]); ctx.fillStyle = '#facc15';
            ctx.beginPath(); ctx.arc(pend.base.x, pend.base.y, 3 / scale, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
        if (pend && pend.trail && pend.trail.length) {
            ctx.save();
            ctx.strokeStyle = '#facc15'; ctx.fillStyle = 'rgba(250, 204, 21, 0.10)'; ctx.lineWidth = 1.3 / scale;
            ctx.beginPath(); ctx.moveTo(pend.trail[0].x, pend.trail[0].y);
            for (let i = 1; i < pend.trail.length; i++) ctx.lineTo(pend.trail[i].x, pend.trail[i].y);
            if (this.draftCurrent) ctx.lineTo(this.draftCurrent.x, this.draftCurrent.y);
            if (pend.closeTrail && pend.trail.length >= 2) { ctx.closePath(); ctx.fill(); }
            ctx.stroke();
            ctx.fillStyle = '#facc15';
            for (const p of pend.trail) { ctx.beginPath(); ctx.arc(p.x, p.y, 3 / scale, 0, Math.PI * 2); ctx.fill(); }
            ctx.restore();
        }
        if (this.marquee) {
            const m = this.marquee;
            const crossing = m.x2 < m.x1;
            ctx.save();
            ctx.lineWidth = 1.2 / scale;
            ctx.strokeStyle = crossing ? '#4ade80' : '#38bdf8';
            ctx.fillStyle = crossing ? 'rgba(74, 222, 128, 0.12)' : 'rgba(56, 189, 248, 0.12)';
            ctx.setLineDash(crossing ? [6 / scale, 4 / scale] : []);
            const x = Math.min(m.x1, m.x2), y = Math.min(m.y1, m.y2);
            ctx.fillRect(x, y, Math.abs(m.x2 - m.x1), Math.abs(m.y2 - m.y1));
            ctx.strokeRect(x, y, Math.abs(m.x2 - m.x1), Math.abs(m.y2 - m.y1));
            ctx.restore();
        }
    }

    renderDraftingPreviews(ctx, scale) {
        // Furniture resize live HUD badge (always show during dragging)
        if (this.isDragging && this.dragTarget && this.dragTarget.type === 'furniture_resize') {
            const item = this.dragTarget.item;
            ctx.save();
            ctx.translate(item.x, item.y);
            ctx.rotate((item.rotation * Math.PI) / 180);

            const badgeText = `${units.formatLength(item.width)} × ${units.formatLength(item.height)}`;
            const fontSize = Math.max(12 / scale, 4);
            ctx.font = `bold ${fontSize}px sans-serif`;
            const tw = ctx.measureText(badgeText).width;
            const padX = 8 / scale;
            const padY = 5 / scale;
            const badgeW = tw + padX * 2;
            const badgeH = fontSize + padY * 2;
            const isTopHandle = ['t', 'tl', 'tr'].includes(this.dragTarget.handleId);
            const badgeY = isTopHandle ? (-item.height / 2 - badgeH - 12 / scale) : (item.height / 2 + 12 / scale);

            ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.2 / scale;
            ctx.beginPath();
            ctx.roundRect(-badgeW / 2, badgeY, badgeW, badgeH, 4 / scale);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(badgeText, 0, badgeY + badgeH / 2);
            ctx.restore();
        }

        // Furniture rotate live HUD badge
        if (this.isDragging && this.dragTarget && this.dragTarget.type === 'furniture_rotate') {
            const item = this.dragTarget.item;
            ctx.save();
            ctx.translate(item.x, item.y);
            const badgeText = `${Math.round(item.rotation)}°`;
            const fontSize = Math.max(12 / scale, 4);
            ctx.font = `bold ${fontSize}px sans-serif`;
            const tw = ctx.measureText(badgeText).width;
            const padX = 8 / scale;
            const padY = 5 / scale;
            const badgeW = tw + padX * 2;
            const badgeH = fontSize + padY * 2;
            const badgeY = -item.height / 2 - 28 / scale;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.2 / scale;
            ctx.beginPath();
            ctx.roundRect(-badgeW / 2, badgeY, badgeW, badgeH, 4 / scale);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#38bdf8';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(badgeText, 0, badgeY + badgeH / 2);
            ctx.restore();
        }

        // Roof Slab Overhang live HUD badge while dragging handles
        if (this.isDragging && this.dragTarget && this.dragTarget.type === 'slab_handle' && this.slabManager) {
            const h = this.dragTarget.handle;
            const off = this.slabManager.getEffectiveOffsets();
            let label = '';
            if (this.slabManager.isUniform) {
                label = `⤢ Slab Overhang: ${units.formatLength(this.slabManager.uniformOffset)}`;
            } else if (h.id === 'front') {
                label = `⬍ Front Overhang: ${units.formatLength(off.front)}`;
            } else if (h.id === 'rear') {
                label = `⬍ Rear Overhang: ${units.formatLength(off.rear)}`;
            } else if (h.id === 'left') {
                label = `⬌ Left Overhang: ${units.formatLength(off.left)}`;
            } else if (h.id === 'right') {
                label = `⬌ Right Overhang: ${units.formatLength(off.right)}`;
            } else {
                label = `⤢ Slab Overhang: ${units.formatLength(this.slabManager.uniformOffset)}`;
            }

            ctx.save();
            const fontSize = Math.max(12 / scale, 4);
            ctx.font = `bold ${fontSize}px sans-serif`;
            const tw = ctx.measureText(label).width;
            const padX = 8 / scale;
            const padY = 5 / scale;
            const badgeW = tw + padX * 2;
            const badgeH = fontSize + padY * 2;
            const badgeX = this.draftCurrent ? this.draftCurrent.x : h.x;
            const badgeY = (this.draftCurrent ? this.draftCurrent.y : h.y) - badgeH - 12 / scale;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.2 / scale;
            ctx.beginPath();
            ctx.roundRect(badgeX - badgeW / 2, badgeY, badgeW, badgeH, 4 / scale);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#38bdf8';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, badgeX, badgeY + badgeH / 2);
            ctx.restore();
        }

        if (!this.draftCurrent) return;

        // Wall / Compound Wall drafting ghost line & live measurement
        if ((this.activeTool === 'wall' || this.activeTool === 'compound_wall') && this.draftStart) {
            const isCompound = this.activeTool === 'compound_wall';
            const thick = isCompound ? (this.compoundWallThickness || 6) : this.wallManager.currentThickness;

            ctx.save();
            ctx.strokeStyle = isCompound ? '#94a3b8' : '#38bdf8';
            ctx.lineWidth = thick * scale > 2 ? thick : 2 / scale;
            ctx.setLineDash([4 / scale, 4 / scale]);
            ctx.beginPath();
            ctx.moveTo(this.draftStart.x, this.draftStart.y);
            ctx.lineTo(this.draftCurrent.x, this.draftCurrent.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Live dimension badge
            const dx = this.draftCurrent.x - this.draftStart.x;
            const dy = this.draftCurrent.y - this.draftStart.y;
            const len = Math.hypot(dx, dy);
            const midX = (this.draftStart.x + this.draftCurrent.x) / 2;
            const midY = (this.draftStart.y + this.draftCurrent.y) / 2;

            const label = units.formatLength(len);
            ctx.font = `bold ${Math.max(12 / scale, 3.5)}px sans-serif`;
            const tw = ctx.measureText(label).width;

            ctx.fillStyle = isCompound ? '#334155' : '#0284c7';
            ctx.fillRect(midX - tw / 2 - 4 / scale, midY - 14 / scale, tw + 8 / scale, 18 / scale);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, midX, midY - 5 / scale);
            ctx.restore();
        }

        // Plot Rect preview
        if (this.activeTool === 'plot_rect' && this.draftStart) {
            ctx.save();
            ctx.strokeStyle = '#eab308';
            ctx.lineWidth = 2 / scale;
            ctx.setLineDash([6 / scale, 6 / scale]);
            const w = this.draftCurrent.x - this.draftStart.x;
            const h = this.draftCurrent.y - this.draftStart.y;
            ctx.strokeRect(this.draftStart.x, this.draftStart.y, w, h);
            ctx.setLineDash([]);
            ctx.restore();
        }

        // Door / Window / Gate ghost preview when hovering near wall
        if (this.activeTool === 'door' || this.activeTool === 'window' || this.activeTool === 'gate') {
            const wall = this.wallManager.getWallAt(this.draftCurrent.x, this.draftCurrent.y, scale);
            if (wall) {
                const proj = wall.projectPoint(this.draftCurrent);
                ctx.save();
                ctx.translate(proj.point.x, proj.point.y);
                ctx.rotate(wall.getAngle());
                ctx.strokeStyle = this.activeTool === 'gate' ? '#ef4444' : '#22c55e'; // red for gate, green for door/window
                ctx.lineWidth = 2 / scale;
                const previewW = this.activeTool === 'gate' ? (this.activeGateWidth || 120) : (this.activeTool === 'door' ? this.activeDoorWidth : this.activeWindowWidth);
                ctx.strokeRect(-previewW / 2, -wall.thickness / 2, previewW, wall.thickness);
                ctx.restore();
            }
        }

        // Column ghost placement preview with smart snap indicator
        if (this.activeTool === 'column') {
            const snap = this.columnManager.getSnapPoint(this.draftCurrent.x, this.draftCurrent.y, this.wallManager, 16);
            const preset = COLUMN_PRESETS[this.activeColumnPresetIndex] || COLUMN_PRESETS[1];
            ctx.save();
            ctx.translate(snap.x, snap.y);
            if (this.activeColumnRotation) {
                ctx.rotate((this.activeColumnRotation * Math.PI) / 180);
            }
            const hw = preset.width / 2;
            const hd = preset.depth / 2;

            // Ghost column
            ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
            ctx.fillRect(-hw, -hd, preset.width, preset.depth);
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.5 / scale;
            ctx.strokeRect(-hw, -hd, preset.width, preset.depth);

            // Rebar tie cross
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1 / scale;
            ctx.beginPath();
            ctx.moveTo(-hw, -hd); ctx.lineTo(hw, hd);
            ctx.moveTo(hw, -hd); ctx.lineTo(-hw, hd);
            ctx.stroke();

            // Snap indicator ring if snapped to corner/wall
            if (snap.snapped) {
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 2 / scale;
                ctx.setLineDash([3 / scale, 2 / scale]);
                ctx.beginPath();
                ctx.arc(0, 0, Math.max(preset.width, preset.depth) * 0.75, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.restore();
        }

        // Break Wall tool preview
        if (this.activeTool === 'break_wall') {
            const wall = this.wallManager.getWallAt(this.draftCurrent.x, this.draftCurrent.y, scale, 12 / scale);
            if (wall) {
                const proj = wall.projectPoint(this.draftCurrent);
                const angle = wall.getAngle();
                const halfT = wall.thickness / 2;
                const nx = -Math.sin(angle);
                const ny = Math.cos(angle);

                ctx.save();
                // Scissor / cut line across wall
                ctx.strokeStyle = '#ef4444'; // red cut line
                ctx.lineWidth = 2.5 / scale;
                ctx.setLineDash([3 / scale, 3 / scale]);
                ctx.beginPath();
                ctx.moveTo(proj.point.x - nx * (halfT + 6 / scale), proj.point.y - ny * (halfT + 6 / scale));
                ctx.lineTo(proj.point.x + nx * (halfT + 6 / scale), proj.point.y + ny * (halfT + 6 / scale));
                ctx.stroke();
                ctx.setLineDash([]);

                // Scissor cut marker
                ctx.beginPath();
                ctx.arc(proj.point.x, proj.point.y, 4 / scale, 0, Math.PI * 2);
                ctx.fillStyle = '#ef4444';
                ctx.fill();

                // Pill label: Split Here
                const dStart = Math.hypot(proj.point.x - wall.start.x, proj.point.y - wall.start.y);
                const dEnd = Math.hypot(wall.end.x - proj.point.x, wall.end.y - proj.point.y);
                const label = `✂ Break: [ ${units.formatLength(dStart)} | ${units.formatLength(dEnd)} ]`;
                const fontSize = Math.max(11 / scale, 3.5);
                ctx.font = `bold ${fontSize}px sans-serif`;
                const tw = ctx.measureText(label).width;

                ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
                ctx.fillRect(proj.point.x - tw / 2 - 4 / scale, proj.point.y - (halfT + 18 / scale), tw + 8 / scale, 18 / scale);
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, proj.point.x, proj.point.y - (halfT + 9 / scale));
                ctx.restore();
            }
        }

        // Stairs placement ghost preview
        if (this.activeTool === 'stairs' && this.draftCurrent) {
            ctx.save();
            ctx.globalAlpha = 0.65;
            const ghostStair = new Stair({
                x: this.draftCurrent.x,
                y: this.draftCurrent.y,
                type: this.activeStairType,
                flightWidth: this.activeStairFlightWidth,
                treads: this.activeStairTreads,
                landingSteps: this.activeStairLandingSteps !== undefined ? this.activeStairLandingSteps : (this.activeStairType === 'dogleg' ? 3 : 0)
            });
            ghostStair.render(ctx, scale, false);
            ctx.restore();
        }
    }

    /**
     * Render floating HUD card next to cursor showing distances to wall ends
     */
    renderHoverHUD(ctx, hoverInfo, scale) {
        if (!hoverInfo || !this.draftCurrent) return;
        const { dStart, dEnd, total, isNearCenter } = hoverInfo;

        const screenPos = this.canvasEngine.worldToScreen(this.draftCurrent.x, this.draftCurrent.y);
        const hudX = screenPos.x + 16;
        const hudY = screenPos.y + 16;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); // screen space for razor-sharp rendering
        const dpr = this.canvasEngine.dpr || 1;
        ctx.scale(dpr, dpr);

        const boxW = 195;
        const boxH = isNearCenter ? 80 : 66;

        // Keep HUD inside canvas view bounds
        const canvasW = this.canvasElement.width / dpr;
        const canvasH = this.canvasElement.height / dpr;
        const renderX = hudX + boxW > canvasW - 10 ? screenPos.x - boxW - 16 : hudX;
        const renderY = hudY + boxH > canvasH - 10 ? screenPos.y - boxH - 16 : hudY;

        // Background card with shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
        ctx.beginPath();
        ctx.roundRect(renderX, renderY, boxW, boxH, 6);
        ctx.fill();

        ctx.shadowColor = 'transparent'; // reset shadow
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Header
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('📏 WALL DISTANCES', renderX + 10, renderY + 8);

        // Distance items
        ctx.font = '600 12px "SF Mono", Consolas, monospace, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(`⇦ To Start: ${units.formatLength(dStart)}`, renderX + 10, renderY + 26);
        ctx.fillText(`⇨ To End:   ${units.formatLength(dEnd)}`, renderX + 10, renderY + 44);

        if (isNearCenter) {
            ctx.font = 'bold 10.5px sans-serif';
            ctx.fillStyle = '#10b981'; // emerald green
            ctx.fillText(`★ CENTER / MIDPOINT`, renderX + 10, renderY + 62);
        }

        ctx.restore();
    }

}
