const binanceClient = require("./binanceClient");

const { macdStrategy } = require("./macd");

const SYMBOL = "BTCUSDT";
const INTERVAL = "1m";

let candles = [];
let lastSignalType = null;

async function init() {
  console.log("⏳ Loading historical candles...");

  candles = await binanceClient.getKlines({
    symbol: SYMBOL,
    interval: INTERVAL,
    limit: 200
  });

  console.log(`✅ Loaded ${candles.length} candles`);

  binanceClient.subscribeKlines(SYMBOL, INTERVAL);
}

init();

binanceClient.on("kline", ({ symbol, interval, bar }) => {
  if (symbol !== SYMBOL || interval !== INTERVAL) return;

  const cleanBar = {
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume
  };

  const last = candles[candles.length - 1];

  if (last && last.time === cleanBar.time) {
    candles[candles.length - 1] = cleanBar;
  } else {
    candles.push(cleanBar);
  }

  if (candles.length > 300) candles.shift();

  // 🚨 Only after candle close
  if (!bar.isFinal) return;

  // 🚨 Ensure enough candles
  if (candles.length < 50) return;

  const result = macdStrategy(candles);
  if (!result || !result.signal) return;

  const { signal } = result;

  if (signal.type === lastSignalType) return;
  lastSignalType = signal.type;

  console.log(
    `📊 ${signal.type} | ${symbol} | Price: ${signal.price} | Time: ${new Date(
      signal.time * 1000
    ).toLocaleTimeString()}`
  );
});
