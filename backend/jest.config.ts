import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  clearMocks: true,
  // uuid v14+ is pure ESM with no CJS build; __mocks__/uuid.js provides a CJS-compatible stub
  moduleNameMapper: { '^uuid$': '<rootDir>/__mocks__/uuid.js' },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.test.json' }],
  },
};

export default config;
