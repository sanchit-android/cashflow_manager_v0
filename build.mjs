// Production build: bundles and minifies the browser code into static/dist/.
// Only static/dist/ is published in production; the readable source in static/js/ is not.
// Run: npm run build
import { build } from "esbuild";

const common = { bundle: true, minify: true, legalComments: "none", sourcemap: false, target: "es2020", outdir: "static/dist", logLevel: "info" };
await build({ ...common, entryPoints: ["static/js/app.js", "static/js/login.js", "static/js/calc.js"], format: "esm" });
await build({ ...common, entryPoints: ["static/js/theme.js", "static/js/nav.js"], format: "iife" });
