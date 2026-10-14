/**
 * tools_menu.js - one "Tools" menu that gathers the commands added after the first batch, so they can be used
 * without typing. Every entry just runs a command (the same text you could type in the command line).
 * Mixed into HousePlannerApp, so `this` is the app.
 */

const GROUPS = [
    ['Annotate', [['Text note', 'text'], ['Leader (arrow + note)', 'leader'], ['Angular dimension', 'dimangular'], ['Dimension style\u2026', 'dimstyle']]],
    ['Measure', [['Distance', 'dist'], ['Area', 'area'], ['Angle', 'angle']]],
    ['Edit walls', [['Offset (parallel copy)', 'offset'], ['Trim', 'trim'], ['Extend', 'extend'], ['Corner (join two walls)', 'fillet'], ['Chamfer (cut a corner)', 'chamfer']]],
    ['Floor finish (selected rooms)', [['Square tiles', 'hatch tiles'], ['Diagonal tiles', 'hatch diag'], ['Wood planks', 'hatch wood'], ['Concrete', 'hatch concrete'], ['Diagonal lines', 'hatch lines'], ['None', 'hatch none']]],
    ['View', [['Zoom window', 'zoom w'], ['Previous view', 'zoom p']]],
    ['Blocks, import, print', [['Blocks (symbols)\u2026', '@blocks'], ['Import a DXF\u2026', 'importdxf'], ['Print at scale\u2026', '@sheet']]]
];

export class ToolsMenuMethods {
    initToolsMenu() {
        document.getElementById('toolsBtn')?.addEventListener('click', (e) => { e.stopPropagation(); this.toggleToolsMenu(); });
        document.addEventListener('mousedown', (e) => {
            const m = document.getElementById('toolsMenu');
            if (m && m.style.display !== 'none' && !m.contains(e.target) && e.target.id !== 'toolsBtn' && !e.target.closest('#toolsBtn')) m.style.display = 'none';
        });
    }

    toggleToolsMenu() {
        let menu = document.getElementById('toolsMenu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'toolsMenu';
            menu.style.cssText = 'position:fixed; z-index:9000; display:none; width:270px; max-height:78vh; overflow:auto; padding:8px 6px; border-radius:8px; background:#0f172a; border:1px solid #334155; box-shadow:0 12px 30px rgba(0,0,0,.5); font-size:12px; color:#e2e8f0;';
            menu.innerHTML = GROUPS.map(([title, items]) => `
                <div style="color:#38bdf8; font-weight:600; padding:6px 8px 3px;">${title}</div>
                ${items.map(([label, cmd]) => `<button type="button" data-cmd="${cmd}" class="tools-item" style="display:block; width:100%; text-align:left; background:none; border:none; color:inherit; padding:5px 12px; border-radius:4px; cursor:pointer; font:inherit;">${label}</button>`).join('')}`).join('');
            menu.addEventListener('mouseover', (e) => { const b = e.target.closest('.tools-item'); if (b) b.style.background = '#1e293b'; });
            menu.addEventListener('mouseout', (e) => { const b = e.target.closest('.tools-item'); if (b) b.style.background = 'none'; });
            menu.addEventListener('click', (e) => {
                const b = e.target.closest('.tools-item');
                if (!b) return;
                menu.style.display = 'none';
                const cmd = b.dataset.cmd;
                if (cmd === '@blocks') this.openBlocksPanel();
                else if (cmd === '@sheet') this.openSheetPanel();
                else this.commandLine.submit(cmd);
                this.requestRender();
            });
            document.body.appendChild(menu);
        }
        if (menu.style.display !== 'none') { menu.style.display = 'none'; return; }
        const b = document.getElementById('toolsBtn').getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(window.innerWidth - 285, b.left)) + 'px';
        menu.style.top = (b.bottom + 6) + 'px';
        menu.style.display = 'block';
    }
}
