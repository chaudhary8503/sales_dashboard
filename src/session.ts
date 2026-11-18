import type { Business, Item, Location, SalesSettings } from './api';
import type { SessionUser } from './auth';
import { MODULE } from './config';

/** Everything a page needs about who is signed in and the shared lists. */
export interface Session {
  user: SessionUser;
  /** True if the owner, or the box is ticked. Hiding UI only; the database enforces. */
  can: (permission: string) => boolean;
  /** Active items (with invoice_name, units, specs). */
  items: Item[];
  /** Active locations. */
  locations: Location[];
  businesses: Business[];
  /** The person's own feet / metres setting for showing lengths (entry defaults to feet). */
  lengthUnit: 'ft' | 'm';
  /** False until Customer Management goes live: walk-in cash sales only. */
  customersLive: boolean;
  settings: SalesSettings;
  /** Business date from the server (Asia/Karachi). */
  today: string;
  /** Reloads items, locations and settings. */
  reload: () => Promise<void>;
}

export function makeCan(user: SessionUser): (permission: string) => boolean {
  return (permission) =>
    user.isOwner || user.permissions.some((p) => p.module === MODULE && p.permission_key === permission);
}

export function itemById(session: Session, id: string | null | undefined): Item | undefined {
  return id ? session.items.find((i) => i.item_id === id) : undefined;
}

export function locationName(session: Session, id: string | null | undefined): string {
  return session.locations.find((l) => l.location_id === id)?.name ?? '—';
}

/** Is the business behind this location sales-tax registered? (None is today.) */
export function locationTaxRegistered(session: Session, locationId: string | null | undefined): boolean {
  const loc = session.locations.find((l) => l.location_id === locationId);
  return Boolean(loc && session.businesses.find((b) => b.id === loc.business_id)?.tax_registered);
}
