import { useEffect, useState } from "react";
import { HashRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Home, ListChecks, CalendarDays, Wallet } from "lucide-react";
import { supabase } from "./supabaseClient";
import { COLOR, FONT_IMPORT, wrap, inputStyle, btnPrimary } from "./components/ui";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Aufgaben from "./pages/Aufgaben";
import Kalender from "./pages/Kalender";
import Pferde from "./pages/Pferde";
import Finanzen from "./pages/Finanzen";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = lädt noch, null = kein Login
  const [profile, setProfile] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (session === null) { setProfile(null); return; }
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      setProfile(data ?? null);
    })();
  }, [session]);

  if (session === undefined || (session && profile === undefined)) {
    return (
      <div style={{ ...wrap, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{FONT_IMPORT}</style>
        <span style={{ color: COLOR.inkSoft }}>EQUIO wird geladen …</span>
      </div>
    );
  }

  if (!session) return <Login />;
  if (!profile) return <ProfileSetup userId={session.user.id} onDone={setProfile} />;

  return (
    <HashRouter>
      <MainApp profile={profile} />
    </HashRouter>
  );
}

function ProfileSetup({ userId, onDone }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from("profiles").insert({ id: userId, name: name.trim() }).select().single();
    setSaving(false);
    if (!error) onDone(data);
  };
  return (
    <div style={{ ...wrap, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <style>{FONT_IMPORT}</style>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 34 }}>🐴</div>
        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 700, color: COLOR.ink }}>Willkommen bei EQUIO!</h1>
        <div style={{ color: COLOR.inkSoft, fontSize: 14 }}>Wie sollen wir dich nennen?</div>
      </div>
      <div style={{ maxWidth: 280, margin: "0 auto", width: "100%" }}>
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Dein Name" />
        <button onClick={save} disabled={saving || !name.trim()} style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: saving || !name.trim() ? 0.5 : 1 }}>
          {saving ? "Speichern …" : "Loslegen"}
        </button>
      </div>
    </div>
  );
}

function MainApp({ profile }) {
  return (
    <div style={{ ...wrap, paddingBottom: 84 }}>
      <style>{FONT_IMPORT}</style>
      <Header name={profile.name} />
      <Routes>
        <Route path="/" element={<Dashboard user={profile.name} />} />
        <Route path="/aufgaben" element={<Aufgaben user={profile.name} />} />
        <Route path="/kalender" element={<Kalender user={profile.name} />} />
        <Route path="/pferde" element={<Pferde user={profile.name} />} />
        <Route path="/finanzen" element={<Finanzen user={profile.name} />} />
      </Routes>
      <BottomNav />
    </div>
  );
}

function Header({ name }) {
  const hour = new Date().getHours();
  const greet = hour < 11 ? "Guten Morgen" : hour < 18 ? "Hallo" : "Guten Abend";
  const signOut = () => supabase.auth.signOut();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 0 4px" }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 0.3, color: COLOR.inkSoft }}>EQUIO · Die Eichenponys</div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 21, fontWeight: 600, color: COLOR.ink }}>{greet}, {name} 👋</div>
      </div>
      <button onClick={signOut} title="Abmelden" style={{
        width: 36, height: 36, borderRadius: "50%", background: COLOR.ink, color: "#fff", border: "none",
        fontFamily: "Fraunces, serif", fontWeight: 600, cursor: "pointer",
      }}>{name[0]}</button>
    </div>
  );
}

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const items = [
    { path: "/", label: "Start", icon: Home },
    { path: "/aufgaben", label: "Aufgaben", icon: ListChecks },
    { path: "/kalender", label: "Kalender", icon: CalendarDays },
    { path: "/pferde", label: "Pferde", icon: null, emoji: "🐴" },
    { path: "/finanzen", label: "Finanzen", icon: Wallet },
  ];
  return (
    <div style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480,
      background: "#fff", borderTop: `1px solid ${COLOR.line}`, display: "flex", padding: "8px 6px calc(8px + env(safe-area-inset-bottom))",
    }}>
      {items.map((it) => {
        const active = location.pathname === it.path;
        return (
          <button key={it.path} onClick={() => navigate(it.path)} style={{
            flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column",
            alignItems: "center", gap: 3, color: active ? COLOR.accent : COLOR.inkSoft, padding: "4px 0",
          }}>
            {it.icon ? <it.icon size={20} strokeWidth={active ? 2.4 : 2} /> : <span style={{ fontSize: 18, lineHeight: "20px" }}>{it.emoji}</span>}
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
