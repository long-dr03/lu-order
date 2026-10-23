"use client";
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type InstallPrompt = Event & { prompt: () => Promise<unknown> };

/**
 * Offers to put the site on the home screen, where it opens without the browser's bars.
 * Chrome and Edge hand us a prompt; Safari on iPhone has none, so there we say where to tap.
 */
const DISMISSED_KEY = "luuta-install-dismissed";
/** After "not now", stay quiet this long; the offer is still under Thêm. */
const QUIET_DAYS = 14;

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY) || 0);
    return Date.now() - at < QUIET_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export function InstallApp({ toast = false }: { toast?: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (installed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable in the browser
    if (toast && recentlyDismissed()) setHidden(true);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    setIos(/iPhone|iPad|iPod/.test(navigator.userAgent));
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [toast]);
  const install = () => {
    void prompt?.prompt();
    setPrompt(null);
  };
  if (toast) {
    if (hidden || (!prompt && !ios)) return null;
    return (
      <div className="install-toast" role="status">
        <Download size={20} aria-hidden="true" />
        <p>
          <strong>Dùng LUUTA như ứng dụng</strong>
          <span>
            {prompt
              ? "Mở toàn màn hình, không còn thanh trình duyệt."
              : "Bấm Chia sẻ, chọn Thêm vào Màn hình chính."}
          </span>
        </p>
        {prompt && (
          <button type="button" className="action" onClick={install}>
            Cài
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label="Để sau"
          onClick={() => {
            try {
              localStorage.setItem(DISMISSED_KEY, String(Date.now()));
            } catch {}
            setHidden(true);
          }}
        >
          <X size={18} />
        </button>
      </div>
    );
  }
  if (prompt)
    return (
      <button type="button" className="install-app" onClick={install}>
        <Download size={20} />
        Cài LUUTA ra màn hình chính
      </button>
    );
  if (ios)
    return (
      <p className="install-app-hint">
        Mở như ứng dụng: bấm <strong>Chia sẻ</strong> trong Safari, chọn{" "}
        <strong>Thêm vào Màn hình chính</strong>.
      </p>
    );
  return null;
}
