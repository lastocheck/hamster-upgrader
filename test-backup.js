const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const loadFrom = process.argv.slice(2)[0];
const cardsToUpgade = 15;

(async () => {
    // Path to the unpacked extension
    const extensionPath = path.join(__dirname, 'pkoacgokdfckfpndoffpifphamojphii');

    // Launch browser with the extension in headful mode
    const browser = await chromium.launch({
        headless: false,
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });

    // Load the saved context state
    const context = await browser.newContext({ storageState: 'storageState.json' });

    // Open a new page
    const page = await context.newPage();

    // Navigate to the website
    await page.goto('https://web.telegram.org/k');

    await page.waitForURL('https://web.telegram.org/k/#@hamster_kombat_bot');

    await page.getByText('Играть в 1 клик').click();
    await page.getByRole('button', { name: 'Launch' }).click();

    // Switch to the iframe context
    const iframeElement = await page.waitForSelector('.payment-verification', { timeout: 5000 });

    const iframe = await iframeElement.contentFrame();

    await iframe.getByText('Спасибо, Bybit').click();

    await iframe.getByText('Mine').click();

    const element = await iframe.waitForSelector('css=div.tabs-list');

    let cards;
    if (loadFrom === 'new') {
        cards = await getCards(iframe);
        await saveCardsToFile(cards);
    } else {
        cards = await loadCardsFromFile('./card_data.json');
    }

    const bestCards = await getBestCards(cards);
    console.log(bestCards);
    await upgradeCards(iframe, bestCards);

    await page.waitForTimeout(8000000);

    // Close the browser
    await browser.close();
})();

async function upgradeCards(iframe, bestCards) {
    for (const card of bestCards) {
        const tabsDiv = iframe.locator('css=div.tabs-list');
        await tabsDiv.getByText(card.tab).click();

        const tabsInner = iframe.locator('css=div.tabs-inner');
        await tabsInner.getByText(card.name, { exact: true }).click();

        const button = await iframe.locator(
            'css=button.bottom-sheet-button.button.button-primary.button-large.is-sticky'
        );
        const isDisabled = await button.getAttribute('disabled');
        if (isDisabled) {
            console.log(`${card.name} button is disabled, skipping`);
            continue;
        }

        await iframe.getByText('Получить').click();
        await iframe.locator('css=div.bottom-sheet-close').click();
        console.log(
            `upgraded the card ${card.name} with profit ${card.profit} for the price ${card.price} with ratio ${card.ratio}`
        );
    }
    console.log(`---successfully upgraded ${cardsToUpgade} cards yay---`);
}

async function getCards(iframe) {
    const cards = [];
    const tabsLocator = iframe.locator('css=div.tabs-item');
    const tabs = await tabsLocator.all();

    for (const tab of tabs) {
        await processTab(tab, cards, iframe, ['css=div.upgrade-item', 'css=div.upgrade-item-title']);
    }

    await processTab(iframe.getByText('Specials'), cards, iframe, [
        'css=div.upgrade-special',
        'css=div.upgrade-special-title'
    ]);

    return cards;
}

