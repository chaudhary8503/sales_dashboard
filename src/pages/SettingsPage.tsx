import { useState, type FormEvent } from 'react';
import { updateSettings, type SalesSettings } from '../api';
import { Banner, ErrorBanner } from '../components/Common';
import { useAction } from '../hooks';
import type { Session } from '../session';

const DAY_FIELDS: { key: keyof SalesSettings; label: string; hint: string; min: number; max: number }[] = [
  {
    key: 'overdue_warning_days',
    label: 'Overdue alert after (days past due)',
    hint: 'A credit invoice shows in the Portal alerts this many days after its due date.',
    min: 0,
    max: 365,
  },
  {
    key: 'overdue_critical_days',
    label: 'Overdue becomes urgent after a further (days)',
    hint: 'The alert turns red this many days after it first appears.',
    min: 1,
    max: 730,
  },
  {
    key: 'cheque_pending_days',
    label: 'Cheque still pending alert after (days)',
    hint: 'Counted from the cheque date.',
    min: 0,
    max: 365,
  },
  {
    key: 'sale_order_due_days',
    label: 'Order not delivered alert after (days past expected)',
    hint: 'Counted from the expected delivery date.',
    min: 0,
    max: 365,
  },
];

/** Sales settings: alert days, receipt format, footer and terms (manage_settings). */
function SettingsPage({ session }: { session: Session }) {
  const taxAnywhere = session.businesses.some((b) => b.tax_registered);
  const s = session.settings;
  const [values, setValues] = useState<Record<string, string>>(() => ({
    overdue_warning_days: String(s.overdue_warning_days),
    overdue_critical_days: String(s.overdue_critical_days),
    cheque_pending_days: String(s.cheque_pending_days),
    sale_order_due_days: String(s.sale_order_due_days),
    default_tax_rate: s.default_tax_rate === null ? '' : String(s.default_tax_rate),
  }));
  const [format, setFormat] = useState<'a4' | 'a5'>(s.default_receipt_format);
  const [footer, setFooter] = useState(s.receipt_footer ?? '');
  const [terms, setTerms] = useState(s.invoice_terms ?? '');
  const action = useAction();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await action.run(async () => {
      const out: Partial<SalesSettings> = {};
      for (const f of DAY_FIELDS) {
        const v = Number(values[f.key]);
        if (!Number.isInteger(v) || v < f.min || v > f.max) throw new Error(`${f.label}: enter a whole number from ${f.min} to ${f.max}.`);
        (out as Record<string, number>)[f.key] = v;
      }
      out.default_receipt_format = format;
      out.receipt_footer = footer.trim() || null;
      out.invoice_terms = terms.trim() || null;
      if (taxAnywhere) {
        const t = values.default_tax_rate.trim();
        const rate = t === '' ? null : Number(t);
        if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) throw new Error('The tax rate must be from 0 to 100.');
        out.default_tax_rate = rate;
      }
      await updateSettings(out);
      await session.reload();
      return 'Settings saved.';
    });
  };

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Alert days, the receipt printed after a sale, and the text at the bottom of invoices.</p>
      <div className="card">
        <Banner kind="ok">{action.done}</Banner>
        <ErrorBanner error={action.failure} />
        <form onSubmit={submit} noValidate>
          <div className="section-title">Alerts</div>
          <div className="form-grid">
            {DAY_FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <label htmlFor={`set-${f.key}`}>{f.label}</label>
                <input
                  id={`set-${f.key}`}
                  type="number"
                  min={f.min}
                  max={f.max}
                  step={1}
                  value={values[f.key]}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
                <div className="hint">{f.hint}</div>
              </div>
            ))}
          </div>

          <div className="section-title">Printing</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="set-format">Receipt printed after a sale</label>
              <select id="set-format" value={format} onChange={(e) => setFormat(e.target.value as 'a4' | 'a5')}>
                <option value="a4">A4 invoice</option>
                <option value="a5">A5 compact receipt</option>
              </select>
            </div>
            {taxAnywhere && (
              <div className="field">
                <label htmlFor="set-tax">Sales tax rate for registered businesses (%)</label>
                <input
                  id="set-tax"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={values.default_tax_rate}
                  onChange={(e) => setValues({ ...values, default_tax_rate: e.target.value })}
                />
                <div className="hint">Only invoices from a tax-registered business's locations are taxed.</div>
              </div>
            )}
            <div className="field span-2">
              <label htmlFor="set-terms">Invoice terms</label>
              <textarea id="set-terms" rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} />
              <div className="hint">Printed on invoices and sale orders, above the business footer.</div>
            </div>
            <div className="field span-2">
              <label htmlFor="set-footer">Receipt footer</label>
              <textarea id="set-footer" rows={2} value={footer} onChange={(e) => setFooter(e.target.value)} />
              <div className="hint">Printed at the bottom of invoices, receipts and credit notes (e.g. "Thank you").</div>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={action.busy}>
            {action.busy ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      </div>
    </>
  );
}

export default SettingsPage;
