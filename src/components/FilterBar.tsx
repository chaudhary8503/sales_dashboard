import { DEPARTMENTS, LOCATIONS } from '../mockData';
import './FilterBar.css';

export interface Filters {
  from: string;
  to: string;
  /** 'All' or a Department. */
  department: string;
  /** 'All' or a location name. */
  location: string;
}

interface FilterBarProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

function FilterBar({ filters, onChange }: FilterBarProps) {
  const set = (key: keyof Filters) => (e: { target: { value: string } }) =>
    onChange({ ...filters, [key]: e.target.value });

  return (
    <form className="card filter-bar" onSubmit={(e) => e.preventDefault()}>
      <div className="filter-row">
        <div className="field">
          <label htmlFor="filter-from">From</label>
          <input id="filter-from" type="date" value={filters.from} max={filters.to} onChange={set('from')} />
        </div>
        <div className="field">
          <label htmlFor="filter-to">To</label>
          <input id="filter-to" type="date" value={filters.to} min={filters.from} onChange={set('to')} />
        </div>
        <div className="field">
          <label htmlFor="filter-department">Department</label>
          <select id="filter-department" value={filters.department} onChange={set('department')}>
            <option value="All">All</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-location">Location</label>
          <select id="filter-location" value={filters.location} onChange={set('location')}>
            <option value="All">All</option>
            {LOCATIONS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
    </form>
  );
}

export default FilterBar;
