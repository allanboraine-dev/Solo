"use client"

import { useState, useEffect, useRef } from 'react'

interface CustomSearchInputProps {
  value: string;
  onChange: (val: string) => void;
  onSelect: (feature: any) => void;
  placeholder: string;
}

export default function CustomSearchInput({
  value,
  onChange,
  onSelect,
  placeholder
}: CustomSearchInputProps) {
  const [results, setResults] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value || value.length < 3) {
      setResults([]);
      return;
    }
    const delayDebounceFn = setTimeout(() => {
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&countrycodes=za&addressdetails=1&limit=5`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setResults(data);
            setIsOpen(true);
          }
        })
        .catch(err => console.error("Geocoding error", err));
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (results.length > 0) setIsOpen(true);
        }}
        placeholder={placeholder}
        className="w-full p-4 bg-transparent outline-none font-medium placeholder:text-gray-400 dark:placeholder:text-gray-600 text-gray-900 dark:text-gray-100"
      />
      
      {isOpen && results.length > 0 && (
        <div className="absolute top-full mt-2 left-0 w-full bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-64 overflow-y-auto custom-scrollbar flex flex-col">
          {results.map((feature: any) => (
            <div 
              key={feature.place_id}
              className="p-4 hover:bg-gray-50 dark:hover:bg-zinc-800/50 cursor-pointer border-b border-gray-50 dark:border-zinc-800/50 last:border-0 flex flex-col transition-colors"
              onClick={() => {
                onSelect(feature);
                setIsOpen(false);
                setResults([]);
              }}
            >
              <span className="font-bold text-[15px] text-gray-900 dark:text-gray-100 leading-tight mb-1">{feature.name || feature.display_name.split(',')[0]}</span>
              <span className="text-[13px] text-gray-500 dark:text-gray-400 leading-tight">{feature.display_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
