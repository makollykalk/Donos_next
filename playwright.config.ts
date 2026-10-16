import { defineConfig } from '@playwright/test';
export default defineConfig({tsconfig:'./tsconfig.tests.json',testDir:'./tests/e2e',fullyParallel:false,workers:1,retries:0,timeout:60000,expect:{timeout:15000},use:{trace:'off',screenshot:'off',video:'off'},reporter:'list'});
