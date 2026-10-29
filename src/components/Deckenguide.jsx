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
const localHour = (timeStr) => Number(timeStr.slice(11, 13));

// Findet den nächsten zusammenhängenden Tag- (7-19 Uhr) oder Nacht-Block (19-7 Uhr),
// gesucht ab dem Index fromIdx. Bei Tagesstart um Mitternacht ist "jetzt" oft schon
// mitten im aktuellen Block, dann wird nur der Rest davon zurückgegeben.
function findWindow(hourly, fromIdx, isWindowHour) {
  let start = -1;
  for (let i = fromIdx; i < hourly.time.length; i++) {
    if (isWindowHour(localHour(hourly.time[i]))) { start = i; break; }
  }
  if (start === -1) return null;
  let end = start;
  for (let i = start; i < hourly.time.length; i++) {
    if (isWindowHour(localHour(hourly.time[i]))) end = i; else break;
  }
  return [start, end];
}
const isDayHour = (h) => h >= 7 && h < 19;
const isNightHour = (h) => h >= 19 || h < 7;

// Findet den Beginn eines ANHALTENDEN Kälteeinbruchs: die erste Stunde, ab der die
// Temperatur mindestens hoursNeeded Stunden am Stück auf/unter threshold bleibt. Eine
// einzelne kalte/nasse Stunde zwischen sonst warmen Stunden zählt bewusst NICHT –
// nur ein wirklich anhaltender Einbruch soll die Empfehlung auslösen.
function sustainedColdOnset(temps, start, end, threshold, hoursNeeded) {
  let runStart = null, runLen = 0;
  for (let i = start; i <= end; i++) {
    if (temps[i] !== undefined && temps[i] <= threshold) {
      if (runStart === null) runStart = i;
      runLen++;
      if (runLen >= hoursNeeded) {
        let minTemp = Infinity;
        for (let j = runStart; j <= end; j++) if (temps[j] !== undefined && temps[j] < minTemp) minTemp = temps[j];
        return { onsetIdx: runStart, minTemp };
      }
    } else {
      runStart = null; runLen = 0;
    }
  }
  return null;
}

// Berechnet die Deckenempfehlung für ein Zeitfenster (z.B. "heute tagsüber" oder
// "kommende Nacht") nach den hinterlegten Regeln. Eine Empfehlung entsteht nur bei
// einem anhaltenden Kälte-/Nässeeinbruch, nicht bei einer einzelnen Ausreißer-Stunde.
// Da Wetterdaten nur stündlich vorliegen, wird eine Regen-Stunde (>= 0,2mm) pauschal mit
// 60 Minuten gewertet statt minutengenau nachverfolgt.
function computeWindowRecommendation(hourly, profile, settings, start, end) {
  const temps = hourly.temperature_2m;
  const precip = hourly.precipitation;
  const wind = hourly.wind_speed_10m;

  let windowMin = Infinity;
  for (let i = start; i <= end; i++) if (temps[i] !== undefined && temps[i] < windowMin) windowMin = temps[i];

  let qualifyingMinutes = 0, maxRate = 0, maxWind = 0;
  for (let i = start; i <= end; i++) {
    const rate = precip[i] || 0;
    if (rate >= 0.2) { qualifyingMinutes += 60; if (rate > maxRate) maxRate = rate; }
    if ((wind[i] || 0) > maxWind) maxWind = wind[i];
  }
  const rainQualifies = qualifyingMinutes >= settings.rain_qualify_total_minutes;

  const hoursNeeded = Math.ceil(profile.min_cold_duration_hours);
  const upperThreshold = rainQualifies ? profile.rain_upper : profile.dry_upper;
  const lowerThreshold = rainQualifies ? profile.rain_lower : profile.dry_lower;
  const sustained = sustainedColdOnset(temps, start, end, upperThreshold, hoursNeeded);
  const currentTemp = sustained ? sustained.minTemp : windowMin;

  let stage = "none", onsetTime = null;
  if (sustained && currentTemp <= 10) {
    stage = currentTemp > lowerThreshold ? "light" : "heavy";
    onsetTime = hourly.time[sustained.onsetIdx];
  }

  if (stage !== "none" && settings.wind_enabled) {
    if (maxWind > settings.wind_high_kmh) stage = bumpStage(stage);
    else if (maxWind >= settings.wind_mid_kmh && rainQualifies) stage = bumpStage(stage);
  }

  if (profile.night_rule_enabled && maxRate > profile.night_rain_rate && qualifyingMinutes > profile.night_rain_duration_min && windowMin <= profile.night_temp_cap) {
    const nightStage = windowMin > profile.rain_lower ? "light" : "heavy";
    if (stageRank(nightStage) > stageRank(stage)) { stage = nightStage; if (!onsetTime) onsetTime = hourly.time[start]; }
  }

  if (currentTemp > 10) stage = "none"; // feste Obergrenze, unabhängig von allem anderen

  return { stage, currentTemp, qualifyingMinutes, maxRate, maxWind, rainQualifies, onsetTime };
}

