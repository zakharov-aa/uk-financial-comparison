import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import RateChart from '../components/RateChart';
import API_BASE from '../config';

export default function Products() {
  const { category } = useParams();
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/products/${category}`)
      .then(r => r.json())
      .then(res => { setData(res.data); setMeta(res.meta); })
      .catch(() => setError('Failed to load data. Please try again.'))
      .finally(() => setLoading(false));
  }, [category]);

  if (loading) return <div className="loading">Loading {category} data...</div>;
  if (error) return <div className="error">{error}</div>;

  const title = category === 'mortgages' ? 'UK Mortgage Rates' : 'GBP Exchange Rates';

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>
        {title}
        {meta?.stale && <span className="stale-badge">Cached</span>}
      </h2>

      {category === 'mortgages' && data?.current && (
        <>
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Current Rates (Bank of England)</h3>
            <table>
              <thead>
                <tr><th>Product</th><th>Rate</th></tr>
              </thead>
              <tbody>
                <tr><td>2-Year Fixed</td><td>{data.current.twoYear}%</td></tr>
                <tr><td>3-Year Fixed</td><td>{data.current.threeYear}%</td></tr>
                <tr><td>5-Year Fixed</td><td>{data.current.fiveYear}%</td></tr>
              </tbody>
            </table>
          </div>
          <RateChart history={data.history} />
        </>
      )}

      {category === 'exchange-rates' && data?.rates && (
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>GBP Exchange Rates</h3>
          <table>
            <thead>
              <tr><th>Currency Pair</th><th>Rate</th></tr>
            </thead>
            <tbody>
              {Object.entries(data.rates).map(([currency, rate]) => (
                <tr key={currency}>
                  <td>GBP / {currency}</td>
                  <td>{rate?.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
