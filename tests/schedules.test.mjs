// Schedule tests (no browser). Run:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedules, schedulesToCSV, csvCell, floorsOf } from '../modules/schedules.js';
import { units, UnitSystem } from '../modules/units.js';

units.setSystem(UnitSystem.IMPERIAL);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);
const door = (width, subtype = 'single') => ({ type: 'door', subtype, width });
const win = (width, subtype = 'standard') => ({ type: 'window', subtype, width });

const state = () => ({
    floorManager: { floors: [
        { id: 'ground', name: 'Ground Floor Plan', openings: [door(36), door(36), door(30), win(48), win(48), win(60, 'sliding'), { type: 'gate', subtype: 'sliding', width: 120 }],
          rooms: [{ name: 'Living', width: 144, height: 180 }, { name: 'Kitchen', width: 108, height: 120 }, { name: 'Open', width: 100, height: 100, isVoid: true }] },
        { id: 'first', name: 'First Floor Plan', openings: [door(36), win(48)], rooms: [{ name: 'Bedroom', width: 144, height: 144 }] },
        { id: 'terrace', name: 'Terrace Plan', openings: [], rooms: [] }
    ] }
});

test('openings: grouped by kind, type and size, numbered D/W/G, counted per floor', () => {
    const s = buildSchedules(state());
    assert.deepEqual(s.openings.map(o => [o.mark, o.width, o.qty]), [['D1', 30, 1], ['D2', 36, 3], ['W1', 48, 3], ['W2', 60, 1], ['G1', 120, 1]]);
    assert.deepEqual(s.openings[1].byFloor, { Ground: 2, First: 1 });
    assert.equal(s.openings[1].description, 'Single-swing door'); assert.equal(s.openings[3].description, 'Sliding window'); assert.equal(s.openings[4].description, 'Sliding gate');
    assert.deepEqual([s.totals.doors, s.totals.windows, s.totals.gates], [4, 4, 1]);
    assert.equal(s.openings[1].widthText, "3'");
    assert.deepEqual(s.floors, ['Ground', 'First', 'Terrace']);
});

test('rooms: sizes, areas and totals; voids are listed but not counted', () => {
    const s = buildSchedules(state());
    assert.equal(s.rooms.length, 4);
    const living = s.rooms.find(r => r.name === 'Living');
    near(living.areaSqFt, 144 * 180 / 144); near(living.areaSqM, 144 * 180 * 0.00064516);
    assert.equal(living.sizeText, "12' x 15'"); assert.equal(living.areaText, '180.0 Sq. Ft.');
    assert.equal(s.rooms.find(r => r.name === 'Open').isVoid, true);
    assert.equal(s.totals.rooms, 3); near(s.totals.areaSqFt, 180 + 90 + 144);
    near(s.totals.areaByFloorSqFt.Ground, 270); near(s.totals.areaByFloorSqFt.First, 144);
});

test('rooms: polygon rooms use their outline; missing sizes fall back to the 12 ft default', () => {
    const s = buildSchedules({ rooms: [{ name: 'Tri', polygon: [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 0, y: 120 }] }, { name: 'Bare' }], openings: [] });
    near(s.rooms[0].areaSqFt, 7200 / 144); near(s.rooms[1].areaSqFt, 144);
});

test('single-floor files (no floor data) and empty projects work', () => {
    const s = buildSchedules({ openings: [door(36)], rooms: [{ name: 'A', width: 120, height: 120 }] });
    assert.equal(s.openings.length, 1); assert.deepEqual(s.floors, ['Ground']);
    assert.equal(floorsOf({ floorManager: { floors: [{ id: 'ground', walls: [], openings: [], rooms: [] }] }, rooms: [{ name: 'X' }] })[0].rooms.length, 1);   // empty floor snapshots fall back to the live lists
    const e = buildSchedules({}); assert.deepEqual([e.openings.length, e.rooms.length, e.totals.rooms], [0, 0, 0]);
    const n = buildSchedules(null); assert.equal(n.openings.length, 0);
});

test('metric project text', () => {
    units.setSystem(UnitSystem.METRIC);
    const s = buildSchedules({ openings: [door(36)], rooms: [{ name: 'A', width: 120, height: 120 }] });
    assert.match(s.openings[0].widthText, /m$/); assert.match(s.rooms[0].areaText, /m²/);
    units.setSystem(UnitSystem.IMPERIAL);
});

test('CSV: quoting, BOM, and spreadsheet-formula protection', () => {
    assert.equal(csvCell('plain'), 'plain'); assert.equal(csvCell('a,b'), '"a,b"'); assert.equal(csvCell('say "hi"'), '"say ""hi"""'); assert.equal(csvCell('two\nlines'), '"two\nlines"');
    assert.equal(csvCell('=cmd|"/c calc"!A1'), `"'=cmd|""/c calc""!A1"`);                       // would be a formula in Excel: neutralised and quoted
    for (const evil of ['=1+1', '+SUM(A1)', '-2+3', '@SUM(1)']) assert.ok(csvCell(evil).startsWith("'"), evil);
    assert.equal(csvCell(-5), '-5'); assert.equal(csvCell('-5.5'), '-5.5'); assert.equal(csvCell(null), ''); assert.equal(csvCell(0), '0');
    const csv = schedulesToCSV(buildSchedules({ rooms: [{ name: '=HYPERLINK("http://x")', width: 120, height: 120 }, { name: 'Kitchen, main', width: 96, height: 96 }, { name: 'Pooja \u0915' }], openings: [door(36)] }));
    assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes('\r\n'));
    assert.ok(csv.includes(`"'=HYPERLINK(""http://x"")"`)); assert.ok(csv.includes('"Kitchen, main"')); assert.ok(csv.includes('Pooja \u0915'));
});

test('CSV: every row has the same number of columns within a section, and the totals match', () => {
    const csv = schedulesToCSV(buildSchedules(state())).replace('\uFEFF', '');
    const parse = (line) => { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
    const rows = csv.split('\r\n').filter(Boolean).map(parse);
    const header = rows.findIndex(r => r[0] === 'Mark');
    const width = rows[header].length;
    assert.equal(rows[header + 1].length, width); assert.equal(rows[header + 5].length, width);          // D1..G1
    assert.equal(rows[header + 1][0], 'D1'); assert.equal(rows[header + 2][4], '3');
    const total = rows.find(r => r[0] === 'Total');
    assert.equal(total[5], '414.0'); assert.match(total[7], /3 rooms/);
});

test('every subtype the app can create has a readable name in the schedule', () => {
    const s = buildSchedules({ openings: [door(36, 'single'), door(60, 'double'), door(72, 'sliding'), door(42, 'arch'), win(48, 'standard'), win(48, 'sliding'), win(48, 'fixed'),
        { type: 'gate', subtype: 'sliding', width: 120 }, { type: 'gate', subtype: 'swing', width: 120 }], rooms: [] });
    for (const o of s.openings) assert.ok(!/\(/.test(o.description) || /Arch opening/.test(o.description), `unfriendly name: ${o.description}`);
    assert.equal(s.openings.find(o => o.description.startsWith('Arch')).description, 'Arch opening (no door)');
});
