import type { Config } from 'jest';
import { createDefaultEsmPreset } from 'ts-jest';

const presetConfig = createDefaultEsmPreset({
  tsconfig: './tsconfig.json',
  diagnostics: {
    ignoreCodes: [151002],
  },
});

export default {
  ...presetConfig,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.spec.ts',
  ],
  coverageProvider: 'v8',
  testEnvironment: 'node',
  // Blocks connections to outside servers, so no test depends on LG being reachable.
  setupFiles: ['<rootDir>/test/blockNetwork.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
  moduleFileExtensions: [
    'ts',
    'js',
    'json',
  ],
  coverageReporters: [
    'text',
    'lcov',
    'json-summary',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
  moduleNameMapper: {
    '^(..?/.+).js?$': '$1',
  },
  coverageThreshold: {
    // Just below the current coverage, so it cannot drop without notice. Node.js 22
    // counts fewer lines and more functions as covered than Node.js 24 and 26 (V8
    // coverage changed), so each number is below the lowest of the three.
    global: {
      branches: 80,
      functions: 50,
      lines: 40,
      statements: 40,
    },
  },
} satisfies Config;
