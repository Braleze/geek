import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {transformSync} from 'esbuild';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

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
      // Minifies dist/assets/*.{js,css} even when built with --minify false,
      // writes dist/manifest.json, and mirrors production files into /site
      // so every file stays compact (<250 KB) and ready for REG.RU Host-0.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
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

          // Mirror compiled production bundle into tracked /site directory
          const siteDir = path.resolve(ROOT_DIR, 'site');
          if (fs.existsSync(siteDir)) {
            fs.rmSync(siteDir, {recursive: true, force: true});
          }
          fs.cpSync(distDir, siteDir, {recursive: true, force: true});
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(ROOT_DIR, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
