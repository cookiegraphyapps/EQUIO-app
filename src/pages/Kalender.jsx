import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { supabase } from "../supabaseClient";
import { SectionTitle, IconBtn, Modal, COLOR, todayISO, addDays, fmtDate, inputStyle, labelStyle, btnPrimary, navBtn } from "../components/ui";

export default function Kalender({ user }) {
  const [start, setStart] = useState(todayISO());
  const [showNew, setShowNew] = useState(false);
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [personalEvents, setPersonalEvents] = useState([]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const load = async () => {
    const from = days[0], to = days[6];
    const [eventsRes, tasksRes, personalRes] = await Promise.all([
      supabase.from("events").select("*").gte("date", from).lte("date", to),
      supabase.from("tasks").select("*").gte("date", from).lte("date", to),
      supabase.from("personal_events").select("*").gte("date", from).lte("date", to),
    ]);
    setEvents(eventsRes.data ?? []);
    setTasks(tasksRes.data ?? []);
    setPersonalEvents(personalRes.data ?? []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [start]);

  const entriesForDay = (d) => {
    const list = [];
    events.filter((e) => e.date === d).forEach((e) => list.push({ ...e, kind: "gemeinsam" }));
    tasks.filter((t) => t.date === d).forEach((t) =>
      list.push({ ...t, kind: t.type === "info" ? "gemeinsam" : !t.assigned_user ? "dringend" : t.done ? "erledigt" : "uebernommen" })
    );
    personalEvents.filter((e) => e.date === d).forEach((e) => list.push({ ...e, kind: "privat" }));
    return list.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  };

  const addEntry = async (data) => {
    if (data.kind === "privat") {
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("personal_events").insert({ title: data.title, date: data.date, time: data.time || null, user_id: userData.user.id });
    } else {
      await supabase.from("events").insert({ title: data.title, date: data.date, time: data.time || null });
    }
    setShowNew(false);
    load();
  };

  return (
    <div>
      <SectionTitle right={<IconBtn onClick={() => setShowNew(true)}><Plus size={15} /> Termin</IconBtn>}>Kalender</SectionTitle>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={() => setStart(addDays(start, -7))} style={navBtn}><ChevronLeft size={16} /></button>
        <span style={{ fontSize: 13, color: COLOR.inkSoft, fontWeight: 600 }}>{fmtDate(days[0])} – {fmtDate(days[6])}</span>
        <button onClick={() => setStart(addDays(start, 7))} style={navBtn}><ChevronRight size={16} /></button>
      </div>
      {days.map((d) => {
        const list = entriesForDay(d);
        return (
          <div key={d} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: d === todayISO() ? COLOR.accent : COLOR.inkSoft, marginBottom: 6, textTransform: "capitalize" }}>
              {fmtDate(d)}{d === todayISO() ? " · heute" : ""}
            </div>
            {list.length === 0 && <div style={{ fontSize: 12.5, color: COLOR.inkSoft, paddingLeft: 2 }}>–</div>}
            {list.map((e, i) => {
              const cmap = {
                gemeinsam: [COLOR.gemeinsamBg, COLOR.gemeinsam], privat: [COLOR.privatBg, COLOR.privat],
                dringend: [COLOR.dringendBg, COLOR.dringend], erledigt: [COLOR.erledigtBg, COLOR.erledigt], uebernommen: [COLOR.uebernommenBg, COLOR.uebernommen],
              };
              const [, fg] = cmap[e.kind];
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 2px" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: fg, flexShrink: 0 }} />
                  <span style={{ fontSize: 13.5, color: COLOR.ink, flex: 1 }}>{e.title}</span>
                  {e.time && <span style={{ fontSize: 12, color: COLOR.inkSoft }}>{e.time}</span>}
                </div>
              );
            })}
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: COLOR.inkSoft, marginTop: 6 }}>
        <Legend c={COLOR.gemeinsam} label="Gemeinsam" />
        <Legend c={COLOR.privat} label="Privat" />
        <Legend c={COLOR.dringend} label="Offen/dringend" />
        <Legend c={COLOR.uebernommen} label="Übernommen" />
        <Legend c={COLOR.erledigt} label="Erledigt" />
      </div>
      {showNew && <NewEventModal onClose={() => setShowNew(false)} onSave={addEntry} />}
    </div>
  );
}

function Legend({ c, label }) {
  return <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: c }} />{label}</span>;
}

function NewEventModal({ onClose, onSave }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [kind, setKind] = useState("gemeinsam");
  const toggleBtn = { flex: 1, padding: "8px 0", borderRadius: 9, border: `1px solid ${COLOR.line}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
  return (
    <Modal title="Neuer Termin" onClose={onClose}>
      <label style={labelStyle}>Titel</label>
      <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Ausritt mit Goldi" />
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><label style={labelStyle}>Datum</label><input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div style={{ flex: 1 }}><label style={labelStyle}>Uhrzeit</label><input type="time" style={inputStyle} value={time} onChange={(e) => setTime(e.target.value)} /></div>
      </div>
      <label style={labelStyle}>Sichtbarkeit</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => setKind("gemeinsam")} style={{ ...toggleBtn, ...(kind === "gemeinsam" ? { background: COLOR.gemeinsamBg, borderColor: COLOR.gemeinsam, color: COLOR.gemeinsam } : {}) }}>Gemeinsam</button>
        <button type="button" onClick={() => setKind("privat")} style={{ ...toggleBtn, ...(kind === "privat" ? { background: COLOR.privatBg, borderColor: COLOR.privat, color: COLOR.privat } : {}) }}>Privat</button>
      </div>
      <button disabled={!title.trim()} onClick={() => onSave({ title: title.trim(), date, time, kind })} style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: title.trim() ? 1 : 0.5 }}>Termin speichern</button>
    </Modal>
  );
}
