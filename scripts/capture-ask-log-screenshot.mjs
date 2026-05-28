#!/usr/bin/env node
/**
 * Captures docs/screenshots/05-ask-log.png — LogCortex with sample log + Ask Log panel.
 * Requires: npm run build, then preview on PREVIEW_URL (default http://127.0.0.1:4173).
 */
import { chromium } from 'playwright'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const fixture = resolve(root, 'scripts/fixtures/sample-mongod.log')
const out = resolve(root, 'docs/screenshots/05-ask-log.png')
const baseUrl = process.env.PREVIEW_URL || 'http://127.0.0.1:4173'

async function waitForApp(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForSelector('#fileInput', { state: 'attached', timeout: 30_000 })
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2,
  })

  try {
    await waitForApp(page)
    await page.locator('#fileInput').setInputFiles(fixture)
    await page.waitForSelector('text=sample-mongod.log', { timeout: 60_000 })
    await page.waitForSelector('text=Slow Queries', { timeout: 30_000 })
    await page.waitForTimeout(800)

    const allQuestions = page.getByRole('button', { name: /^Example questions$/ })
    await allQuestions.click()
    await page.waitForSelector('text=/Generic example phrasings/', { timeout: 15_000 })
    await page.waitForTimeout(400)

    await page.screenshot({ path: out, type: 'png' })
    console.log(`Wrote ${out}`)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
