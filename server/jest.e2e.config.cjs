/** E2E project (issue #19 / 1.10): real AppModule + mongodb-memory-server. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.e2e-spec.ts'],
  moduleNameMapper: { '^@app/(.*)$': '<rootDir>/src/$1' },
  clearMocks: true,
  maxWorkers: 1,
};
