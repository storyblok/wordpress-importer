import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs/promises'
import decompress from 'decompress'
import "dotenv/config"

(async () => {
    const wp_base_url = process.env.WP_BASE_URL
    const downloadsPath = path.resolve('./tablepress_export')
    await fs.rm(downloadsPath, { recursive: true, force: true })

    console.log("Launching headless browser...")
    const browser = await chromium.launch({
        headless: true,
    });
    const page = await browser.newPage()
    await page.setViewportSize({width: 1080, height: 1024})

    console.log("Logging in...")
    await page.goto(`${wp_base_url}/admin`)
    await page.type('#user_login', process.env.WP_ADMIN_USERNAME)
    await page.type('#user_pass', process.env.WP_ADMIN_PASSWORD)
    await page.click('#wp-submit')

    console.log("Performing export of tables...")
    await page.goto(`${wp_base_url}/wp-admin/admin.php?page=tablepress_export`)
    await page.click('#tables-export-select-all', { timeout: 60 })
    await page.locator('#tables-export-format').selectOption('json')
    const downloadPromise = page.waitForEvent('download')
    await page.click('input[value="Download Export File"]')
    const download = await downloadPromise
    const fullZipPath = `${downloadsPath}/raw.zip`
    await download.saveAs(fullZipPath)

    console.log("Closing browser...")
    await browser.close();

    console.log("Decompressing export and cleaning up...")
    await decompress(fullZipPath, downloadsPath)
    await fs.rm(fullZipPath)
})()
