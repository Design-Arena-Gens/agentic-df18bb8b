// Synthetic price generation, indicators, 3 strategies, backtester, optimizer

export function generatePriceSeries(length = 2000, dtYears = 1 / 252) {
  const muRegimes = [0.12, -0.05, 0.0, 0.2];
  const sigmaRegimes = [0.08, 0.12, 0.05, 0.15];
  let regime = 0;
  let switchCountdown = 250 + Math.floor(Math.random() * 250);
  let price = 1.0;
  const series = [];
  for (let i = 0; i < length; i++) {
    if (--switchCountdown <= 0) {
      regime = (regime + 1 + (Math.random() < 0.5 ? 1 : 0)) % muRegimes.length;
      switchCountdown = 200 + Math.floor(Math.random() * 400);
    }
    const mu = muRegimes[regime];
    const sigma = sigmaRegimes[regime];
    const z = gaussian();
    const ret = (mu - 0.5 * sigma * sigma) * dtYears + sigma * Math.sqrt(dtYears) * z;
    const next = price * Math.exp(ret);
    const high = Math.max(price, next) * (1 + 0.0005 * Math.abs(z));
    const low = Math.min(price, next) * (1 - 0.0005 * Math.abs(z));
    series.push({ t: i, o: price, h: high, l: low, c: next });
    price = next;
  }
  return series;
}

function gaussian() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function sma(values, period) {
  const out = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(values, period) {
  const out = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 0; i < values.length; i++) {
    e = i === 0 ? values[i] : values[i] * k + e * (1 - k);
    out[i] = i >= period - 1 ? e : NaN;
  }
  return out;
}

function rsi(values, period) {
  const out = new Array(values.length).fill(NaN);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(0, change);
    const loss = Math.max(0, -change);
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        out[i] = 100 - 100 / (1 + rs);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}

function atr(series, period) {
  const tr = new Array(series.length).fill(NaN);
  for (let i = 1; i < series.length; i++) {
    const h = series[i].h;
    const l = series[i].l;
    const pc = series[i - 1].c;
    const trVal = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    tr[i] = trVal;
  }
  return ema(tr.map((x) => (isNaN(x) ? 0 : x)), period);
}

function computeMetrics(equity) {
  const start = equity[0]?.v ?? 1;
  const end = equity[equity.length - 1]?.v ?? 1;
  const totalReturn = (end - start) / start;

  let peak = -Infinity;
  let maxDD = 0;
  for (const p of equity) {
    peak = Math.max(peak, p.v);
    const dd = peak > 0 ? (peak - p.v) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }

  const rets = [];
  for (let i = 1; i < equity.length; i++) {
    const r = (equity[i].v - equity[i - 1].v) / equity[i - 1].v;
    rets.push(r);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length);
  const variance = rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, rets.length);
  const stdev = Math.sqrt(variance);
  const stepsPerYear = 24 * 252; // 1h bars assumption
  const sharpe = stdev === 0 ? 0 : (mean * stepsPerYear) / (stdev * Math.sqrt(stepsPerYear));

  return {
    totalReturn,
    maxDrawdown: maxDD,
    cagr: stepsPerYear === 0 ? 0 : Math.pow(1 + mean, stepsPerYear) - 1,
    sharpe,
  };
}

