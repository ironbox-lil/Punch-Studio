import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { sourcemap: true },
  server: {
    fs: {
      deny: [
        '.env',
        '.env.*',
        '**/.git/**',
        '**/.local/**',
        '**/.release/**',
        '**/reference/**',
        '**/base photos/**',
        '**/artifacts/**',
      ],
    },
  },
});
