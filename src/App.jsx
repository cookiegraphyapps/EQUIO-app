import { useEffect, useState } from "react";
import { HashRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Home, ListChecks, CalendarDays, Wallet, Settings, Trash2 } from "lucide-react";
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
      <Header profile={profile} />
      <Routes>
        <Route path="/" element={<Dashboard user={profile.name} />} />
        <Route path="/aufgaben" element={<Aufgaben user={profile.name} isAdmin={profile.is_admin} />} />
        <Route path="/kalender" element={<Kalender user={profile.name} />} />
        <Route path="/pferde" element={<Pferde user={profile.name} isAdmin={profile.is_admin} />} />
        <Route path="/finanzen" element={<Finanzen user={profile.name} isAdmin={profile.is_admin} />} />
      </Routes>
      <BottomNav />
    </div>
  );
}

function Header({ profile }) {
  const { name, is_admin } = profile;
  const hour = new Date().getHours();
  const greet = hour < 11 ? "Guten Morgen" : hour < 18 ? "Hallo" : "Guten Abend";
  const signOut = () => supabase.auth.signOut();
  const [showAdmin, setShowAdmin] = useState(false);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 0 4px" }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 0.3, color: COLOR.inkSoft }}>EQUIO · Die Eichenponys</div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 21, fontWeight: 600, color: COLOR.ink }}>{greet}, {name} 👋</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {is_admin && (
          <button onClick={() => setShowAdmin(true)} title="Verwaltung" style={{
            width: 36, height: 36, borderRadius: "50%", background: "#fff", border: `1px solid ${COLOR.line}`,
            color: COLOR.inkSoft, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}><Settings size={16} /></button>
        )}
        <button onClick={signOut} title="Abmelden" style={{
          width: 36, height: 36, borderRadius: "50%", background: COLOR.ink, color: "#fff", border: "none",
          fontFamily: "Fraunces, serif", fontWeight: 600, cursor: "pointer",
        }}>{name[0]}</button>
      </div>
      {showAdmin && <AdminModal onClose={() => setShowAdmin(false)} />}
    </div>
  );
}

function AdminModal({ onClose }) {
  const [people, setPeople] = useState([]);
  const [confirmId, setConfirmId] = useState(null);

  const load = async () => {
    const { data } = await supabase.from("profiles").select("*").order("name");
    setPeople(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const removePerson = async (id) => {
    await supabase.from("profiles").delete().eq("id", id);
    setConfirmId(null);
    load();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 480, maxHeight: "75vh", overflowY: "auto" }}>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 700, color: COLOR.ink, marginBottom: 4 }}>Verwaltung</div>
        <div style={{ fontSize: 12, color: COLOR.inkSoft, marginBottom: 14 }}>Nutzer:innen entfernen</div>
        <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginBottom: 14 }}>
          Entfernt die Person aus der App (Name verschwindet aus Auswahllisten). Der Login-Zugang selbst bleibt bestehen und muss bei Bedarf zusätzlich im Supabase-Dashboard gelöscht werden.
        </div>
        {people.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${COLOR.line}` }}>
            <span style={{ fontSize: 14, color: COLOR.ink }}>{p.name}{p.is_admin && <span style={{ fontSize: 11, color: COLOR.inkSoft }}> · Admin</span>}</span>
            {confirmId === p.id ? (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => removePerson(p.id)} style={{ background: "none", border: "none", color: COLOR.dringend, cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>Entfernen</button>
                <button onClick={() => setConfirmId(null)} style={{ background: "none", border: "none", color: COLOR.inkSoft, cursor: "pointer", fontSize: 12.5 }}>Abbrechen</button>
              </div>
            ) : (
              <button onClick={() => setConfirmId(p.id)} style={{ background: "none", border: "none", color: COLOR.inkSoft, cursor: "pointer" }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        <button onClick={onClose} style={{ ...btnPrimary, width: "100%", padding: "11px 0", marginTop: 16 }}>Schließen</button>
      </div>
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
