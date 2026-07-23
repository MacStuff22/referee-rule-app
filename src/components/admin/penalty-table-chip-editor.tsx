'use client'

// ============================================================
// Situation/Question text editor with a draggable "Penalty Table" chip
//
// Plain <textarea> can't color part of its text or protect a substring
// from being partially edited, so this uses a `contenteditable` div
// instead. The penalty table marker (see @/lib/penaltyTable) renders as
// a blue, non-editable chip: the browser treats a `contenteditable="false"`
// child as one atomic unit for cursor movement and deletion (this is the
// same pattern mention-chips use in Slack/Notion/Linear), so the admin can
// never end up with a half-broken marker.
//
// Repositioning is click-to-pick-up / click-to-drop rather than native
// HTML5 drag-and-drop -- native DnD inside contenteditable is notoriously
// inconsistent across engines (especially Safari). Plain click handlers +
// the standard Range/Selection APIs are far more reliable.
//
// The DOM is kept intentionally flat (text nodes + chip spans, direct
// children of the container only) so serialization never has to walk a
// variable, browser-dependent nested structure. Enter and paste are
// intercepted for this reason: browsers differ on what element Enter
// creates (<div>, <p>, <br>), and `execCommand` (the "standard" shortcut
// for handling this) was tested and found to silently drop the newline
// in at least one engine -- so both are handled with plain Range.insertNode
// instead, which is standard and consistent everywhere.
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { PENALTY_TABLE_MARKER } from '@/lib/penaltyTable'

function insertTextAtCaret(text: string) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.setEndAfter(node)
  sel.removeAllRanges()
  sel.addRange(range)
}

function createChip(): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  chip.dataset.penaltyChip = 'true'
  chip.textContent = 'Penalty Table'
  chip.className =
    'inline-flex items-center px-2 py-0.5 mx-0.5 rounded-md bg-blue-100 text-blue-700 border border-blue-300 text-xs font-semibold cursor-pointer select-none align-middle'
  return chip
}

function buildFromValue(container: HTMLDivElement, value: string) {
  container.innerHTML = ''
  const parts = value.split(PENALTY_TABLE_MARKER)
  parts.forEach((part, i) => {
    if (part) container.appendChild(document.createTextNode(part))
    if (i < parts.length - 1) container.appendChild(createChip())
  })
}

function serialize(container: HTMLDivElement): string {
  let out = ''
  container.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? ''
    else if (node instanceof HTMLElement && node.dataset.penaltyChip === 'true') out += PENALTY_TABLE_MARKER
  })
  return out
}

function caretRangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  if (doc.caretRangeFromPoint) return doc.caretRangeFromPoint(x, y)
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y)
    if (!pos) return null
    const range = document.createRange()
    range.setStart(pos.offsetNode, pos.offset)
    range.collapse(true)
    return range
  }
  return null
}

export function PenaltyTableChipEditor({
  value,
  onChange,
  placeholder,
  minHeight,
}: {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  minHeight?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastEmittedRef = useRef<string>(value)
  const pickedChipRef = useRef<HTMLSpanElement | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  // Rebuild the DOM only when `value` changed for a reason other than this
  // component's own onChange call (typing/moving the chip shouldn't blow
  // away the live DOM and cursor position).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (value === lastEmittedRef.current) return
    buildFromValue(el, value)
    lastEmittedRef.current = value
  }, [value])

  // Initial mount.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    buildFromValue(el, value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function emit() {
    const el = containerRef.current
    if (!el) return
    const next = serialize(el)
    lastEmittedRef.current = next
    onChange(next)
  }

  function clearPicked() {
    pickedChipRef.current?.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-1')
    pickedChipRef.current = null
    setHint(null)
  }

  function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    const chip = target.closest('[data-penalty-chip="true"]') as HTMLSpanElement | null

    if (chip) {
      if (pickedChipRef.current === chip) {
        clearPicked()
        return
      }
      clearPicked()
      pickedChipRef.current = chip
      chip.classList.add('ring-2', 'ring-blue-500', 'ring-offset-1')
      setHint('Click where you’d like the table to appear.')
      return
    }

    if (!pickedChipRef.current) return
    const range = caretRangeFromPoint(e.clientX, e.clientY)
    if (!range) return
    const el = containerRef.current
    if (!el) return

    const chipToMove = pickedChipRef.current
    chipToMove.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-1')
    chipToMove.remove()
    range.insertNode(chipToMove)
    pickedChipRef.current = null
    setHint(null)
    emit()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      insertTextAtCaret('\n')
      emit()
      return
    }
    if (e.key === 'Escape' && pickedChipRef.current) {
      clearPicked()
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain').replace(/\r\n/g, '\n')
    insertTextAtCaret(text)
    emit()
  }

  return (
    <div className="space-y-1">
      <div
        ref={containerRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onClick={handleContainerClick}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        style={{ minHeight: minHeight ? `${minHeight}px` : undefined, whiteSpace: 'pre-wrap' }}
        className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 leading-5 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
      />
      {hint && <p className="text-[11px] text-blue-600">{hint}</p>}
    </div>
  )
}
