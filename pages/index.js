import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { optimizeOnSyntheticData, generatePriceSeries } from '@/utils/backtest';

const EquityChart = dynamic(() => import('@/components/EquityChart'), { ssr: false });

export default function Home() {
  const [prices, setPrices] = useState([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [length, setLength] = useState(2000);
  const [topK, setTopK] = useState(10);

  useEffect(() => {
    setPrices(generatePriceSeries(length, 1 / 24));
  }, [length]);

  const best = useMemo(() => (results?.agents?.[0] ?? null), [results]);

  return (
    <>
      <Head>
        <title>Forex Trading Agents Optimizer</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="container">
        <h1>Forex Trading Agents: Max Profit, Low Drawdown</h1>

        <section className="panel">
          <div className="controls">
            <label>
              Series length: {length}
              <input
                type="range"
                min={500}
                max={5000}
                step={100}
                value={length}
                onChange={(e) => setLength(Number(e.target.value))}
              />
            </label>

            <label>
              Top agents: {topK}
              <input
                type="range"
                min={3}
                max={20}
                step={1}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
              />
            </label>

            <button
              disabled={running}
              onClick={async () => {
                try {
                  setRunning(true);
                  const res = await optimizeOnSyntheticData({ prices, topK });
                  setResults(res);
                } finally {
                  setRunning(false);
                }
              }}
            >
              {running ? 'Optimizing?' : 'Run Optimizer'}
            </button>
          </div>
        </section>

        {best && (
          <section className="panel">
            <h2>Best Agent</h2>
            <div className="metrics">
              <Metric label="Strategy" value={`${best.name}`} />
              <Metric label="Score" value={best.metrics.score.toFixed(2)} />
              <Metric label="Total Return" value={(best.metrics.totalReturn * 100).toFixed(2) + '%'} />
              <Metric label="CAGR" value={(best.metrics.cagr * 100).toFixed(2) + '%'} />
              <Metric label="Max Drawdown" value={(best.metrics.maxDrawdown * 100).toFixed(2) + '%'} />
              <Metric label="Sharpe" value={best.metrics.sharpe.toFixed(2)} />
              <Metric label="Trades" value={best.metrics.numTrades} />
              <Metric label="Win Rate" value={(best.metrics.winRate * 100).toFixed(1) + '%'} />
              <Metric label="Profit Factor" value={best.metrics.profitFactor.toFixed(2)} />
            </div>
            <EquityChart equity={best.equity} title="Equity Curve" />
          </section>
        )}

        {results?.agents?.length > 0 && (
          <section className="panel">
            <h2>Top Agents</h2>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Agent</th>
                    <th>Score</th>
                    <th>Return</th>
                    <th>Max DD</th>
                    <th>Sharpe</th>
                    <th>Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {results.agents.slice(0, topK).map((a, i) => (
                    <tr key={i} className={i === 0 ? 'best' : ''}>
                      <td>{i + 1}</td>
                      <td>{a.name}</td>
                      <td>{a.metrics.score.toFixed(2)}</td>
                      <td>{(a.metrics.totalReturn * 100).toFixed(1)}%</td>
                      <td>{(a.metrics.maxDrawdown * 100).toFixed(1)}%</td>
                      <td>{a.metrics.sharpe.toFixed(2)}</td>
                      <td>{a.metrics.numTrades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <footer>
          <p>All data synthetic for fast, local evaluation. Not financial advice.</p>
        </footer>
      </main>
    </>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <div className="metricLabel">{label}</div>
      <div className="metricValue">{value}</div>
    </div>
  );
}
