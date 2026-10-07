"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
export function Pagination({
  page,
  total,
  pageSize = 25,
  onChange,
}: {
  page: number;
  total: number;
  pageSize?: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="panel-toolbar pagination-controls" aria-label="Phân trang">
      <span className="pagination-range">
        {total ? (page - 1) * pageSize + 1 : 0}–
        {Math.min(page * pageSize, total)} / {total}
      </span>
      <div className="inline-actions pagination-buttons">
        <button
          type="button"
          className="action secondary"
          aria-label="Trang trước"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={18} aria-hidden="true" />
          Trước
        </button>
        <span
          className="pagination-current"
          aria-live="polite"
          aria-atomic="true"
        >
          Trang {page}/{pages}
        </span>
        <button
          type="button"
          className="action secondary"
          aria-label="Trang sau"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Sau
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
