import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Lets tests import the saved tiles in tests/fixtures.
  assetsInclude: ['**/*.gz'],
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'] },
});
