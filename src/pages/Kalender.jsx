import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { supabase } from "../supabaseClient";
import { SectionTitle, IconBtn, Modal, COLOR, todayISO, addMonths, dateToISO, parseISODate, fmtDate, inputStyle, labelStyle, btnPrimary, btnGhost, navBtn } from "../components/ui";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function monthGrid(cursorIso) {
  const c = parseISODate(cursorIso);
  const year = c.getFullYear();
  const month = c.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const firstWeekday = (first.getDay() + 6) % 7; // 0 = Montag
  const lastWeekday = (last.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - firstWeekday);
  const gridEnd = new Date(last);
  gridEnd.setDate(last.getDate() + (6 - lastWeekday));
  const days = [];
  const cur = new Date(gridStart);
  while (cur <= gridEnd) {
    days.push(dateToISO(cur));
    cur.setDate(cur.getDate() + 1);
  }
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return { weeks, month, year, from: days[0], to: days[days.length - 1] };
}

export default function Kalender({ user }) {
  const [cursor, setCursor] = useState(todayISO());
  const [selectedDay, setSelectedDay] = useState(todayISO());
  const [showNew, setShowNew] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [personalEvents, setPersonalEvents] = useState([]);
  const [people, setPeople] = useState([]);
  const [horses, setHorses] = useState([]);

  const grid = monthGrid(cursor);

  const load = async () => {
    const { from, to } = grid;
    const [eventsRes, tasksRes, personalRes, peopleRes, horsesRes] = await Promise.all([
      supabase.from("events").select("*").gte("date", from).lte("date", to),
      supabase.from("tasks").select("*").gte("date", from).lte("date", to),
      supabase.from("personal_events").select("*").gte("date", from).lte("date", to),
      supabase.from("profiles").select("name"),
      supabase.from("horses").select("id, name, born"),
    ]);
    setEvents(eventsRes.data ?? []);
    setTasks(tasksRes.data ?? []);
    setPersonalEvents(personalRes.data ?? []);
    setPeople((peopleRes.data ?? []).map((p) => p.name));
    setHorses(horsesRes.data ?? []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [cursor]);

  const entriesForDay = (d) => {
    const list = [];
    events.filter((e) => d >= e.date && d <= (e.date_end || e.date)).forEach((e) => list.push({ ...e, kind: "gemeinsam" }));
    tasks.filter((t) => d >= t.date && d <= (t.date_end || t.date)).forEach((t) =>
      list.push({ ...t, kind: t.type === "info" ? "gemeinsam" : (t.assigned_users || []).length === 0 ? "dringend" : t.done ? "erledigt" : "uebernommen" })
    );
    personalEvents.filter((e) => e.date === d).forEach((e) => list.push({ ...e, kind: "privat" }));
    // Geburtstage: jedes Jahr automatisch am gleichen Tag, ohne eigenen Datenbank-Eintrag
    horses.filter((h) => h.born && h.born.slice(5, 10) === d.slice(5, 10)).forEach((h) => {
      const age = Number(d.slice(0, 4)) - Number(h.born.slice(0, 4));
      list.push({ id: `bday-${h.id}-${d}`, title: `🎂 Geburtstag ${h.name}${age > 0 ? ` (${age} Jahre)` : ""}`, kind: "gemeinsam", virtual: true });
    });
    return list.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  };

  const cmap = {
    gemeinsam: COLOR.gemeinsam, privat: COLOR.privat,
    dringend: COLOR.dringend, erledigt: COLOR.erledigt, uebernommen: COLOR.uebernommen,
  };

  const addEntry = async (data) => {
    if (data.kind === "privat") {
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("personal_events").insert({ title: data.title, date: data.date, time: data.time || null, user_id: userData.user.id });
    } else {
      const dateEnd = data.dateEnd && data.dateEnd > data.date ? data.dateEnd : null;
      await supabase.from("events").insert({ title: data.title, date: data.date, date_end: dateEnd, time: data.time || null, with_user: data.withUser || null });
    }
    setShowNew(false);
    load();
  };

  const updateEntry = async (data) => {
    if (editEntry.kind === "privat") {
      await supabase.from("personal_events").update({ title: data.title, date: data.date, time: data.time || null }).eq("id", editEntry.id);
    } else {
      const dateEnd = data.dateEnd && data.dateEnd > data.date ? data.dateEnd : null;
      await supabase.from("events").update({ title: data.title, date: data.date, date_end: dateEnd, time: data.time || null, with_user: data.withUser || null }).eq("id", editEntry.id);
    }
    setEditEntry(null);
    load();
  };

  const deleteEntry = async () => {
    const table = editEntry.kind === "privat" ? "personal_events" : "events";
    await supabase.from(table).delete().eq("id", editEntry.id);
    setEditEntry(null);
    load();
  };

  const monthLabel = new Date(grid.year, grid.month, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const selectedList = entriesForDay(selectedDay);

  return (
    <div>
      <SectionTitle right={<IconBtn onClick={() => setShowNew(true)}><Plus size={15} /> Termin</IconBtn>}>Kalender</SectionTitle>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button onClick={() => setCursor(addMonths(cursor, -1))} style={navBtn}><ChevronLeft size={16} /></button>
        <span style={{ fontSize: 13.5, color: COLOR.ink, fontWeight: 700, textTransform: "capitalize" }}>{monthLabel}</span>
        <button onClick={() => setCursor(addMonths(cursor, 1))} style={navBtn}><ChevronRight size={16} /></button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: COLOR.inkSoft, padding: "2px 0" }}>{w}</div>
        ))}
      </div>

      {grid.weeks.map((week, wi) => (
        <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
          {week.map((d) => {
            const inMonth = parseISODate(d).getMonth() === grid.month;
            const isToday = d === todayISO();
            const isSelected = d === selectedDay;
            const dayEntries = entriesForDay(d);
            const dots = [...new Set(dayEntries.map((e) => e.kind))].slice(0, 3);
            return (
              <button
                key={d}
                onClick={() => setSelectedDay(d)}
                style={{
                  aspectRatio: "1", border: "none", borderRadius: 9, cursor: "pointer",
                  background: isSelected ? COLOR.accent : "transparent",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                  padding: 2,
                }}
              >
                <span style={{
                  fontSize: 12.5, fontWeight: isToday ? 800 : 500,
                  color: isSelected ? "#fff" : !inMonth ? "#C9C0AF" : isToday ? COLOR.accent : COLOR.ink,
                }}>{Number(d.slice(8, 10))}</span>
                <span style={{ display: "flex", gap: 2, height: 5 }}>
                  {dots.map((k) => (
                    <span key={k} style={{ width: 4, height: 4, borderRadius: 3, background: isSelected ? "#fff" : cmap[k] }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      ))}

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLOR.inkSoft, marginBottom: 6, textTransform: "capitalize" }}>
          {fmtDate(selectedDay)}{selectedDay === todayISO() ? " · heute" : ""}
        </div>
        {selectedList.length === 0 && <div style={{ fontSize: 12.5, color: COLOR.inkSoft, paddingLeft: 2 }}>–</div>}
        {selectedList.map((e, i) => {
          const clickable = !e.type && !e.virtual; // Aufgaben (type) und Geburtstage (virtual) sind nicht bearbeitbar
          return (
            <div key={i} onClick={() => clickable && setEditEntry(e)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 2px", cursor: clickable ? "pointer" : "default" }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: cmap[e.kind], flexShrink: 0 }} />
              <span style={{ fontSize: 13.5, color: COLOR.ink, flex: 1 }}>
                {e.title}{e.with_user && <span style={{ color: COLOR.inkSoft }}> · mit {e.with_user}</span>}
              </span>
              {e.time && <span style={{ fontSize: 12, color: COLOR.inkSoft }}>{e.time}</span>}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: COLOR.inkSoft, marginTop: 14 }}>
        <Legend c={COLOR.gemeinsam} label="Gemeinsam" />
        <Legend c={COLOR.privat} label="Privat" />
        <Legend c={COLOR.dringend} label="Offen/dringend" />
        <Legend c={COLOR.uebernommen} label="Übernommen" />
        <Legend c={COLOR.erledigt} label="Erledigt" />
      </div>
      {showNew && <NewEventModal people={people} initialDate={selectedDay} onClose={() => setShowNew(false)} onSave={addEntry} />}
      {editEntry && (
        <NewEventModal
          people={people}
          initialDate={editEntry.date}
          editing={editEntry}
          onClose={() => setEditEntry(null)}
          onSave={updateEntry}
          onDelete={deleteEntry}
        />
      )}
    </div>
  );
}

function Legend({ c, label }) {
  return <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: c }} />{label}</span>;
}

function NewEventModal({ people, initialDate, editing, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState(editing?.title || "");
  const [date, setDate] = useState(editing?.date || initialDate || todayISO());
  const [dateEnd, setDateEnd] = useState(editing?.date_end || "");
  const [time, setTime] = useState(editing?.time || "");
  const [kind, setKind] = useState(editing?.kind || "gemeinsam");
  const [withUser, setWithUser] = useState(editing?.with_user || "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toggleBtn = { flex: 1, padding: "8px 0", borderRadius: 9, border: `1px solid ${COLOR.line}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
  return (
    <Modal title={editing ? "Termin bearbeiten" : "Neuer Termin"} onClose={onClose}>
      <label style={labelStyle}>Titel</label>
      <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Ausritt mit Goldi" />
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><label style={labelStyle}>Datum</label><input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div style={{ flex: 1 }}><label style={labelStyle}>Uhrzeit</label><input type="time" style={inputStyle} value={time} onChange={(e) => setTime(e.target.value)} /></div>
      </div>
      {!editing && (
        <label style={labelStyle}>Sichtbarkeit</label>
      )}
      {!editing && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button type="button" onClick={() => setKind("gemeinsam")} style={{ ...toggleBtn, ...(kind === "gemeinsam" ? { background: COLOR.gemeinsamBg, borderColor: COLOR.gemeinsam, color: COLOR.gemeinsam } : {}) }}>Gemeinsam</button>
          <button type="button" onClick={() => setKind("privat")} style={{ ...toggleBtn, ...(kind === "privat" ? { background: COLOR.privatBg, borderColor: COLOR.privat, color: COLOR.privat } : {}) }}>Privat</button>
        </div>
      )}
      {kind === "gemeinsam" && (
        <>
          <label style={labelStyle}>Bis (optional, für mehrtägige Termine)</label>
          <input type="date" style={inputStyle} value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
          <label style={labelStyle}>Mit wem? (optional)</label>
          <select style={inputStyle} value={withUser} onChange={(e) => setWithUser(e.target.value)}>
            <option value="">Niemand markieren</option>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </>
      )}
      <button disabled={!title.trim()} onClick={() => onSave({ title: title.trim(), date, dateEnd, time, kind, withUser })} style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: title.trim() ? 1 : 0.5 }}>
        {editing ? "Speichern" : "Termin speichern"}
      </button>
      {editing && (
        confirmDelete ? (
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button onClick={onDelete} style={{ ...btnPrimary, flex: 1, background: COLOR.dringend }}>Wirklich löschen</button>
            <button onClick={() => setConfirmDelete(false)} style={{ ...btnGhost, flex: 1 }}>Abbrechen</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={{ ...btnGhost, width: "100%", marginTop: 8, color: COLOR.dringend }}>Termin löschen</button>
        )
      )}
    </Modal>
  );
}
