import { useEffect, useState } from "react";
import { Sprout, Pencil, ChevronUp, ChevronDown, X } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, Modal, COLOR, fmtDate, daysUntil, turnoutActiveStage, inputStyle, labelStyle, btnPrimary, btnGhost, todayISO } from "./ui";

export default function AnweideplanSection({ isAdmin }) {
  const [stages, setStages] = useState([]);
  const [startDate, setStartDate] = useState(null);
  const [showEdit, setShowEdit] = useState(false);

  const load = async () => {
    const [stagesRes, settingsRes] = await Promise.all([
      supabase.from("turnout_plan_stages").select("*").order("order_index"),
      supabase.from("turnout_plan_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    setStages(stagesRes.data ?? []);
    setStartDate(settingsRes.data?.start_date ?? null);
  };
  useEffect(() => { load(); }, []);

  const active = turnoutActiveStage(stages, startDate);

  return (
    <div>
      <Card style={{ marginBottom: 8, background: "#F3ECDD" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Sprout size={15} color={COLOR.accent} />
              <span style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>Anweideplan Frühjahr</span>
            </div>
            {!startDate && <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginTop: 4 }}>Noch kein Start festgelegt.</div>}
            {startDate && !active && daysUntil(startDate) > 0 && (
              <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginTop: 4 }}>Start am {fmtDate(startDate)}.</div>
            )}
            {startDate && !active && daysUntil(startDate) <= 0 && (
              <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginTop: 4 }}>Plan abgeschlossen.</div>
            )}
            {active && (
              <div style={{ fontSize: 13.5, color: COLOR.ink, marginTop: 4 }}>
                Heute: <strong>{active.stage.label}</strong> <span style={{ color: COLOR.inkSoft }}>(Tag {active.dayInStage} von {active.stage.days} in dieser Stufe)</span>
              </div>
            )}
          </div>
          {isAdmin && (
            <button onClick={() => setShowEdit(true)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}>
              <Pencil size={14} />
            </button>
          )}
        </div>
      </Card>
      {showEdit && (
        <TurnoutPlanEditModal stages={stages} startDate={startDate} onClose={() => setShowEdit(false)} onSaved={load} />
      )}
    </div>
  );
}

function TurnoutPlanEditModal({ stages, startDate, onClose, onSaved }) {
  const [localStages, setLocalStages] = useState(stages.map((s) => ({ ...s })));
  const [start, setStart] = useState(startDate || todayISO());
  const [newLabel, setNewLabel] = useState("");
  const [newDays, setNewDays] = useState(7);
  const [saving, setSaving] = useState(false);

  const move = (i, dir) => {
    const arr = [...localStages];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setLocalStages(arr);
  };
  const updateStage = (i, field, val) => {
    const arr = [...localStages];
    arr[i] = { ...arr[i], [field]: val };
    setLocalStages(arr);
  };
  const removeStage = (i) => setLocalStages(localStages.filter((_, idx) => idx !== i));
  const addStage = () => {
    if (!newLabel.trim()) return;
    setLocalStages([...localStages, { id: `new-${Date.now()}`, label: newLabel.trim(), days: Number(newDays) || 7 }]);
    setNewLabel("");
    setNewDays(7);
  };

  const save = async () => {
    setSaving(true);
    await supabase.from("turnout_plan_settings").update({ start_date: start || null }).eq("id", 1);
    const existingIds = stages.map((s) => s.id);
    const newIds = localStages.filter((s) => existingIds.includes(s.id)).map((s) => s.id);
    const toDelete = existingIds.filter((id) => !newIds.includes(id));
    if (toDelete.length > 0) await supabase.from("turnout_plan_stages").delete().in("id", toDelete);
    for (let i = 0; i < localStages.length; i++) {
      const s = localStages[i];
      if (String(s.id).startsWith("new-")) {
        await supabase.from("turnout_plan_stages").insert({ order_index: i, label: s.label, days: Number(s.days) });
      } else {
        await supabase.from("turnout_plan_stages").update({ order_index: i, label: s.label, days: Number(s.days) }).eq("id", s.id);
      }
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Modal title="Anweideplan bearbeiten" onClose={onClose}>
      <label style={labelStyle}>Gemeinsamer Start (für alle Pferde)</label>
      <input type="date" style={inputStyle} value={start} onChange={(e) => setStart(e.target.value)} />

      <label style={labelStyle}>Stufen (in Reihenfolge)</label>
      {localStages.map((s, i) => (
        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <button onClick={() => move(i, -1)} disabled={i === 0} style={{ background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.3 : 1, padding: 0 }}><ChevronUp size={14} /></button>
            <button onClick={() => move(i, 1)} disabled={i === localStages.length - 1} style={{ background: "none", border: "none", cursor: i === localStages.length - 1 ? "default" : "pointer", opacity: i === localStages.length - 1 ? 0.3 : 1, padding: 0 }}><ChevronDown size={14} /></button>
          </div>
          <input style={{ ...inputStyle, marginBottom: 0, flex: 2 }} value={s.label} onChange={(e) => updateStage(i, "label", e.target.value)} />
          <input type="number" style={{ ...inputStyle, marginBottom: 0, width: 62 }} value={s.days} onChange={(e) => updateStage(i, "days", e.target.value)} />
          <span style={{ fontSize: 11.5, color: COLOR.inkSoft, width: 30 }}>Tage</span>
          <button onClick={() => removeStage(i)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.dringend }}><X size={15} /></button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 10, marginBottom: 16 }}>
        <input style={{ ...inputStyle, marginBottom: 0, flex: 2 }} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="z. B. 15 Minuten" />
        <input type="number" style={{ ...inputStyle, marginBottom: 0, width: 62 }} value={newDays} onChange={(e) => setNewDays(e.target.value)} />
        <button onClick={addStage} style={btnGhost}>+</button>
      </div>

      <button onClick={save} disabled={saving} style={{ ...btnPrimary, width: "100%", padding: "11px 0" }}>Speichern</button>
    </Modal>
  );
}
