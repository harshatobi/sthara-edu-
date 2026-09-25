import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Phosphor's barrel entry points pull all ~1,500 icons into every page's
    // dev compile (the Next.js local-dev guide calls this out). Import each
    // icon from its own module instead.
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "@phosphor-icons/react/dist/ssr", message: "Import the icon's own module: import { HouseIcon as House } from '@phosphor-icons/react/dist/ssr/House'." },
          { name: "@phosphor-icons/react", message: "Import the icon's own module (e.g. '@phosphor-icons/react/dist/ssr/House'). Type-only imports are fine.", allowTypeImports: true },
        ],
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The marketing site is plain browser JS with its own tests (site/tests).
    "site/**",
    "public/site/**",
  ]),
]);

export default eslintConfig;
