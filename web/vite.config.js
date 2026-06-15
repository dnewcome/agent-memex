import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  // better-sqlite3 is a native module — never bundle it.
  ssr: { external: ['better-sqlite3'] },
  optimizeDeps: { exclude: ['better-sqlite3'] }
});
