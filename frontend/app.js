/***********************
 * INDICATORS
 ***********************/

function calculateSMA(candles, period) {
  const result = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push({ time: candles[i].time, value: null });
      continue;
    }

    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j].close;
    }

    result.push({
      time: candles[i].time,
      value: sum / period,
    });
  }
  return result;
}

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

/***********************
 * SOCKET
 ***********************/
//const socket = io("http://localhost:4000");
const API_URL = "https://crypto-trading-fyvr.onrender.com";
const socket = io(API_URL);

/***********************
 * UI ELEMENTS
 ***********************/
const symbolSelect = document.getElementById("symbol");
const intervalSelect = document.getElementById("interval");
const loadBtn = document.getElementById("load-btn");
const backtestBtn = document.getElementById("backtest-btn");
const macdBacktestBtn = document.getElementById("macd-backtest-btn");
const summaryDiv = document.getElementById("summary");
const tradesDiv = document.getElementById("trades");

/***********************
 * MAIN PRICE CHART
 ***********************/
const chartContainer = document.getElementById("chart");

const chart = LightweightCharts.createChart(chartContainer, {
  layout: {
    background: { color: '#0f172a' },
    textColor: '#d1d4dc',
  },
  grid: {
    vertLines: { color: '#1e293b' },
    horzLines: { color: '#1e293b' },
  },

  timeScale: {
    timeVisible: true,     // ✅ show time
    secondsVisible: false // true if using seconds timeframe
  },

  crosshair: {
    mode: LightweightCharts.CrosshairMode.Normal
  }
});


let candleSeries = chart.addCandlestickSeries();
let backtestLineSeries = null;

let sma10Series = chart.addLineSeries({ color: "yellow", lineWidth: 2 });
let sma20Series = chart.addLineSeries({ color: "cyan", lineWidth: 2 });

let currentSymbol = symbolSelect.value;
let currentInterval = intervalSelect.value;

/***********************
 * MACD CHART (SEPARATE)
 ***********************/
const macdContainer = document.getElementById("macd-chart");

const macdChart = LightweightCharts.createChart(macdContainer, {
  height: 200,
  layout: { background: { color: "#101014" }, textColor: "#d1d4dc" },
  grid: { vertLines: { color: "#1f2933" }, horzLines: { color: "#1f2933" } },
  timeScale: { borderColor: "#485c7b" },
  rightPriceScale: { borderColor: "#485c7b" },
});

const macdLineSeries = macdChart.addLineSeries({
  color: "orange",
  lineWidth: 2,
  title: "MACD",
});

const signalLineSeries = macdChart.addLineSeries({
  color: "cyan",
  lineWidth: 2,
  title: "Signal",
});

/***********************
 * RESIZE
 ***********************/
window.addEventListener("resize", () => {
  chart.applyOptions({ width: chartContainer.clientWidth });
  macdChart.applyOptions({ width: macdContainer.clientWidth });
});

/***********************
 * LOAD DATA
 ***********************/
async function loadData() {
  currentSymbol = symbolSelect.value;
  currentInterval = intervalSelect.value;

  socket.emit("unsubscribeKlines");

  //const url = `http://localhost:4000/api/klines?symbol=${currentSymbol}&interval=${currentInterval}&limit=500`;
  //const resp = await fetch(url);
  //const data = await resp.json();
  const url = `${API_URL}/api/klines?symbol=${currentSymbol}&interval=${currentInterval}&limit=500`;
  const resp = await fetch(url);
  const data = await resp.json();

  candleSeries.setData(data.candles);

  const sma10 = calculateSMA(data.candles, 10);
  const sma20 = calculateSMA(data.candles, 20);

  sma10Series.setData(sma10.filter(x => x.value !== null));
  sma20Series.setData(sma20.filter(x => x.value !== null));

  candleSeries.setMarkers([]);

  setTimeout(() => {
    socket.emit("subscribeKlines", {
      symbol: currentSymbol,
      interval: currentInterval,
    });
  }, 200);
}

/***********************
 * LIVE KLINES
 ***********************/
socket.on("kline", bar => {
  candleSeries.update(bar);
});

/***********************
 * SMA BACKTEST
 ***********************/
async function runBacktest() {
  //const resp = await fetch("http://localhost:4000/api/backtest", {
    //method: "POST",
    //headers: { "Content-Type": "application/json" },
    const resp = await fetch(`${API_URL}/api/backtest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
      symbol: currentSymbol,
      interval: currentInterval,
      limit: 500,
      fast: 10,
      slow: 20,
      initialCapital: 10000,
    }),
  });

  renderBacktest(await resp.json());
}

/***********************
 * MACD BACKTEST
 ***********************/
async function runMacdBacktest() {
  //const resp = await fetch("http://localhost:4000/api/backtest-macd", {
    //method: "POST",
    //headers: { "Content-Type": "application/json" },
    const resp = await fetch(`${API_URL}/api/backtest-macd`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
      symbol: currentSymbol,
      interval: currentInterval,
      limit: 500,
      fast: 12,
      slow: 26,
      signal: 9,
    }),
  });

  const data = await resp.json();
  const { macdLine, signalLine, signals } = data.macd;

  macdLineSeries.setData(
    macdLine.map((v, i) => ({
      time: data.candles[i].time,
      value: v,
    }))
  );

  signalLineSeries.setData(
    signalLine.map((v, i) => ({
      time: data.candles[i].time,
      value: v,
    }))
  );

  candleSeries.setMarkers(
    signals.map(s => ({
      time: s.time,
      position: s.type === "BUY" ? "belowBar" : "aboveBar",
      color: s.type === "BUY" ? "#4caf50" : "#f44336",
      shape: s.type === "BUY" ? "arrowUp" : "arrowDown",
      text: s.type,
    }))
  );

  summaryDiv.textContent = "MACD backtest completed.";
}

/***********************
 * RENDER SMA BACKTEST
 ***********************/
function renderBacktest(result) {
  if (!result?.equityCurve) return;

  if (backtestLineSeries) chart.removeSeries(backtestLineSeries);

  backtestLineSeries = chart.addLineSeries({ priceScaleId: "right" });
  backtestLineSeries.setData(
    result.equityCurve.map(p => ({ time: p.time, value: p.value }))
  );
}

/***********************
 * BUTTONS
 ***********************/
loadBtn.addEventListener("click", loadData);
backtestBtn.addEventListener("click", runBacktest);
macdBacktestBtn.addEventListener("click", runMacdBacktest);

/***********************
 * FIRST LOAD
 ***********************/
loadData();
