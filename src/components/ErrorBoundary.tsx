"use client";
import { Component, type ReactNode } from "react";

/**
 * Catches a render error in one part of the screen so the rest of the app keeps working.
 * Reset clears the error and tries to render the children again.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.label}]`, error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="panel padded error-boundary" role="alert">
        <h2>Phần này chưa hiển thị được</h2>
        <p className="muted">
          Dữ liệu vẫn được giữ nguyên. Thử hiển thị lại, hoặc tải lại trang nếu
          lỗi vẫn còn.
        </p>
        <button
          type="button"
          className="action secondary"
          onClick={() => this.setState({ failed: false })}
        >
          Thử lại
        </button>
      </section>
    );
  }
}
