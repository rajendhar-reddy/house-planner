/**
 * underlay_panel.js - background image for tracing: load, draw, move, lock, calibrate the scale.
 * Mixed into HousePlannerApp, so `this` is the app. The rules live in modules/underlay.js.
 */

import { units } from '../units.js';
import { escapeHtml } from '../util.js';
import { sanitizeUnderlay, defaultPlacement, calibrateUnderlay, importSize, UNDERLAY_MAX_CHARS } from '../underlay.js';

export class UnderlayMethods {
    // ------------------------------------------------------------------ drawing
    renderUnderlay(ctx, scale) {
        const u = this.underlay;
        if (!u || !u.visible) return;
        if (!this._ulCache || this._ulCache.url !== u.dataUrl) {
            const img = new Image();
            img.onload = () => this.requestRender();
            img.src = u.dataUrl;
            this._ulCache = { url: u.dataUrl, img };
        }
        const img = this._ulCache.img;
        ctx.save();
        if (img.complete && img.naturalWidth) {
            ctx.globalAlpha = u.opacity;
            ctx.drawImage(img, u.x, u.y, u.width, u.height);
            ctx.globalAlpha = 1;
        }
        if (this.underlayEditing) {                                  // dashed frame while it can be dragged
            ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.5 / scale; ctx.setLineDash([8 / scale, 5 / scale]);
            ctx.strokeRect(u.x, u.y, u.width, u.height);
        }
        ctx.restore();
    }

    // ------------------------------------------------------------------ loading
    openUnderlayPicker() {
        let input = document.getElementById('underlayFileInput');
        if (!input) {
            input = document.createElement('input');
            input.type = 'file'; input.id = 'underlayFileInput'; input.accept = 'image/png,image/jpeg,image/webp'; input.style.display = 'none';
            input.addEventListener('change', () => { const f = input.files && input.files[0]; input.value = ''; if (f) this.loadUnderlayFile(f); });
            document.body.appendChild(input);
        }
        input.click();
    }

