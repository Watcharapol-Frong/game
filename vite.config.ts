import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works under any subpath
  // (e.g. a GitHub Pages project site at /<repo-name>/).
  base: './',
});