function computeRecommendation(hourly, profile, settings) {
  const idx = nowIndex(hourly);
  const currentlyDay = isDayHour(localHour(hourly.time[idx]));
  let dayWindow, nightWindow;
  if (currentlyDay) {
    dayWindow = findWindow(hourly, idx, isDayHour); // Rest von heute
    nightWindow = findWindow(hourly, dayWindow ? dayWindow[1] + 1 : idx, isNightHour); // kommende Nacht
  } else {
    nightWindow = findWindow(hourly, idx, isNightHour); // Rest von heute Nacht
    dayWindow = findWindow(hourly, nightWindow ? nightWindow[1] + 1 : idx, isDayHour); // morgiger Tag
  }
  const day = dayWindow ? computeWindowRecommendation(hourly, profile, settings, dayWindow[0], dayWindow[1]) : null;
  const night = nightWindow ? computeWindowRecommendation(hourly, profile, settings, nightWindow[0], nightWindow[1]) : null;
  return { day, night };
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

  const currentProfile = profiles.find((p) => p.key === (horse.blanket_profile || "normal"));

  const Period = ({ label, icon, data }) => {
    if (!data) return null;
    const info = STAGE_INFO[data.stage];
    return (
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginBottom: 4 }}>{icon} {label}</div>
        <span style={{ background: info.bg, color: info.fg, borderRadius: 999, padding: "4px 11px", fontSize: 13, fontWeight: 700, display: "inline-block" }}>
          {info.label}
        </span>
        <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginTop: 3 }}>{data.currentTemp.toFixed(1)}°C{data.rainQualifies ? " · Regen" : ""}</div>
        {data.onsetTime && (
          <div style={{ fontSize: 11.5, color: COLOR.dringend, marginTop: 2, fontWeight: 600 }}>
            ab ca. {data.onsetTime.slice(11, 16)} Uhr eindecken
          </div>
        )}
      </div>
    );
  };

  return (
    <Card style={{ marginBottom: 10, background: "#F3ECDD" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Shirt size={15} color={COLOR.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>Deckenempfehlung</span>
        </div>
        {isAdmin && (
          <button onClick={() => setShowSettings(true)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}>
            <Settings size={14} />
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
        <Period label="Tag" icon="☀️" data={result.day} />
        <Period label="Nacht" icon="🌙" data={result.night} />
      </div>

      <div style={{ marginTop: 12 }}>
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
          {result.day && <>Tag: {result.day.rainQualifies ? `${result.day.qualifyingMinutes} Min. Regen relevant` : "kein relevanter Regen"}, max. {result.day.maxRate.toFixed(1)}mm/h, Wind bis {result.day.maxWind.toFixed(0)}km/h.<br /></>}
          {result.night && <>Nacht: {result.night.rainQualifies ? `${result.night.qualifyingMinutes} Min. Regen relevant` : "kein relevanter Regen"}, max. {result.night.maxRate.toFixed(1)}mm/h, Wind bis {result.night.maxWind.toFixed(0)}km/h.<br /></>}
          Profil: {currentProfile?.label}. Trocken: &gt;{currentProfile?.dry_upper}°C keine, &gt;{currentProfile?.dry_lower}°C leicht, sonst dick (mind. {currentProfile?.min_cold_duration_hours}h am Stück). Nass: &gt;{currentProfile?.rain_upper}°C keine, &gt;{currentProfile?.rain_lower}°C leicht, sonst dick.
          Näherung: stündliche Wetterdaten, keine Minutengenauigkeit. Eine Empfehlung entsteht nur bei einem anhaltenden Einbruch (mind. {currentProfile?.min_cold_duration_hours}h am Stück) – einzelne kalte/nasse Ausreißerstunden zwischen sonst warmen lösen nichts aus. „Ab wann eindecken" markiert den Beginn dieses anhaltenden Einbruchs.
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
