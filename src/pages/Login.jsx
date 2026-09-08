import { useState } from "react";
import { supabase } from "../supabaseClient";
import { COLOR, FONT_IMPORT, wrap, inputStyle, btnPrimary, labelStyle } from "../components/ui";

export default function Login() {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    setInfo("");
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(error.message === "Invalid login credentials" ? "E-Mail oder Passwort ist falsch." : error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) {
        setError(error.message);
      } else if (!data.session) {
        setInfo("Fast geschafft! Bitte bestätige deine E-Mail-Adresse über den Link, den wir dir geschickt haben, und melde dich danach an.");
      }
    }
    setLoading(false);
  };

  return (
    <div style={{ ...wrap, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <style>{FONT_IMPORT}</style>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 34 }}>🐴</div>
        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 700, color: COLOR.ink, margin: "6px 0 2px" }}>EQUIO</h1>
        <div style={{ color: COLOR.inkSoft, fontSize: 14 }}>Der Ponyplaner · Die Eichenponys</div>
      </div>

      <div style={{ maxWidth: 300, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <button onClick={() => { setMode("login"); setError(""); setInfo(""); }} style={{
            flex: 1, padding: "8px 0", borderRadius: 9, border: `1px solid ${COLOR.line}`, cursor: "pointer", fontSize: 13, fontWeight: 700,
            background: mode === "login" ? COLOR.ink : "#fff", color: mode === "login" ? "#fff" : COLOR.inkSoft,
          }}>Anmelden</button>
          <button onClick={() => { setMode("signup"); setError(""); setInfo(""); }} style={{
            flex: 1, padding: "8px 0", borderRadius: 9, border: `1px solid ${COLOR.line}`, cursor: "pointer", fontSize: 13, fontWeight: 700,
            background: mode === "signup" ? COLOR.ink : "#fff", color: mode === "signup" ? "#fff" : COLOR.inkSoft,
          }}>Registrieren</button>
        </div>

        <label style={labelStyle}>E-Mail-Adresse</label>
        <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="du@beispiel.de" />
        <label style={labelStyle}>Passwort</label>
        <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "mind. 6 Zeichen" : "••••••••"} />

        {error && <div style={{ color: COLOR.dringend, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        {info && <div style={{ color: COLOR.erledigt, fontSize: 12.5, marginBottom: 10 }}>{info}</div>}

        <button onClick={submit} disabled={loading || !email.trim() || !password} style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: loading || !email.trim() || !password ? 0.5 : 1 }}>
          {loading ? "Einen Moment …" : mode === "login" ? "Anmelden" : "Konto erstellen"}
        </button>
      </div>
    </div>
  );
}
