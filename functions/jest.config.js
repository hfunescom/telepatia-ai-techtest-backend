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
    // aplica opciones modernas acá (en vez de `globals`)
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json", isolatedModules: true }],
    // si querés mantener lo que trae el preset:
    // ...tsJestTransformCfg,
  },
  globals: {
    "ts-jest": {
      isolatedModules: true, // 🔑 evita la warning de ts-jest
    },
  },
  modulePathIgnorePatterns: ["<rootDir>/lib/"], // 🔑 ignora compilados
  verbose: true,
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"]
};
