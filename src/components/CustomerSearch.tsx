import { useId, useState, type FormEvent } from 'react';
import { quickAddCustomer, searchCustomers, type Customer } from '../api';
import { useAction, useAsync, useDebounced } from '../hooks';
import { ErrorBanner, Modal } from './Common';
import './CustomerSearch.css';

interface CustomerSearchProps {
  onSelect: (customer: Customer) => void;
  /** Shows "Add customer" (add_customer). */
  canAdd?: boolean;
  id?: string;
  autoFocus?: boolean;
  placeholder?: string;
}

/** One-customer search: at least 3 characters (name, phone, code or business). There is no list of everyone. */
function CustomerSearch({ onSelect, canAdd, id, autoFocus, placeholder }: CustomerSearchProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const settled = useDebounced(query.trim(), 300);
  const enough = settled.length >= 3;
  const { data, error, loading } = useAsync(
    () => (enough ? searchCustomers(settled, 20) : Promise.resolve([] as Customer[])),
    [settled],
  );
  const rows = enough ? (data ?? []) : [];

  return (
    <div className="customer-search">
      <div className="inline-input">
        <input
          id={id}
          type="search"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-controls={listId}
          placeholder={placeholder ?? 'Customer name, phone or code (3+ letters)'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {canAdd && (
          <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
            Add customer
          </button>
        )}
      </div>
      {query.trim().length > 0 && query.trim().length < 3 && <div className="hint">Type at least 3 characters.</div>}
      {enough && (
        <ul className="customer-results" id={listId}>
          {loading && !data && <li className="customer-empty">Searching…</li>}
          {error && <li className="customer-empty">{error}</li>}
          {!loading && !error && rows.length === 0 && <li className="customer-empty">No customer found.</li>}
          {rows.map((c) => (
            <li key={c.customer_id}>
              <button type="button" onClick={() => onSelect(c)}>
                <span className="customer-name">
                  {c.customer_code && <span className="mono customer-code">{c.customer_code}</span>}
                  {c.name}
                  {c.blocked && <span className="tag out">Blocked</span>}
                </span>
                <span className="sub">{[c.business_name, c.phone, c.city].filter(Boolean).join(' · ') || '—'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <QuickAdd
          initialName={/\d/.test(query) ? '' : query.trim()}
          initialPhone={/\d/.test(query) ? query.trim() : ''}
          onClose={() => setAdding(false)}
          onAdded={(c) => {
            setAdding(false);
            setQuery('');
            onSelect(c);
          }}
        />
      )}
    </div>
  );
}

function QuickAdd({
  initialName,
  initialPhone,
  onClose,
  onAdded,
}: {
  initialName: string;
  initialPhone: string;
  onClose: () => void;
  onAdded: (c: Customer) => void;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [city, setCity] = useState('');
  const [businessName, setBusinessName] = useState('');
  const action = useAction();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    let added: Customer | null = null;
    const ok = await action.run(async () => {
      const id = await quickAddCustomer({ name, phone, city, businessName });
      // Read the new customer back (for code and terms); fall back to what was typed.
      const found = name.trim().length >= 3 ? await searchCustomers(name.trim(), 50).catch(() => []) : [];
      added = found.find((c) => c.customer_id === id) ?? {
        customer_id: id,
        customer_code: null,
        name: name.trim(),
        business_name: businessName.trim() || null,
        phone: phone.trim() || null,
        city: city.trim() || null,
        payment_terms_days: null,
        balance: null,
        blocked: false,
        block_reason: null,
      };
    });
    if (ok && added) onAdded(added);
  };

  return (
    <Modal title="Add customer" onClose={onClose}>
      <ErrorBanner error={action.failure} />
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="qa-name">Name</label>
            <input id="qa-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="qa-phone">Phone</label>
            <input id="qa-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="qa-city">City (optional)</label>
            <input id="qa-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="field span-2">
            <label htmlFor="qa-business">Business name (optional)</label>
            <input id="qa-business" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || action.busy}>
            {action.busy ? 'Adding…' : 'Add and choose'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default CustomerSearch;

/** Selected customer summary with a blocked banner. */
export function CustomerCard({ customer, onChange }: { customer: Customer; onChange?: () => void }) {
  return (
    <div className="customer-card">
      <div className="customer-card-main">
        <div className="customer-name">
          {customer.customer_code && <span className="mono customer-code">{customer.customer_code}</span>}
          {customer.name}
        </div>
        <div className="sub">{[customer.business_name, customer.phone, customer.city].filter(Boolean).join(' · ') || '—'}</div>
      </div>
      {onChange && (
        <button type="button" className="link-btn" onClick={onChange}>
          Change
        </button>
      )}
    </div>
  );
}
