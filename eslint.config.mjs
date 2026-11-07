import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", ".toolchain/**", ".data/**", "src/generated/**", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Server components render once per request, so reading the clock during render is correct.
    files: ["src/app/**/*.tsx"],
    rules: { "react-hooks/purity": "off" },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // React escapes these anyway, and plain apostrophes keep UI copy readable.
      "react/no-unescaped-entities": "off",
    },
  },
];

export default config;
