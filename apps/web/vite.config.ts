import process from 'node:process'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig, lazyPlugins } from 'vite-plus'
export default defineConfig({
  server: {
    port: 43121,
    strictPort: true,
    proxy: {
      '^/api(?:/|$)': { target: `http://127.0.0.1:${process.env.PORT ?? 43122}` },
    },
  },
  preview: { port: 43121, strictPort: true },
  plugins: lazyPlugins(() => [react(), babel({ presets: [reactCompilerPreset()] })]),
})
