import { Link } from 'react-router-dom';

const CATEGORIES = [
  { id: 'mortgages', title: 'Mortgages', description: 'Compare fixed and variable mortgage rates from Bank of England data' },
  { id: 'exchange-rates', title: 'Exchange Rates', description: 'Current GBP exchange rates against major currencies' },
];

export default function Home() {
  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>UK Financial Products Comparison</h2>
      <p style={{ color: '#666', marginBottom: '2rem' }}>Real market data powered by Bank of England API and AI analysis</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        {CATEGORIES.map(cat => (
          <div key={cat.id} className="card">
            <h3>{cat.title}</h3>
            <p style={{ color: '#666', margin: '0.75rem 0 1rem' }}>{cat.description}</p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Link to={`/products/${cat.id}`}><button className="btn">View Rates</button></Link>
              {cat.id !== 'exchange-rates' && (
                <Link to={`/recommendations?category=${cat.id}`}><button className="btn" style={{ background: '#27ae60' }}>Get Recommendation</button></Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
