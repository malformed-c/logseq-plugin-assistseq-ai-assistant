import reactPlugin from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import logseqDevPlugin from "vite-plugin-logseq"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [logseqDevPlugin(), reactPlugin()],
  // Makes HMR available for development
  build: {
    target: "esnext",
    minify: false,
  },
  resolve: {
    alias: {
      // Polyfill Node.js modules for browser
      'node:async_hooks': 'node:async_hooks',
    }
  },
  optimizeDeps: {
    exclude: ['@langchain/langgraph'],
  },
})
