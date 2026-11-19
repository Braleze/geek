import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'strip-root-fallback-in-build',
        apply: 'build',
        transformIndexHtml(html: string): string {
          return html.replace(
            /\s*<!--\s*HOST0_ROOT_FALLBACK_START\s*-->[\s\S]*?<!--\s*HOST0_ROOT_FALLBACK_END\s*-->\s*/g,
            '\n',
          );
        },
      },
      // Copies src/assets and audio into dist/, writes dist/manifest.json,
      // and mirrors dist/ into tracked site/ so zero-build ZIP uploads to
      // REG.RU Host-0 always contain a ready-to-serve production bundle.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          if (!fs.existsSync(distDir)) {
            return;
          }

          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }

          const rootAudio = path.resolve(__dirname, 'audio');
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
            const jsMatch = builtHtml.match(/src="\.\/(assets\/[^"]+\.js)"/);
            const cssMatch = builtHtml.match(/href="\.\/(assets\/[^"]+\.css)"/);
            const manifest = {
              js: jsMatch ? jsMatch[1] : null,
              css: cssMatch ? cssMatch[1] : null,
            };
            fs.writeFileSync(
              path.join(distDir, 'manifest.json'),
              JSON.stringify(manifest, null, 2) + '\n',
              'utf8',
            );
          }

          // Mirror compiled production bundle into tracked /site directory
          const siteDir = path.resolve(__dirname, 'site');
          if (fs.existsSync(siteDir)) {
            fs.rmSync(siteDir, {recursive: true, force: true});
          }
          fs.cpSync(distDir, siteDir, {recursive: true, force: true});
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
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
