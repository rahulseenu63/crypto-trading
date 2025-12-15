function calculateEMA(values, period) {
  const k = 2 / (period + 1);
  let emaArray = [];
  let emaPrev = values[0];

  values.forEach((value, i) => {
    if (i === 0) {
      emaArray.push(value);
    } else {
      const ema = value * k + emaPrev * (1 - k);
      emaArray.push(ema);
      emaPrev = ema;
    }
  });

  return emaArray;
}
const { backtestMACD } = require("./backtest");
function macdStrategy(candles, fast = 12, slow = 26, signalLen = 9) {
  const closes = candles.map(c => c.close);

  const emaFast = calculateEMA(closes, fast);
  const emaSlow = calculateEMA(closes, slow);

  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = calculateEMA(macdLine, signalLen);

  const delta = macdLine.map((v, i) => v - signalLine[i]);

  let signals = [];

  for (let i = 1; i < delta.length; i++) {
    if (delta[i - 1] < 0 && delta[i] > 0) {
      signals.push({
        type: "BUY",
        time: candles[i].time,
        price: candles[i].close,
      });
    }

    if (delta[i - 1] > 0 && delta[i] < 0) {
      signals.push({
        type: "SELL",
        time: candles[i].time,
        price: candles[i].close,
      });
    }
  }

  return { macdLine, signalLine, delta, signals };
}

module.exports = { macdStrategy };
