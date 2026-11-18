import CustomerSearch from '../components/CustomerSearch';
import { go } from '../router';
import type { Session } from '../session';

/** Look up one customer at a time. There is deliberately no list of every customer. */
function CustomersPage({ session }: { session: Session }) {
  return (
    <>
      <h1 className="page-title">Customer lookup</h1>
      <p className="page-sub">Search for one customer by name, phone, code or business (at least 3 characters).</p>
      <div className="card narrow-card">
        <CustomerSearch
          id="cl-search"
          autoFocus
          canAdd={session.can('add_customer')}
          onSelect={(c) => go(`customers/${c.customer_id}`)}
        />
      </div>
    </>
  );
}

export default CustomersPage;
