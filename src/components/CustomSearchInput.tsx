"use client"

import { useState, useEffect, useRef } from 'react'
import { searchPlaces, SearchResultPlace } from '@/utils/mapService'
import { MapPin, Navigation } from 'lucide-react'

interface CustomSearchInputProps {
  value: string;
  onChange: (val: string) => void;
  onSelect: (feature: SearchResultPlace) => void;
  placeholder: string;
}

export default function CustomSearchInput({
  value,
  onChange,
  onSelect,
  placeholder,
}: CustomSearchInputProps) {
  const [results, setResults] = useState<SearchResultPlace[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!value || value.trim().length < 2) {
      setResults([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const delayDebounceFn = setTimeout(async () => {
      try {
        const places = await searchPlaces(value)
        setResults(places)
        setIsOpen(places.length > 0)
      } catch (err) {
        console.error('Commercial geocoding lookup failed:', err)
      } finally {
        setIsLoading(false)
      }
    }, 300)

    return () => clearTimeout(delayDebounceFn)
  }, [value])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true)
          }}
          placeholder={placeholder}
          className="w-full p-4 bg-transparent outline-none font-medium placeholder:text-gray-400 dark:placeholder:text-gray-600 text-gray-900 dark:text-gray-100 pr-10"
        />
        {isLoading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full mt-2 left-0 w-full bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-64 overflow-y-auto custom-scrollbar flex flex-col">
          {results.map((place) => (
            <div
              key={place.id}
              className="p-3.5 hover:bg-gray-50 dark:hover:bg-zinc-800/60 cursor-pointer border-b border-gray-100 dark:border-zinc-800/50 last:border-0 flex items-start gap-3 transition-colors"
              onClick={() => {
                onSelect(place)
                setIsOpen(false)
                setResults([])
              }}
            >
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                <MapPin size={16} />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate leading-tight mb-0.5">
                  {place.name}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate leading-tight">
                  {place.display_name}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
