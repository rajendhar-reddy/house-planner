import { USER_SAVED_PROJECTS } from '../projects/user_projects.js';

export function loadSamplePlan(app, templateKey = '30x40_2bhk') {
    app.clearAll();

    // 1. Check if templateKey is a custom user-saved project
    if (USER_SAVED_PROJECTS && USER_SAVED_PROJECTS[templateKey]) {
        app.restoreState(USER_SAVED_PROJECTS[templateKey]);
        app.saveHistory();
        if (app.plotManager && app.plotManager.plot) {
            app.canvasEngine.fitToBounds(app.plotManager.getBounds(), 60);
        }
        app.updateInspector();
        app.render();
        return;
    }

    if (templateKey === '30x40_duplex_g1') {
        load30x40_Duplex_G1(app);
        return;
    } else if (templateKey === '30x40_2bhk') {
        load30x40_2BHK(app);
    } else if (templateKey === '40x60_villa') {
        load40x60_Villa(app);
    } else if (templateKey === '20x30_1bhk') {
        load20x30_1BHK(app);
    }

    // Auto fit view to plot
    if (app.plotManager.plot) {
        app.canvasEngine.fitToBounds(app.plotManager.getBounds(), 60);
    }
}

/**
 * 30' x 40' (1200 Sq Ft) 2BHK Residential Plan
 * Plot: 360" x 480" (Width x Height)
 */
