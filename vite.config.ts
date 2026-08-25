import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works under any subpath
  // (e.g. a GitHub Pages project site at /<repo-name>/).
  base: './',
  build: {
    // Inline all game art (each asset kept well under this) as base64 data
    // URIs directly into the JS/CSS bundle, so the self-contained single-file
    // artifact build (which only concatenates dist/index.html's CSS+JS) keeps
    // working without needing to separately embed dist/assets/* files.
    assetsInlineLimit: 300 * 1024,
  },
});
