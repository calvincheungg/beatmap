import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { MAP_BOUNDS, PMTILES_URL } from '../config';
import { LabelLayer } from '../map/labelLayer';
import { createMaterials, disposeMaterials, updateHalftone, type MapMaterials } from '../map/materials';
import { TileManager } from '../map/tiles/tileManager';
import { useMapStore } from '../state/mapStore';
import type { IsoCamera } from './camera/isoCamera';

interface MapTilesProps {
  view: IsoCamera;
  labelCanvas: HTMLCanvasElement;
}

/** Owns the tile manager and label layer. All tile geometry is built and held outside React. */
export function MapTiles({ view, labelCanvas }: MapTilesProps) {
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const manager = useRef<TileManager | null>(null);
  const materials = useRef<MapMaterials | null>(null);
  const labels = useRef<LabelLayer | null>(null);

  useEffect(() => {
    const created = createMaterials();
    const tiles = new TileManager(PMTILES_URL, created, MAP_BOUNDS, (progress) => {
      useMapStore.getState().setProgress(progress);
      invalidate();
    });
    manager.current = tiles;
    materials.current = created;
    labels.current = new LabelLayer(labelCanvas);
    scene.add(tiles.root);
    invalidate();
    // Labels drawn before the font arrives use the fallback, so redraw once it does.
    void document.fonts.ready.then(() => invalidate());

    return () => {
      manager.current = null;
      materials.current = null;
      scene.remove(tiles.root);
      tiles.dispose();
      disposeMaterials(created);
    };
  }, [scene, invalidate, labelCanvas]);

  useFrame((state) => {
    if (!manager.current || !materials.current) return;
    const { width, height } = state.size;
    updateHalftone(materials.current, view.viewHeight, height);
    if (manager.current.update(view.tileView, view.goalViewHeight)) invalidate();
    const placed = useMapStore.getState().showLabels ? manager.current.visibleLabels : [];
    labels.current?.draw(placed, view.camera, width, height, state.viewport.dpr);
  });

  return null;
}
