import './Header.css';

function Header() {
  return (
    <header>
      <div className="brand">
        <img className="brand-mark" src="/powerant-logo.jpg" alt="Powerant" />
        <div>
          <div className="brand-name">Sales Dashboard</div>
          <div className="brand-sub">Prototype — showing mock data, not live Manager.io figures</div>
        </div>
      </div>
    </header>
  );
}

export default Header;
