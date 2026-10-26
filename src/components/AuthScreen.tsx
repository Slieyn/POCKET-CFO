"use client";

import { useState, type FormEvent, type PointerEvent } from "react";
import { BrandMark } from "./BrandMark";
import { Icon } from "./icons";

type AuthMode = "login" | "register";

export function AuthScreen({
  busy,
  error,
  onLogin,
  onRegister,
  onDemo,
}: {
  busy: boolean;
  error: string;
  onLogin: (input: { email: string; password: string }) => Promise<void>;
  onRegister: (input: {
    name: string;
    businessName: string;
    email: string;
    password: string;
    includeSampleData: boolean;
  }) => Promise<void>;
  onDemo: () => Promise<void>;
}) {
  const [mode, setMode] = useState<AuthMode>("register");
  const [showPassword, setShowPassword] = useState(false);
  const [includeSample, setIncludeSample] = useState(true);
  const [pending, setPending] = useState<"login" | "register" | "demo" | null>(null);

  const isBusy = busy || pending !== null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(mode);
    try {
      if (mode === "login") {
        await onLogin({
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
        });
      } else {
        await onRegister({
          name: String(data.get("name") ?? ""),
          businessName: String(data.get("businessName") ?? ""),
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
          includeSampleData: includeSample,
        });
      }
    } finally {
      setPending(null);
    }
  }

  async function handleDemo() {
    setPending("demo");
    try {
      await onDemo();
    } finally {
      setPending(null);
    }
  }

  function trackPointer(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--auth-pointer-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--auth-pointer-y", `${event.clientY - rect.top}px`);
  }

  return (
    <main className="auth-shell">
      <section
        className="auth-brand"
        aria-label="About POCKET CFO"
        onPointerMove={trackPointer}
      >
        <span className="auth-spotlight" aria-hidden="true" />
        <span className="auth-aurora auth-aurora-a" aria-hidden="true" />
        <span className="auth-aurora auth-aurora-b" aria-hidden="true" />

        <div className="auth-brand-top">
          <BrandMark size={64} animated className="auth-logo-mark" />
          <div className="auth-lockup">
            <span className="brand-word auth-wordmark">POCKET <strong>CFO</strong></span>
            <span className="brand-tagline">Know your numbers. Grow your business.</span>
          </div>
          <span className="auth-live-badge">
            <span className="live-dot" aria-hidden="true" />
            Private workspace
          </span>
        </div>

        <div className="auth-brand-content">
          <span className="eyebrow eyebrow-light">Your business, in your pocket</span>
          <h1>Know your money.<br />Grow with confidence.</h1>
          <p>
            POCKET CFO turns everyday transactions, quotes and customer records into a clear plan
            for cash flow, owner pay and funding readiness.
          </p>
          <ul className="auth-benefits">
            <li className="auth-benefit">
              <span className="auth-benefit-icon"><Icon name="wallet" size={18} /></span>
              <span><strong>One clear cash picture</strong><small>Revenue, expenses and owner draws in a single view.</small></span>
            </li>
            <li className="auth-benefit">
              <span className="auth-benefit-icon"><Icon name="deals" size={18} /></span>
              <span><strong>Quotes and invoices that look professional</strong><small>Create, track and email documents in seconds.</small></span>
            </li>
            <li className="auth-benefit">
              <span className="auth-benefit-icon"><Icon name="shield" size={18} /></span>
              <span><strong>Records lenders can follow</strong><small>An audit trail and readiness checklist, built in.</small></span>
            </li>
          </ul>
          <div className="auth-trust">
            <span><Icon name="lock" size={14} /> Private by default</span>
            <span><Icon name="bank" size={14} /> Built for ZAR</span>
            <span><Icon name="sparkles" size={14} /> No spreadsheets</span>
          </div>
        </div>

        <p className="auth-disclaimer">
          POCKET CFO is a record-keeping and planning tool, not a bank, lender or credit provider.
          Readiness guidance is an estimate from your own records.
        </p>
      </section>

      <section className="auth-panel" aria-labelledby="auth-heading">
        <div className="auth-panel-content">
          <div className="auth-mobile-brand">
            <BrandMark size={44} animated />
            <span className="brand-word">POCKET <strong>CFO</strong></span>
          </div>

          <div className="auth-mode" role="tablist" aria-label="Account access">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={mode === "register" ? "active" : ""}
              onClick={() => setMode("register")}
              disabled={isBusy}
            >
              Create account
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "active" : ""}
              onClick={() => setMode("login")}
              disabled={isBusy}
            >
              Sign in
            </button>
          </div>

          <div className="auth-heading">
            <span className="eyebrow">{mode === "register" ? "Get started free" : "Welcome back"}</span>
            <h2 id="auth-heading">{mode === "register" ? "Create your workspace" : "Sign in to POCKET CFO"}</h2>
            <p>
              {mode === "register"
                ? "A few details and your business has a home for its money story."
                : "Continue where you left off."}
            </p>
          </div>

          <form className="form auth-form" onSubmit={handleSubmit} aria-busy={isBusy} noValidate>
            {mode === "register" && (
              <>
                <label>
                  Your name
                  <input name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="e.g. Thandi Mokoena" />
                </label>
                <label>
                  Business name
                  <input name="businessName" autoComplete="organization" required minLength={2} maxLength={120} placeholder="e.g. Thandi's Fresh Produce" />
                </label>
              </>
            )}

            <label>
              Email address
              <input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@business.co.za" />
            </label>

            <label>
              Password
              <span className="password-field">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  required
                  minLength={12}
                  maxLength={128}
                  placeholder={mode === "register" ? "At least 12 characters" : "Your password"}
                  aria-describedby={mode === "register" ? "password-hint" : undefined}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <Icon name={showPassword ? "eyeOff" : "eye"} size={18} />
                </button>
              </span>
              {mode === "register" && (
                <small id="password-hint" className="field-hint">12+ characters, including a letter and a number.</small>
              )}
            </label>

            {mode === "register" && (
              <label className="sample-data-option">
                <input
                  type="checkbox"
                  checked={includeSample}
                  onChange={(event) => setIncludeSample(event.target.checked)}
                />
                <span>
                  <strong>Add sample data</strong>
                  <small>Explore with labelled example transactions, customers and deals. You can delete them later.</small>
                </span>
              </label>
            )}

            <button className="button primary auth-submit" disabled={isBusy}>
              {pending === mode && <span className="spinner spinner-light" aria-hidden="true" />}
              {pending === mode
                ? mode === "register" ? "Creating your workspace…" : "Signing you in…"
                : mode === "register" ? "Create secure account" : "Sign in"}
            </button>
          </form>

          <div className="auth-divider"><span>or</span></div>

          <button className="button secondary demo-button" type="button" onClick={handleDemo} disabled={isBusy}>
            {pending === "demo" ? <span className="spinner" aria-hidden="true" /> : <Icon name="sparkles" size={18} />}
            {pending === "demo" ? "Opening demo workspace…" : "Explore a demo workspace"}
            <small>No sign-up · sample business included</small>
          </button>

          {error && <p className="alert error" role="alert">{error}</p>}

          <p className="auth-legal">
            By continuing you agree to keep your password safe. POCKET CFO never asks for your bank login.
            <span>Your records stay private to your workspace.</span>
          </p>
        </div>
      </section>
    </main>
  );
}
