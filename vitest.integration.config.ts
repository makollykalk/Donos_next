import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';
export default defineConfig({resolve:base.resolve,test:{include:['tests/integration/**/*.test.ts'], fileParallelism:false, testTimeout:30000, hookTimeout:30000,passWithNoTests:false}});
