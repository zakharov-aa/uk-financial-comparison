import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import API_BASE from '../config';

const CURRENCIES = ['GBP', 'USD', 'EUR', 'JPY'];

export default function Recommendations() {
  const [searchParams] = useSearchParams();
  const [category, setCategory] = useState(searchParams.get('category') || 'mortgages');
  const [amount, setAmount] = useState('');
  const [situation, setSituation] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [useAI, setUseAI] = useState(true);
  const [incomeEntries, setIncomeEntries] = useState([{ amount: '', currency: 'GBP' }]);
  const [bankAmount, setBankAmount] = useState('');
  const [bankAmountCurrency, setBankAmountCurrency] = useState('GBP');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ category, amount, useAI: String(useAI) });
      if (useAI && situation) params.set('situation', situation);
      const filteredEntries = incomeEntries.filter(
        e => e.amount !== '' && parseFloat(e.amount) !== 0
      );
      params.set('incomeEntries', JSON.stringify(filteredEntries));
      if (bankAmount !== '' && parseFloat(bankAmount) !== 0) {
        params.set('bankAmount', bankAmount);
        params.set('bankAmountCurrency', bankAmountCurrency);
      }
      const res = await fetch(`${API_BASE}/recommendations?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get recommendation');
      setResult(data);
    } catch (err) {
      setError(err.message || 'Failed to get recommendation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  function updateEntry(index, field, value) {
    const updated = [...incomeEntries];
    updated[index] = { ...updated[index], [field]: value };
    setIncomeEntries(updated);
  }

  function removeEntry(index) {
    setIncomeEntries(incomeEntries.filter((_, i) => i !== index));
  }

  function addEntry() {
    setIncomeEntries([...incomeEntries, { amount: '', currency: 'GBP' }]);
  }

  return (
    <div>
      <h2 style={{ marginBottom: '1rem' }}>Financial Recommendations</h2>

      {/* AI mode banner */}
      <div
        onClick={() => setUseAI(v => !v)}
        style={{
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.4rem 0.9rem',
          borderRadius: '1rem',
          marginBottom: '1.5rem',
          backgroundColor: useAI ? '#d4edda' : '#e2e3e5',
          color: useAI ? '#155724' : '#383d41',
          border: `1px solid ${useAI ? '#c3e6cb' : '#d6d8db'}`,
          userSelect: 'none',
          fontSize: '0.9rem',
        }}
      >
        {useAI ? '✓ Using AI (Gemini)' : 'Rule-based only'}
      </div>

      <div className="card">
        <form onSubmit={handleSubmit}>
          <label>Product Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="mortgages">Mortgages</option>
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

          <label>Annual Income After Taxes</label>
          {incomeEntries.map((entry, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="number"
                min="0"
                placeholder="e.g. 60000"
                value={entry.amount}
                onChange={e => updateEntry(i, 'amount', e.target.value)}
                style={{ flex: 1 }}
              />
              <select
                value={entry.currency}
                onChange={e => updateEntry(i, 'currency', e.target.value)}
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {incomeEntries.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeEntry(i)}
                  style={{ padding: '0 0.5rem' }}
                >×</button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addEntry}
            style={{ marginBottom: '1rem', fontSize: '0.85rem' }}
          >+ Add income source</button>

          <label>Current Amount in the Bank</label>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="number"
              min="0"
              placeholder="e.g. 50000"
              value={bankAmount}
              onChange={e => setBankAmount(e.target.value)}
              style={{ flex: 1 }}
            />
            <select
              value={bankAmountCurrency}
              onChange={e => setBankAmountCurrency(e.target.value)}
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {useAI && (
            <>
              <label>Your Financial Situation</label>
              <textarea
                rows={4}
                placeholder="Describe your situation: income, existing debts, credit score, savings, employment type, how long you plan to stay in the property, etc."
                value={situation}
                onChange={e => setSituation(e.target.value)}
                required
              />
            </>
          )}

          <button className="btn" type="submit" disabled={loading || !amount || (useAI && !situation)}>
            {loading ? 'Getting recommendation...' : useAI ? 'Get AI Recommendation' : 'Get Recommendation'}
          </button>
        </form>
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <>
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>
              {result.aiUsed ? 'AI Recommendation' : 'Recommendation'}
            </h3>
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