    /** Read a picture, shrink it so it fits in browser storage, and place it in the middle of the view. */
    loadUnderlayFile(file) {
        if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
            alert('Please choose a PNG, JPEG or WebP picture. (For a PDF, export the page as an image first.)');
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => alert('That file could not be read.');
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => alert('That file is not a picture the browser can open.');
            img.onload = () => {
                let { width, height } = importSize(img.naturalWidth, img.naturalHeight);
                let dataUrl = '';
                for (let attempt = 0; attempt < 5; attempt++) {
                    const c = document.createElement('canvas'); c.width = width; c.height = height;
                    const g = c.getContext('2d');
                    g.fillStyle = '#ffffff'; g.fillRect(0, 0, width, height);           // transparent PNGs get a white background
                    g.drawImage(img, 0, 0, width, height);
                    dataUrl = c.toDataURL('image/jpeg', Math.max(0.5, 0.82 - attempt * 0.08));
                    if (dataUrl.length <= UNDERLAY_MAX_CHARS) break;
                    width = Math.max(1, Math.round(width * 0.75)); height = Math.max(1, Math.round(height * 0.75));
                }
                const cv = this.canvasElement.getBoundingClientRect();
                const center = this.canvasEngine.screenToWorld(cv.width / 2, cv.height / 2);
                const place = defaultPlacement(img.naturalWidth, img.naturalHeight, center);
                const u = sanitizeUnderlay({ name: file.name, dataUrl, ...place, opacity: 0.35, visible: true, locked: false });
                if (!u) { alert('That picture is too large to keep with the project. Try a smaller or lower-resolution image.'); return; }
                this.underlay = u;
                this.saveHistory(); this.requestRender();
                if (this.commandLine) this.commandLine.log('Underlay loaded at an assumed width of 40 ft. Use UNDERLAY SCALE (or the Trace image dialog) to set the real scale.');
                this.renderUnderlayPanel();
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    }

    // ------------------------------------------------------------------ edit helpers (also used by commands)
    removeUnderlay() {
        if (!this.underlay) return;
        this.underlay = null; this.underlayEditing = false;
        this.saveHistory(); this.requestRender(); this.renderUnderlayPanel();
    }

    setUnderlayFlag(action) {
        const u = this.underlay;
        if (!u) throw new Error('There is no underlay. Use UNDERLAY LOAD first.');
        if (action === 'lock') u.locked = true; else if (action === 'unlock') u.locked = false;
        else if (action === 'hide') u.visible = false; else if (action === 'show') u.visible = true;
        if (u.locked) this.underlayEditing = false;
        this.saveHistory(); this.requestRender(); this.renderUnderlayPanel();
    }

    /** Click two points of a known distance on the image, then type the real distance. */
    startUnderlayCalibration() {
        const u = this.underlay;
        if (!u) throw new Error('There is no underlay. Use UNDERLAY LOAD first.');
        if (!this.commandLine) throw new Error('The command line is not available.');
        const cl = this.commandLine;
        this.closeUnderlayPanel();
        this.setTool('select');
        cl.cancel(false);
        cl.ask({
            kind: 'point', wantsPoint: true, prompt: 'UNDERLAY SCALE - click the first point of a distance you know on the picture:',
            onPoint: (p1) => cl.ask({
                kind: 'point', wantsPoint: true, base: p1, prompt: 'UNDERLAY SCALE - click the second point:',
                onPoint: (p2) => {
                    if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 1e-6) throw new Error('Pick a second point away from the first one.');
                    cl.ask({
                        kind: 'choice', base: p1, prompt: "UNDERLAY SCALE - real distance between the two points (e.g. 12' or 3.5m):",
                        onChoice: (text) => {
                            const real = units.parseInput(text);
                            if (real === null) throw new Error("Type a distance such as 12' or 3.5m.");
                            this.underlay = calibrateUnderlay(this.underlay, p1, p2, real);
                            this.saveHistory(); this.requestRender();
                            cl.log(`Underlay scaled: those two points are now ${units.formatLength(real)} apart.`);
                            cl.finish();
                        }
                    });
                }
            })
        });
    }

