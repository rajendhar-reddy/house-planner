/**
 * sheet.js - print-to-scale layout maths (pure).
 *
 * A sheet is a piece of paper with a margin, a drawing area and a title strip. The drawing is placed at an exact
 * scale 1:S, so that 1 inch (or 1 metre...) measured on the paper is S inches (metres) in the drawing.
 *   paper millimetres = drawing inches * 25.4 / S
 */

export const PAPERS = {
    a4: { name: 'A4', w: 210, h: 297 }, a3: { name: 'A3', w: 297, h: 420 }, a2: { name: 'A2', w: 420, h: 594 }, a1: { name: 'A1', w: 594, h: 841 },
    letter: { name: 'Letter (8.5 x 11 in)', w: 215.9, h: 279.4 }, tabloid: { name: 'Tabloid (11 x 17 in)', w: 279.4, h: 431.8 }, archd: { name: 'Arch D (24 x 36 in)', w: 609.6, h: 914.4 }
};
export const PAPER_IDS = Object.keys(PAPERS);

/** 1:S scales offered in the dialog (includes the imperial 1/4"=1' = 1:48 and 1/8"=1' = 1:96). */
export const STANDARD_SCALES = [10, 20, 24, 25, 40, 48, 50, 75, 96, 100, 125, 150, 200, 250, 300, 400, 500, 1000];

export const SHEET_MARGIN_MM = 10;
export const TITLE_STRIP_MM = 28;
export const MM_PER_INCH = 25.4;

/** Page size in millimetres for a paper and orientation. */
export function paperMm(paper, orientation = 'landscape') {
    const p = PAPERS[paper];
    if (!p) throw new Error(`Unknown paper size "${paper}".`);
    const long = Math.max(p.w, p.h), short = Math.min(p.w, p.h);
    return orientation === 'portrait' ? { w: short, h: long } : { w: long, h: short };
}

/** "1:100", or with the imperial equivalent for the common architectural scales. */
export function scaleLabel(scale, withImperial = true) {
    const base = `1:${scale}`;
    if (!withImperial) return base;
    const imp = { 12: '1" = 1\'-0"', 24: '1/2" = 1\'-0"', 48: '1/4" = 1\'-0"', 96: '1/8" = 1\'-0"', 192: '1/16" = 1\'-0"' }[scale];
    return imp ? `${base}  (${imp})` : base;
}

/**
 * @param o { paper, orientation, scale (the S of 1:S), region {x,y,width,height} in drawing inches, marginMm?, titleMm? }
 * @returns {{ page, area, drawMm:{w,h}, fits, placement:{x,y,w,h}, suggestedScale, requiredScale }}  all lengths in mm
 */
export function computeSheetLayout(o) {
    const marginMm = o.marginMm ?? SHEET_MARGIN_MM, titleMm = o.titleMm ?? TITLE_STRIP_MM;
    if (!(o.scale > 0)) throw new Error('The scale must be more than zero.');
    if (!o.region || !(o.region.width > 0) || !(o.region.height > 0)) throw new Error('There is nothing to print: the drawing area has no size.');
    const page = paperMm(o.paper, o.orientation);
    const area = { x: marginMm, y: marginMm, w: page.w - 2 * marginMm, h: page.h - 2 * marginMm - titleMm };
    if (area.w <= 0 || area.h <= 0) throw new Error('This paper is too small for the margins and title strip.');
    const drawMm = { w: o.region.width * MM_PER_INCH / o.scale, h: o.region.height * MM_PER_INCH / o.scale };
    const fits = drawMm.w <= area.w + 1e-9 && drawMm.h <= area.h + 1e-9;
    const required = Math.max(o.region.width * MM_PER_INCH / area.w, o.region.height * MM_PER_INCH / area.h);       // smallest S that fits
    return {
        page, area, drawMm, fits, requiredScale: required,
        suggestedScale: STANDARD_SCALES.find(s => s >= required - 1e-9) || null,
        placement: { x: area.x + (area.w - drawMm.w) / 2, y: area.y + (area.h - drawMm.h) / 2, w: drawMm.w, h: drawMm.h }     // centred in the drawing area
    };
}

export const pxPerInch = (dpi, scale) => dpi / scale;                                // canvas pixels per drawing inch
export const mmToPx = (mm, dpi) => mm / MM_PER_INCH * dpi;
export const mmToPt = (mm) => mm * 72 / MM_PER_INCH;
export const pageSizePx = (page, dpi) => ({ w: Math.round(mmToPx(page.w, dpi)), h: Math.round(mmToPx(page.h, dpi)) });

/**
 * A scale bar of a "nice" length: the longest one that is at most `maxMm` long on the paper.
 * @returns {{ worldInches, paperMm, label, ticks:[{x, label}] }}  x in mm from the bar's left end
 */
export function scaleBarSpec(scale, metric, maxMm = 80) {
    const unitInches = metric ? 39.37007874015748 : 12;
    const nice = metric ? [0.5, 1, 2, 5, 10, 20, 50, 100] : [1, 2, 5, 10, 20, 50, 100, 200];
    const mmOf = (n) => n * unitInches * MM_PER_INCH / scale;
    const fitting = nice.filter(n => mmOf(n) <= maxMm && mmOf(n) >= 15);
    const pick = fitting.length ? fitting[fitting.length - 1] : nice.reduce((best, n) => Math.abs(mmOf(n) - maxMm / 2) < Math.abs(mmOf(best) - maxMm / 2) ? n : best, nice[0]);
    const unit = metric ? 'm' : 'ft';
    const parts = 4;
    return {
        worldInches: pick * unitInches, paperMm: mmOf(pick), label: `${pick} ${unit}`,
        ticks: Array.from({ length: parts + 1 }, (_, i) => ({ x: mmOf(pick) * i / parts, label: i === 0 ? '0' : (Math.round(pick * i / parts * 100) / 100).toString() }))
    };
}