function load30x40_2BHK(app) {
    // 1. Plot boundary (30ft x 40ft)
    const plotW = 360; // 30 feet
    const plotH = 480; // 40 feet
    app.plotManager.createRectangularPlot(0, 0, plotW, plotH, {
        front: 60, // 5' front setback
        rear: 36,  // 3' rear setback
        left: 36,  // 3' left setback
        right: 36  // 3' right setback
    });

    // 2. Main Building Outer Boundary (Buildable: 24' x 32')
    // Setback offset: Left=36, Right=36 (Width=288), Rear=36, Front=60 (Height=384)
    const bx = 36;
    const by = 36;
    const bw = 288; // 24 feet
    const bh = 384; // 32 feet

    // Exterior Perimeter Walls (9" thick)
    const extT = 9;
    const intT = 4.5;

    // Top wall (Rear)
    const wTop = app.wallManager.addWall({ x: bx, y: by }, { x: bx + bw, y: by }, extT, 'exterior');
    // Right wall
    const wRight = app.wallManager.addWall({ x: bx + bw, y: by }, { x: bx + bw, y: by + bh }, extT, 'exterior');
    // Bottom wall (Front)
    const wBottom = app.wallManager.addWall({ x: bx + bw, y: by + bh }, { x: bx, y: by + bh }, extT, 'exterior');
    // Left wall
    const wLeft = app.wallManager.addWall({ x: bx, y: by + bh }, { x: bx, y: by }, extT, 'exterior');

    // 3. Interior Partition Walls
    // Horizontal dividing wall at y = by + 204 (17 ft from rear)
    const midY = by + 204;
    const wMidH = app.wallManager.addWall({ x: bx, y: midY }, { x: bx + bw, y: midY }, intT, 'interior');

    // Vertical dividing wall at x = bx + 144 (12 ft from left)
    const midX = bx + 144;
    // Rear section division: Master Bed (Left) vs Bed 2 / Kitchen (Right)
    const wDivRear = app.wallManager.addWall({ x: midX, y: by }, { x: midX, y: midY }, intT, 'interior');

    // Front section division: Living Room (Right) vs Car Porch / Bath (Left)
    const wDivFront = app.wallManager.addWall({ x: midX, y: midY }, { x: midX, y: by + bh }, intT, 'interior');

    // Kitchen vs Dining partition (horizontal in top right room)
    const kitchenY = by + 108;
    const wKitchen = app.wallManager.addWall({ x: midX, y: kitchenY }, { x: bx + bw, y: kitchenY }, intT, 'interior');

    // Attached Bath in Master Bed (bottom corner of Master Bed)
    const bathY = midY - 60;
    const bathX = bx + 72;
    const wBathH = app.wallManager.addWall({ x: bx, y: bathY }, { x: bathX, y: bathY }, intT, 'interior');
    const wBathV = app.wallManager.addWall({ x: bathX, y: bathY }, { x: bathX, y: midY }, intT, 'interior');

    // 4. Doors & Windows
    // Main Entry Door on bottom wall
    if (wBottom) {
        app.openingManager.addOpening(wBottom.id, 0.35, { type: 'door', subtype: 'single', width: 38, label: 'Main Door' });
    }
    // Master Bed Door on wMidH
    if (wMidH) {
        app.openingManager.addOpening(wMidH.id, 0.35, { type: 'door', subtype: 'single', width: 34, label: 'D1' });
        // Kitchen Entry Arch on wKitchen
        app.openingManager.addOpening(wMidH.id, 0.75, { type: 'door', subtype: 'arch', width: 42, label: 'Arch' });
    }
    // Bath Door
    if (wBathV) {
        app.openingManager.addOpening(wBathV.id, 0.5, { type: 'door', subtype: 'single', width: 28, label: 'D2' });
    }

    // Windows
    if (wTop) {
        app.openingManager.addOpening(wTop.id, 0.25, { type: 'window', subtype: 'standard', width: 48, label: 'W1' });
        app.openingManager.addOpening(wTop.id, 0.75, { type: 'window', subtype: 'standard', width: 48, label: 'W2' });
    }
    if (wRight) {
        app.openingManager.addOpening(wRight.id, 0.25, { type: 'window', subtype: 'standard', width: 48, label: 'W3' });
        app.openingManager.addOpening(wRight.id, 0.75, { type: 'window', subtype: 'standard', width: 48, label: 'W4' });
    }
    if (wLeft) {
        app.openingManager.addOpening(wLeft.id, 0.25, { type: 'window', subtype: 'standard', width: 48, label: 'W5' });
    }

    // 5. Rooms & Labels (Default Clean CAD style)
    app.roomManager.addRoom(bx + 72, by + 120, { name: 'Master Bedroom', width: 144, height: 144, tagStyle: 'clean' });
    app.roomManager.addRoom(bx + 216, by + 54, { name: 'Kitchen', width: 144, height: 108, tagStyle: 'clean' });
    app.roomManager.addRoom(bx + 216, by + 115, { name: 'Dining Room', width: 144, height: 96, tagStyle: 'clean' });
    app.roomManager.addRoom(bx + 216, by + 260, { name: 'Living Hall', width: 144, height: 180, tagStyle: 'clean', isDoubleHeight: true, ceilingHeight: 240 });
    app.roomManager.addRoom(bx + 72, by + 215, { name: 'Car Porch / Foyer', width: 144, height: 180, tagStyle: 'clean' });
    app.roomManager.addRoom(bx + 40, midY - 15, { name: 'Toilet / Bath', width: 72, height: 60, tagStyle: 'clean' });
    app.roomManager.addRoom(bx + 216, by - 18, { name: 'Utility', width: 144, height: 36, tagStyle: 'clean' });

    // 5b. RCC Structural Columns (at corners and T-junctions)
    if (app.columnManager) {
        const colPts = [
            { x: bx, y: by, rot: 0 },
            { x: bx + bw, y: by, rot: 0 },
            { x: bx, y: by + bh, rot: 0 },
            { x: bx + bw, y: by + bh, rot: 0 },
            { x: midX, y: by, rot: 90 },
            { x: midX, y: midY, rot: 90 },
            { x: midX, y: by + bh, rot: 90 },
            { x: bx, y: midY, rot: 0 },
            { x: bx + bw, y: midY, rot: 0 }
        ];
        colPts.forEach((pt, i) => {
            app.columnManager.addColumn(pt.x, pt.y, {
                width: 9,
                depth: 12,
                rotation: pt.rot,
                name: `C${i + 1}`,
                showLabel: false
            });
        });
    }

    // 6. Furniture & Fixtures
    // Master Bed
    app.furnitureManager.addItem('bed_king', bx + 72, by + 50, 0);
    // Wardrobe
    app.furnitureManager.addItem('wardrobe', bx + 16, by + 80, 90);
    // Living Room Sofa & Coffee table
    app.furnitureManager.addItem('sofa_3p', bx + 216, by + 340, 180);
    app.furnitureManager.addItem('coffee_table', bx + 216, by + 300, 0);
    app.furnitureManager.addItem('tv_unit', bx + 216, by + 220, 0);
    // Dining Table
    app.furnitureManager.addItem('dining_6p', bx + 216, by + 156, 0);
    // Kitchen Hob & Sink
    app.furnitureManager.addItem('kitchen_hob', bx + 270, by + 50, 0);
    app.furnitureManager.addItem('kitchen_sink', bx + 170, by + 50, 0);
    // Bath WC
    app.furnitureManager.addItem('toilet_wc', bx + 24, midY - 30, 0);
    app.furnitureManager.addItem('washbasin', bx + 56, midY - 30, 0);
    // Car in porch
    app.furnitureManager.addItem('car_sedan', bx + 72, by + 294, 0);

    // 7. Overall Dimension Line
    app.dimensionManager.addDimension({ x: bx, y: by + bh }, { x: bx + bw, y: by + bh }, 36);
    app.dimensionManager.addDimension({ x: bx + bw, y: by }, { x: bx + bw, y: by + bh }, 36);

    // 8. Site Roads & Compound Wall Perimeter with Gate
    if (app.roadManager) {
        app.roadManager.addRoad({ side: 'front', width: 240, name: 'East Road' });
    }

    // Compound Wall Perimeter with Gate
    const plotBounds = app.plotManager.getBounds();
    app.wallManager.createCompoundWallPerimeter(plotBounds, {
        thickness: 6,
        openingManager: app.openingManager,
        gateSide: 'front',
        gateWidth: 120
    });

    // Landscape elements
    app.furnitureManager.addItem('driveway_pavers', bx + 72, by + 410, 0);
    app.furnitureManager.addItem('tree_deciduous', 20, by + 415, 0);
    app.furnitureManager.addItem('shrub_bush', plotW - 20, by + 415, 0);
    app.furnitureManager.addItem('shrub_bush', plotW - 20, by + 200, 0);
    app.plotManager.showLandscapeWash = true;

    // 9. Staircase (Foyer / Porch Dog-Legged)
    if (app.stairManager) {
        app.stairManager.addStair({
            x: bx + 100,
            y: by + 340,
            type: 'dogleg',
            flightWidth: 33,
            treads: 16,
            rotation: 0
        });
    }
}

