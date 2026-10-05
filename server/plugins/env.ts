import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// `nuxt dev` reads .env itself, but the production server (`node .output/server/index.mjs`,
// or `npm run preview`) does not. Load it here so both start the same way.
// Variables already set in the environment are not overridden.
export default defineNitroPlugin(() => {
  const file = resolve(process.cwd(), '.env')
  if (existsSync(file)) process.loadEnvFile(file)
})
