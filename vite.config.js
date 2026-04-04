import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// GitHub Pages project site base path
export default defineConfig({
  base: "/rock-egg-table/",
  plugins: [vue()],
});
