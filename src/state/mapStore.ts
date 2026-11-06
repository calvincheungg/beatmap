import { create } from 'zustand';
import type { LoadProgress } from '../map/tiles/tileManager';

interface MapState {
  /** Total 90 degree rotation steps from the default view. */
  rotationSteps: number;
  /** Null until the first tile finishes. */
  progress: LoadProgress | null;
  rotate: (steps: number) => void;
  setProgress: (progress: LoadProgress) => void;
}

export const useMapStore = create<MapState>()((set) => ({
  rotationSteps: 0,
  progress: null,
  rotate: (steps) => set((state) => ({ rotationSteps: state.rotationSteps + steps })),
  setProgress: (progress) => set({ progress }),
}));
