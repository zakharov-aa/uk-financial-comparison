import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function RateChart({ history }) {
  if (!history || history.length === 0) return null;

  const data = history.map(h => ({
    date: h.date?.substring(0, 7), // YYYY-MM
    '2yr Fixed': h.twoYear,
    '5yr Fixed': h.fiveYear,
  }));

  return (
    <div className="card">
      <h3 style={{ marginBottom: '1rem' }}>Rate Trends (12 months)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis domain={['auto', 'auto']} tickFormatter={v => `${v}%`} />
          <Tooltip formatter={v => `${v}%`} />
          <Legend />
          <Line type="monotone" dataKey="2yr Fixed" stroke="#1a3a6b" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="5yr Fixed" stroke="#e74c3c" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
