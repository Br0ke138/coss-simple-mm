const ccxt = require('ccxt');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('./data/db.json');
const db = low(adapter);
const request = require('request');

// --------------------------------------------------------

db.defaults({sellOrders: [], buyOrders: [], averagePrice: null, unrecoverable: false})
    .write();

const config = require('./config/config.json');
const sources = require('./config/sources.json');

// --------------------------------------------------------
let priceInfoSources = 0;
let fetchedAllPrices = false;
let prices = {
    manual: sources.manual.price,
    cmc: null
};

let minOrderSize;
let amountPrecision;
let pricePrecision;

let sellOrders = [];
let buyOrders = [];
let averagePrice;
let prevChange;

// --------------------------------------------------------

// instantiate the exchange
let coss = new ccxt.coss({
    apiKey: config.publicKey,
    secret: config.privateKey,
});

async function fetchCMC(quote, asset) {
    request({
        url: 'https://web-api.coinmarketcap.com/v1/tools/price-conversion?amount=1&convert_id=' + quote + '&id=' + asset,
        json: true
    }, function (error, response, body) {
        if (error) {
            console.log('couldn´t fetch price from cmc');
            console.log(error);
            return;
        }
        prices.cmc = body.data.quote[quote].price;
        fetchedAllPrices = true;
    });
}

function initPolling() {
    if (sources.manual.enabled) {
        priceInfoSources++;
    }
    if (sources.cmc.enabled) {
        priceInfoSources++;
        fetchCMC(sources.cmc.quoteId, sources.cmc.assetId);
        setInterval(fetchCMC, sources.cmc.interval, sources.cmc.quoteId, sources.cmc.assetId);
    }
}

async function startBot() {
    if (process.env.RUN_IN_HEROKU) {
        config.publicKey = process.env.CONFIG_PUBLIC_KEY;
        config.privateKey = process.env.CONFIG_PRIVATE_KEY;
        config.pair = process.env.CONFIG_PAIR;
        config.allowTaker = process.env.CONFIG_ALLOW_TAKER === 'true';
        config.sellLots = process.env.CONFIG_SELL_LOTS.split(',');
        config.sellSpreads = process.env.CONFIG_SELL_SPREADS.split(',');
        config.buyLots = process.env.CONFIG_BUY_LOTS.split(',');
        config.buySpreads = process.env.CONFIG_BUY_SPREADS.split(',');
        config.priceChangeTrigger = parseFloat(process.env.CONFIG_PRICE_CHANGE_TRIGGER);
        config.live = process.env.CONFIG_LIVE === 'true';

        sources.manual.enabled = process.env.SOURCES_MANUAL_ENABLED === 'true';
        sources.manual.price = parseFloat(process.env.SOURCES_MANUAL_PRICE);
        sources.cmc.enabled = process.env.SOURCES_CMC_ENABLED === 'true';
        sources.cmc.interval = parseInt(process.env.SOURCES_CMC_INTERVAL, 10);
        sources.cmc.assetId = parseInt(process.env.SOURCES_ASSET_ID, 10);
        sources.cmc.quoteId = parseInt(process.env.SOURCES_QUOTE_ID, 10);
    }
    initPolling();
    await loadConfigAndTradingInfo();

    if (sellOrders.length > 0 || buyOrders.length > 0) {
        console.log('Found existing MM structure. Bot will cancel all orders and build new MM structure');
        await cancelAllOrders();
        await buildMMStructure();
    } else {
        console.log('No MM structure found. Bot will build it now');
        await buildMMStructure();
    }
    console.log('----------------- Start watching price -----------------');
    checkForMovement();
}

