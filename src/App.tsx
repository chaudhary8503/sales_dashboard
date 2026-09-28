import './App.css';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <div className="app-shell">
      <Header />

      <main className="app-body">
        <div className="page">
          <div className="page-inner">
            <Dashboard />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
