/** Server unit-test config. Expanded by issue #19 (1.10): e2e project,
 *  mongodb-memory-server helpers, factories, coverage thresholds. */
module.exports = {
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
