/* eslint-env node */
require("@rushstack/eslint-patch/modern-module-resolution");

module.exports = {
  root: true,
  extends: [
    "plugin:vue/vue3-essential",
    "eslint:recommended",
    "@vue/eslint-config-typescript/recommended",
  ],
  env: {
    "vue/setup-compiler-macros": true,
  },
  rules: {
    "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
    "no-debugger": process.env.NODE_ENV === "production" ? "warn" : "off",
    camelcase: "off",
    "import/no-webpack-loader-syntax": "off",
    quotes: [2, "double", { avoidEscape: true }],
    indent: "off",
    "@typescript-eslint/indent": ["error", 2],
  },
};
