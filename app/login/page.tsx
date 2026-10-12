"use client";

import { useState } from "react";
import Core from "@/components/Core";

export default function Login() {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code || busy) return;
    setBusy(true);
    setError(false);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      window.location.href = "/";
    } else {
      setBusy(false);
      setError(true);
      setCode("");
    }
  }

  return (
    <main className="login">
      <Core state={busy ? "thinking" : "idle"} label={busy ? "Verifying" : "Locked"} />
      <form onSubmit={submit} className="glass login-card">
        <p className="eyebrow">Identity check</p>
        <h1>Welcome back</h1>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Access code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Access code"
        />
        {error && <p className="login-error">That code didn&apos;t match. Try again.</p>}
        <button type="submit" disabled={!code || busy} className="primary">
          {busy ? "Unlocking" : "Unlock Oscar"}
        </button>
      </form>
    </main>
  );
}
