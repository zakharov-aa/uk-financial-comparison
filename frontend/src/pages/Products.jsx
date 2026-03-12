import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import RateChart from '../components/RateChart';
import API_BASE from '../config';

const CURRENCIES = ['GBP', 'USD', 'EUR', 'JPY'];

export default function Products() {
  const { category } = useParams();
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Currency converter state
  const [fromCurrency, setFromCurrency] = useState('GBP');
  const [toCurrency, setToCurrency] = useState('USD');
  const [convertAmount, setConvertAmount] = useState('');

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

  function convertCurrency(amount, from, to) {
    const rates = { GBP: 1, ...data.rates };
    return (amount / rates[from]) * rates[to];
  }

  const numAmount = parseFloat(convertAmount);
  const converted = (convertAmount !== '' && numAmount !== 0 && !isNaN(numAmount))
    ? convertCurrency(numAmount, fromCurrency, toCurrency)
    : null;

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
        <>
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

          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Currency Converter</h3>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={fromCurrency} onChange={e => setFromCurrency(e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="number"
                min="0"
                placeholder="Amount"
                value={convertAmount}
                onChange={e => setConvertAmount(e.target.value)}
                style={{ width: '140px' }}
              />
              <span>→</span>
              <select value={toCurrency} onChange={e => setToCurrency(e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {converted !== null && (
              <p style={{ marginTop: '0.75rem', fontSize: '1.1rem' }}>
                {numAmount.toLocaleString('en-GB')} {fromCurrency} = <strong>{converted.toFixed(4)} {toCurrency}</strong>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
