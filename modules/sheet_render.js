/**
 * sheet_render.js - draw a print-to-scale sheet on a canvas (frame, drawing at exactly 1:S, title strip, scale bar).
 * Needs a canvas; the layout rules are in modules/sheet.js.
 */

import { Exporter } from './exporter.js';
import { units, UnitSystem } from './units.js';
import { computeSheetLayout, mmToPx, pageSizePx, scaleBarSpec, scaleLabel, PAPERS, SHEET_MARGIN_MM, TITLE_STRIP_MM } from './sheet.js';

/** The part of the drawing to print: 'drawing' = everything (plus a little air), 'view' = what is on screen now. */
export function sheetRegion(app, which = 'drawing') {
    if (which === 'view') {
        const cv = app.canvasElement.getBoundingClientRect();
        const a = app.canvasEngine.screenToWorld(0, 0), b = app.canvasEngine.screenToWorld(cv.width, cv.height);
        return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
    }
    const sbs = app.floorManager && app.floorManager.viewMode === 'side_by_side';
    const bounds = sbs ? app.floorManager.getSideBySideTotalBounds() : Exporter.getProjectBounds(app);
    if (!bounds) return null;
    const pad = 24;
    return { x: bounds.x - pad, y: bounds.y - pad, width: bounds.width + pad * 2, height: bounds.height + pad * 2 };
}

/**
 * Render the sheet. opts: { paper, orientation, scale, region, dpi, style ('clean' | 'blueprint') }
 * Returns the layout. Throws a readable Error when the drawing does not fit at that scale.
 */
export function renderSheet(canvas, app, opts) {
    const dpi = opts.dpi || 150, style = opts.style || 'clean';
    const layout = computeSheetLayout({ paper: opts.paper, orientation: opts.orientation, scale: opts.scale, region: opts.region });
    if (!layout.fits) throw new Error(`The drawing does not fit on ${PAPERS[opts.paper].name} at 1:${opts.scale}. ${layout.suggestedScale ? `Try 1:${layout.suggestedScale}.` : 'Use a larger sheet.'}`);

    const size = pageSizePx(layout.page, dpi);
    canvas.width = size.w; canvas.height = size.h;
    const ctx = canvas.getContext('2d');
    const clean = style !== 'blueprint';
    const ink = clean ? '#0f172a' : '#e2e8f0', faint = clean ? '#64748b' : '#94a3b8';
    const mm = (v) => mmToPx(v, dpi);

    ctx.fillStyle = clean ? '#ffffff' : '#0f172a';
    ctx.fillRect(0, 0, size.w, size.h);

    // drawing, at exactly dpi/scale pixels per drawing inch
    const k = dpi / opts.scale, pl = layout.placement;
    ctx.save();
    ctx.beginPath(); ctx.rect(mm(pl.x), mm(pl.y), mm(pl.w), mm(pl.h)); ctx.clip();
    ctx.translate(mm(pl.x), mm(pl.y));
    ctx.scale(k, k);
    ctx.translate(-opts.region.x, -opts.region.y);
    // Text and line weights are specified in pixels at a 200 dpi basis (about 2.8 mm for a dimension figure). Passing that
    // basis here keeps them the same physical size on the paper whatever resolution this render uses (preview or print).
    Exporter.drawPlan(ctx, app, 200 / opts.scale, style);
    ctx.restore();

    // frame
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, mm(0.6));
    ctx.strokeRect(mm(SHEET_MARGIN_MM), mm(SHEET_MARGIN_MM), mm(layout.page.w - 2 * SHEET_MARGIN_MM), mm(layout.page.h - 2 * SHEET_MARGIN_MM));

    // title strip
    const info = (app.projectInfo && app.projectInfo.serialize) ? app.projectInfo.serialize() : {};
    const top = layout.area.y + layout.area.h, left = SHEET_MARGIN_MM, w = layout.page.w - 2 * SHEET_MARGIN_MM, h = TITLE_STRIP_MM;
    ctx.lineWidth = Math.max(1, mm(0.35));
    ctx.beginPath(); ctx.moveTo(mm(left), mm(top)); ctx.lineTo(mm(left + w), mm(top)); ctx.stroke();
    const c1 = left + w * 0.42, c2 = left + w * 0.72;
    ctx.beginPath(); ctx.moveTo(mm(c1), mm(top)); ctx.lineTo(mm(c1), mm(top + h)); ctx.moveTo(mm(c2), mm(top)); ctx.lineTo(mm(c2), mm(top + h)); ctx.stroke();
    const text = (str, x, y, size, opts2 = {}) => {
        ctx.font = `${opts2.bold ? '700 ' : ''}${mm(size)}px sans-serif`; ctx.fillStyle = opts2.color || ink; ctx.textAlign = opts2.align || 'left'; ctx.textBaseline = 'alphabetic';
        let s = String(str || ''); const maxW = mm(opts2.maxW || 1e6);
        while (s.length > 1 && ctx.measureText(s).width > maxW) s = s.slice(0, -2) + '\u2026';
        ctx.fillText(s, mm(x), mm(y));
    };
    const colW = c1 - left - 6;
    text(info.projectTitle || 'HOUSE PLAN', left + 3, top + 8, 5, { bold: true, maxW: colW });
    text(info.drawingTitle || '', left + 3, top + 14.5, 3.2, { maxW: colW, color: faint });
    text([info.clientName, info.siteDetails].filter(Boolean).join('  \u00b7  '), left + 3, top + 20.5, 2.8, { maxW: colW, color: faint });
    text([info.architectFirm, info.engineerRegNo].filter(Boolean).join('  \u00b7  '), left + 3, top + 25.5, 2.6, { maxW: colW, color: faint });

    // scale bar (metric or imperial, whichever the drawing is shown in)
    const metric = units.getSystem() === UnitSystem.METRIC;
    const bar = scaleBarSpec(opts.scale, metric, Math.min(80, (c2 - c1) - 14));
    const bx = c1 + 6, by = top + 15;
    ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, mm(0.3));
    ctx.strokeRect(mm(bx), mm(by), mm(bar.paperMm), mm(2));
    for (let i = 0; i < bar.ticks.length - 1; i++) if (i % 2 === 0) ctx.fillRect(mm(bx + bar.ticks[i].x), mm(by), mm(bar.ticks[i + 1].x - bar.ticks[i].x), mm(2));
    for (const t of bar.ticks) text(t.label, bx + t.x, by + 6, 2.6, { align: 'center' });
    text(`${bar.label}`, bx + bar.paperMm + 2, by + 1.8, 2.6, { color: faint });
    text('SCALE BAR', bx, top + 8, 2.6, { color: faint });

    // sheet facts
    const orient = layout.page.w >= layout.page.h ? 'LANDSCAPE' : 'PORTRAIT';
    text(`SCALE  1:${opts.scale}`, c2 + 4, top + 9, 5, { bold: true, maxW: left + w - c2 - 8 });
    text(`${PAPERS[opts.paper].name.split(' ')[0]} ${orient}`, c2 + 4, top + 15, 3, { maxW: left + w - c2 - 8, color: faint });
    text([info.drawingNumber, info.date].filter(Boolean).join('  \u00b7  '), c2 + 4, top + 21, 2.8, { maxW: left + w - c2 - 8, color: faint });
    text('Print at 100% (no "fit to page") to keep the scale.', c2 + 4, top + 26, 2.2, { maxW: left + w - c2 - 8, color: faint });
    return layout;
}

export { scaleLabel };
