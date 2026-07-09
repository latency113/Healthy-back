import Bun from "bun"

await Bun.build({
  entrypoints: ["src/index.ts"],
  minify: true,
  outdir: "./dist",
  target: "bun",
})