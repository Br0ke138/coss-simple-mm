
# coss-simple-mm
Community written bot for coss.io

Questions and feedback goes to [https://t.me/Br0ke138](https://t.me/Br0ke138)

# How to use
- Ensure you have Node.js installed: [https://nodejs.org/en/download/](https://nodejs.org/en/download/)
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
  "live": false  
}
```
- publicKey: You get this from here [https://www.coss.io/c/accounts/api](https://www.coss.io/c/accounts/api)
- privateKey: You get this from here [https://www.coss.io/c/accounts/api](https://www.coss.io/c/accounts/api)
- pair: On which pair to trade on
- live: false -> demo Mode, true -> CAUTION: Bot will create REAL orders. Please read the Disclaimer
# Disclaimer
ALL trading is at your own risk when using this script.
