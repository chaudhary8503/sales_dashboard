import { useState } from 'react';
import { listBundles, type Item } from '../api';
import { formatQty, FT_PER_M, getLengthUnit, M_PER_FT } from '../format';
import { useAsync } from '../hooks';
import type { ChosenBundle } from '../lines';
import { Banner, Empty, Loading, Modal } from './Common';

interface BundlePickerProps {
  item: Item;
  locationId: string;
  locationName: string;
  /** The line's quantity in feet (null when not entered yet). */
  lineFt: number | null;
  value: ChosenBundle[];
  /** A server message to show at the top (e.g. "Bundle … has only … left"). */
  notice?: string | null;
  onApply: (bundles: ChosenBundle[]) => void;
  onClose: () => void;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Choose which bundles to cut from. Lengths are typed in the person's unit and
 * sent in feet. Whatever isn't chosen is cut automatically (opened first, then oldest).
 */
function BundlePicker({ item, locationId, locationName, lineFt, value, notice, onApply, onClose }: BundlePickerProps) {
  const metres = getLengthUnit() === 'm';
  const unit = metres ? 'm' : 'ft';
  const toShown = (ft: number) => String(round3(metres ? ft * M_PER_FT : ft));
  const toFt = (shown: string) => {
    const v = Number(shown);
    return Number.isFinite(v) ? round3(metres ? v * FT_PER_M : v) : NaN;
  };

  const { data, error, loading } = useAsync(() => listBundles(item.item_id, locationId), [item.item_id, locationId]);
  const [picked, setPicked] = useState<Record<string, string>>(() =>
    Object.fromEntries(value.map((b) => [b.bundle_id, toShown(b.quantity_ft)])),
  );

  const bundles = data ?? [];
  const chosen = Object.entries(picked).map(([id, shown]) => ({ id, shown, ft: toFt(shown), b: bundles.find((x) => x.bundle_id === id) }));
  const totalFt = round3(chosen.reduce((s, c) => s + (Number.isFinite(c.ft) ? c.ft : 0), 0));
  const invalid = chosen.some((c) => !Number.isFinite(c.ft) || c.ft <= 0);
  const over = lineFt !== null && totalFt > lineFt + 0.0005;
  const tooLong = chosen.filter((c) => c.b && c.ft > c.b.remaining_ft + 0.0005);

  const toggle = (id: string, remaining: number) =>
    setPicked((p) => {
      const next = { ...p };
      if (id in next) delete next[id];
      else {
        const left = lineFt === null ? remaining : Math.max(0, Math.min(remaining, lineFt - totalFt));
        next[id] = left > 0 ? toShown(left) : '';
      }
      return next;
    });

  const apply = () => {
    onApply(
      chosen
        .filter((c) => c.b && Number.isFinite(c.ft) && c.ft > 0)
        .map((c) => ({ bundle_id: c.id, bundle_no: c.b!.bundle_no, quantity_ft: c.ft, remaining_ft: c.b!.remaining_ft })),
    );
  };

  return (
    <Modal title={`Choose bundles — ${item.invoice_name || item.name}`} onClose={onClose} wide>
      <div className="modal-explain">
        Bundles at {locationName}, in the order they would be used (opened first, then oldest). Tick a bundle and type the length to cut
        from it. Anything not chosen is cut automatically.
      </div>
      {notice && <Banner kind="error">{notice}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}
      {loading && !data ? (
        <Loading />
      ) : bundles.length === 0 ? (
        <Empty>No bundles of this cable at {locationName}.</Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Use</th>
                <th>Bundle</th>
                <th className="num">Left</th>
                <th className="num">Original</th>
                <th>Cut ({unit})</th>
              </tr>
            </thead>
            <tbody>
              {bundles.map((b) => {
                const on = b.bundle_id in picked;
                const c = chosen.find((x) => x.id === b.bundle_id);
                return (
                  <tr key={b.bundle_id} className={on ? 'highlighted' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(b.bundle_id, b.remaining_ft)}
                        aria-label={`Use bundle ${b.bundle_no}`}
                      />
                    </td>
                    <td className="mono">
                      {b.bundle_no} {b.opened && <span className="tag muted">Opened</span>}
                    </td>
                    <td className="num mono">{formatQty(b.remaining_ft, 'ft')}</td>
                    <td className="num mono">{formatQty(b.original_ft, 'ft')}</td>
                    <td>
                      {on && (
                        <input
                          className="cell-input narrow"
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          value={picked[b.bundle_id]}
                          aria-label={`Length from ${b.bundle_no}`}
                          onChange={(e) => setPicked((p) => ({ ...p, [b.bundle_id]: e.target.value }))}
                        />
                      )}
                      {c && c.ft > b.remaining_ft + 0.0005 && <div className="sub amber">More than this bundle has</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="table-note">
        Chosen: {formatQty(totalFt, 'ft')}
        {lineFt !== null && <> of {formatQty(lineFt, 'ft')} on this line · the other {formatQty(Math.max(0, lineFt - totalFt), 'ft')} is picked automatically</>}
      </p>
      {lineFt === null && <Banner kind="info">Enter the line's quantity first.</Banner>}
      {over && <Banner kind="error">The chosen lengths add up to more than the line's quantity.</Banner>}
      {tooLong.length > 0 && (
        <Banner kind="warn">
          {tooLong.map((c) => c.b!.bundle_no).join(', ')}: the length is more than the bundle has. The sale will be refused unless you shorten it.
        </Banner>
      )}
      <div className="form-actions modal-actions">
        <button type="button" className="btn btn-primary" onClick={apply} disabled={invalid || over || lineFt === null}>
          Use these bundles
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onApply([])}>
          Pick automatically
        </button>
      </div>
    </Modal>
  );
}

export default BundlePicker;
