import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { fetchAddressSuggestions } from '@/lib/addressSearch';

export default function AddressAutocomplete({ value, onChange, placeholder, id, prefillHint }) {
  const [suggestions, setSuggestions] = useState([]);
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

  const search = (query) => {
    clearTimeout(debounceRef.current);
    if (query.length < 3) { setSuggestions([]); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await fetchAddressSuggestions(query);
        setSuggestions(results);
        setShowDropdown(results.length > 0);
      } catch {
        setSuggestions([]);
        setShowDropdown(false);
      }
    }, 300);
  };

  const handleChange = (e) => {
    onChange(e.target.value);
    search(e.target.value);
  };

  const handleFocus = async () => {
    if (suggestions.length > 0) { setShowDropdown(true); return; }
    if (!value && prefillHint) {
      try {
        const results = await fetchAddressSuggestions(prefillHint);
        setSuggestions(results);
        setShowDropdown(results.length > 0);
      } catch { /* ignore */ }
    }
  };

  const handleSelect = (s) => {
    onChange(s.address);
    setSuggestions([]);
    setShowDropdown(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        value={value || ''}
        onChange={handleChange}
        onFocus={handleFocus}
        placeholder={placeholder}
        autoComplete="off"
      />
      {showDropdown && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-border rounded-md shadow-lg mt-1 max-h-52 overflow-y-auto text-sm">
          {suggestions.map((s, i) => (
            <li
              key={i}
              onMouseDown={() => handleSelect(s)}
              className="px-3 py-2 cursor-pointer hover:bg-muted"
              title={s.full}
            >
              {s.name ? (
                <>
                  <span className="font-medium">{s.name}</span>
                  <span className="block text-xs text-muted-foreground truncate">{s.address}</span>
                </>
              ) : (
                <span className="block truncate">{s.address}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}