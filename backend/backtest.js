/**
 * Simple MA crossover backtest over candle data
 * candles: [{ time, open, high, low, close, volume }]
 */

function sma(values, period) {
  const res = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) {
      sum -= values[i - period];
    }
    if (i >= period - 1) {
      res.push(sum / period);
    } else {
      res.push(null);
    }
  }
  return res;
}

function backtestMACrossover(candles, { fast = 10, slow = 20, initialCapital = 10000 }) {
  const closes = candles.map(c => c.close);
  const fastMA = sma(closes, fast);
  const slowMA = sma(closes, slow);

  let position = 0; // 0 = flat, 1 = long
  let entryPrice = 0;
  let capital = initialCapital;
  const trades = [];
  const equityCurve = [];

  for (let i = 0; i < candles.length; i++) {
    const price = closes[i];
    const time = candles[i].time;
    const fastVal = fastMA[i];
    const slowVal = slowMA[i];

    // record equity each bar
    let equity = capital;
    if (position === 1) {
      const qty = capital / entryPrice;
      equity = qty * price;
    }
    equityCurve.push({ time, value: equity });

    if (fastVal == null || slowVal == null) continue;

    const prevFast = fastMA[i - 1];
    const prevSlow = slowMA[i - 1];

    // golden cross: buy
    if (position === 0 && prevFast !== null && prevSlow !== null && prevFast <= prevSlow && fastVal > slowVal) {
      position = 1;
      entryPrice = price;
      trades.push({ type: 'BUY', time, price });
    }

    // death cross: sell
    if (position === 1 && prevFast !== null && prevSlow !== null && prevFast >= prevSlow && fastVal < slowVal) {
      const qty = capital / entryPrice;
      const exitValue = qty * price;
      const profit = exitValue - capital;

      trades.push({ type: 'SELL', time, price, profit });
      capital = exitValue;
      position = 0;
      entryPrice = 0;
    }
  }

  // close last position
  if (position === 1) {
    const last = candles[candles.length - 1];
    const price = last.close;
    const qty = capital / entryPrice;
    const exitValue = qty * price;
    const profit = exitValue - capital;
    trades.push({ type: 'SELL', time: last.time, price, profit });
    capital = exitValue;
  }

  return {
    trades,
    equityCurve,
    summary: {
      initialCapital,
      finalCapital: capital,
      totalReturnPct: ((capital - initialCapital) / initialCapital) * 100
    }
  };
}

// MACD helper
function ema(values, period) {
  const k = 2 / (period + 1);
  let emaArray = [];
  let prev;
  for (let i = 0; i < values.length; i++) {
    const price = values[i];
    prev = prev == null ? price : price * k + prev * (1 - k);
    emaArray.push(prev);
  }
  return emaArray;
}

function backtestMACD(candles, { fast = 12, slow = 26, signal = 9, initialCapital = 10000 }) {
  const closes = candles.map(c => c.close);
  const fastEMA = ema(closes, fast);
  const slowEMA = ema(closes, slow);

  const macd = fastEMA.map((v,i) => v - slowEMA[i]);
  const signalLine = ema(macd, signal);

  // signalLine is same length as macd
  let position = 0;
  let entryPrice = 0;
  let capital = initialCapital;
  const trades = [];
  const equityCurve = [];

  for (let i = 1; i < macd.length; i++) {
    const time = candles[i].time;
    const price = closes[i];

    let equity = capital;
    if (position === 1) {
      const qty = capital / entryPrice;
      equity = qty * price;
    }
    equityCurve.push({ time, value: equity });

    const prevMacd = macd[i - 1];
    const prevSignal = signalLine[i - 1];
    const curMacd = macd[i];
    const curSignal = signalLine[i];

    // BUY: MACD crosses above signal
    if (position === 0 && prevMacd <= prevSignal && curMacd > curSignal) {
      position = 1;
      entryPrice = price;
      trades.push({ type: 'BUY', time, price });
    }

    // SELL: MACD crosses below signal
    if (position === 1 && prevMacd >= prevSignal && curMacd < curSignal) {
      const qty = capital / entryPrice;
      const exitValue = qty * price;
      const profit = exitValue - capital;

      trades.push({ type: 'SELL', time, price, profit });
      capital = exitValue;
      position = 0;
    }
  }

  // Close last position
  if (position === 1) {
    const last = candles[candles.length - 1];
    const price = last.close;
    const qty = capital / entryPrice;
    const exitValue = qty * price;
    const profit = exitValue - capital;

    trades.push({ type: 'SELL', time: last.time, price, profit });
    capital = exitValue;
  }

  return {
    trades,
    equityCurve,
    summary: {
      initialCapital,
      finalCapital: capital,
      totalReturnPct: ((capital - initialCapital)/initialCapital)*100
    }
  };
}


// Export BOTH strategies properly
module.exports = {
  backtestMACrossover,
  backtestMACD
};
