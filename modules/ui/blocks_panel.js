/**
 * blocks_panel.js - saving, listing and inserting blocks (symbols), and the Blocks dialog.
 * Mixed into HousePlannerApp, so `this` is the app. The rules live in modules/blocks.js.
 *
 * Blocks live in the project (so a shared file is self-contained) and are also copied into a library in this
 * browser's storage so that other projects can use them.
 */

import { units } from '../units.js';
import { escapeHtml } from '../util.js';
import { makeBlock, insertBlock, sanitizeBlocks, sanitizeBlockName, findBlockName, blockSize } from '../blocks.js';
import { centerOf } from '../transform.js';

const LIBRARY_KEY = 'houseplanner_block_library';

export class BlocksPanelMethods {
    /** Called when a project is loaded: keep only well-formed blocks. */
    restoreBlocks(raw) {
        this.blocks = sanitizeBlocks(raw);
    }

    libraryBlocks() {
        try { return sanitizeBlocks(JSON.parse(localStorage.getItem(LIBRARY_KEY) || '{}')); } catch (e) { return {}; }
    }

    saveToLibrary(block) {
        try {
            const lib = this.libraryBlocks();
            const same = findBlockName(lib, block.name);
            if (same) delete lib[same];                                         // "Bath" and "bath" are the same block
            lib[block.name] = block;
            localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
            return true;
        } catch (e) { return false; }                                             // storage full / blocked: the project copy still works
    }

    /** All blocks usable here: this project's first, then the shared library's. */
    allBlocks() {
        return { ...this.libraryBlocks(), ...(this.blocks || {}) };
    }

    findBlock(name) {
        const all = this.allBlocks();
        const key = findBlockName(all, name);
        return key ? all[key] : null;
    }

    /** Save the current selection as a block. `base` defaults to the centre of the selection. */
    saveSelectionAsBlock(name, base = null) {
        const items = this.getSelectionItems();
        const b = makeBlock(this, items, name, base || centerOf(this, items));
        this.blocks = this.blocks || {};
        const existed = !!findBlockName(this.blocks, b.name);
        if (existed) delete this.blocks[findBlockName(this.blocks, b.name)];
        this.blocks[b.name] = b;
        const inLibrary = this.saveToLibrary(b);
        this.saveHistory();
        return { block: b, replaced: existed, inLibrary };
    }

    /** Insert a block by name at a world point. Returns the new items. */
    insertBlockByName(name, at, rotationDeg = 0) {
        const block = this.findBlock(name);
        if (!block) throw new Error(`There is no block called "${name}". Type BLOCKS to see the list.`);
        this.blocks = this.blocks || {};
        if (!findBlockName(this.blocks, block.name)) this.blocks[block.name] = block;       // a library block now belongs to this project too
        const made = insertBlock(this, block, at, rotationDeg);
        this.setSelection(made.filter(m => m.category !== 'opening'));
        this.saveHistory();
        return made;
    }

    deleteBlockByName(name) {
        const key = findBlockName(this.allBlocks(), name);
        if (!key) throw new Error(`There is no block called "${name}".`);
        if (this.blocks) delete this.blocks[key];
        try { const lib = this.libraryBlocks(); delete lib[key]; localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib)); } catch (e) { /* ignore */ }
        this.saveHistory();
        return key;
    }

    // ------------------------------------------------------------------ dialog
    openBlocksPanel() {
        let modal = document.getElementById('blocksModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal-backdrop'; modal.id = 'blocksModal';
            modal.innerHTML = '<div class="modal-card" style="max-width:560px; width:92vw;"><div id="blocksCard"></div></div>';
            modal.addEventListener('mousedown', (e) => { if (e.target === modal) this.closeBlocksPanel(); });
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
        this.renderBlocksPanel();
    }

    closeBlocksPanel() { const m = document.getElementById('blocksModal'); if (m) m.style.display = 'none'; }

    renderBlocksPanel() {
        const card = document.getElementById('blocksCard');
        if (!card) return;
        const all = this.allBlocks(), names = Object.keys(all).sort((a, b) => a.localeCompare(b));
        const hasSel = this.getSelectionItems().length > 0;
        const rows = names.map(n => {
            const sz = blockSize(all[n]);
            return `<tr data-name="${escapeHtml(n)}"><td style="padding:5px 8px;"><b>${escapeHtml(n)}</b></td>
                <td style="padding:5px 8px; color:var(--text-muted);">${all[n].count} objects${sz ? ` &middot; ${escapeHtml(units.formatLength(sz.width))} &times; ${escapeHtml(units.formatLength(sz.height))}` : ''}</td>
                <td style="padding:5px 8px; text-align:right; white-space:nowrap;"><button class="action-btn bk-insert">Insert</button> <button class="action-btn danger bk-del" title="Delete this block">&#10005;</button></td></tr>`;
        }).join('') || '<tr><td colspan="3" style="padding:10px 8px; color:var(--text-muted);">No blocks yet. Select some objects, then choose "Save selection as block".</td></tr>';
        card.innerHTML = `
            <div class="modal-header"><div class="modal-title"><span style="font-size:20px;">&#9707;</span><span>Blocks (symbols)</span></div><button class="modal-close-btn" id="bkClose" title="Close">&times;</button></div>
            <div class="modal-body" style="max-height:60vh; overflow:auto;">
                <table style="width:100%; border-collapse:collapse; font-size:12px;"><tbody>${rows}</tbody></table>
                <div style="display:flex; gap:8px; margin-top:14px;">
                    <input type="text" id="bkName" class="form-input" placeholder="Name for the selection, e.g. Bathroom set" style="flex:1;" ${hasSel ? '' : 'disabled'}>
                    <button class="btn btn-primary" id="bkSave" ${hasSel ? '' : 'disabled'}>Save selection as block</button>
                </div>
                <p class="hint-text" style="margin-top:10px;">${hasSel ? 'The block remembers the selected objects (and the doors and windows on selected walls).' : 'Close this dialog, select the objects you want to reuse, then open it again.'} Blocks are saved with the project and also kept in this browser for other projects. Inserting makes ordinary editable copies.</p>
            </div>`;
        const run = (fn) => { try { fn(); } catch (err) { alert(err.message); } };
        card.querySelector('#bkClose').addEventListener('click', () => this.closeBlocksPanel());
        card.querySelector('#bkSave')?.addEventListener('click', () => run(() => {
            const r = this.saveSelectionAsBlock(card.querySelector('#bkName').value);
            this.renderBlocksPanel();
            if (this.commandLine) this.commandLine.log(`Block "${r.block.name}" ${r.replaced ? 'replaced' : 'saved'} (${r.block.count} objects). Use INSERT ${r.block.name}.`);
        }));
        card.querySelectorAll('tr[data-name]').forEach(tr => {
            const name = tr.dataset.name;
            tr.querySelector('.bk-insert').addEventListener('click', () => { this.closeBlocksPanel(); if (this.commandLine) this.commandLine.submit(`insert ${name}`); });
            tr.querySelector('.bk-del').addEventListener('click', () => run(() => { this.deleteBlockByName(name); this.renderBlocksPanel(); }));
        });
    }
}
