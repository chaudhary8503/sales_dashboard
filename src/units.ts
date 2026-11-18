import type { Item, UnitOption } from './api';
import { formatQty, FT_PER_M } from './format';

/**
 * Units offered when entering an amount: the base unit, metres for anything
 * kept in feet, then the item's own units (coil, bag...). The server converts
 * (sales._factor), so the entered quantity and unit are sent as they are.
 */
export function unitOptions(item: Item | undefined): UnitOption[] {
  if (!item) return [];
  const list = [...item.units];
  if (item.base_unit === 'ft' && !list.some((u) => u.unit === 'm')) list.splice(1, 0, { unit: 'm', factor_to_base: FT_PER_M });
  return list;
}

/**
 * The unit an entry starts in. Client decision: sales are entered in the
 * item's base unit, so feet for cable, whatever the person's display setting.
 */
export function defaultUnit(item: Item | undefined): string {
  return item?.base_unit ?? '';
}

export function unitFactor(item: Item | undefined, unit: string): number {
  return unitOptions(item).find((u) => u.unit === unit)?.factor_to_base ?? 1;
}

/** Converts an entered amount in `unit` to the item's base unit (3 decimals). */
export function toBase(item: Item | undefined, amount: string | number, unit: string): number | null {
  if (!item || String(amount).trim() === '') return null;
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * unitFactor(item, unit) * 1000) / 1000;
}

/** Base units back to `unit` (3 decimals), e.g. 600 ft -> 2 coil. */
export function fromBase(item: Item | undefined, base: number, unit: string): number {
  return Math.round((base / unitFactor(item, unit)) * 1000) / 1000;
}

/** "2 coil = 600 ft" (in the person's unit) when another unit than the base is used, else "". */
export function conversionHint(item: Item | undefined, amount: string, unit: string): string {
  if (!item || unit === item.base_unit || amount.trim() === '') return '';
  const base = toBase(item, amount, unit);
  return base === null ? '' : `${amount} ${unit} = ${formatQty(base, item.base_unit)}`;
}

/** Coil length in feet, when the item has a coil unit. */
export function coilFt(item: Item | undefined): number | null {
  return item?.units.find((u) => u.unit.toLowerCase() === 'coil')?.factor_to_base ?? null;
}
