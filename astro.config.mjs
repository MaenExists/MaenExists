import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://maen.pages.dev",
  markdown: {
    shikiConfig: {
      theme: "github-dark-default",
      wrap: true,
    },
  },
});
