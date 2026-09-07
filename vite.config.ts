import path from "node:path";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { facadeToolPlugin } from "./server/facade-plugin";

const explorerRoot = path.resolve(
  __dirname,
  "../adliswil-explorer/outputs/adliswil",
);

export default defineConfig({
  resolve: {
    alias: {
      "@explorer": path.join(explorerRoot, "src"),
    },
    dedupe: ["three"],
  },
  plugins: [
    facadeToolPlugin({ explorerRoot, projectRoot: __dirname }),
    viteStaticCopy({
      targets: [
        {
          src: path.join(explorerRoot, "public/data"),
          dest: ".",
        },
      ],
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [path.resolve(__dirname, "..")] },
  },
});
