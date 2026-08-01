export function PONumberLink({ row, po, onOpenPO, style }) {
  const value = po || (row && row['PO Number'])
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (onOpenPO) onOpenPO(row || { 'PO Number': value })
      }}
      style={{ fontFamily: 'monospace', fontSize: 12, color: '#60a5fa', textDecoration: 'none', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', ...style }}
    >
      {value}
    </a>
  )
}
