/**
 * inspector.js - The Properties Inspector side panel for every selectable object type.
 *
 * These methods are mixed into HousePlannerApp (see app.js), so `this` is the app.
 */

import { units } from '../units.js';
import { Wall } from '../walls.js';
import { FURNITURE_CATALOG } from '../furniture.js';
import { Stair } from '../stairs.js';
import { COLUMN_PRESETS } from '../columns.js';
import { escapeHtml } from '../util.js';

export class InspectorMethods {
    /** Refresh the Properties panel: group panel for 2+ objects, otherwise the object's own panel plus its Layer row. */
    updateInspector() {
        const panel = document.getElementById('inspectorBody');
        if (!panel) return;
        if (this.selectedCategory === 'multi') { this.renderGroupInspector(panel); return; }
        if (['text', 'leader', 'angdim'].includes(this.selectedCategory) && this.selectedObject) {
            this.renderAnnotationInspector(panel);
            this.appendLayerSection(panel);
            return;
        }
        this.renderObjectInspector();
        this.appendLayerSection(panel);
        if (this.selectedCategory === 'room') this.appendRoomFinishSection(panel);
        if (this.selectedCategory === 'dimension') this.appendDimStyleSection(panel);
    }

    renderObjectInspector() {
        const panel = document.getElementById('inspectorBody');
        if (!panel) return;

        if (!this.selectedObject) {
            // Default: Project Overview & Site Metrics
            let totalPlotArea = '0 Sq Ft';
            let plotBoundsW = '0"';
            let plotBoundsH = '0"';

            if (this.plotManager.plot) {
                const b = this.plotManager.getBounds();
                totalPlotArea = units.formatArea(this.plotManager.getArea()).primary;
                plotBoundsW = units.formatLength(b.width);
                plotBoundsH = units.formatLength(b.height);
            }

            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>Project Overview</h3>
                    <div class="prop-row">
                        <span class="prop-label">Units</span>
                        <span class="prop-val">${units.getSystem().toUpperCase()}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Plot Size</span>
                        <span class="prop-val">${plotBoundsW} × ${plotBoundsH}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Plot Area</span>
                        <span class="prop-val highlight">${totalPlotArea}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Total Walls</span>
                        <span class="prop-val">${this.wallManager.walls.length}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Rooms</span>
                        <span class="prop-val">${this.roomManager.rooms.length}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Openings</span>
                        <span class="prop-val">${this.openingManager.openings.length}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Fixtures</span>
                        <span class="prop-val">${this.furnitureManager.items.length}</span>
                    </div>
                </div>

                ${this.plotManager.plot ? `
                <div class="inspector-section">
                    <h3>Site Setbacks & Markings</h3>
                    <p class="hint-text">Municipal clear setbacks & annotations. "Front" is the road side (currently the ${({ front: 'bottom', rear: 'top', left: 'left', right: 'right' })[this.plotManager.getFrontEdge()]} edge); Left/Right are as seen from the road.</p>
                    <div class="input-grid" style="margin-bottom:8px;">
                        <div>
                            <label>Front (Road)</label>
                            <input type="text" id="quickSbFront" value="${escapeHtml(units.formatLength(this.plotManager.plot.setbacks?.front ?? 60))}">
                        </div>
                        <div>
                            <label>Rear (Back)</label>
                            <input type="text" id="quickSbRear" value="${escapeHtml(units.formatLength(this.plotManager.plot.setbacks?.rear ?? 36))}">
                        </div>
                        <div>
                            <label>Left (Side 1)</label>
                            <input type="text" id="quickSbLeft" value="${escapeHtml(units.formatLength(this.plotManager.plot.setbacks?.left ?? 36))}">
                        </div>
                        <div>
                            <label>Right (Side 2)</label>
                            <input type="text" id="quickSbRight" value="${escapeHtml(units.formatLength(this.plotManager.plot.setbacks?.right ?? 36))}">
                        </div>
                    </div>

                    <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">Setback Presets:</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:10px;">
                        <button class="sub-btn" id="qSbPresetStd">Standard (5', 3', 3')</button>
                        <button class="sub-btn" id="qSbPresetVilla">Villa (10', 5', 5')</button>
                    </div>

                    <div style="border-top:1px solid var(--border-color); margin: 8px 0; padding-top: 8px; display:flex; flex-direction:column; gap:6px;">
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="toggleChainedDims" ${this.plotManager.showChainedDimensions ? 'checked' : ''}>
                            <span>2-Tier Setback Dimensions</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="toggleCornerMarkers" ${this.plotManager.showCornerMarkers ? 'checked' : ''}>
                            <span>Surveyor Corner Nodes (A-D)</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="toggleSetbackShading" ${this.plotManager.showSetbackShading ? 'checked' : ''}>
                            <span>Buildable Envelope Shading</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="toggleSlabProjection" ${(this.slabManager && this.slabManager.enabled) || this.plotManager.showSlabProjection ? 'checked' : ''}>
                            <span style="font-weight:600;">Roof Slab Line (Overhang / Chajja)</span>
                        </label>
                        <div id="slabProjDetails" style="display:${((this.slabManager && this.slabManager.enabled) || this.plotManager.showSlabProjection) ? 'flex' : 'none'}; flex-direction:column; gap:6px; padding-left:22px; font-size:11px;">
                            <div style="display:flex; align-items:center; justify-content:space-between;">
                                <span style="color:var(--text-secondary);">Slab Overhang:</span>
                                <input type="text" id="slabProjOffsetInput" value="${escapeHtml(units.formatLength(this.slabManager ? this.slabManager.uniformOffset : (this.plotManager.slabProjectionOffset || 18)))}" style="width:80px; padding:2px 6px; font-size:11px; background:var(--bg-panel); border:1px solid var(--border-color); color:var(--text-main); border-radius:4px;">
                            </div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">
                                <button class="sub-btn" id="qSlabPresetStd" style="font-size:10px; padding:2px 4px;">1'-6" Std</button>
                                <button class="sub-btn" id="qSlabPresetPortico" style="font-size:10px; padding:2px 4px;">4' Portico</button>
                            </div>
                            <button class="sub-btn highlight" id="openSlabCustomizerBtn" style="width:100%; font-size:10px; padding:3px 6px; text-align:center;">⚙️ Customize All (Edges, Styles, Contours)</button>
                        </div>
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="toggleLandscapeWash" ${this.plotManager.showLandscapeWash ? 'checked' : ''}>
                            <span>Landscape Lawn Wash (Yard Greenery)</span>
                        </label>
                    </div>
                </div>
                ` : `
                <div class="inspector-section">
                    <h3>Quick Plot Setup</h3>
                    <p class="hint-text">Set site boundary dimensions:</p>
                    <div class="input-grid">
                        <div>
                            <label>Width</label>
                            <input type="text" id="quickPlotW" value="30'" placeholder="e.g. 30'">
                        </div>
                        <div>
                            <label>Length</label>
                            <input type="text" id="quickPlotH" value="40'" placeholder="e.g. 40'">
                        </div>
                    </div>
                    <button class="action-btn primary" id="applyPlotBtn" style="margin-top:8px; width:100%;">Create Plot Boundary</button>
                </div>
                `}

                <div class="inspector-section">
                    <h3>Drafting Tips</h3>
                    <ul class="tips-list">
                        <li><b>W:</b> Wall tool (click & drag or click-to-click)</li>
                        <li><b>K:</b> Compound / Boundary Wall tool</li>
                        <li><b>L:</b> Landscape & Greenery tool</li>
                        <li><b>D:</b> Door tool (snaps automatically to walls)</li>
                        <li><b>G:</b> Compound Entrance Gate tool</li>
                        <li><b>N:</b> Window tool</li>
                        <li><b>Shift:</b> Hold for straight angle lock (0°, 45°, 90°)</li>
                        <li><b>Space+Drag:</b> Pan canvas smoothly</li>
                        <li><b>Mouse Wheel:</b> Zoom in and out</li>
                    </ul>
                </div>
            `;

            if (!this.plotManager.plot) {
                document.getElementById('applyPlotBtn')?.addEventListener('click', () => {
                    const wText = document.getElementById('quickPlotW').value;
                    const hText = document.getElementById('quickPlotH').value;
                    const wInches = units.parseInput(wText);
                    const hInches = units.parseInput(hText);
                    if (wInches && hInches) {
                        this.plotManager.createRectangularPlot(0, 0, wInches, hInches);
                        this.canvasEngine.fitToBounds(this.plotManager.getBounds(), 60);
                        this.saveHistory();
                        this.updateInspector();
                    } else {
                        alert('Invalid dimension format. Example: 30\' or 10m');
                    }
                });
            } else {
                const applyQuickSb = (newSb) => {
                    this.plotManager.setSetbacks(newSb);
                    this.saveHistory();
                    this.updateInspector();
                    this.render();
                };
                document.getElementById('quickSbFront')?.addEventListener('change', (e) => {
                    const val = units.parseInput(e.target.value);
                    if (val !== null && val >= 0) applyQuickSb({ front: val });
                });
                document.getElementById('quickSbRear')?.addEventListener('change', (e) => {
                    const val = units.parseInput(e.target.value);
                    if (val !== null && val >= 0) applyQuickSb({ rear: val });
                });
                document.getElementById('quickSbLeft')?.addEventListener('change', (e) => {
                    const val = units.parseInput(e.target.value);
                    if (val !== null && val >= 0) applyQuickSb({ left: val });
                });
                document.getElementById('quickSbRight')?.addEventListener('change', (e) => {
                    const val = units.parseInput(e.target.value);
                    if (val !== null && val >= 0) applyQuickSb({ right: val });
                });
                document.getElementById('qSbPresetStd')?.addEventListener('click', () => {
                    applyQuickSb({ front: 60, rear: 36, left: 36, right: 36 });
                });
                document.getElementById('qSbPresetVilla')?.addEventListener('click', () => {
                    applyQuickSb({ front: 120, rear: 60, left: 60, right: 60 });
                });

                document.getElementById('toggleChainedDims')?.addEventListener('change', (e) => {
                    this.plotManager.showChainedDimensions = e.target.checked;
                    this.saveHistory();
                    this.render();
                });
                document.getElementById('toggleCornerMarkers')?.addEventListener('change', (e) => {
                    this.plotManager.showCornerMarkers = e.target.checked;
                    this.saveHistory();
                    this.render();
                });
                document.getElementById('toggleSetbackShading')?.addEventListener('change', (e) => {
                    this.plotManager.showSetbackShading = e.target.checked;
                    this.saveHistory();
                    this.render();
                });
                document.getElementById('toggleSlabProjection')?.addEventListener('change', (e) => {
                    this.plotManager.showSlabProjection = e.target.checked;
                    if (this.slabManager) this.slabManager.enabled = e.target.checked;
                    const d = document.getElementById('slabProjDetails');
                    if (d) d.style.display = e.target.checked ? 'flex' : 'none';
                    this.saveHistory();
                    this.render();
                });
                document.getElementById('slabProjOffsetInput')?.addEventListener('change', (e) => {
                    const val = units.parseInput(e.target.value);
                    if (val !== null && val >= 0) {
                        this.plotManager.slabProjectionOffset = val;
                        if (this.slabManager) this.slabManager.setUniformOffset(val);
                        this.saveHistory();
                        this.render();
                    }
                });
                document.getElementById('qSlabPresetStd')?.addEventListener('click', () => {
                    if (this.slabManager) this.slabManager.applyPreset('standard');
                    this.plotManager.showSlabProjection = true;
                    this.plotManager.slabProjectionOffset = 18;
                    this.saveHistory();
                    this.updateInspector();
                    this.render();
                });
                document.getElementById('qSlabPresetPortico')?.addEventListener('click', () => {
                    if (this.slabManager) this.slabManager.applyPreset('portico');
                    this.plotManager.showSlabProjection = true;
                    this.saveHistory();
                    this.updateInspector();
                    this.render();
                });
                document.getElementById('openSlabCustomizerBtn')?.addEventListener('click', () => {
                    if (this.slabManager) {
                        this.slabManager.enabled = true;
                        this.plotManager.showSlabProjection = true;
                    }
                    this.selectedCategory = 'slab';
                    this.selectedObject = this.slabManager;
                    this.updateInspector();
                });
                document.getElementById('toggleLandscapeWash')?.addEventListener('change', (e) => {
                    this.plotManager.showLandscapeWash = e.target.checked;
                    this.saveHistory();
                    this.render();
                });
            }

            return;
        }

        // ==========================================
        // ROOF SLAB & CANTILEVER PROJECTION SELECTED
        // ==========================================
        if (this.selectedCategory === 'slab') {
            const slab = this.slabManager;
            const off = slab.getEffectiveOffsets();
            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>Roof Slab & Cantilever Overhangs</h3>
                    <p class="hint-text">RCC slab overhang, chajja & cantilever projection:</p>

                    <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="slabEnableToggle" ${slab.enabled ? 'checked' : ''}>
                            <span style="font-weight:600; color:var(--text-main);">Enable Slab Projection (Dotted Line)</span>
                        </label>
                    </div>

                    <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">Architectural Presets:</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:12px;">
                        <button class="sub-btn" id="slabPresetStd">1'-6" Standard</button>
                        <button class="sub-btn" id="slabPresetPortico">4' Front Portico</button>
                        <button class="sub-btn" id="slabPresetBalcony">5' Deep Balcony</button>
                        <button class="sub-btn" id="slabPresetFlush">Flush (0" Offset)</button>
                    </div>

                    <div class="prop-row">
                        <span class="prop-label">Envelope Mode</span>
                        <select id="slabModeDropdown" class="prop-input" style="width:130px;">
                            <option value="envelope" ${slab.mode === 'envelope' ? 'selected' : ''}>Adaptive Contour</option>
                            <option value="bounds" ${slab.mode === 'bounds' ? 'selected' : ''}>Bounding Box</option>
                        </select>
                    </div>

                    <div style="border-top:1px solid var(--border-color); margin:10px 0; padding-top:10px;">
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; margin-bottom:8px;">
                            <input type="checkbox" id="slabUniformToggle" ${slab.isUniform ? 'checked' : ''}>
                            <span>Uniform Overhang (All Sides Equal)</span>
                        </label>

                        ${slab.isUniform ? `
                            <div class="prop-row">
                                <span class="prop-label">All Edges</span>
                                <div style="display:flex; gap:4px; align-items:center;">
                                    <input type="text" id="slabUniformValInput" class="prop-input" value="${escapeHtml(units.formatLength(slab.uniformOffset))}" style="width:72px;">
                                    <button class="sub-btn" id="slabUniMinusBtn">-6"</button>
                                    <button class="sub-btn" id="slabUniPlusBtn">+6"</button>
                                </div>
                            </div>
                        ` : `
                            <div class="input-grid" style="margin-bottom:8px;">
                                <div>
                                    <label>Front (Cantilever)</label>
                                    <input type="text" id="slabFrontValInput" value="${escapeHtml(units.formatLength(off.front))}">
                                </div>
                                <div>
                                    <label>Rear (Back Eave)</label>
                                    <input type="text" id="slabRearValInput" value="${escapeHtml(units.formatLength(off.rear))}">
                                </div>
                                <div>
                                    <label>Left (Chajja 1)</label>
                                    <input type="text" id="slabLeftValInput" value="${escapeHtml(units.formatLength(off.left))}">
                                </div>
                                <div>
                                    <label>Right (Chajja 2)</label>
                                    <input type="text" id="slabRightValInput" value="${escapeHtml(units.formatLength(off.right))}">
                                </div>
                            </div>
                        `}
                    </div>

                    <div style="border-top:1px solid var(--border-color); margin:10px 0; padding-top:10px;">
                        <h4 style="margin:0 0 8px 0; font-size:12px; color:var(--text-secondary); text-transform:uppercase;">Line & Corner Detailing</h4>
                        <div class="prop-row">
                            <span class="prop-label">Line Pattern</span>
                            <select id="slabPatternDropdown" class="prop-input" style="width:110px;">
                                <option value="dashed" ${slab.pattern === 'dashed' ? 'selected' : ''}>Dashed (╌ ╌)</option>
                                <option value="dotted" ${slab.pattern === 'dotted' ? 'selected' : ''}>Dotted (· ·)</option>
                                <option value="dash_dot" ${slab.pattern === 'dash_dot' ? 'selected' : ''}>Dash-Dot (╌ ·)</option>
                                <option value="solid" ${slab.pattern === 'solid' ? 'selected' : ''}>Solid (──)</option>
                            </select>
                        </div>
                        <div class="prop-row">
                            <span class="prop-label">Line Thickness</span>
                            <select id="slabLineWidthDropdown" class="prop-input" style="width:110px;">
                                <option value="1.0" ${slab.lineWidth === 1.0 ? 'selected' : ''}>1.0px (Fine)</option>
                                <option value="1.4" ${slab.lineWidth === 1.4 ? 'selected' : ''}>1.4px (Standard)</option>
                                <option value="2.2" ${slab.lineWidth === 2.2 ? 'selected' : ''}>2.2px (Bold)</option>
                            </select>
                        </div>
                        <div class="prop-row">
                            <span class="prop-label">Corner Style</span>
                            <select id="slabCornerDropdown" class="prop-input" style="width:110px;">
                                <option value="ticks" ${slab.cornerStyle === 'ticks' ? 'selected' : ''}>L-bracket Ticks</option>
                                <option value="sharp" ${slab.cornerStyle === 'sharp' ? 'selected' : ''}>Sharp Miter (90°)</option>
                                <option value="chamfer" ${slab.cornerStyle === 'chamfer' ? 'selected' : ''}>Chamfered (45°)</option>
                            </select>
                        </div>
                        ${slab.cornerStyle === 'chamfer' ? `
                            <div class="prop-row">
                                <span class="prop-label">Chamfer Size</span>
                                <input type="text" id="slabChamferDistInput" class="prop-input" value="${escapeHtml(units.formatLength(slab.chamferDist || 6))}" style="width:72px;">
                            </div>
                        ` : ''}
                        <div class="prop-row">
                            <span class="prop-label">Line Color</span>
                            <div style="display:flex; gap:6px; align-items:center;">
                                <button class="sub-btn" data-slab-col="#38bdf8" style="padding:2px 6px; color:#38bdf8;">Cyan</button>
                                <button class="sub-btn" data-slab-col="#0284c7" style="padding:2px 6px; color:#0284c7;">CAD Blue</button>
                                <button class="sub-btn" data-slab-col="#eab308" style="padding:2px 6px; color:#eab308;">Yellow</button>
                                <button class="sub-btn" data-slab-col="#ffffff" style="padding:2px 6px; color:#ffffff;">White</button>
                                <input type="color" id="slabColorPicker" value="${escapeHtml(slab.lineColor || '#38bdf8')}" style="width:24px; height:24px; padding:0; border:none; background:transparent; cursor:pointer;">
                            </div>
                        </div>
                    </div>

                    <div style="border-top:1px solid var(--border-color); margin:10px 0; padding-top:10px; display:flex; flex-direction:column; gap:6px;">
                        <h4 style="margin:0 0 6px 0; font-size:12px; color:var(--text-secondary); text-transform:uppercase;">Shading & Visual Fills</h4>
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="slabFillCheck" ${slab.fillEnabled ? 'checked' : ''}>
                            <span>Subtle Shading Tint (Slab Wash)</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="slabHatchCheck" ${slab.showHatch ? 'checked' : ''}>
                            <span>Architectural Hatch (45° RCC Lines)</span>
                        </label>
                    </div>

                    <div style="border-top:1px solid var(--border-color); margin:10px 0; padding-top:10px; display:flex; flex-direction:column; gap:6px;">
                        <h4 style="margin:0 0 6px 0; font-size:12px; color:var(--text-secondary); text-transform:uppercase;">Annotations & Callouts</h4>
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="slabDimsCheck" ${slab.showDimensions ? 'checked' : ''}>
                            <span>Show Overhang Dimensions (e.g. ↕ 4'-0")</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="slabBannerCheck" ${slab.showLabel ? 'checked' : ''}>
                            <span>Show Annotation Text Banner</span>
                        </label>
                        <div id="slabBannerDetails" style="display:${slab.showLabel ? 'flex' : 'none'}; flex-direction:column; gap:6px; padding-left:20px;">
                            <div class="prop-row" style="margin-bottom:4px;">
                                <span class="prop-label">Custom Text</span>
                                <input type="text" id="slabLabelTextInput" class="prop-input" value="${escapeHtml(slab.labelText)}" placeholder="Leave blank for auto" style="width:130px;">
                            </div>
                            <div class="prop-row">
                                <span class="prop-label">Position</span>
                                <select id="slabLabelPosSelect" class="prop-input" style="width:110px;">
                                    <option value="front" ${slab.labelPosition === 'front' ? 'selected' : ''}>Bottom (Front)</option>
                                    <option value="rear" ${slab.labelPosition === 'rear' ? 'selected' : ''}>Top (Rear)</option>
                                    <option value="center" ${slab.labelPosition === 'center' ? 'selected' : ''}>Center</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top:12px; padding:8px; background:rgba(56, 189, 248, 0.08); border:1px solid rgba(56, 189, 248, 0.25); border-radius:6px; font-size:11px; color:#38bdf8;">
                        💡 <b>Canvas Interactive Handles:</b> Drag the 4 glowing edge handles (↕ / ↔) directly on canvas to stretch overhangs visually with live measurements!
                    </div>

                    <button class="action-btn danger" id="slabHideBtn" style="margin-top:12px; width:100%;">Hide Roof Slab</button>
                </div>
            `;

            // Event Listeners for Slab Inspector
            document.getElementById('slabEnableToggle')?.addEventListener('change', (e) => {
                slab.enabled = e.target.checked;
                this.plotManager.showSlabProjection = slab.enabled;
                this.saveHistory();
                this.updateInspector();
                this.render();
            });

            document.getElementById('slabPresetStd')?.addEventListener('click', () => {
                slab.applyPreset('standard');
                this.plotManager.showSlabProjection = slab.enabled;
                this.plotManager.slabProjectionOffset = slab.uniformOffset;
                this.saveHistory();
                this.updateInspector();
                this.render();
            });

            document.getElementById('slabPresetPortico')?.addEventListener('click', () => {
                slab.applyPreset('portico');
                this.plotManager.showSlabProjection = slab.enabled;
                this.plotManager.slabProjectionOffset = slab.uniformOffset;
                this.saveHistory();
                this.updateInspector();
                this.render();
            });

            document.getElementById('slabPresetBalcony')?.addEventListener('click', () => {
                slab.applyPreset('balcony');
                this.plotManager.showSlabProjection = slab.enabled;
                this.plotManager.slabProjectionOffset = slab.uniformOffset;
                this.saveHistory();
                this.updateInspector();
                this.render();
            });

            document.getElementById('slabPresetFlush')?.addEventListener('click', () => {
                slab.applyPreset('flush');
                this.plotManager.showSlabProjection = slab.enabled;
                this.plotManager.slabProjectionOffset = slab.uniformOffset;
                this.saveHistory();
                this.updateInspector();
                this.render();
            });

            document.getElementById('slabModeDropdown')?.addEventListener('change', (e) => {
                slab.mode = e.target.value;
                this.saveHistory();
                this.render();
            });

            document.getElementById('slabUniformToggle')?.addEventListener('change', (e) => {
                slab.isUniform = e.target.checked;
                if (slab.isUniform) {
                    slab.setUniformOffset(slab.uniformOffset);
                }
                this.saveHistory();
                this.updateInspector();
                this.render();
            });

            document.getElementById('slabUniformValInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) {
                    slab.setUniformOffset(val);
                    this.plotManager.slabProjectionOffset = val;
                    this.saveHistory();
                    this.render();
                }
            });

