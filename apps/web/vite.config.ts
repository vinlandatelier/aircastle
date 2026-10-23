import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig, lazyPlugins } from 'vite-plus'
export default defineConfig({
  plugins: lazyPlugins(() => [react(), babel({ presets: [reactCompilerPreset()] })]),
})
