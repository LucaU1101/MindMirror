import { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Auth() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg({ kind: "ok", text: "Account created. If email confirmation is enabled, check your inbox." });
      }
    } catch (err) {
      setMsg({ kind: "err", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          <div className="brand-logo">M</div>
          <div>
            <h1 className="brand-name">MindMirror</h1>
            <p className="brand-tag">Philosophical journaling, tracked over time.</p>
          </div>
        </div>

        <div className="tabs">
          <button
            className={`tab ${mode === "signin" ? "tab-active" : ""}`}
            onClick={() => setMode("signin")}
          >
            Sign in
          </button>
          <button
            className={`tab ${mode === "signup" ? "tab-active" : ""}`}
            onClick={() => setMode("signup")}
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit} className="form">
          <label className="label">
            <span>Email</span>
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="label">
            <span>Password</span>
            <input
              className="input"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </label>

          {msg && <div className={`note note-${msg.kind}`}>{msg.text}</div>}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Please wait..." : mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>
      </div>
    </div>
  );
}
