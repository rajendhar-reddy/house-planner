# Mouse/keyboard interaction check (select, delete, undo, door, furniture, drag, room, zoom).
# Usage:  python tests/interaction_check.py http://localhost:8080
import sys
from playwright.sync_api import sync_playwright
BASE = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width':1400,'height':900}); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:160])); pg.on('dialog', lambda d: d.accept())
    pg.goto(BASE+'/index.html'); pg.evaluate('localStorage.clear()')
    pg.goto(BASE+'/index.html?sample=30x40_2bhk'); pg.wait_for_function('window.app && window.app.wallManager.walls.length>0', timeout=10000)
    pg.wait_for_timeout(600)
    S = lambda: pg.evaluate('''() => { const a = window.app; return { walls: a.wallManager.walls.length, ops: a.openingManager.openings.length,
        furn: a.furnitureManager.items.length, rooms: a.roomManager.rooms.length, cols: a.columnManager.columns.length,
        sel: a.selectedCategory, tool: a.activeTool }; }''')
    # world->screen helper using the app's own transform
    def scr(wx, wy):
        r = pg.evaluate('([x,y]) => { const a = window.app.canvasEngine; const p = a.worldToScreen(x,y); const b = document.getElementById("cadCanvas").getBoundingClientRect(); return [p.x + b.left, p.y + b.top]; }', [wx, wy])
        return r
    out = {}
    out['start'] = S()
    w = pg.evaluate('(() => { const w = window.app.wallManager.walls.find(w => Math.abs(w.start.y - w.end.y) < 1 && Math.hypot(w.end.x-w.start.x, 0) > 90); return { mx: (w.start.x+w.end.x)/2, my: (w.start.y+w.end.y)/2, id: w.id }; })()')
    # 1. select a wall by clicking it
    pg.keyboard.press('v'); x, y = scr(w['mx'], w['my']); pg.mouse.click(x, y); pg.wait_for_timeout(200)
    out['after_click_select'] = S()['sel']
    # 2. inspector shows up for it
    out['inspector_has_content'] = pg.evaluate('document.getElementById("inspectorBody").innerText.length > 20')
    # 3. delete with the keyboard
    tot = lambda: (lambda d: d['walls']+d['ops']+d['furn']+d['rooms']+d['cols'])(S())
    t0 = tot(); pg.keyboard.press('Delete'); pg.wait_for_timeout(250); t1 = tot()
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(300); t2 = tot()
    out['delete_selected_then_undo'] = (t0, t1, t2)
    # 4. place a door on a wall
    w2 = pg.evaluate('(() => { const w = window.app.wallManager.walls.find(w => Math.abs(w.start.x - w.end.x) < 1 && Math.abs(w.end.y-w.start.y) > 120); return { x: w.start.x, y: (w.start.y+w.end.y)/2 + 20 }; })()')
    pg.keyboard.press('d'); x, y = scr(w2['x'], w2['y']); pg.mouse.move(x-3, y); pg.wait_for_timeout(80); pg.mouse.move(x, y); pg.wait_for_timeout(120); pg.mouse.click(x, y); pg.wait_for_timeout(250)
    out['ops_after_door'] = S()['ops']
    # 5. place furniture
    pg.keyboard.press('f'); x, y = scr(w['mx'], w['my'] + 60); pg.mouse.move(x, y); pg.wait_for_timeout(100); pg.mouse.click(x, y); pg.wait_for_timeout(250)
    out['furn_after_place'] = S()['furn']
    # 6. drag the placed fixture with the select tool
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    before = pg.evaluate('(() => { const i = window.app.furnitureManager.items; const it = i[i.length-1]; return [it.x, it.y]; })()')
    x, y = scr(*before); pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x+40, y+10, steps=6); pg.mouse.up(); pg.wait_for_timeout(250)
    after = pg.evaluate('(() => { const i = window.app.furnitureManager.items; const it = i[i.length-1]; return [it.x, it.y]; })()')
    out['dragged_fixture'] = (abs(after[0]-before[0]) > 5)
    # 7. room tool places a room; rotate key works on selection
    pg.click('.tool-btn[data-tool="room"]'); x, y = scr(w['mx'], w['my'] - 40); pg.mouse.click(x, y); pg.wait_for_timeout(250)
    out['rooms_after_room_tool'] = S()['rooms']
    # 8. zoom with wheel + fit button
    s0 = pg.evaluate('window.app.canvasEngine.scale'); pg.mouse.move(700, 400); pg.mouse.wheel(0, -300); pg.wait_for_timeout(200)
    s1 = pg.evaluate('window.app.canvasEngine.scale'); out['wheel_zoom_in'] = s1 > s0
    pg.click('#zoomFitBtn'); pg.wait_for_timeout(200)
    out['errors'] = errs
    b.close()
print(out)
