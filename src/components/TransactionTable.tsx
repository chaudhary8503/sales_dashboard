import { useState } from 'react';
import { formatDate, formatPKR } from '../format';
import type { Sale } from '../mockData';
import './TransactionTable.css';

interface TransactionTableProps {
  sales: Sale[];
}

function TransactionTable({ sales }: TransactionTableProps) {
  const [newestFirst, setNewestFirst] = useState(true);

  // ISO date + 24h time sort correctly as plain strings.
  const rows = [...sales].sort((a, b) => {
    const cmp = `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
    return newestFirst ? -cmp : cmp;
  });

  return (
    <div className="card">
      <div className="section-title">Transactions</div>
      {rows.length === 0 ? (
        <p className="table-note">No sales match these filters.</p>
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th aria-sort={newestFirst ? 'descending' : 'ascending'}>
                    <button type="button" className="sort-button" onClick={() => setNewestFirst((v) => !v)}>
                      Date {newestFirst ? '↓' : '↑'}
                    </button>
                  </th>
                  <th>Time</th>
                  <th>Department</th>
                  <th>Location</th>
                  <th>Payment</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="mono">{formatDate(s.date)}</td>
                    <td className="mono">{s.time}</td>
                    <td>{s.department}</td>
                    <td>{s.location}</td>
                    <td>
                      <span className={`tag ${s.paymentType === 'Cash' ? 'cash' : 'credit'}`}>{s.paymentType}</span>
                    </td>
                    <td className="mono num">{formatPKR(s.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="table-note">
            {rows.length} {rows.length === 1 ? 'transaction' : 'transactions'}
          </p>
        </>
      )}
    </div>
  );
}

export default TransactionTable;
