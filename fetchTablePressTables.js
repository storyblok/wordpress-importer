import puppeteer from 'puppeteer';
import "dotenv/config"

(async () => {
    // Launch the browser and open a new blank page
    const browser = await puppeteer.launch({
        headless: 'new',
    });
    const page = await browser.newPage();
    await page.setViewport({width: 1080, height: 1024});

    // Log in
    await page.goto(process.env.WP_ADMIN_LOGIN_URL)
    await page.type('#user_login', process.env.WP_ADMIN_USERNAME)
    await page.type('#user_pass', process.env.WP_ADMIN_PASSWORD)
    await page.click('#wp-submit')

    const textSelector = await page.waitForSelector(
        'text/Your site has a critical'
    )
    const fullText = await textSelector?.evaluate(el => el.textContent)
    console.log(fullText)

    await browser.close();
})();
