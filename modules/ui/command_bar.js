/**
 * command_bar.js - the AutoCAD-style command line at the bottom of the window.
 * Mixed into HousePlannerApp, so `this` is the app. The interpreter itself is modules/commands.js.
 */

import { CommandLine, DRAFT_TOOLS } from '../commands.js';

export class CommandBarMethods {
    initCommandLine() {
        const footer = document.querySelector('.bottom-status-bar');
        if (!footer || document.getElementById('commandBar')) return;

        const bar = document.createElement('div');
        bar.className = 'command-bar';
        bar.id = 'commandBar';
        bar.innerHTML = `
            <div class="cmd-log" id="cmdLog" aria-live="polite"></div>
            <div class="cmd-row">
                <span class="cmd-prompt" id="cmdPrompt">Command:</span>
                <input id="cmdInput" type="text" autocomplete="off" spellcheck="false"
                       placeholder="Type a command (HELP) &mdash; or while drawing, a distance such as 12' then Enter">
            </div>`;
        footer.parentNode.insertBefore(bar, footer);

        const log = document.getElementById('cmdLog');
        const prompt = document.getElementById('cmdPrompt');
        const input = document.getElementById('cmdInput');
        const history = []; let hi = 0;

        this.commandLine = new CommandLine(this, {
            log: (text, kind) => {
                const line = document.createElement('div');
                line.className = `cmd-line cmd-${kind || 'info'}`;
                line.textContent = text;
                log.appendChild(line);
                while (log.children.length > 60) log.removeChild(log.firstChild);
                log.scrollTop = log.scrollHeight;
            },
            setPrompt: (text) => { prompt.textContent = text; }
        });
        this.commandLine.log('Type HELP for commands. While drawing a wall, type a length (for example 12\') and press Enter.');

        const submit = () => {
            const text = input.value;
            if (text.trim()) { history.push(text); hi = history.length; }
            input.value = '';
            this.commandLine.submit(text);
            this.requestRender();
            if (!this.commandLine.pending) input.blur();               // give the keyboard back to the drawing
        };
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();                                       // the drawing's one-letter shortcuts must not fire while typing
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            else if (e.key === 'Escape') { input.value = ''; this.commandLine.cancel(); input.blur(); }
            else if (e.key === 'ArrowUp' && history.length) { e.preventDefault(); hi = Math.max(0, hi - 1); input.value = history[hi]; }
            else if (e.key === 'ArrowDown' && history.length) { e.preventDefault(); hi = Math.min(history.length, hi + 1); input.value = history[hi] || ''; }
        });

        // Typing a number while drafting (or "/" any time) goes straight to the command line, like AutoCAD's dynamic input
        window.addEventListener('keydown', (e) => {
            if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
            const t = e.target && e.target.tagName;
            if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
            const drafting = DRAFT_TOOLS.includes(this.activeTool) && this.draftStart;
            const waiting = this.commandLine.pending;
            if (e.key === '/' || (drafting || waiting) && /^[0-9.'"@<,-]$/.test(e.key)) {
                e.preventDefault(); e.stopPropagation();
                input.focus();
                if (e.key !== '/') input.value += e.key;
            } else if (e.key === 'Enter' && (drafting || waiting)) {
                e.preventDefault(); e.stopPropagation(); input.focus();
            }
        }, true);                                                      // capture: runs before the one-letter shortcuts
    }

    /** Centre of the current selection (used as the default rotation point). */
    selectionCenter() {
        const items = this.getSelectionItems();
        const b = selectionBoundsOf(this, items);
        return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : { x: 0, y: 0 };
    }
}

import { selectionBounds as selectionBoundsOf } from '../transform.js';
