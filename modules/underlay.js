/**
 * underlay.js - a raster image (scanned plan, survey, sketch) drawn under the drawing for tracing,
 * with scale calibration. Pure functions; the UI is in modules/ui/underlay_panel.js.
 *
 * The underlay is { name, dataUrl, x, y, width, height, opacity, visible, locked } in world inches
 * (x, y = top-left corner). It is saved with the project but never exported to PNG / PDF / SVG / DXF.
 */

/** Largest data URL we accept (characters). Keeps autosave inside the browser's ~5 MB storage. */
export const UNDERLAY_MAX_CHARS = 3_500_000;
/** Images are shrunk to this many pixels on the long side when imported. */
export const UNDERLAY_MAX_PIXELS = 1800;

const DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Make an underlay record safe to use (from a project file or autosave). Returns null when it cannot be used. */
export function sanitizeUnderlay(u) {
    if (!u || typeof u !== 'object' || Array.isArray(u)) return null;
    if (typeof u.dataUrl !== 'string' || u.dataUrl.length > UNDERLAY_MAX_CHARS || !DATA_URL.test(u.dataUrl)) return null;
    if (!isNum(u.x) || !isNum(u.y) || !isNum(u.width) || !isNum(u.height) || u.width <= 0 || u.height <= 0 || u.width > 1e6 || u.height > 1e6) return null;
    return {
        name: typeof u.name === 'string' ? u.name.slice(0, 80) : 'Underlay',
        dataUrl: u.dataUrl,
        x: u.x, y: u.y, width: u.width, height: u.height,
        opacity: isNum(u.opacity) ? Math.min(1, Math.max(0.05, u.opacity)) : 0.5,
        visible: u.visible !== false,
        locked: !!u.locked
    };
}

/**
 * Initial size and position: `targetWidth` world inches wide (40 ft by default), centred on `center`.
 * The user then calibrates the real scale.
 */
export function defaultPlacement(naturalW, naturalH, center = { x: 0, y: 0 }, targetWidth = 480) {
    const width = targetWidth, height = targetWidth * (naturalH / naturalW);
    return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}

/**
 * Scale the underlay so that the distance between two clicked points p1 and p2 (world coordinates, both
 * on the image) becomes `realDistance` inches. The image scales about p1, so p1 stays where it is.
 */
export function calibrateUnderlay(u, p1, p2, realDistance) {
    const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (d < 1e-6) throw new Error('The two points are in the same place - click two different points on the image.');
    if (!isNum(realDistance) || realDistance <= 0) throw new Error('Type the real distance between the two points, for example 12\' or 3.5m.');
    const f = realDistance / d;
    if (f < 0.001 || f > 1000) throw new Error('That would change the size by more than 1000 times - check the distance you typed.');
    return { ...u, x: p1.x + (u.x - p1.x) * f, y: p1.y + (u.y - p1.y) * f, width: u.width * f, height: u.height * f };
}

/** Pixel size to import a picture at: the long side is limited to UNDERLAY_MAX_PIXELS, never enlarged. */
export function importSize(w, h, max = UNDERLAY_MAX_PIXELS) {
    const k = Math.min(1, max / Math.max(w, h));
    return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}
