import { useEffect, useState } from "react";
import { Shirt, Settings, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, Modal, COLOR, inputStyle, labelStyle, btnPrimary, btnGhost } from "./ui";

const STAGE_INFO = {
  none: { label: "Keine Decke", g: "0g", bg: COLOR.erledigtBg, fg: COLOR.erledigt },
  light: { label: "Leichte Decke", g: "50g", bg: COLOR.uebernommenBg, fg: COLOR.uebernommen },
  heavy: { label: "Dicke Decke", g: "100g", bg: COLOR.dringendBg, fg: COLOR.dringend },
};
const stageRank = (s) => ({ none: 0, light: 1, heavy: 2 }[s]);
const bumpStage = (s) => (s === "none" ? "light" : "heavy");

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,wind_speed_10m&past_days=1&forecast_days=2&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Wetterdaten konnten nicht geladen werden");
  const data = await res.json();
  return data.hourly;
}

function nowIndex(hourly) {
  const now = new Date();
  const nowKey = now.toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
  let idx = hourly.time.findIndex((t) => t.slice(0, 13) === nowKey);
  if (idx === -1) idx = Math.max(0, hourly.time.length - 25); // Fallback
  return idx;
}

// Berechnet die Deckenempfehlung nach den hinterlegten Regeln. Da Wetterdaten nur
// stündlich vorliegen, wird eine Regen-Stunde (>= 0,2mm) pauschal mit 60 Minuten
// gewertet statt minutengenau nachverfolgt – eine bewusste Annäherung.
function computeRecommendation(hourly, profile, settings) {
  const temps = hourly.temperature_2m;
  const precip = hourly.precipitation;
  const wind = hourly.wind_speed_10m;
  const idx = nowIndex(hourly);
  const currentTemp = temps[idx];

  const winStart = Math.max(0, idx - 3);
  const winEnd = Math.min(temps.length - 1, idx + 9);
  let qualifyingMinutes = 0, maxRate = 0, maxWind = 0;
  for (let i = winStart; i <= winEnd; i++) {
    const rate = precip[i] || 0;
    if (rate >= 0.2) { qualifyingMinutes += 60; if (rate > maxRate) maxRate = rate; }
    if ((wind[i] || 0) > maxWind) maxWind = wind[i];
  }
  const rainQualifies = qualifyingMinutes >= settings.rain_qualify_total_minutes;

  let stage;
  if (currentTemp > profile.rain_upper && currentTemp > profile.dry_upper) {
    stage = "none";
  } else if (rainQualifies) {
    stage = currentTemp > profile.rain_upper ? "none" : currentTemp > profile.rain_lower ? "light" : "heavy";
  } else {
    const hoursNeeded = Math.ceil(profile.min_cold_duration_hours);
    const checkStart = Math.max(0, idx - hoursNeeded);
    let coldEnough = currentTemp <= profile.dry_upper;
    for (let i = checkStart; i <= idx; i++) {
      if (temps[i] !== undefined && temps[i] > profile.dry_upper) { coldEnough = false; break; }
    }
    stage = !coldEnough ? "none" : currentTemp > profile.dry_lower ? "light" : "heavy";
  }

  if (settings.wind_enabled && currentTemp <= 10) {
    if (maxWind > settings.wind_high_kmh) stage = bumpStage(stage);
    else if (maxWind >= settings.wind_mid_kmh && rainQualifies) stage = bumpStage(stage);
  }

  if (profile.night_rule_enabled && maxRate > profile.night_rain_rate && qualifyingMinutes > profile.night_rain_duration_min && currentTemp <= profile.night_temp_cap) {
    const nightStage = currentTemp > profile.rain_lower ? "light" : "heavy";
    if (stageRank(nightStage) > stageRank(stage)) stage = nightStage;
  }

  if (currentTemp > 10) stage = "none"; // feste Obergrenze, unabhängig von allem anderen

  return { stage, currentTemp, qualifyingMinutes, maxRate, maxWind, rainQualifies };
}

