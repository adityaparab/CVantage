import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
}

export interface SortState {
  sortBy: string;
  order: 'asc' | 'desc';
}

/** Data table with accessible sortable headers (aria-sort + button semantics). */
export function Table<T>({
  columns,
  rows,
  rowKey,
  sort,
  onSort,
  empty,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  sort?: SortState;
  onSort?: (key: string) => void;
  empty?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {columns.map((col) => {
              const sorted = sort?.sortBy === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    sorted ? (sort!.order === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                  className={cn('px-4 py-3 font-semibold text-muted', col.className)}
                >
                  {col.sortable && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key)}
                      className="inline-flex items-center gap-1 hover:text-ink"
                    >
                      {col.header}
                      <span aria-hidden="true" className="text-[0.65rem]">
                        {sorted ? (sort!.order === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-muted">
                {empty ?? 'Nothing here yet.'}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-line/60 last:border-0 hover:bg-canvas-2"
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3', col.className)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
