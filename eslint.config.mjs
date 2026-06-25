import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", ".research/**", ".arena-cache/**", ".arena-results/**", "node_modules/**", "out/**"]
  }
];

export default eslintConfig;