async function processTab(tab, cards, iframe, selectors) {
    const tabName = await tab.textContent();
    await tab.click();

    const upgradeItemsLocator = iframe.locator(selectors[0]);
    const upgradeItems = await upgradeItemsLocator.all();

    for (const upgradeItem of upgradeItems) {
        const cardName = await upgradeItem.locator(selectors[1]).textContent();

        //check for element from another specials sub-tab
        const hasHiddenParent = await upgradeItem.evaluate(async (element) => {
            let parent = element.parentElement.parentElement;
            return window.getComputedStyle(parent).getPropertyValue('display') === 'none';
        });

        if (hasHiddenParent) {
            console.log(`Skipping ${cardName} with hidden grand-parent .tabs-special-inner`);
            continue;
        }

        //check for a timer
        const hasATimer = await upgradeItem.evaluate((element, selector) => {
            return element.querySelector(selector) !== null;
        }, 'div.upgrade-progress');

        //check for a lock
        const isLocked = await upgradeItem.evaluate((element, selector) => {
            return element.querySelector(selector) !== null;
        }, 'div.is-upgrade-lock');

        //check for expired
        const isExpired = await upgradeItem.evaluate((element, className) => {
            return element.classList.contains(className);
        }, 'is-expired');

        //check for disabled
        const isDisabled = await upgradeItem.evaluate((element, className) => {
            return element.classList.contains(className);
        }, 'is-disabled');

        //check if unavailable for purchase
        const isUnavailable = await upgradeItem.evaluate((element) => {
            const allChildren = element.querySelectorAll('*');
            for (const child of allChildren) {
                if (child.textContent.includes('Вы владеете этой картой')) {
                    return true;
                }
            }
            return false;
        });

        if (isUnavailable | hasATimer | isLocked | isExpired | isDisabled) {
            if (hasATimer) console.log(`card ${cardName} has a timer, skipping`);
            if (isUnavailable) console.log(`card ${cardName} is unavailable, skipping`);
            if (isLocked) console.log(`card ${cardName} is locked, skipping`);
            if (isDisabled) console.log(`card ${cardName} is disabled, skipping`);
            if (isExpired) console.log(`card ${cardName} is expired, skipping`);

            continue;
        }
        //main
        await upgradeItem.click();

        //check for the cards that don't have profit
        let retryCount = 0;
        let cardElementsExist = false;
        while (retryCount < 5) {
            cardElementsExist = await iframe.evaluate(() => {
                return document.querySelector('div.upgrade-buy .upgrade-buy-stats-info .price-value') !== null;
            });

            if (cardElementsExist) break;
            await new Promise((resolve) => setTimeout(resolve, 300));
            retryCount++;
        }

        if (!cardElementsExist) {
            await iframe.locator('css=div.bottom-sheet-close').click();
            console.log(`couldn't find price on card ${cardName}`);
            continue;
        }

        const cardProfit = await iframe
            .locator('css=div.upgrade-buy .upgrade-buy-stats-info .price-value')
            .textContent();
        const cardPrice = await iframe.locator('css=div.upgrade-buy .upgrade-buy-info .price-value').textContent();

        const profitElement = await iframe
            .locator('css=div.upgrade-buy .upgrade-buy-stats-info .price-value')
            .elementHandle();
        const priceElement = await iframe.locator('css=div.upgrade-buy .upgrade-buy-info .price-value').elementHandle();

        if (!profitElement || !priceElement) {
            continue;
        }

        cards.push({
            tab: tabName,
            name: cardName,
            profit: convertProfit(cardProfit),
            price: convertPrice(cardPrice)
        });
        await iframe.locator('css=div.bottom-sheet-close').click();
    }
}

async function getBestCards(cards, topN = cardsToUpgade) {
    if (cards.length === 0) {
        return []; // Handle empty array case
    }

    // Calculate the price-to-profit ratio for each card and add it to the card object
    cards.forEach((card) => {
        card.ratio = card.price / card.profit;
    });

    // Sort the cards by their price-to-profit ratio in ascending order
    cards.sort((a, b) => a.ratio - b.ratio);

    // Return the top N cards
    return cards.slice(0, topN);
}

async function saveCardsToFile(cards) {
    console.log('saving to file...');

    const jsonData = JSON.stringify(cards, null, 2);

    const fileName = 'card_data.json';

    fs.writeFile(fileName, jsonData, (err) => {
        if (err) {
            console.error('Error writing to file:', err);
        } else {
            console.log(`Data successfully written to ${fileName}`);
        }
    });
}

async function loadCardsFromFile(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        const cards = JSON.parse(data);
        return cards;
    } catch (error) {
        console.error('Error reading or parsing the file:', error);
        return [];
    }
}

function convertProfit(profit) {
    let value = profit.replace('+', '').replace(',', '.').trim();
    if (value.endsWith('K')) {
        value = parseFloat(value.replace('K', '')) * 1000;
    }
    return parseFloat(value);
}

function convertPrice(price) {
    return parseFloat(price.replace(/\s/g, ''));
}