function backtest(series, logic) {
  let equity = 1.0;
  let position = 0; // -1 short, 0 flat, 1 long
  let entryPrice = 0;
  let stop = NaN;
  let take = NaN;
  const equityCurve = [{ t: 0, v: equity }];
  const trades = [];
  let wins = 0, losses = 0;
  let grossProfit = 0, grossLoss = 0;
  const fee = 0.0001; // ~1 pip cost approximation

  for (let i = 1; i < series.length; i++) {
    const bar = series[i];
    const prev = series[i - 1];

    // mark-to-market
    if (position !== 0) {
      const ret = position * ((bar.c - prev.c) / prev.c);
      equity *= 1 + ret;
    }

    const ctx = { i, bar, series, position, equity };
    const sig = logic.signal(ctx);

    const exitNow = () => {
      if (position !== 0) {
        const pl = (position * (bar.c - entryPrice)) / entryPrice - fee;
        if (pl >= 0) {
          wins++;
          grossProfit += pl;
        } else {
          losses++;
          grossLoss += -pl;
        }
        trades.push({ exitIndex: i, pl, entryPrice, exitPrice: bar.c, side: position });
      }
      position = 0;
      entryPrice = 0;
      stop = NaN;
      take = NaN;
    };

    const enter = (side) => {
      if (position !== 0) exitNow();
      position = side;
      entryPrice = bar.c;
      const st = logic.stops?.({ i, bar, series, position, entryPrice, equity });
      stop = st?.stop ?? NaN;
      take = st?.take ?? NaN;
    };

    // Stops/TP
    if (position !== 0) {
      if (!Number.isNaN(stop)) {
        if (position === 1 && bar.l <= stop) {
          // long stop
          const ret = (stop - bar.c) / entryPrice; // approximate
          equity *= 1 + ret - fee;
          exitNow();
          equityCurve.push({ t: i, v: equity });
          continue;
        } else if (position === -1 && bar.h >= stop) {
          const ret = (bar.c - stop) / entryPrice;
          equity *= 1 + ret - fee;
          exitNow();
          equityCurve.push({ t: i, v: equity });
          continue;
        }
      }
      if (!Number.isNaN(take)) {
        if (position === 1 && bar.h >= take) {
          const ret = (take - bar.c) / entryPrice;
          equity *= 1 + ret - fee;
          exitNow();
          equityCurve.push({ t: i, v: equity });
          continue;
        } else if (position === -1 && bar.l <= take) {
          const ret = (bar.c - take) / entryPrice;
          equity *= 1 + ret - fee;
          exitNow();
          equityCurve.push({ t: i, v: equity });
          continue;
        }
      }
    }

    // Signals
    if (sig === 'EXIT') {
      exitNow();
    } else if (sig === 'LONG') {
      enter(1);
    } else if (sig === 'SHORT') {
      enter(-1);
    }

    equityCurve.push({ t: i, v: equity });
  }

  const metricsCore = computeMetrics(equityCurve);
  const numTrades = trades.length;
  const winRate = numTrades === 0 ? 0 : wins / numTrades;
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;

  return {
    equity: equityCurve,
    trades,
    metrics: {
      ...metricsCore,
      numTrades,
      winRate,
      profitFactor,
    },
  };
}

function smaCrossStrategy(series, { fast = 10, slow = 40, stopPct = 0.01, takePct = 0.02 } = {}) {
  const closes = series.map((b) => b.c);
  const f = sma(closes, fast);
  const s = sma(closes, slow);
  return {
    signal: ({ i, position }) => {
      if (i === 0 || Number.isNaN(f[i]) || Number.isNaN(s[i])) return 'HOLD';
      if (position <= 0 && f[i] > s[i] && f[i - 1] <= s[i - 1]) return 'LONG';
      if (position >= 0 && f[i] < s[i] && f[i - 1] >= s[i - 1]) return 'SHORT';
      return 'HOLD';
    },
    stops: ({ entryPrice, position }) => {
      if (position === 1)
        return { stop: entryPrice * (1 - stopPct), take: entryPrice * (1 + takePct) };
      if (position === -1)
        return { stop: entryPrice * (1 + stopPct), take: entryPrice * (1 - takePct) };
      return {};
    },
  };
}

function rsiReversionStrategy(series, { period = 14, overbought = 70, oversold = 30, exitToMid = 50 } = {}) {
  const closes = series.map((b) => b.c);
  const r = rsi(closes, period);
  return {
    signal: ({ i, position }) => {
      if (i === 0 || Number.isNaN(r[i])) return 'HOLD';
      if (position <= 0 && r[i] < oversold) return 'LONG';
      if (position >= 0 && r[i] > overbought) return 'SHORT';
      if (position !== 0 && Math.abs(r[i] - exitToMid) < 2) return 'EXIT';
      return 'HOLD';
    },
  };
}

