import { useState } from 'react';
import API_BASE from '../config';

export default function Compare() {
  const [category, setCategory] = useState('mortgages');
  const [amount, setAmount] = useState('');
  const [ltv, setLtv] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, criteria: { amount: parseInt(amount), ltv: parseInt(ltv) } }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setError('Failed to compare. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Compare Products</h2>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <label>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="mortgages">Mortgages</option>
            <option value="exchange-rates">Exchange Rates</option>
          </select>
          <label>Loan Amount (£)</label>
          <input type="number" placeholder="e.g. 200000" value={amount} onChange={e => setAmount(e.target.value)} />
          {category === 'mortgages' && (
            <>
              <label>LTV % (Loan to Value)</label>
              <input type="number" placeholder="e.g. 75" value={ltv} onChange={e => setLtv(e.target.value)} />
            </>
          )}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Comparing...' : 'Compare'}
          </button>
        </form>
      </div>

      {error && <div className="error">{error}</div>}

      {result?.comparison && (
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Comparison Results</h3>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Rate</th>
                {result.comparison[0]?.monthlyPayment && <th>Monthly Payment</th>}
              </tr>
            </thead>
            <tbody>
              {result.comparison.map((item, i) => (
                <tr key={i}>
                  <td>{item.label}</td>
                  <td>{item.rate}%</td>
                  {item.monthlyPayment && <td>£{item.monthlyPayment.toLocaleString()}/mo</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result?.aiSummary && (
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>AI Analysis</h3>
          <div className="ai-insight">{result.aiSummary}</div>
        </div>
      )}
    </div>
  );
}
