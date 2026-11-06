import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 渲染层构建：src 为根，产物输出到 src/dist（Electron 以 file:// 加载，base 必须为相对路径）
export default defineConfig({
  root: 'src',
  base: './',
  plugins: [vue()],
  build: { outDir: 'dist', emptyOutDir: true, target: 'chrome126' },
});