async function buildMMStructure() {
    if (!fetchedAllPrices) {
        console.log('Waiting for all prices ...');
        await timeout(1000);
        buildMMStructure();
        return;
    }

    if (!config.live) {
        console.log('\nRUNNING IN DEMO MODE - NOTHING GETS PLACED\n');
    }

    console.log('--------------------- Build MM Structure ---------------------');

    if (config.live) {
        console.log('Found following Prices: ');
        if (sources.manual.enabled) console.log('(WIP) Manual: ' + sources.manual.price);
        if (sources.cmc.enabled) console.log('Coinmarketcap: ' + prices.cmc);
        console.log('Avg Price: ', calculateAvgPrice(), '\n');
        averagePrice = calculateAvgPrice();
        db.set('averagePrice', averagePrice).write();

        let lowestSellPrice;
        let highestBuyPrice;

        const sellPrice = await tryCatch(getLowestSellPriceWithRetry());
        if (sellPrice.success) {
            lowestSellPrice = sellPrice.result;
        } else {
            console.log(sellPrice.error);
            buildMMStructure();
            return;
        }

        const buyPrice = await tryCatch(getHighestBuyPriceWithRetry());
        if (buyPrice.success) {
            highestBuyPrice = buyPrice.result;
        } else {
            console.log(buyPrice.error);
            buildMMStructure();
            return;
        }

        console.log('lowestSellPrice', lowestSellPrice);
        console.log('highestBuyPrice', highestBuyPrice);
        console.log('\nAllow Taker Orders: ' + config.allowTaker + '\n');

        let currentSellPrice = averagePrice;
        for (let i = 0; i < config.sellSpreads.length; i++) {
            currentSellPrice = (currentSellPrice * (1 + config.sellSpreads[i] / 100)).toFixed(pricePrecision);
            const amount = (config.sellLots[i] / currentSellPrice).toFixed(amountPrecision);

            if (!config.allowTaker && currentSellPrice <= highestBuyPrice) {
                console.log('Won´t sell ' + amount + ' at ' + currentSellPrice);
            } else {
                const sellOrder = await tryCatch(placeSellOrderWithRetry(currentSellPrice, amount));
                if (sellOrder.success) {
                    sellOrders.push(sellOrder.result.id);
                    db.set('sellOrders', sellOrders).write();
                    console.log('Placed sell order with price: ' + currentSellPrice + ' and amount: ' + amount);
                } else {
                    console.log(sellOrder.error);
                }
            }
        }
        console.log('\n');

        let currentBuyPrice = averagePrice;
        for (let i = 0; i < config.buySpreads.length; i++) {
            currentBuyPrice = (currentBuyPrice * (1 - config.buySpreads[i] / 100)).toFixed(pricePrecision);
            const amount = (config.buyLots[i] / currentBuyPrice).toFixed(amountPrecision);

            if (!config.allowTaker && currentBuyPrice >= lowestSellPrice) {
                console.log('Won´t buy ' + amount + ' at ' + currentBuyPrice);
            } else {
                const buyOrder = await tryCatch(placeBuyOrderWithRetry(currentBuyPrice, amount));
                if (buyOrder.success) {
                    buyOrders.push(buyOrder.result.id);
                    db.set('buyOrders', buyOrders).write();
                    console.log('Placed buy order with price: ' + currentBuyPrice + ' and amount: ' + amount);
                } else {
                    console.log(buyOrder.error);
                }
            }
        }

        console.log('Waiting 10 sec, because API restriction ...');
        await timeout(10000);
    } else {
        await buildMMStructureDemo();
    }
}

