import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Repeat, Pencil } from "lucide-react";
import { supabase } from "../supabaseClient";
import {
  Card, SectionTitle, Empty, Pill, Modal, IconBtn, COLOR,
  todayISO, addDays, fmtDate, inputStyle, labelStyle, btnPrimary, btnGhost, TASK_TYPES,
} from "../components/ui";

export default function Aufgaben({ user }) {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [horses, setHorses] = useState([]);
  const [people, setPeople] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [showAbsence, setShowAbsence] = useState(false);
  const [editTask, setEditTask] = useState(null);

  const load = async () => {
    const [tasksRes, horsesRes, peopleRes] = await Promise.all([
      supabase.from("tasks").select("*").order("date").order("time"),
      supabase.from("horses").select("*"),
      supabase.from("profiles").select("name"),
    ]);
    setTasks(tasksRes.data ?? []);
    setHorses(horsesRes.data ?? []);
    setPeople((peopleRes.data ?? []).map((p) => p.name));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <Empty text="Lädt …" />;

  const t = todayISO();
  const upcoming = tasks.filter((x) => (x.date_end || x.date) >= t);
  const past = tasks.filter((x) => (x.date_end || x.date) < t).slice(-5);

  const uebernehmen = async (task) => {
    const done = task.type === "uebernahme";
    await supabase.from("tasks").update({ assigned_user: user, done }).eq("id", task.id);
    load();
  };
  const erledigt = async (task) => {
    await supabase.from("tasks").update({ done: true }).eq("id", task.id);
    load();
  };
  const zuruecknehmen = async (task) => {
    await supabase.from("tasks").update({ assigned_user: null, done: false }).eq("id", task.id);
    load();
  };

  const addTask = async (data) => {
    const doneIfAssigned = !!data.assignTo && data.type === "uebernahme";
    const rows = [];
    if (data.mode === "recurring" && data.recurEnd) {
      let d = data.date;
      while (d <= data.recurEnd) {
        rows.push({ title: data.title, description: data.desc, type: data.type, date: d, date_end: null, time: data.time || null, horse_ids: data.horseIds, recurring: true, assigned_user: data.assignTo || null, done: doneIfAssigned });
        d = addDays(d, 1);
      }
    } else {
      const dateEnd = data.mode === "range" && data.rangeEnd && data.rangeEnd > data.date ? data.rangeEnd : null;
      rows.push({ title: data.title, description: data.desc, type: data.type, date: data.date, date_end: dateEnd, time: data.time || null, horse_ids: data.horseIds, recurring: false, assigned_user: data.assignTo || null, done: doneIfAssigned });
    }
    await supabase.from("tasks").insert(rows);
    setShowNew(false);
    load();
  };

  const addAbsence = async (data) => {
    const rows = [];
    let d = data.from;
    while (d <= data.to) {
      data.horseIds.forEach((hid) => {
        const horseName = horses.find((h) => h.id === hid)?.name || "";
        const desc = data.askedPeople.length ? `Angefragt: ${data.askedPeople.join(", ")}` : "";
        rows.push({
          title: `${horseName} versorgen (${user} abwesend)`,
          description: desc,
          type: "uebernahme_erledigt",
          date: d,
          time: data.time || null,
          horse_ids: [hid],
          assigned_user: null,
          done: false,
          recurring: false,
        });
      });
      d = addDays(d, 1);
    }
    await supabase.from("tasks").insert(rows);
    setShowAbsence(false);
    load();
  };

  const updateTask = async (data) => {
    const dateEnd = data.dateEnd && data.dateEnd > data.date ? data.dateEnd : null;
    await supabase.from("tasks").update({
      title: data.title, description: data.desc, type: data.type, date: data.date, date_end: dateEnd,
      time: data.time || null, horse_ids: data.horseIds, assigned_user: data.assignTo || null,
    }).eq("id", editTask.id);
    setEditTask(null);
    load();
  };

  const deleteTask = async () => {
    await supabase.from("tasks").delete().eq("id", editTask.id);
    setEditTask(null);
    load();
  };

  return (
    <div>
      <SectionTitle right={
        <div style={{ display: "flex", gap: 6 }}>
          <IconBtn onClick={() => setShowAbsence(true)}>🧳 Abwesenheit</IconBtn>
          <IconBtn onClick={() => setShowNew(true)}><Plus size={15} /> Aufgabe</IconBtn>
        </div>
      }>Anstehend</SectionTitle>
      {upcoming.length === 0 && <Empty text="Keine Aufgaben geplant." />}
      {upcoming.map((x) => (
        <TaskCard key={x.id} task={x} horses={horses} user={user}
          onUebernehmen={() => uebernehmen(x)} onErledigt={() => erledigt(x)} onZurueck={() => zuruecknehmen(x)} onEdit={() => setEditTask(x)} />
      ))}
      {past.length > 0 && (
        <>
          <SectionTitle>Vergangen</SectionTitle>
          {past.map((x) => (
            <TaskCard key={x.id} task={x} horses={horses} user={user} faded
              onUebernehmen={() => uebernehmen(x)} onErledigt={() => erledigt(x)} onZurueck={() => zuruecknehmen(x)} onEdit={() => setEditTask(x)} />
          ))}
        </>
      )}
      {showNew && <NewTaskModal horses={horses} people={people} onClose={() => setShowNew(false)} onSave={addTask} />}
      {showAbsence && <NewAbsenceModal horses={horses} people={people.filter((p) => p !== user)} onClose={() => setShowAbsence(false)} onSave={addAbsence} />}
      {editTask && (
        <NewTaskModal
          horses={horses} people={people} editing={editTask}
          onClose={() => setEditTask(null)} onSave={updateTask} onDelete={deleteTask}
        />
      )}
    </div>
  );
}

function TaskCard({ task, horses, user, onUebernehmen, onErledigt, onZurueck, onEdit, faded }) {
  const names = (task.horse_ids || []).map((id) => horses.find((h) => h.id === id)?.name).filter(Boolean).join(", ");
  const isOpen = !task.assigned_user && task.type !== "info";
  let statusPill;
  if (task.type === "info") statusPill = <Pill bg={COLOR.gemeinsamBg} fg={COLOR.gemeinsam}>Info</Pill>;
  else if (isOpen) statusPill = <Pill bg={COLOR.dringendBg} fg={COLOR.dringend}><AlertTriangle size={11} />offen</Pill>;
  else if (task.done) statusPill = <Pill bg={COLOR.erledigtBg} fg={COLOR.erledigt}><CheckCircle2 size={11} />erledigt</Pill>;
  else statusPill = <Pill bg={COLOR.uebernommenBg} fg={COLOR.uebernommen}>{task.assigned_user} übernimmt</Pill>;

  return (
    <Card style={{ marginBottom: 8, opacity: faded ? 0.6 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: COLOR.ink }}>
            {task.title}{task.recurring && <Repeat size={12} style={{ marginLeft: 5, verticalAlign: -1, color: COLOR.inkSoft }} />}
          </div>
          <div style={{ fontSize: 12, color: COLOR.inkSoft, marginTop: 2 }}>
            {task.date_end ? `${fmtDate(task.date)} – ${fmtDate(task.date_end)}` : fmtDate(task.date)}{task.time ? `, ${task.time}` : ""}{names ? ` · ${names}` : ""}
          </div>
          {task.description && <div style={{ fontSize: 12, color: COLOR.inkSoft, marginTop: 2 }}>{task.description}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          {statusPill}
          <button onClick={onEdit} style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: COLOR.inkSoft }}>
            <Pencil size={13} />
          </button>
        </div>
      </div>
      {task.type !== "info" && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {isOpen && <button onClick={onUebernehmen} style={btnPrimary}>Ich übernehme</button>}
          {!isOpen && task.type === "uebernahme_erledigt" && !task.done && task.assigned_user === user && (
            <button onClick={onErledigt} style={btnPrimary}>Erledigt</button>
          )}
          {!isOpen && task.assigned_user === user && (!task.done || task.type === "uebernahme_erledigt") && (
            <button onClick={onZurueck} style={btnGhost}>Zurücknehmen</button>
          )}
        </div>
      )}
    </Card>
  );
}

