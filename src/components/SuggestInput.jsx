import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';

export default function SuggestInput({ value, onChange, suggestions = [], onSelect, className, ...props }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const q = (value || '').toLowerCase();
  const matches = suggestions
    .filter((s) => s.label.toLowerCase().includes(q) && s.label.toLowerCase() !== q)
    .slice(0, 6);

  return (
    <div ref={ref} className="relative">
      <Input
        value={value || ''}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className={className}
        autoComplete="off"
        {...props}
      />
      {open && matches.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
          {matches.map((s) => (
            <button
              type="button"
              key={s.label}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
              onMouseDown={(e) => { e.preventDefault(); onChange(s.label); onSelect?.(s); setOpen(false); }}
            >
              <span className="font-medium">{s.label}</span>
              {s.sub && <span className="block text-xs text-muted-foreground truncate">{s.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}