            document.getElementById('slabUniMinusBtn')?.addEventListener('click', () => {
                slab.setUniformOffset(Math.max(0, slab.uniformOffset - 6));
                this.plotManager.slabProjectionOffset = slab.uniformOffset;
                this.saveHistory();
                this.updateInspector();
                this.render();
            });

            document.getElementById('slabUniPlusBtn')?.addEventListener('click', () => {
                slab.setUniformOffset(slab.uniformOffset + 6);
                this.plotManager.slabProjectionOffset = slab.uniformOffset;
                this.saveHistory();
                this.updateInspector();
                this.render();
            });

            document.getElementById('slabFrontValInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) {
                    slab.setEdgeOffset('front', val);
                    this.saveHistory();
                    this.render();
                }
            });

            document.getElementById('slabRearValInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) {
                    slab.setEdgeOffset('rear', val);
                    this.saveHistory();
                    this.render();
                }
            });

            document.getElementById('slabLeftValInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) {
                    slab.setEdgeOffset('left', val);
                    this.saveHistory();
                    this.render();
                }
            });

            document.getElementById('slabRightValInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) {
                    slab.setEdgeOffset('right', val);
                    this.saveHistory();
                    this.render();
                }
            });

            document.getElementById('slabPatternDropdown')?.addEventListener('change', (e) => {
                slab.pattern = e.target.value;
                this.saveHistory();
                this.render();
            });

            document.getElementById('slabLineWidthDropdown')?.addEventListener('change', (e) => {
                slab.lineWidth = parseFloat(e.target.value);
                this.saveHistory();
                this.render();
            });

            document.getElementById('slabCornerDropdown')?.addEventListener('change', (e) => {
                slab.cornerStyle = e.target.value;
                this.saveHistory();
                this.updateInspector();
                this.render();
            });

            document.getElementById('slabChamferDistInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val > 0) {
                    slab.chamferDist = val;
                    this.saveHistory();
                    this.render();
                }
            });

            panel.querySelectorAll('button[data-slab-col]').forEach(b => {
                b.onclick = () => {
                    slab.lineColor = b.dataset.slabCol;
                    const p = document.getElementById('slabColorPicker');
                    if (p) p.value = slab.lineColor;
                    this.saveHistory();
                    this.render();
                };
            });

            document.getElementById('slabColorPicker')?.addEventListener('input', (e) => {
                slab.lineColor = e.target.value;
                this.saveHistoryCoalesced('slabColorPicker:' + (this.selectedObject && this.selectedObject.id));
                this.render();
            });

            document.getElementById('slabFillCheck')?.addEventListener('change', (e) => {
                slab.fillEnabled = e.target.checked;
                this.saveHistory();
                this.render();
            });

            document.getElementById('slabHatchCheck')?.addEventListener('change', (e) => {
                slab.showHatch = e.target.checked;
                this.saveHistory();
                this.render();
            });

            document.getElementById('slabDimsCheck')?.addEventListener('change', (e) => {
                slab.showDimensions = e.target.checked;
                this.saveHistory();
                this.render();
            });

            document.getElementById('slabBannerCheck')?.addEventListener('change', (e) => {
                slab.showLabel = e.target.checked;
                const d = document.getElementById('slabBannerDetails');
                if (d) d.style.display = e.target.checked ? 'flex' : 'none';
                this.saveHistory();
                this.render();
            });

            document.getElementById('slabLabelTextInput')?.addEventListener('input', (e) => {
                slab.labelText = e.target.value;
                this.saveHistoryCoalesced('slabLabelTextInput:' + (this.selectedObject && this.selectedObject.id));
                this.render();
            });

            document.getElementById('slabLabelPosSelect')?.addEventListener('change', (e) => {
                slab.labelPosition = e.target.value;
                this.saveHistory();
                this.render();
            });

            document.getElementById('slabHideBtn')?.addEventListener('click', () => {
                slab.enabled = false;
                this.plotManager.showSlabProjection = false;
                this.clearSelection();
                this.saveHistory();
                this.render();
            });

            return;
        }

        // ==========================================
        // WALL SELECTED
        // ==========================================
        if (this.selectedCategory === 'wall') {
            const w = this.selectedObject;
            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>Wall Properties</h3>
                    <div class="prop-row">
                        <span class="prop-label">Length</span>
                        <div style="display:flex; gap:4px; align-items:center;">
                            <input type="text" id="wallLengthInput" class="prop-input" value="${escapeHtml(units.formatLength(w.getLength()))}" style="width:82px; font-weight:600;">
                            <button class="sub-btn active" id="applyWallLenBtn" title="Apply new length">Apply</button>
                        </div>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Anchor Point</span>
                        <select id="wallAnchorSelect" class="prop-input" style="width:115px;">
                            <option value="start">Corner 1 (Start)</option>
                            <option value="end">Corner 2 (End)</option>
                            <option value="center">Symmetric (Center)</option>
                        </select>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Type</span>
                        <select id="wallTypeSelect" class="prop-input">
                            <option value="exterior" ${w.type === 'exterior' ? 'selected' : ''}>Exterior (9" / 230mm)</option>
                            <option value="interior" ${w.type === 'interior' ? 'selected' : ''}>Interior (4.5" / 115mm)</option>
                            <option value="compound" ${w.type === 'compound' ? 'selected' : ''}>Compound (6" / 150mm)</option>
                        </select>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Thickness</span>
                        <input type="text" id="wallThickInput" class="prop-input" value="${escapeHtml(units.formatLength(w.thickness))}">
                    </div>

                    <div style="display:flex; gap:6px; margin-top:12px;">
                        <button class="action-btn" id="splitMidBtn" style="flex:1;">✂ Split Midpoint</button>
                        <button class="action-btn" id="splitHoverBtn" style="flex:1;" ${this.hoveredWallInfo ? '' : 'disabled'}>✂ Split at Cursor</button>
                    </div>

                    <button class="action-btn danger" id="deleteSelectedBtn" style="margin-top:10px; width:100%;">Delete Wall</button>
                </div>
            `;

            const applyLengthChange = () => {
                const text = document.getElementById('wallLengthInput').value;
                const newLen = units.parseInput(text);
                const anchor = document.getElementById('wallAnchorSelect').value;
                if (newLen && newLen >= 6) {
                    this.wallManager.setWallLength(w.id, newLen, anchor);
                    this.saveHistory();
                    this.updateInspector();
                } else {
                    alert('Please enter a valid length (e.g. 14\' or 14\' 6" or 4.5m).');
                }
            };
            document.getElementById('applyWallLenBtn')?.addEventListener('click', applyLengthChange);
            document.getElementById('wallLengthInput')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') applyLengthChange();
            });

            document.getElementById('splitMidBtn')?.addEventListener('click', () => {
                const mid = w.getMidpoint();
                const res = this.wallManager.splitWall(w.id, mid, this.openingManager);
                if (res) {
                    this.saveHistory();
                    this.selectedCategory = 'wall';
                    this.selectedObject = res.wall1;
                    this.wallManager.selectedWallId = res.wall1.id;
                    this.updateInspector();
                }
            });

            document.getElementById('splitHoverBtn')?.addEventListener('click', () => {
                if (this.hoveredWallInfo && this.hoveredWallInfo.wall.id === w.id) {
                    const res = this.wallManager.splitWall(w.id, this.hoveredWallInfo.point, this.openingManager);
                    if (res) {
                        this.saveHistory();
                        this.selectedCategory = 'wall';
                        this.selectedObject = res.wall1;
                        this.wallManager.selectedWallId = res.wall1.id;
                        this.updateInspector();
                    }
                }
            });

            document.getElementById('wallTypeSelect')?.addEventListener('change', (e) => {
                w.type = e.target.value;
                if (w.type === 'compound') {
                    w.thickness = 6;
                } else {
                    w.thickness = w.type === 'exterior' ? 9 : 4.5;
                }
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('wallThickInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val > 0) {
                    w.thickness = val;
                    this.saveHistory();
                }
            });

            document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.deleteSelected());
            return;
        }

        // ==========================================
        // COLUMN SELECTED
        // ==========================================
        if (this.selectedCategory === 'column') {
            const col = this.selectedObject;
            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>RCC Column Properties</h3>
                    <div class="prop-row">
                        <span class="prop-label">Column ID</span>
                        <input type="text" id="colNameInput" class="prop-input" value="${escapeHtml(col.name || 'C1')}" style="width:90px;">
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Standard Preset</span>
                        <select id="colPresetSelect" class="prop-input" style="width:140px; font-size:11px;">
                            ${COLUMN_PRESETS.map((p, idx) => `<option value="${idx}" ${col.width === p.width && col.depth === p.depth ? 'selected' : ''}>${p.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="input-grid" style="margin-top:10px;">
                        <div>
                            <label>Width</label>
                            <input type="text" id="colWInput" value="${escapeHtml(units.formatLength(col.width))}">
                        </div>
                        <div>
                            <label>Depth</label>
                            <input type="text" id="colDInput" value="${escapeHtml(units.formatLength(col.depth))}">
                        </div>
                    </div>
                    <div class="prop-row" style="margin-top:10px;">
                        <span class="prop-label">Orientation</span>
                        <span class="prop-val highlight">${col.rotation || 0}°</span>
                    </div>
                    <div style="display:flex; gap:8px; margin-top:8px;">
                        <button class="action-btn" id="colRotateBtn" style="flex:1;" title="Rotate 90 degrees (Hotkey: R)">↻ Rotate 90°</button>
                    </div>
                    <div class="prop-row" style="margin-top:10px;">
                        <span class="prop-label">Show Label</span>
                        <input type="checkbox" id="colShowLabelCheck" ${col.showLabel ? 'checked' : ''} style="accent-color:var(--accent-blue); width:16px; height:16px; cursor:pointer;">
                    </div>
                    <button class="action-btn danger" id="deleteColBtn" style="margin-top:14px; width:100%;">Delete Column</button>
                </div>
            `;

            document.getElementById('colNameInput')?.addEventListener('input', (e) => {
                col.name = e.target.value;
                this.saveHistoryCoalesced('colNameInput:' + (this.selectedObject && this.selectedObject.id));
            });
            document.getElementById('colPresetSelect')?.addEventListener('change', (e) => {
                const preset = COLUMN_PRESETS[parseInt(e.target.value)];
                if (preset) {
                    col.width = preset.width;
                    col.depth = preset.depth;
                    this.saveHistory();
                    this.updateInspector();
                }
            });
            document.getElementById('colWInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val >= 4) {
                    col.width = val;
                    this.saveHistory();
                    this.updateInspector();
                }
            });
            document.getElementById('colDInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val >= 4) {
                    col.depth = val;
                    this.saveHistory();
                    this.updateInspector();
                }
            });
            document.getElementById('colRotateBtn')?.addEventListener('click', () => {
                col.rotate(90);
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('colShowLabelCheck')?.addEventListener('change', (e) => {
                col.showLabel = e.target.checked;
                this.saveHistory();
            });
            document.getElementById('deleteColBtn')?.addEventListener('click', () => this.deleteSelected());
            return;
        }

        // ==========================================
        // OPENING (DOOR / WINDOW / GATE) SELECTED
        // ==========================================
        if (this.selectedCategory === 'opening') {
            const op = this.selectedObject;
            const isGate = op.type === 'gate';
            const isDoor = op.type === 'door';
            const titleName = isGate ? 'Compound Gate' : (isDoor ? 'Door' : 'Window');

            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>${titleName} Properties</h3>
                    <div class="prop-row">
                        <span class="prop-label">Width</span>
                        <input type="text" id="opWidthInput" class="prop-input" value="${escapeHtml(units.formatLength(op.width))}">
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Subtype</span>
                        ${isGate ? `
                        <select id="gateSubtypeSelect" class="prop-input" style="width:130px; font-size:11px;">
                            <option value="sliding" ${op.subtype === 'sliding' ? 'selected' : ''}>Sliding Gate</option>
                            <option value="swing" ${op.subtype === 'swing' ? 'selected' : ''}>Double Swing</option>
                        </select>
                        ` : `<span class="prop-val">${op.subtype}</span>`}
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Label</span>
                        <input type="text" id="opLabelInput" class="prop-input" value="${escapeHtml(op.label)}" style="width:80px;">
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Show Dimension</span>
                        <input type="checkbox" id="opShowDimCheck" ${op.showMeasurement ? 'checked' : ''} style="accent-color:var(--accent-blue); width:16px; height:16px; cursor:pointer;">
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Show Label</span>
                        <input type="checkbox" id="opShowLabelCheck" ${op.showLabel ? 'checked' : ''} style="accent-color:var(--accent-blue); width:16px; height:16px; cursor:pointer;">
                    </div>
                    ${(isDoor || isGate) ? `
                    <div class="prop-row">
                        <span class="prop-label">Orientation / Swing</span>
                        <span class="prop-val highlight">${op.flipSwing ? 'Flipped (Side B)' : 'Standard (Side A)'}</span>
                    </div>
                    <div style="display:flex; gap:8px; margin-top:10px;">
                        ${isDoor ? `<button class="action-btn" id="flipHingeBtn" style="flex:1;" title="Toggle hinge side between left and right jambs (Hotkey: H)">Flip Hinge</button>` : ''}
                        <button class="action-btn" id="flipSwingBtn" style="flex:1;" title="Toggle swing direction (Hotkey: R or F)">Flip Swing</button>
                    </div>
                    ` : ''}
                    <button class="action-btn danger" id="deleteSelectedBtn" style="margin-top:12px; width:100%;">Delete ${titleName}</button>
                </div>
            `;

            document.getElementById('opWidthInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val > 12) {
                    const hostWall = this.wallManager.getWallById(op.wallId);
                    const fit = hostWall ? this.openingManager.checkPlacement(hostWall, op.t, val, op.id) : { ok: true, t: op.t };
                    if (!fit.ok) {
                        this.setAutosavePill('● ' + fit.reason, '#f59e0b');
                        this.updateInspector();   // put the old value back in the field
                        return;
                    }
                    op.width = val;
                    op.t = fit.t;
                    this.saveHistory();
                }
            });

            document.getElementById('gateSubtypeSelect')?.addEventListener('change', (e) => {
                op.subtype = e.target.value;
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('opLabelInput')?.addEventListener('input', (e) => {
                op.label = e.target.value;
                this.saveHistoryCoalesced('opLabelInput:' + (this.selectedObject && this.selectedObject.id));
            });

            document.getElementById('opShowDimCheck')?.addEventListener('change', (e) => {
                op.showMeasurement = e.target.checked;
                this.saveHistory();
            });

            document.getElementById('opShowLabelCheck')?.addEventListener('change', (e) => {
                op.showLabel = e.target.checked;
                this.saveHistory();
            });

            document.getElementById('flipHingeBtn')?.addEventListener('click', () => {
                this.openingManager.flipHinge(op.id);
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('flipSwingBtn')?.addEventListener('click', () => {
                this.openingManager.flipSwing(op.id);
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.deleteSelected());
            return;
        }

        // ==========================================
        // ROOM SELECTED
        // ==========================================
        if (this.selectedCategory === 'room') {
            const r = this.selectedObject;
            const area = units.formatArea(r.getArea());
            const currentScale = r.labelScale !== undefined ? r.labelScale : 1.0;
            const pct = Math.round(currentScale * 100);
            const rotNorm = ((r.rotation || 0) % 360 + 360) % 360;

            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>Room Inspector</h3>
                    <div class="prop-row">
                        <span class="prop-label">Room Name</span>
                        <input type="text" id="roomNameInput" class="prop-input" value="${escapeHtml(r.name)}">
                    </div>
                    <div class="prop-row">
                        <span class="prop-label" title="Room width × height as drawn. It does not subtract wall thickness, so it is larger than the usable (carpet) floor area.">Nominal Area</span>
                        <span class="prop-val highlight">${area.primary}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Alternate</span>
                        <span class="prop-val">${area.secondary}</span>
                    </div>
                    <div class="input-grid" style="margin-top:10px;">
                        <div>
                            <label>Width</label>
                            <input type="text" id="roomWInput" value="${escapeHtml(units.formatLength(r.width))}">
                        </div>
                        <div>
                            <label>Height</label>
                            <input type="text" id="roomHInput" value="${escapeHtml(units.formatLength(r.height))}">
                        </div>
                    </div>

                    <!-- Room Label Resizing Controls -->
                    <div style="border-top:1px solid var(--border-color); margin: 12px 0 8px 0; padding-top: 10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                            <span class="prop-label" style="font-weight:600; color:#38bdf8;">Label Size</span>
                            <span id="labelScaleVal" style="font-size:12px; font-weight:bold; color:#38bdf8;">${pct}%</span>
                        </div>

                        <!-- Size Preset Buttons -->
                        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:5px; margin-bottom:8px;">
                            <button class="sub-btn ${currentScale <= 0.8 ? 'active' : ''}" id="lblSizeS">Small</button>
                            <button class="sub-btn ${currentScale > 0.8 && currentScale <= 1.15 ? 'active' : ''}" id="lblSizeM">Medium</button>
                            <button class="sub-btn ${currentScale > 1.15 && currentScale <= 1.55 ? 'active' : ''}" id="lblSizeL">Large</button>
                            <button class="sub-btn ${currentScale > 1.55 ? 'active' : ''}" id="lblSizeXL">X-Large</button>
                        </div>

                        <!-- Range Slider with Step Buttons -->
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                            <button class="sub-btn" id="lblScaleDec" title="Decrease Size (Hotkey: [)" style="padding:4px 8px; font-weight:bold;">A-</button>
                            <input type="range" id="labelScaleSlider" min="50" max="250" step="5" value="${pct}" style="flex:1; cursor:pointer;">
                            <button class="sub-btn" id="lblScaleInc" title="Increase Size (Hotkey: ])" style="padding:4px 8px; font-weight:bold;">A+</button>
                        </div>

                        <!-- Display Toggles -->
                        <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
                            <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer; color:var(--text-secondary);">
                                <input type="checkbox" id="showDimCheck" ${r.showDimensions !== false ? 'checked' : ''}>
                                Show Dimensions
                            </label>
                            <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer; color:var(--text-secondary);">
                                <input type="checkbox" id="showAreaCheck" ${r.showArea !== false ? 'checked' : ''}>
                                Show Nominal Area
                            </label>
                        </div>
                    </div>

                    <!-- Room Label Orientation & Rotation Controls -->
                    <div style="border-top:1px solid var(--border-color); margin: 12px 0 8px 0; padding-top: 10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                            <span class="prop-label" style="font-weight:600; color:#38bdf8;">Label Orientation</span>
                            <span id="roomRotVal" style="font-size:12px; font-weight:bold; color:#38bdf8;">${rotNorm}°</span>
                        </div>

                        <!-- Rotation Presets -->
                        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:5px; margin-bottom:8px;">
                            <button class="sub-btn ${rotNorm === 0 ? 'active' : ''}" id="rotPreset0">0°</button>
                            <button class="sub-btn ${rotNorm === 90 ? 'active' : ''}" id="rotPreset90">90°</button>
                            <button class="sub-btn ${rotNorm === 180 ? 'active' : ''}" id="rotPreset180">180°</button>
                            <button class="sub-btn ${rotNorm === 270 ? 'active' : ''}" id="rotPreset270">270°</button>
                        </div>

                        <!-- Quick Rotate Buttons (⟲ -90°, ⟳ +90°, +45°) -->
                        <div style="display:flex; gap:6px; margin-bottom:8px;">
                            <button class="sub-btn" id="roomRotNeg90Btn" style="flex:1;" title="Rotate Counter-Clockwise 90°">⟲ -90°</button>
                            <button class="sub-btn" id="roomRot90Btn" style="flex:1;" title="Rotate Clockwise 90° (Hotkey: R)">⟳ +90°</button>
                            <button class="sub-btn" id="roomRot45Btn" style="flex:1;" title="Rotate Clockwise 45°">+45°</button>
                        </div>

                        <!-- Angle Slider (0 to 360) -->
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                            <span style="font-size:10px; color:var(--text-secondary);">0°</span>
                            <input type="range" id="roomRotSlider" min="0" max="360" step="15" value="${rotNorm}" style="flex:1; cursor:pointer;">
                            <span style="font-size:10px; color:var(--text-secondary);">360°</span>
                        </div>
                    </div>

                    <!-- Room Tag Style: Pill Badge vs Clean Floating CAD Style -->
                    <div style="border-top:1px solid var(--border-color); margin: 12px 0 8px 0; padding-top: 10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                            <span class="prop-label" style="font-weight:600; color:#38bdf8;">Tag Style</span>
                            <span class="prop-val highlight">${r.tagStyle === 'clean' ? 'Clean Floating' : 'Pill Badge'}</span>
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; margin-bottom:8px;">
                            <button class="sub-btn ${r.tagStyle !== 'clean' ? 'active' : ''}" id="roomTagPillBtn">🏷 Pill Badge</button>
                            <button class="sub-btn ${r.tagStyle === 'clean' ? 'active' : ''}" id="roomTagCleanBtn">📄 Clean Floating</button>
                        </div>
                        <button class="action-btn" id="applyCleanAllRoomsBtn" style="width:100%; font-size:11px; padding:4px;" title="Switch all room tags to clean floating CAD style">Apply Clean Style to All Rooms</button>
                    </div>

                    <!-- Ceiling, Volume & Slab Markings -->
                    <div style="border-top:1px solid var(--border-color); margin: 12px 0 8px 0; padding-top: 10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                            <span class="prop-label" style="font-weight:600; color:#38bdf8;">Ceiling & Slab Markings</span>
                            <span class="prop-val highlight" id="roomVolumeBadge">${r.isDoubleHeight ? 'Double Height' : r.isVoid ? 'Slab Cutout' : r.dottedSlabLine ? 'Dotted Slab' : 'Standard 10\''}</span>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px;">
                            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; color:var(--text-main); font-weight:500;">
                                <input type="checkbox" id="doubleHeightCheck" ${r.isDoubleHeight ? 'checked' : ''}>
                                <span>✦ Double Height Ceiling</span>
                            </label>

                            <div id="doubleHeightDetails" style="display:${r.isDoubleHeight ? 'block' : 'none'}; padding-left:22px;">
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
                                    <span style="font-size:11px; color:var(--text-secondary);">Clear Height:</span>
                                    <input type="text" id="ceilingHeightInput" value="${escapeHtml(units.formatLength(r.ceilingHeight || 240))}" style="width:95px; padding:3px 8px; font-size:12px; background:var(--bg-panel); border:1px solid var(--border-color); color:var(--text-main); border-radius:4px;">
                                </div>
                                <div style="font-size:11px; color:#38bdf8; line-height:1.3;">
                                    Extends through 2 floors. Displays volume tag and corner brackets on plan.
                                </div>
                            </div>

                            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; color:var(--text-main); font-weight:500;">
                                <input type="checkbox" id="voidCutoutCheck" ${r.isVoid ? 'checked' : ''}>
                                <span>☒ Slab Cutout / Open to Below</span>
                            </label>
                            <div id="voidCutoutDetails" style="display:${r.isVoid ? 'block' : 'none'}; padding-left:22px; font-size:11px; color:var(--text-secondary); line-height:1.3;">
                                <div>Architectural diagonal cross (X) representing floor void / upper level cutout.</div>
                                <label style="display:flex; align-items:center; gap:6px; margin-top:5px; font-size:11px; color:var(--text-main); cursor:pointer;">
                                    <input type="checkbox" id="voidDottedPerimeterCheck" ${r.dottedCutoutPerimeter ? 'checked' : ''}>
                                    <span>╌ Dotted Line Cutout Perimeter</span>
                                </label>
                            </div>

                            <!-- Dotted Line to Slab Markings / Projection -->
                            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; color:var(--text-main); font-weight:500;">
                                <input type="checkbox" id="dottedSlabCheck" ${r.dottedSlabLine ? 'checked' : ''}>
                                <span>╌ Dotted Line Slab Marking</span>
                            </label>
                            <div id="dottedSlabDetails" style="display:${r.dottedSlabLine ? 'block' : 'none'}; padding-left:22px; font-size:11px; color:var(--text-secondary); line-height:1.3;">
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
                                    <span style="font-size:11px; color:var(--text-secondary);">Slab Overhang / Offset:</span>
                                    <input type="text" id="slabOffsetInput" value="${escapeHtml(units.formatLength(r.slabOffset || 0))}" style="width:95px; padding:3px 8px; font-size:12px; background:var(--bg-panel); border:1px solid var(--border-color); color:var(--text-main); border-radius:4px;">
                                </div>
                                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:4px; margin-bottom:6px;">
                                    <button class="sub-btn" id="slabOffPreset0">Flush 0'</button>
                                    <button class="sub-btn" id="slabOffPreset18">1'-6"</button>
                                    <button class="sub-btn" id="slabOffPreset24">2'-0"</button>
                                    <button class="sub-btn" id="slabOffPreset36">3'-0"</button>
                                </div>
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
                                    <span style="font-size:11px; color:var(--text-secondary);">Line Pattern:</span>
                                    <select id="slabPatternSelect" style="width:110px; padding:3px 6px; font-size:11px; background:var(--bg-panel); border:1px solid var(--border-color); color:var(--text-main); border-radius:4px;">
                                        <option value="dashed" ${r.slabLinePattern === 'dashed' ? 'selected' : ''}>Dashed (╌ ╌)</option>
                                        <option value="dotted" ${r.slabLinePattern === 'dotted' ? 'selected' : ''}>Dotted (······)</option>
                                        <option value="dash_dot" ${r.slabLinePattern === 'dash_dot' ? 'selected' : ''}>Dash-Dot (— · —)</option>
                                    </select>
                                </div>
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                                    <span style="font-size:11px; color:var(--text-secondary);">Slab Tag Note:</span>
                                    <input type="text" id="slabTagNoteInput" value="${escapeHtml(r.slabLabel)}" placeholder="e.g. SLAB PROJECTION" style="width:110px; padding:3px 6px; font-size:11px; background:var(--bg-panel); border:1px solid var(--border-color); color:var(--text-main); border-radius:4px;">
                                </div>
                            </div>
                        </div>
                    </div>

                    <button class="action-btn danger" id="deleteSelectedBtn" style="margin-top:12px; width:100%;">Delete Room</button>
                </div>
            `;

            document.getElementById('roomNameInput')?.addEventListener('input', (e) => {
                r.name = e.target.value;
                this.saveHistoryCoalesced('roomNameInput:' + (this.selectedObject && this.selectedObject.id));
            });

            document.getElementById('roomWInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val > 0) { r.width = val; this.saveHistory(); this.updateInspector(); }
            });

            document.getElementById('roomHInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val > 0) { r.height = val; this.saveHistory(); this.updateInspector(); }
            });

            // Label Size Slider
            const slider = document.getElementById('labelScaleSlider');
            const scaleValSpan = document.getElementById('labelScaleVal');
            slider?.addEventListener('input', (e) => {
                const val = parseInt(e.target.value) / 100;
                r.labelScale = val;
                if (scaleValSpan) scaleValSpan.textContent = `${Math.round(val * 100)}%`;
            });
            slider?.addEventListener('change', () => {
                this.saveHistory();
                this.updateInspector();
            });

            // Preset Buttons
            document.getElementById('lblSizeS')?.addEventListener('click', () => {
                r.labelScale = 0.75;
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('lblSizeM')?.addEventListener('click', () => {
                r.labelScale = 1.0;
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('lblSizeL')?.addEventListener('click', () => {
                r.labelScale = 1.4;
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('lblSizeXL')?.addEventListener('click', () => {
                r.labelScale = 1.8;
                this.saveHistory();
                this.updateInspector();
            });

            // Step Buttons (A- and A+)
            document.getElementById('lblScaleDec')?.addEventListener('click', () => {
                r.labelScale = Math.max(0.5, Math.round(((r.labelScale || 1.0) - 0.1) * 100) / 100);
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('lblScaleInc')?.addEventListener('click', () => {
                r.labelScale = Math.min(2.5, Math.round(((r.labelScale || 1.0) + 0.1) * 100) / 100);
                this.saveHistory();
                this.updateInspector();
            });

            // Rotation controls
            const rotSlider = document.getElementById('roomRotSlider');
            const rotValSpan = document.getElementById('roomRotVal');
            rotSlider?.addEventListener('input', (e) => {
                const deg = parseInt(e.target.value) || 0;
                r.rotation = deg % 360;
                if (rotValSpan) rotValSpan.textContent = `${r.rotation}°`;
            });
            rotSlider?.addEventListener('change', () => {
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('rotPreset0')?.addEventListener('click', () => {
                r.rotation = 0;
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('rotPreset90')?.addEventListener('click', () => {
                r.rotation = 90;
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('rotPreset180')?.addEventListener('click', () => {
                r.rotation = 180;
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('rotPreset270')?.addEventListener('click', () => {
                r.rotation = 270;
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('roomRotNeg90Btn')?.addEventListener('click', () => {
                r.rotate(-90);
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('roomRot90Btn')?.addEventListener('click', () => {
                r.rotate(90);
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('roomRot45Btn')?.addEventListener('click', () => {
                r.rotate(45);
                this.saveHistory();
                this.updateInspector();
            });

            // Toggles
            document.getElementById('showDimCheck')?.addEventListener('change', (e) => {
                r.showDimensions = e.target.checked;
                this.saveHistory();
            });
            document.getElementById('showAreaCheck')?.addEventListener('change', (e) => {
                r.showArea = e.target.checked;
                this.saveHistory();
            });

            // Tag Style Toggles
            document.getElementById('roomTagPillBtn')?.addEventListener('click', () => {
                r.tagStyle = 'pill';
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('roomTagCleanBtn')?.addEventListener('click', () => {
                r.tagStyle = 'clean';
                this.saveHistory();
                this.updateInspector();
            });
            document.getElementById('applyCleanAllRoomsBtn')?.addEventListener('click', () => {
                this.roomManager.rooms.forEach(rm => rm.tagStyle = 'clean');
                this.saveHistory();
                this.updateInspector();
            });

            // Ceiling & Double Height Controls
            document.getElementById('doubleHeightCheck')?.addEventListener('change', (e) => {
                r.isDoubleHeight = e.target.checked;
                if (r.isDoubleHeight) {
                    r.isVoid = false;
                    r.ceilingHeight = r.ceilingHeight || 240;
                }
                this.saveHistory();
                this.updateInspector();
                this.render();
            });

            document.getElementById('ceilingHeightInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val > 0) {
                    r.ceilingHeight = val;
                    this.saveHistory();
                    this.updateInspector();
                    this.render();
                }
            });

            document.getElementById('voidCutoutCheck')?.addEventListener('change', (e) => {
                r.isVoid = e.target.checked;
                if (r.isVoid) {
                    r.isDoubleHeight = false;
                    if (!r.name || r.name === 'Room' || r.name === 'Living Room') {
                        r.name = 'Open to Below';
                    }
                }
                this.saveHistory();
                this.updateInspector();
                this.render();
            });

            document.getElementById('voidDottedPerimeterCheck')?.addEventListener('change', (e) => {
                r.dottedCutoutPerimeter = e.target.checked;
                this.saveHistory();
                this.render();
            });

            document.getElementById('dottedSlabCheck')?.addEventListener('change', (e) => {
                r.dottedSlabLine = e.target.checked;
                this.saveHistory();
                this.updateInspector();
                this.render();
            });

            document.getElementById('slabOffsetInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) {
                    r.slabOffset = val;
                    this.saveHistory();
                    this.updateInspector();
                    this.render();
                }
            });

            const setSlabOff = (inInches) => {
                r.slabOffset = inInches;
                this.saveHistory();
                this.updateInspector();
                this.render();
            };
            document.getElementById('slabOffPreset0')?.addEventListener('click', () => setSlabOff(0));
            document.getElementById('slabOffPreset18')?.addEventListener('click', () => setSlabOff(18));
            document.getElementById('slabOffPreset24')?.addEventListener('click', () => setSlabOff(24));
            document.getElementById('slabOffPreset36')?.addEventListener('click', () => setSlabOff(36));

            document.getElementById('slabPatternSelect')?.addEventListener('change', (e) => {
                r.slabLinePattern = e.target.value;
                this.saveHistory();
                this.render();
            });

            document.getElementById('slabTagNoteInput')?.addEventListener('input', (e) => {
                r.slabLabel = e.target.value;
                this.saveHistoryCoalesced('slabTagNoteInput:' + (this.selectedObject && this.selectedObject.id));
                this.render();
            });

            document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.deleteSelected());
            return;
        }

        // ==========================================
        // FURNITURE SELECTED
        // ==========================================
        if (this.selectedCategory === 'furniture') {
            const item = this.selectedObject;
            const catalogItem = FURNITURE_CATALOG.find(c => c.id === item.typeId);
            const defaultW = catalogItem ? catalogItem.width : 36;
            const defaultH = catalogItem ? catalogItem.height : 36;
            const isCustomSize = Math.abs(item.width - defaultW) > 0.5 || Math.abs(item.height - defaultH) > 0.5;

            // Generate category-specific quick preset pills
            let presetsHtml = '';
            if (item.typeId.startsWith('bed')) {
                presetsHtml = `
                    <div style="margin-top:8px;">
                        <span class="prop-label" style="font-size:11px; color:#94a3b8;">Bed Presets:</span>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 76) < 1 && Math.abs(item.height - 84) < 1 ? 'active' : ''}" data-w="76" data-h="84">King (6'4"×7')</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 60) < 1 && Math.abs(item.height - 80) < 1 ? 'active' : ''}" data-w="60" data-h="80">Queen (5'×6'8")</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 48) < 1 && Math.abs(item.height - 75) < 1 ? 'active' : ''}" data-w="48" data-h="75">Double (4'×6'3")</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 36) < 1 && Math.abs(item.height - 75) < 1 ? 'active' : ''}" data-w="36" data-h="75">Single (3'×6'3")</button>
                        </div>
                    </div>
                `;
            } else if (item.typeId === 'wardrobe') {
                presetsHtml = `
                    <div style="margin-top:8px;">
                        <span class="prop-label" style="font-size:11px; color:#94a3b8;">Wardrobe Width:</span>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 48) < 1 ? 'active' : ''}" data-w="48" data-h="24">4 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 60) < 1 ? 'active' : ''}" data-w="60" data-h="24">5 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 72) < 1 ? 'active' : ''}" data-w="72" data-h="24">6 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 96) < 1 ? 'active' : ''}" data-w="96" data-h="24">8 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 120) < 1 ? 'active' : ''}" data-w="120" data-h="24">10 ft</button>
                        </div>
                    </div>
                `;
            } else if (item.typeId.startsWith('sofa') || item.typeId === 'armchair') {
                presetsHtml = `
                    <div style="margin-top:8px;">
                        <span class="prop-label" style="font-size:11px; color:#94a3b8;">Sofa Presets:</span>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 84) < 1 ? 'active' : ''}" data-w="84" data-h="36">3-Seater (7')</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 60) < 1 ? 'active' : ''}" data-w="60" data-h="34">2-Seater (5')</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 34) < 1 ? 'active' : ''}" data-w="34" data-h="34">Armchair</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 96) < 1 ? 'active' : ''}" data-w="96" data-h="36">4-Seater (8')</button>
                        </div>
                    </div>
                `;
            } else if (item.typeId.startsWith('dining')) {
                presetsHtml = `
                    <div style="margin-top:8px;">
                        <span class="prop-label" style="font-size:11px; color:#94a3b8;">Dining Presets:</span>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 84) < 1 ? 'active' : ''}" data-w="84" data-h="42">8-Seater (7'×3'6")</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 66) < 1 ? 'active' : ''}" data-w="66" data-h="38">6-Seater (5'6"×3'2")</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 42) < 1 ? 'active' : ''}" data-w="42" data-h="38">4-Seater (3'6"×3'2")</button>
                        </div>
                    </div>
                `;
            } else if (item.typeId === 'bathtub' || item.typeId === 'shower') {
                presetsHtml = `
                    <div style="margin-top:8px;">
                        <span class="prop-label" style="font-size:11px; color:#94a3b8;">Bath Presets:</span>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 36) < 1 ? 'active' : ''}" data-w="36" data-h="36">3' × 3'</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 48) < 1 ? 'active' : ''}" data-w="48" data-h="36">4' × 3'</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 60) < 1 ? 'active' : ''}" data-w="60" data-h="32">5' × 2'8"</button>
                        </div>
                    </div>
                `;
            } else if (item.typeId.startsWith('kitchen_counter') || item.typeId === 'kitchen_island') {
                presetsHtml = `
                    <div style="margin-top:8px;">
                        <span class="prop-label" style="font-size:11px; color:#94a3b8;">Counter Length Presets:</span>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 48) < 1 ? 'active' : ''}" data-w="48" data-h="${item.height}">4 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 60) < 1 ? 'active' : ''}" data-w="60" data-h="${item.height}">5 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 72) < 1 ? 'active' : ''}" data-w="72" data-h="${item.height}">6 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 96) < 1 ? 'active' : ''}" data-w="96" data-h="${item.height}">8 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 120) < 1 ? 'active' : ''}" data-w="120" data-h="${item.height}">10 ft</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.width - 144) < 1 ? 'active' : ''}" data-w="144" data-h="${item.height}">12 ft</button>
                        </div>
                    </div>
                    <div style="margin-top:6px;">
                        <span class="prop-label" style="font-size:11px; color:#94a3b8;">Counter Depth:</span>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.height - 24) < 1 ? 'active' : ''}" data-w="${item.width}" data-h="24">24" (Standard)</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.height - 28) < 1 ? 'active' : ''}" data-w="${item.width}" data-h="28">28" (Deep)</button>
                            <button class="sub-btn furn-preset-btn ${Math.abs(item.height - 36) < 1 ? 'active' : ''}" data-w="${item.width}" data-h="36">36" (Island/Bar)</button>
                        </div>
                    </div>
                `;
            }

            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>Fixture Properties</h3>
                    <div class="prop-row">
                        <span class="prop-label">Name</span>
                        <span class="prop-val">${escapeHtml(item.name)}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Width (W)</span>
                        <input type="text" id="furnWInput" class="prop-input" value="${escapeHtml(units.formatLength(item.width))}">
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Depth (D)</span>
                        <input type="text" id="furnHInput" class="prop-input" value="${escapeHtml(units.formatLength(item.height))}">
                    </div>
                    ${presetsHtml}
                    ${catalogItem ? `
                    <button class="sub-btn" id="furnResetSizeBtn" style="margin-top:8px; width:100%; font-size:11px; ${isCustomSize ? 'border-color:var(--accent-blue);' : 'opacity:0.6;'}" ${isCustomSize ? '' : 'title="Already catalog size"'}>
                        Reset to Catalog Size (${units.formatLength(defaultW)} × ${units.formatLength(defaultH)})
                    </button>` : ''}
                    <div class="prop-row" style="margin-top:12px;">
                        <span class="prop-label">Rotation</span>
                        <span class="prop-val">${Math.round(item.rotation)}°</span>
                    </div>
                    <div style="display:flex; gap:8px; margin-top:6px;">
                        <button class="action-btn" id="rot90Btn" style="flex:1;">Rotate 90°</button>
                        <button class="action-btn" id="rot45Btn" style="flex:1;">Rotate 45°</button>
                    </div>
                    <div style="background:rgba(15,23,42,0.6); border:1px solid rgba(56,189,248,0.2); border-radius:6px; padding:8px 10px; margin-top:12px; font-size:11px; color:#94a3b8; line-height:1.4;">
                        <span style="color:#38bdf8; font-weight:600;">Drag to Fit:</span> Drag any edge or corner handle on canvas to stretch or fit fixture into wall cavities. Hold <kbd style="background:#1e293b; padding:1px 4px; border-radius:3px;">Alt</kbd> to resize from center.
                    </div>
                    <button class="action-btn danger" id="deleteSelectedBtn" style="margin-top:12px; width:100%;">Delete Item</button>
                </div>
            `;

            document.getElementById('furnWInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val >= 12) {
                    item.width = Math.round(val * 10) / 10;
                    this.saveHistory();
                    this.updateInspector();
                } else {
                    e.target.value = units.formatLength(item.width);
                }
            });

            document.getElementById('furnHInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val >= 12) {
                    item.height = Math.round(val * 10) / 10;
                    this.saveHistory();
                    this.updateInspector();
                } else {
                    e.target.value = units.formatLength(item.height);
                }
            });

            document.querySelectorAll('.furn-preset-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const w = parseFloat(btn.dataset.w);
                    const h = parseFloat(btn.dataset.h);
                    if (w && h) {
                        item.width = w;
                        item.height = h;
                        this.saveHistory();
                        this.updateInspector();
                    }
                });
            });

            document.getElementById('furnResetSizeBtn')?.addEventListener('click', () => {
                if (catalogItem) {
                    item.width = defaultW;
                    item.height = defaultH;
                    this.saveHistory();
                    this.updateInspector();
                }
            });

            document.getElementById('rot90Btn')?.addEventListener('click', () => {
                this.furnitureManager.rotateItem(item.id, 90);
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('rot45Btn')?.addEventListener('click', () => {
                this.furnitureManager.rotateItem(item.id, 45);
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.deleteSelected());
            return;
        }

        // ==========================================
        // ROAD SELECTED
        // ==========================================
        if (this.selectedCategory === 'road') {
            const road = this.selectedObject;
            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>Road / Street Properties</h3>
                    <div class="prop-row">
                        <span class="prop-label">Road Name</span>
                        <input type="text" id="roadNameInput" class="prop-input" value="${escapeHtml(road.name)}">
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Width</span>
                        <input type="text" id="roadWidthInput" class="prop-input" value="${escapeHtml(units.formatLength(road.width))}">
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Position</span>
                        <select id="roadSideSelect" class="prop-input">
                            <option value="front" ${road.side === 'front' ? 'selected' : ''}>Front (South)</option>
                            <option value="rear" ${road.side === 'rear' ? 'selected' : ''}>Rear (North)</option>
                            <option value="left" ${road.side === 'left' ? 'selected' : ''}>Left (West)</option>
                            <option value="right" ${road.side === 'right' ? 'selected' : ''}>Right (East)</option>
                        </select>
                    </div>
                    <button class="action-btn danger" id="deleteSelectedBtn" style="margin-top:12px; width:100%;">Delete Road</button>
                </div>
            `;

            document.getElementById('roadNameInput')?.addEventListener('input', (e) => {
                road.name = e.target.value;
                this.saveHistoryCoalesced('roadNameInput:' + (this.selectedObject && this.selectedObject.id));
            });

            document.getElementById('roadWidthInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val >= 60) {
                    road.width = val;
                    this.saveHistory();
                }
            });

            document.getElementById('roadSideSelect')?.addEventListener('change', (e) => {
                road.side = e.target.value;
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.deleteSelected());
            return;
        }

        // ==========================================
        // STAIR SELECTED
        // ==========================================
        if (this.selectedCategory === 'stair') {
            const stair = this.selectedObject;
            const dim = stair.getLocalDimensions();
            const isDogleg = stair.type === 'dogleg' || stair.type === 'dogleg_wide';
            const isOpenWell = stair.type === 'open_well';

            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>Staircase Properties</h3>
                    <div class="prop-row">
                        <span class="prop-label">Stair Type</span>
                        <select id="stairTypeSelect" class="prop-input">
                            <option value="dogleg" ${isDogleg ? 'selected' : ''}>Dog-Legged (U-Turn)</option>
                            <option value="open_well" ${isOpenWell ? 'selected' : ''}>Open-Well (3 Flights)</option>
                            <option value="straight" ${stair.type === 'straight' ? 'selected' : ''}>Straight Flight</option>
                            <option value="l_shape" ${stair.type === 'l_shape' ? 'selected' : ''}>L-Shaped</option>
                            <option value="spiral" ${stair.type === 'spiral' ? 'selected' : ''}>Spiral</option>
                        </select>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Footprint</span>
                        <span class="prop-val highlight">${units.formatLength(dim.width)} × ${units.formatLength(dim.height)}</span>
                    </div>

                    ${isDogleg ? `
                    <div class="prop-row" style="margin-top:10px;">
                        <span class="prop-label">Mid-Landing</span>
                        <select id="stairLandingStepsSelect" class="prop-input">
                            <option value="3" ${stair.landingSteps === 3 ? 'selected' : ''}>3 Steps (2-Turn Winders)</option>
                            <option value="0" ${stair.landingSteps === 0 ? 'selected' : ''}>Flat Landing (No Steps)</option>
                            <option value="2" ${stair.landingSteps === 2 ? 'selected' : ''}>2 Steps (Split Landing)</option>
                            <option value="4" ${stair.landingSteps >= 4 ? 'selected' : ''}>4 Steps (Quarter Winders)</option>
                        </select>
                    </div>
                    ` : ''}

                    ${isOpenWell ? `
                    <div class="input-grid" style="margin-top:10px;">
                        <div>
                            <label>Mid Steps</label>
                            <input type="number" id="stairMidTreadsInput" min="1" max="8" value="${escapeHtml(stair.middleTreads || 3)}">
                        </div>
                        <div>
                            <label>Well Gap</label>
                            <input type="text" id="stairWellWidthInput" value="${escapeHtml(units.formatLength(stair.wellWidth))}">
                        </div>
                    </div>
                    ` : ''}

                    <div class="input-grid" style="margin-top:10px;">
                        <div>
                            <label>Flight Width</label>
                            <input type="text" id="stairWidthInput" value="${escapeHtml(units.formatLength(stair.flightWidth))}">
                        </div>
                        <div>
                            <label>Total Steps (rises)</label>
                            <input type="number" id="stairTreadsInput" min="4" max="40" value="${escapeHtml(stair.treads)}">
                        </div>
                    </div>
                    <div class="prop-row" style="margin-top:6px;">
                        <span class="prop-label">Plan shows</span>
                        <span class="prop-val" id="stairCountNote">${stair.getCountLabel()}</span>
                    </div>
                    <div class="input-grid" style="margin-top:8px;">
                        <div>
                            <label>Tread Depth</label>
                            <input type="text" id="stairTreadDepthInput" value="${escapeHtml(units.formatLength(stair.treadDepth))}">
                        </div>
                        <div>
                            <label>Landing Depth</label>
                            <input type="text" id="stairLandingInput" value="${escapeHtml(units.formatLength(stair.landingDepth))}">
                        </div>
                    </div>
                    <div class="prop-row" style="margin-top:10px;">
                        <span class="prop-label">Turn Direction</span>
                        <select id="stairTurnSelect" class="prop-input">
                            <option value="left" ${stair.turnDirection === 'left' ? 'selected' : ''}>Turn Left (CCW)</option>
                            <option value="right" ${stair.turnDirection === 'right' ? 'selected' : ''}>Turn Right (CW)</option>
                        </select>
                    </div>
                    <div class="prop-row" style="margin-top:8px;">
                        <span class="prop-label">Break Line</span>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="stairBreakCheck" ${stair.showBreakLine ? 'checked' : ''}>
                            Floor Cut Break
                        </label>
                    </div>
                    <div class="prop-row" style="margin-top:8px;">
                        <span class="prop-label">Rotation</span>
                        <span class="prop-val">${stair.rotation}°</span>
                    </div>
                    <div style="display:flex; gap:8px; margin-top:10px;">
                        <button class="action-btn" id="stairRot90Btn" style="flex:1;">Rotate 90°</button>
                        <button class="action-btn" id="stairRot45Btn" style="flex:1;">Rotate 45°</button>
                    </div>
                    <button class="action-btn danger" id="deleteSelectedBtn" style="margin-top:12px; width:100%;">Delete Staircase</button>
                </div>
            `;

            document.getElementById('stairTypeSelect')?.addEventListener('change', (e) => {
                stair.type = e.target.value;
                if (stair.type === 'dogleg' && stair.landingSteps === undefined) {
                    stair.landingSteps = 3;
                }
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('stairLandingStepsSelect')?.addEventListener('change', (e) => {
                stair.landingSteps = parseInt(e.target.value);
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('stairMidTreadsInput')?.addEventListener('change', (e) => {
                const val = parseInt(e.target.value);
                if (val >= 1 && val <= 10) {
                    stair.middleTreads = val;
                    this.saveHistory();
                    this.updateInspector();
                }
            });

            document.getElementById('stairWellWidthInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val >= 12) {
                    stair.wellWidth = val;
                    this.saveHistory();
                    this.updateInspector();
                }
            });

            document.getElementById('stairWidthInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val >= 18) {
                    stair.flightWidth = val;
                    this.saveHistory();
                    this.updateInspector();
                }
            });

            document.getElementById('stairTreadsInput')?.addEventListener('change', (e) => {
                const val = parseInt(e.target.value);
                if (val && val >= 4 && val <= 40) {
                    stair.treads = val;
                    this.saveHistory();
                    this.updateInspector();
                }
            });

            document.getElementById('stairTreadDepthInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val && val >= 6) {
                    stair.treadDepth = val;
                    this.saveHistory();
                    this.updateInspector();
                }
            });

            document.getElementById('stairLandingInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) {
                    stair.landingDepth = val;
                    this.saveHistory();
                    this.updateInspector();
                }
            });

            document.getElementById('stairTurnSelect')?.addEventListener('change', (e) => {
                stair.turnDirection = e.target.value;
                this.saveHistory();
            });

            document.getElementById('stairBreakCheck')?.addEventListener('change', (e) => {
                stair.showBreakLine = e.target.checked;
                this.saveHistory();
            });

            document.getElementById('stairRot90Btn')?.addEventListener('click', () => {
                this.stairManager.rotateStair(stair.id, 90);
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('stairRot45Btn')?.addEventListener('click', () => {
                this.stairManager.rotateStair(stair.id, 45);
                this.saveHistory();
                this.updateInspector();
            });

            document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.deleteSelected());
            return;
        }

        // ==========================================
        // PLOT SELECTED
        // ==========================================
        if (this.selectedCategory === 'plot') {
            const b = this.plotManager.getBounds();
            const area = units.formatArea(this.plotManager.getArea());
            const sb = this.plotManager.plot?.setbacks || { front: 60, rear: 36, left: 36, right: 36 };
            const bb = this.plotManager.getBuildableBounds();
            const buildableArea = this.plotManager.getBuildableArea();
            const totalArea = this.plotManager.getArea();
            const coveragePct = totalArea > 0 ? ((buildableArea / totalArea) * 100).toFixed(1) : 0;
            const buildableAreaFormatted = units.formatArea(buildableArea);

            panel.innerHTML = `
                <div class="inspector-section">
                    <h3>Plot Boundary</h3>
                    <div class="prop-row">
                        <span class="prop-label">Total Area</span>
                        <span class="prop-val highlight">${area.primary}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">In Sq Yards</span>
                        <span class="prop-val">${area.secondary}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Plot Dimensions</span>
                        <span class="prop-val">${units.formatLength(b.width)} × ${units.formatLength(b.height)}</span>
                    </div>

                    <div style="border-top:1px solid var(--border-color); margin: 12px 0 8px 0; padding-top: 8px;">
                        <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #38bdf8;">Custom Setbacks</h4>
                        <p class="hint-text" id="setbackRoadHint" style="margin:0 0 8px 0;">"Front" is the road side (currently the ${({ front: 'bottom', rear: 'top', left: 'left', right: 'right' })[this.plotManager.getFrontEdge()]} edge); Left/Right are as seen from the road.</p>
                        <div class="input-grid" style="margin-bottom:8px;">
                            <div>
                                <label>Front (Road)</label>
                                <input type="text" id="sbFrontInput" value="${escapeHtml(units.formatLength(sb.front))}">
                            </div>
                            <div>
                                <label>Rear (Back)</label>
                                <input type="text" id="sbRearInput" value="${escapeHtml(units.formatLength(sb.rear))}">
                            </div>
                            <div>
                                <label>Left (Side 1)</label>
                                <input type="text" id="sbLeftInput" value="${escapeHtml(units.formatLength(sb.left))}">
                            </div>
                            <div>
                                <label>Right (Side 2)</label>
                                <input type="text" id="sbRightInput" value="${escapeHtml(units.formatLength(sb.right))}">
                            </div>
                        </div>

                        <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">Setback Presets:</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:10px;">
                            <button class="sub-btn" id="sbPresetStandard">Standard (5', 3', 3')</button>
                            <button class="sub-btn" id="sbPresetVilla">Villa (10', 5', 5')</button>
                            <button class="sub-btn" id="sbPresetRow">Row House (3', 0', 0')</button>
                            <button class="sub-btn" id="sbPresetEqual">Equal 5' (5', 5', 5')</button>
                        </div>

                        <div class="prop-row">
                            <span class="prop-label">Buildable Envelope</span>
                            <span class="prop-val" style="color:#38bdf8;">${bb ? `${units.formatLength(bb.width)} × ${units.formatLength(bb.height)}` : 'N/A'}</span>
                        </div>
                        <div class="prop-row">
                            <span class="prop-label">Ground Coverage</span>
                            <span class="prop-val highlight">${buildableAreaFormatted.primary} (${coveragePct}%)</span>
                        </div>

                        <div style="border-top:1px solid var(--border-color); margin: 8px 0; padding-top: 8px; display:flex; flex-direction:column; gap:6px;">
                            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                                <input type="checkbox" id="plotChainedDimsCheck" ${this.plotManager.showChainedDimensions ? 'checked' : ''}>
                                <span>2-Tier Setback Dimensions</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                                <input type="checkbox" id="plotCornerMarkersCheck" ${this.plotManager.showCornerMarkers ? 'checked' : ''}>
                                <span>Surveyor Corner Nodes (A-D)</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                                <input type="checkbox" id="plotSetbackShadingCheck" ${this.plotManager.showSetbackShading ? 'checked' : ''}>
                                <span>Buildable Envelope Shading</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                                <input type="checkbox" id="plotSlabProjectionCheck" ${(this.slabManager && this.slabManager.enabled) || this.plotManager.showSlabProjection ? 'checked' : ''}>
                                <span style="font-weight:600;">Roof Slab Line (Overhang / Chajja)</span>
                            </label>
                            <div id="plotSlabProjDetails" style="display:${((this.slabManager && this.slabManager.enabled) || this.plotManager.showSlabProjection) ? 'flex' : 'none'}; flex-direction:column; gap:6px; padding-left:22px; font-size:11px;">
                                <div style="display:flex; align-items:center; justify-content:space-between;">
                                    <span style="color:var(--text-secondary);">Slab Overhang:</span>
                                    <input type="text" id="plotSlabProjOffsetInput" value="${escapeHtml(units.formatLength(this.slabManager ? this.slabManager.uniformOffset : (this.plotManager.slabProjectionOffset || 18)))}" style="width:80px; padding:2px 6px; font-size:11px; background:var(--bg-panel); border:1px solid var(--border-color); color:var(--text-main); border-radius:4px;">
                                </div>
                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">
                                    <button class="sub-btn" id="plotSlabStdBtn" style="font-size:10px; padding:2px 4px;">1'-6" Std</button>
                                    <button class="sub-btn" id="plotSlabPorticoBtn" style="font-size:10px; padding:2px 4px;">4' Portico</button>
                                </div>
                                <button class="sub-btn highlight" id="plotOpenSlabSettingsBtn" style="width:100%; font-size:10px; padding:3px 6px; text-align:center;">⚙️ Customize All (Edges, Styles, Contours)</button>
                            </div>
                            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                                <input type="checkbox" id="plotLandscapeWashCheck" ${this.plotManager.showLandscapeWash ? 'checked' : ''}>
                                <span>Landscape Lawn Wash (Yard Greenery)</span>
                            </label>
                        </div>
                    </div>

                    <div style="border-top:1px solid var(--border-color); margin: 12px 0 8px 0; padding-top: 8px;">
                        <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #facc15;">North Compass</h4>
                        <div class="prop-row">
                            <span class="prop-label">Angle</span>
                            <div style="display:flex; gap:6px; align-items:center;">
                                <input type="range" id="northSlider" min="0" max="360" value="${this.plotManager.northAngle}" style="width:75px;">
                                <input type="number" id="northNumberInput" min="0" max="360" value="${this.plotManager.northAngle}" class="prop-input" style="width:48px;">
                            </div>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px;">
                            <button class="sub-btn" id="presetNorthBtn">North (0°)</button>
                            <button class="sub-btn" id="presetEastBtn">East (90°)</button>
                            <button class="sub-btn" id="presetSouthBtn">South (180°)</button>
                            <button class="sub-btn" id="presetWestBtn">West (270°)</button>
                        </div>
                    </div>

                    <button class="action-btn danger" id="deleteSelectedBtn" style="margin-top:14px; width:100%;">Delete Plot</button>
                </div>
            `;

            const applySetbacks = (newSb) => {
                this.plotManager.setSetbacks(newSb);
                this.saveHistory();
                this.updateInspector();
            };

            document.getElementById('sbFrontInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) applySetbacks({ front: val });
            });
            document.getElementById('sbRearInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) applySetbacks({ rear: val });
            });
            document.getElementById('sbLeftInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) applySetbacks({ left: val });
            });
            document.getElementById('sbRightInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) applySetbacks({ right: val });
            });

            // Presets
            document.getElementById('sbPresetStandard')?.addEventListener('click', () => {
                applySetbacks({ front: 60, rear: 36, left: 36, right: 36 });
            });
            document.getElementById('sbPresetVilla')?.addEventListener('click', () => {
                applySetbacks({ front: 120, rear: 60, left: 60, right: 60 });
            });
            document.getElementById('sbPresetRow')?.addEventListener('click', () => {
                applySetbacks({ front: 36, rear: 0, left: 0, right: 0 });
            });
            document.getElementById('sbPresetEqual')?.addEventListener('click', () => {
                applySetbacks({ front: 60, rear: 60, left: 60, right: 60 });
            });

            const updateCompassAngle = (deg) => {
                this.plotManager.northAngle = (parseInt(deg) + 360) % 360;
                const s = document.getElementById('northSlider');
                const n = document.getElementById('northNumberInput');
                if (s) s.value = this.plotManager.northAngle;
                if (n) n.value = this.plotManager.northAngle;
                this.saveHistory();
            };

            document.getElementById('northSlider')?.addEventListener('input', (e) => updateCompassAngle(e.target.value));
            document.getElementById('northNumberInput')?.addEventListener('change', (e) => updateCompassAngle(e.target.value));
            document.getElementById('presetNorthBtn')?.addEventListener('click', () => updateCompassAngle(0));
            document.getElementById('presetEastBtn')?.addEventListener('click', () => updateCompassAngle(90));
            document.getElementById('presetSouthBtn')?.addEventListener('click', () => updateCompassAngle(180));
            document.getElementById('presetWestBtn')?.addEventListener('click', () => updateCompassAngle(270));

            document.getElementById('plotChainedDimsCheck')?.addEventListener('change', (e) => {
                this.plotManager.showChainedDimensions = e.target.checked;
                this.saveHistoryCoalesced('northSlider:' + (this.selectedObject && this.selectedObject.id));
                this.render();
            });
            document.getElementById('plotCornerMarkersCheck')?.addEventListener('change', (e) => {
                this.plotManager.showCornerMarkers = e.target.checked;
                this.saveHistory();
                this.render();
            });
            document.getElementById('plotSetbackShadingCheck')?.addEventListener('change', (e) => {
                this.plotManager.showSetbackShading = e.target.checked;
                this.saveHistory();
                this.render();
            });
            document.getElementById('plotSlabProjectionCheck')?.addEventListener('change', (e) => {
                this.plotManager.showSlabProjection = e.target.checked;
                if (this.slabManager) this.slabManager.enabled = e.target.checked;
                const d = document.getElementById('plotSlabProjDetails');
                if (d) d.style.display = e.target.checked ? 'flex' : 'none';
                this.saveHistory();
                this.render();
            });
            document.getElementById('plotSlabProjOffsetInput')?.addEventListener('change', (e) => {
                const val = units.parseInput(e.target.value);
                if (val !== null && val >= 0) {
                    this.plotManager.slabProjectionOffset = val;
                    if (this.slabManager) this.slabManager.setUniformOffset(val);
                    this.saveHistory();
                    this.render();
                }
            });
            document.getElementById('plotSlabStdBtn')?.addEventListener('click', () => {
                if (this.slabManager) this.slabManager.applyPreset('standard');
                this.plotManager.showSlabProjection = true;
                this.plotManager.slabProjectionOffset = 18;
                this.saveHistory();
                this.updateInspector();
                this.render();
            });
            document.getElementById('plotSlabPorticoBtn')?.addEventListener('click', () => {
                if (this.slabManager) this.slabManager.applyPreset('portico');
                this.plotManager.showSlabProjection = true;
                this.saveHistory();
                this.updateInspector();
                this.render();
            });
            document.getElementById('plotOpenSlabSettingsBtn')?.addEventListener('click', () => {
                if (this.slabManager) {
                    this.slabManager.enabled = true;
                    this.plotManager.showSlabProjection = true;
                }
                this.selectedCategory = 'slab';
                this.selectedObject = this.slabManager;
                this.updateInspector();
            });
            document.getElementById('plotLandscapeWashCheck')?.addEventListener('change', (e) => {
                this.plotManager.showLandscapeWash = e.target.checked;
                this.saveHistory();
                this.render();
            });

            document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.deleteSelected());
            return;
        }
    }
}
