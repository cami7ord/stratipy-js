import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/core-export.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react"],
})
