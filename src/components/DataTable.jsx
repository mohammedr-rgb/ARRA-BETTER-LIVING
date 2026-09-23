import { useState, useMemo, useEffect } from 'react'
import { useSort, applySort } from '../lib/useSort'
import { csvEscape, csvNum, downloadCSV, downloadXLSX } from '../lib/utils'
import { EmptyState } from './ui'

const controlStyle = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#f1f5f9',
  padding: '7px 10px',
  fontSize: 13,
}

const pageBtn = (active) => ({
  background: active ? '#3b82f6' : '#1e293b',
  border: '1px solid ' + (active ? '#3b82f6' : '#334155'),
  borderRadius: 8,
  color: active ? '#fff' : '#94a3b8',
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  minWidth: 32,
})

export function DataTable({ columns, rows, pageSize = 10, filename, onRowClick, emptyMessage, initialPageSize }) {
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(initialPageSize || pageSize)
  const sort = useSort()

  const accessors = useMemo(() => {
    const map = {}
    columns.forEach(c => { map[c.key] = c.accessor || (r => r[c.key]) })
    return map
  }, [columns])

  const filtered = rows;

  const sorted = useMemo(() => applySort(filtered, sort, accessors), [filtered, sort, accessors])

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage))
  useEffect(() => { if (page >= totalPages) setPage(0) }, [totalPages, page])
  useEffect(() => { setPage(0) }, [perPage, rows.length])

  const pageRows = sorted.slice(page * perPage, page * perPage + perPage)

  const doExport = () => {
    if (!filename || !sorted.length) return
    const lines = []
    lines.push(columns.map(c => csvEscape(c.label)).join(','))
    sorted.forEach(r => {
      lines.push(columns.map(c => {
        const v = accessors[c.key](r)
        return csvEscape(c.align === 'right' ? csvNum(v) : String(v ?? ''))
      }).join(','))
    })
    downloadCSV(lines, filename)
  }

  const doExportXLSX = () => {
    if (!filename || !sorted.length) return
    const xlsxName = filename.replace(/\.csv$/i, '.xlsx')
    const aoa = [columns.map(c => c.label)]
    sorted.forEach(r => {
      aoa.push(columns.map(c => {
        const v = accessors[c.key](r)
        return c.align === 'right' ? Number(csvNum(v) || 0) : String(v ?? '')
      }))
    })
    downloadXLSX(aoa, xlsxName, 'Data')
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>{sorted.length} row{sorted.length === 1 ? '' : 's'}</span>
        <span style={{ flex: 1 }} />
        <select value={perPage} onChange={e => setPerPage(Number(e.target.value))} style={{ ...controlStyle, cursor: 'pointer' }}>
          {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} per page</option>)}
        </select>
        {filename && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={doExport} style={{ background: '#22c55e', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              ⬇ CSV
            </button>
            <button onClick={doExportXLSX} style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#3b82f6', padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              ⬇ XLSX
            </button>
          </div>
        )}
      </div>

      <div className="table-scroll">
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              {columns.map(c => {
                const active = sort.key === c.key
                return (
                  <th
                    key={c.key}
                    onClick={() => sort.toggle(c.key)}
                    style={{ textAlign: c.align || 'left', padding: '12px 10px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #334155', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                  >
                    {c.label} <span style={{ marginLeft: 2, fontSize: 9, color: active ? '#3b82f6' : '#475569' }}>{active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={columns.length}><EmptyState message={emptyMessage} /></td></tr>
            ) : pageRows.map((r, i) => (
              <tr
                key={i}
                onClick={() => onRowClick && onRowClick(r)}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map(c => {
                  const numeric = c.align === 'right'
                  return (
                    <td key={c.key} style={{ padding: '12px 10px', fontSize: 13, borderBottom: '1px solid #1e293b', textAlign: c.align || 'left', whiteSpace: 'nowrap', fontVariantNumeric: numeric ? 'tabular-nums' : undefined, ...(numeric ? {} : { maxWidth: c.maxWidth || 280, overflow: 'hidden', textOverflow: 'ellipsis' }) }}>
                      {c.render ? c.render(r, i) : String(accessors[c.key](r) ?? '—')}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ ...pageBtn(false), opacity: page === 0 ? 0.4 : 1 }}>←</button>
          {Array.from({ length: totalPages }).slice(0, 8).map((_, i) => (
            <button key={i} onClick={() => setPage(i)} style={pageBtn(page === i)}>{i + 1}</button>
          ))}
          {totalPages > 8 && <span style={{ fontSize: 12, color: '#64748b' }}>… {totalPages}</span>}
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ ...pageBtn(false), opacity: page >= totalPages - 1 ? 0.4 : 1 }}>→</button>
        </div>
      )}
    </div>
  )
}
