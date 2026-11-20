import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {transformSync} from 'esbuild';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

const ROOT_DIR = import.meta.dirname;

export default defineConfig(() => {
  const buildStamp = Date.now().toString(36);
  return {
    base: './',
    build: {
      minify: true,
      cssMinify: true,
      chunkSizeWarningLimit: 600,
      rolldownOptions: {
        output: {
          entryFileNames: 'assets/app.js',
          chunkFileNames: 'assets/chunk-[name].js',
          assetFileNames: (assetInfo) => {
            const name = assetInfo.names?.[0] ?? assetInfo.name ?? '';
            if (name.endsWith('.css')) {
              return 'assets/app.css';
            }
            return 'assets/[name][extname]';
          },
          codeSplitting: {
            groups: [
              {
                name: 'vendor-react',
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 30,
              },
              {
                name: 'vendor-motion',
                test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/,
                priority: 20,
              },
              {
                name: 'vendor-ui',
                test: /node_modules[\\/]/,
                priority: 10,
              },
            ],
          },
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'strip-root-fallback-in-build',
        apply: 'build',
        transformIndexHtml(html: string): string {
          return html
            .replace(
              /\s*<!--\s*HOST0_ROOT_FALLBACK_START\s*-->[\s\S]*?<!--\s*HOST0_ROOT_FALLBACK_END\s*-->\s*/g,
              '\n',
            )
            .replace('src="./assets/app.js"', `src="./assets/app.js?v=${buildStamp}"`)
            .replace('href="./assets/app.css"', `href="./assets/app.css?v=${buildStamp}"`);
        },
      },
      // Prepares minified dist/assets/*.{js,css}, strips debug screenshots, and writes
      // dist/manifest.json BEFORE VitePWA builds the Workbox precache manifest.
      {
        name: 'prepare-host0-dist-assets',
        apply: 'build',
        writeBundle(): void {
          const distDir = path.resolve(ROOT_DIR, 'dist');
          if (!fs.existsSync(distDir)) {
            return;
          }

          // Remove unused AI Studio debug screenshot uploads copied from public/assets/aistudio
          const distAistudio = path.join(distDir, 'assets', 'aistudio');
          if (fs.existsSync(distAistudio)) {
            fs.rmSync(distAistudio, {recursive: true, force: true});
          }

          // Always minify emitted JS & CSS assets with esbuild so every chunk
          // stays small and fast even if the build runner passes --minify false.
          const distAssetsDir = path.join(distDir, 'assets');
          if (fs.existsSync(distAssetsDir)) {
            for (const entry of fs.readdirSync(distAssetsDir)) {
              const fullPath = path.join(distAssetsDir, entry);
              if (!fs.statSync(fullPath).isFile()) continue;
              if (entry.endsWith('.js')) {
                const raw = fs.readFileSync(fullPath, 'utf8');
                const min = transformSync(raw, {
                  loader: 'js',
                  minify: true,
                  target: 'es2020',
                  legalComments: 'none',
                });
                fs.writeFileSync(fullPath, '/* geek-bundle:pending */\n' + min.code, 'utf8');
              } else if (entry.endsWith('.css')) {
                const raw = fs.readFileSync(fullPath, 'utf8');
                const min = transformSync(raw, {
                  loader: 'css',
                  minify: true,
                  legalComments: 'none',
                });
                fs.writeFileSync(fullPath, '/* geek-bundle:pending */\n' + min.code, 'utf8');
              }
            }
          }

          const srcAssets = path.resolve(ROOT_DIR, 'src/assets');
          const distSrcAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distSrcAssets, {recursive: true, force: true});
          }

          const rootAudio = path.resolve(ROOT_DIR, 'audio');
          const distAudio = path.resolve(distDir, 'audio');
          if (fs.existsSync(rootAudio)) {
            fs.mkdirSync(distAudio, {recursive: true});
            for (const entry of fs.readdirSync(rootAudio)) {
              if (entry === '.gitkeep') continue;
              const srcFile = path.join(rootAudio, entry);
              const dstFile = path.join(distAudio, entry);
              if (!fs.existsSync(dstFile)) {
                fs.cpSync(srcFile, dstFile, {recursive: true});
              }
            }
          }

          // Emit manifest.json for zero-build root fallback loader
          const distHtmlPath = path.join(distDir, 'index.html');
          if (fs.existsSync(distHtmlPath)) {
            const builtHtml = fs.readFileSync(distHtmlPath, 'utf8');
            const jsMatch = builtHtml.match(/src="\.\/(assets\/[^"?]+\.js(?:\?[^"]*)?)"/);
            const cssMatch = builtHtml.match(/href="\.\/(assets\/[^"?]+\.css(?:\?[^"]*)?)"/);
            const manifest = {
              js: jsMatch ? jsMatch[1] : 'assets/app.js',
              css: cssMatch ? cssMatch[1] : 'assets/app.css',
            };
            fs.writeFileSync(
              path.join(distDir, 'manifest.json'),
              JSON.stringify(manifest, null, 2) + '\n',
              'utf8',
            );
          }
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          id: '/',
          name: 'Geek — Голос и чат',
          short_name: 'Geek',
          description:
            'Платформа нового поколения для связи и комьюнити: P2P-голос, тестовый Live-канал и Pre-Beta связь 1-на-1.',
          theme_color: '#0b0714',
          background_color: '#0b0714',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          lang: 'ru',
          icons: [
            {
              src: './pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          shortcuts: [
            {
              name: 'Pre-Beta связь 1-на-1',
              short_name: 'Pre-Beta',
              description: 'Быстрый вход в защищённый звонок 1-на-1',
              url: '/#prebeta',
              icons: [{src: './pwa-192x192.png', sizes: '192x192', type: 'image/png'}],
            },
            {
              name: 'Live чат и голос',
              short_name: 'Live чат',
              description: 'Открыть клиент Geek и тестовый голосовой канал',
              url: '/?view=app#preview',
              icons: [{src: './pwa-192x192.png', sizes: '192x192', type: 'image/png'}],
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['**/api/**', '**/aistudio/**', 'manifest.json', 'src/**'],
          navigateFallback: null,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          manifestTransforms: [
            async (entries) => {
              const seen = new Set<string>();
              const manifest = [];
              for (const entry of entries) {
                if (seen.has(entry.url)) continue;
                seen.add(entry.url);
                manifest.push({
                  ...entry,
                  revision: entry.revision ?? buildStamp,
                });
              }
              return {manifest, warnings: []};
            },
          ],
          runtimeCaching: [
            {
              urlPattern: /\/api\//i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /\.php(\?.*)?$/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      // Mirrors the complete production bundle (including sw.js, workbox-*.js,
      // registerSW.js, and manifest.webmanifest) into /site for REG.RU Host-0.
      {
        name: 'mirror-dist-to-site',
        apply: 'build',
        closeBundle: {
          order: 'post',
          sequential: true,
          handler(error?: Error): void {
            if (error) {
              return;
            }
            const distDir = path.resolve(ROOT_DIR, 'dist');
            if (!fs.existsSync(distDir)) {
              return;
            }
            const siteDir = path.resolve(ROOT_DIR, 'site');
            if (fs.existsSync(siteDir)) {
              fs.rmSync(siteDir, {recursive: true, force: true});
            }
            fs.cpSync(distDir, siteDir, {recursive: true, force: true});
          },
        },
      },
      // Guard Vite 8 @vite/client ws.send() against undefined socket if HMR WS is unavailable/closed
      {
        name: 'guard-vite-client-ws-send',
        apply: 'serve',
        transform(code: string, id: string): string | null {
          if (!id.includes('vite/dist/client/client.mjs')) {
            return null;
          }
          if (!code.includes('ws.send(JSON.stringify(data))')) {
            return null;
          }
          return code.replace(
            'ws.send(JSON.stringify(data))',
            'if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(data))',
          );
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(ROOT_DIR, '.'),
      },
    },
    server: {
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
