/**
 * units.js - Unit Conversion and Formatting Engine
 * Internal spatial unit: 1 Unit = 1 Inch
 */

export const UnitSystem = {
    IMPERIAL: 'imperial', // Feet & Inches (e.g., 12' - 6")
    METRIC: 'metric'      // Meters / Millimeters (e.g., 3.81 m / 230 mm)
};

class UnitManager {
    constructor() {
        this.system = UnitSystem.IMPERIAL; // default to Imperial
        this.metricSubUnit = 'm'; // 'm' or 'mm'
    }

    setSystem(system) {
        if (system === UnitSystem.IMPERIAL || system === UnitSystem.METRIC) {
            this.system = system;
        }
    }

    getSystem() {
        return this.system;
    }

    /**
     * Convert inches to formatted text string
     * @param {number} inches 
     * @param {boolean} includeUnit 
     * @returns {string}
     */
    formatLength(inches, includeUnit = true) {
        if (inches === undefined || inches === null || isNaN(inches)) return '0"';
        const absVal = Math.abs(inches);
        const sign = inches < 0 ? '-' : '';

        if (this.system === UnitSystem.IMPERIAL) {
            const totalInches = Math.round(absVal * 10) / 10;
            const feet = Math.floor(totalInches / 12);
            const remainingInches = Math.round((totalInches % 12) * 10) / 10;

            if (feet === 0) {
                return `${sign}${remainingInches}"`;
            } else if (remainingInches === 0) {
                return `${sign}${feet}'`;
            } else {
                return `${sign}${feet}' - ${remainingInches}"`;
            }
        } else {
            // Metric: meters
            const meters = absVal * 0.0254;
            if (meters < 1 && this.metricSubUnit === 'mm') {
                const mm = Math.round(absVal * 25.4);
                return `${sign}${mm}${includeUnit ? ' mm' : ''}`;
            }
            const formatted = meters.toFixed(2);
            return `${sign}${formatted}${includeUnit ? ' m' : ''}`;
        }
    }

    /**
     * Format area from square inches
     * @param {number} sqInches 
     * @returns {{primary: string, secondary: string}}
     */
    formatArea(sqInches) {
        if (!sqInches || isNaN(sqInches) || sqInches <= 0) {
            return { primary: '0 Sq Ft', secondary: '0 Sq M' };
        }
        const sqFt = sqInches / 144;
        const sqM = sqInches * 0.00064516;
        const sqYards = sqFt / 9;

        if (this.system === UnitSystem.IMPERIAL) {
            return {
                primary: `${sqFt.toFixed(1)} Sq. Ft.`,
                secondary: `${sqYards.toFixed(1)} Sq. Yd. (${sqM.toFixed(1)} m²)`
            };
        } else {
            return {
                primary: `${sqM.toFixed(2)} m²`,
                secondary: `${sqFt.toFixed(1)} Sq. Ft.`
            };
        }
    }

    /**
     * Parse text input into internal inches. Returns null when the text is not a
     * clear measurement (it never guesses: "10abc" or "5'6\"x" are rejected rather
     * than silently read as 10 ft / 5 ft).
     *
     * Accepted: 30'  30 ft  12' 6"  12'6  12'-6"  12 ft 6 in  3 feet 4 inches
     *           36"  36 in  6 inches  6 1/2"  1/2"  .5"
     *           10m  2.5 meters  1,5m  230mm  400cm
     *           25.5 (plain number = feet in imperial mode, metres in metric mode)
     * A leading "-" makes the value negative.
     * @param {string} text
     * @returns {number|null} inches
     */
    parseInput(text) {
        if (!text || typeof text !== 'string') return null;
        let s = text.trim().toLowerCase();
        if (!s) return null;

        // Normalise typographic marks, decimal commas and spacing
        s = s.replace(/[\u2032\u2019\u2018]/g, "'").replace(/[\u2033\u201d\u201c]/g, '"').replace(/''/g, '"')
             .replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' ');

        let sign = 1;
        if (s.startsWith('-')) { sign = -1; s = s.slice(1).trim(); }

        // number: 6, 6.5, .5, 1/2 or a mixed fraction like 6 1/2
        const NUM = '(\\d+(?:\\.\\d+)?(?:\\s+\\d+/\\d+)?|\\d+/\\d+|\\.\\d+)';
        const toNum = (str) => {
            let total = 0;
            for (const part of str.trim().split(' ')) {
                if (part.includes('/')) {
                    const [n, d] = part.split('/').map(Number);
                    if (!d) return NaN;
                    total += n / d;
                } else {
                    total += parseFloat(part);
                }
            }
            return total;
        };
        const FT = "(?:'|ft|feet|foot)";
        const IN = '(?:"|in|inch|inches)';
        const re = (body) => new RegExp('^' + body + '$');
        const done = (inches) => (Number.isFinite(inches) ? sign * inches : null);

        let m;
        if ((m = s.match(re(NUM + '\\s*(?:mm|millimet(?:er|re)s?)')))) return done(toNum(m[1]) / 25.4);
        if ((m = s.match(re(NUM + '\\s*(?:cm|centimet(?:er|re)s?)')))) return done(toNum(m[1]) * 10 / 25.4);
        if ((m = s.match(re(NUM + '\\s*(?:m|met(?:er|re)s?)')))) return done(toNum(m[1]) * 1000 / 25.4);

        // feet, optionally followed by inches: 12' 6"  12'6  12 ft 6 in
        if ((m = s.match(re(NUM + '\\s*' + FT + '(?:\\s*-?\\s*' + NUM + '\\s*' + IN + '?)?')))) {
            return done(toNum(m[1]) * 12 + (m[2] ? toNum(m[2]) : 0));
        }
        // inches only: 36"  36 in  6 inches
        if ((m = s.match(re(NUM + '\\s*' + IN)))) return done(toNum(m[1]));

        // Plain number: interpreted according to the current unit system
        if ((m = s.match(re(NUM)))) {
            const num = toNum(m[1]);
            return done(this.system === UnitSystem.IMPERIAL ? num * 12 : (num * 1000) / 25.4);
        }
        return null;
    }
}

export const units = new UnitManager();
