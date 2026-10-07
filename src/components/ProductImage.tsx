"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, ImageOff, Upload, X, ZoomIn } from "lucide-react";
import { Modal, ErrorNotice } from "./Primitives";
import type { SessionInfo } from "@/lib/permissions";
export async function uploadProductImage(
  file: File,
  session: SessionInfo,
  lineId: number,
): Promise<string> {
  const form = new FormData();
  form.set("file", file);
  form.set("line_id", String(lineId));
  const response = await fetch("/api/product-images", {
    method: "POST",
    headers: { "x-csrf-token": session.csrf },
    body: form,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Không thể tải ảnh sản phẩm.");
  return result.data.url;
}
export function ProductPhoto({
  url,
  name,
  large = false,
  interactive = true,
}: {
  url?: string | null;
  name: string;
  large?: boolean;
  interactive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const content = url ? (
    <Image src={url} alt={`Ảnh ${name}`} width={420} height={560} unoptimized />
  ) : (
    <span className="photo-placeholder">
      <ImageOff size={large ? 30 : 22} />
      {large && <span>Chưa có ảnh sản phẩm</span>}
    </span>
  );
  return (
    <>
      {url && interactive ? (
        <button
          type="button"
          className={`product-photo ${large ? "large" : ""}`}
          aria-label={`Xem ảnh ${name}`}
          onClick={() => setOpen(true)}
        >
          {content}
          <ZoomIn size={16} className="photo-zoom" />
        </button>
      ) : (
        <span className={`product-photo ${large ? "large" : ""}`}>
          {content}
        </span>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={name}
        description="Ảnh mẫu sản phẩm"
        wide
      >
        {url && (
          <Image
            src={url}
            alt={`Ảnh ${name}`}
            width={1400}
            height={1400}
            unoptimized
            className="product-photo-full"
          />
        )}
      </Modal>
    </>
  );
}
export function ProductImagePicker({
  existing,
  file,
  onFile,
  onRemove,
  label = "Ảnh sản phẩm",
  prompt = "Thêm ảnh để nhận diện mẫu",
}: {
  existing?: string | null;
  file: File | null;
  onFile: (file: File) => void;
  onRemove: () => void;
  label?: string;
  prompt?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
  function select(candidate?: File) {
    setError("");
    if (!candidate) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(candidate.type)) {
      setError("Chọn ảnh JPG, PNG hoặc WebP.");
      return;
    }
    if (candidate.size > 5 * 1024 * 1024) {
      setError("Ảnh tối đa 5 MB.");
      return;
    }
    setPreview(URL.createObjectURL(candidate));
    onFile(candidate);
  }
  const url = file ? preview : existing;
  return (
    <div className="stack image-field">
      <span className="field-label">
        {label} <span className="muted">(không bắt buộc)</span>
      </span>
      <div
        className={`image-picker ${dragging ? "drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          select(e.dataTransfer.files[0]);
        }}
      >
        {url ? (
          <Image
            src={url}
            alt={`${label} đã chọn`}
            width={120}
            height={160}
            unoptimized
            className="image-picker-preview"
          />
        ) : (
          <ImagePlus size={36} />
        )}
        <div className="stack image-picker-content">
          <strong>{url ? `${label} đã chọn` : prompt}</strong>
          <span className="muted">
            Kéo ảnh vào đây hoặc chọn từ thiết bị. JPG, PNG, WebP · tối đa 5 MB.
          </span>
          <div className="inline-actions">
            <button
              type="button"
              className="action secondary"
              onClick={() => input.current?.click()}
            >
              <Upload size={18} />
              {url ? "Thay ảnh" : "Chọn ảnh"}
            </button>
            {url && (
              <button
                type="button"
                className="action secondary"
                onClick={() => {
                  onRemove();
                  if (input.current) input.current.value = "";
                }}
              >
                <X size={18} />
                Bỏ ảnh
              </button>
            )}
          </div>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label={`Chọn ${label.toLowerCase()}`}
          className="image-file-input"
          onChange={(e) => {
            select(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <ErrorNotice error={error} />
    </div>
  );
}
