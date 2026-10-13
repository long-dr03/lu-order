"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type InstallPrompt = Event & { prompt: () => Promise<unknown> };

/**
 * Offers to put the site on the home screen, where it opens without the browser's bars.
 * Chrome and Edge hand us a prompt; Safari on iPhone has none, so there we say where to tap.
 */
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (installed) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the device is only known in the browser
    setIos(/iPhone|iPad|iPod/.test(navigator.userAgent));
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (prompt)
    return (
      <button
        type="button"
        className="install-app"
        onClick={() => {
          void prompt.prompt();
          setPrompt(null);
        }}
      >
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
