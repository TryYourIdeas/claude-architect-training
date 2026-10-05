export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devtools: { enabled: false },
  typescript: { strict: true },
  app: {
    head: {
      title: 'Claude Architect Training',
      htmlAttrs: { lang: 'en' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
  nitro: {
    // better-sqlite3 is a native module and must be loaded from node_modules at runtime.
    externals: { external: ['better-sqlite3'] },
  },
  runtimeConfig: {
    dbPath: process.env.DB_PATH || './data/architect.db',
    questionsPath: process.env.QUESTIONS_PATH || './data/questions.json',
  },
})