function NewAbsenceModal({ horses, people, onClose, onSave }) {
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [time, setTime] = useState("");
  const [horseIds, setHorseIds] = useState([]);
  const [askedPeople, setAskedPeople] = useState([]);

  const toggleHorse = (id) => setHorseIds((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  const togglePerson = (p) => setAskedPeople((a) => (a.includes(p) ? a.filter((x) => x !== p) : [...a, p]));

  return (
    <Modal title="Abwesenheit melden" onClose={onClose}>
      <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginBottom: 12 }}>
        Für jeden Tag im Zeitraum wird pro ausgewähltem Pferd eine offene Aufgabe erstellt, die übernommen werden kann.
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><label style={labelStyle}>Von</label><input type="date" style={inputStyle} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div style={{ flex: 1 }}><label style={labelStyle}>Bis</label><input type="date" style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <label style={labelStyle}>Uhrzeit (optional, für alle Tage gleich)</label>
      <input type="time" style={inputStyle} value={time} onChange={(e) => setTime(e.target.value)} />
      <label style={labelStyle}>Welche Pferde brauchen Betreuung?</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {horses.map((h) => (
          <button key={h.id} onClick={() => toggleHorse(h.id)} type="button" style={{
            padding: "6px 11px", borderRadius: 999, border: `1px solid ${horseIds.includes(h.id) ? COLOR.accent : COLOR.line}`,
            background: horseIds.includes(h.id) ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
          }}>{h.name}</button>
        ))}
      </div>
      <label style={labelStyle}>Wen möchtest du fragen? (optional, nur als Hinweis – jede:r kann trotzdem übernehmen)</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {people.map((p) => (
          <button key={p} onClick={() => togglePerson(p)} type="button" style={{
            padding: "6px 11px", borderRadius: 999, border: `1px solid ${askedPeople.includes(p) ? COLOR.accent : COLOR.line}`,
            background: askedPeople.includes(p) ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
          }}>{p}</button>
        ))}
      </div>
      <button
        disabled={horseIds.length === 0 || from > to}
        onClick={() => onSave({ from, to, time, horseIds, askedPeople })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: horseIds.length === 0 || from > to ? 0.5 : 1 }}
      >Betreuungsanfragen erstellen</button>
    </Modal>
  );
}

