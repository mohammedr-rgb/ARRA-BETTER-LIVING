import { useState } from 'react'

export function useSort() {
  const [sort, setSort] = useState({ key: '', dir: 'asc' })
  const toggle = (key) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }
  return { ...sort, toggle }
}

export function applySort(rows, sort, accessors) {
  if (!sort.key) return rows
  const getVal = accessors[sort.key]
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = getVal ? getVal(a) : a[sort.key]
    const bv = getVal ? getVal(b) : b[sort.key]
    if (av === bv) return 0
    if (av === null || av === undefined || av === '') return 1
    if (bv === null || bv === undefined || bv === '') return -1
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir
  })
}
