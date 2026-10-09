"use client";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
} from "motion/react";
import { X, LoaderCircle } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="logo">
      <svg aria-hidden="true" viewBox="0 0 48 48" width="40" height="40">
        <rect x="1" y="1" width="46" height="46" rx="12" fill="currentColor" />
        <path
          d="M13 12v24h10M25 12v16c0 11 11 11 11 0V12"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 40h31"
          stroke="white"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      </svg>
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