function NewTaskModal({ horses, people, editing, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState(editing?.title || "");
  const [desc, setDesc] = useState(editing?.description || "");
  const [type, setType] = useState(editing?.type || "uebernahme");
  const [date, setDate] = useState(editing?.date || todayISO());
  const [dateEnd, setDateEnd] = useState(editing?.date_end || "");
  const [time, setTime] = useState(editing?.time || "");
  const [horseIds, setHorseIds] = useState(editing?.horse_ids || []);
  const [mode, setMode] = useState("single"); // single | range | recurring
  const [rangeEnd, setRangeEnd] = useState(addDays(todayISO(), 2));
  const [recurEnd, setRecurEnd] = useState(addDays(todayISO(), 6));
  const [assignTo, setAssignTo] = useState(editing?.assigned_user || "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleHorse = (id) => setHorseIds((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  const modeBtn = { flex: 1, padding: "7px 4px", borderRadius: 9, border: `1px solid ${COLOR.line}`, background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: COLOR.ink };

  return (
    <Modal title={editing ? "Aufgabe bearbeiten" : "Neue Aufgabe"} onClose={onClose}>
      <label style={labelStyle}>Titel</label>
      <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Pferde reinholen" />
      <label style={labelStyle}>Beschreibung (optional)</label>
      <input style={inputStyle} value={desc} onChange={(e) => setDesc(e.target.value)} />
      <label style={labelStyle}>Typ</label>
      <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
        {Object.entries(TASK_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {editing ? (
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Datum</label><input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Bis (optional)</label><input type="date" style={inputStyle} value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} /></div>
        </div>
      ) : (
        <>
          <label style={labelStyle}>Zeitliche Einordnung</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button type="button" onClick={() => setMode("single")} style={{ ...modeBtn, ...(mode === "single" ? { background: "#F3ECDD", borderColor: COLOR.accent } : {}) }}>Einzeltag</button>
            <button type="button" onClick={() => setMode("range")} style={{ ...modeBtn, ...(mode === "range" ? { background: "#F3ECDD", borderColor: COLOR.accent } : {}) }}>Zeitraum</button>
            <button type="button" onClick={() => setMode("recurring")} style={{ ...modeBtn, ...(mode === "recurring" ? { background: "#F3ECDD", borderColor: COLOR.accent } : {}) }}>Täglich wiederholen</button>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>{mode === "range" ? "Von" : "Datum"}</label>
              <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Uhrzeit (optional)</label><input type="time" style={inputStyle} value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
        </>
      )}
      {!editing && mode === "range" && (
        <>
          <label style={labelStyle}>Bis</label>
          <input type="date" style={inputStyle} value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
          <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginTop: -8, marginBottom: 10 }}>
            Eine Aufgabe für den gesamten Zeitraum – kann an jedem Tag darin übernommen/erledigt werden.
          </div>
        </>
      )}
      {!editing && mode === "recurring" && (
        <label style={labelStyle}>Wiederholen bis</label>
      )}
      {!editing && mode === "recurring" && (
        <input type="date" style={inputStyle} value={recurEnd} onChange={(e) => setRecurEnd(e.target.value)} />
      )}
      {editing && (
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Uhrzeit (optional)</label><input type="time" style={inputStyle} value={time} onChange={(e) => setTime(e.target.value)} /></div>
        </div>
      )}
      <label style={labelStyle}>Betroffene Pferde</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {horses.map((h) => (
          <button key={h.id} onClick={() => toggleHorse(h.id)} type="button" style={{
            padding: "6px 11px", borderRadius: 999, border: `1px solid ${horseIds.includes(h.id) ? COLOR.accent : COLOR.line}`,
            background: horseIds.includes(h.id) ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
          }}>{h.name}</button>
        ))}
      </div>
      {type !== "info" && (
        <>
          <label style={labelStyle}>Direkt zuweisen (optional)</label>
          <input
            style={inputStyle}
            list="assignto-people"
            value={assignTo}
            onChange={(e) => setAssignTo(e.target.value)}
            placeholder="Offen lassen, Namen wählen oder eintippen (z. B. Mama)"
          />
          <datalist id="assignto-people">
            {people.map((p) => <option key={p} value={p} />)}
          </datalist>
        </>
      )}
      <button
        disabled={!title.trim()}
        onClick={() => onSave({ title: title.trim(), desc, type, date, dateEnd, time, horseIds, mode, rangeEnd, recurEnd, assignTo })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", marginTop: 6, opacity: title.trim() ? 1 : 0.5 }}
      >{editing ? "Speichern" : "Aufgabe speichern"}</button>
      {editing && (
        confirmDelete ? (
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button onClick={onDelete} style={{ ...btnPrimary, flex: 1, background: COLOR.dringend }}>Wirklich löschen</button>
            <button onClick={() => setConfirmDelete(false)} style={{ ...btnGhost, flex: 1 }}>Abbrechen</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={{ ...btnGhost, width: "100%", marginTop: 8, color: COLOR.dringend }}>Aufgabe löschen</button>
        )
      )}
    </Modal>
  );
}
