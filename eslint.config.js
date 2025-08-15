import eslint from "@eslint/js";
import pluginTs from "@typescript-eslint/eslint-plugin";
import eslintConfigPrettier from "eslint-config-prettier";
import pluginPrettier from "eslint-plugin-prettier";
import eslintPluginVue from "eslint-plugin-vue";
import globals from "globals";
import typescriptEslint from "typescript-eslint";
import parserVue from "vue-eslint-parser";

export default typescriptEslint.config(
  { ignores: ["*.d.ts", "**/coverage", "**/dist", "**/components/ui", "**/build"] },
  {
    extends: [
      eslint.configs.recommended,
      ...typescriptEslint.configs.recommended,
      ...eslintPluginVue.configs["flat/recommended"],
    ],
    files: ["**/*.{ts,vue}"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parser: parserVue,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        extraFileExtensions: [".vue"],
        parser: typescriptEslint.parser,
      },
    },
    plugins: {
      vue: eslintPluginVue,
      "@typescript-eslint": pluginTs,
      prettier: pluginPrettier,
    },
    rules: {
      "vue/component-name-in-template-casing": ["error", "PascalCase"],
      "vue/attribute-hyphenation": ["error", "always"],
      "vue/multi-word-component-names": "off",
      "vue/require-default-prop": "off",

      "prettier/prettier": [
        "warn",
        {
          endOfLine: "auto",
        },
      ],

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  eslintConfigPrettier,
);
