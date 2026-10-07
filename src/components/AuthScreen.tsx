"use client";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Action, Field, Logo, ErrorNotice } from "./Primitives";
import { type Api, message } from "@/lib/client";
export function AuthScreen({
  api,
  onLogin,
}: {
  api: Api;
  onLogin: () => Promise<void>;
}) {
  const [register, setRegister] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const input = {
        username: String(form.get("username")),
        password: String(form.get("password")),
        ...(register ? { name: String(form.get("name")) } : {}),
      };
      const result = await api<{ message?: string }>(
        `/api/auth/${register ? "register" : "login"}`,
        input,
      );
      if (register) {
        setNotice(result.message || "Tài khoản đang chờ duyệt.");
        setRegister(false);
      } else await onLogin();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-intro">
        <Logo />
        <div>
          <span className="eyebrow">LUUTA GARMENT</span>
          <h1>
            Từ đơn hàng
            <br />
            đến thành phẩm.
          </h1>
          <p>
            Một không gian để điều phối chuyền may, kiểm soát chất lượng và theo
            dõi tiền công.
          </p>
          <div className="auth-pills">
            <span>5 chuyền may</span>
            <span>11 công đoạn</span>
            <span>Quyền theo vai trò</span>
          </div>
        </div>
        <p className="muted">
          <ShieldCheck size={18} /> Truy cập dữ liệu theo vai trò và chuyền được
          giao.
        </p>
      </section>
      <section className="auth-form">
        <div className="auth-card">
          <Logo compact />
          <h2>{register ? "Tạo tài khoản" : "Chào mừng trở lại"}</h2>
          <p className="muted">
            {register
              ? "Đăng ký và chờ admin gán vai trò, chuyền làm việc."
              : "Đăng nhập để tiếp tục công việc của bạn."}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit(new FormData(event.currentTarget));
            }}
            className="stack"
          >
            <ErrorNotice error={error} />
            {notice && (
              <div className="success-notice" role="status">
                {notice}
              </div>
            )}
            {register && (
              <Field label="Họ và tên">
                <input
                  name="name"
                  required
                  maxLength={160}
                  autoComplete="name"
                />
              </Field>
            )}
            <Field
              label="Tên đăng nhập"
              hint="3–40 ký tự: chữ, số, dấu chấm, gạch ngang hoặc gạch dưới."
            >
              <input
                name="username"
                required
                minLength={3}
                maxLength={40}
                pattern="[a-zA-Z0-9_.\-]+"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
            <Field label="Mật khẩu">
              <div className="password-field">
                <input
                  name="password"
                  required
                  type={show ? "text" : "password"}
                  minLength={register ? 10 : 1}
                  maxLength={128}
                  autoComplete={register ? "new-password" : "current-password"}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </Field>
            <Action type="submit" busy={busy}>
              {register ? "Đăng ký" : "Đăng nhập"}
              <ArrowRight size={18} />
            </Action>
          </form>
          <button
            className="text-button auth-switch"
            onClick={() => {
              setRegister(!register);
              setError("");
              setNotice("");
            }}
          >
            {register
              ? "Đã có tài khoản? Đăng nhập"
              : "Chưa có tài khoản? Đăng ký"}
          </button>
        </div>
      </section>
    </div>
  );
}