/**
 * 40' x 60' (2400 Sq Ft) Luxury 3BHK Villa Plan
 */
function load40x60_Villa(app) {
    const plotW = 480; // 40 ft
    const plotH = 720; // 60 ft
    app.plotManager.createRectangularPlot(0, 0, plotW, plotH, {
        front: 84, // 7' front
        rear: 48,  // 4' rear
        left: 48,  // 4' left
        right: 48  // 4' right
    });

    const bx = 48;
    const by = 48;
    const bw = 384; // 32 ft
    const bh = 588; // 49 ft
    const extT = 9;
    const intT = 4.5;

    // Exterior Walls
    const wTop = app.wallManager.addWall({ x: bx, y: by }, { x: bx + bw, y: by }, extT, 'exterior');
    const wRight = app.wallManager.addWall({ x: bx + bw, y: by }, { x: bx + bw, y: by + bh }, extT, 'exterior');
    const wBottom = app.wallManager.addWall({ x: bx + bw, y: by + bh }, { x: bx, y: by + bh }, extT, 'exterior');
    const wLeft = app.wallManager.addWall({ x: bx, y: by + bh }, { x: bx, y: by }, extT, 'exterior');

    // Interior Divisions
    const row1Y = by + 192; // 16 ft
    const row2Y = by + 384; // 32 ft
    app.wallManager.addWall({ x: bx, y: row1Y }, { x: bx + bw, y: row1Y }, intT, 'interior');
    app.wallManager.addWall({ x: bx, y: row2Y }, { x: bx + bw, y: row2Y }, intT, 'interior');

    // Vertical divisions
    const colX = bx + 192; // 16 ft
    app.wallManager.addWall({ x: colX, y: by }, { x: colX, y: row1Y }, intT, 'interior');
    app.wallManager.addWall({ x: colX, y: row1Y }, { x: colX, y: row2Y }, intT, 'interior');
    app.wallManager.addWall({ x: colX, y: row2Y }, { x: colX, y: by + bh }, intT, 'interior');

    // Rooms
    app.roomManager.addRoom(bx + 96, by + 96, { name: 'Master Suite 1', width: 192, height: 192 });
    app.roomManager.addRoom(bx + 288, by + 96, { name: 'Bedroom 2', width: 192, height: 192 });
    app.roomManager.addRoom(bx + 96, by + 288, { name: 'Family Lounge', width: 192, height: 192 });
    app.roomManager.addRoom(bx + 288, by + 288, { name: 'Kitchen & Dining', width: 192, height: 192 });
    app.roomManager.addRoom(bx + 96, by + 486, { name: 'Grand Living Room', width: 192, height: 204 });
    app.roomManager.addRoom(bx + 288, by + 486, { name: 'Double Garage', width: 192, height: 204 });

    // Openings & Furniture
    if (wBottom) {
        app.openingManager.addOpening(wBottom.id, 0.25, { type: 'door', subtype: 'double', width: 60, label: 'Main Entrance' });
    }
    app.furnitureManager.addItem('bed_king', bx + 96, by + 60, 0);
    app.furnitureManager.addItem('bed_queen', bx + 288, by + 60, 0);
    app.furnitureManager.addItem('sofa_3p', bx + 96, by + 460, 180);
    app.furnitureManager.addItem('dining_6p', bx + 288, by + 288, 0);
    app.furnitureManager.addItem('kitchen_hob', bx + 350, by + 220, 0);
    app.furnitureManager.addItem('car_suv', bx + 288, by + 486, 0);
    app.furnitureManager.addItem('motorcycle', bx + 345, by + 486, 0);
    app.furnitureManager.addItem('plant', bx + 20, by + 486, 0);

    // Site Roads (Corner Plot: Front + Left)
    if (app.roadManager) {
        app.roadManager.addRoad({ side: 'front', width: 480, name: '40 Ft Main Sector Road' });
        app.roadManager.addRoad({ side: 'left', width: 360, name: '30 Ft Avenue' });
    }

    // Compound Wall Perimeter with Gate
    const plotBounds = app.plotManager.getBounds();
    app.wallManager.createCompoundWallPerimeter(plotBounds, {
        thickness: 6,
        openingManager: app.openingManager,
        gateSide: 'front',
        gateWidth: 144
    });

    // Landscape elements
    app.furnitureManager.addItem('driveway_pavers', bx + 288, plotH - 30, 0);
    app.furnitureManager.addItem('tree_palm', 30, plotH - 40, 0);
    app.furnitureManager.addItem('tree_deciduous', plotW - 30, plotH - 40, 0);
    app.furnitureManager.addItem('planter_box', bx + 96, plotH - 25, 0);
    app.furnitureManager.addItem('lawn_patch', 25, by + 280, 0);
    app.plotManager.showLandscapeWash = true;

    // Grand Living Hall Dog-Legged Staircase
    if (app.stairManager) {
        app.stairManager.addStair({
            x: bx + 96,
            y: by + 260,
            type: 'dogleg_wide',
            flightWidth: 42,
            treads: 18,
            rotation: 0
        });
    }
}

