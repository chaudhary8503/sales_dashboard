import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Item, Location } from '../api';
import type { SalesError } from '../errors';
import { STATUS_LABELS, statusTagClass } from '../format';
import { useAction } from '../hooks';
import { unitOptions } from '../units';

export type BannerKind = 'ok' | 'error' | 'info' | 'warn';

export function Banner({ kind, children }: { kind: BannerKind; children: ReactNode }) {
  if (!children) return null;
  return (
    <div className={`banner ${kind}`} role={kind === 'error' || kind === 'warn' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

/** A failed action, in the style its hint asks for (blue for "customers not live", amber otherwise). */
export function ErrorBanner({ error }: { error: SalesError | null | undefined }) {
  if (!error) return null;
  return <Banner kind={error.tone === 'info' ? 'info' : error.tone === 'warn' ? 'warn' : 'error'}>{error.message}</Banner>;
}

export function Loading({ what = 'Loading…' }: { what?: string }) {
  return <div className="state">{what}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="state">{children}</div>;
}

export function NoAccess() {
  return (
    <div className="card">
      <h1 className="page-title">Not available</h1>
      <p className="page-sub">You don't have permission for this page. Ask the owner if you need it.</p>
    </div>
  );
}

export const CUSTOMERS_NOT_LIVE =
  'Customer accounts start when Customer Management goes live. Until then, sales are walk-in cash sales.';

/** Shown instead of a customer screen while Customer Management isn't live. */
export function NotLive({ title }: { title: string }) {
  return (
    <>
      <h1 className="page-title">{title}</h1>
      <p className="page-sub">Not available yet.</p>
      <Banner kind="info">{CUSTOMERS_NOT_LIVE}</Banner>
    </>
  );
}

export function StatusTag({ status, label }: { status: string | null | undefined; label?: string }) {
  if (!status) return null;
  return <span className={`tag ${statusTagClass(status)}`}>{label ?? STATUS_LABELS[status] ?? status}</span>;
}

interface LocationSelectProps {
  id?: string;
  locations: Location[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

export function LocationSelect({ id, locations, value, onChange, placeholder, disabled, ariaLabel }: LocationSelectProps) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={ariaLabel}>
      <option value="">{placeholder ?? 'Choose a location'}</option>
      {locations.map((l) => (
        <option key={l.location_id} value={l.location_id}>
          {l.name}
        </option>
      ))}
    </select>
  );
}

interface QuantityInputProps {
  id?: string;
  item: Item | undefined;
  amount: string;
  unit: string;
  onAmount: (v: string) => void;
  onUnit: (u: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/** Amount plus a unit dropdown (base unit, metres for feet items, and the item's own units such as coil). */
export function QuantityInput({ id, item, amount, unit, onAmount, onUnit, placeholder, disabled }: QuantityInputProps) {
  const units = unitOptions(item);
  return (
    <div className="inline-input">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step="any"
        min={0}
        placeholder={placeholder ?? '0'}
        value={amount}
        disabled={disabled}
        onChange={(e) => onAmount(e.target.value)}
      />
      <select value={unit} onChange={(e) => onUnit(e.target.value)} aria-label="Unit" disabled={disabled || units.length <= 1}>
        {units.length === 0 && <option value="">unit</option>}
        {units.map((u) => (
          <option key={u.unit} value={u.unit}>
            {u.unit}
          </option>
        ))}
      </select>
    </div>
  );
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

/** A centred dialog. Escape or the backdrop closes it. */
export function Modal({ title, onClose, children, wide }: ModalProps) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    boxRef.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop no-print" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal card${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={boxRef}>
        <div className="modal-head">
          <h2 id={titleId} className="section-title">
            {title}
          </h2>
          <button type="button" className="link-btn" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface ConfirmWithReasonProps {
  title: string;
  /** What happens, in plain words. */
  explain: ReactNode;
  confirmLabel: string;
  reasonLabel?: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

/** A dialog that needs a typed reason before it calls the server. */
export function ConfirmWithReason({ title, explain, confirmLabel, reasonLabel, onConfirm, onClose }: ConfirmWithReasonProps) {
  const [reason, setReason] = useState('');
  const action = useAction();
  const fieldId = useId();
  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal-explain">{explain}</div>
      <ErrorBanner error={action.failure} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!reason.trim()) return;
          void action.run(() => onConfirm(reason.trim()));
        }}
      >
        <div className="field">
          <label htmlFor={fieldId}>{reasonLabel ?? 'Reason'}</label>
          <textarea id={fieldId} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="form-actions modal-actions">
          <button type="submit" className="btn btn-danger" disabled={!reason.trim() || action.busy}>
            {action.busy ? 'Working…' : confirmLabel}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Keep it
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Label + value pair for detail pages. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <div className="fact-label">{label}</div>
      <div className="fact-value">{children}</div>
    </div>
  );
}
