import { useState } from 'react';
import { listCheques, type PaymentRow } from '../api';
import { BounceChequeDialog, ClearChequeDialog } from '../components/ChequeDialogs';
import { Banner, Empty, Loading } from '../components/Common';
import { daysBetween, formatDate, formatMoney } from '../format';
import { useAsync } from '../hooks';
import { href } from '../router';
import type { Session } from '../session';

type Tab = 'pending' | 'cleared' | 'bounced';

/** Cheques received: pending ones can be marked cleared or bounced (manage_cheques). */
function ChequesPage({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('pending');
  const { data, error, loading, reload } = useAsync(() => listCheques(tab), [tab]);
  const [dialog, setDialog] = useState<{ kind: 'clear' | 'bounce'; row: PaymentRow } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const canManage = session.can('manage_cheques');
  const rows = data ?? [];
  const waitDays = session.settings.cheque_pending_days;

  const finished = (m: string) => {
    setDialog(null);
    setDone(m);
    reload();
  };

  return (
    <>
      <h1 className="page-title">Cheques</h1>
      <p className="page-sub">
        A cheque counts only when it is cleared. Pending cheques older than {waitDays} day{waitDays === 1 ? '' : 's'} past their date are shown in
        amber.
      </p>
      <Banner kind="ok">{done}</Banner>
      <div className="card">
        <div className="tabs" role="group" aria-label="Cheque status">
          {(['pending', 'cleared', 'bounced'] as Tab[]).map((t) => (
            <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t === 'pending' ? 'Pending' : t === 'cleared' ? 'Cleared' : 'Bounced'}
            </button>
          ))}
        </div>
        {error && <Banner kind="error">{error}</Banner>}
        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No {tab} cheques.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Cheque</th>
                  <th>Customer</th>
                  <th className="num">Amount</th>
                  <th>Cheque date</th>
                  {tab === 'pending' && <th className="num">Days since</th>}
                  {tab === 'cleared' && <th>Cleared</th>}
                  {tab === 'bounced' && <th>Reason</th>}
                  <th>Payment</th>
                  {tab === 'pending' && canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const since = daysBetween(p.cheque_date ?? p.payment_date, session.today);
                  const late = tab === 'pending' && since > waitDays;
                  return (
                    <tr key={p.id} className={late ? 'late-row' : undefined}>
                      <td className="mono">
                        {p.cheque_no}
                        {p.cheque_bank && <div className="sub">{p.cheque_bank}</div>}
                      </td>
                      <td>{p.customer_name}</td>
                      <td className="num mono">{formatMoney(p.amount)}</td>
                      <td className="mono">{formatDate(p.cheque_date ?? p.payment_date)}</td>
                      {tab === 'pending' && (
                        <td className={`num mono${late ? ' amber' : ''}`}>{since < 0 ? `in ${-since} days` : since}</td>
                      )}
                      {tab === 'cleared' && <td className="mono">{formatDate(p.cleared_date)}</td>}
                      {tab === 'bounced' && <td className="wrap">{p.status_reason ?? '—'}</td>}
                      <td className="mono">
                        <a href={href(`payments/${p.id}`)}>{p.payment_no}</a>
                      </td>
                      {tab === 'pending' && canManage && (
                        <td className="num">
                          <div className="detail-actions advance-actions">
                            <button type="button" className="btn btn-secondary btn-small" onClick={() => setDialog({ kind: 'clear', row: p })}>
                              Cleared
                            </button>
                            <button type="button" className="btn btn-danger btn-small" onClick={() => setDialog({ kind: 'bounce', row: p })}>
                              Bounced
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {dialog?.kind === 'clear' && (
        <ClearChequeDialog cheque={dialog.row} today={session.today} onClose={() => setDialog(null)} onDone={finished} />
      )}
      {dialog?.kind === 'bounce' && <BounceChequeDialog cheque={dialog.row} onClose={() => setDialog(null)} onDone={finished} />}
    </>
  );
}

export default ChequesPage;
