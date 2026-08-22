import { useState, useEffect, useRef, useMemo } from 'react'

const TAB_DEFS = [
  { key: 'dashboard', icon: '📈', label: 'Dashboard' },
  { key: 'orders', icon: '📦', label: 'Orders' },
  { key: 'inventory', icon: '🏭', label: 'Inventory' },
  { key: 'stock', icon: '🗃️', label: 'Stock' },
  { key: 'logistics', icon: '🚚', label: 'Logistics' },
  { key: 'dispatch', icon: '📤', label: 'Dispatch' },
  { key: 'reports', icon: '📋', label: 'Reports' },
  { key: 'rto', icon: '↩️', label: 'RTO' },
  { key: 'finance', icon: '💰', label: 'Finance' },
  { key: 'performance', icon: '🔬', label: 'Performance' },
  { key: 'settings', icon: '⚙️', label: 'Settings' },
]

export function CommandPalette({ open, onClose, onSelectTab, data = [], onOpenPO }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const items = useMemo(() => {
    const query = q.trim().toLowerCase()
    const tabItems = TAB_DEFS
      .filter(t => !query || t.label.toLowerCase().includes(query) || t.key.includes(query))
      .map(t => ({ type: 'tab', key: t.key, icon: t.icon, label: t.label, meta: 'Tab' }))
    const poItems = []
    if (query) {
      const seen = new Set()
      for (const r of data) {
        const po = r['PO Number']
        if (!po || seen.has(po)) continue
        if (String(po).toLowerCase().includes(query)) {
          seen.add(po)
          poItems.push({ type: 'po', key: po, icon: '🔎', label: po, meta: r['City'] || r['Platform'] || 'PO' })
          if (poItems.length >= 8) break
        }
      }
    }
    return [...tabItems, ...poItems]
  }, [q, data])

  useEffect(() => { setActive(0) }, [q])

  const choose = (item) => {
    if (!item) return
    if (item.type === 'tab') onSelectTab(item.key)
    else if (item.type === 'po') onOpenPO(item.key)
    onClose()
  }

  const onKey = (e) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(items[active]) }
  }

  if (!open) return null

  return (
    <>
      <div className="cmdk-overlay" onClick={onClose} />
      <div className="cmdk" role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder="Search tabs or PO number…"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={onKey}
          aria-label="Search"
        />
        <div className="cmdk-list">
          {items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>No matches</div>
          ) : (
            <>
              {items.some(i => i.type === 'tab') && <div className="cmdk-section-label">Navigate</div>}
              {items.map((it, i) => (
                <div
                  key={it.type + it.key}
                  className={`cmdk-item ${i === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(it)}
                  role="option"
                  aria-selected={i === active}
                >
                  <span className="cmdk-icon">{it.icon}</span>
                  <span>{it.label}</span>
                  <span className="cmdk-meta">{it.meta}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  )
}
