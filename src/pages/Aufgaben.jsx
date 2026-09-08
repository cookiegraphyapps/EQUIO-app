import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Repeat } from "lucide-react";
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
  const upcoming = tasks.filter((x) => x.date >= t);
  const past = tasks.filter((x) => x.date < t).slice(-5);

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
    if (data.recurring && data.recurEnd) {
      let d = data.date;
      while (d <= data.recurEnd) {
        rows.push({ title: data.title, description: data.desc, type: data.type, date: d, time: data.time || null, horse_ids: data.horseIds, recurring: true, assigned_user: data.assignTo || null, done: doneIfAssigned });
        d = addDays(d, 1);
      }
    } else {
      rows.push({ title: data.title, description: data.desc, type: data.type, date: data.date, time: data.time || null, horse_ids: data.horseIds, recurring: false, assigned_user: data.assignTo || null, done: doneIfAssigned });
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
          type: "uebernahme",
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
          onUebernehmen={() => uebernehmen(x)} onErledigt={() => erledigt(x)} onZurueck={() => zuruecknehmen(x)} />
      ))}
      {past.length > 0 && (
        <>
          <SectionTitle>Vergangen</SectionTitle>
          {past.map((x) => (
            <TaskCard key={x.id} task={x} horses={horses} user={user} faded
              onUebernehmen={() => uebernehmen(x)} onErledigt={() => erledigt(x)} onZurueck={() => zuruecknehmen(x)} />
          ))}
        </>
      )}
      {showNew && <NewTaskModal horses={horses} people={people} onClose={() => setShowNew(false)} onSave={addTask} />}
      {showAbsence && <NewAbsenceModal horses={horses} people={people.filter((p) => p !== user)} onClose={() => setShowAbsence(false)} onSave={addAbsence} />}
    </div>
  );
}

function TaskCard({ task, horses, user, onUebernehmen, onErledigt, onZurueck, faded }) {
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
          <div style={{ fontSize: 12, color: COLOR.inkSoft, marginTop: 2 }}>{fmtDate(task.date)}{task.time ? `, ${task.time}` : ""}{names ? ` · ${names}` : ""}</div>
          {task.description && <div style={{ fontSize: 12, color: COLOR.inkSoft, marginTop: 2 }}>{task.description}</div>}
        </div>
        {statusPill}
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

function NewTaskModal({ horses, people, onClose, onSave }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [type, setType] = useState("uebernahme");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [horseIds, setHorseIds] = useState([]);
  const [recurring, setRecurring] = useState(false);
  const [recurEnd, setRecurEnd] = useState(addDays(todayISO(), 6));
  const [assignTo, setAssignTo] = useState("");

  const toggleHorse = (id) => setHorseIds((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  return (
    <Modal title="Neue Aufgabe" onClose={onClose}>
      <label style={labelStyle}>Titel</label>
      <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Pferde reinholen" />
      <label style={labelStyle}>Beschreibung (optional)</label>
      <input style={inputStyle} value={desc} onChange={(e) => setDesc(e.target.value)} />
      <label style={labelStyle}>Typ</label>
      <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
        {Object.entries(TASK_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><label style={labelStyle}>Datum</label><input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div style={{ flex: 1 }}><label style={labelStyle}>Uhrzeit (optional)</label><input type="time" style={inputStyle} value={time} onChange={(e) => setTime(e.target.value)} /></div>
      </div>
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
          <select style={inputStyle} value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
            <option value="">Offen lassen – wer zuerst übernimmt</option>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </>
      )}
      <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} /> Wiederkehrend (täglich)
      </label>
      {recurring && (
        <>
          <label style={labelStyle}>Wiederholen bis</label>
          <input type="date" style={inputStyle} value={recurEnd} onChange={(e) => setRecurEnd(e.target.value)} />
        </>
      )}
      <button
        disabled={!title.trim()}
        onClick={() => onSave({ title: title.trim(), desc, type, date, time, horseIds, recurring, recurEnd, assignTo })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", marginTop: 6, opacity: title.trim() ? 1 : 0.5 }}
      >Aufgabe speichern</button>
    </Modal>
  );
}
