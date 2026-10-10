"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  ImageOff,
  Plus,
  Upload,
  X,
  ZoomIn,
} from "lucide-react";
import { Modal, ErrorNotice, Field } from "./Primitives";
import type { SessionInfo } from "@/lib/permissions";
import type { OrderPhoto } from "@/lib/types";
/** Server limit for one uploaded photo. Larger files are compressed in the browser first. */
export const PRODUCT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PRODUCT_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** Largest original we are willing to decode in the browser before compressing. */
const PRODUCT_PHOTO_INPUT_MAX_BYTES = 30 * 1024 * 1024;
/** Returns the file unchanged when it already fits; otherwise re-encodes it as JPEG under 5 MB. */
export async function fitProductPhoto(file: File): Promise<File> {
  if (
    file.size <= PRODUCT_PHOTO_MAX_BYTES &&
    PRODUCT_PHOTO_TYPES.includes(file.type)
  )
    return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap)
    throw new Error("Không đọc được ảnh. Chọn ảnh JPG, PNG hoặc WebP khác.");
  try {
    let scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 8; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) break;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.9, 0.8, 0.7, 0.6]) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
        if (blob && blob.size <= PRODUCT_PHOTO_MAX_BYTES)
          return new File(
            [blob],
            `${file.name.replace(/\.[^.]+$/, "") || "anh"}.jpg`,
            { type: "image/jpeg" },
          );
      }
      scale *= 0.8;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("Không nén được ảnh xuống dưới 5 MB. Hãy chọn ảnh khác.");
}
export async function uploadProductImage(
  file: File,
  session: SessionInfo,
  lineId?: number,
): Promise<string> {
  const form = new FormData();
  form.set("file", await fitProductPhoto(file));
  void lineId; // Old callers may still supply the deprecated argument.
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
      {/* Mounted only while open: every product photo used to create its own dialog up front. */}
      {open && (
        <Modal
          open
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
      )}
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
    if (candidate.size > PRODUCT_PHOTO_INPUT_MAX_BYTES) {
      setError("Ảnh quá lớn. Chọn ảnh dưới 30 MB.");
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
            Kéo ảnh vào đây hoặc chọn từ thiết bị. JPG, PNG, WebP · ảnh trên 5
            MB sẽ được nén tự động.
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
/** Uploads a PDF/Excel/Word file attached to a preparation check. */
export async function uploadCheckFile(
  file: File,
  session: SessionInfo,
): Promise<{ url: string; name: string; size: number }> {
  const form = new FormData();
  form.set("file", file);
  const response = await fetch("/api/preparation-files", {
    method: "POST",
    headers: { "x-csrf-token": session.csrf },
    body: form,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Không thể tải file lên.");
  return result.data;
}
export type PhotoDraft = {
  key: string;
  color: string;
  /** Already saved on the server. */
  url?: string;
  /** Picked on this device, compressed and not uploaded yet. */
  file?: File;
  preview: string;
  note?: string;
};
/** Uploads new photos and returns the list the server stores for the order. */
export async function resolvePhotos(
  photos: PhotoDraft[],
  session: SessionInfo,
): Promise<{ image_url: string; color: string }[]> {
  const result: { image_url: string; color: string }[] = [];
  for (const photo of photos) {
    const image_url =
      photo.url ||
      (photo.file ? await uploadProductImage(photo.file, session) : "");
    if (image_url) result.push({ image_url, color: photo.color });
  }
  return result;
}
export function photoDraftsFrom(
  photos: OrderPhoto[] | undefined,
  fallbackUrl?: string | null,
): PhotoDraft[] {
  const list = photos?.length
    ? photos
    : fallbackUrl
      ? [{ id: 0, image_url: fallbackUrl, color: "", position: 0 }]
      : [];
  return list.map((p) => ({
    key: `saved-${p.image_url}`,
    color: p.color,
    url: p.image_url,
    preview: p.image_url,
  }));
}
export function ProductPhotosField({
  photos,
  onChange,
  colors,
  max = 12,
}: {
  photos: PhotoDraft[];
  onChange: (photos: PhotoDraft[]) => void;
  colors: string[];
  max?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const names = Array.from(
    new Set(colors.map((c) => c.trim()).filter(Boolean)),
  );
  async function add(files: FileList | null) {
    setError("");
    const chosen = Array.from(files || []).slice(0, max - photos.length);
    if (!chosen.length) return;
    setBusy(true);
    const added: PhotoDraft[] = [];
    try {
      for (const file of chosen) {
        if (!PRODUCT_PHOTO_TYPES.includes(file.type)) {
          setError("Chọn ảnh JPG, PNG hoặc WebP.");
          continue;
        }
        if (file.size > PRODUCT_PHOTO_INPUT_MAX_BYTES) {
          setError("Có ảnh quá lớn (trên 30 MB) nên chưa được thêm.");
          continue;
        }
        const fitted = await fitProductPhoto(file);
        const note =
          file.size > PRODUCT_PHOTO_MAX_BYTES
            ? `Đã nén ${(file.size / 1048576).toFixed(1)} MB → ${(fitted.size / 1048576).toFixed(1)} MB`
            : undefined;
        added.push({
          key: crypto.randomUUID(),
          color: "",
          file: fitted,
          preview: URL.createObjectURL(fitted),
          note,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thêm được ảnh.");
    } finally {
      setBusy(false);
      if (added.length) onChange([...photos, ...added]);
    }
  }
  return (
    <div className="stack image-field">
      <span className="field-label">
        Ảnh mẫu <span className="muted">(không bắt buộc, tối đa {max})</span>
      </span>
      <div className="photo-grid">
        {photos.map((photo, index) => (
          <div className="photo-item" key={photo.key}>
            <Image
              src={photo.preview}
              alt={`Ảnh mẫu ${index + 1}`}
              width={160}
              height={200}
              unoptimized
              className="photo-item-image"
            />
            <Field label="Màu">
              <select
                value={photo.color}
                onChange={(e) =>
                  onChange(
                    photos.map((p) =>
                      p.key === photo.key ? { ...p, color: e.target.value } : p,
                    ),
                  )
                }
              >
                <option value="">Ảnh chung</option>
                {names.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                {photo.color && !names.includes(photo.color) && (
                  <option value={photo.color}>{photo.color}</option>
                )}
              </select>
            </Field>
            {photo.note && (
              <span className="muted photo-note">{photo.note}</span>
            )}
            <button
              type="button"
              className="action secondary"
              onClick={() => {
                if (photo.file) URL.revokeObjectURL(photo.preview);
                onChange(photos.filter((p) => p.key !== photo.key));
              }}
            >
              <X size={16} />
              Bỏ ảnh
            </button>
          </div>
        ))}
        {photos.length < max && (
          <button
            type="button"
            className="photo-add"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Plus size={22} />
            {busy ? "Đang nén ảnh…" : "Thêm ảnh"}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        aria-label="Chọn ảnh mẫu"
        className="image-file-input"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }}
      />
      <ErrorNotice error={error} />
    </div>
  );
}
/** One photo at a time, full width, with arrows (and swipe) to move between photos. */
export function ProductPhotoGallery({
  photos,
  fallbackUrl,
  name,
}: {
  photos?: OrderPhoto[];
  fallbackUrl?: string | null;
  name: string;
}) {
  const list = photoDraftsFrom(photos, fallbackUrl);
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | null>(null);
  if (!list.length) return <ProductPhoto name={name} large />;
  const current = Math.min(index, list.length - 1);
  const photo = list[current];
  const many = list.length > 1;
  const go = (step: number) =>
    setIndex((current + step + list.length) % list.length);
  return (
    <figure
      className="photo-carousel"
      onKeyDown={(e) => {
        if (!many) return;
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "ArrowRight") go(1);
      }}
      onTouchStart={(e) => {
        touchStart.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!many || start === null) return;
        const dx = e.changedTouches[0].clientX - start;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      }}
    >
      <ProductPhoto
        key={photo.key}
        url={photo.url}
        name={photo.color ? `${name} · ${photo.color}` : name}
      />
      {many && (
        <>
          <button
            type="button"
            className="photo-carousel-nav prev"
            aria-label="Ảnh trước"
            onClick={() => go(-1)}
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            className="photo-carousel-nav next"
            aria-label="Ảnh sau"
            onClick={() => go(1)}
          >
            <ChevronRight size={22} />
          </button>
        </>
      )}
      <figcaption>
        {photo.color || "Ảnh chung"}
        {many && ` · ${current + 1}/${list.length}`}
      </figcaption>
    </figure>
  );
}
