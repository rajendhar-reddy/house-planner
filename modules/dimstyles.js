/**
 * dimstyles.js - dimension style presets and the drawing of dimension line ends.
 * A dimension (linear or angular) carries an optional `dimStyle` id; no id means "standard".
 */

export const DIM_STYLES = {
    standard: { name: 'Standard', textScale: 1, tick: 'arch' },
    large: { name: 'Large text', textScale: 1.6, tick: 'arch' },
    small: { name: 'Small text', textScale: 0.75, tick: 'arch' },
    arrows: { name: 'Arrowheads', textScale: 1, tick: 'arrow' },
    dots: { name: 'Dots', textScale: 1, tick: 'dot' }
};
export const DIM_STYLE_IDS = Object.keys(DIM_STYLES);

/** The style record for a dimension (unknown ids fall back to Standard). */
export function dimStyleOf(dim) {
    return DIM_STYLES[dim && dim.dimStyle] || DIM_STYLES.standard;
}

/** Match a word the user typed ("large", "Arrowheads", "dots") to a style id, or null. */
export function findDimStyle(word) {
    const w = String(word || '').trim().toLowerCase();
    if (!w) return null;
    return DIM_STYLE_IDS.find(id => id === w || DIM_STYLES[id].name.toLowerCase() === w || DIM_STYLES[id].name.toLowerCase().startsWith(w)) || null;
}

/**
 * Draw the end mark of a dimension line at (x, y) for a line running in direction `angle` (radians).
 * kind: 'arch' (45-degree tick), 'arrow' (filled arrowhead pointing outwards along `angle`), 'dot'.
 * `archTick` is the app's existing tick drawer so Standard looks exactly as before.
 */
export function drawDimEnd(ctx, kind, x, y, angle, size, color, scale, isExport, archTick, outward = 1) {
    if (kind === 'arrow') {
        const len = size * 1.7, half = size * 0.5, d = outward >= 0 ? 1 : -1;
        const ux = Math.cos(angle) * d, uy = Math.sin(angle) * d;
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - ux * len - uy * half, y - uy * len + ux * half);
        ctx.lineTo(x - ux * len + uy * half, y - uy * len - ux * half);
        ctx.closePath(); ctx.fill();
        ctx.restore();
    } else if (kind === 'dot') {
        ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, size * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    } else {
        archTick(ctx, x, y, angle, size, color, scale, isExport);
    }
}
