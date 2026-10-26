"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Type-to-search picker. Use this instead of a <select> for any list longer
// than ~10 options. Matches on any word prefix or substring, case-insensitive;
// arrow keys + Enter to pick, Escape to close.

export interface ComboOption {
  id: string;
  label: string;
  sublabel?: string;
}

function matches(opt: ComboOption, q: string): boolean {
  if (!q) return true;
  const hay = `${opt.label} ${opt.sublabel ?? ""}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

export function SearchCombobox({
  value,
  onChange,
  options,
  placeholder = "Search…",
  ariaLabel,
  className,
  inputClassName,
  autoFocus,
  maxResults = 50,
}: {
  value: string;
  onChange: (id: string) => void;
  options: ComboOption[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  maxResults?: number;
}) {
  const selected = options.find((o) => o.id === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  useEffect(() => {
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, []);

  const filtered = options.filter((o) => matches(o, query)).slice(0, maxResults);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function pick(opt: ComboOption) {
    onChange(opt.id);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[active]) { e.preventDefault(); pick(filtered[active]); }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        value={open ? query : selected?.label ?? ""}
        placeholder={open && selected ? selected.label : placeholder}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={onKeyDown}
        className={cn(
          "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-600/30 focus:border-forest-600",
          inputClassName,
        )}
      />
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 w-full min-w-[12rem] bg-white border border-gray-200 rounded-lg max-h-60 overflow-y-auto shadow-lg py-1"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">No matches</li>
          ) : filtered.map((opt, i) => (
            <li
              key={opt.id}
              data-idx={i}
              role="option"
              aria-selected={opt.id === value}
              onMouseDown={(e) => { e.preventDefault(); pick(opt); }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "px-3 py-2 text-sm cursor-pointer",
                i === active ? "bg-forest-50 text-forest-800" : "text-gray-800",
                opt.id === value && "font-semibold",
              )}
            >
              {opt.label}
              {opt.sublabel && <span className="ml-1.5 text-xs text-gray-400">{opt.sublabel}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
