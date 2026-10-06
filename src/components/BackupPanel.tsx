"use client";
import { useEffect, useState, useCallback } from "react";
import { type Api, message } from "@/lib/client";
import type { BackupConfig } from "@/lib/server/backup";
import { Action, Field, ErrorNotice } from "./Primitives";
import { Download, DatabaseBackup } from "lucide-react";
type Data = { config: BackupConfig; files: { name: string; bytes: number }[] };
export function BackupPanel({ api }: { api: Api }) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    try {
      setData(await api<Data>("/api/admin/backups"));
    } catch (e) {
      setError(message(e));
    }
  }, [api]);
  useEffect(() => {
    let mounted = true;
    void api<Data>("/api/admin/backups")
      .then((value) => {
        if (mounted) setData(value);
      })
      .catch((e) => {
        if (mounted) setError(message(e));
      });
    return () => {
      mounted = false;
    };
  }, [api]);
  async function save(input: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/admin/backups", input);
      await refresh();
      setNotice("Đã hoàn tất.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel padded stack">
      <h2>Sao lưu và lưu trữ</h2>
      <ErrorNotice error={error} />
      <p className="muted">
        Bản SQLite chứa toàn bộ dữ liệu để khôi phục, bao gồm ảnh và tài khoản.
        File JSON nén chứa nghiệp vụ trong số ngày gần nhất đã chọn, kèm đơn
        liên quan và ảnh; số lượng giao hàng là số lũy kế tại thời điểm sao lưu.
        Lưu tại thư mục backups cạnh database.
      </p>
      {data && (
        <>
          <form
            className="stack"
            key={JSON.stringify(data.config)}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void save({
                enabled: f.get("enabled") === "on",
                intervalHours: Number(f.get("interval")),
                windowDays: Number(f.get("days")),
              });
            }}
          >
            <label>
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={data.config.enabled}
              />{" "}
              Bật lịch sao lưu tự động
            </label>
            <div className="form-grid">
              <Field label="Chu kỳ (giờ)">
                <input
                  name="interval"
                  type="number"
                  min={1}
                  max={8760}
                  defaultValue={data.config.intervalHours}
                  required
                />
              </Field>
              <Field label="Lưu trữ nghiệp vụ trong (ngày gần nhất)">
                <input
                  name="days"
                  type="number"
                  min={1}
                  max={3650}
                  defaultValue={data.config.windowDays}
                  required
                />
              </Field>
            </div>
            <p className="muted">
              Lịch chạy khi server local đang hoạt động, kiểm tra mỗi phút. Nếu
              tắt máy qua hạn, ứng dụng sao lưu khi mở lại. Trình duyệt không tự
              tải file; dùng nút tải bên dưới để lưu sang thiết bị khác.
            </p>
            <Action busy={busy}>Lưu lịch</Action>
          </form>
          <div>
            Lần gần nhất:{" "}
            {data.config.lastAt
              ? new Date(data.config.lastAt).toLocaleString("vi-VN")
              : "Chưa có"}{" "}
            · Lần tiếp theo:{" "}
            {data.config.enabled
              ? new Date(data.config.nextAt).toLocaleString("vi-VN")
              : "Đã tắt"}
          </div>
          <ErrorNotice error={data.config.lastError || ""} />
          <Action
            type="button"
            busy={busy}
            onClick={() => void save({ action: "run" })}
          >
            <DatabaseBackup size={18} /> Sao lưu ngay
          </Action>
          <p role="status">{notice}</p>
          <h3>Bản sao đã lưu</h3>
          {data.files.map((f) => (
            <div className="backup-file" key={f.name}>
              <span>
                {f.name}
                <small>
                  {" "}
                  ·{" "}
                  {(f.bytes / 1024).toLocaleString("vi-VN", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  KB
                </small>
              </span>
              <a
                className="action secondary"
                href={`/api/admin/backups?file=${encodeURIComponent(f.name)}`}
              >
                <Download size={18} /> Tải file
              </a>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
