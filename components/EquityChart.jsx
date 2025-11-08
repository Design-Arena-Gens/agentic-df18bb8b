"use client";
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function EquityChart({ equity = [], title = 'Equity' }) {
  const labels = equity.map((e) => e.t);
  const data = {
    labels,
    datasets: [
      {
        label: 'Equity',
        data: equity.map((e) => e.v),
        borderColor: '#1f77b4',
        backgroundColor: 'rgba(31,119,180,0.2)',
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      x: { display: false },
      y: { ticks: { callback: (v) => v.toFixed(2) } },
    },
  };

  return (
    <div style={{ height: 300 }}>
      <Line data={data} options={options} />
    </div>
  );
}
