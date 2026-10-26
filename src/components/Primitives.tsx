"use client";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
} from "motion/react";
import { X, LoaderCircle } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
/** The brand mark (diamond over the LU monogram), with the name beside it unless compact. */
export function Logo({
  compact = false,
  full = false,
}: {
  compact?: boolean;
  /** The whole brand logo with the Luuta wordmark, for the sign-in screen. */
  full?: boolean;
}) {
  if (full)
    return (
      <div className="logo logo-full">
        <Image
          src="/brand/luuta-logo.png"
          alt="Luuta"
          width={395}
          height={480}
          priority
          unoptimized
        />
      </div>
    );
  return (
    <div className="logo">
      <Image
        src="/brand/luuta-mark.png"
        alt={compact ? "Luuta" : ""}
        width={113}
        height={160}
        className="logo-mark"
        priority
        unoptimized
      />
      {!compact && (
        <div>
          <strong>LUUTA</strong>
          <span>Quản lý xưởng may</span>
        </div>
      )}
    </div>
  );
}
export function Action({
  children,
  busy = false,
  tone = "primary",
  className,
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & {
  children?: ReactNode;
  busy?: boolean;
  tone?: "primary" | "secondary" | "danger";
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.button
      {...props}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      className={`action ${tone} ${className || ""}`}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy && <LoaderCircle size={18} className="spin" />}
      {children}
    </motion.button>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
  medium = false,
  drawer = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  medium?: boolean;
  drawer?: boolean;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const descriptionId = useId();
  const reduceMotion = useReducedMotion();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              forceMount
              asChild
              // Controls the dialog places beside itself (the order detail's side tabs) belong to it:
              // pressing or focusing them must not count as leaving the dialog.
              onInteractOutside={(event) => {
                const target = event.target as Element | null;
                if (target?.closest?.("[data-dialog-side]"))
                  event.preventDefault();
              }}
              onOpenAutoFocus={() => {
                returnFocus.current =
                  document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
              }}
              onCloseAutoFocus={(event) => {
                if (returnFocus.current?.isConnected) {
                  event.preventDefault();
                  returnFocus.current.focus();
                }
              }}
            >
              <motion.div
                className={`modal-content ${wide ? "wide" : ""} ${medium ? "medium" : ""} ${drawer ? "navigation-drawer" : ""}`}
                initial={
                  reduceMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: 12, scale: 0.98 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 8, scale: 0.98 }
                }
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
                aria-describedby={description ? descriptionId : undefined}
              >
                <div className="modal-heading">
                  <div>
                    <Dialog.Title>{title}</Dialog.Title>
                    {description && (
                      <Dialog.Description id={descriptionId}>
                        {description}
                      </Dialog.Description>
                    )}
                  </div>
                  <Dialog.Close
                    className="icon-button"
                    aria-label="Đóng hộp thoại"
                  >
                    <X size={20} />
                  </Dialog.Close>
                </div>
                <div className="modal-body">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`field ${className || ""}`.trim()}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function ErrorNotice({ error }: { error: string }) {
  return error ? (
    <div className="error-notice" role="alert">
      {error}
    </div>
  ) : null;
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
