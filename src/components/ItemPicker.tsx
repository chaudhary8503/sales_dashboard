import { useId, useMemo, useRef, useState } from 'react';
import type { Category, Item } from '../api';
import { CATEGORY_LABELS } from '../format';
import './ItemPicker.css';

interface ItemPickerProps {
  items: Item[];
  value: string;
  onChange: (itemId: string) => void;
  categories: Category[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}

/** The text an item is found by: invoice name, staff name, code and every spec value. */
function haystack(i: Item): string {
  const specs = Object.values(i.specs ?? {})
    .filter((v) => typeof v === 'string')
    .join(' ');
  return `${i.invoice_name ?? ''} ${i.name} ${i.code ?? ''} ${specs}`.toLowerCase();
}

/** Searchable product picker: every typed word must appear, in any order ("2.5 3 core"). */
function ItemPicker({ items, value, onChange, categories, placeholder, id, disabled }: ItemPickerProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = items.find((i) => i.item_id === value);
  const label = (i: Item) => i.invoice_name || i.name;

  const indexed = useMemo(() => items.map((i) => ({ item: i, hay: haystack(i) })), [items]);
  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return indexed
      .filter(({ item }) => item.active && item.category !== 'consumable' && categories.includes(item.category))
      .filter(({ hay }) => words.every((w) => hay.includes(w)))
      .slice(0, 60)
      .map(({ item }) => item);
  }, [indexed, query, categories]);

  const choose = (item: Item) => {
    onChange(item.item_id);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="item-picker">
      <input
        id={id}
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        disabled={disabled}
        placeholder={selected ? label(selected) : (placeholder ?? 'Search by name, size, cores…')}
        value={open ? query : selected ? label(selected) : ''}
        onFocus={() => {
          setOpen(true);
          setCursor(0);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setCursor(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === 'Enter' && open && matches[cursor]) {
            e.preventDefault();
            choose(matches[cursor]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {selected && selected.invoice_name && selected.invoice_name !== selected.name && (
        <div className="item-picker-staff">{selected.name}</div>
      )}
      {open && (
        <ul className="item-picker-list" id={listId} role="listbox">
          {matches.length === 0 && <li className="item-picker-empty">No matching items</li>}
          {matches.map((item, i) => (
            <li
              key={item.item_id}
              role="option"
              aria-selected={item.item_id === value}
              className={i === cursor ? 'cursor' : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(item);
              }}
            >
              <span className="item-picker-main">{label(item)}</span>
              <span className="sub">
                {item.invoice_name && item.invoice_name !== item.name ? `${item.name} · ` : ''}
                {CATEGORY_LABELS[item.category]} · {item.base_unit}
                {item.code ? ` · ${item.code}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ItemPicker;
