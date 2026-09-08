'use client'

import { useEffect, useRef, useState } from 'react'
import { QUESTION_FEATURES } from '@/lib/questionFeatures'

export function FeatureFilterDropdown({
  selected,
  onChange,
}: {
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs font-medium text-gray-500 mb-1">Question Features</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full border rounded-md px-2 py-1.5 text-sm text-left bg-white flex items-center justify-between gap-1"
      >
        <span className={selected.size === 0 ? 'text-gray-400' : ''}>
          {selected.size === 0 ? 'Any' : `${selected.size} selected`}
        </span>
        <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full min-w-[220px] bg-white border rounded-md shadow-md py-1">
          {QUESTION_FEATURES.map((f) => (
            <label key={f.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} />
              {f.label}
            </label>
          ))}
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:underline border-t mt-1 pt-1.5"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