async function buildMMStructureDemo() {
    console.log('Found following Prices: ');
    if (sources.manual.enabled) console.log('Manual: ' + sources.manual.price);
    if (sources.cmc.enabled) console.log('Coinmarketcap: ' + prices.cmc);
    console.log('Avg Price: ', calculateAvgPrice(), '\n');
    averagePrice = calculateAvgPrice();

    let lowestSellPrice;
    let highestBuyPrice;

    const sellPrice = await tryCatch(getLowestSellPriceWithRetry());
    if (sellPrice.success) {
        lowestSellPrice = sellPrice.result;
    } else {
        console.log(sellPrice.error);
        process.exit(1);
    }

    const buyPrice = await tryCatch(getHighestBuyPriceWithRetry());
    if (buyPrice.success) {
        highestBuyPrice = buyPrice.result;
    } else {
        console.log(buyPrice.error);
        process.exit(1);
    }

    console.log('lowestSellPrice', lowestSellPrice);
    console.log('highestBuyPrice', highestBuyPrice);
    console.log('\nAllow Taker Orders: ' + config.allowTaker + '\n');


    let sellAmounts = [];
    let sellPrices = [];

    let currentSellPrice = averagePrice;
    config.sellSpreads.forEach((sellSpread, index) => {
        currentSellPrice = (currentSellPrice * (1 + sellSpread / 100)).toFixed(pricePrecision);
        const amount = (config.sellLots[index] / currentSellPrice).toFixed(amountPrecision);
        sellAmounts.push(amount);
        sellPrices.push(currentSellPrice);
    });
    sellPrices = sellPrices.reverse();
    sellAmounts = sellAmounts.reverse();
    sellPrices.forEach((price, index) => {
        if (!config.allowTaker && price <= highestBuyPrice) {
            console.log('Won´t sell ' + sellAmounts[index] + ' at ' + price);
        } else {
            console.log('Sell ' + sellAmounts[index] + ' at ' + price);
        }
    });
    console.log('\n');

    let currentBuyPrice = averagePrice;
    config.buySpreads.forEach((buySpread, index) => {
        currentBuyPrice = (currentBuyPrice * (1 - buySpread / 100)).toFixed(pricePrecision);
        const amount = (config.buyLots[index] / currentBuyPrice).toFixed(amountPrecision);

        if (!config.allowTaker && currentBuyPrice >= lowestSellPrice) {
            console.log('Won´t buy ' + amount + ' at ' + currentBuyPrice);
        } else {
            console.log('Buy ' + amount + ' at ' + currentBuyPrice);
        }
    });

}

function calculateAvgPrice() {
    let sum = 0;
    if (sources.manual.enabled) {
        sum = sum + parseFloat(sources.manual.price);
    }
    if (sources.cmc.enabled) {
        sum = sum + parseFloat(prices.cmc.toFixed(pricePrecision));
    }
    return sum / priceInfoSources;
}

function calculateDifference(num1, num2) {
    return (num1 > num2) ? num1 - num2 : num2 - num1
}

async function checkForMovement() {
    const priceChange = calculateDifference(averagePrice, calculateAvgPrice()) * 100 / averagePrice;
    if (prevChange !== priceChange) {
        console.log('Price changed by ' + priceChange.toFixed(2) + '%');
        prevChange = priceChange;

        if (priceChange > config.priceChangeTrigger) {
            console.log('Hit threshold of: ' + config.priceChangeTrigger + '% will cancel all Orders and rebuild');
            await cancelAllOrders();
            await buildMMStructure();
            console.log('----------------- Start watching price -----------------');
        }
    }
    await timeout(500);
    checkForMovement();
}

async function checkConfig() {
    console.log('Checking config for errors ... (TODO)');
    // TODO: really check config
    console.log('Config is fine. Good job :)');
}

