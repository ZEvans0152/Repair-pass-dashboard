import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { fetchAddressSuggestions } from '@/lib/addressSearch';

export default function DealershipAutocomplete({ id, value, onChange, onSelect, placeholder, savedSuggestions = [] }) {
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const savedMatches = value
    ? savedSuggestions.filter((s) => s.label.toLowerCase().includes(value.toLowerCase())).slice(0, 3)
    : [];

  const handleChange = (e) => {
    const q = e.target.value;
    onChange(q);
    clearTimeout(debounceRef.current);
    if (q.trim().length < 3) { setResults([]); setShowDropdown(false); return; }
    setShowDropdown(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const found = await fetchAddressSuggestions(q);
        setResults(found);
        setShowDropdown(true);
      } catch {
        setResults([]);
      }
    }, 300);
  };

  const hasItems = savedMatches.length > 0 || results.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        value={value || ''}
        onChange={handleChange}
        onFocus={() => hasItems && setShowDropdown(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {showDropdown && hasItems && (
        <ul className="absolute z-50 w-full bg-white border border-border rounded-md shadow-lg mt-1 max-h-56 overflow-y-auto text-sm">
          {savedMatches.map((s, i) => (
            <li
              key={`saved-${i}`}
              onMouseDown={() => { onSelect({ name: s.label, address: s.data?.address || '' }); setShowDropdown(false); }}
              className="px-3 py-2 cursor-pointer hover:bg-muted"
            >
              <span className="font-medium">{s.label}</span>
              <span className="block text-xs text-muted-foreground truncate">
                {s.data?.address || 'Previously used'}
              </span>
            </li>
          ))}
          {results.map((s, i) => (
            <li
              key={`mb-${i}`}
              onMouseDown={() => { onSelect({ name: s.name || s.address, address: s.address }); setShowDropdown(false); }}
              className="px-3 py-2 cursor-pointer hover:bg-muted flex items-center justify-between gap-2"
              title={s.full}
            >
              <div className="min-w-0">
                {s.name ? (
                  <>
                    <span className="font-medium">{s.name}</span>
                    <span className="block text-xs text-muted-foreground truncate">{s.address}</span>
                  </>
                ) : (
                  <span className="block truncate">{s.address}</span>
                )}
              </div>
              {value && value.trim() && value.trim().toLowerCase() !== (s.name || '').toLowerCase() && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onSelect({ name: value.trim(), address: s.address });
                    setShowDropdown(false);
                  }}
                  className="shrink-0 text-xs text-primary underline underline-offset-2 whitespace-nowrap"
                >
                  Use address only
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}