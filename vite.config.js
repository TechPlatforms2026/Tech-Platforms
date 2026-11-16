import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const rootDir = import.meta.dirname;

function collectDistHashes(dir, distRoot, out) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectDistHashes(full, distRoot, out);
    } else if (!entry.name.endsWith('.map') && entry.name !== 'app-files-manifest.json') {
      const buf = fs.readFileSync(full);
      const rel = '/' + path.relative(distRoot, full).replace(/\\/g, '/');
      out[rel] = {
        sha256: crypto.createHash('sha256').update(buf).digest('hex'),
        size: buf.length,
      };
    }
  }
}

function appFilesManifestPlugin() {
  return {
    name: 'techcore-app-files-manifest',
    apply: 'build',
    closeBundle() {
      const distRoot = path.resolve(rootDir, 'dist');
      if (!fs.existsSync(distRoot)) return;
      const files = {};
      collectDistHashes(distRoot, distRoot, files);
      const sortedKeys = Object.keys(files).sort();
      const digestSource = sortedKeys.map((k) => `${k}:${files[k].sha256}`).join('\n');
      const rootFingerprint = crypto.createHash('sha256').update(digestSource).digest('hex');
      fs.writeFileSync(
        path.join(distRoot, 'app-files-manifest.json'),
        JSON.stringify(
          {
            generatedAt: Date.now(),
            rootFingerprint,
            source: 'dist-bundle',
            files,
          },
          null,
          2
        ),
        'utf-8'
      );
    },
  };
}

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'googleb9b8a25f8268b525.html',
          '.well-known/assetlinks.json',
          '_redirects',
          '_headers',
        ],
        manifest: {
          id: '/',
          name: 'TechCore — Teknoloji Forumu & AI Merkezi',
          short_name: 'TechCore',
          description:
            'Canlı Tesla ve Türkçe teknoloji haberleri, çok kanallı sohbet, SHA-256 doğrulamalı dosya merkezi ve Gemini AI analiz platformu.',
          theme_color: '#090D16',
          background_color: '#090D16',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          lang: 'tr',
          categories: ['technology', 'developer', 'social', 'utilities'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          shortcuts: [
            {
              name: 'Forum & Canlı Akış',
              short_name: 'Forum',
              url: '/?view=home',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
            {
              name: 'Canlı Sohbet',
              short_name: 'Sohbet',
              url: '/?view=chat',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
            {
              name: 'Dosya Merkezi',
              short_name: 'Dosyalar',
              url: '/?view=upload',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
          globIgnores: ['**/app-files-manifest.json'],
          navigateFallbackDenylist: [
            /^\/api\//,
            /^\/functions\//,
            /^\/google[a-z0-9]+\.html$/i,
            /^\/\.well-known\//,
            /^\/app-files-manifest\.json$/,
          ],
          runtimeCaching: [
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
          enabled: false,
          type: 'module',
        },
      }),
      appFilesManifestPlugin(),
    ],
    build: {
      chunkSizeWarningLimit: 1200,
    },
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
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
