
# coss-simple-mm
Community written bot for coss.io

Questions and feedback goes to [https://t.me/Br0ke138](https://t.me/Br0ke138)

# Strategy
The bot wil fetch the price from different sources and calculate the average price.
Then it will use the specified lot sizes and spreads, to place orders around the calculated price.
You can specify, if it should only place maker orders or also take orders.

# How to use
- Ensure you have Node.js and npm installed: [https://nodejs.org/en/download/](https://nodejs.org/en/download/)
```shell
node -v
npm -v
```
- Copy repository (the bot/script)
```shell
git clone https://github.com/Br0ke138/coss-simple-mm.git
```
- Navigate into repository
```shell
cd coss-simple-mm
```
- Intstall dependencies (If you get an error, you probably have no Node.js)
```shell
npm install
```
- Configure the bot with config/config.json
- Configure your price sources via config/sources.json
- Start the bot
```shell
node index
```

# config.json
```json
{  
  "publicKey": "Your Public Key", 
  "privateKey": "Your Private Key or also named Secret",  
  "pair": "COS_ETH",  
  "allowTaker": false,
  "sellLots": [0.02, 0.03, 0.04, 0.05, 0.06],
  "sellSpreads": [1, 1, 1, 1, 1],
  "buyLots": [0.02, 0.03, 0.04, 0.05, 0.06],
  "buySpreads": [1, 1, 1, 1, 1],
  "priceChangeTrigger": 1,
  "live": false
}
```
- publicKey: You get this from here [https://www.coss.io/c/accounts/api](https://www.coss.io/c/accounts/api)
- privateKey: You get this from here [https://www.coss.io/c/accounts/api](https://www.coss.io/c/accounts/api)
- pair: On which pair to trade on (IMPORTANT: When you change this value, you need to edit sources.json!)
- allowTaker: if set to false, bot will check orderbook before placing an order to not take any other order (NOT GUARANTEED)
- sellLots/buyLots: For each entry, the bot will place an order with the specified lot size
- sellSpreads/buySpreads: the spread in % of the orders. the first number is the spread to the market price (same amount of entries needed as the corresponding lotSize Array)
- priceChangeTrigger: How much % does the market price have to change, before replacing all order at the new price level
- live: false -> demo Mode, true -> CAUTION: Bot will create REAL orders. Please read the Disclaimer

# sources.json
```
{
  "manual": {
    "enabled": false,
    "price": 1
  },
  "cmc": {
    "enabled": true,
    "interval": 30000,
    "assetId": 1989, // This would be COS (Cos)
    "quoteId": 1027 // This would be ETH (Ethereum)
  }
}
```
- manual 
    - enabled: true -> use this source, false: don´t use this source
    - price: hardcoded price value
- cmc (coinmarketcap)
    - enabled: true -> use this source, false: don´t use this source
    - interval: how often to refresh the data (time in milliseconds) Note: CMC only updates every 30 sec
    - assetId: Coinmarketcap internal id of asset, can be found in CMC_IDS.json (Left coin of the pair)
    - quoteId: Coinmarketcap internal id of asset, can be found in CMC_IDS.json (Right coin of the pair)

You can use multiple sources and more are to come!
# Disclaimer
ALL trading is at your own risk when using this script.
Please run the bot alteast once in demo mode, to see where it would place orders and if you are happy with it.
