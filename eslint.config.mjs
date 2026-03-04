// eslint.config.mjs
import { fileURLToPath } from "url";
import path from "path";

import { FlatCompat } from "@eslint/eslintrc"
import js from "@eslint/js"
import tsPlugin from "@typescript-eslint/eslint-plugin"
import tsParser from "@typescript-eslint/parser"
import prettierPlugin from "eslint-plugin-prettier"

// __dirname in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({ baseDirectory: import.meta.url })

export default [
  // 1) core ESLint
  js.configs.recommended,

  // 2) legacy shareables via compat
  ...compat.extends(
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended"
  ),

  // 3) our TS + Prettier block
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,              // ← give it the module, not a string
      parserOptions: {
        // POINT TO A REAL FS PATH, not a relative URL
        project: path.join(__dirname, "tsconfig.eslint.json"),

        // still define these basics
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      "prettier/prettier": "error",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // 4) ignores
  {
    ignores: ["node_modules/", "dist/"],
  },
]