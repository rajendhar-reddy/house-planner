// Underlay tests (no browser). Run:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeUnderlay, defaultPlacement, calibrateUnderlay, importSize, UNDERLAY_MAX_CHARS } from '../modules/underlay.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const good = () => ({ name: 'Survey', dataUrl: PNG, x: 10, y: 20, width: 400, height: 300, opacity: 0.4, visible: true, locked: false });

test('sanitize: a good record passes unchanged; values are clamped', () => {
    assert.deepEqual(sanitizeUnderlay(good()), good());
    assert.equal(sanitizeUnderlay({ ...good(), opacity: 7 }).opacity, 1);
    assert.equal(sanitizeUnderlay({ ...good(), opacity: -1 }).opacity, 0.05);
    assert.equal(sanitizeUnderlay({ ...good(), opacity: 'x' }).opacity, 0.5);
    assert.equal(sanitizeUnderlay({ ...good(), visible: undefined }).visible, true);
    assert.equal(sanitizeUnderlay({ ...good(), locked: 1 }).locked, true);
    assert.equal(sanitizeUnderlay({ ...good(), name: 'x'.repeat(500) }).name.length, 80);
    assert.equal(sanitizeUnderlay({ ...good(), name: 42 }).name, 'Underlay');
});

test('sanitize: anything that is not a plain base64 png/jpeg/webp image is refused', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { ...good(), dataUrl: 'http://evil.example/x.png' }, { ...good(), dataUrl: 'javascript:alert(1)' },
        { ...good(), dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }, { ...good(), dataUrl: 'data:text/html;base64,PGI+' },
        { ...good(), dataUrl: PNG + '"onerror="alert(1)' }, { ...good(), dataUrl: PNG.replace('base64,', 'base64, ') }, { ...good(), dataUrl: 'data:image/png;base64,' },
        { ...good(), dataUrl: 'data:image/png;base64,' + 'A'.repeat(UNDERLAY_MAX_CHARS) }, { ...good(), dataUrl: 12 }]) {
        assert.equal(sanitizeUnderlay(bad), null, JSON.stringify(bad)?.slice(0, 60));
    }
    for (const k of ['x', 'y', 'width', 'height']) for (const v of [NaN, Infinity, '5', null, undefined]) assert.equal(sanitizeUnderlay({ ...good(), [k]: v }), null, `${k}=${v}`);
    assert.equal(sanitizeUnderlay({ ...good(), width: 0 }), null); assert.equal(sanitizeUnderlay({ ...good(), height: -3 }), null); assert.equal(sanitizeUnderlay({ ...good(), width: 1e9 }), null);
});

test('placement: 40 ft wide by default, keeps the picture shape, centred', () => {
    const p = defaultPlacement(2000, 1000, { x: 100, y: 50 });
    assert.deepEqual(p, { x: 100 - 240, y: 50 - 120, width: 480, height: 240 });
    near(defaultPlacement(300, 400, { x: 0, y: 0 }, 120).height, 160);
});

test('calibrate: two clicked points become the real distance; the first point stays put', () => {
    const u = { ...good(), x: 0, y: 0, width: 400, height: 300 };
    const c = calibrateUnderlay(u, { x: 100, y: 100 }, { x: 200, y: 100 }, 120);          // 100 drawing inches really are 120 (10 ft)
    near(c.width, 480); near(c.height, 360);
    // where the two clicked image spots end up: p1 fixed, p2 exactly 120 away
    const mapX = (x) => c.x + ((x - u.x) / u.width) * c.width, mapY = (y) => c.y + ((y - u.y) / u.height) * c.height;
    near(mapX(100), 100); near(mapY(100), 100); near(Math.hypot(mapX(200) - mapX(100), mapY(100) - mapY(100)), 120);
    const diag = calibrateUnderlay(u, { x: 0, y: 0 }, { x: 30, y: 40 }, 100);              // 50 -> 100: doubles
    near(diag.width, 800);
    assert.equal(u.width, 400, 'input is not modified');
});

test('calibrate: bad input is explained, not applied', () => {
    const u = good();
    assert.throws(() => calibrateUnderlay(u, { x: 5, y: 5 }, { x: 5, y: 5 }, 100), /different/);
    for (const d of [0, -4, NaN, null, 'abc']) assert.throws(() => calibrateUnderlay(u, { x: 0, y: 0 }, { x: 10, y: 0 }, d), /real distance/);
    assert.throws(() => calibrateUnderlay(u, { x: 0, y: 0 }, { x: 1, y: 0 }, 1e6), /1000 times/);
});

test('calibrate twice in a row stays consistent (idempotent for the same measurement)', () => {
    let u = { ...good(), x: 0, y: 0 };
    u = calibrateUnderlay(u, { x: 10, y: 10 }, { x: 110, y: 10 }, 240);
    const w = u.width;
    const again = calibrateUnderlay(u, { x: 10, y: 10 }, { x: 250, y: 10 }, 240);        // those two spots are already 240 apart
    near(again.width, w); near(again.x, u.x);
});

test('import size: shrink big pictures, never enlarge small ones', () => {
    assert.deepEqual(importSize(3600, 1800), { width: 1800, height: 900 });
    assert.deepEqual(importSize(800, 600), { width: 800, height: 600 });
    assert.deepEqual(importSize(1000, 5000), { width: 360, height: 1800 });
    assert.deepEqual(importSize(1, 1), { width: 1, height: 1 });
});
