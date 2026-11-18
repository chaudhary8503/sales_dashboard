import { useState, type FormEvent } from 'react';
import { getDocument, saveDeliveryDetails, type InvoiceDoc } from '../api';
import { Banner, ErrorBanner, Loading } from '../components/Common';
import PrintShell, { DocSignatures } from '../components/PrintShell';
import { formatDate } from '../format';
import { useAction, useAsync } from '../hooks';
import type { Session } from '../session';
import { bundleSummary, qtyText } from './docText';
import { InvoiceToolbar } from './InvoicePrint';

/** Delivery challan for an invoice: same number, no prices. Vehicle and driver are saved first. */
function ChallanPrint({ session, invoiceId }: { session: Session; invoiceId: string }) {
  const { data: inv, error, loading } = useAsync(() => getDocument('invoice', invoiceId), [invoiceId]);
  const canSave = session.can('create_sale');
  const [stage, setStage] = useState<'form' | 'print'>(canSave ? 'form' : 'print');
  const [saved, setSaved] = useState<Delivery | null>(null);

  if (loading && !inv) return <Loading />;
  if (error || !inv) return <Banner kind="error">{error ?? 'Invoice not found.'}</Banner>;

  if (stage === 'form' && inv.status === 'posted') {
    return (
      <DeliveryForm
        inv={inv}
        onSaved={(d) => {
          setSaved(d);
          setStage('print');
        }}
        onSkip={() => setStage('print')}
      />
    );
  }

  const delivery = saved ?? inv.delivery;
  return (
    <PrintShell
      key={stage}
      session={session}
      business={inv.business}
      format="a4"
      auto={stage === 'print' && canSave}
      cancelled={inv.status === 'cancelled'}
      toolbar={<InvoiceToolbar inv={inv} current="challan" />}
      title={
        <>
          <div className="doc-kind">DELIVERY CHALLAN</div>
          <div className="doc-no">{inv.invoice_no}</div>
          <div className="doc-small">Date: {formatDate(inv.invoice_date)}</div>
          {inv.location_name && <div className="doc-small">From {inv.location_name}</div>}
        </>
      }
    >
      <section className="doc-parties">
        <div>
          <div className="doc-label">Deliver to</div>
          <div className="doc-strong">{inv.customer_name ?? (inv.walk_in_name || 'Walk-in customer')}</div>
          {inv.customer_business_name && <div>{inv.customer_business_name}</div>}
          <div className="doc-small">{inv.customer_phone ?? inv.walk_in_phone ?? ''}</div>
        </div>
        <div>
          <div className="doc-label">Vehicle</div>
          <div>{delivery?.vehicle_no || '—'}</div>
        </div>
        <div>
          <div className="doc-label">Driver</div>
          <div>{delivery?.driver_name || '—'}</div>
        </div>
      </section>

      <table className="doc-lines">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th className="num">Quantity</th>
            <th>Bundles</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.line_no}</td>
              <td>
                {l.invoice_name}
                {l.source_location_id !== inv.sale_location_id && l.source_location_name && (
                  <div className="doc-line-note">From {l.source_location_name}</div>
                )}
              </td>
              <td className="num">{qtyText(l)}</td>
              <td className="mono">{l.bundles.length ? bundleSummary(l.bundles) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {delivery?.note && <p className="doc-text">Note: {delivery.note}</p>}
      <DocSignatures left={`Delivered by${delivery?.driver_name ? ` (${delivery.driver_name})` : ''}`} right="Received by" />
    </PrintShell>
  );
}

type Delivery = NonNullable<InvoiceDoc['delivery']>;

function DeliveryForm({ inv, onSaved, onSkip }: { inv: InvoiceDoc; onSaved: (d: Delivery) => void; onSkip: () => void }) {
  const [vehicle, setVehicle] = useState(inv.delivery?.vehicle_no ?? '');
  const [driver, setDriver] = useState(inv.delivery?.driver_name ?? '');
  const [note, setNote] = useState(inv.delivery?.note ?? '');
  const action = useAction();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await action.run(() => saveDeliveryDetails(inv.id, vehicle.trim(), driver.trim(), note.trim() || null));
    if (ok) onSaved({ vehicle_no: vehicle.trim() || null, driver_name: driver.trim() || null, note: note.trim() || null });
  };

  return (
    <>
      <div className="doc-toolbar">
        <InvoiceToolbar inv={inv} current="challan" />
      </div>
      <div className="card narrow-card">
        <h1 className="page-title">Delivery challan for {inv.invoice_no}</h1>
        <p className="page-sub">Enter the vehicle and driver. They are saved with the invoice and printed on the challan.</p>
        <ErrorBanner error={action.failure} />
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="dc-vehicle">Vehicle number</label>
              <input id="dc-vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. KHI-1234" />
            </div>
            <div className="field">
              <label htmlFor="dc-driver">Driver name</label>
              <input id="dc-driver" value={driver} onChange={(e) => setDriver(e.target.value)} />
            </div>
            <div className="field span-2">
              <label htmlFor="dc-note">Note (optional)</label>
              <input id="dc-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={action.busy}>
              {action.busy ? 'Saving…' : 'Save and print'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onSkip}>
              Print without changes
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

export default ChallanPrint;
