// Simple Binance Spot market data client using REST + WebSocket
// No API key needed for public market data.

const axios = require('axios');
const https = require('https');        // ✅ REQUIRED
const WebSocket = require('ws');
const EventEmitter = require('events');

// ✅ Force IPv4 (VERY IMPORTANT FOR RENDER)
const httpsAgent = new https.Agent({
  family: 4
});

const BINANCE_REST_BASE = 'https://api.binance.com';
const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/ws';

class BinanceClient extends EventEmitter {
  constructor() {
    super();
    this.wsMap = new Map(); // key: `${symbol}_${interval}` -> ws
  }

  /**
   * Get historical candles for symbol/interval
   */
  async getKlines({ symbol, interval, limit = 500 }) {
    try {
      const resp = await axios.get(
        `${BINANCE_REST_BASE}/api/v3/klines`,
        {
          params: { symbol, interval, limit },
          timeout: 10000,
          httpsAgent, // ✅ THIS FIXES RENDER
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json"
          }
        }
      );

      return resp.data.map(c => ({
        time: Math.floor(c[0] / 1000),
        open: +c[1],
        high: +c[2],
        low: +c[3],
        close: +c[4],
        volume: +c[5]
      }));
    } catch (err) {
      console.error(
        "Binance REST error:",
        err.code,
        err.response?.status,
        err.message
      );
      throw err;
    }
  }

  /**
   * Subscribe to live klines via Binance WebSocket.
   */
  subscribeKlines(symbol, interval) {
    const key = `${symbol.toLowerCase()}_${interval}`;
    if (this.wsMap.has(key)) return;

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
            open: +k.o,
            high: +k.h,
            low: +k.l,
            close: +k.c,
            volume: +k.v,
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
