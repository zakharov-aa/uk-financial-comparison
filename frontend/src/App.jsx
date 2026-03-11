import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home';
import Products from './pages/Products';
import Compare from './pages/Compare';
import Recommendations from './pages/Recommendations';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <nav className="navbar">
          <Link to="/" className="nav-brand">UK Financial Comparison</Link>
          <div className="nav-links">
            <Link to="/products/mortgages">Mortgages</Link>
            <Link to="/products/exchange-rates">Exchange Rates</Link>
            <Link to="/compare">Compare</Link>
            <Link to="/recommendations">Recommendations</Link>
          </div>
        </nav>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/products/:category" element={<Products />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/recommendations" element={<Recommendations />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
