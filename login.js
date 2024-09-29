const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
    // Path to the unpacked extension
    const extensionPath = path.join(__dirname, 'pkoacgokdfckfpndoffpifphamojphii');

    // Launch browser with the extension in headful mode
    const browser = await chromium.launch({
        headless: false,
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });

    // Create a new context
    const context = await browser.newContext();

    // Open a new page
    const page = await context.newPage();

    // Navigate to the login page
    await page.goto('https://web.telegram.org/k');

    console.log('Please log in manually in the browser window.');

    // Wait for user to manually log in
    await page.waitForTimeout(24000);

    // Save the context state including cookies, local storage, and extension state
    await context.storageState({ path: 'storageState.json' });

    // Close the browser
    await browser.close();
})();
