const js = require("@eslint/js");
const googleappsscript = require("eslint-plugin-googleappsscript");

/** @type {import("eslint").Linter.FlatConfig[]} */
module.exports = [
  js.configs.recommended,
  {
    plugins: {
      googleappsscript,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script", // Apps Script is non-module
      globals: {
        // ES globals are already covered by js.configs.recommended;
        // here we add Apps Script globals:
        ...googleappsscript.environments.googleappsscript.globals,
        spreadsheetHelperFunctions: "readonly",
        CONFIG: "readonly",
      },
    },
    rules: {
      // your custom rules here if you want
      // "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];
