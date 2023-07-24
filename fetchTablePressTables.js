import puppeteer from 'puppeteer'
import path from 'path'
import "dotenv/config"

(async () => {
    const wp_base_url = process.env.WP_BASE_URL

    // Launch the browser and open a new blank page
    const browser = await puppeteer.launch({
        headless: false,
    });
    const page = await browser.newPage();
    await page.setViewport({width: 1080, height: 1024});

    const client = await page.target().createCDPSession()
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: path.resolve('./tablepress_export'),
    })

    // Log in
    await page.goto(`${wp_base_url}/admin`)
    await page.type('#user_login', process.env.WP_ADMIN_USERNAME)
    await page.type('#user_pass', process.env.WP_ADMIN_PASSWORD)
    await page.click('#wp-submit')

    // Actually do the export
    await page.goto(`${wp_base_url}/wp-admin/admin.php?page=tablepress_export`)
    await page.click('#tables-export-select-all')
    await page.select('#tables-export-format', 'json')
    await page.click('input[value="Download Export File"]')

    // await browser.close();
})();
