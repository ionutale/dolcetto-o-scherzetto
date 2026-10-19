import { describe, expect, it } from 'vitest';
import { mix, palette, varColor } from './palette';
import { clearRasters, rasterOf, shapeRaster, svgSize } from './raster';

/**
 * Pinning suite for the canvas foundation's pure lanes: SVG size parsing,
 * colour mixing, `var()` resolution, §3 fallbacks — and the no-DOM posture of
 * the raster helpers (they must answer `null`, never throw).
 */

describe('canvas raster helpers', () => {
	it('parses width/height off the opening tag', () => {
		expect(
			svgSize('<svg xmlns="x" class="sprite" width="72" height="80" viewBox="0 0 72 80">')
		).toEqual({ w: 72, h: 80 });
	});

	it('falls back to the viewBox when attrs are missing', () => {
		expect(svgSize('<svg viewBox="0 0 240 190">')).toEqual({ w: 240, h: 190 });
	});

	it('answers null for a tag with neither', () => {
		expect(svgSize('<svg>')).toBeNull();
	});

	it('is safe without a DOM: null, not a throw', () => {
		clearRasters();
		expect(rasterOf('house:0:0:0', '<svg width="240" height="190"></svg>')).toBeNull();
		expect(shapeRaster('glow', 10, 10, () => {})).toBeNull();
	});
});

describe('canvas palette', () => {
	it('mixes hex colours like color-mix', () => {
		expect(mix('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
		expect(mix('#000000', '#ffffff', 0)).toBe('rgb(0, 0, 0)');
		expect(mix('#000000', '#ffffff', 1)).toBe('rgb(255, 255, 255)');
	});

	it('mixes rgb() strings', () => {
		expect(mix('rgb(10, 20, 30)', 'rgb(20, 40, 60)', 0.5)).toBe('rgb(15, 30, 45)');
	});

	it('passes an unparseable colour through', () => {
		expect(mix('var(--nope)', '#ffffff', 0.5)).toBe('var(--nope)');
	});

	it('resolves var() references and passes plain colours through', () => {
		expect(varColor('var(--night-2)')).toBe('#3a2c5f');
		expect(varColor('#123456')).toBe('#123456');
	});

	it('answers §3 fallbacks without a DOM', () => {
		const pal = palette();
		expect(pal.night1).toBe('#241d45');
		expect(pal.fence).toBe('#6b5785');
		expect(pal.moon).toBe('#fff6dd');
	});
});
