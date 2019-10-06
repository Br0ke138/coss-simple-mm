
# coss-reverse-dca
Community written bot for coss.io

Questions and feedback goes to [https://t.me/Br0ke138](https://t.me/Br0ke138)

# Strategy
This strategy sells an asset when the market is moving up and will buy back when the market falls.

- The bot will create maker sell orders at different levels
- Each level is x% higher in sell price then the average sell price and the amount of all the previous orders
- Because of precision restrictions, it will round at some points
- When the bot detects that something was sold, it will create a buy order with x% profit
- When the buy order gets filled, it will cancel all remaining orders and create new sell orders
- When something gets sold after a buy order was created, the bot will replace the buy order
- When configured, the bot will replace the sell orders (no buy order exists) when the market moved down

### Example Structure
```
------------------------------BUILDING DCA------------------------------
Placed sell order with price: 0.000116 and amount: 172.42 | averagePrice: 0.000116
Placed sell order with price: 0.000119 and amount: 172.42 | averagePrice: 0.0001175
Placed sell order with price: 0.00012 and amount: 344.84 | averagePrice: 0.00011874999999999999
Placed sell order with price: 0.000122 and amount: 689.68 | averagePrice: 0.00012037499999999997
Placed sell order with price: 0.000123 and amount: 1379.36 | averagePrice: 0.00012168749999999998
Placed sell order with price: 0.000125 and amount: 2758.72 | averagePrice: 0.00012334375
Placed sell order with price: 0.00013 and amount: 5517.44 | averagePrice: 0.000126671875
Placed sell order with price: 0.000134 and amount: 11034.88 | averagePrice: 0.0001303359375
Placed sell order with price: 0.000137 and amount: 22069.76 | averagePrice: 0.00013366796874999997
------------------------------------------------------------------------
```

# How to use
- Ensure you have Node.js installed: [https://nodejs.org/en/download/](https://nodejs.org/en/download/)
- Copy repository (the bot/script)
```shell
git clone https://github.com/Br0ke138/coss-reverse-dca.git
```
- Navigate into repository
```shell
cd coss-reverse-dca
```
- Intstall dependencies (If you get an error, you probably have no Node.js)
```shell
npm install
```
- Configure the bot with config.json
- Start the bot
```shell
node index
```

# Config
```json
{  
  "publicKey": "Your Public Key", 
  "privateKey": "Your Private Key or also named Secret",  
  "pair": "COS_ETH",  
  "startAmount": 0.02,  
  "startPricePercent": 0,  
  "dca": [  
    2, 2, 2, 2, 2, 5, 5, 5  
  ],  
  "profit": 0,  
  "secondsToKeepDCA": 30,  
  "live": false  
}
```
- publicKey: You get this from here [https://www.coss.io/c/accounts/api](https://www.coss.io/c/accounts/api)
- privateKey: You get this from here [https://www.coss.io/c/accounts/api](https://www.coss.io/c/accounts/api)
- pair: On which pair to trade on
- startAmount: Amount of the first sell order (value in quote-> COS_ETH -> in ETH)
- startPricePercent: how much percent above the lowest sell order in the orderbook should the first sell order be created (1 -> 1%)
- dca: Array of DCA levels. For each entry the bot will try to double up when the price is above value% from the average sell price 
(If you use more levels and higher values, the bot is way safer but may not produce as much profit, the same goes the other way, lower values can produce quick profit, but your stack could get empty and the bot will reach no chance to buy back)
```
Ex. calculate next level with 2%
   Level 1 = sell 100 cos at 0.000120 
   Level 2 = sell 100 cos at 0.000130 
   Level 3 = (average  0.000125 -> next sell is 2% higher) = 200 cos at 0.0001275 (rounded up to 0.000128))
```
- profit: how much percent under the average sell price should the bot buy back (1 -> 1%)
- secondsToKeepDCA: Seconds until the bot checks if the orderbook moved down and rebuild the dca structure when needed (30 -> 30 seconds, null -> disabled)
- live: false -> demo Mode, true -> CAUTION: Bot will create REAL orders. Please read the Disclaimer
# Disclaimer
ALL trading is at your own risk when using this script.
