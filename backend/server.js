const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { backtestMACrossover, backtestMACD } = require('./backtest');

const binanceClient = require('./binanceClient');
const { macdStrategy } = require('./macd');

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------- REST API ---------------------

// Get historical klines
app.get('/api/klines', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
    const interval = req.query.interval || '1m';
    const limit = +req.query.limit || 500;

    const candles = await binanceClient.getKlines({ symbol, interval, limit });
    res.json({ symbol, interval, candles });
  } catch (err) {
    console.error('Error /api/klines', err);
    res.status(500).json({ error: 'Failed to fetch klines' });
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

    const result = macdStrategy(candles, fast || 12, slow || 26, signal || 9);

    // Return something that frontend can render
    res.json({
      symbol,
      interval,
      candles,
      macd: result,
      equityCurve: [], // optional, for compatibility
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

// Keep track of candles per symbol/interval
const candlesMap = {};
const lastSignalMap = {};

io.on('connection', socket => {
  console.log('Client connected:', socket.id);
  socket.data.subscriptions = [];

  // Subscribe to klines
  socket.on('subscribeKlines', ({ symbol, interval }) => {
    symbol = symbol.toUpperCase();
    interval = interval || '1m';

    console.log(`Client ${socket.id} subscribing to ${symbol} ${interval}`);

    // Remove old listeners
    socket.data.subscriptions.forEach(sub => {
      binanceClient.removeListener('kline', sub.listener);
      binanceClient.unsubscribeKlines(sub.symbol, sub.interval);
    });
    socket.data.subscriptions = [];

    // Start live klines if not already
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

      // Send candle to frontend
      socket.emit('kline', bar);

      // Run MACD only on closed candle
      if (bar.isFinal && candles.length > 50) {
        const result = macdStrategy(candles);

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

          // Send BUY/SELL alert only once
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

  // Unsubscribe
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

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  //console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Server running on port ${PORT}`);
});
