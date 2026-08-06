import { useState } from 'react';

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

export interface UseSortReturn extends SortState {
  toggle: (key: string) => void;
}

export function useSort(): UseSortReturn {
  const [sort, setSort] = useState<SortState>({ key: '', dir: 'asc' });
  const toggle = (key: string) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };
  return { ...sort, toggle };
}

export function applySort<T>(
  rows: T[],
  sort: SortState,
  accessors: Record<string, (row: T) => unknown>
): T[] {
  if (!sort.key) return rows;
  const getVal = accessors[sort.key];
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = getVal ? getVal(a) : (a as Record<string, unknown>)[sort.key];
    const bv = getVal ? getVal(b) : (b as Record<string, unknown>)[sort.key];
    if (av === bv) return 0;
    if (av === null || av === undefined || av === '') return 1;
    if (bv === null || bv === undefined || bv === '') return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
  });
}