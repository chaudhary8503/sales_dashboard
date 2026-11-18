import { formatDate, formatMoney } from '../format';
import { allocatedTotal, type OpenForAllocation } from '../payments';

interface AllocationTableProps {
  invoices: OpenForAllocation[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  /** Money available to allocate. */
  available: number;
  /** True while the amounts are still the oldest-first suggestion. */
  suggested: boolean;
  onReset?: () => void;
  today: string;
}

/** Open invoices with an editable amount each; shows what is left over as advance. */
function AllocationTable({ invoices, values, onChange, available, suggested, onReset, today }: AllocationTableProps) {
  const total = allocatedTotal(values);
  const left = Math.round((available - total) * 100) / 100;
  if (invoices.length === 0) return <p className="sub">This customer has no open credit invoices. The whole amount is kept as advance.</p>;
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Due</th>
              <th className="num">Can take</th>
              <th className="num">Allocate</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const overdue = inv.due_date !== null && inv.due_date < today;
              return (
                <tr key={inv.invoice_id}>
                  <td className="mono">{inv.invoice_no}</td>
                  <td className="mono">{formatDate(inv.invoice_date)}</td>
                  <td className={`mono${overdue ? ' amber' : ''}`}>{formatDate(inv.due_date)}</td>
                  <td className="num mono">{formatMoney(inv.open_to_allocate)}</td>
                  <td className="num">
                    <input
                      className="cell-input narrow alloc-input"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      aria-label={`Amount for ${inv.invoice_no}`}
                      value={values[inv.invoice_id] ?? ''}
                      onChange={(e) => onChange({ ...values, [inv.invoice_id]: e.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="table-note">
        Against invoices: <strong>{formatMoney(total)}</strong> · Unallocated (kept as advance):{' '}
        <strong className={left < 0 ? 'amber' : undefined}>{formatMoney(left)}</strong>
        {suggested ? ' · suggested oldest first' : ''}
        {!suggested && onReset && (
          <>
            {' · '}
            <button type="button" className="link-btn" onClick={onReset}>
              Back to oldest first
            </button>
          </>
        )}
      </p>
    </>
  );
}

export default AllocationTable;