export function BlanketCard({ horse, isAdmin, onProfileChange }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [settings, setSettings] = useState(null);
  const [rainBands, setRainBands] = useState([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [profilesRes, settingsRes, rainRes] = await Promise.all([
        supabase.from("blanket_profiles").select("*"),
        supabase.from("blanket_settings").select("*").eq("id", 1).single(),
        supabase.from("rain_intensity_thresholds").select("*").order("order_index"),
      ]);
      const profs = profilesRes.data ?? [];
      const sett = settingsRes.data;
      setProfiles(profs);
      setSettings(sett);
      setRainBands(rainRes.data ?? []);
      const profile = profs.find((p) => p.key === (horse.blanket_profile || "normal")) || profs[0];
      const hourly = await fetchWeather(sett.latitude, sett.longitude);
      setResult(computeRecommendation(hourly, profile, sett));
    } catch (e) {
      setError(e.message || "Fehler beim Laden");
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [horse.blanket_profile]);

  const setProfile = async (key) => {
    await onProfileChange(key);
  };

  if (loading) return (
    <Card style={{ marginBottom: 10, background: "#F3ECDD" }}>
      <div style={{ fontSize: 12.5, color: COLOR.inkSoft }}>Lade Wetterdaten …</div>
    </Card>
  );
  if (error) return (
    <Card style={{ marginBottom: 10, background: "#F3ECDD" }}>
      <div style={{ fontSize: 12.5, color: COLOR.dringend }}>🧥 Deckenempfehlung: {error}</div>
    </Card>
  );

  const stageInfo = STAGE_INFO[result.stage];
  const currentProfile = profiles.find((p) => p.key === (horse.blanket_profile || "normal"));

  return (
    <Card style={{ marginBottom: 10, background: "#F3ECDD" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Shirt size={15} color={COLOR.accent} />
            <span style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>Deckenempfehlung</span>
          </div>
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ background: stageInfo.bg, color: stageInfo.fg, borderRadius: 999, padding: "4px 11px", fontSize: 13, fontWeight: 700 }}>
              {stageInfo.label} ({stageInfo.g})
            </span>
            <span style={{ fontSize: 12.5, color: COLOR.inkSoft }}>{result.currentTemp.toFixed(1)}°C</span>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => setShowSettings(true)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}>
            <Settings size={14} />
          </button>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={{ ...labelStyle, marginBottom: 4 }}>Profil</label>
        <div style={{ display: "flex", gap: 6 }}>
          {profiles.map((p) => (
            <button key={p.key} onClick={() => setProfile(p.key)} style={{
              padding: "5px 11px", borderRadius: 999, border: `1px solid ${(horse.blanket_profile || "normal") === p.key ? COLOR.accent : COLOR.line}`,
              background: (horse.blanket_profile || "normal") === p.key ? "#fff" : "transparent", fontSize: 12, cursor: "pointer", color: COLOR.ink,
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      <button onClick={() => setShowDetails((v) => !v)} style={{
        display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer",
        color: COLOR.inkSoft, fontSize: 11.5, padding: "8px 0 0",
      }}>
        {showDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Details
      </button>
      {showDetails && (
        <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginTop: 4, lineHeight: 1.6 }}>
          Regen (ca. nächste/letzte Stunden): {result.rainQualifies ? `${result.qualifyingMinutes} Min. relevant` : "nicht ausreichend für Regen-Regel"}, max. Rate {result.maxRate.toFixed(1)}mm/h, max. Wind {result.maxWind.toFixed(0)}km/h.
          Profil: {currentProfile?.label}. Trocken: &gt;{currentProfile?.dry_upper}°C keine, &gt;{currentProfile?.dry_lower}°C leicht, sonst dick (mind. {currentProfile?.min_cold_duration_hours}h am Stück). Nass: &gt;{currentProfile?.rain_upper}°C keine, &gt;{currentProfile?.rain_lower}°C leicht, sonst dick.
          Näherung: stündliche Wetterdaten, keine Minutengenauigkeit.
        </div>
      )}

      {showSettings && (
        <BlanketSettingsModal
          profiles={profiles} settings={settings} rainBands={rainBands}
          onClose={() => setShowSettings(false)} onSaved={load}
        />
      )}
    </Card>
  );
}

function BlanketSettingsModal({ profiles, settings, rainBands, onClose, onSaved }) {
  const [localProfiles, setLocalProfiles] = useState(profiles.map((p) => ({ ...p })));
  const [localSettings, setLocalSettings] = useState({ ...settings });
  const [saving, setSaving] = useState(false);

  const updateProfile = (key, field, val) => {
    setLocalProfiles((ps) => ps.map((p) => (p.key === key ? { ...p, [field]: val } : p)));
  };

  const save = async () => {
    setSaving(true);
    for (const p of localProfiles) {
      await supabase.from("blanket_profiles").update({
        dry_upper: Number(p.dry_upper), dry_lower: Number(p.dry_lower),
        rain_upper: Number(p.rain_upper), rain_lower: Number(p.rain_lower),
        min_cold_duration_hours: Number(p.min_cold_duration_hours),
        night_rule_enabled: p.night_rule_enabled, night_rain_rate: Number(p.night_rain_rate),
        night_rain_duration_min: Number(p.night_rain_duration_min), night_temp_cap: Number(p.night_temp_cap),
      }).eq("key", p.key);
    }
    await supabase.from("blanket_settings").update({
      latitude: Number(localSettings.latitude), longitude: Number(localSettings.longitude),
      rain_qualify_total_minutes: Number(localSettings.rain_qualify_total_minutes),
      wind_enabled: localSettings.wind_enabled, wind_mid_kmh: Number(localSettings.wind_mid_kmh), wind_high_kmh: Number(localSettings.wind_high_kmh),
    }).eq("id", 1);
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Modal title="Decken-Guide: Einstellungen" onClose={onClose}>
      <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginBottom: 12 }}>
        Startwerte, frei anpassbar. Gilt für alle Pferde mit dem jeweiligen Profil.
      </div>
      {localProfiles.map((p) => (
        <div key={p.key} style={{ marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${COLOR.line}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink, marginBottom: 6 }}>{p.label}</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Trocken: ab °C keine</label>
              <input type="number" style={{ ...inputStyle, marginBottom: 0 }} value={p.dry_upper} onChange={(e) => updateProfile(p.key, "dry_upper", e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>ab °C leicht (sonst dick)</label>
              <input type="number" style={{ ...inputStyle, marginBottom: 0 }} value={p.dry_lower} onChange={(e) => updateProfile(p.key, "dry_lower", e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Regen: ab °C keine</label>
              <input type="number" style={{ ...inputStyle, marginBottom: 0 }} value={p.rain_upper} onChange={(e) => updateProfile(p.key, "rain_upper", e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>ab °C leicht (sonst dick)</label>
              <input type="number" style={{ ...inputStyle, marginBottom: 0 }} value={p.rain_lower} onChange={(e) => updateProfile(p.key, "rain_lower", e.target.value)} />
            </div>
          </div>
          <label style={labelStyle}>Kälte muss mind. so viele Stunden anhalten (trocken)</label>
          <input type="number" style={inputStyle} value={p.min_cold_duration_hours} onChange={(e) => updateProfile(p.key, "min_cold_duration_hours", e.target.value)} />
          <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={p.night_rule_enabled} onChange={(e) => updateProfile(p.key, "night_rule_enabled", e.target.checked)} />
            Zusätzliche Nachtregel aktiv
          </label>
          {p.night_rule_enabled && (
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>ab mm/h</label>
                <input type="number" style={{ ...inputStyle, marginBottom: 0 }} value={p.night_rain_rate} onChange={(e) => updateProfile(p.key, "night_rain_rate", e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>ab Min. Dauer</label>
                <input type="number" style={{ ...inputStyle, marginBottom: 0 }} value={p.night_rain_duration_min} onChange={(e) => updateProfile(p.key, "night_rain_duration_min", e.target.value)} />
              </div>
            </div>
          )}
        </div>
      ))}
      <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink, marginBottom: 6 }}>Allgemein</div>
      <label style={labelStyle}>Regen zählt insgesamt erst ab wie vielen Minuten (sonst trockene Regel)</label>
      <input type="number" style={inputStyle} value={localSettings.rain_qualify_total_minutes} onChange={(e) => setLocalSettings((s) => ({ ...s, rain_qualify_total_minutes: e.target.value }))} />
      <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" checked={localSettings.wind_enabled} onChange={(e) => setLocalSettings((s) => ({ ...s, wind_enabled: e.target.checked }))} />
        Wind berücksichtigen
      </label>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>ab km/h (bei Regen 1 Stufe mehr)</label>
          <input type="number" style={{ ...inputStyle, marginBottom: 0 }} value={localSettings.wind_mid_kmh} onChange={(e) => setLocalSettings((s) => ({ ...s, wind_mid_kmh: e.target.value }))} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>ab km/h (immer 1 Stufe mehr)</label>
          <input type="number" style={{ ...inputStyle, marginBottom: 0 }} value={localSettings.wind_high_kmh} onChange={(e) => setLocalSettings((s) => ({ ...s, wind_high_kmh: e.target.value }))} />
        </div>
      </div>
      <label style={labelStyle}>Standort für Wettervorhersage</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input type="number" style={{ ...inputStyle, marginBottom: 0 }} value={localSettings.latitude} onChange={(e) => setLocalSettings((s) => ({ ...s, latitude: e.target.value }))} placeholder="Breitengrad" />
        <input type="number" style={{ ...inputStyle, marginBottom: 0 }} value={localSettings.longitude} onChange={(e) => setLocalSettings((s) => ({ ...s, longitude: e.target.value }))} placeholder="Längengrad" />
      </div>
      <button onClick={save} disabled={saving} style={{ ...btnPrimary, width: "100%", padding: "11px 0" }}>Speichern</button>
    </Modal>
  );
}
