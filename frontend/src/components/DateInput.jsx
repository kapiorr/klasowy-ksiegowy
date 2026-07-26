import { useState, useEffect, useRef } from 'react';

const MONTHS = [
  'Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec',
  'Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'
];

function daysInMonth(m, y) {
  if (!m || !y) return 31;
  return new Date(y, m, 0).getDate();
}

export default function DateInput({ value, onChange, required = false }) {
  const parse = (v) => {
    if (!v) return { d: '', m: '', y: '' };
    const [yr, mo, dy] = v.split('-');
    return { d: parseInt(dy) || '', m: parseInt(mo) || '', y: parseInt(yr) || '' };
  };

  const [parts, setParts] = useState(() => parse(value));
  const [openField, setOpenField] = useState(null); // 'd' | 'm' | 'y' | null
  const ref = useRef();

  useEffect(() => { setParts(parse(value)); }, [value]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpenField(null); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const update = (newParts) => {
    setParts(newParts);
    const { d, m, y } = newParts;
    if (d && m && y && String(y).length === 4) {
      const dd = String(d).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      onChange(`${y}-${mm}-${dd}`);
    } else if (!d && !m && !y) {
      onChange('');
    }
  };

  const maxDays = daysInMonth(parts.m, parts.y);
  const days = Array.from({ length: maxDays }, (_, i) => i + 1);
  const months = MONTHS.map((n, i) => ({ val: i + 1, label: n }));
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 2 + i);

  const baseCls = "relative flex-1 border border-sage-200 dark:border-gray-600 rounded-xl px-3 py-2.5 font-body text-sm text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none cursor-pointer text-center select-none hover:border-sage-400 transition-colors";

  const Dropdown = ({ items, selected, onSelect, labelFn = (x) => x }) => (
    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-sage-200 dark:border-gray-600 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto min-w-full">
      {items.map(item => {
        const val = item?.val ?? item;
        const label = labelFn(item);
        return (
          <div key={val}
            onClick={() => { onSelect(val); setOpenField(null); }}
            className={`px-4 py-2 font-body text-sm cursor-pointer hover:bg-sage-50 dark:hover:bg-gray-700 ${selected === val ? 'bg-sage-100 dark:bg-gray-600 font-600 text-sage-700 dark:text-sage-300' : 'text-ink dark:text-gray-100'}`}>
            {label}
          </div>
        );
      })}
    </div>
  );

  return (
    <div ref={ref} className="flex items-center gap-1.5">
      {/* Dzień */}
      <div className="relative" style={{ minWidth: '3.5rem' }}>
        <div className={baseCls} onClick={() => setOpenField(openField === 'd' ? null : 'd')}>
          {parts.d ? String(parts.d).padStart(2, '0') : <span className="text-sage-300">DD</span>}
        </div>
        {openField === 'd' && (
          <Dropdown items={days} selected={parts.d}
            onSelect={d => update({ ...parts, d })} />
        )}
      </div>

      <span className="text-sage-400 font-body">/</span>

      {/* Miesiąc */}
      <div className="relative" style={{ minWidth: '7rem' }}>
        <div className={baseCls} onClick={() => setOpenField(openField === 'm' ? null : 'm')}>
          {parts.m ? MONTHS[parts.m - 1] : <span className="text-sage-300">Miesiąc</span>}
        </div>
        {openField === 'm' && (
          <Dropdown items={months} selected={parts.m}
            onSelect={m => update({ ...parts, m })}
            labelFn={item => item.label} />
        )}
      </div>

      <span className="text-sage-400 font-body">/</span>

      {/* Rok */}
      <div className="relative" style={{ minWidth: '4.5rem' }}>
        <div className={baseCls} onClick={() => setOpenField(openField === 'y' ? null : 'y')}>
          {parts.y || <span className="text-sage-300">RRRR</span>}
        </div>
        {openField === 'y' && (
          <Dropdown items={years} selected={parts.y}
            onSelect={y => update({ ...parts, y })} />
        )}
      </div>

      {value && (
        <button type="button" onClick={() => { setParts({ d: '', m: '', y: '' }); onChange(''); }}
          className="text-sage-300 hover:text-rose-400 text-sm ml-1">✕</button>
      )}
    </div>
  );
}
