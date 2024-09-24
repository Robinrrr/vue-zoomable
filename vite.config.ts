import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue';
import path from 'path';
import dts from 'vite-plugin-dts';

const SERVER_CONFIG = {
	local: {
		port: 3000,
	},
	tunnel: {
		port: 3000,
		hmr: {
			clientPort: 443,
		},
	},
};

const SERVER_MODE = process.env.SERVER_MODE || 'local';

console.log(
	`Server mode is ${SERVER_MODE}, thus using the server config ${JSON.stringify(
		SERVER_CONFIG[SERVER_MODE],
	)}`,
);


// https://vitejs.dev/config/
export default defineConfig({
  server: SERVER_CONFIG[SERVER_MODE],
  plugins: [
    vue(),
    dts({
      outDir: 'dist/types',
      staticImport: true,
      insertTypesEntry: true,
      logLevel: "info",
      copyDtsFiles: false
    })
  ],
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'VueZoomable',
      fileName: 'vue-zoomable'
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ['vue'],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          vue: 'Vue'
        }
      }
    }
  }
})
