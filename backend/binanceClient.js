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

const BINANCE_REST_BASE = 'https://api.binance.us';
const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/ws';

class BinanceClient extends EventEmitter {
  constructor() {
    super();
    this.wsMap = new Map(); // key: `${symbol}_${interval}` -> ws
  }

  /**
   * Get historical candles for symbol/interval
   */
  async getKlines({ symbol, interval, limit = 100 }) {
  try {
    // Map symbol for CoinGecko
    const coinMap = {
      BTCUSDT: "bitcoin",
      ETHUSDT: "ethereum"
    };

    const coinId = coinMap[symbol.toUpperCase()] || "bitcoin";

    const resp = await axios.get(
      "https://api.coingecko.com/api/v3/coins/" + coinId + "/market_chart",
      {
        params: {
          vs_currency: "usd",
          days: 1,
          interval: "minute"
        }
      }
    );

    // Convert CoinGecko format to candle format
    const prices = resp.data.prices.slice(-limit);

    return prices.map(p => ({
      time: Math.floor(p[0] / 1000),
      open: p[1],
      high: p[1],
      low: p[1],
      close: p[1],
      volume: 0
    }));
  } catch (err) {
    console.error("CoinGecko error:", err.message);
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