/**
 * 20' x 30' (600 Sq Ft) Compact 1BHK Plan
 */
function load20x30_1BHK(app) {
    const plotW = 240; // 20 ft
    const plotH = 360; // 30 ft
    app.plotManager.createRectangularPlot(0, 0, plotW, plotH, {
        front: 36, rear: 24, left: 24, right: 24
    });

    const bx = 24, by = 24, bw = 192, bh = 300;
    const extT = 9, intT = 4.5;

    app.wallManager.addWall({ x: bx, y: by }, { x: bx + bw, y: by }, extT, 'exterior');
    app.wallManager.addWall({ x: bx + bw, y: by }, { x: bx + bw, y: by + bh }, extT, 'exterior');
    const wBottom = app.wallManager.addWall({ x: bx + bw, y: by + bh }, { x: bx, y: by + bh }, extT, 'exterior');
    app.wallManager.addWall({ x: bx, y: by + bh }, { x: bx, y: by }, extT, 'exterior');

    // Horizontal division
    const divY = by + 150;
    app.wallManager.addWall({ x: bx, y: divY }, { x: bx + bw, y: divY }, intT, 'interior');

    // Kitchen & Bath division
    const divX = bx + 110;
    app.wallManager.addWall({ x: divX, y: by }, { x: divX, y: divY }, intT, 'interior');

    // Rooms
    app.roomManager.addRoom(bx + 55, by + 75, { name: 'Kitchen', width: 110, height: 150 });
    app.roomManager.addRoom(bx + 151, by + 75, { name: 'Bedroom', width: 82, height: 150 });
    app.roomManager.addRoom(bx + 96, by + 225, { name: 'Living Room', width: 192, height: 150 });

    if (wBottom) {
        app.openingManager.addOpening(wBottom.id, 0.5, { type: 'door', subtype: 'single', width: 36, label: 'Main Door' });
    }

    app.furnitureManager.addItem('bed_queen', bx + 151, by + 50, 0);
    app.furnitureManager.addItem('sofa_2p', bx + 96, by + 250, 180);
    app.furnitureManager.addItem('kitchen_hob', bx + 55, by + 40, 0);

    // Site Road
    if (app.roadManager) {
        app.roadManager.addRoad({ side: 'front', width: 240, name: '20 Ft Residential Street' });
    }
}

