/**
 * dxf_import_panel.js - import a DXF drawing as reference lines (to trace over) or as walls, and draw those lines.
 * Mixed into HousePlannerApp, so `this` is the app. Reading and converting live in modules/dxf_import.js.
 */

import { units } from '../units.js';
import { escapeHtml } from '../util.js';
import { parseDXF, convertDXF, guessUnitScale, INSUNITS, LIMITS } from '../dxf_import.js';

const UNIT_CHOICES = [['', 'Use the file\'s own units'], ['1', 'Inches'], ['12', 'Feet'], ['0.0393700787', 'Millimetres'], ['0.393700787', 'Centimetres'], ['39.37007874', 'Metres']];

export class DxfImportMethods {
    // ------------------------------------------------------------------ drawing
    renderReference(ctx, scale) {
        const ref = this.refGeometry;
        if (!ref || !ref.visible) return;
        const cv = this.canvasElement.getBoundingClientRect();
        const a = this.canvasEngine.screenToWorld(0, 0), b = this.canvasEngine.screenToWorld(cv.width, cv.height);
        const x1 = Math.min(a.x, b.x) - 10, x2 = Math.max(a.x, b.x) + 10, y1 = Math.min(a.y, b.y) - 10, y2 = Math.max(a.y, b.y) + 10;
        ctx.save();
        ctx.strokeStyle = this.theme === 'clean' ? 'rgba(100, 116, 139, 0.7)' : 'rgba(148, 163, 184, 0.5)';
        ctx.lineWidth = 0.8 / scale;
        ctx.beginPath();
        for (const s of ref.segments) {                                  // only what can be seen is drawn
            if ((s[0] < x1 && s[2] < x1) || (s[0] > x2 && s[2] > x2) || (s[1] < y1 && s[3] < y1) || (s[1] > y2 && s[3] > y2)) continue;
            ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]);
        }
        ctx.stroke();
        ctx.restore();
    }

    /** Segments the snapping code may use (large imports are not snapped to, to keep the cursor smooth). */
    referenceSnapSegments() {
        const ref = this.refGeometry;
        if (!ref || !ref.visible || ref.segments.length > 8000) return [];
        return ref.segments.map(s => ({ a: { x: s[0], y: s[1] }, b: { x: s[2], y: s[3] } }));
    }

    setReferenceFlag(action) {
        if (!this.refGeometry) throw new Error('There are no imported reference lines.');
        if (action === 'remove') this.refGeometry = null;
        else this.refGeometry = { ...this.refGeometry, visible: action === 'show' };         // replaced, never edited in place (undo shares it)
        this.saveHistory(); this.requestRender();
    }

    // ------------------------------------------------------------------ importing
    openDxfImportPicker() {
        let input = document.getElementById('dxfFileInput');
        if (!input) {
            input = document.createElement('input');
            input.type = 'file'; input.id = 'dxfFileInput'; input.accept = '.dxf,.DXF,text/plain'; input.style.display = 'none';
            input.addEventListener('change', () => { const f = input.files && input.files[0]; input.value = ''; if (f) this.readDxfFile(f); });
            document.body.appendChild(input);
        }
        input.click();
    }

    readDxfFile(file) {
        if (file.size > LIMITS.maxBytes) { alert('This file is larger than 40 MB. Simplify it in your CAD program first.'); return; }
        const reader = new FileReader();
        reader.onerror = () => alert('That file could not be read.');
        reader.onload = () => {
            try { this.openDxfImportDialog(parseDXF(String(reader.result)), file.name); }
            catch (err) { alert(err.message); }
        };
        reader.readAsText(file);
    }

    /** Convert and add to the drawing. Returns a short summary text. */
    applyDxfImport(parsed, name, opts) {
        const c = convertDXF(parsed, { scale: opts.scale, mode: opts.mode, recenter: opts.recenter });
        let made = 0;
        if (opts.mode === 'walls') {
            for (const s of c.walls.slice(0, 3000)) if (this.wallManager.addWall({ x: s[0], y: s[1] }, { x: s[2], y: s[3] }, opts.thickness, opts.thickness >= 9 ? 'exterior' : 'interior')) made++;
            if (c.walls.length > 3000) c.warnings.push('Only the first 3,000 lines were made into walls - import the rest as reference lines.');
        } else {
            this.refGeometry = { name: String(name).slice(0, 80), visible: true, segments: c.segments };
            made = c.segments.length;
        }
        let notes = 0;
        for (const t of c.texts) { this.annotationManager.addText(t.x, t.y, { text: t.text, height: t.height, rotation: t.rotation }); notes++; }
        this.saveHistory();
        this.zoomExtents();
        return { made, notes, warnings: c.warnings, width: c.width, height: c.height };
    }

    openDxfImportDialog(parsed, fileName) {
        const guess = guessUnitScale(parsed);
        let modal = document.getElementById('dxfModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal-backdrop'; modal.id = 'dxfModal';
            modal.innerHTML = '<div class="modal-card" style="max-width:540px; width:92vw;"><div id="dxfCard"></div></div>';
            modal.addEventListener('mousedown', (e) => { if (e.target === modal) modal.style.display = 'none'; });
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
        const card = modal.querySelector('#dxfCard');
        const counts = { lines: parsed.entities.filter(e => e.type === 'LINE' || e.type === 'POLY').length, curves: parsed.entities.filter(e => e.type === 'CIRCLE' || e.type === 'ARC').length, texts: parsed.entities.filter(e => e.type === 'TEXT').length };
        const fileUnitNote = guess.from === 'file' ? 'The file says what units it uses.' : guess.from === 'guess-mm' ? 'The file does not say; its size suggests millimetres.' : 'The file does not say what units it uses - choose them and check the size below.';
        card.innerHTML = `
            <div class="modal-header"><div class="modal-title"><span style="font-size:20px;">&#128194;</span><span>Import DXF</span></div><button class="modal-close-btn" id="dxfClose" title="Close">&times;</button></div>
            <div class="modal-body">
                <p class="hint-text" style="margin-top:0;"><b>${escapeHtml(fileName)}</b> &mdash; ${counts.lines} lines/polylines, ${counts.curves} circles/arcs, ${counts.texts} text notes.</p>
                ${parsed.warnings.length ? `<p class="hint-text" style="color:#fbbf24;">${parsed.warnings.map(escapeHtml).join('<br>')}</p>` : ''}
                <div class="form-group"><label class="form-label">Units of the drawing</label>
                    <select class="form-select" id="dxfUnits">${UNIT_CHOICES.map(([v, l]) => `<option value="${v}" ${v === '' && guess.scale ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>
                    <div class="hint-text" id="dxfUnitNote">${escapeHtml(fileUnitNote)}</div></div>
                <div class="form-group"><label class="form-label">Import as</label>
                    <label style="display:block; font-size:12px; margin:4px 0;"><input type="radio" name="dxfMode" value="reference" checked> Reference lines &mdash; thin lines to trace over (recommended)</label>
                    <label style="display:block; font-size:12px; margin:4px 0;"><input type="radio" name="dxfMode" value="walls"> Walls &mdash; every line becomes a wall of thickness
                        <select id="dxfThick" class="prop-input" style="width:90px;"><option value="4.5">4.5"</option><option value="9">9"</option></select></label></div>
                <label style="font-size:12px;"><input type="checkbox" id="dxfRecenter" checked> Move the drawing's top-left corner to the origin</label>
                <p class="hint-text" id="dxfSize" style="margin-top:10px;"></p>
            </div>
            <div class="modal-footer"><button class="btn btn-secondary" id="dxfCancel">Cancel</button><button class="btn btn-primary" id="dxfGo">Import</button></div>`;
        const sel = card.querySelector('#dxfUnits'), size = card.querySelector('#dxfSize'), go = card.querySelector('#dxfGo');
        const scaleNow = () => (sel.value === '' ? guess.scale : Number(sel.value));
        const refresh = () => {
            const k = scaleNow();
            if (!k) { size.textContent = 'Choose the units to see the size of the drawing.'; go.disabled = true; return; }
            go.disabled = false;
            const w = parsed.extents.width * k, h = parsed.extents.height * k;
            size.innerHTML = `Imported size: <b>${escapeHtml(units.formatLength(w))} &times; ${escapeHtml(units.formatLength(h))}</b> ${w > 12 * 600 || h > 12 * 600 ? '<span style="color:#fbbf24;">&mdash; that is very large for a house; check the units.</span>' : ''}`;
        };
        sel.addEventListener('change', refresh); refresh();
        const close = () => { modal.style.display = 'none'; };
        card.querySelector('#dxfClose').addEventListener('click', close); card.querySelector('#dxfCancel').addEventListener('click', close);
        go.addEventListener('click', () => {
            try {
                const r = this.applyDxfImport(parsed, fileName, {
                    scale: scaleNow(), mode: card.querySelector('input[name=dxfMode]:checked').value, thickness: Number(card.querySelector('#dxfThick').value),
                    recenter: card.querySelector('#dxfRecenter').checked
                });
                close();
                if (this.commandLine) {
                    this.commandLine.log(`DXF imported: ${r.made} ${r.made === 1 ? 'line' : 'lines'}${r.notes ? ` and ${r.notes} text notes` : ''}.`);
                    for (const w of r.warnings) this.commandLine.log(w);
                }
            } catch (err) { alert(err.message); }
        });
    }
}
