import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Backend functions use Deno npm: specifiers — map to a local stub under Node
      'npm:@base44/sdk@0.8.31': path.resolve(rootDir, 'tests/stubs/base44-sdk.js'),
      '@': path.resolve(rootDir, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx,ts,tsx}'],
    setupFiles: ['tests/setup.js'],
  },
});
