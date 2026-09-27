import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import airportsData from "../data/airports.json";

export interface Airport {
  code: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  flag: string;
  lat: number;
  lng: number;
  keywords: string[];
}

const airports = airportsData as Airport[];

interface AirportSearchProps {
  selected: Airport | null;
  onSelect: (airport: Airport) => void;
  placeholder?: string;
  id: string;
}

export default function AirportSearch({
  selected,
  onSelect,
  placeholder = "Search airports…",
  id,
}: AirportSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return airports.slice(0, 50);
    return airports
      .filter((a) => {
        const searchFields = [
          a.code.toLowerCase(),
          a.icao.toLowerCase(),
          a.name.toLowerCase(),
          a.city.toLowerCase(),
          a.country.toLowerCase(),
          a.countryCode.toLowerCase(),
          ...a.keywords.map((k) => k.toLowerCase()),
        ];
        return searchFields.some((f) => f.includes(q));
      })
      .slice(0, 100);
  }, [query]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const handleOpen = useCallback(() => {
    setOpen(true);
    setQuery("");
    setActiveIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSelect = useCallback(
    (airport: Airport) => {
      onSelect(airport);
      setOpen(false);
      setQuery("");
    },
    [onSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < filtered.length) {
            handleSelect(filtered[activeIndex]);
          }
          break;
        case "Escape":
          setOpen(false);
          setQuery("");
          break;
      }
    },
    [open, filtered, activeIndex, handleSelect]
  );

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const el = listRef.current.children[activeIndex] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  return (
    <div className="searchContainer" ref={containerRef}>
      <button
        className={`searchTrigger${selected ? "" : " empty"}`}
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`airport-list-${id}`}
      >
        {selected ? (
          <>
            <img className="flag" src={`https://flagcdn.com/w40/${selected.countryCode}.png`} alt={selected.country} loading="lazy" />
            <span className="code">{selected.code}</span>
            <span className="city">{selected.city}</span>
          </>
        ) : (
          <span className="placeholderText">{placeholder}</span>
        )}
      </button>

      {open && <div className="overlay" onClick={() => { setOpen(false); setQuery(""); }} />}

      <div className={`searchPanel${open ? "" : " closed"}`}>
        <input
          ref={inputRef}
          className="searchInput"
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type airport code, city, or country…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`airport-list-${id}`}
        />
        <div
          className="searchResults"
          id={`airport-list-${id}`}
          ref={listRef}
          role="listbox"
        >
          {filtered.length === 0 ? (
            <div className="searchEmpty">No airports found</div>
          ) : (
            filtered.map((airport, i) => {
              const isSelected = selected?.code === airport.code;
              return (
                <div
                  key={airport.code}
                  className={`searchResult${isSelected ? " selected" : ""}${i === activeIndex ? " active" : ""}`}
                  onClick={() => handleSelect(airport)}
                  onMouseEnter={() => setActiveIndex(i)}
                  role="option"
                  aria-selected={isSelected}
                >
                  <img className="resultFlag" src={`https://flagcdn.com/w40/${airport.countryCode}.png`} alt={airport.country} loading="lazy" />
                  <span className="resultCode">{airport.code}</span>
                  <span className="resultName">
                    {airport.name}
                  </span>
                  <span className="resultMeta">
                    {airport.city}, {airport.countryCode}
                  </span>
                  {isSelected && <span className="checkmark">✓</span>}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}