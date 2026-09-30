import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import ts from 'typescript-6'
import { defineConfig } from 'vitepress'
import pkg from '../../package.json' with { type: 'json' }

const repo = 'https://github.com/mojtaba-afraz/doxor.js'
const path = (relative: string) => decodeURIComponent(new URL(relative, import.meta.url).pathname)

export default defineConfig({
  lang: 'en-US',
  title: 'doxor.js',
  titleTemplate: ':title | doxor.js',
  description: 'Typed collections for IndexedDB. Declare once, get types, indexes and migrations.',
  base: '/doxor.js/',
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: 'https://mojtaba-afraz.github.io/doxor.js/' },
  // The playground is a separate Vite app, copied into the build output under /playground/.
  ignoreDeadLinks: [/^\/playground\//],

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/doxor.js/favicon.png' }],
    ['link', { rel: 'apple-touch-icon', href: '/doxor.js/apple-touch-icon.png' }],
    ['meta', { name: 'theme-color', content: '#98c93c' }],
  ],

  markdown: {
    codeTransformers: [
      transformerTwoslash({
        // Show `// ^?` types on their own line instead of a popup over the next line of code.
        queryRendering: 'line',
        // Twoslash needs TypeScript's JS API, which TypeScript 7 (used for the library) no longer has.
        twoslashOptions: {
          // Its types expect the root `typescript` package (7.x), hence the cast.
          tsModule: ts as never,
          tsLibDirectory: path('../../node_modules/typescript-6/lib'),
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
            strict: true,
            types: [],
            paths: { 'doxor.js': [path('../../src/index.ts')] },
          },
        },
      }),
    ],
  },

  themeConfig: {
    logo: { src: '/mark.webp', width: 24, height: 24, alt: '' },
    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: 'API', link: '/api/' },
      { text: 'Compare', link: '/compare' },
      { text: 'Playground', link: '/playground/', target: '_self' },
      {
        text: `v${pkg.version}`,
        items: [
          { text: 'Changelog', link: `${repo}/blob/main/CHANGELOG.md` },
          { text: 'Releases', link: `${repo}/releases` },
          { text: 'Migrating from 1.x', link: '/guide/migrating-from-1x' },
        ],
      },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Migrating from 1.x', link: '/guide/migrating-from-1x' },
        ],
      },
      {
        text: 'Guide',
        items: [
          { text: 'Declaring a database', link: '/guide/collections' },
          { text: 'Reading and writing', link: '/guide/reading-writing' },
          { text: 'Queries', link: '/guide/queries' },
          { text: 'Transactions', link: '/guide/transactions' },
          { text: 'Schema changes and migrations', link: '/guide/migrations' },
          { text: 'Multiple tabs', link: '/guide/multiple-tabs' },
          { text: 'Errors', link: '/guide/errors' },
          { text: 'SSR, frameworks and tests', link: '/guide/ssr-and-testing' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'API reference', link: '/api/' },
          { text: 'Comparison', link: '/compare' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: repo },
      { icon: 'npm', link: 'https://www.npmjs.com/package/doxor.js' },
    ],
    search: { provider: 'local' },
    editLink: { pattern: `${repo}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
    outline: { level: [2, 3] },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Mojtaba Afraz',
    },
  },
})
