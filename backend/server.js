const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { macdStrategy } = require('./macd');
const binanceClient = require('./binanceClient');

const app = express();

app.use(cors({
  origin:"*",
  methods:["GET", "POST"]
}));
app.use(express.json());

// ---------------- REST API ---------------------

// Get historical klines
app.get('/api/klines', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
    const interval = req.query.interval || '1m';
    const limit = +req.query.limit || 100;

    const candles = await binanceClient.getKlines({ symbol, interval, limit });

    res.json({ symbol, interval, candles });
  } catch (err) {
    console.error("BINANCE ERROR:", err?.message || err);
    res.status(500).json({
      error: "Failed to fetch klines",
      details: err?.message || "Unknown error"
    });
  }
});


// MACD backtest
app.post('/api/backtest-macd', async (req, res) => {
  try {
    const { symbol, interval, limit, fast, slow, signal } = req.body;

    const candles = await binanceClient.getKlines({
      symbol: symbol.toUpperCase(),
      interval,
      limit
    });

    if (!candles || candles.length === 0) {
      return res.status(204).json({ message: 'No candle data for backtest' });
    }

    let result = null;
    try {
      result = macdStrategy(candles, fast || 12, slow || 26, signal || 9);
    } catch (err) {
      console.error('MACD calculation error', err);
      result = null;
    }

    res.json({
      symbol,
      interval,
      macd: result,
      equityCurve: [],
      trades: [],
      summary: { initialCapital: 10000, finalCapital: 10000, totalReturnPct: 0 }
    });
  } catch (err) {
    console.error('Error /api/backtest-macd', err);
    res.status(500).json({ error: 'MACD backtest failed' });
  }
});

// ---------------- SOCKET.IO ---------------------

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const candlesMap = {};
const lastSignalMap = {};

io.on('connection', socket => {
  console.log('Client connected:', socket.id);
  socket.data.subscriptions = [];

  socket.on('subscribeKlines', ({ symbol, interval }) => {
    symbol = symbol.toUpperCase();
    interval = interval || '1m';

    // Clear previous subscriptions
    socket.data.subscriptions.forEach(sub => {
      binanceClient.removeListener('kline', sub.listener);
      binanceClient.unsubscribeKlines(sub.symbol, sub.interval);
    });
    socket.data.subscriptions = [];

    binanceClient.subscribeKlines(symbol, interval);

    if (!candlesMap[`${symbol}_${interval}`]) {
      candlesMap[`${symbol}_${interval}`] = [];
      lastSignalMap[`${symbol}_${interval}`] = null;
    }

    const listener = payload => {
      if (payload.symbol !== symbol || payload.interval !== interval) return;

      const candles = candlesMap[`${symbol}_${interval}`];
      const bar = {
        time: payload.bar.time,
        open: payload.bar.open,
        high: payload.bar.high,
        low: payload.bar.low,
        close: payload.bar.close,
        volume: payload.bar.volume,
        isFinal: payload.bar.isFinal
      };

      const last = candles[candles.length - 1];
      if (last && last.time === bar.time) {
        candles[candles.length - 1] = bar;
      } else {
        candles.push(bar);
      }

      if (candles.length > 300) candles.shift();

      socket.emit('kline', bar);

      if (bar.isFinal && candles.length > 50) {
        let result = null;
        try {
          result = macdStrategy(candles);
        } catch (err) {
          console.error('MACD calculation error (socket)', err);
          return;
        }

        if (result) {
          const lastIndex = result.macdLine.length - 1;
          const macdUpdate = {
            time: candles[lastIndex].time,
            macd: result.macdLine[lastIndex],
            signal: result.signalLine[lastIndex],
            delta: result.delta[lastIndex],
            signalType: result.signal?.type || null
          };

          socket.emit('macdUpdate', macdUpdate);

          const lastSignal = lastSignalMap[`${symbol}_${interval}`];
          if (macdUpdate.signalType && macdUpdate.signalType !== lastSignal) {
            lastSignalMap[`${symbol}_${interval}`] = macdUpdate.signalType;
            socket.emit('macdSignal', {
              type: macdUpdate.signalType,
              price: candles[lastIndex].close,
              time: candles[lastIndex].time
            });
          }
        }
      }
    };

    binanceClient.on('kline', listener);
    socket.data.subscriptions.push({ symbol, interval, listener });
  });

  socket.on('unsubscribeKlines', () => {
    socket.data.subscriptions.forEach(sub => {
      binanceClient.removeListener('kline', sub.listener);
      binanceClient.unsubscribeKlines(sub.symbol, sub.interval);
    });
    socket.data.subscriptions = [];
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    socket.data.subscriptions.forEach(sub => {
      binanceClient.removeListener('kline', sub.listener);
      binanceClient.unsubscribeKlines(sub.symbol, sub.interval);
    });
  });
});

// ✅ SPA fallback route (Node 22 safe)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