async function loadConfigAndTradingInfo() {
    console.log('--------------- Loading Config and fetching Trading Info ---------------');
    await checkConfig();
    config.pair = config.pair.replace('_', '/').toUpperCase();

    console.log('Loading minOrderSize ...');
    const restriction = await tryCatch(fetchTradingRestrictionWithRetry());
    if (restriction.success) {
        minOrderSize = restriction.result;
    } else {
        console.log(restriction.error);
        process.exit(1);
    }

    console.log('Loading Precisions ...');
    const precision = await tryCatch(fetchTradingPrecisionWithRetry());
    if (precision.success) {
        amountPrecision = precision.result.amountPrecision;
        pricePrecision = precision.result.pricePrecision;
    } else {
        console.log(precision.error);
        process.exit(1);
    }

    console.log('Loading data from database ...');
    sellOrders = db.get('sellOrders').value();
    buyOrders = db.get('buyOrders').value();
    averagePrice = db.get('averagePrice').value();
    if (db.get('unrecoverable').value()) {
        console.log('Bot was canceled or crashed in a state it cant recover from. Please cancel all orders and delete the content of /data/db.json');
        process.exit(1);
    }

    console.log('--------------- Loaded ---------------');
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --------- API CALLS -------------

async function tryCatch(promise) {
    return promise
        .then(result => ({success: true, result}))
        .catch(error => ({success: false, error}))
}

// Get the minOrderSize
async function fetchTradingRestrictionWithRetry(retries = 5) {
    return new Promise(async (resolve, reject) => {
        for (let i = 1; i <= retries; i++) {
            let limits = await tryCatch(coss.webGetCoinsGetBaseList());
            if (limits.success && limits.result.length > 0) {
                limits.result.forEach(limit => {
                    if (limit.currency === config.pair.split('/')[1]) {
                        if (config.startAmount < minOrderSize) {
                            reject(new Error('startAmount is to low on this quote. Need atleast: ' + limit.limit));
                        } else {
                            resolve(limit.limit);
                        }
                    }
                });
                return;
            }
        }
        reject(new Error('Unable to fetch minOrderSize for pair: ' + config.pair));
    });
}

// Get the precision of the amount and price
async function fetchTradingPrecisionWithRetry(retries = 5) {
    return new Promise(async (resolve, reject) => {
        for (let i = 1; i <= retries; i++) {
            let symbols = await tryCatch(coss.webGetOrderSymbols());
            if (symbols.success && symbols.result.length > 0) {
                symbols.result.forEach(symbol => {
                    if (symbol.symbol === config.pair.replace('/', '_')) {
                        resolve({
                            amountPrecision: symbol['amount_limit_decimal'],
                            pricePrecision: symbol['price_limit_decimal']
                        });
                    }
                });
                return;
            }
        }
        reject(new Error('Unable to fetch Precisions for pair: ' + config.pair));
    });
}

// Get a specific order
async function fetchOrderWithRetry(id, retries = 5) {
    return new Promise(async (resolve, reject) => {
        for (let i = 1; i <= retries; i++) {
            const order = await tryCatch(coss.fetchOrder(id, config.pair.replace('/', '_')));
            if (order.success && order.result['id']) {
                resolve(order.result);
                return;
            }
        }
        reject(new Error('Unable to fetch Order with id: ' + id));
    })
}

// Get a specific order trade detail
async function fetchOrderTradeDetailWithRetry(id, retries = 5) {
    return new Promise(async (resolve, reject) => {
        for (let i = 1; i <= retries; i++) {
            const orderTradeDetail = await tryCatch(coss.tradePostOrderTradeDetail({order_id: id}));
            if (orderTradeDetail.success && orderTradeDetail.result.length > 0) {
                resolve(orderTradeDetail.result[0]);
                return;
            }
        }
        reject(new Error('Unable to fetch Order Trade Detail with id: ' + id));
    })
}

// Place a sell limit Order
async function placeSellOrderWithRetry(price, amount, retries = 5) {
    return new Promise(async (resolve, reject) => {
        for (let i = 1; i <= retries; i++) {
            const order = await tryCatch(coss.createLimitSellOrder(config.pair, amount, price));
            if (order.success && order.result['id']) {
                resolve(order.result);
                return;
            }
        }
        reject(new Error('Unable to place sell Order with price: ' + price + ' and amount: ' + amount));
    })
}

// Place a buy limit Order
async function placeBuyOrderWithRetry(price, amount, retries = 5) {
    return new Promise(async (resolve, reject) => {
        for (let i = 1; i <= retries; i++) {
            const order = await tryCatch(coss.createLimitBuyOrder(config.pair, amount, price));
            if (order.success && order.result['id']) {
                resolve(order.result);
                return;
            }
        }
        reject(new Error('Unable to place buy Order with price: ' + price + ' and amount: ' + amount));
    })
}

// Cancel an existing order
async function cancelOrderWithRetry(id, retries = 5) {
    return new Promise(async (resolve, reject) => {
        const order = await tryCatch(fetchOrderWithRetry(id));
        if (order.success) {
            if (order.result.status === 'open') {
                for (let i = 1; i <= retries; i++) {
                    const order = await tryCatch(coss.cancelOrder(id, config.pair.replace('_', '/')));
                    if (order.success && order.result['id']) {
                        resolve('Order canceled');
                        return;
                    }
                }
            } else {
                resolve('Order already canceled or closed');
                return;
            }

        }
        reject(new Error('Unable to cancel order with id: ' + id));
    })
}

// Cancel all orders
async function cancelAllOrders(retries = 3) {
    console.log('Cancelling all Orders');
    return new Promise(async (resolve, reject) => {
        const cancelSellOrders = await tryCatch(cancelAllSellOrders());
        const cancelBuyOrders = await tryCatch(cancelAllBuyOrders());

        if (cancelSellOrders.success && cancelBuyOrders.success) {
            db.set('averagePrice', null).write();
            resolve(true);
            return;
        }

        db.set('unrecoverable', true).write();
        reject(new Error('Bot wasnt able to cancel all orders. Please cancel them and restart the bot.'));
        process.exit(1);
    })
}

// Cancel all sell Orders
async function cancelAllSellOrders(retries = 3) {
    console.log('Cancelling all sell Orders');
    return new Promise(async (resolve, reject) => {

        for (let i = 1; i <= retries; i++) {
            const unCanceledOrders = [];
            for (sellOrder of sellOrders) {
                console.log('Canceling sell Order with id: ' + sellOrder);
                const canceledOrder = await tryCatch(cancelOrderWithRetry(sellOrder));
                if (canceledOrder.success) {
                    console.log(canceledOrder.result);
                } else {
                    console.log(canceledOrder.error);
                    unCanceledOrders.push(sellOrder);
                }
                sellOrders = unCanceledOrders;
                db.set('sellOrders', sellOrders).write();
            }

            if (sellOrders.length === 0) {
                resolve(sellOrders);
                return;
            }
        }
        reject('Failed to cancel all sell orders');
        return;
    })
}

// Cancel all buy Orders
async function cancelAllBuyOrders(retries = 3) {
    console.log('Cancelling all buy Orders');
    return new Promise(async (resolve, reject) => {

        for (let i = 1; i <= retries; i++) {
            const unCanceledOrders = [];
            for (buyOrder of buyOrders) {
                console.log('Canceling buy Order with id: ' + buyOrder);
                const canceledOrder = await tryCatch(cancelOrderWithRetry(buyOrder));
                if (canceledOrder.success) {
                    console.log(canceledOrder.result);
                } else {
                    console.log(canceledOrder.error);
                    unCanceledOrders.push(buyOrder);
                }
                buyOrders = unCanceledOrders;
                db.set('buyOrders', buyOrders).write();
            }

            if (buyOrders.length === 0) {
                resolve(buyOrders);
                return;
            }
        }
        reject('Failed to cancel all buy orders');
        return;
    })
}

// Get balance
async function fetchBalanceWithRetry(retries = 5) {
    return new Promise(async (resolve, reject) => {
        for (let i = 1; i <= retries; i++) {
            const balance = await tryCatch(coss.fetchBalance());
            if (balance.success) {
                resolve(balance.result);
                return;
            }
        }
        reject(new Error('Unable to get the balance'));
    })
}

// Get the lowest sell price in the orderBook
async function getLowestSellPriceWithRetry(retries = 5) {
    return new Promise(async (resolve, reject) => {
        for (let i = 1; i <= retries; i++) {
            let ticker = await tryCatch(coss.fetchTicker(config.pair.replace('_', '/')));
            if (ticker.success && ticker.result['ask']) {
                resolve(ticker.result.ask);
                return;
            }
        }
        reject(new Error('Unable to get the ticker for pair: ' + config.pair));
    });
}

// Get the highest buy price in the orderBook
async function getHighestBuyPriceWithRetry(retries = 5) {
    return new Promise(async (resolve, reject) => {
        for (let i = 1; i <= retries; i++) {
            let ticker = await tryCatch(coss.fetchTicker(config.pair.replace('_', '/')));
            if (ticker.success && ticker.result['bid']) {
                resolve(ticker.result.bid);
                return;
            }
        }
        reject(new Error('Unable to get the ticker for pair: ' + config.pair));
    });
}

// --------- API CALLS END -------------

function getCleanPrice(price) {
    return Math.ceil(Math.pow(10, pricePrecision) * price) / Math.pow(10, pricePrecision);
}

function getCleanPriceFloor(price) {
    return Math.ceil(Math.pow(10, pricePrecision) * price) / Math.pow(10, pricePrecision);
}

function getCleanAmount(amount) {
    return Math.ceil(Math.pow(10, amountPrecision) * amount) / Math.pow(10, amountPrecision);
}

function getCleanAmountFloor(amount) {
    return Math.ceil(Math.pow(10, amountPrecision) * amount) / Math.pow(10, amountPrecision);
}


try {
    startBot();
} catch (e) {
    console.log('Unhandled Error', e);
}



