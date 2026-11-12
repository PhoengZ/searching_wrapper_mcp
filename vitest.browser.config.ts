import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/browser/**/*.test.ts'], fileParallelism: false, testTimeout: 30000, hookTimeout: 15000 } });
