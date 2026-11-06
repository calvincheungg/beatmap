import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { MAP_BOUNDS, PMTILES_URL, TILE_ZOOM } from '../config';
import { createMaterials, disposeMaterials } from '../map/materials';
import { ORIGIN, tileRangeForBounds } from '../map/projection';
import { TileManager } from '../map/tiles/tileManager';
import { useMapStore } from '../state/mapStore';
import { theme } from '../theme';
import type { IsoCamera } from './camera/isoCamera';

/** Owns the tile manager. All tile geometry is built and held outside React. */
export function MapTiles({ view }: { view: IsoCamera }) {
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const manager = useRef<TileManager | null>(null);

  useEffect(() => {
    const materials = createMaterials();
    const tiles = new TileManager(PMTILES_URL, materials, (progress) => {
      useMapStore.getState().setProgress(progress);
      invalidate();
    });
    manager.current = tiles;
    scene.add(tiles.root);
    void tiles.loadRange(tileRangeForBounds(MAP_BOUNDS, TILE_ZOOM), ORIGIN);

    return () => {
      manager.current = null;
      scene.remove(tiles.root);
      tiles.dispose();
      disposeMaterials(materials);
    };
  }, [scene, invalidate]);

  useFrame(() => {
    manager.current?.setEdgesVisible(view.viewHeight <= theme.buildings.edgeMaxViewHeight);
  });

  return null;
}
