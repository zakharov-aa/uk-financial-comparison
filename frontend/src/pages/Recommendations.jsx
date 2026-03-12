import { useState, useRef } from 'react';
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
  const [useAI, setUseAI] = useState(false);
  const [incomeEntries, setIncomeEntries] = useState([{ amount: '', currency: 'GBP' }]);
  const [bankAmount, setBankAmount] = useState('');
  const [bankAmountCurrency, setBankAmountCurrency] = useState('GBP');
  const [aiFilledFields, setAiFilledFields] = useState(new Set());
  const [smartFillPrompt, setSmartFillPrompt] = useState('');
  const [smartFillLoading, setSmartFillLoading] = useState(false);
  const [smartFillError, setSmartFillError] = useState(null);
  const amountRef = useRef(null);

  function markUserEdited(fieldName) {
    setAiFilledFields(prev => {
      const next = new Set(prev);
      next.delete(fieldName);
      return next;
    });
  }

  const handleSmartFill = async () => {
    setSmartFillLoading(true);
    setSmartFillError(null);
    try {
      const res = await fetch(`${API_BASE}/extract-fields?prompt=${encodeURIComponent(smartFillPrompt)}`);
      const data = await res.json();
      if (!res.ok) {
        setSmartFillError(
          res.status === 429
            ? 'AI quota exceeded — please fill in the fields manually'
            : 'Smart fill unavailable — please fill in the fields manually'
        );
        return;
      }
      const filled = new Set();
      const prevAmount = amount;
      if (data.category) { setCategory(data.category); filled.add('category'); }
      if (data.amount != null) { setAmount(String(Math.round(data.amount))); filled.add('amount'); }
      if (Array.isArray(data.incomeEntries) && data.incomeEntries.length > 0) {
        setIncomeEntries(data.incomeEntries.map(e => ({ amount: String(e.amount), currency: e.currency })));
        filled.add('incomeEntries');
      }
      if (data.situation) { setSituation(data.situation); filled.add('situation'); }
      setAiFilledFields(filled);
      if (data.amount != null && String(Math.round(data.amount)) !== prevAmount) {
        amountRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch {
      setSmartFillError('Smart fill unavailable — please fill in the fields manually');
    } finally {
      setSmartFillLoading(false);
    }
  };

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
    markUserEdited('incomeEntries');
  }

  function removeEntry(index) {
    setIncomeEntries(incomeEntries.filter((_, i) => i !== index));
    markUserEdited('incomeEntries');
  }

  function addEntry() {
    setIncomeEntries([...incomeEntries, { amount: '', currency: 'GBP' }]);
    markUserEdited('incomeEntries');
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

      {/* Smart Fill panel */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <label style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 600 }}>Smart Fill</label>
        <textarea
          rows={3}
          placeholder='Describe your situation in plain English, e.g. "I am a senior engineer in the US and want to buy a home in Colorado"'
          value={smartFillPrompt}
          onChange={e => setSmartFillPrompt(e.target.value)}
          style={{ marginBottom: '0.75rem' }}
        />
        <button
          type="button"
          className="btn"
          onClick={handleSmartFill}
          disabled={smartFillLoading || !smartFillPrompt.trim()}
        >
          {smartFillLoading ? 'Filling…' : 'Fill Form'}
        </button>
        {smartFillError && (
          <div style={{ marginTop: '0.5rem', color: '#856404', background: '#fff3cd', border: '1px solid #ffeeba', borderRadius: '4px', padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
            {smartFillError}
          </div>
        )}
      </div>

      <div className="card">
        <form onSubmit={handleSubmit}>
          <label>
            Product Category
            {aiFilledFields.has('category') && <span style={{ color: '#27ae60', fontSize: '0.75rem', marginLeft: '0.5rem' }}>✦ AI</span>}
          </label>
          <select
            value={category}
            onChange={e => { setCategory(e.target.value); markUserEdited('category'); }}
            style={aiFilledFields.has('category') ? { borderLeft: '3px solid #27ae60' } : {}}
          >
            <option value="mortgages">Mortgages</option>
            <option value="savings">Savings</option>
          </select>

          <label>
            Amount (£)
            {aiFilledFields.has('amount') && <span style={{ color: '#27ae60', fontSize: '0.75rem', marginLeft: '0.5rem' }}>✦ AI</span>}
          </label>
          <input
            ref={amountRef}
            type="number"
            placeholder="e.g. 200000 for a mortgage, 50000 for savings"
            value={amount}
            onChange={e => { setAmount(e.target.value); markUserEdited('amount'); }}
            required
            style={aiFilledFields.has('amount') ? { borderLeft: '3px solid #27ae60' } : {}}
          />

          <label>
            Annual Income After Taxes
            {aiFilledFields.has('incomeEntries') && <span style={{ color: '#27ae60', fontSize: '0.75rem', marginLeft: '0.5rem' }}>✦ AI</span>}
          </label>
          {incomeEntries.map((entry, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="number"
                min="0"
                placeholder="e.g. 60000"
                value={entry.amount}
                onChange={e => updateEntry(i, 'amount', e.target.value)}
                style={{ flex: 1, minWidth: '140px', ...(aiFilledFields.has('incomeEntries') ? { borderLeft: '3px solid #27ae60' } : {}) }}
              />
              <select
                value={entry.currency}
                onChange={e => updateEntry(i, 'currency', e.target.value)}
                style={{ width: '72px', flexShrink: 0 }}
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
              style={{ flex: 1, minWidth: '140px' }}
            />
            <select
              value={bankAmountCurrency}
              onChange={e => setBankAmountCurrency(e.target.value)}
              style={{ width: '72px', flexShrink: 0 }}
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {useAI && (
            <>
              <label>
                Your Financial Situation
                {aiFilledFields.has('situation') && <span style={{ color: '#27ae60', fontSize: '0.75rem', marginLeft: '0.5rem' }}>✦ AI</span>}
              </label>
              <textarea
                rows={4}
                placeholder="Describe your situation: income, existing debts, credit score, savings, employment type, how long you plan to stay in the property, etc."
                value={situation}
                onChange={e => { setSituation(e.target.value); markUserEdited('situation'); }}
                style={aiFilledFields.has('situation') ? { borderLeft: '3px solid #27ae60' } : {}}
              />
            </>
          )}

          <button className="btn" type="submit" disabled={loading || !amount}>
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
