import { describe, expect, it } from 'vitest';
import { MAP_BOUNDS } from '../src/config';
import { halftonePixels } from '../src/map/halftone';
import { buildMapStyle, LABEL_LAYERS } from '../src/map/mapStyle';
import { clampToBounds, viewAngles } from '../src/map/view';
import { theme, toCssColor } from '../src/theme';

const style = buildMapStyle('https://example.com/map.pmtiles', MAP_BOUNDS);
const ids = style.layers.map((layer) => layer.id);

describe('buildMapStyle', () => {
  it('reads the PMTiles archive', () => {
    expect(style.sources.protomaps).toMatchObject({ type: 'vector', url: 'pmtiles://https://example.com/map.pmtiles' });
  });

  it('draws layers in the agreed order', () => {
    const order = ['land', 'water', 'parks', 'roads-minor', 'roads-major', 'roads-highway', 'buildings', 'outside-boundary', 'place-names'];
    const positions = order.map((id) => ids.indexOf(id));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('includes every layer the names toggle controls', () => {
    for (const id of LABEL_LAYERS) expect(ids).toContain(id);
  });

  it('places street names along roads', () => {
    const streets = style.layers.find((layer) => layer.id === 'street-names-major');
    expect(streets).toMatchObject({
      type: 'symbol',
      'source-layer': 'roads',
      layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'] },
    });
  });

  it('takes road colours from the theme', () => {
    const highway = style.layers.find((layer) => layer.id === 'roads-highway');
    expect(highway).toMatchObject({ paint: { 'line-color': toCssColor(theme.colors.roadsHighway) } });
  });

  it('fills only water polygons, so rivers stay lines', () => {
    const water = style.layers.find((layer) => layer.id === 'water');
    expect(JSON.stringify(water)).toContain('geometry-type');
  });

  it('shows buildings only when zoomed in', () => {
    expect(style.layers.find((layer) => layer.id === 'buildings')?.minzoom).toBeGreaterThan(theme.camera.minZoom);
  });

  it('never reaches zooms with non-OSM data', () => {
    expect(theme.camera.minZoom).toBeGreaterThanOrEqual(6);
  });
});

describe('viewAngles', () => {
  it('uses the true isometric pitch at a 45 degree bearing', () => {
    expect(viewAngles(false, 0)).toEqual({ bearing: -45, pitch: 54.736 });
  });

  it('looks straight down with north up on the flat map', () => {
    expect(viewAngles(true, 0)).toEqual({ bearing: 0, pitch: 0 });
  });

  it('rotates in 90 degree steps', () => {
    expect(viewAngles(false, 1).bearing).toBe(-135);
    expect(viewAngles(true, -1).bearing).toBe(90);
  });
});

describe('clampToBounds', () => {
  it('leaves points inside the bounds alone', () => {
    expect(clampToBounds(-79.4, 43.7, MAP_BOUNDS)).toEqual({ lon: -79.4, lat: 43.7 });
  });

  it('holds points outside the bounds at the edge', () => {
    expect(clampToBounds(-90, 50, MAP_BOUNDS)).toEqual({ lon: MAP_BOUNDS.west, lat: MAP_BOUNDS.north });
  });
});

describe('halftonePixels', () => {
  it('prints darker dots on the base colour at full opacity', () => {
    const size = theme.halftone.tileSize;
    const pixels = halftonePixels(0xffffff);
    expect(pixels).toHaveLength(size * size * 4);
    const pixel = (x: number, y: number) => pixels[(y * size + x) * 4]!;
    expect(pixel(size / 2, size / 2)).toBeLessThan(pixel(0, 0));
    expect(pixel(0, 0)).toBe(255);
    for (let i = 3; i < pixels.length; i += 4) expect(pixels[i]).toBe(255);
  });
});
