"use client";
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
  return (
    <nav className="panel-toolbar" aria-label="Phân trang">
      <span>
        {total ? (page - 1) * pageSize + 1 : 0}–
        {Math.min(page * pageSize, total)} / {total}
      </span>
      <div className="inline-actions">
        <button
          className="action secondary"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Trước
        </button>
        <span>
          Trang {page}/{pages}
        </span>
        <button
          className="action secondary"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Sau
        </button>
      </div>
    </nav>
  );
}