    // ------------------------------------------------------------------ dialog
    openUnderlayPanel() {
        let modal = document.getElementById('underlayModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal-backdrop'; modal.id = 'underlayModal';
            modal.innerHTML = '<div class="modal-card" style="max-width:520px; width:92vw;"><div id="underlayCard"></div></div>';
            modal.addEventListener('mousedown', (e) => { if (e.target === modal) this.closeUnderlayPanel(); });
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
        this.renderUnderlayPanel();
    }

    closeUnderlayPanel() {
        const m = document.getElementById('underlayModal');
        if (m) m.style.display = 'none';
    }

    renderUnderlayPanel() {
        const card = document.getElementById('underlayCard');
        if (!card) return;
        const u = this.underlay;
        const header = `<div class="modal-header"><div class="modal-title"><span style="font-size:20px;">&#128444;</span><span>Trace image (underlay)</span></div>
                        <button class="modal-close-btn" id="ulClose" title="Close">&times;</button></div>`;
        if (!u) {
            card.innerHTML = `${header}<div class="modal-body">
                <p class="hint-text">Load a scanned plan, survey or sketch (PNG, JPEG or WebP) and draw over it. Pictures are shrunk to fit in browser storage. For a PDF, export the page as an image first.</p>
                <button class="btn btn-primary" id="ulLoad">Choose a picture&hellip;</button></div>`;
            card.querySelector('#ulLoad').addEventListener('click', () => this.openUnderlayPicker());
        } else {
            const f = (v) => escapeHtml(units.formatLength(v));
            card.innerHTML = `${header}<div class="modal-body">
                <p class="hint-text" style="margin-top:0;"><b>${escapeHtml(u.name)}</b> &mdash; ${f(u.width)} &times; ${f(u.height)}. The picture is not exported to PNG, PDF, SVG or DXF.</p>
                <div class="prop-row"><span class="prop-label">Opacity</span><input type="range" id="ulOpacity" min="5" max="100" value="${Math.round(u.opacity * 100)}" style="flex:1;"></div>
                <div class="prop-row"><label style="font-size:12px;"><input type="checkbox" id="ulShow" ${u.visible ? 'checked' : ''}> Show</label>
                    <label style="font-size:12px; margin-left:14px;"><input type="checkbox" id="ulLock" ${u.locked ? 'checked' : ''}> Lock</label></div>
                <div class="input-grid" style="margin-top:8px;">
                    <div><label>Left edge X</label><input type="text" id="ulX" value="${f(u.x)}"></div>
                    <div><label>Top edge Y</label><input type="text" id="ulY" value="${f(u.y)}"></div>
                    <div><label>Width (height follows)</label><input type="text" id="ulW" value="${f(u.width)}"></div>
                </div>
                <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
                    <button class="action-btn" id="ulScale" title="Click two points of a known distance, then type the real distance">Set scale&hellip;</button>
                    <button class="action-btn ${this.underlayEditing ? 'active' : ''}" id="ulMove" ${u.locked ? 'disabled' : ''}>${this.underlayEditing ? 'Stop moving' : 'Move with mouse'}</button>
                    <button class="action-btn" id="ulReplace">Replace picture&hellip;</button>
                    <button class="action-btn danger" id="ulRemove">Remove</button>
                </div></div>`;
            const run = (fn) => { try { fn(); } catch (err) { alert(err.message); } };
            const dist = (id) => { const v = units.parseInput(card.querySelector(id).value); if (v === null) throw new Error("Type a distance such as 12' or 3.5m."); return v; };
            card.querySelector('#ulOpacity').addEventListener('input', (e) => { u.opacity = Math.min(1, Math.max(0.05, Number(e.target.value) / 100)); this.saveHistoryCoalesced('ulOpacity'); this.requestRender(); });
            card.querySelector('#ulShow').addEventListener('change', (e) => run(() => this.setUnderlayFlag(e.target.checked ? 'show' : 'hide')));
            card.querySelector('#ulLock').addEventListener('change', (e) => run(() => this.setUnderlayFlag(e.target.checked ? 'lock' : 'unlock')));
            card.querySelector('#ulX').addEventListener('change', () => run(() => { u.x = dist('#ulX'); this.saveHistory(); this.requestRender(); this.renderUnderlayPanel(); }));
            card.querySelector('#ulY').addEventListener('change', () => run(() => { u.y = dist('#ulY'); this.saveHistory(); this.requestRender(); this.renderUnderlayPanel(); }));
            card.querySelector('#ulW').addEventListener('change', () => run(() => {
                const w = dist('#ulW'); if (w <= 0) throw new Error('The width must be more than zero.');
                u.height = u.height * (w / u.width); u.width = w; this.saveHistory(); this.requestRender(); this.renderUnderlayPanel();
            }));
            card.querySelector('#ulScale').addEventListener('click', () => run(() => this.startUnderlayCalibration()));
            card.querySelector('#ulMove').addEventListener('click', () => {
                this.underlayEditing = !this.underlayEditing;
                if (this.underlayEditing) { this.setTool('select'); if (this.commandLine) this.commandLine.log('Drag on the drawing to move the underlay. Press Esc when done.'); this.closeUnderlayPanel(); }
                this.requestRender(); this.renderUnderlayPanel();
            });
            card.querySelector('#ulReplace').addEventListener('click', () => this.openUnderlayPicker());
            card.querySelector('#ulRemove').addEventListener('click', () => this.removeUnderlay());
        }
        card.querySelector('#ulClose').addEventListener('click', () => this.closeUnderlayPanel());
    }
}
