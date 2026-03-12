import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import API_BASE from '../config';

export default function Recommendations() {
  const [searchParams] = useSearchParams();
  const [category, setCategory] = useState(searchParams.get('category') || 'mortgages');
  const [amount, setAmount] = useState('');
  const [situation, setSituation] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasError, setHasError] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [annualIncome, setAnnualIncome] = useState('');
  const [bankAmount, setBankAmount] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ category, amount, situation, useAI: String(useAI) });
      if (annualIncome !== '') params.set('annualIncome', annualIncome);
      if (bankAmount !== '') params.set('bankAmount', bankAmount);
      const res = await fetch(`${API_BASE}/recommendations?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get recommendation');
      setResult(data);
    } catch (err) {
      setError(err.message || 'Failed to get recommendation. Please try again.');
      setHasError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>AI-Powered Recommendations</h2>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <label>Product Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="mortgages">Mortgages</option>
            <option value="exchange-rates">Exchange Rates</option>
            <option value="savings">Savings</option>
          </select>
          <label>Amount (£)</label>
          <input
            type="number"
            placeholder="e.g. 200000 for a mortgage, 50000 for savings"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            required
          />
          <label>Your Financial Situation</label>
          <textarea
            rows={4}
            placeholder="Describe your situation: income, existing debts, credit score, savings, employment type, how long you plan to stay in the property, etc."
            value={situation}
            onChange={e => setSituation(e.target.value)}
            required
          />
          <button className="btn" type="submit" disabled={loading || !amount || !situation}>
            {loading ? 'Getting recommendation...' : 'Get AI Recommendation'}
          </button>
        </form>
      </div>

      {error && <div className="error">{error}</div>}

      {hasError && (
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Provide More Detail</h3>
          <label>Annual Income After Taxes (£)</label>
          <input
            type="number"
            min="0"
            placeholder="e.g. 75000"
            value={annualIncome}
            onChange={e => setAnnualIncome(e.target.value)}
          />
          <label>Current Amount in the Bank (£)</label>
          <input
            type="number"
            min="0"
            placeholder="e.g. 50000"
            value={bankAmount}
            onChange={e => setBankAmount(e.target.value)}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            <input
              type="checkbox"
              checked={useAI}
              onChange={e => setUseAI(e.target.checked)}
            />
            Use AI Recommendation
          </label>
        </div>
      )}

      {result && (
        <>
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>AI Recommendation</h3>
            <div className="ai-insight">{result.recommendation}</div>
            <p style={{ color: '#999', fontSize: '0.8rem', marginTop: '1rem' }}>
              Generated at: {new Date(result.generatedAt).toLocaleString()} · Based on live Bank of England data
            </p>
          </div>
          {result.currentRates && (
            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>Current Rates Used</h3>
              <table>
                <tbody>
                  {Object.entries(result.currentRates).map(([k, v]) => (
                    <tr key={k}><td>{k}</td><td>{typeof v === 'number' ? `${v}%` : v}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
