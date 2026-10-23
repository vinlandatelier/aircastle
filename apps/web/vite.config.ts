import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig, lazyPlugins } from 'vite-plus'
export default defineConfig({
  server: { port: 43121, strictPort: true },
  preview: { port: 43121, strictPort: true },
  plugins: lazyPlugins(() => [react(), babel({ presets: [reactCompilerPreset()] })]),
})
