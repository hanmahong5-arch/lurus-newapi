import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/helpers/auth.jsx',
        'src/helpers/utils.jsx',
        'src/components/topup/RechargeCard.jsx',
        'src/components/topup/index.jsx',
        'src/components/dashboard/StatsCards.jsx',
        'src/components/layout/headerbar/UserArea.jsx',
        'src/hooks/common/useSidebar.js',
      ],
    },
  },
});
