import globals from "globals";

export default [
  {
    ignores: ["dist/**", "data/**", "docs/**", "personal_trainer/**"],
  },
  {
    files: ["site/**/*.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["tests/frontend/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
