import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // MapLibre's worker is bundled by importing it with ?worker&url in src/scene/createMap.ts.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'] },
});
