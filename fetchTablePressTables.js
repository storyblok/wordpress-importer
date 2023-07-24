import puppeteer from 'puppeteer';
import "dotenv/config"

(async () => {
    const wp_base_url = process.env.WP_BASE_URL

    // Launch the browser and open a new blank page
    const browser = await puppeteer.launch({
        headless: 'new',
    });
    const page = await browser.newPage();
    await page.setViewport({width: 1080, height: 1024});

    // Log in
    await page.goto(`${wp_base_url}/admin`)
    await page.type('#user_login', process.env.WP_ADMIN_USERNAME)
    await page.type('#user_pass', process.env.WP_ADMIN_PASSWORD)
    await page.click('#wp-submit')

    await page.goto(`${wp_base_url}/wp-admin/admin.php?page=tablepress_export`)

    const textSelector = await page.waitForSelector(
        'text/Exporting a table'
    )
    const fullText = await textSelector?.evaluate(el => el.textContent)
    console.log(fullText)

    await browser.close();
})();
