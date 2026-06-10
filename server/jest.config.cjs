/** Server unit-test config. Expanded by issue #19 (1.10): e2e project,
 *  mongodb-memory-server helpers, factories, coverage thresholds. */
module.exports = {
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/scripts/**',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    global: { lines: 80, statements: 80, functions: 75, branches: 65 },
  },
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  moduleNameMapper: {
    '^@app/(.*)$': '<rootDir>/src/$1',
  },
  clearMocks: true,
  restoreMocks: true,
};
