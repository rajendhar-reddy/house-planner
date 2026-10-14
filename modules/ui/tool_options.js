/**
 * tool_options.js - The secondary options bar shown under the toolbar for the active tool.
 *
 * These methods are mixed into HousePlannerApp (see app.js), so `this` is the app.
 */

import { Wall } from '../walls.js';
import { FURNITURE_CATALOG } from '../furniture.js';
import { Stair } from '../stairs.js';
import { COLUMN_PRESETS } from '../columns.js';
import { escapeHtml } from '../util.js';

export class ToolOptionMethods {
    updateToolSubOptions() {
        const subBar = document.getElementById('toolSubBar');
        if (!subBar) return;

        if (this.activeTool === 'wall') {
            subBar.style.display = 'flex';
            subBar.innerHTML = `
                <span class="sub-label">Wall Thickness:</span>
                <button class="sub-btn ${this.wallManager.currentThickness === 9 ? 'active' : ''}" id="wallExtBtn">Exterior 9" (230mm)</button>
                <button class="sub-btn ${this.wallManager.currentThickness === 4.5 ? 'active' : ''}" id="wallIntBtn">Interior 4.5" (115mm)</button>
            `;
            document.getElementById('wallExtBtn').onclick = () => {
                this.wallManager.currentThickness = 9;
                this.wallManager.currentType = 'exterior';
                this.updateToolSubOptions();
            };
            document.getElementById('wallIntBtn').onclick = () => {
                this.wallManager.currentThickness = 4.5;
                this.wallManager.currentType = 'interior';
                this.updateToolSubOptions();
            };
        } else if (this.activeTool === 'column') {
            subBar.style.display = 'flex';
            let html = '<span class="sub-label">RCC Column Size:</span>';
            COLUMN_PRESETS.forEach((p, idx) => {
                const active = this.activeColumnPresetIndex === idx ? 'active' : '';
                html += `<button class="sub-btn ${active}" data-cidx="${idx}">${p.name}</button>`;
            });
            html += '<span style="color:var(--border-color); margin: 0 4px;">|</span>';
            html += `<button class="sub-btn" id="colRot90Btn" title="Rotate 90°">↻ Rotate (${this.activeColumnRotation || 0}°)</button>`;
            subBar.innerHTML = html;

            subBar.querySelectorAll('button[data-cidx]').forEach(b => {
                b.onclick = () => {
                    this.activeColumnPresetIndex = parseInt(b.dataset.cidx);
                    this.updateToolSubOptions();
                };
            });
            document.getElementById('colRot90Btn').onclick = () => {
                this.activeColumnRotation = ((this.activeColumnRotation || 0) + 90) % 360;
                this.updateToolSubOptions();
            };
        } else if (this.activeTool === 'door') {
            subBar.style.display = 'flex';
            subBar.innerHTML = `
                <span class="sub-label">Door Type:</span>
                <button class="sub-btn ${this.doorSubtype === 'single' ? 'active' : ''}" id="doorSingleBtn">Single Swing (3')</button>
                <button class="sub-btn ${this.doorSubtype === 'double' ? 'active' : ''}" id="doorDoubleBtn">Double Swing (5')</button>
                <button class="sub-btn ${this.doorSubtype === 'sliding' ? 'active' : ''}" id="doorSlidingBtn">Sliding (6')</button>
                <button class="sub-btn ${this.doorSubtype === 'arch' ? 'active' : ''}" id="doorArchBtn">Arch Opening</button>
            `;
            document.getElementById('doorSingleBtn').onclick = () => { this.doorSubtype = 'single'; this.activeDoorWidth = 36; this.updateToolSubOptions(); };
            document.getElementById('doorDoubleBtn').onclick = () => { this.doorSubtype = 'double'; this.activeDoorWidth = 60; this.updateToolSubOptions(); };
            document.getElementById('doorSlidingBtn').onclick = () => { this.doorSubtype = 'sliding'; this.activeDoorWidth = 72; this.updateToolSubOptions(); };
            document.getElementById('doorArchBtn').onclick = () => { this.doorSubtype = 'arch'; this.activeDoorWidth = 42; this.updateToolSubOptions(); };
        } else if (this.activeTool === 'gate') {
            subBar.style.display = 'flex';
            subBar.innerHTML = `
                <span class="sub-label">Gate Type:</span>
                <button class="sub-btn ${this.gateSubtype === 'sliding' ? 'active' : ''}" id="gateSlidingBtn">Sliding Gate</button>
                <button class="sub-btn ${this.gateSubtype === 'swing' ? 'active' : ''}" id="gateSwingBtn">Double Swing Gate</button>
                <span style="color:var(--border-color); margin: 0 4px;">|</span>
                <span class="sub-label">Width:</span>
                <button class="sub-btn ${this.activeGateWidth === 96 ? 'active' : ''}" data-gw="96">8 ft</button>
                <button class="sub-btn ${this.activeGateWidth === 120 ? 'active' : ''}" data-gw="120">10 ft (Standard)</button>
                <button class="sub-btn ${this.activeGateWidth === 144 ? 'active' : ''}" data-gw="144">12 ft</button>
                <button class="sub-btn ${this.activeGateWidth === 180 ? 'active' : ''}" data-gw="180">15 ft</button>
            `;
            document.getElementById('gateSlidingBtn').onclick = () => { this.gateSubtype = 'sliding'; this.updateToolSubOptions(); };
            document.getElementById('gateSwingBtn').onclick = () => { this.gateSubtype = 'swing'; this.updateToolSubOptions(); };
            subBar.querySelectorAll('button[data-gw]').forEach(b => {
                b.onclick = () => {
                    this.activeGateWidth = parseInt(b.dataset.gw);
                    this.updateToolSubOptions();
                };
            });
        } else if (this.activeTool === 'furniture') {
            subBar.style.display = 'flex';
            if (!this.activeFurnitureCategory) this.activeFurnitureCategory = 'Kitchen';
            const categories = ['All', 'Kitchen', 'Bedroom', 'Living', 'Dining', 'Sanitary', 'Outdoor'];

            let html = '<span class="sub-label">Category:</span>';
            for (const cat of categories) {
                html += `<button class="sub-btn ${this.activeFurnitureCategory === cat ? 'active' : ''}" data-cat="${cat}" style="font-size:11px; padding:2px 8px;">${cat}</button>`;
            }
            html += '<span style="color:var(--border-color); margin: 0 4px;">|</span>';
            html += '<span class="sub-label">Symbol:</span>';

            const filtered = this.activeFurnitureCategory === 'All' 
                ? FURNITURE_CATALOG 
                : FURNITURE_CATALOG.filter(f => f.category === this.activeFurnitureCategory);

            for (const f of filtered) {
                html += `<button class="sub-btn ${this.activeFurnitureType === f.id ? 'active' : ''}" data-fid="${escapeHtml(f.id)}">${escapeHtml(f.name)}</button>`;
            }
            subBar.innerHTML = html;

            subBar.querySelectorAll('button[data-cat]').forEach(b => {
                b.onclick = () => {
                    this.activeFurnitureCategory = b.dataset.cat;
                    const catItems = this.activeFurnitureCategory === 'All' 
                        ? FURNITURE_CATALOG 
                        : FURNITURE_CATALOG.filter(f => f.category === this.activeFurnitureCategory);
                    if (catItems.length > 0 && !catItems.some(f => f.id === this.activeFurnitureType)) {
                        this.activeFurnitureType = catItems[0].id;
                    }
                    this.updateToolSubOptions();
                };
            });

            subBar.querySelectorAll('button[data-fid]').forEach(b => {
                b.onclick = () => {
                    this.activeFurnitureType = b.dataset.fid;
                    this.updateToolSubOptions();
                };
            });
        } else if (this.activeTool === 'break_wall') {
            subBar.style.display = 'flex';
            subBar.innerHTML = `
                <span class="sub-label">✂ Break Wall Tool:</span>
                <span class="hint-text" style="margin:0; align-self:center; color:var(--text-main);">Click anywhere along any wall to split it into two independent walls.</span>
            `;
        } else if (this.activeTool === 'road') {
            subBar.style.display = 'flex';
            subBar.innerHTML = `
                <span class="sub-label">Add Road:</span>
                <button class="sub-btn" id="addFrontRoadBtn">+ Front Road</button>
                <button class="sub-btn" id="addRearRoadBtn">+ Rear Road</button>
                <button class="sub-btn" id="addLeftRoadBtn">+ Left Road</button>
                <button class="sub-btn" id="addRightRoadBtn">+ Right Road</button>
                <span style="color:var(--border-color); margin: 0 4px;">|</span>
                <span class="sub-label">Width:</span>
                <button class="sub-btn ${this.activeRoadWidth === 240 ? 'active' : ''}" data-rw="240">20 ft</button>
                <button class="sub-btn ${this.activeRoadWidth === 360 ? 'active' : ''}" data-rw="360">30 ft</button>
                <button class="sub-btn ${this.activeRoadWidth === 480 ? 'active' : ''}" data-rw="480">40 ft</button>
                <button class="sub-btn ${this.activeRoadWidth === 720 ? 'active' : ''}" data-rw="720">60 ft</button>
            `;
            const setupRoadBtn = (btnId, side, defaultName) => {
                document.getElementById(btnId)?.addEventListener('click', () => {
                    const road = this.roadManager.addRoad({ side, width: this.activeRoadWidth, name: defaultName });
                    this.clearSelection();
                    this.selectedCategory = 'road';
                    this.selectedObject = road;
                    this.roadManager.selectedRoadId = road.id;
                    this.saveHistory();
                    this.updateInspector();
                });
            };
            setupRoadBtn('addFrontRoadBtn', 'front', 'Front Entry Road');
            setupRoadBtn('addRearRoadBtn', 'rear', 'Rear Service Road');
            setupRoadBtn('addLeftRoadBtn', 'left', 'West Cross Road');
            setupRoadBtn('addRightRoadBtn', 'right', 'East Cross Road');

            subBar.querySelectorAll('button[data-rw]').forEach(b => {
                b.onclick = () => {
                    this.activeRoadWidth = parseInt(b.dataset.rw);
                    this.updateToolSubOptions();
                };
            });
        } else if (this.activeTool === 'stairs') {
            subBar.style.display = 'flex';
            const isDogleg = this.activeStairType === 'dogleg';
            subBar.innerHTML = `
                <span class="sub-label">Stair Type:</span>
                <button class="sub-btn ${isDogleg && this.activeStairLandingSteps === 3 ? 'active' : ''}" data-stype="dogleg" data-slanding="3">Dog-Legged (Winders)</button>
                <button class="sub-btn ${isDogleg && this.activeStairLandingSteps === 0 ? 'active' : ''}" data-stype="dogleg" data-slanding="0">Dog-Legged (Flat)</button>
                <button class="sub-btn ${this.activeStairType === 'open_well' ? 'active' : ''}" data-stype="open_well">Open-Well (3 Flights)</button>
                <button class="sub-btn ${this.activeStairType === 'straight' ? 'active' : ''}" data-stype="straight">Straight Flight</button>
                <button class="sub-btn ${this.activeStairType === 'l_shape' ? 'active' : ''}" data-stype="l_shape">L-Shaped</button>
                <button class="sub-btn ${this.activeStairType === 'spiral' ? 'active' : ''}" data-stype="spiral">Spiral</button>
                <span style="color:var(--border-color); margin: 0 4px;">|</span>
                <span class="sub-label">Flight Width:</span>
                <button class="sub-btn ${this.activeStairFlightWidth === 36 ? 'active' : ''}" data-sfw="36">3' - 0"</button>
                <button class="sub-btn ${this.activeStairFlightWidth === 42 ? 'active' : ''}" data-sfw="42">3' - 6"</button>
                <button class="sub-btn ${this.activeStairFlightWidth === 48 ? 'active' : ''}" data-sfw="48">4' - 0"</button>
            `;
            subBar.querySelectorAll('button[data-stype]').forEach(b => {
                b.onclick = () => {
                    this.activeStairType = b.dataset.stype;
                    if (b.dataset.slanding !== undefined) {
                        this.activeStairLandingSteps = parseInt(b.dataset.slanding);
                    }
                    this.updateToolSubOptions();
                };
            });
            subBar.querySelectorAll('button[data-sfw]').forEach(b => {
                b.onclick = () => {
                    this.activeStairFlightWidth = parseInt(b.dataset.sfw);
                    this.updateToolSubOptions();
                };
            });
        } else if (this.activeTool === 'compound_wall') {
            subBar.style.display = 'flex';
            subBar.innerHTML = `
                <span class="sub-label">Compound Wall:</span>
                <button class="sub-btn ${this.compoundWallThickness === 4.5 ? 'active' : ''}" data-cwt="4.5">4.5" Brick</button>
                <button class="sub-btn ${this.compoundWallThickness === 6 ? 'active' : ''}" data-cwt="6">6" Block (Standard)</button>
                <button class="sub-btn ${this.compoundWallThickness === 9 ? 'active' : ''}" data-cwt="9">9" Masonry</button>
                <span style="color:var(--border-color); margin: 0 4px;">|</span>
                <button class="sub-btn highlight" id="autoPlotCompoundBtn" title="Automatically build 4 compound perimeter walls around plot with main gate">⚡ Erect Plot Boundary Walls</button>
            `;
            subBar.querySelectorAll('button[data-cwt]').forEach(b => {
                b.onclick = () => {
                    this.compoundWallThickness = parseFloat(b.dataset.cwt);
                    this.updateToolSubOptions();
                };
            });
            document.getElementById('autoPlotCompoundBtn').onclick = () => {
                if (!this.plotManager.plot) {
                    alert('Please create or define a plot boundary first.');
                    return;
                }
                const b = this.plotManager.getBounds();
                if (b) {
                    const res = this.wallManager.createCompoundWallPerimeter(b, {
                        thickness: this.compoundWallThickness || 6,
                        openingManager: this.openingManager,
                        gateWidth: 120
                    });
                    this.saveHistory();
                    this.render();
                    const pill = document.getElementById('autosaveStatus');
                    if (pill) {
                        pill.innerHTML = `● Plot Compound Wall Erected`;
                        pill.style.color = '#38bdf8';
                    }
                }
            };
        } else if (this.activeTool === 'landscape') {
            subBar.style.display = 'flex';
            if (!this.activeLandscapeCategory) this.activeLandscapeCategory = 'All';
            const categories = ['All', 'Trees', 'Hardscape', 'Vehicles'];

            let html = '<span class="sub-label">Landscape:</span>';
            for (const cat of categories) {
                html += `<button class="sub-btn ${this.activeLandscapeCategory === cat ? 'active' : ''}" data-lcat="${cat}" style="font-size:11px; padding:2px 8px;">${cat}</button>`;
            }
            html += '<span style="color:var(--border-color); margin: 0 4px;">|</span>';

            const landscapeItems = [
                { id: 'tree_deciduous', name: '🌳 Canopy Tree', cat: 'Trees' },
                { id: 'tree_palm', name: '🌴 Palm Tree', cat: 'Trees' },
                { id: 'shrub_bush', name: '🌿 Bush / Hedge', cat: 'Trees' },
                { id: 'planter_box', name: '🪴 Planter Bed', cat: 'Hardscape' },
                { id: 'lawn_patch', name: '🌱 Lawn Patch', cat: 'Hardscape' },
                { id: 'driveway_pavers', name: '🧱 Pavers', cat: 'Hardscape' },
                { id: 'car_suv', name: '🚙 SUV', cat: 'Vehicles' },
                { id: 'motorcycle', name: '🏍 Scooter', cat: 'Vehicles' }
            ];

            const filtered = this.activeLandscapeCategory === 'All'
                ? landscapeItems
                : landscapeItems.filter(i => i.cat === this.activeLandscapeCategory);

            for (const item of filtered) {
                const active = (this.activeLandscapeType === item.id) ? 'active' : '';
                html += `<button class="sub-btn ${active}" data-lid="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button>`;
            }

            html += '<span style="color:var(--border-color); margin: 0 4px;">|</span>';
            const washActive = this.plotManager.showLandscapeWash ? 'active' : '';
            html += `<button class="sub-btn ${washActive}" id="toggleLawnWashSubBtn" title="Toggle architectural watercolor grass wash across open setback yard">🌿 Setback Lawn Wash</button>`;

            subBar.innerHTML = html;

            subBar.querySelectorAll('button[data-lcat]').forEach(b => {
                b.onclick = () => {
                    this.activeLandscapeCategory = b.dataset.lcat;
                    const catItems = this.activeLandscapeCategory === 'All'
                        ? landscapeItems
                        : landscapeItems.filter(i => i.cat === this.activeLandscapeCategory);
                    if (catItems.length > 0 && !catItems.some(i => i.id === this.activeLandscapeType)) {
                        this.activeLandscapeType = catItems[0].id;
                    }
                    this.updateToolSubOptions();
                };
            });

            subBar.querySelectorAll('button[data-lid]').forEach(b => {
                b.onclick = () => {
                    this.activeLandscapeType = b.dataset.lid;
                    this.updateToolSubOptions();
                };
            });

            document.getElementById('toggleLawnWashSubBtn')?.addEventListener('click', () => {
                this.plotManager.showLandscapeWash = !this.plotManager.showLandscapeWash;
                this.saveHistory();
                this.updateToolSubOptions();
                this.updateInspector();
                this.render();
            });
        } else if (this.activeTool === 'slab') {
            subBar.style.display = 'flex';
            const slab = this.slabManager;
            const isEnabled = slab ? slab.enabled : false;

            subBar.innerHTML = `
                <span class="sub-label">Roof Slab:</span>
                <button class="sub-btn ${isEnabled ? 'active' : ''}" id="slabSubToggleBtn" title="Toggle Slab Projection Visibility">${isEnabled ? '✓ Slab ON' : '✕ Slab OFF'}</button>
                <span style="color:var(--border-color); margin: 0 4px;">|</span>
                <span class="sub-label">Mode:</span>
                <button class="sub-btn ${slab.mode === 'envelope' ? 'active' : ''}" id="slabModeEnvelopeBtn" title="Auto-contour slab along exterior building envelope">Adaptive Contour</button>
                <button class="sub-btn ${slab.mode === 'bounds' ? 'active' : ''}" id="slabModeBoundsBtn" title="Rectangular bounding box envelope">Bounding Box</button>
                <span style="color:var(--border-color); margin: 0 4px;">|</span>
                <span class="sub-label">Presets:</span>
                <button class="sub-btn" data-slab-preset="standard" title="1'-6&quot; Uniform chajja">1'-6" Standard</button>
                <button class="sub-btn" data-slab-preset="portico" title="4'-0&quot; Entrance portico cantilever">4' Portico</button>
                <button class="sub-btn" data-slab-preset="balcony" title="5'-0&quot; Balcony projection">5' Balcony</button>
                <button class="sub-btn" data-slab-preset="flush" title="Flush with exterior walls (0&quot;)">Flush (0")</button>
                <span style="color:var(--border-color); margin: 0 4px;">|</span>
                <button class="sub-btn highlight" id="slabOpenInspectorBtn" title="Open complete slab customization inspector">⚙️ Customize All</button>
            `;

            document.getElementById('slabSubToggleBtn')?.addEventListener('click', () => {
                slab.enabled = !slab.enabled;
                this.plotManager.showSlabProjection = slab.enabled;
                this.saveHistory();
                this.updateToolSubOptions();
                this.updateInspector();
                this.render();
            });

            document.getElementById('slabModeEnvelopeBtn')?.addEventListener('click', () => {
                slab.mode = 'envelope';
                this.saveHistory();
                this.updateToolSubOptions();
                this.updateInspector();
                this.render();
            });

            document.getElementById('slabModeBoundsBtn')?.addEventListener('click', () => {
                slab.mode = 'bounds';
                this.saveHistory();
                this.updateToolSubOptions();
                this.updateInspector();
                this.render();
            });

            subBar.querySelectorAll('button[data-slab-preset]').forEach(b => {
                b.onclick = () => {
                    slab.applyPreset(b.dataset.slabPreset);
                    this.plotManager.showSlabProjection = slab.enabled;
                    this.plotManager.slabProjectionOffset = slab.uniformOffset;
                    this.saveHistory();
                    this.updateToolSubOptions();
                    this.updateInspector();
                    this.render();
                };
            });

            document.getElementById('slabOpenInspectorBtn')?.addEventListener('click', () => {
                this.selectedCategory = 'slab';
                this.selectedObject = slab;
                this.updateInspector();
            });
        } else {
            subBar.style.display = 'none';
        }
    }

    /**
     * Update Right-Side Properties Inspector Panel
     */
}