function breakoutAtrStrategy(series, { lookback = 50, atrPeriod = 14, atrMult = 2.0 } = {}) {
  const closes = series.map((b) => b.c);
  const hi = rollingMax(series.map((b) => b.h), lookback);
  const lo = rollingMin(series.map((b) => b.l), lookback);
  const a = atr(series, atrPeriod);
  return {
    signal: ({ i, bar, position }) => {
      if (i === 0 || Number.isNaN(hi[i]) || Number.isNaN(lo[i])) return 'HOLD';
      if (position <= 0 && bar.c > hi[i - 1]) return 'LONG';
      if (position >= 0 && bar.c < lo[i - 1]) return 'SHORT';
      return 'HOLD';
    },
    stops: ({ entryPrice, position }) => {
      const risk = a[Math.min(a.length - 1, Math.max(0, Math.floor(atrPeriod)))] || 0;
      if (position === 1)
        return { stop: entryPrice - atrMult * risk, take: entryPrice + 3 * atrMult * risk };
      if (position === -1)
        return { stop: entryPrice + atrMult * risk, take: entryPrice - 3 * atrMult * risk };
      return {};
    },
  };
}

function rollingMax(values, period) {
  const out = new Array(values.length).fill(NaN);
  const dq = [];
  for (let i = 0; i < values.length; i++) {
    while (dq.length && dq[0] <= i - period) dq.shift();
    while (dq.length && values[dq[dq.length - 1]] <= values[i]) dq.pop();
    dq.push(i);
    if (i >= period - 1) out[i] = values[dq[0]];
  }
  return out;
}

function rollingMin(values, period) {
  const out = new Array(values.length).fill(NaN);
  const dq = [];
  for (let i = 0; i < values.length; i++) {
    while (dq.length && dq[0] <= i - period) dq.shift();
    while (dq.length && values[dq[dq.length - 1]] >= values[i]) dq.pop();
    dq.push(i);
    if (i >= period - 1) out[i] = values[dq[0]];
  }
  return out;
}

export async function optimizeOnSyntheticData({ prices, topK = 10 }) {
  const series = prices?.length ? prices : generatePriceSeries(2000, 1 / 24);
  const agents = [];

  const lambda = 2.0; // penalty for drawdown

  // SMA Cross grid
  for (const slow of [50, 100, 150]) {
    for (const fast of [5, 10, 20, 30]) {
      if (fast >= slow) continue;
      for (const stopPct of [0.005, 0.01, 0.015]) {
        for (const takePct of [0.01, 0.02, 0.03]) {
          const logic = smaCrossStrategy(series, { fast, slow, stopPct, takePct });
          const { equity, trades, metrics } = backtest(series, logic);
          const score = metrics.totalReturn - lambda * metrics.maxDrawdown + 0.1 * metrics.sharpe;
          agents.push({ name: `SMA(${fast}/${slow})`, params: { fast, slow, stopPct, takePct }, equity, trades, metrics: { ...metrics, score } });
        }
      }
    }
  }

  // RSI Reversion grid
  for (const period of [7, 14, 21]) {
    for (const overbought of [65, 70, 75]) {
      for (const oversold of [25, 30, 35]) {
        const logic = rsiReversionStrategy(series, { period, overbought, oversold, exitToMid: 50 });
        const { equity, trades, metrics } = backtest(series, logic);
        const score = metrics.totalReturn - lambda * metrics.maxDrawdown + 0.1 * metrics.sharpe;
        agents.push({ name: `RSI(${period}/${oversold}-${overbought})`, params: { period, overbought, oversold }, equity, trades, metrics: { ...metrics, score } });
      }
    }
  }

  // Breakout ATR grid
  for (const lookback of [40, 60, 100]) {
    for (const atrPeriod of [10, 14, 20]) {
      for (const atrMult of [1.5, 2.0, 2.5]) {
        const logic = breakoutAtrStrategy(series, { lookback, atrPeriod, atrMult });
        const { equity, trades, metrics } = backtest(series, logic);
        const score = metrics.totalReturn - lambda * metrics.maxDrawdown + 0.1 * metrics.sharpe;
        agents.push({ name: `BRK(${lookback})-ATR(${atrPeriod}x${atrMult})`, params: { lookback, atrPeriod, atrMult }, equity, trades, metrics: { ...metrics, score } });
      }
    }
  }

  agents.sort((a, b) => b.metrics.score - a.metrics.score);
  return { agents };
}
