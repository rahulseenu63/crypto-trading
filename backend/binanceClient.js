// Simple Binance Spot market data client using REST + WebSocket
// No API key needed for public market data.

const axios = require('axios');
const WebSocket = require('ws');
const EventEmitter = require('events');

const BINANCE_REST_BASE = 'https://api.binance.com';
const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/ws';

class BinanceClient extends EventEmitter {
  constructor() {
    super();
    this.wsMap = new Map(); // key: `${symbol}_${interval}` -> ws
  }

  /**
   * Get historical candles for symbol/interval
   * interval example: 1m, 5m, 15m, 1h, 4h, 1d
   */
  async getKlines({ symbol, interval, limit = 500 }) {
    const resp = await axios.get(`${BINANCE_REST_BASE}/api/v3/klines`, {
      params: { symbol, interval, limit }
    });

    // Binance kline format:
    // [ openTime, open, high, low, close, volume, closeTime, ... ]
    return resp.data.map(c => ({
      time: Math.floor(c[0] / 1000), // seconds for Lightweight Charts
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5])
    }));
  }

  /**
   * Subscribe to live klines via Binance WebSocket.
   * Emits 'kline' events with { symbol, interval, bar }.
   */
  subscribeKlines(symbol, interval) {
    const key = `${symbol.toLowerCase()}_${interval}`;
    if (this.wsMap.has(key)) {
      return;
    }

    const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
    const wsUrl = `${BINANCE_WS_BASE}/${streamName}`;
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log(`Binance WS connected: ${streamName}`);
    });

    ws.on('message', msg => {
      try {
        const data = JSON.parse(msg);
        if (data.e === 'kline' && data.k) {
          const k = data.k;
          const bar = {
            time: Math.floor(k.t / 1000),
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            isFinal: !!k.x
          };

          this.emit('kline', {
            symbol: symbol.toUpperCase(),
            interval,
            bar
          });
        }
      } catch (err) {
        console.error('Binance WS parse error', err);
      }
    });

    ws.on('error', err => {
      console.error('Binance WS error', err);
    });

    ws.on('close', () => {
      console.log(`Binance WS closed: ${streamName}`);
      this.wsMap.delete(key);
    });

    this.wsMap.set(key, ws);
  }

  unsubscribeKlines(symbol, interval) {
    const key = `${symbol.toLowerCase()}_${interval}`;
    const ws = this.wsMap.get(key);
    if (ws) {
      ws.close();
      this.wsMap.delete(key);
    }
  }
}

module.exports = new BinanceClient();