/**
 * 30' x 40' G+1 Duplex Residential Plan (Ground + First Floor Side-by-Side)
 * Featuring aligned RCC columns, Double-Height Living Hall, and Upper Void Cutout
 */
export function load30x40_Duplex_G1(app) {
    app.clearAll();

    // 1. Setup Ground Floor
    if (app.floorManager) {
        app.floorManager.activeFloorId = 'ground';
    }

    // Plot boundary (30ft x 40ft)
    const plotW = 360; // 30 feet
    const plotH = 480; // 40 feet
    app.plotManager.createRectangularPlot(0, 0, plotW, plotH, {
        front: 60, // 5' front setback
        rear: 36,  // 3' rear setback
        left: 36,  // 3' left setback
        right: 36  // 3' right setback
    });

    const bx = 36;
    const by = 36;
    const bw = 288; // 24 feet
    const bh = 384; // 32 feet
    const extT = 9;
    const intT = 4.5;

    // Ground Floor Exterior Walls
    const wTop = app.wallManager.addWall({ x: bx, y: by }, { x: bx + bw, y: by }, extT, 'exterior');
    const wRight = app.wallManager.addWall({ x: bx + bw, y: by }, { x: bx + bw, y: by + bh }, extT, 'exterior');
    const wBottom = app.wallManager.addWall({ x: bx + bw, y: by + bh }, { x: bx, y: by + bh }, extT, 'exterior');
    const wLeft = app.wallManager.addWall({ x: bx, y: by + bh }, { x: bx, y: by }, extT, 'exterior');

    // Ground Floor Partitions
    const midY = by + 204;
    const midX = bx + 144;
    const kitchenY = by + 108;
    const bathY = midY - 60;
    const bathX = bx + 72;

    const wMidH = app.wallManager.addWall({ x: bx, y: midY }, { x: bx + bw, y: midY }, intT, 'interior');
    const wDivRear = app.wallManager.addWall({ x: midX, y: by }, { x: midX, y: midY }, intT, 'interior');
    const wDivFront = app.wallManager.addWall({ x: midX, y: midY }, { x: midX, y: by + bh }, intT, 'interior');
    const wKitchen = app.wallManager.addWall({ x: midX, y: kitchenY }, { x: bx + bw, y: kitchenY }, intT, 'interior');
    const wBathH = app.wallManager.addWall({ x: bx, y: bathY }, { x: bathX, y: bathY }, intT, 'interior');
    const wBathV = app.wallManager.addWall({ x: bathX, y: bathY }, { x: bathX, y: midY }, intT, 'interior');

    // Openings on Ground Floor
    if (wBottom) {
        app.openingManager.addOpening(wBottom.id, 0.35, { type: 'door', subtype: 'double', width: 48, label: 'Main Entrance' });
    }
    if (wMidH) {
        app.openingManager.addOpening(wMidH.id, 0.35, { type: 'door', subtype: 'single', width: 34, label: 'D1' });
        app.openingManager.addOpening(wMidH.id, 0.75, { type: 'door', subtype: 'arch', width: 44, label: 'Arch' });
    }
    if (wBathV) {
        app.openingManager.addOpening(wBathV.id, 0.5, { type: 'door', subtype: 'single', width: 28, label: 'D2' });
    }
    if (wTop) {
        app.openingManager.addOpening(wTop.id, 0.25, { type: 'window', subtype: 'standard', width: 48, label: 'W1' });
        app.openingManager.addOpening(wTop.id, 0.75, { type: 'window', subtype: 'standard', width: 48, label: 'W2' });
    }
    if (wRight) {
        app.openingManager.addOpening(wRight.id, 0.25, { type: 'window', subtype: 'standard', width: 48, label: 'W3' });
        app.openingManager.addOpening(wRight.id, 0.75, { type: 'window', subtype: 'standard', width: 48, label: 'W4' });
    }
    if (wLeft) {
        app.openingManager.addOpening(wLeft.id, 0.25, { type: 'window', subtype: 'standard', width: 48, label: 'W5' });
    }

    // Ground Floor Rooms
    app.roomManager.addRoom(bx + 72, by + 120, { name: 'Guest Bedroom 1', width: 144, height: 144, tagStyle: 'clean' });
    app.roomManager.addRoom(bx + 216, by + 54, { name: 'Modular Kitchen', width: 144, height: 108, tagStyle: 'clean' });
    app.roomManager.addRoom(bx + 216, by + 156, { name: 'Dining Room', width: 144, height: 96, tagStyle: 'clean' });
    app.roomManager.addRoom(bx + 216, by + 294, {
        name: 'Living Hall',
        width: 144,
        height: 180,
        tagStyle: 'clean',
        isDoubleHeight: true,
        ceilingHeight: 240
    });
    app.roomManager.addRoom(bx + 72, by + 215, { name: 'Car Porch / Foyer', width: 144, height: 180, tagStyle: 'clean' });
    app.roomManager.addRoom(bx + 40, midY - 15, { name: 'Toilet / Bath', width: 72, height: 60, tagStyle: 'clean' });

    // 9 Aligned RCC Columns (Corners and T-Junctions)
    const colCoords = [
        { x: bx, y: by, rot: 0 },
        { x: bx + bw, y: by, rot: 0 },
        { x: bx, y: by + bh, rot: 0 },
        { x: bx + bw, y: by + bh, rot: 0 },
        { x: midX, y: by, rot: 90 },
        { x: midX, y: midY, rot: 90 },
        { x: midX, y: by + bh, rot: 90 },
        { x: bx, y: midY, rot: 0 },
        { x: bx + bw, y: midY, rot: 0 }
    ];
    colCoords.forEach((pt, i) => {
        app.columnManager.addColumn(pt.x, pt.y, {
            width: 9,
            depth: 12,
            rotation: pt.rot,
            name: `C${i + 1}`,
            showLabel: true
        });
    });

    // Ground Floor Furniture
    app.furnitureManager.addItem('bed_queen', bx + 72, by + 50, 0);
    app.furnitureManager.addItem('wardrobe', bx + 16, by + 80, 90);
    app.furnitureManager.addItem('sofa_3p', bx + 216, by + 340, 180);
    app.furnitureManager.addItem('coffee_table', bx + 216, by + 300, 0);
    app.furnitureManager.addItem('tv_unit', bx + 216, by + 220, 0);
    app.furnitureManager.addItem('dining_6p', bx + 216, by + 156, 0);
    app.furnitureManager.addItem('kitchen_hob', bx + 270, by + 50, 0);
    app.furnitureManager.addItem('kitchen_sink', bx + 170, by + 50, 0);
    app.furnitureManager.addItem('toilet_wc', bx + 24, midY - 30, 0);
    app.furnitureManager.addItem('washbasin', bx + 56, midY - 30, 0);
    app.furnitureManager.addItem('car_suv', bx + 65, by + 294, 0);
    app.furnitureManager.addItem('motorcycle', bx + 120, by + 280, 0);

    // Stairs (Dog-legged staircase)
    if (app.stairManager) {
        app.stairManager.addStair({
            x: bx + 100,
            y: by + 340,
            type: 'dogleg',
            flightWidth: 33,
            treads: 16,
            rotation: 0
        });
    }

    // Site Roads & Compound Wall Perimeter with Gate
    if (app.roadManager) {
        app.roadManager.addRoad({ side: 'front', width: 240, name: '12.0M WIDE MAIN ROAD' });
    }
    const plotBounds = app.plotManager.getBounds();
    app.wallManager.createCompoundWallPerimeter(plotBounds, {
        thickness: 6,
        openingManager: app.openingManager,
        gateSide: 'front',
        gateWidth: 120
    });

    // Landscape & Site Elements in Setbacks & Car Porch
    app.furnitureManager.addItem('driveway_pavers', bx + 72, by + 410, 0);
    app.furnitureManager.addItem('tree_deciduous', 20, by + 415, 0);
    app.furnitureManager.addItem('tree_palm', plotW - 20, by + 415, 0);
    app.furnitureManager.addItem('shrub_bush', plotW - 18, by + 200, 0);
    app.furnitureManager.addItem('lawn_patch', 18, by + 200, 0);

    app.plotManager.showLandscapeWash = true;

    // Dimensions
    app.dimensionManager.addDimension({ x: bx, y: by + bh }, { x: bx + bw, y: by + bh }, 36);
    app.dimensionManager.addDimension({ x: bx + bw, y: by }, { x: bx + bw, y: by + bh }, 36);

    // Now save Ground Floor into FloorManager
    if (app.floorManager) {
        app.floorManager.saveCurrentFloorState();

        // 2. Setup First Floor
        const first = app.floorManager.getFloor('first');
        if (first) {
            // Columns aligned 1:1 with ground floor for structural continuity
            first.columns = app.columnManager.columns.map(c => ({
                id: `col_f_${c.id}`,
                x: c.x,
                y: c.y,
                width: c.width,
                depth: c.depth,
                rotation: c.rotation,
                name: c.name,
                showLabel: true
            }));

            // Exterior perimeter walls
            first.walls = [
                { id: 'w_f_top', start: { x: bx, y: by }, end: { x: bx + bw, y: by }, thickness: extT, type: 'exterior' },
                { id: 'w_f_right', start: { x: bx + bw, y: by }, end: { x: bx + bw, y: by + bh }, thickness: extT, type: 'exterior' },
                { id: 'w_f_bottom', start: { x: bx + bw, y: by + bh }, end: { x: bx, y: by + bh }, thickness: extT, type: 'exterior' },
                { id: 'w_f_left', start: { x: bx, y: by + bh }, end: { x: bx, y: by }, thickness: extT, type: 'exterior' },
                // Upper floor interior partition walls
                { id: 'w_f_midH', start: { x: bx, y: midY }, end: { x: bx + bw, y: midY }, thickness: intT, type: 'interior' },
                { id: 'w_f_divRear', start: { x: midX, y: by }, end: { x: midX, y: midY }, thickness: intT, type: 'interior' },
                { id: 'w_f_divFront', start: { x: midX, y: midY }, end: { x: midX, y: by + bh }, thickness: intT, type: 'interior' },
                { id: 'w_f_bathH', start: { x: bx, y: bathY }, end: { x: bathX, y: bathY }, thickness: intT, type: 'interior' },
                { id: 'w_f_bathV', start: { x: bathX, y: bathY }, end: { x: bathX, y: midY }, thickness: intT, type: 'interior' }
            ];

            // First Floor Openings
            first.openings = [
                { id: 'op_f_1', wallId: 'w_f_top', t: 0.25, type: 'window', subtype: 'standard', width: 48, label: 'W1' },
                { id: 'op_f_2', wallId: 'w_f_top', t: 0.75, type: 'window', subtype: 'standard', width: 48, label: 'W2' },
                { id: 'op_f_3', wallId: 'w_f_right', t: 0.25, type: 'window', subtype: 'standard', width: 48, label: 'W3' },
                { id: 'op_f_4', wallId: 'w_f_midH', t: 0.35, type: 'door', subtype: 'single', width: 34, label: 'D1' },
                { id: 'op_f_5', wallId: 'w_f_bathV', t: 0.5, type: 'door', subtype: 'single', width: 28, label: 'D2' },
                { id: 'op_f_6', wallId: 'w_f_bottom', t: 0.25, type: 'door', subtype: 'single', width: 36, label: 'Balcony Door' }
            ];

            // First Floor Rooms
            first.rooms = [
                {
                    id: 'rm_f_master',
                    x: bx + 72,
                    y: by + 120,
                    name: 'Master Suite (Bed 2)',
                    width: 144,
                    height: 144,
                    tagStyle: 'clean'
                },
                {
                    id: 'rm_f_bed3',
                    x: bx + 216,
                    y: by + 80,
                    name: 'Kids Bedroom (Bed 3)',
                    width: 144,
                    height: 160,
                    tagStyle: 'clean'
                },
                {
                    id: 'rm_f_lounge',
                    x: bx + 72,
                    y: by + 215,
                    name: 'Family Lounge / Study',
                    width: 144,
                    height: 180,
                    tagStyle: 'clean'
                },
                {
                    id: 'rm_f_bath',
                    x: bx + 40,
                    y: midY - 15,
                    name: 'Attached Toilet',
                    width: 72,
                    height: 60,
                    tagStyle: 'clean'
                },
                // THE SLAB CUTOUT VOID OVER THE GROUND FLOOR DOUBLE-HEIGHT LIVING HALL!
                {
                    id: 'rm_f_void',
                    x: bx + 216,
                    y: by + 294,
                    name: 'Open to Below',
                    width: 144,
                    height: 180,
                    color: 'rgba(148, 163, 184, 0.05)',
                    tagStyle: 'clean',
                    isVoid: true,
                    voidType: 'open_to_below',
                    dottedCutoutPerimeter: true
                },
                // Front Balcony with Dotted Slab Marking Projection
                {
                    id: 'rm_f_balcony',
                    x: bx + 72,
                    y: by + bh + 24,
                    name: 'Front Balcony',
                    width: 144,
                    height: 48,
                    color: 'rgba(148, 163, 184, 0.06)',
                    tagStyle: 'clean',
                    dottedSlabLine: true,
                    slabOffset: 0,
                    slabLabel: 'SLAB PROJECTION'
                }
            ];

            // First Floor Furniture
            first.furniture = [
                { id: 'f_f_bed1', typeId: 'bed_king', x: bx + 72, y: by + 50, width: 78, height: 84, rotation: 0 },
                { id: 'f_f_ward1', typeId: 'wardrobe', x: bx + 16, y: by + 80, width: 24, height: 72, rotation: 90 },
                { id: 'f_f_bed2', typeId: 'bed_queen', x: bx + 216, y: by + 40, width: 66, height: 80, rotation: 0 },
                { id: 'f_f_sofa', typeId: 'sofa_2p', x: bx + 72, y: by + 215, width: 62, height: 34, rotation: 0 },
                { id: 'f_f_wc', typeId: 'toilet_wc', x: bx + 24, y: midY - 30, width: 20, height: 28, rotation: 0 }
            ];

            // Upper flight of stairs
            first.stairs = [
                {
                    id: 'stair_f_1',
                    x: bx + 100,
                    y: by + 340,
                    type: 'dogleg',
                    flightWidth: 33,
                    treads: 16,
                    rotation: 0
                }
            ];

            // Dimensions
            first.dimensions = [
                { id: 'dim_f_1', start: { x: bx, y: by + bh }, end: { x: bx + bw, y: by + bh }, offset: 36 },
                { id: 'dim_f_2', start: { x: bx + bw, y: by }, end: { x: bx + bw, y: by + bh }, offset: 36 }
            ];
        }

        // Setup Project Information / Title Block stamp
        if (app.projectInfo) {
            app.projectInfo.projectTitle = 'PROPOSED RESIDENTIAL DUPLEX (G+1)';
            app.projectInfo.drawingTitle = 'GROUND & FIRST FLOOR ARCHITECTURAL PLANS';
            app.projectInfo.clientName = 'Sri. K. Ramesh & Family';
            app.projectInfo.siteDetails = 'Plot #42, Royal Palms Layout, Bengaluru';
            app.projectInfo.architectFirm = 'Nirman Engineers & Architectural Studio';
            app.projectInfo.engineerRegNo = 'COA / BBMP Reg. #10482';
            app.projectInfo.drawingNumber = 'DWG-01 / SHT 1';
            app.projectInfo.scaleText = '1 : 100 / As Shown';
        }

        // Set Side-by-Side view mode by default for Duplex G+1
        app.floorManager.viewMode = 'active';
        app.floorManager.setViewMode('side_by_side');
        app.updateInspector();
        app.saveHistory();
        app.render();
    }
}
