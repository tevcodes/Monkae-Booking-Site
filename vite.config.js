// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        // Defines the public site entry point
        main: resolve(__dirname, 'index.html'),
        // ✅ Defines the separate admin dashboard entry point
        admin: resolve(__dirname, 'admin.html'), 
        privacy: resolve(__dirname, 'privacy.html'),
      },
    },
  },
  // Set appType to 'mpa' to ensure correct MPA behavior
  appType: 'mpa'
});