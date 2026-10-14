# Browser regression tests for HousePlanner CAD (Playwright + Chromium).
# Usage:  python run.py  (serves on :8080), then:  python tests/browser_tests.py http://localhost:8080
import sys, json
from playwright.sync_api import sync_playwright

BASE = sys.argv[1]
results = []
class R(dict):
    def __missing__(self, k): return None
def check(name, ok, detail=""):
    results.append((name, ok, detail))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width':1400,'height':900})
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    def ev(js, arg=None, pg=None):
        pg = pg or page
        try:
            r = pg.evaluate(js, arg) if arg is not None else pg.evaluate(js)
            return R(r) if isinstance(r, dict) else r
        except Exception as e:
            return R({'__error': str(e).split('\n')[0][:140]})

    # ---------- 1. loads, no errors
    page.goto(BASE + '/index.html?sample=30x40_2bhk')
    page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000)
    check('app loads with sample, no page errors', not errors, '; '.join(errors)[:200])

    # ---------- 2. ID collision after reload
    # a saved project whose walls are wall_5..wall_14 (10 walls): after loading, a naive counter is at 11
    seed = { 'plot': None, 'walls': [ {'id': f'wall_{i}', 'start': {'x': i*10, 'y': 0}, 'end': {'x': i*10+8, 'y': 0}, 'thickness': 9, 'type': 'interior'} for i in range(5, 15) ],
             'openings': [], 'rooms': [], 'columns': [], 'furniture': [], 'dimensions': [], 'roads': [], 'stairs': [] }
    page.goto('about:blank')                       # the first tab must stop autosaving before we plant a project in storage
    pg2 = ctx.new_page()
    pg2.add_init_script("if(!sessionStorage.getItem('seeded')){localStorage.setItem('houseplanner_autosave', %s);sessionStorage.setItem('seeded','1');}" % json.dumps(json.dumps(seed)))
    pg2.goto(BASE + '/index.html')
    pg2.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000)
    res = ev('''() => {
        const a = window.app;
        const loaded = a.wallManager.walls.map(w => w.id).join(',');
        for (let i = 0; i < 8; i++) a.wallManager.addWall({x:i*5, y:50}, {x:i*5+4, y:80});
        const ids = a.wallManager.walls.map(w => w.id);
        return { loaded, total: ids.length, unique: new Set(ids).size };
    }''', pg=pg2)
    check('new walls after reload never reuse an existing id', res['total'] == res['unique'] and res['total'] == 18, str(res))
    pg2.close()

    # ---------- 3. bundled project: duplicate ids
    page.goto(BASE + '/index.html?sample=my_50x52_residential_plan')
    page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000)
    res = ev('''() => {
        const a = window.app;
        const dup = (arr) => arr.length - new Set(arr.map(x => x.id)).size;
        return { rooms: a.roomManager.rooms.length, dupRooms: dup(a.roomManager.rooms),
                 dupWalls: dup(a.wallManager.walls), dupFurn: dup(a.furnitureManager.items), dupOps: dup(a.openingManager.openings) };
    }''')
    check('bundled project has no duplicate ids after load', res['dupRooms']==0 and res['dupWalls']==0 and res['dupFurn']==0 and res['dupOps']==0, str(res))

    # ---------- 4. lossless round trip (undo/redo path) for fields the old code dropped
    page.goto(BASE + '/index.html?sample=30x40_2bhk')
    page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000)
    res = ev('''() => {
        const a = window.app;
        const col = a.columnManager.addColumn(100, 100, { width: 12, depth: 12 });
        col.type = 'circular';
        const road = a.roadManager.addRoad({ side: 'left', width: 240 });
        road.sidewalkWidth = 77;
        road.customLine = { start: {x:0,y:0}, end: {x:50,y:50} };
        const room = a.roomManager.rooms[0];
        room.polygon = [{x:0,y:0},{x:50,y:0},{x:50,y:50}];
        a.saveHistory();                       // snapshot A (with the special fields)
        a.wallManager.addWall({x:500,y:500},{x:560,y:500});
        a.saveHistory();                       // snapshot B
        a.saveToLocalStorage();
        const persisted = JSON.parse(localStorage.getItem('houseplanner_autosave'));
        const pr = (persisted.roads || []).find(r => r.side === 'left') || {};
        const pc = (persisted.columns || []).find(c => c.x === 100 && c.y === 100) || {};
        const persistedOk = pr.sidewalkWidth === 77 && !!pr.customLine && pc.type === 'circular' && !!(persisted.rooms[0] && persisted.rooms[0].polygon);
        a.undo();                              // back to A
        const c2 = a.columnManager.columns.find(c => c.x === 100 && c.y === 100);
        const r2 = a.roadManager.roads.find(r => r.side === 'left');
        return { colType: c2 && c2.type, sidewalk: r2 && r2.sidewalkWidth, custom: !!(r2 && r2.customLine),
                 poly: !!(a.roomManager.rooms[0].polygon), persistedOk };
    }''')
    ok = res['colType']=='circular' and res['sidewalk']==77 and res['custom'] and res['poly']
    check('undo keeps circular column / road sidewalk+customLine / room polygon', ok, str(res))
    check('autosave (what a reload reads) keeps those same fields', res['persistedOk'] is True, str(res))

    # ---------- 5. undo snapshots are not corrupted by later edits (no shared references)
    res = ev('''() => {
        const a = window.app;
        const w = a.wallManager.walls[0];
        const before = JSON.stringify(a.undoStack[a.undoStack.length-1].walls[0]);
        w.start.x += 999; w.end.y += 999;       // simulate dragging the wall in place
        const after = JSON.stringify(a.undoStack[a.undoStack.length-1].walls[0]);
        return { same: before === after };
    }''')
    check('editing a wall in place does not alter undo history', res['same'], str(res))

    # ---------- 6. HTML injection through a project file
    page.goto(BASE + '/index.html?sample=30x40_2bhk')
    page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000)
    res = ev('''() => {
        const a = window.app;
        window.__xss = 0;
        const evil = '"><img src=x onerror="window.__xss=1">';
        a.roomManager.rooms[0].name = evil;
        a.roomManager.selectedRoomId = a.roomManager.rooms[0].id;
        a.selectedCategory = 'room';
        a.selectedObject = a.roomManager.rooms[0];
        a.updateInspector();
        return new Promise(r => setTimeout(() => {
            const input = document.getElementById('roomNameInput');
            r({ xss: window.__xss, inputValueOk: input && input.value === evil });
        }, 400));
    }''')
    check('room name with HTML does not execute script and shows verbatim', res['xss']==0 and res['inputValueOk'], str(res))

    # ---------- 7. bad files are rejected and the drawing is left untouched
    res = ev('''() => {
        const a = window.app;
        a.restoreState(JSON.parse(JSON.stringify(a.undoStack[0])));  // known good
        const wallsBefore = a.wallManager.walls.length;
        const out = {};
        const bad = {
          notObject: 'hello', array: [1,2], noKnownKeys: { foo: 1 },
          wallsNotList: { walls: 'x' }, badPlot: { walls: [], plot: { vertices: [1,2] } },
          future: { version: 99, walls: [] }
        };
        for (const [k, v] of Object.entries(bad)) {
          try { a.restoreState(v); out[k] = 'ACCEPTED'; } catch (e) { out[k] = 'rejected'; }
        }
        out.wallsUnchanged = a.wallManager.walls.length === wallsBefore;
        return out;
    }''')
    allrej = all(v in ('rejected', True) for v in res.values()) and '__error' not in res
    check('invalid project files are rejected, drawing untouched', allrej, str(res))

    # ---------- 8. partially bad records are skipped, not fatal
    res = ev('''() => {
        const a = window.app;
        const w = a.restoreState({ walls: [
            { id:'wall_1', start:{x:0,y:0}, end:{x:10,y:0}, thickness:9, type:'exterior' },
            { id:'wall_2', start:{x:'a'}, end:null },
            { id:'wall_1', start:{x:0,y:5}, end:{x:10,y:5}, thickness:9, type:'exterior' }
          ], openings: [ { id:'op_1', wallId:'wall_404', t:0.5 } ] });
        const ids = a.wallManager.walls.map(x => x.id);
        return { walls: a.wallManager.walls.length, unique: new Set(ids).size, ops: a.openingManager.openings.length, warnings: w.length };
    }''')
    check('bad records skipped, duplicate id repaired, orphan opening dropped',
          res['walls']==2 and res['unique']==2 and res['ops']==0 and res['warnings']>=3, str(res))

    # ---------- 9. prototype-pollution style keys are ignored
    res = ev('''() => {
        const a = window.app;
        const s = JSON.parse('{"walls":[{"id":"wall_9","start":{"x":0,"y":0},"end":{"x":9,"y":0},"__proto__":{"polluted":true}}]}');
        a.restoreState(s);
        const w = a.wallManager.walls[0];
        return { protoOk: Object.getPrototypeOf(w).constructor.name === 'Wall', leaked: ({}).polluted === true || w.polluted === true };
    }''')
    check('"__proto__" key in a file cannot change object prototypes', res['protoOk'] and not res['leaked'], str(res))

    # ---------- 10. multi-floor round trip incl. per-floor slab config
    page.goto(BASE + '/index.html?sample=30x40_duplex_g1')
    page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000)
    res = ev('''() => {
        const a = window.app;
        const groundWalls = a.wallManager.walls.length;
        a.floorManager.switchFloor('first');
        const firstWalls = a.wallManager.walls.length;
        if (a.slabManager) { a.slabManager.setUniformOffset(33); }
        a.saveHistory();
        const snap = JSON.parse(JSON.stringify(a.undoStack[a.undoStack.length-1]));
        a.clearAll();
        a.restoreState(snap);
        const active = a.floorManager.activeFloorId;
        const slabKept = snap.floorManager.floors.some(f => f.slabConfig);
        a.floorManager.switchFloor('ground');
        return { groundWalls, firstWalls, active, groundBack: a.wallManager.walls.length, slabKept };
    }''')
    check('multi-floor project survives save/restore (and floors keep slab settings)',
          res['groundBack']==res['groundWalls'] and res['active']=='first' and res['slabKept'], str(res))

    # ---------- 11. autosave: content that is not walls/plot is saved; failure is surfaced
    page.goto(BASE + '/index.html')
    page.wait_for_function('window.app', timeout=8000)
    res = ev('''() => {
        const a = window.app;
        a.clearAll();
        localStorage.removeItem('houseplanner_autosave');
        a.roomManager.addRoom(0,0,{name:'Only Room'});
        a.furnitureManager.addItem('bed_king', 50, 50, 0);
        a.saveHistory();
        a.saveToLocalStorage();
        const raw = localStorage.getItem('houseplanner_autosave');
        return { saved: !!raw };
    }''')
    check('autosave stores a project that only has rooms/furniture', res['saved'], str(res))

    # ---------- 12. render loop idle cost
    page.goto(BASE + '/index.html?sample=30x40_2bhk')
    page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000)
    page.wait_for_timeout(800)
    n = ev('''() => new Promise(r => {
        const a = window.app; let c = 0; const orig = a.render.bind(a);
        a.render = () => { c++; return orig(); };
        setTimeout(() => { a.render = orig; r(c); }, 3000);
    })''')
    check('idle redraws in 3s (60fps loop would be ~180)', isinstance(n,(int,float)) and n < 30, f'{n} redraws')

    # still redraws on interaction
    n2 = ev('''() => new Promise(r => {
        const a = window.app; let c = 0; const orig = a.render.bind(a);
        a.render = () => { c++; return orig(); };
        const cv = document.getElementById('cadCanvas'); const rc = cv.getBoundingClientRect();
        let i = 0; const t = setInterval(() => {
          cv.dispatchEvent(new MouseEvent('mousemove', {bubbles:true, clientX: rc.left+300+i*5, clientY: rc.top+300}));
          if (++i > 20) { clearInterval(t); setTimeout(()=>{ a.render = orig; r(c); }, 100); }
        }, 16);
    })''')
    check('canvas still redraws while the mouse moves', isinstance(n2,(int,float)) and n2 >= 10, f'{n2} redraws')

    # ---------- 13. metric grid: snapping uses the metric grid
    res = ev('''() => {
        const a = window.app; const ce = a.canvasEngine;
        document.getElementById('unitToggleBtn').click();   // -> metric
        ce.scale = 4; ce.snapToGrid = true; ce.snapToPoints = false;
        const g = 19.685;                                    // 0.5 m in inches (the drawn metric grid)
        const p = ce.getSnapPoint(g*3 + 0.2, g*2 - 0.2, [], null, false);
        const out = { x: p.x, y: p.y, expectX: g*3, expectY: g*2, snapped: p.snapped };
        document.getElementById('unitToggleBtn').click();   // back to imperial
        return out;
    }''')
    check('metric mode snaps to the 0.5 m grid (not 1 ft)', res['snapped'] is True and abs((res['x'] or 0)-res['expectX']) < 1e-6 and abs((res['y'] or 0)-res['expectY']) < 1e-6, str(res))

    # ---------- 14. ortho lock cannot be broken by an object snap
    res = ev('''() => {
        const ce = window.app.canvasEngine; ce.scale = 2; ce.snapToGrid = false; ce.snapToPoints = true;
        const base = {x:0,y:0};
        // cursor is along +x axis, but a snap target sits slightly off-axis (within magnet radius)
        const p = ce.getSnapPoint(100, 3, [{x:101, y:6, type:'endpoint'}], base, true);
        return { y: p.y, x: p.x };
    }''')
    check('ortho lock stays on the axis even next to a snap target', abs(res['y']) < 1e-9, str(res))

    # ---------- 15. SVG export with special characters is valid XML
    res = ev('''() => new Promise(r => {
        const a = window.app;
        a.roomManager.rooms[0].name = 'Bed & Bath <1>';
        let text = null;
        const orig = window.Exporter.triggerDownload;
        window.Exporter.triggerDownload = (blob) => { blob.text().then(t => { text = t; }); };
        window.Exporter.exportSVG(a, 't.svg');
        window.Exporter.triggerDownload = orig;
        setTimeout(() => {
            const doc = new DOMParser().parseFromString(text || '', 'image/svg+xml');
            r({ parsed: !doc.querySelector('parsererror'), len: (text||'').length });
        }, 300);
    })''')
    check('SVG export stays valid XML with "&" and "<" in room names', res['parsed'] and res['len'] > 100, str(res))

    # ---------- 16. DXF layer table is consistent
    res = ev('''() => new Promise(r => {
        const a = window.app; let text = null;
        const orig = window.Exporter.triggerDownload;
        window.Exporter.triggerDownload = (blob) => { blob.text().then(t => { text = t; }); };
        window.Exporter.exportDXF(a, 't.dxf');
        window.Exporter.triggerDownload = orig;
        setTimeout(() => {
            const lines = (text||'').split('\\n');
            const i = lines.indexOf('LAYER');          // table header
            const declared = parseInt(lines[i+2]);     // after "70"
            const records = (text||'').split('0\\nLAYER\\n2\\n').length - 1;
            const colors = new Set((text||'').match(/62\\n\\d+/g));
            r({ declared, records, distinctColors: colors.size });
        }, 300);
    })''')
    check('DXF declared layer count matches records, colours differ', res['declared']==res['records'] and res['distinctColors']>3, str(res))

    # ---------- 17. Save JSON captures the live state
    res = ev('''() => new Promise(r => {
        const a = window.app; let text = null;
        a.wallManager.addWall({x:900,y:900},{x:960,y:900});     // NOTE: no saveHistory() call
        const orig = window.Exporter.triggerDownload;
        window.Exporter.triggerDownload = (blob) => { blob.text().then(t => { text = t; }); };
        document.getElementById('saveJsonBtn').click();
        window.Exporter.triggerDownload = orig;
        setTimeout(() => {
            try { const j = JSON.parse(text); r({ has: j.walls.some(w => w.start.x === 900) }); } catch(e) { r({ has:false, err:String(e) }); }
        }, 300);
    })''')
    check('Save JSON includes edits not yet pushed to history', bool(res['has']), str(res))

    # ---------- 18. typing in a name box is ONE undo step, not one per keystroke
    page.goto(BASE + '/index.html?sample=30x40_2bhk')
    page.wait_for_function('window.app && window.app.roomManager.rooms.length > 0', timeout=8000)
    res = ev('''() => {
        const a = window.app; const room = a.roomManager.rooms[0];
        a.clearSelection(); a.selectedCategory = 'room'; a.selectedObject = room; a.roomManager.selectedRoomId = room.id; a.updateInspector();
        return { before: room.name, stackBefore: a.undoStack.length };
    }''')
    page.fill('#roomNameInput', '')
    page.type('#roomNameInput', 'Master Bedroom Suite', delay=15)
    res2 = ev('''() => { const a = window.app; return { name: a.roomManager.rooms[0].name, stack: a.undoStack.length }; }''')
    page.keyboard.press('Tab'); page.click('#undoBtn')
    res3 = ev('''() => ({ name: window.app.roomManager.rooms[0].name }) ''')
    check('typing a 20-letter room name adds at most 2 undo steps and one undo restores the old name',
          res2['stack'] - res['stackBefore'] <= 2 and res3['name'] == res['before'], f"{res} {res2} {res3}")

    # ---------- 19. door/window placement refuses walls that are too short and overlaps
    res = ev('''() => {
        const a = window.app; a.clearAll();
        const short = a.wallManager.addWall({x:0,y:0},{x:40,y:0});
        const long = a.wallManager.addWall({x:0,y:100},{x:300,y:100});
        a.activeDoorWidth = 36; a.activeTool = 'door';
        const count = () => a.openingManager.openings.length;
        a.handleOpeningPlacement(20, 0);            // 36" door on a 40" wall -> refused
        const onShort = count();
        a.activeTool = 'door'; a.handleOpeningPlacement(150, 100);   // fits
        const onLong1 = count();
        a.activeTool = 'door'; a.handleOpeningPlacement(160, 100);   // overlaps the first
        const onLong2 = count();
        a.activeTool = 'door'; a.handleOpeningPlacement(240, 100);   // free space
        const onLong3 = count();
        return { onShort, onLong1, onLong2, onLong3 };
    }''')
    check('placement: refused on a too-short wall and on overlap, accepted when it fits',
          res['onShort']==0 and res['onLong1']==1 and res['onLong2']==1 and res['onLong3']==2, str(res))

    # ---------- 20. window/door cutout colour follows the theme (clean = paper white)
    res = ev('''() => {
        const a = window.app;
        const WM = a.wallManager.constructor, OM = a.openingManager.constructor;
        const sample = (style) => {
            const c = document.createElement('canvas'); c.width = 300; c.height = 120;
            const ctx = c.getContext('2d');
            ctx.fillStyle = style === 'clean' ? '#ffffff' : '#0f172a'; ctx.fillRect(0, 0, 300, 120);
            const wm = new WM(), om = new OM();
            const w = wm.addWall({x:20,y:60},{x:280,y:60}, 9, 'exterior');
            om.addOpening(w.id, 0.5, { type: 'window', width: 48 });
            wm.render(ctx, 1, om, style); om.render(ctx, 1, wm, style);
            // look at the whole gap (x 130..170, y 56..64) and report what fraction is light paper-colour
            const d = ctx.getImageData(130, 56, 40, 8).data; let light = 0, n = 0;
            for (let i = 0; i < d.length; i += 4) { n++; if (Math.min(d[i], d[i+1], d[i+2]) > 180) light++; }
            return light / n;
        };
        return { clean: sample('clean'), blueprint: sample('blueprint') };
    }''')
    clean_ok = res['clean'] is not None and res['clean'] > 0.5 and res['blueprint'] < 0.5
    check('clean-theme window cutout is light paper colour (blueprint stays dark)', bool(clean_ok), str(res))

    # ---------- 21. "Copy Structure" twice must not stack duplicate Open-to-Below rooms; ids stay unique
    page.goto(BASE + '/index.html?sample=30x40_duplex_g1')
    page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000)
    res = ev('''() => {
        const a = window.app; const fm = a.floorManager;
        a.roomManager.rooms.slice(0, 2).forEach(r => { r.isDoubleHeight = true; });      // two double-height rooms on the ground floor
        const doubles = a.roomManager.rooms.filter(r => r.isDoubleHeight).length;
        fm.copyStructureToFloor('ground', 'first'); fm.copyStructureToFloor('ground', 'first');
        const first = fm.getFloor('first');
        const voids = first.rooms.filter(r => String(r.id).startsWith('room_void_'));
        return { doubles, voids: voids.length, uniqueIds: new Set(voids.map(v => v.id)).size };
    }''')
    check('copy structure twice -> exactly one void per double-height room, with unique ids',
          res['voids'] == res['doubles'] and res['uniqueIds'] == res['voids'] and res['doubles'] >= 2, str(res))

    # ---------- 22. drawing other floors must not burn ids (ghost floors were rebuilt every frame)
    res = ev('''() => {
        const a = window.app; a.floorManager.setViewMode('side_by_side');
        const num = (id) => parseInt(String(id).split('_')[1], 10);
        const w1 = a.wallManager.addWall({x:0,y:5000},{x:10,y:5000});
        for (let i = 0; i < 40; i++) a.render();
        const w2 = a.wallManager.addWall({x:0,y:5100},{x:10,y:5100});
        return { burned: num(w2.id) - num(w1.id) };
    }''')
    check('40 redraws of a side-by-side drawing consume at most 1 wall id', res['burned'] is not None and res['burned'] <= 2, str(res))

    # ---------- 23. corner-style toggle: button, undo, save/load
    page.goto(BASE + '/index.html?sample=30x40_2bhk')
    page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000)
    res = ev('''() => {
        const a = window.app; const btn = document.getElementById('cornerStyleBtn');
        if (!btn) return { missing: true };
        const out = { start: a.wallManager.cornerStyle, startLabel: btn.innerText.trim() };
        btn.click(); out.afterClick = a.wallManager.cornerStyle; out.clickLabel = btn.innerText.trim();
        out.saved = serialized = JSON.parse(JSON.stringify(window.app.undoStack[window.app.undoStack.length - 1])).wallCornerStyle;
        a.undo(); out.afterUndo = a.wallManager.cornerStyle; out.undoLabel = btn.innerText.trim();
        a.redo(); out.afterRedo = a.wallManager.cornerStyle;
        // an older file without the setting must leave the current choice alone
        const old = JSON.parse(JSON.stringify(a.undoStack[a.undoStack.length - 1])); delete old.wallCornerStyle;
        a.restoreState(old); out.oldFile = a.wallManager.cornerStyle;
        return out;
    }''')
    ok = (res['start'] == 'mitre' and 'Mitred' in (res['startLabel'] or '') and res['afterClick'] == 'round' and 'Rounded' in (res['clickLabel'] or '')
          and res['saved'] == 'round' and res['afterUndo'] == 'mitre' and 'Mitred' in (res['undoLabel'] or '')
          and res['afterRedo'] == 'round' and res['oldFile'] == 'round')
    check('corner style toggle: button label, undo/redo, saved in the project, old files keep the setting', ok, str(res))

    # ---------- 24. exports use the same corners as the screen (SVG polygons are mitred, or square when rounded)
    res = ev('''() => new Promise(r => {
        const a = window.app; const svgFor = (style) => new Promise(done => {
            a.wallManager.cornerStyle = style; let text = null;
            const orig = window.Exporter.triggerDownload;
            window.Exporter.triggerDownload = (blob) => { blob.text().then(t => { text = t; }); };
            window.Exporter.exportSVG(a, 't.svg'); window.Exporter.triggerDownload = orig;
            setTimeout(() => done(text), 250);
        });
        (async () => {
            const polys = (t) => [...t.matchAll(/<polygon points="([^"]+)" class="wall-(?:ext|int)"/g)].map(m => m[1]);
            const mitre = polys(await svgFor('mitre')), round = polys(await svgFor('round'));
            const plain = a.wallManager.walls.map(w => w.getPolygon().map(p => p.x + ',' + p.y).join(' '));
            r({ n: mitre.length, mitreDiffers: mitre.filter((p, i) => p !== plain[i]).length, roundSame: round.filter((p, i) => p === plain[i]).length, walls: plain.length });
        })();
    })''')
    check('SVG export: mitred corners when mitred, original square outlines when rounded',
          res['n'] == res['walls'] and (res['mitreDiffers'] or 0) > 0 and res['roundSame'] == res['walls'], str(res))

    # ---------- 25. the front setback follows the road
    res = ev('''() => {
        const a = window.app; a.clearAll();
        a.plotManager.createRectangularPlot(0, 0, 600, 800, { front: 60, rear: 36, left: 24, right: 12 });
        const bottom = a.plotManager.getBuildableBounds();
        a.roadManager.addRoad({ side: 'left', width: 240 });
        const left = a.plotManager.getBuildableBounds();
        a.roadManager.clear(); a.roadManager.addRoad({ side: 'rear', width: 240 });
        const top = a.plotManager.getBuildableBounds();
        return { bottom, left, top };
    }''')
    ok = (res['bottom'] and res['bottom']['y'] == 36 and res['bottom']['height'] == 800 - 96
          and res['left']['x'] == 60 and res['left']['width'] == 600 - 60 - 36
          and res['top']['y'] == 60 and res['top']['height'] == 800 - 60 - 36)
    check('front setback applies to the road side (bottom unchanged, left road, top road)', bool(ok), str(res))

    # ---------- 26. a setback of 0 is shown as 0 in BOTH setback panels, and they say which edge is the front
    res = ev('''() => new Promise(r => {
        const a = window.app; a.plotManager.createRectangularPlot(0, 0, 600, 800, { front: 0, rear: 0, left: 0, right: 0 });
        a.roadManager.clear(); a.roadManager.addRoad({ side: 'left', width: 240 });
        a.clearSelection(); a.updateInspector();                                    // nothing selected -> quick panel
        const quick = { front: document.getElementById('quickSbFront').value, rear: document.getElementById('quickSbRear').value,
                        hint: document.querySelector('#inspectorBody .hint-text').innerText };
        a.selectedCategory = 'plot'; a.selectedObject = a.plotManager.plot; a.updateInspector();   // plot selected -> full panel
        setTimeout(() => r({ quick, full: document.getElementById('sbFrontInput').value, fullHint: document.getElementById('setbackRoadHint').innerText }), 150);
    })''')
    q = res['quick'] or {}
    check('setback of 0 shows as 0 (not 60/36) in both panels; both name the road edge (left road -> "left edge")',
          q.get('front') == '0"' and q.get('rear') == '0"' and res['full'] == '0"'
          and 'left edge' in (q.get('hint') or '') and 'left edge' in (res['fullHint'] or ''), str(res))

    # ---------- 27. stair inspector shows rises/treads; room inspector says "Nominal Area" (not carpet)
    res = ev('''() => new Promise(r => {
        const a = window.app; a.clearAll();
        const st = a.stairManager.addStair({ x: 100, y: 100, type: 'dogleg', treads: 16, landingSteps: 3 });
        a.clearSelection(); a.selectedCategory = 'stair'; a.selectedObject = st; a.stairManager.selectedStairId = st.id; a.updateInspector();
        const note = document.getElementById('stairCountNote').innerText;
        const room = a.roomManager.addRoom(300, 100, { name: 'Hall' });
        a.clearSelection(); a.selectedCategory = 'room'; a.selectedObject = room; a.roomManager.selectedRoomId = room.id; a.updateInspector();
        setTimeout(() => r({ note, roomPanel: document.getElementById('inspectorBody').innerText }), 150);
    })''')
    check('stair inspector shows "16 RISES / 15 TREADS"; room inspector says Nominal Area, never Carpet',
          res['note'] == '16 RISES / 15 TREADS' and 'Nominal Area' in (res['roomPanel'] or '') and 'Carpet' not in (res['roomPanel'] or ''), str(res)[:300])

    # ---------- 28. inspector length fields keep their inch marks (the attribute used to end at the first ")
    res = ev('''() => new Promise(r => {
        const a = window.app; a.clearAll(); window.__xss2 = 0;
        const w = a.wallManager.addWall({x:0,y:0},{x:200,y:0}, 4.5, 'interior');
        const op = a.openingManager.addOpening(w.id, 0.5, { type: 'door', width: 33 });
        const st = a.stairManager.addStair({ x: 300, y: 100, type: 'dogleg', treadDepth: 10.5 });
        st.treads = '"><img src=x onerror="window.__xss2=1">';          // hostile value as if read from a file
        const show = (cat, obj, setter) => { a.clearSelection(); a.selectedCategory = cat; a.selectedObject = obj; setter(obj.id); a.updateInspector();
            return [...document.querySelectorAll('#inspectorBody input[type=text]')].map(i => [i.id, i.value]); };
        const wallFields = show('wall', w, id => a.wallManager.selectedWallId = id);
        const doorFields = show('opening', op, id => a.openingManager.selectedOpeningId = id);
        const stairFields = show('stair', st, id => a.stairManager.selectedStairId = id);
        setTimeout(() => r({ wallFields, doorFields, stairFields, xss: window.__xss2 }), 250);
    })''')
    def val(fields, key):
        return dict(fields or []).get(key)
    withinch = [v for fields in (res['wallFields'], res['doorFields'], res['stairFields']) for (_, v) in (fields or []) if "'" not in v]
    all_vals = [v for fields in (res['wallFields'], res['doorFields'], res['stairFields']) for (_, v) in (fields or [])]
    bad = [v for v in all_vals if v and v[0].isdigit() and "'" not in v and not v.endswith('"')]
    check('inspector length inputs keep their inch marks (e.g. 33", 10.5"), and a hostile value cannot inject script',
          len(all_vals) > 4 and not bad and res['xss'] == 0, str({k: res[k] for k in ('wallFields', 'doorFields', 'stairFields', 'xss')})[:400])

    # ======================= 29. MULTI-SELECT, GROUP OPERATIONS, LAYERS (real mouse + keyboard) =======================
    page.goto(BASE + '/index.html'); ev('localStorage.clear()')
    page.goto(BASE + '/index.html?sample=30x40_2bhk')
    page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000)
    page.wait_for_timeout(500)
    page.click('.tool-btn[data-tool="select"]')
    def scr(wx, wy):
        return ev('''([x, y]) => { const p = window.app.canvasEngine.worldToScreen(x, y); const b = document.getElementById('cadCanvas').getBoundingClientRect(); return [p.x + b.left, p.y + b.top]; }''', [wx, wy])
    def drag(a, b_):
        (x1, y1), (x2, y2) = scr(*a), scr(*b_)
        page.mouse.move(x1, y1); page.mouse.down(); page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, steps=4); page.mouse.move(x2, y2, steps=4); page.mouse.up(); page.wait_for_timeout(150)
    info = ev('''() => { const a = window.app; const T = a.getSelectionItems; const b = (window.__tf = null);
        const w = a.wallManager.walls; const xs = w.flatMap(x => [x.start.x, x.end.x]), ys = w.flatMap(x => [x.start.y, x.end.y]);
        return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), total: a.wallManager.walls.length + a.openingManager.openings.length + a.roomManager.rooms.length + a.columnManager.columns.length + a.furnitureManager.items.length + a.stairManager.stairs.length + a.dimensionManager.dimensions.length }; }''')

    # -- Ctrl+A
    page.keyboard.press('Control+a'); page.wait_for_timeout(200)
    res = ev('''() => ({ n: window.app.selection.length, cat: window.app.selectedCategory, panel: document.getElementById('inspectorBody').innerText.slice(0, 60) }) ''')
    check('Ctrl+A selects every object and shows the group panel', res['n'] == info['total'] and res['cat'] == 'multi' and 'selection' in (res['panel'] or '').lower(), str(res) + ' total=' + str(info['total']))

    # -- window (left->right) vs crossing (right->left) rubber band, starting on empty canvas outside the plot
    page.keyboard.press('Escape'); page.click('.tool-btn[data-tool="select"]')
    page.click('#zoomFitBtn'); page.wait_for_timeout(300)
    pb = ev('window.app.plotManager.getBounds()')
    gx1, gy1, gx2, gy2 = pb['x'] + 22, pb['y'] + 22, pb['x'] + pb['width'] - 22, pb['y'] + pb['height'] - 22      # all four corners are empty setback margin
    for _ in range(3): page.click('#zoomOutBtn')
    page.wait_for_timeout(200)
    drag((pb['x'] - 140, pb['y'] - 140), (pb['x'] + pb['width'] + 140, pb['y'] + pb['height'] + 140))   # window around the whole plot and its dimension strings
    n_window_all = ev('window.app.getSelectionItems().length')
    page.click('#zoomFitBtn'); page.wait_for_timeout(300)
    page.keyboard.press('Escape'); page.click('.tool-btn[data-tool="select"]')
    cx = (info['minX'] + info['maxX']) / 2; cy = (info['minY'] + info['maxY']) / 2
    drag((gx1, gy1), (cx, cy))                                                       # left->right : WINDOW over the top-left part of the building
    n_win = ev('window.app.getSelectionItems().length')
    page.keyboard.press('Escape'); page.click('.tool-btn[data-tool="select"]')
    drag((cx, gy1), (gx1, cy))                                                       # right->left over the SAME rectangle : CROSSING
    n_cross = ev('window.app.getSelectionItems().length')
    check('rubber band (started inside the plot): big window selects everything; crossing selects more than the same window',
          n_window_all == info['total'] and n_win >= 1 and n_cross > n_win, f"all={n_window_all}/{info['total']} window={n_win} crossing={n_cross}")

    # -- a plain click inside the plot still selects the plot (no accidental marquee)
    page.keyboard.press('Escape'); page.click('.tool-btn[data-tool="select"]')
    free = ev('''() => { const a = window.app, pb = a.plotManager.getBounds(), sc = a.canvasEngine.scale;
        for (let y = pb.y + 40; y < pb.y + pb.height - 40; y += 8) for (let x = pb.x + 24; x < pb.x + pb.width - 24; x += 8) {
            if (!a.plotManager.hitTest(x, y)) continue;
            const w = { x, y }; if (a.pickItemAt(w)) continue;
            if (a.wallManager.getWallAt(x, y, sc, 16)) continue;                       // keep well away from every wall
            return { x, y };
        } return null; }''')
    px, py = scr(free['x'], free['y'])
    page.mouse.click(px, py); page.wait_for_timeout(150)
    check('a plain click on the plot still selects the plot', ev('window.app.selectedCategory') == 'plot', str(ev('window.app.selectedCategory')))

    # -- shift+click adds and removes
    page.keyboard.press('Escape'); page.click('.tool-btn[data-tool="select"]')
    pts = ev('''() => { const a = window.app; const w = a.wallManager.walls[0]; const c = a.columnManager.columns[0];
        return { w: { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 }, c: { x: c.x, y: c.y } }; }''')
    wx, wy = scr(pts['w']['x'], pts['w']['y']); cx2, cy2 = scr(pts['c']['x'], pts['c']['y'])
    page.mouse.click(wx, wy); page.wait_for_timeout(100)
    first = ev('window.app.selectedCategory')
    page.keyboard.down('Shift'); page.mouse.click(cx2, cy2); page.keyboard.up('Shift'); page.wait_for_timeout(150)
    two = ev('window.app.selection.length')
    page.keyboard.down('Shift'); page.mouse.click(cx2, cy2); page.keyboard.up('Shift'); page.wait_for_timeout(150)
    back = ev('({ n: window.app.selection.length, cat: window.app.selectedCategory })')
    check('Shift+click adds a second object, Shift+click again removes it', first in ('wall', 'column') and two == 2 and back['n'] == 0 and back['cat'] in ('wall', 'column'), f'{first} {two} {back}')

    # -- dragging one selected object moves the whole group together, and undo puts it back
    page.keyboard.press('Control+a'); page.wait_for_timeout(150)
    before = ev('window.app.wallManager.walls.map(w => [w.start.x, w.start.y, w.end.x, w.end.y])')
    hit = ev('(() => { const w = window.app.wallManager.walls[0]; return { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 }; })()')
    sx, sy = scr(hit['x'], hit['y'])
    page.mouse.move(sx, sy); page.mouse.down(); page.mouse.move(sx + 30, sy + 12, steps=5); page.mouse.move(sx + 60, sy + 24, steps=5); page.mouse.up(); page.wait_for_timeout(200)
    after = ev('window.app.wallManager.walls.map(w => [w.start.x, w.start.y, w.end.x, w.end.y])')
    deltas = {(round(a[0] - b_[0], 4), round(a[1] - b_[1], 4)) for a, b_ in zip(after, before)}
    moved = len(deltas) == 1 and list(deltas)[0] != (0, 0)
    page.click('#undoBtn'); page.wait_for_timeout(200)
    undone = ev('window.app.wallManager.walls.map(w => [w.start.x, w.start.y, w.end.x, w.end.y])')
    check('dragging a selected object moves the whole group by one common offset; one undo puts it back', moved and undone == before, f'deltas={deltas}')

    # -- group panel: Move 6', Copy, Rotate, Mirror, layer, delete
    ev('''() => { const a = window.app; a.clearSelection(); const f = a.furnitureManager.items; a.setSelection([{ category: 'furniture', obj: f[0] }, { category: 'furniture', obj: f[1] }]); }''')
    page.wait_for_timeout(150)
    p0 = ev('window.app.furnitureManager.items.slice(0, 2).map(i => [i.x, i.y, i.rotation])'); n0 = ev('window.app.furnitureManager.items.length')
    page.fill('#grpDx', "6'"); page.fill('#grpDy', '0'); page.click('#grpMove'); page.wait_for_timeout(150)
    p1 = ev('window.app.furnitureManager.items.slice(0, 2).map(i => [i.x, i.y, i.rotation])')
    page.click('#grpCopy'); page.wait_for_timeout(150)
    n1 = ev('window.app.furnitureManager.items.length')
    ok_move = all(abs(b_[0] - a[0] - 72) < 1e-6 and abs(b_[1] - a[1]) < 1e-6 for a, b_ in zip(p0, p1))
    check('group panel: Move by 6\' shifts both objects 72 in; Copy adds two copies', ok_move and n1 == n0 + 2, f'{p0} -> {p1}; count {n0} -> {n1}')
    page.fill('#grpAngle', '90'); page.click('#grpRotR'); page.wait_for_timeout(150)
    rot = ev('window.app.getSelectionItems().map(i => i.obj.rotation)')
    page.click('#grpMirLR'); page.wait_for_timeout(150)
    mir = ev('window.app.getSelectionItems().map(i => i.obj.rotation)')
    exp_rot = [(r_[2] + 90) % 360 for r_ in p0]                                   # each item turned 90 degrees clockwise
    exp_mir = [(360 - r_) % 360 for r_ in exp_rot]                                # mirror across a vertical axis: 2*90 - r + 180
    check('group panel: rotate right adds 90 degrees to every object; mirror left-right reflects each orientation',
          all(abs(a - b_) < 1e-6 for a, b_ in zip(rot, exp_rot)) and all(abs(a - b_) < 1e-6 for a, b_ in zip(mir, exp_mir)), f'{rot} vs {exp_rot}; {mir} vs {exp_mir}')
    page.click('#undoBtn'); page.click('#undoBtn'); page.click('#undoBtn'); page.click('#undoBtn'); page.wait_for_timeout(200)
    check('four undos revert Move, Copy, Rotate and Mirror', ev('window.app.furnitureManager.items.length') == n0
          and ev('window.app.furnitureManager.items.slice(0, 2).map(i => [i.x, i.y, i.rotation])') == p0, '')

    # ----- layers dialog
    page.click('#layersBtn'); page.wait_for_timeout(200)
    shown = ev("getComputedStyle(document.getElementById('layersModal')).display")
    page.fill('#newLayerName', 'Phase 2'); page.click('#newLayerAdd'); page.wait_for_timeout(200)
    names = ev("[...document.querySelectorAll('#layersCard .ly-name')].map(i => i.value)")
    page.click('#layersClose')
    check('Layers dialog opens, lists built-in layers, and a new layer can be added', shown == 'flex' and 'Walls' in names and 'Phase 2' in names, f'{shown} {names}')
    ev("() => { const a = window.app; const l = a.layerManager.layers.find(x => x.name === 'Phase 2'); const f = a.furnitureManager.items; a.setSelection([{ category: 'furniture', obj: f[0] }, { category: 'furniture', obj: f[1] }]); window.__ly = l.id; }")
    page.select_option('#grpLayer', ev('window.__ly')); page.wait_for_timeout(150)
    assigned = ev('window.app.furnitureManager.items.slice(0, 2).map(i => i.layer)')
    pos = ev('(() => { const i = window.app.furnitureManager.items[0]; return [i.x, i.y]; })()')
    # hide the layer: the objects can no longer be picked at their position
    ev("() => { const a = window.app; a.layerManager.setVisible(window.__ly, false); a.clearSelection(); a.requestRender(); }")
    picked_hidden = ev("(() => { const i = window.app.furnitureManager.items[0]; return !!window.app.furnitureManager.getItemAt(i.x, i.y); })()")
    ev("() => { const a = window.app; a.layerManager.setVisible(window.__ly, true); a.layerManager.setLocked(window.__ly, true); }")
    picked_locked = ev("(() => { const i = window.app.furnitureManager.items[0]; return !!window.app.furnitureManager.getItemAt(i.x, i.y); })()")
    ev("() => { const a = window.app; a.layerManager.setLocked(window.__ly, false); }")
    picked_free = ev("(() => { const i = window.app.furnitureManager.items[0]; return !!window.app.furnitureManager.getItemAt(i.x, i.y); })()")
    check('layers: assigned objects are unpickable when the layer is hidden or locked, pickable again after unlocking',
          assigned == [ev('window.__ly')] * 2 and not picked_hidden and not picked_locked and picked_free, f'{assigned} {picked_hidden} {picked_locked} {picked_free}')
    # a project round-trips its layers and the objects' layer ids
    saved = ev("() => { const s = JSON.parse(JSON.stringify(window.app.undoStack[window.app.undoStack.length - 1])); window.app.clearAll(); window.app.restoreState(s); return { layer: window.app.layerManager.layers.some(l => l.name === 'Phase 2'), onLayer: window.app.furnitureManager.items.filter(i => i.layer === window.__ly).length }; }")
    check('layers survive save/load together with the objects that use them', saved['layer'] and saved['onLayer'] == 2, str(saved))

    # ======================= 30. COMMAND LINE (real keyboard + mouse) =======================
    page.goto(BASE + '/index.html'); ev('localStorage.clear()')
    page.goto(BASE + '/index.html?sample=30x40_2bhk')
    page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000)
    ev("() => { const a = window.app; a.clearAll(); a.saveHistory(); a.canvasEngine.scale = 2; a.canvasEngine.offsetX = 300; a.canvasEngine.offsetY = 300; a.setGridSnap(false); a.requestRender(); }")
    page.wait_for_timeout(300)
    def say(text):
        page.keyboard.press('/'); page.keyboard.type(text); page.keyboard.press('Enter'); page.wait_for_timeout(120)
    def cmd_lines():
        return ev("[...document.querySelectorAll('#cmdLog .cmd-line')].map(l => [l.className.replace('cmd-line cmd-', ''), l.textContent])")

    # -- direct distance entry: pick a start point with the mouse, aim with the mouse, then TYPE the length
    page.keyboard.press('w'); page.wait_for_timeout(100)
    x0, y0 = scr(0, 0); x1, y1 = scr(300, 0)
    page.mouse.click(x0, y0); page.wait_for_timeout(100)
    page.mouse.move(x1, y1 + 1); page.wait_for_timeout(100)                       # aim east
    page.keyboard.type("12'"); page.wait_for_timeout(80)                           # digits go to the command line while drawing
    typed = ev("document.getElementById('cmdInput').value")
    page.keyboard.press('Enter'); page.wait_for_timeout(200)
    walls = ev("window.app.wallManager.walls.map(w => ({ len: Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y), dy: w.end.y - w.start.y }))")
    check('drawing a wall: type 12\' + Enter makes a 12 ft wall towards the cursor', typed == "12'" and len(walls) == 1 and abs(walls[0]['len'] - 144) < 0.01, f'{typed} {walls}')
    page.keyboard.type("@5'<90"); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    w2 = ev("window.app.wallManager.walls.map(w => ({ sx: w.start.x, sy: w.start.y, ex: w.end.x, ey: w.end.y }))")
    ok = len(w2) == 2 and abs(w2[1]['sx'] - w2[0]['ex']) < 1e-6 and abs(w2[1]['ex'] - w2[1]['sx']) < 1e-6 and abs((w2[1]['sy'] - w2[1]['ey']) - 60) < 1e-6
    check('the chain continues: @5\'<90 draws a 5 ft wall straight UP from the last point', ok, str(w2))
    page.keyboard.press('Enter'); page.keyboard.press('Enter'); page.wait_for_timeout(150)         # first focuses the box, second sends an empty line
    check('Enter on an empty line ends the chain of walls', ev('window.app.draftStart') is None and ev('window.app.wallManager.walls.length') == 2, '')
    check('undo removes the typed walls one at a time', (page.click('#undoBtn') or True) and ev('window.app.wallManager.walls.length') == 1, '')
    page.click('#undoBtn')

    # -- edit commands: select objects, MOVE with a clicked base point and a typed offset
    ev("() => { const a = window.app; a.wallManager.addWall({x:0,y:0},{x:100,y:0}); a.furnitureManager.addItem('bed_king', 50, 60); a.saveHistory(); a.setTool('select'); }")
    say('all')
    n_sel = ev('window.app.getSelectionItems().length')
    say('move'); bx, by = scr(0, 0); page.mouse.click(bx, by); page.wait_for_timeout(100)
    prompt_txt = ev("document.getElementById('cmdPrompt').textContent")
    page.keyboard.press('/'); page.keyboard.type("@6',2'"); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    moved = ev("(() => { const w = window.app.wallManager.walls[0], b = window.app.furnitureManager.items[0]; return { w: [w.start.x, w.start.y], b: [b.x, b.y] }; })()")
    check('ALL, MOVE, click base point, type @6\',2\': everything moves 72 right and 24 up (Y up like AutoCAD)',
          n_sel == 2 and 'second point' in prompt_txt and moved['w'] == [72, -24] and moved['b'] == [122, 36], f'{n_sel} {prompt_txt} {moved}')
    page.click('#undoBtn'); page.wait_for_timeout(150)
    check('one undo reverts the MOVE', ev('window.app.wallManager.walls[0].start.x') == 0, '')

    # -- layer commands through the box, effect on the drawing
    say('layer new Electrical'); say('layer hide walls')
    hidden_pick = ev("!!window.app.wallManager.getWallAt(50, 0, 2)")
    say('layer show walls'); shown_pick = ev("!!window.app.wallManager.getWallAt(50, 0, 2)")
    say('layer hide nonexistent')
    lines = cmd_lines()
    check('LAYER NEW / HIDE / SHOW work from the command line, bad names give a red error line',
          not hidden_pick and shown_pick and any(k == 'error' and 'No layer called' in t for k, t in lines)
          and ev("window.app.layerManager.layers.some(l => l.name === 'Electrical')"), str(lines[-4:]))

    # -- toolbar toggles and the labels that used to stay stale
    say('ortho on'); lab1 = ev("document.querySelector('#orthoBtn .btn-text').textContent"); on1 = ev('window.app.canvasEngine.orthoMode')
    say('snap on'); lab2 = ev("document.querySelector('#snapGridBtn .btn-text').textContent")
    page.click('#orthoBtn'); lab3 = ev("document.querySelector('#orthoBtn .btn-text').textContent")
    check('ORTHO / SNAP commands and buttons agree, and the button labels follow ("Ortho: ON"...)',
          on1 and lab1 == 'Ortho: ON' and lab2 == 'Snap: ON' and lab3 == 'Ortho: OFF', f'{lab1} {lab2} {lab3}')
    say('help'); say('zoom e'); say('frobnicate')
    lines = cmd_lines()
    check('HELP prints the command list, ZOOM E works, unknown commands are reported in red',
          sum(1 for k, t in lines if t.startswith(('DRAW:', 'EDIT', 'VIEW:', 'DATA:'))) >= 4 and lines[-1][0] == 'error' and 'Unknown command' in lines[-1][1], str(lines[-2:]))
    # the one-letter shortcuts still work when the command box is not focused, and typing in the box never triggers them
    page.keyboard.press('Escape'); page.keyboard.press('d'); tool_d = ev('window.app.activeTool')
    page.keyboard.press('/'); page.keyboard.type('wall'); tool_while_typing = ev('window.app.activeTool'); page.keyboard.press('Escape'); page.keyboard.press('Escape')
    check('one-letter shortcuts still work; typing a word in the box does not fire them', tool_d == 'door' and tool_while_typing == 'door', f'{tool_d} {tool_while_typing}')

    # ======================= 31. SCHEDULES DIALOG =======================
    page.goto(BASE + '/index.html'); ev('localStorage.clear()')
    page.goto(BASE + '/index.html?sample=30x40_duplex_g1')
    page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000); page.wait_for_timeout(300)
    page.click('#schedulesBtn'); page.wait_for_timeout(300)
    res = ev('''() => { const q = (s) => [...document.querySelectorAll(s)];
        const a = window.app; const st = JSON.parse(JSON.stringify(a.undoStack[a.undoStack.length - 1]));
        const floors = (st.floorManager && st.floorManager.floors) || [];
        const doorsTotal = floors.reduce((n, f) => n + (f.openings || []).filter(o => o.type === 'door').length, 0);
        const rooms = floors.reduce((n, f) => n + (f.rooms || []).length, 0);
        const rows = q('#openingSchedule tbody tr').map(tr => [...tr.children].map(td => td.textContent));
        return { display: getComputedStyle(document.getElementById('scheduleModal')).display, openingRows: rows.length, qtySum: rows.reduce((n, r) => n + (parseInt(r[3]) || 0), 0),
                 roomRows: q('#roomSchedule tbody tr').length, rooms, first: rows[0], foot: document.querySelector('#roomSchedule tfoot').textContent }; }''')
    check('Schedules dialog lists every door/window and every room across the floors, with totals',
          res['display'] == 'flex' and res['openingRows'] > 0 and res['qtySum'] > 3 and res['roomRows'] == res['rooms'] and 'Total' in (res['foot'] or ''), str(res)[:300])
    csv = ev('''() => new Promise(r => { let text = null; const orig = window.Exporter.triggerDownload;
        window.Exporter.triggerDownload = (blob, name) => { blob.arrayBuffer().then(buf => { const b = new Uint8Array(buf); text = { t: new TextDecoder('utf-8', { ignoreBOM: true }).decode(b), name, bom: [b[0], b[1], b[2]] }; }); };
        document.getElementById('schCsv').click(); window.Exporter.triggerDownload = orig; setTimeout(() => r(text), 300); })''')
    check('Schedules: Download CSV produces a UTF-8 file with both tables', bool(csv) and csv['name'] == 'schedules.csv' and csv['t'].startswith('\ufeff') and 'DOOR / WINDOW / GATE SCHEDULE' in csv['t'] and 'ROOM SCHEDULE' in csv['t'], str(csv)[:120])
    page.click('#schClose')

    # ======================= 32. UNDERLAY: real file chooser, calibration, save/load, hostile data =======================
    from PIL import Image as _Img, ImageDraw as _Dr
    im = _Img.new('RGB', (1200, 800), 'white'); _Dr.Draw(im).rectangle([100, 100, 1100, 700], outline='black', width=6); im.save('/tmp/ul_test.png')
    page.goto(BASE + '/index.html'); ev('localStorage.clear()'); page.goto(BASE + '/index.html?sample=30x40_2bhk')
    page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000); page.wait_for_timeout(300)
    page.click('#underlayBtn'); page.wait_for_timeout(200)
    with page.expect_file_chooser() as fc: page.click('#ulLoad')
    fc.value.set_files('/tmp/ul_test.png'); page.wait_for_timeout(600)
    u = ev('window.app.underlay && ({ w: window.app.underlay.width, h: window.app.underlay.height, vis: window.app.underlay.visible, okUrl: /^data:image\\/jpeg;base64,/.test(window.app.underlay.dataUrl), drawn: !!(window.app._ulCache && window.app._ulCache.img.complete) })')
    check('Underlay: choosing a picture loads it 40 ft wide with the right shape and draws it', bool(u) and abs(u['w'] - 480) < 1e-6 and abs(u['h'] - 320) < 1e-6 and u['okUrl'] and u['drawn'], str(u))
    page.click('#ulClose')
    # set the scale with the command line prompts: two clicks 100 in apart, real distance 12 ft (=144 in) -> factor 1.44
    ev('() => { const a = window.app; a.setGridSnap(false); a.canvasEngine.scale = 2; a.canvasEngine.offsetX = 300; a.canvasEngine.offsetY = 300; a.requestRender(); }')
    page.keyboard.press('/'); page.keyboard.type('underlay scale'); page.keyboard.press('Enter'); page.wait_for_timeout(150)
    prompt1 = ev("document.getElementById('cmdPrompt').textContent")
    px1, py1 = scr(0, 0); px2, py2 = scr(100, 0)
    before = ev('window.app.underlay.width')
    page.mouse.click(px1, py1); page.wait_for_timeout(100); page.mouse.click(px2, py2); page.wait_for_timeout(100)
    prompt2 = ev("document.getElementById('cmdPrompt').textContent")
    page.keyboard.press('/'); page.keyboard.type("12'"); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    after = ev('({ w: window.app.underlay.width, h: window.app.underlay.height })')
    check('Underlay scale: click two points, type 12\' -> the picture scales by exactly 144/100',
          'first point' in prompt1 and 'real distance' in prompt2 and abs(after['w'] - before * 1.44) < 1e-6 and abs(after['h'] - 320 * 1.44) < 1e-6, f'{prompt1} | {prompt2} | {before} -> {after}')
    # saved with the project, restored after a reload, and not part of exports
    page.wait_for_timeout(900)
    saved = ev("(() => { const s = JSON.parse(localStorage.getItem('houseplanner_autosave') || '{}'); return !!(s.underlay && s.underlay.dataUrl); })()")
    page.goto(BASE + '/index.html'); page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000); page.wait_for_timeout(400)
    again = ev('window.app.underlay && ({ w: window.app.underlay.width })')
    svg = ev('''() => new Promise(r => { let text = null; const orig = window.Exporter.triggerDownload; window.Exporter.triggerDownload = (b) => { b.text().then(t => { text = t; }); };
        window.Exporter.exportSVG(window.app, 'x.svg'); window.Exporter.triggerDownload = orig; setTimeout(() => r(text), 250); })''')
    check('Underlay is autosaved with the project, restored on reload, and kept out of the SVG export',
          saved and bool(again) and abs(again['w'] - after['w']) < 1e-6 and 'data:image' not in (svg or ''), f'{saved} {again}')
    # undo/lock/hide/remove through the commands
    page.keyboard.press('/'); page.keyboard.type('underlay hide'); page.keyboard.press('Enter'); hid = ev('window.app.underlay.visible')
    page.keyboard.press('/'); page.keyboard.type('underlay show'); page.keyboard.press('Enter'); page.keyboard.press('/'); page.keyboard.type('underlay lock'); page.keyboard.press('Enter')
    locked = ev('window.app.underlay.locked')
    page.keyboard.press('/'); page.keyboard.type('underlay remove'); page.keyboard.press('Enter'); gone = ev('window.app.underlay')
    page.click('#undoBtn'); page.wait_for_timeout(200); back = ev('!!window.app.underlay')
    check('UNDERLAY HIDE / SHOW / LOCK / REMOVE work from the command line, and undo brings the picture back',
          hid is False and locked is True and gone is None and back is True, f'{hid} {locked} {gone} {back}')
    # unsafe or damaged pictures in a project file are refused with a warning, the rest of the file still loads
    bad = ev('''() => { const a = window.app; const st = JSON.parse(JSON.stringify(a.undoStack[a.undoStack.length - 1]));
        const out = {}; for (const [k, u] of Object.entries({ js: { dataUrl: 'javascript:alert(1)', x: 0, y: 0, width: 5, height: 5 }, svg: { dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', x: 0, y: 0, width: 5, height: 5 },
            nan: { dataUrl: a.underlay ? a.underlay.dataUrl : 'x', x: 'a', y: 0, width: 5, height: 5 } })) { st.underlay = u; const w = a.restoreState(JSON.parse(JSON.stringify(st))); out[k] = { under: a.underlay, warned: w.some(m => /background picture/.test(m)), walls: a.wallManager.walls.length > 0 }; }
        return out; }''')
    check('hostile / damaged underlay data is dropped with a warning while the drawing still loads',
          all(v['under'] is None and v['warned'] and v['walls'] for v in bad.values()), str(bad)[:300])

    # ======================= 33. SNAP + POLAR CONTROLS =======================
    page.goto(BASE + '/index.html'); ev('localStorage.clear()'); page.goto(BASE + '/index.html?sample=30x40_2bhk')
    page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000); page.wait_for_timeout(300)
    page.click('#polarBtn'); lab_on = ev("document.querySelector('#polarBtn .btn-text').textContent"); on = ev('window.app.canvasEngine.polarMode')
    page.click('#osnapBtn'); page.wait_for_timeout(150)
    page.uncheck('#snapPopover input[data-snap="intersection"]'); page.check('#snapPopover input[data-snap="nearest"]')
    page.select_option('#snapPopover select[data-snap="polarStep"]', '30'); page.wait_for_timeout(150)
    modes = ev('({ i: window.app.canvasEngine.snapModes.intersection, n: window.app.canvasEngine.snapModes.nearest, step: window.app.canvasEngine.polarIncrement })')
    page.goto(BASE + '/index.html'); page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000); page.wait_for_timeout(300)
    kept = ev('({ i: window.app.canvasEngine.snapModes.intersection, n: window.app.canvasEngine.snapModes.nearest, step: window.app.canvasEngine.polarIncrement, polar: window.app.canvasEngine.polarMode, label: document.querySelector("#polarBtn .btn-text").textContent })')
    check('Polar button and Snaps popover change the engine, and the choices are remembered after a reload',
          on and lab_on == 'Polar: 45\u00b0' and modes['i'] is False and modes['n'] is True and modes['step'] == 30
          and kept['i'] is False and kept['n'] is True and kept['step'] == 30 and kept['polar'] is True and kept['label'] == 'Polar: 30\u00b0', f'{lab_on} {modes} {kept}')
    # real snapping through the app: two crossing walls give an intersection snap; a lone wall gives a perpendicular one
    res = ev('''() => { const a = window.app; a.clearAll(); const ce = a.canvasEngine; ce.snapModes = { endpoint: true, midpoint: true, intersection: true, perpendicular: true, nearest: false, grid: true };
        ce.snapToGrid = false; ce.snapToPoints = true; ce.polarMode = false; ce.scale = 2;
        a.wallManager.addWall({ x: 0, y: 0 }, { x: 400, y: 400 }); a.wallManager.addWall({ x: 0, y: 300 }, { x: 400, y: 0 });
        const i = ce.getSnapPoint(174, 169, a.getAllSnapTargets(), null, false);
        const typeI = ce.activeSnap && ce.activeSnap.type;
        a.clearAll(); a.wallManager.addWall({ x: 0, y: 0 }, { x: 400, y: 0 });
        const p = ce.getSnapPoint(152, 5, a.getAllSnapTargets(), { x: 150, y: 200 }, false);
        return { i, typeI, p, typeP: ce.activeSnap && ce.activeSnap.type }; }''')
    check('through the real app: intersection and perpendicular snaps are found',
          res['typeI'] == 'intersection' and abs(res['i']['x'] - 300 / 1.75) < 1e-6 and abs(res['i']['y'] - 300 / 1.75) < 1e-6
          and res['typeP'] == 'perpendicular' and abs(res['p']['x'] - 150) < 1e-6 and abs(res['p']['y']) < 1e-6, str(res))

    # ======================= 34. MEASURE, ZOOM WINDOW/PREVIOUS, WALL EDITING (real clicks + typing) =======================
    page.goto(BASE + '/index.html'); ev('localStorage.clear()')
    page.goto(BASE + '/index.html?sample=30x40_2bhk')
    page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000)
    ev("() => { const a = window.app; a.clearAll(); a.saveHistory(); a.setGridSnap(false); a.canvasEngine.scale = 2; a.canvasEngine.offsetX = 300; a.canvasEngine.offsetY = 300; a.requestRender(); }")
    page.wait_for_timeout(300)
    def answer(text):                                   # a prompt is waiting and the box already has the keyboard: just type the answer
        page.fill('#cmdInput', text); page.keyboard.press('Enter'); page.wait_for_timeout(100)
    def reset_cmd():
        ev("() => { window.app.commandLine.cancel(false); document.getElementById('cmdInput').blur(); }")
    def click_at(wx, wy):
        x, y = scr(wx, wy); page.mouse.click(x, y); page.wait_for_timeout(90)
    def last_log():
        return ev("(() => { const l = [...document.querySelectorAll('#cmdLog .cmd-line')]; return l.length ? [l[l.length-1].className.replace('cmd-line cmd-',''), l[l.length-1].textContent] : null; })()")
    say('dist'); click_at(0, 0); click_at(144, -144)
    check('DIST: two clicks report the distance, direction and offsets', 'Distance 16\' - 11.6"' in (last_log() or ['', ''])[1] and 'angle 45' in last_log()[1], str(last_log()))
    say('area'); [click_at(x, y) for x, y in ((0, 0), (144, 0), (144, 144), (0, 144))]; page.keyboard.press('/'); page.keyboard.press('Enter'); page.wait_for_timeout(120)
    check('AREA: four clicks then Enter gives 144 sq ft and a 48 ft perimeter', 'Area 144.0 Sq. Ft.' in last_log()[1] and "perimeter 48'" in last_log()[1], str(last_log()))
    say('angle'); click_at(0, 0); click_at(100, 0); click_at(100, -100)
    check('ANGLE: vertex then two sides gives 45 degrees', 'Angle 45' in last_log()[1], str(last_log()))
    s0 = ev('window.app.canvasEngine.scale')
    say('zoom w'); click_at(0, 0); click_at(200, 120); s1 = ev('window.app.canvasEngine.scale')
    say('zoom p'); s2 = ev('window.app.canvasEngine.scale')
    page.mouse.move(*scr(50, 50)); page.mouse.wheel(0, -400); page.wait_for_timeout(200); s3 = ev('window.app.canvasEngine.scale')
    say('zoom p'); s4 = ev('window.app.canvasEngine.scale')
    check('ZOOM WINDOW zooms in, ZOOM PREVIOUS comes back (also after a mouse-wheel zoom)', s1 > s0 * 1.5 and abs(s2 - s0) < 1e-9 and s3 > s0 and abs(s4 - s0) < 1e-9, f'{s0} {s1} {s2} {s3} {s4}')

    ev("() => { const a = window.app; a.clearAll(); a.saveHistory(); a.wallManager.addWall({x:0,y:0},{x:200,y:0}); a.wallManager.addWall({x:120,y:-50},{x:120,y:60}); a.saveHistory(); }")
    say('trim'); click_at(120, 40); click_at(190, 0); page.keyboard.press('/'); page.keyboard.press('Enter'); page.wait_for_timeout(120); reset_cmd()
    w = ev('window.app.wallManager.walls.map(w => [w.start.x, w.start.y, w.end.x, w.end.y])')
    check('TRIM: click the cutting wall, then the part to remove', w[0] == [0, 0, 120, 0], str(w))
    page.click('#undoBtn'); page.wait_for_timeout(150); check('one undo restores the trimmed wall', ev('window.app.wallManager.walls[0].end.x') == 200, '')
    say('offset'); answer("2'")
    click_at(30, 0); click_at(30, 60); page.keyboard.press('/'); page.keyboard.press('Enter'); page.wait_for_timeout(120); reset_cmd()
    w = ev('window.app.wallManager.walls.map(w => [w.start.x, w.start.y, w.end.x, w.end.y])')
    check("OFFSET: type 2', click a wall, click the side -> a parallel wall 24 in away", len(w) == 3 and w[2] == [0, 24, 200, 24], str(w))
    ev("() => { const a = window.app; a.clearAll(); a.saveHistory(); a.wallManager.addWall({x:0,y:0},{x:90,y:0}); a.wallManager.addWall({x:110,y:100},{x:110,y:20}); a.saveHistory(); }")
    reset_cmd(); say('fillet'); click_at(40, 0); click_at(110, 60); reset_cmd()
    w = ev('window.app.wallManager.walls.map(w => [w.start.x, w.start.y, w.end.x, w.end.y].map(v => Math.round(v * 1e6) / 1e6))')
    check('FILLET: two clicks join the walls in a sharp corner', w[0][2] == 110 and w[0][3] == 0 and w[1][2] == 110 and w[1][3] == 0, str(w))
    reset_cmd(); say('chamfer'); answer('20"'); answer('20"')
    click_at(40, 0); click_at(110, 60); reset_cmd()
    n = ev('window.app.wallManager.walls.length'); w = ev('window.app.wallManager.walls.map(w => [w.start.x, w.start.y, w.end.x, w.end.y].map(v => Math.round(v * 1e6) / 1e6))')
    check('CHAMFER: typed distances, two clicks, a short new wall cuts the corner', n == 3 and w[0][2] == 90 and w[2][0] == 90 and w[2][3] == 20, str(w))

    # ---------- 35. FLOOR FINISH (hatch)
    ev("() => { const a = window.app; a.clearAll(); a.saveHistory(); const r = a.roomManager.addRoom(120, 120, { name: 'Hall', width: 200, height: 200 }); a.setSelection([{ category: 'room', obj: r }]); a.requestRender(); }")
    page.wait_for_timeout(200)
    def region_sum(wx, wy, ww, wh):
        return ev("([x, y, w, h]) => { const a = window.app; const p = a.canvasEngine.worldToScreen(x, y), q = a.canvasEngine.worldToScreen(x + w, y + h); const dpr = window.devicePixelRatio || 1; const cv = document.getElementById('cadCanvas'); const d = cv.getContext('2d').getImageData(Math.round(p.x * dpr), Math.round(p.y * dpr), Math.round((q.x - p.x) * dpr), Math.round((q.y - p.y) * dpr)).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s; }", [wx, wy, ww, wh])
    ev("window.app.clearSelection()"); page.wait_for_timeout(150); plain = region_sum(30, 30, 180, 180)
    ev("() => { const a = window.app; a.setSelection([{ category: 'room', obj: a.roomManager.rooms[0] }]); }"); page.wait_for_timeout(150)
    has_row = ev("!!document.getElementById('roomHatchSelect')")
    page.select_option('#roomHatchSelect', 'tiles'); page.wait_for_timeout(200)
    ev("window.app.clearSelection()"); page.wait_for_timeout(150); tiled = region_sum(30, 30, 180, 180)
    check('Floor finish: the room panel has a finish list; choosing Square tiles changes what is drawn and sets the room',
          has_row and ev("window.app.roomManager.rooms[0].hatch") == 'tiles' and tiled != plain, f'{has_row} {plain} {tiled}')
    ev("() => { const a = window.app; a.setSelection([{ category: 'room', obj: a.roomManager.rooms[0] }]); }")
    reset_cmd(); say('hatch wood 150'); r = ev('({ h: window.app.roomManager.rooms[0].hatch, s: window.app.roomManager.rooms[0].hatchScale })')
    page.click('#undoBtn'); page.wait_for_timeout(150); r2 = ev('window.app.roomManager.rooms[0].hatch')
    ev("() => { const a = window.app; a.setSelection([{ category: 'room', obj: a.roomManager.rooms[0] }]); }")      # undo clears the selection
    say('hatch none'); r3 = ev('window.app.roomManager.rooms[0].hatch')
    check('HATCH command sets the finish and size; undo goes back; HATCH NONE removes it', r['h'] == 'wood' and r['s'] == 1.5 and r2 == 'tiles' and r3 is None, f'{r} {r2} {r3}')

    # ======================= 36. ANNOTATION (text, leader, angular dimension, dimension styles) =======================
    ev("() => { const a = window.app; a.commandLine.cancel(false); a.clearAll(); a.saveHistory(); a.canvasEngine.scale = 2; a.canvasEngine.offsetX = 300; a.canvasEngine.offsetY = 300; a.requestRender(); }")
    page.wait_for_timeout(200); plain = region_sum(-20, -40, 200, 90)
    say('text Kitchen'); click_at(10, 10); reset_cmd()
    t = ev('window.app.annotationManager.texts.map(t => [t.text, t.x, t.y, t.height])')
    check('TEXT command: "text Kitchen" then one click places the note, and it is drawn', t == [['Kitchen', 10, 10, 9]] and region_sum(-20, -40, 200, 90) != plain, str(t))
    ev("window.app.clearSelection()"); page.keyboard.press('Escape'); page.click('.tool-btn[data-tool="select"]')
    click_at(30, 6); sel = ev('window.app.selectedCategory'); has_box = ev("!!document.getElementById('annText')")
    x0 = ev('window.app.annotationManager.texts[0].x'); sx, sy = scr(30, 6)
    page.mouse.move(sx, sy); page.mouse.down(); page.mouse.move(sx + 30, sy + 10, steps=4); page.mouse.move(sx + 60, sy + 20, steps=4); page.mouse.up(); page.wait_for_timeout(150)
    x1 = ev('window.app.annotationManager.texts[0].x')
    page.click('#undoBtn'); page.wait_for_timeout(150); x2 = ev('window.app.annotationManager.texts[0].x')
    check('a text note is picked with a click, shows its own panel, drags with the mouse, and undo moves it back', sel == 'text' and has_box and x1 > x0 + 15 and abs(x2 - x0) < 1e-6, f'{sel} {has_box} {x0} {x1} {x2}')
    ev("() => { const a = window.app; a.setSelection([{ category: 'text', obj: a.annotationManager.texts[0] }]); }")
    page.fill('#annText', 'Master Bedroom\nGround floor'); page.wait_for_timeout(120)
    page.fill('#annHeight', '6"'); page.keyboard.press('Tab'); page.wait_for_timeout(150)
    t = ev('window.app.annotationManager.texts[0]')
    check('editing the note in Properties changes its text (several lines) and height', t['text'] == 'Master Bedroom\nGround floor' and t['height'] == 6, str(t))
    ev("() => { const a = window.app; a.setSelection([{ category: 'text', obj: a.annotationManager.texts[0] }]); }")
    page.keyboard.press('Delete'); page.wait_for_timeout(120); gone = ev('window.app.annotationManager.texts.length'); page.click('#undoBtn'); page.wait_for_timeout(150)
    check('Delete removes a selected note and undo brings it back', gone == 0 and ev('window.app.annotationManager.texts.length') == 1, f'{gone}')
    say('leader Beam B1'); click_at(60, 60); click_at(120, 30); reset_cmd()
    say('dimangular'); click_at(0, 100); click_at(80, 100); click_at(80, 20); reset_cmd()
    ann = ev('({ leaders: window.app.annotationManager.leaders.map(l => l.text), angs: window.app.annotationManager.angdims.map(d => d.label()) })')
    check('LEADER and DIMANGULAR commands create a leader and a 45 degree dimension', ann['leaders'] == ['Beam B1'] and ann['angs'] == ['45\u00b0'], str(ann))
    ev("() => { const a = window.app; const d = a.dimensionManager.addDimension({ x: 0, y: 200 }, { x: 144, y: 200 }, 24); a.setSelection([{ category: 'dimension', obj: d }]); }")
    page.select_option('#dimStyleSelect', 'large'); page.wait_for_timeout(150)
    ds = ev('window.app.dimensionManager.dimensions[0].dimStyle')
    ev("() => { const a = window.app; a.setSelection([{ category: 'angdim', obj: a.annotationManager.angdims[0] }]); }")
    page.select_option('#annStyle', 'arrows'); page.wait_for_timeout(120); ds2 = ev('window.app.annotationManager.angdims[0].dimStyle')
    say('dimstyle small'); cur = ev('window.app.annotationManager.currentDimStyle')
    check('dimension styles: per-dimension list for linear and angular dimensions, and DIMSTYLE sets the style for new ones', ds == 'large' and ds2 == 'arrows' and cur == 'small', f'{ds} {ds2} {cur}')
    ev("window.app.annotationManager.currentDimStyle = 'standard'")
    page.wait_for_timeout(900)
    svg = ev('''() => new Promise(r => { let text = null; const orig = window.Exporter.triggerDownload; window.Exporter.triggerDownload = (b) => { b.text().then(t => { text = t; }); };
        window.Exporter.exportSVG(window.app, 'x.svg'); window.Exporter.triggerDownload = orig; setTimeout(() => r(text), 300); })''')
    dx = ev('''() => new Promise(r => { let text = null; const orig = window.Exporter.triggerDownload; window.Exporter.triggerDownload = (b) => { b.text().then(t => { text = t; }); };
        window.Exporter.exportDXF(window.app, 'x.dxf'); window.Exporter.triggerDownload = orig; setTimeout(() => r(text), 300); })''')
    check('annotation is in the SVG and in the DXF (TEXT entities on the ANNOTATION layer)', 'Master Bedroom' in svg and 'Beam B1' in svg and '8\nANNOTATION\n' in dx and 'Beam B1' in dx and '90' not in 'x', f'{len(svg or "")} {len(dx or "")}')
    page.goto(BASE + '/index.html'); page.wait_for_function('window.app', timeout=8000); page.wait_for_timeout(500)
    back = ev('({ t: window.app.annotationManager.texts.length, l: window.app.annotationManager.leaders.length, a: window.app.annotationManager.angdims.length, st: window.app.annotationManager.angdims[0] && window.app.annotationManager.angdims[0].dimStyle, lab: window.app.annotationManager.angdims[0] && window.app.annotationManager.angdims[0].label() })')
    check('annotation survives autosave and a page reload (including the angular label method and the style DIMSTYLE applied)', back['t'] == 1 and back['l'] == 1 and back['a'] == 1 and back['st'] == 'small' and back['lab'] == '45\u00b0', str(back))
    ev("() => { window.app.layerManager.setVisible('annotation', false); }")
    hid = ev('({ pick: !!window.app.annotationManager.getTextAt(10, 10, 2), n: window.app.pickItemAt({ x: 10, y: 10 }) })'); ev("() => { window.app.layerManager.setVisible('annotation', true); }")
    check('the Annotation layer can be hidden: its notes cannot be picked', hid['pick'] is False and hid['n'] is None, str(hid))

    # ======================= 37. BLOCKS =======================
    page.goto(BASE + '/index.html'); ev('localStorage.clear()'); page.goto(BASE + '/index.html?sample=30x40_2bhk')
    page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000); page.wait_for_timeout(300)
    ev("() => { const a = window.app; a.clearAll(); a.saveHistory(); a.setGridSnap(false); a.canvasEngine.scale = 2; a.canvasEngine.offsetX = 300; a.canvasEngine.offsetY = 300;"
       " const w1 = a.wallManager.addWall({x:0,y:0},{x:100,y:0},4.5,'interior'); a.wallManager.addWall({x:100,y:0},{x:100,y:60},4.5,'interior'); a.openingManager.addOpening(w1.id, 0.3, { type: 'door', width: 30 });"
       " a.roomManager.addRoom(50, 30, { name: 'WC', width: 100, height: 60 }); a.saveHistory(); a.requestRender(); }")
    say('all'); say('block Bath set'); answer(''); reset_cmd()
    saved_names = ev('Object.keys(window.app.blocks)'); n_before = ev('window.app.wallManager.walls.length')
    say('insert Bath set'); answer(''); click_at(300, 20); click_at(300, 90); page.keyboard.press('/'); page.keyboard.press('Enter'); page.wait_for_timeout(150); reset_cmd()
    n_after = ev('window.app.wallManager.walls.length'); doors = ev('window.app.openingManager.openings.length')
    check('BLOCK saves the selection (with its door); INSERT places two independent copies', saved_names == ['Bath set'] and n_before == 2 and n_after == 6 and doors == 3, f'{saved_names} {n_before} {n_after} {doors}')
    page.click('#toolsBtn'); page.wait_for_timeout(120)
    page.click('.tools-item:has-text("Blocks")'); page.wait_for_timeout(250)
    row = ev("document.querySelector('#blocksCard tr[data-name]') ? document.querySelector('#blocksCard tr[data-name]').innerText : null")
    page.click('#bkClose'); page.wait_for_timeout(100)
    check('the Blocks dialog (Tools menu) lists the block with its object count', row is not None and 'Bath set' in row and '4 objects' in row, str(row))
    page.wait_for_timeout(900); page.goto(BASE + '/index.html'); page.wait_for_function('window.app', timeout=8000); page.wait_for_timeout(400)
    kept = ev('Object.keys(window.app.blocks)')
    ev("() => { const a = window.app; a.clearAll(); a.blocks = {}; a.saveHistory(); }")
    lib = ev("!!window.app.findBlock('bath SET')")
    ev("window.app.insertBlockByName('Bath set', { x: 10, y: 10 }, 0)")
    check('blocks survive a reload (in the project) and live on in the shared library for other drawings', kept == ['Bath set'] and lib and ev('window.app.wallManager.walls.length') == 2, f'{kept} {lib}')

    # ======================= 38. DXF IMPORT =======================
    def dxf_rec(t, *gv): return f"0\n{t}\n" + "".join(f"{c}\n{v}\n" for c, v in gv)
    sample_dxf = ("0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n"
                  + dxf_rec('LWPOLYLINE', (8, 'WALLS'), (90, 4), (70, 1), (10, 0), (20, 0), (10, 6000), (20, 0), (10, 6000), (20, 4000), (10, 0), (20, 4000))
                  + dxf_rec('LINE', (8, 'WALLS'), (10, 3000), (20, 0), (11, 3000), (21, 4000))
                  + dxf_rec('TEXT', (8, 'T'), (10, 500), (20, 500), (40, 250), (1, 'LIVING'), (50, 0)) + "0\nENDSEC\n0\nEOF\n")
    open('/tmp/test_in.dxf', 'w').write(sample_dxf); open('/tmp/test_bin.dxf', 'wb').write(b'AutoCAD Binary DXF\r\n\x1a\x00' + b'\x00' * 40)
    page.goto(BASE + '/index.html'); ev('localStorage.clear()'); page.goto(BASE + '/index.html?sample=30x40_2bhk')
    page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000); page.wait_for_timeout(300)
    ev("() => { const a = window.app; a.clearAll(); a.saveHistory(); a.canvasEngine.scale = 1; a.canvasEngine.offsetX = 200; a.canvasEngine.offsetY = 200; a.requestRender(); }")
    with page.expect_file_chooser() as fc: say('importdxf')
    fc.value.set_files('/tmp/test_in.dxf'); page.wait_for_selector('#dxfModal', state='visible', timeout=5000); page.wait_for_timeout(200)
    size_txt = ev("document.getElementById('dxfSize').innerText"); go_enabled = ev("!document.getElementById('dxfGo').disabled")
    page.click('#dxfGo'); page.wait_for_timeout(400)
    ref = ev('window.app.refGeometry && ({ n: window.app.refGeometry.segments.length, vis: window.app.refGeometry.visible })'); notes = ev('window.app.annotationManager.texts.map(t => t.text)')
    check('DXF import: the dialog reads the file units (mm), shows the size, and imports lines as reference lines plus the text note',
          "19' - 8" in size_txt and "13' - 1" in size_txt and go_enabled and ref and ref['n'] == 5 and notes == ['LIVING'], f'{size_txt} {ref} {notes}')
    page.wait_for_timeout(900)
    page.goto(BASE + '/index.html'); page.wait_for_function('window.app', timeout=8000); page.wait_for_timeout(500)
    again = ev('window.app.refGeometry && window.app.refGeometry.segments.length')
    ev("window.app.canvasEngine.scale = 1; window.app.canvasEngine.offsetX = 200; window.app.canvasEngine.offsetY = 200")
    say('reference hide'); hidden = ev('window.app.refGeometry.visible'); say('reference show'); shown = ev('window.app.refGeometry.visible')
    page.click('#undoBtn'); page.wait_for_timeout(120); undone = ev('window.app.refGeometry.visible')
    say('reference remove'); removed = ev('window.app.refGeometry')
    check('reference lines are saved with the project, can be hidden/shown/removed from the command line, and undo works', again == 5 and hidden is False and shown is True and undone is False and removed is None, f'{again} {hidden} {shown} {undone} {removed}')
    ev("() => { const a = window.app; a.clearAll(); a.saveHistory(); }")
    with page.expect_file_chooser() as fc: say('importdxf')
    fc.value.set_files('/tmp/test_in.dxf'); page.wait_for_selector('#dxfModal', state='visible', timeout=5000)
    page.check('input[name=dxfMode][value=walls]'); page.select_option('#dxfThick', '9'); page.click('#dxfGo'); page.wait_for_timeout(400)
    check('DXF import as walls: every line becomes a wall of the chosen thickness', ev('window.app.wallManager.walls.length') == 5 and ev('window.app.wallManager.walls[0].thickness') == 9 and ev('window.app.refGeometry') is None, str(ev('window.app.wallManager.walls.length')))
    ev("() => { const a = window.app; a.clearAll(); a.saveHistory(); }")
    with page.expect_file_chooser() as fc: say('importdxf')
    fc.value.set_files('/tmp/test_bin.dxf'); page.wait_for_timeout(500)
    check('a binary DXF is refused with a message and no dialog opens', ev("getComputedStyle(document.getElementById('dxfModal')).display") != 'flex' and ev('window.app.refGeometry') is None, '')
    # ROUND TRIP through this app's own DXF export
    ev("() => { const a = window.app; a.clearAll(); a.saveHistory(); a.wallManager.addWall({x:100,y:200},{x:400,y:200},9,'exterior'); a.wallManager.addWall({x:400,y:200},{x:400,y:500},9,'exterior'); a.roomManager.addRoom(250,350,{ name: 'Hall', width: 200, height: 200 }); a.saveHistory(); }")
    rt = ev('''() => new Promise(r => { let text = null; const orig = window.Exporter.triggerDownload; window.Exporter.triggerDownload = (b) => { b.text().then(t => { text = t; }); };
        window.Exporter.exportDXF(window.app, 'x.dxf'); window.Exporter.triggerDownload = orig; setTimeout(() => r(text), 300); })''')
    open('/tmp/rt.dxf', 'w').write(rt); n_lines = rt.count('\n0\nLINE\n')
    ev("() => { const a = window.app; a.clearAll(); a.saveHistory(); }")
    with page.expect_file_chooser() as fc: say('importdxf')
    fc.value.set_files('/tmp/rt.dxf'); page.wait_for_selector('#dxfModal', state='visible', timeout=5000); page.wait_for_timeout(200)
    disabled_first = ev("document.getElementById('dxfGo').disabled")                      # this file does not say its units: the user must choose
    page.select_option('#dxfUnits', '1'); page.uncheck('#dxfRecenter'); page.click('#dxfGo'); page.wait_for_timeout(400)
    segs = ev('window.app.refGeometry.segments'); hall = ev("window.app.annotationManager.texts.map(t => [t.text, Math.round(t.x)])")
    has_wall = any(abs(a - 100) < 0.02 and abs(b - 200) < 0.02 and abs(c - 400) < 0.02 and abs(d - 200) < 0.02 for a, b, c, d in segs) or any(abs(c - 100) < 0.02 and abs(d - 200) < 0.02 and abs(a - 400) < 0.02 and abs(b - 200) < 0.02 for a, b, c, d in segs)
    check('ROUND TRIP: export this app\'s DXF, import it back: same coordinates, and the dialog asks for units when the file has none',
          disabled_first and has_wall and 0.8 * n_lines <= len(segs) <= n_lines and ['HALL', 250] in hall, f'{disabled_first} {has_wall} {len(segs)}/{n_lines} {hall}')

    # ======================= 39. PRINT AT SCALE: the scale is measured on real pixels =======================
    ev("() => { const a = window.app; a.clearAll(); a.saveHistory(); a.wallManager.addWall({x:0,y:100},{x:240,y:100},9,'exterior'); a.requestRender(); }")
    page.click('#toolsBtn'); page.click('.tools-item:has-text("Print at scale")'); page.wait_for_selector('#sheetModal', state='visible'); page.wait_for_timeout(500)
    prev = ev("({ w: document.getElementById('shPreview').width, h: document.getElementById('shPreview').height, note: document.getElementById('shNote').innerText })")
    check('Print dialog: A3 landscape preview at 60 dpi, and it says what size the drawing is on paper', abs(prev['w'] - 992) <= 1 and abs(prev['h'] - 701) <= 1 and 'at 1:100' in prev['note'], str(prev))
    MEASURE = '''(blobUrlScale) => new Promise(r => { let blob = null; const orig = window.Exporter.triggerDownload; const t0 = Date.now();
        window.Exporter.triggerDownload = (b) => { blob = b; };
        window.app.sheetOpts.scale = blobUrlScale; window.app.exportSheet('png');
        const wait = () => { if (!blob) { if (Date.now() - t0 > 20000) { window.Exporter.triggerDownload = orig; return r({ error: 'no file was produced' }); } return setTimeout(wait, 50); } window.Exporter.triggerDownload = orig;
            createImageBitmap(blob).then(bmp => { const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
                const W = bmp.width, H = bmp.height, d = g.getImageData(0, 0, W, H).data; const mmpx = (v) => Math.round(v / 25.4 * 200); const X0 = mmpx(12), X1 = W - mmpx(12), Y0 = mmpx(12), Y1 = H - mmpx(10 + 28 + 2);   /* look only inside the frame, above the title strip */ const dark = (x, y) => { const i = (y * W + x) * 4; return d[i] < 90 && d[i + 1] < 100 && d[i + 2] < 120; };
                let best = 0, bestRow = 0, bestX = 0; for (let y = Y0; y < Y1; y++) { let run = 0, start = 0; for (let x = X0; x < X1; x++) { if (dark(x, y)) { if (!run) start = x; run++; if (run > best) { best = run; bestRow = y; bestX = start + (run >> 2);   /* a quarter along: the middle holds the length label */ } } else run = 0; } }
                let up = 0, down = 0; while (bestRow - up - 1 >= Y0 && dark(bestX, bestRow - up - 1)) up++; while (bestRow + down + 1 < Y1 && dark(bestX, bestRow + down + 1)) down++;
                r({ W, H, longestRun: best, thickness: up + down + 1 }); }); }; wait(); })'''
    m100 = ev(MEASURE, 100); m50 = ev(MEASURE, 50)
    m100 = m100 if isinstance(m100, dict) else {}; m50 = m50 if isinstance(m50, dict) else {}
    check('1:100 at 200 dpi: a 240 in wall is 480 px long and 9 in thick is about 18 px; the page is exactly A3 (3307 x 2339 px)',
          m100.get('W') == 3307 and m100.get('H') == 2339 and abs((m100.get('longestRun') or 0) - 480) <= 4 and 15 <= (m100.get('thickness') or 0) <= 22, str(m100))
    check('1:50 doubles everything: 960 px long, about 36 px thick', abs((m50.get('longestRun') or 0) - 960) <= 5 and 32 <= (m50.get('thickness') or 0) <= 41, str(m50))
    pdf_info = ev('''() => new Promise(r => { let pdf = null; const orig = URL.createObjectURL; URL.createObjectURL = (b) => { if (b && b.type === 'application/pdf') pdf = b; return orig.call(URL, b); };
        window.app.sheetOpts.scale = 100; document.getElementById('shPdf').click();
        const wait = (n) => { if (pdf || n > 100) { URL.createObjectURL = orig; if (!pdf) return r(null); pdf.arrayBuffer().then(buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); const m = /MediaBox \\[0 0 ([\\d.]+) ([\\d.]+)\\]/.exec(s); r({ w: Number(m[1]), h: Number(m[2]), bytes: b.length }); }); } else setTimeout(() => wait(n + 1), 100); }; wait(0); })''')
    check('the PDF page is exactly A3 landscape (1190.55 x 841.89 pt)', pdf_info and abs(pdf_info['w'] - 1190.55) < 0.02 and abs(pdf_info['h'] - 841.89) < 0.02, str(pdf_info))
    page.select_option('#shScale', '10'); page.wait_for_timeout(250)
    note = ev("document.getElementById('shNote').innerText"); disabled = ev("document.getElementById('shPdf').disabled")
    page.click('#shSuggest'); page.wait_for_timeout(300); ok_now = ev("!document.getElementById('shPdf').disabled")
    check('a scale that is too big for the paper is refused with a reason, and the suggested scale fixes it', 'does not fit' in note and disabled and ok_now, f'{note[:90]} {disabled} {ok_now}')
    page.click('#shClose')

    # ======================= 40. TOOLS MENU + TOOLBAR REACH =======================
    page.click('#toolsBtn'); page.wait_for_timeout(120)
    menu_shown = ev("getComputedStyle(document.getElementById('toolsMenu')).display"); page.click('.tools-item:has-text("Distance")'); page.wait_for_timeout(150)
    prompt_txt = ev("document.getElementById('cmdPrompt').textContent"); reset_cmd()
    check('the Tools menu opens and its items run the same commands (Distance asks for the first point)', menu_shown == 'block' and 'DIST' in prompt_txt, f'{menu_shown} {prompt_txt}')
    off = ev('''() => { const vw = document.documentElement.clientWidth; const ids = ['undoBtn', 'zoomFitBtn', 'samplePlansSelect', 'saveJsonBtn', 'loadJsonBtn', 'exportPngBtn', 'exportPdfBtn', 'exportSvgBtn', 'exportDxfBtn', 'clearAllBtn',
        'toolsBtn', 'layersBtn', 'schedulesBtn', 'underlayBtn', 'cornerStyleBtn', 'polarBtn', 'osnapBtn'];
        return ids.filter(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.right > vw + 1 || r.left < -1 || r.width === 0; }); }''')
    check('every toolbar button is on screen at 1400 px wide (including the new Tools button)', off == [], str(off))

    # ---------- 41. autosave keeps projects that contain ONLY annotation, a traced picture or reference lines
    res = ev('''() => { const a = window.app; const out = {}; const has = () => !!localStorage.getItem('houseplanner_autosave');
        a.clearAll(); a.saveHistory(); a.saveToLocalStorage(); out.empty = has();
        a.annotationManager.addText(10, 10, { text: 'only a note' }); a.saveToLocalStorage(); out.text = has(); a.clearAll(); a.saveToLocalStorage();
        a.annotationManager.addLeader([{ x: 0, y: 0 }, { x: 30, y: 10 }], { text: 'L' }); a.saveToLocalStorage(); out.leader = has(); a.clearAll(); a.saveToLocalStorage();
        a.annotationManager.addAngularDim({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 5 }); a.saveToLocalStorage(); out.ang = has(); a.clearAll(); a.saveToLocalStorage();
        a.refGeometry = { name: 'x', visible: true, segments: [[0, 0, 10, 10]] }; a.saveToLocalStorage(); out.ref = has(); a.refGeometry = null; a.saveToLocalStorage();
        a.underlay = { name: 'u', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', x: 0, y: 0, width: 10, height: 10, opacity: 0.5, visible: true, locked: false }; a.saveToLocalStorage(); out.underlay = has(); a.underlay = null; a.saveToLocalStorage(); out.after = has();
        return out; }''')
    check('autosave keeps projects made only of notes, leaders, angular dimensions, reference lines or a traced picture (and still skips an empty one)',
          res['empty'] is False and res['text'] and res['leader'] and res['ang'] and res['ref'] and res['underlay'] and res['after'] is False, str(res))

    # ---------- 42. the Properties overview describes the plan that was just loaded (it showed zeros in the original)
    page.goto(BASE + '/index.html'); ev('localStorage.clear()'); page.goto(BASE + '/index.html?sample=30x40_2bhk')
    page.wait_for_function('window.app && window.app.wallManager.walls.length > 0', timeout=8000); page.wait_for_timeout(400)
    ov = ev("document.getElementById('inspectorBody').innerText.replace(/\\s+/g, ' ')")
    check('the Properties overview shows the loaded plan (14 walls, not zero)', 'Total Walls 14' in ov and 'Plot Area 0 Sq Ft' not in ov, ov[:160])

    # ---------- 43. text on a sheet has the same PHYSICAL size at any resolution (the 60 dpi preview must match the 200 dpi print)
    ev("() => { const a = window.app; a.clearAll(); a.saveHistory(); a.wallManager.addWall({x:0,y:0},{x:240,y:0},9,'exterior'); a.wallManager.addWall({x:240,y:0},{x:240,y:120},9,'exterior'); a.dimensionManager.addDimension({x:0,y:0},{x:240,y:0},-30); a.requestRender(); }")
    ev("window.app.openSheetPanel()"); page.wait_for_timeout(600)
    fonts = ev('''() => new Promise(r => { const d = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font'); let sizes = [];
        Object.defineProperty(CanvasRenderingContext2D.prototype, 'font', { configurable: true, get: d.get, set(v) { const m = /(\\d+(\\.\\d+)?)px/.exec(v); if (m) sizes.push(Math.round(parseFloat(m[1]) * 100) / 100); d.set.call(this, v); } });
        window.app.refreshSheetPreview(); const at60 = [...new Set(sizes)]; sizes = [];
        const orig = window.Exporter.triggerDownload; window.Exporter.triggerDownload = () => {}; window.app.exportSheet('png'); window.Exporter.triggerDownload = orig;
        const at200 = [...new Set(sizes)]; Object.defineProperty(CanvasRenderingContext2D.prototype, 'font', d); r({ at60, at200 }); })''')
    # the dimension figures are 22 px at 200 dpi on a 1:100 sheet = 11 drawing inches; the preview must use the same 11 (not 22 / 0.6 = 37)
    check('sheet text keeps its physical size: dimension figures are the same 11 drawing inches in the 60 dpi preview and the 200 dpi print',
          11 in fonts['at60'] and 11 in fonts['at200'] and max(fonts['at60']) < 20, str(fonts))
    ev("window.app.closeSheetPanel()")

    check('no uncaught page errors during the whole run', not errors, '; '.join(errors)[:300])
    b.close()

w = max(len(n) for n,_,_ in results)
passed = sum(1 for _,ok,_ in results if ok)
for n, ok, d in results:
    print(('PASS' if ok else 'FAIL'), n.ljust(w), '' if ok else '  -> ' + d[:160])
print(f'\n{passed}/{len(results)} passed')
