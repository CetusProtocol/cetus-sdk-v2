import { defineConfig } from 'tsup'

export default defineConfig([
    {
        entry: ["src/index.ts"],
        outDir: "dist",
        format: ["esm"],
        dts: true,
        platform: "browser",
        outExtension: () => ({ js: ".browser.js" }),
        external: [/* peers */],
    },
    {
        entry: ["src/index.ts"],
        outDir: "dist",
        format: ["esm"],
        platform: "node",
        outExtension: () => ({ js: ".node.js" }),
        // Node 端可继续打包 axios
    },
]);