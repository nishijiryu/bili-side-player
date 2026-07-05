import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig({plugins:[react()],build:{rollupOptions:{input:{panel:resolve(root,'index.html'),background:resolve(root,'src/background.ts'),content:resolve(root,'src/content.ts')},output:{entryFileNames:'[name].js',chunkFileNames:'assets/[name].js',assetFileNames:'assets/[name][extname]'}}}});
