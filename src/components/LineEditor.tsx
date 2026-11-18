import type { Category, Location } from '../api';
import { formatMoney, formatQty } from '../format';
import { newLine, type DraftLine, type PricedLine } from '../lines';
import type { Session } from '../session';
import { conversionHint, defaultUnit } from '../units';
import { LocationSelect, QuantityInput } from './Common';
import ItemPicker from './ItemPicker';
import './LineEditor.css';

interface LineEditorProps {
  session: Session;
  lines: DraftLine[];
  priced: PricedLine[];
  onChange: (lines: DraftLine[]) => void;
  /** 'invoice' adds supply location and bundles; 'order' has neither. */
  mode: 'invoice' | 'order';
  categories: Category[];
  saleLocationId: string;
  /** Opens the bundle picker for a line (invoice mode, cable only). */
  onChooseBundles?: (key: number) => void;
  /** Lines come from a sale order: the item can't change. */
  lockItems?: boolean;
}

function LineEditor({ session, lines, priced, onChange, mode, categories, saleLocationId, onChooseBundles, lockItems }: LineEditorProps) {
  const canDiscount = session.can('give_discount');
  const canOtherSource = session.can('supply_from_other_location');
  const canChooseBundle = session.can('choose_bundle');
  const update = (key: number, patch: Partial<DraftLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const locations: Location[] = session.locations;

  return (
    <div className="line-editor">
      {priced.map((p, i) => {
        const l = p.line;
        const item = p.item;
        const unit = l.unit || defaultUnit(item);
        const isCable = item?.category === 'finished_cable';
        const sourceId = l.sourceId || saleLocationId;
        const sourceName = locations.find((x) => x.location_id === sourceId)?.name ?? '';
        const overOrder =
          l.orderRemainingBase !== undefined && p.baseQty !== null && p.baseQty > Math.max(l.orderRemainingBase, 0) + 0.0005;
        return (
          <div className="sale-line" key={l.key}>
            <div className="sale-line-head">
              <span className="sale-line-no">Line {i + 1}</span>
              <div className="sale-line-head-right">
                <span className={`sale-line-amount mono${item ? '' : ' empty'}`} aria-label="Line amount">
                  {formatMoney(p.gross - p.discount)}
                </span>
                {lines.length > 1 && !lockItems && (
                  <button type="button" className="link-btn" onClick={() => onChange(lines.filter((x) => x.key !== l.key))}>
                    Remove
                  </button>
                )}
              </div>
            </div>
            <div className="field item-cell">
              <label htmlFor={`ln-item-${l.key}`}>Item</label>
              <ItemPicker
                id={`ln-item-${l.key}`}
                items={session.items}
                categories={categories}
                value={l.itemId}
                disabled={lockItems}
                onChange={(id) => {
                  const it = session.items.find((x) => x.item_id === id);
                  update(l.key, { itemId: id, unit: defaultUnit(it), bundles: [] });
                }}
              />
            </div>
            <div className={`sale-line-grid ${mode}${canDiscount ? '' : ' no-discount'}`}>
              <div className="field">
                <label htmlFor={`ln-qty-${l.key}`}>Quantity</label>
                <QuantityInput
                  id={`ln-qty-${l.key}`}
                  item={item}
                  amount={l.qty}
                  unit={unit}
                  disabled={!item}
                  onAmount={(v) => update(l.key, { qty: v })}
                  onUnit={(u) => update(l.key, { unit: u })}
                />
                <div className="hint">{conversionHint(item, l.qty, unit)}</div>
              </div>
              <div className="field">
                <label htmlFor={`ln-rate-${l.key}`}>Rate per {unit || 'unit'}</label>
                <input
                  id={`ln-rate-${l.key}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={l.rate}
                  disabled={!item}
                  onChange={(e) => update(l.key, { rate: e.target.value })}
                />
              </div>
              {canDiscount && (
                <div className="field">
                  <label htmlFor={`ln-disc-${l.key}`}>Discount</label>
                  <div className="inline-input">
                    <input
                      id={`ln-disc-${l.key}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      placeholder="0"
                      value={l.discValue}
                      disabled={!item}
                      onChange={(e) => update(l.key, { discValue: e.target.value })}
                    />
                    <select
                      aria-label="Discount type"
                      value={l.discType}
                      disabled={!item}
                      onChange={(e) => update(l.key, { discType: e.target.value as DraftLine['discType'] })}
                    >
                      <option value="amount">Rs</option>
                      <option value="percent">%</option>
                    </select>
                  </div>
                </div>
              )}
              {mode === 'invoice' && (
                <div className="field">
                  <label htmlFor={`ln-src-${l.key}`}>Supply from</label>
                  <LocationSelect
                    id={`ln-src-${l.key}`}
                    locations={locations}
                    value={sourceId}
                    disabled={!canOtherSource}
                    placeholder="Sale location"
                    onChange={(id) => update(l.key, { sourceId: id === saleLocationId ? '' : id, bundles: [] })}
                  />
                </div>
              )}
            </div>

            {mode === 'invoice' && isCable && (
              <div className="sale-line-foot">
                {canChooseBundle ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      disabled={!sourceId}
                      onClick={() => onChooseBundles?.(l.key)}
                    >
                      Choose bundles
                    </button>
                    <span className="sub">
                      {l.bundles.length === 0
                        ? `Picked automatically at ${sourceName || 'the supply location'} (opened first, then oldest).`
                        : `${l.bundles.map((b) => `${b.bundle_no} (${formatQty(b.quantity_ft, 'ft')})`).join(', ')}${
                            p.baseQty !== null && p.baseQty > l.bundles.reduce((s, b) => s + b.quantity_ft, 0) + 0.0005
                              ? '; the rest is picked automatically'
                              : ''
                          }`}
                    </span>
                  </>
                ) : (
                  <span className="sub">Bundles are picked automatically (opened first, then oldest).</span>
                )}
              </div>
            )}
            {overOrder && (
              <div className="field-problem">
                More than ordered ({formatQty(Math.max(l.orderRemainingBase ?? 0, 0), item?.base_unit)} left on the order); allowed because bundle
                lengths vary.
              </div>
            )}
            {p.problem && l.itemId && (l.qty !== '' || l.rate !== '') && <div className="field-problem">{p.problem}</div>}
          </div>
        );
      })}
      {!lockItems && (
        <button type="button" className="btn btn-secondary" onClick={() => onChange([...lines, newLine()])}>
          Add another item
        </button>
      )}
    </div>
  );
}

export default LineEditor;
