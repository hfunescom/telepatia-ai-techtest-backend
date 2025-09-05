const { createDefaultPreset } = require("ts-jest");
const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json", isolatedModules: true }],
  },
  globals: {
    "ts-jest": {
      isolatedModules: true,
    },
  },
  modulePathIgnorePatterns: ["<rootDir>/lib/"],
  verbose: true,
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"]
};
