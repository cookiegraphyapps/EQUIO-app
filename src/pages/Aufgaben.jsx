import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Repeat, Pencil, ChevronDown, ChevronUp, Settings, Trash2 } from "lucide-react";
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
  const [categories, setCategories] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [showAbsence, setShowAbsence] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("alle");
  const [showDaily, setShowDaily] = useState(false);
  const [showManageCategories, setShowManageCategories] = useState(false);

  const load = async () => {
    const [tasksRes, horsesRes, peopleRes, categoriesRes] = await Promise.all([
      supabase.from("tasks").select("*").order("date").order("time"),
      supabase.from("horses").select("*"),
      supabase.from("profiles").select("name"),
      supabase.from("task_categories").select("*").order("created_at"),
    ]);
    setTasks(tasksRes.data ?? []);
    setHorses(horsesRes.data ?? []);
    setPeople((peopleRes.data ?? []).map((p) => p.name));
    setCategories(categoriesRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <Empty text="Lädt …" />;

  const t = todayISO();
  const byCategory = (x) => categoryFilter === "alle" || (x.category || "allgemein") === categoryFilter;
  const upcomingAll = tasks.filter((x) => (x.date_end || x.date) >= t && byCategory(x));
  const past = tasks.filter((x) => (x.date_end || x.date) < t && byCategory(x)).slice(-5);
  // Bei "Alle" werden tägliche Aufgaben separat eingeklappt, damit sie die Übersicht nicht zumüllen
  const separateDaily = categoryFilter === "alle";
  const upcoming = separateDaily ? upcomingAll.filter((x) => (x.category || "allgemein") !== "taeglich") : upcomingAll;
  const dailyTasks = separateDaily ? upcomingAll.filter((x) => (x.category || "allgemein") === "taeglich") : [];

  const uebernehmen = async (task) => {
    const already = task.assigned_users || [];
    if (already.includes(user)) return;
    const assigned_users = [...already, user];
    const done = task.type === "uebernahme"; // reine Übernahme gilt sofort als erledigt, sobald jemand sie hat
    await supabase.from("tasks").update({ assigned_users, done }).eq("id", task.id);
    load();
  };
  const erledigt = async (task) => {
    await supabase.from("tasks").update({ done: true }).eq("id", task.id);
    load();
  };
  const zuruecknehmen = async (task) => {
    const assigned_users = (task.assigned_users || []).filter((u) => u !== user);
    await supabase.from("tasks").update({ assigned_users, done: assigned_users.length === 0 ? false : task.done }).eq("id", task.id);
    load();
  };

  const addTask = async (data) => {
    const doneIfAssigned = data.assignTo.length > 0 && data.type === "uebernahme";
    const rows = [];
    if (data.mode === "recurring" && data.recurEnd) {
      const seriesId = crypto.randomUUID();
      let d = data.date;
      while (d <= data.recurEnd) {
        rows.push({ title: data.title, description: data.desc, type: data.type, date: d, date_end: null, time: data.time || null, horse_ids: data.horseIds, recurring: true, series_id: seriesId, assigned_users: data.assignTo, done: doneIfAssigned, category: data.category });
        d = addDays(d, 1);
      }
    } else {
      const dateEnd = data.mode === "range" && data.rangeEnd && data.rangeEnd > data.date ? data.rangeEnd : null;
      rows.push({ title: data.title, description: data.desc, type: data.type, date: data.date, date_end: dateEnd, time: data.time || null, horse_ids: data.horseIds, recurring: false, assigned_users: data.assignTo, done: doneIfAssigned, category: data.category });
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
          assigned_users: [],
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
    if (data.scope === "series" && editTask.series_id) {
      await supabase.from("tasks").update({
        title: data.title, description: data.desc, type: data.type, category: data.category,
        time: data.time || null, horse_ids: data.horseIds, assigned_users: data.assignTo,
      }).eq("series_id", editTask.series_id);
    } else {
      const dateEnd = data.dateEnd && data.dateEnd > data.date ? data.dateEnd : null;
      await supabase.from("tasks").update({
        title: data.title, description: data.desc, type: data.type, category: data.category, date: data.date, date_end: dateEnd,
        time: data.time || null, horse_ids: data.horseIds, assigned_users: data.assignTo,
      }).eq("id", editTask.id);
    }
    setEditTask(null);
    load();
  };

  const deleteTask = async (scope) => {
    if (scope === "series" && editTask.series_id) {
      await supabase.from("tasks").delete().eq("series_id", editTask.series_id);
    } else {
      await supabase.from("tasks").delete().eq("id", editTask.id);
    }
    setEditTask(null);
    load();
  };

  const addCategory = async (label) => {
    let key = label.trim().toLowerCase()
      .replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" }[c]))
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!key) return;
    if (categories.some((c) => c.key === key)) key = `${key}_${Date.now().toString().slice(-4)}`;
    await supabase.from("task_categories").insert({ key, label: label.trim() });
    load();
  };

  const deleteCategory = async (key) => {
    await supabase.from("task_categories").delete().eq("key", key);
    if (categoryFilter === key) setCategoryFilter("alle");
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, alignItems: "center" }}>
        <button onClick={() => setCategoryFilter("alle")} style={{
          padding: "5px 11px", borderRadius: 999, border: `1px solid ${categoryFilter === "alle" ? COLOR.accent : COLOR.line}`,
          background: categoryFilter === "alle" ? "#F3ECDD" : "#fff", fontSize: 12, cursor: "pointer", color: COLOR.ink,
        }}>Alle</button>
        {categories.map((c) => (
          <button key={c.key} onClick={() => setCategoryFilter(c.key)} style={{
            padding: "5px 11px", borderRadius: 999, border: `1px solid ${categoryFilter === c.key ? COLOR.accent : COLOR.line}`,
            background: categoryFilter === c.key ? "#F3ECDD" : "#fff", fontSize: 12, cursor: "pointer", color: COLOR.ink,
          }}>{c.label}</button>
        ))}
        <button onClick={() => setShowManageCategories(true)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft, padding: 4, display: "flex" }}>
          <Settings size={15} />
        </button>
      </div>
      {upcoming.length === 0 && <Empty text="Keine Aufgaben geplant." />}
      {upcoming.map((x) => (
        <TaskCard key={x.id} task={x} horses={horses} user={user}
          onUebernehmen={() => uebernehmen(x)} onErledigt={() => erledigt(x)} onZurueck={() => zuruecknehmen(x)} onEdit={() => setEditTask(x)} />
      ))}
      {dailyTasks.length > 0 && (
        <>
          <button onClick={() => setShowDaily((v) => !v)} style={{
            display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer",
            color: COLOR.inkSoft, fontSize: 13, fontWeight: 600, padding: "8px 0",
          }}>
            {showDaily ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            Tägliche Aufgaben ({dailyTasks.length})
          </button>
          {showDaily && dailyTasks.map((x) => (
            <TaskCard key={x.id} task={x} horses={horses} user={user}
              onUebernehmen={() => uebernehmen(x)} onErledigt={() => erledigt(x)} onZurueck={() => zuruecknehmen(x)} onEdit={() => setEditTask(x)} />
          ))}
        </>
      )}
      {past.length > 0 && (
        <>
          <SectionTitle>Vergangen</SectionTitle>
          {past.map((x) => (
            <TaskCard key={x.id} task={x} horses={horses} user={user} faded
              onUebernehmen={() => uebernehmen(x)} onErledigt={() => erledigt(x)} onZurueck={() => zuruecknehmen(x)} onEdit={() => setEditTask(x)} />
          ))}
        </>
      )}
      {showNew && <NewTaskModal horses={horses} people={people} categories={categories} onClose={() => setShowNew(false)} onSave={addTask} />}
      {showAbsence && <NewAbsenceModal horses={horses} people={people.filter((p) => p !== user)} onClose={() => setShowAbsence(false)} onSave={addAbsence} />}
      {editTask && (
        <NewTaskModal
          horses={horses} people={people} categories={categories} editing={editTask}
          onClose={() => setEditTask(null)} onSave={updateTask} onDelete={deleteTask}
        />
      )}
      {showManageCategories && (
        <ManageCategoriesModal categories={categories} onAdd={addCategory} onDelete={deleteCategory} onClose={() => setShowManageCategories(false)} />
      )}
    </div>
  );
}

function ManageCategoriesModal({ categories, onAdd, onDelete, onClose }) {
  const [newLabel, setNewLabel] = useState("");
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
  const add = () => {
    if (!newLabel.trim()) return;
    onAdd(newLabel);
    setNewLabel("");
  };
  return (
    <Modal title="Kategorien verwalten" onClose={onClose}>
      {categories.map((c) => (
        <div key={c.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${COLOR.line}` }}>
          <span style={{ fontSize: 13.5, color: COLOR.ink }}>{c.label}</span>
          {confirmDeleteKey === c.key ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { onDelete(c.key); setConfirmDeleteKey(null); }} style={{ ...btnGhost, color: COLOR.dringend, padding: "4px 10px" }}>Löschen</button>
              <button onClick={() => setConfirmDeleteKey(null)} style={{ ...btnGhost, padding: "4px 10px" }}>Abbrechen</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDeleteKey(c.key)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        <input
          style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Neue Kategorie (z. B. Turnier)"
        />
        <button onClick={add} style={btnPrimary}>+ Hinzufügen</button>
      </div>
    </Modal>
  );
}

function TaskCard({ task, horses, user, onUebernehmen, onErledigt, onZurueck, onEdit, faded }) {
  const names = (task.horse_ids || []).map((id) => horses.find((h) => h.id === id)?.name).filter(Boolean).join(", ");
  const assignedUsers = task.assigned_users || [];
  const isOpen = assignedUsers.length === 0 && task.type !== "info";
  const iAmIn = assignedUsers.includes(user);
  let statusPill;
  if (task.type === "info") statusPill = <Pill bg={COLOR.gemeinsamBg} fg={COLOR.gemeinsam}>Info</Pill>;
  else if (isOpen) statusPill = <Pill bg={COLOR.dringendBg} fg={COLOR.dringend}><AlertTriangle size={11} />offen</Pill>;
  else if (task.type === "uebernahme_erledigt" && task.done) statusPill = <Pill bg={COLOR.erledigtBg} fg={COLOR.erledigt}><CheckCircle2 size={11} />erledigt</Pill>;
  else statusPill = <Pill bg={COLOR.uebernommenBg} fg={COLOR.uebernommen}>{assignedUsers.join(", ")} {assignedUsers.length > 1 ? "übernehmen" : "übernimmt"}</Pill>;

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
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {!iAmIn && <button onClick={onUebernehmen} style={btnPrimary}>{isOpen ? "Ich übernehme" : "Ich helfe mit"}</button>}
          {task.type === "uebernahme_erledigt" && !task.done && assignedUsers.length > 0 && (
            <button onClick={onErledigt} style={btnPrimary}>Erledigt</button>
          )}
          {iAmIn && (
            <button onClick={onZurueck} style={btnGhost}>Verlassen</button>
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

function NewTaskModal({ horses, people, categories, editing, onClose, onSave, onDelete }) {
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
  const [assignTo, setAssignTo] = useState(editing?.assigned_users || []);
  const [customName, setCustomName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scope, setScope] = useState("instance"); // instance | series (nur relevant bei wiederkehrenden Aufgaben)
  const [category, setCategory] = useState(editing?.category || "allgemein");

  const togglePerson = (p) => setAssignTo((a) => (a.includes(p) ? a.filter((x) => x !== p) : [...a, p]));
  const addCustomName = () => {
    const n = customName.trim();
    if (n && !assignTo.includes(n)) setAssignTo((a) => [...a, n]);
    setCustomName("");
  };

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
      <label style={labelStyle}>Kategorie</label>
      <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
        {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      {editing?.series_id && (
        <>
          <label style={labelStyle}>Gilt für</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button type="button" onClick={() => setScope("instance")} style={{ ...modeBtn, flex: 1, ...(scope === "instance" ? { background: "#F3ECDD", borderColor: COLOR.accent } : {}) }}>Nur diesen Termin</button>
            <button type="button" onClick={() => setScope("series")} style={{ ...modeBtn, flex: 1, ...(scope === "series" ? { background: "#F3ECDD", borderColor: COLOR.accent } : {}) }}>Ganze Serie</button>
          </div>
        </>
      )}
      {editing ? (
        scope === "series" ? (
          <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginTop: -4, marginBottom: 10 }}>
            Datum wird pro Termin beibehalten – nur Titel, Typ, Pferde, Zuweisung und Uhrzeit gelten für die ganze Serie.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Datum</label><input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Bis (optional)</label><input type="date" style={inputStyle} value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} /></div>
          </div>
        )
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
          <label style={labelStyle}>Direkt zuweisen (optional, mehrere möglich)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {people.map((p) => (
              <button key={p} type="button" onClick={() => togglePerson(p)} style={{
                padding: "6px 11px", borderRadius: 999, border: `1px solid ${assignTo.includes(p) ? COLOR.accent : COLOR.line}`,
                background: assignTo.includes(p) ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
              }}>{p}</button>
            ))}
            {assignTo.filter((n) => !people.includes(n)).map((n) => (
              <button key={n} type="button" onClick={() => togglePerson(n)} style={{
                padding: "6px 11px", borderRadius: 999, border: `1px solid ${COLOR.accent}`,
                background: "#F3ECDD", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
              }}>{n} ✕</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <input
              style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomName(); } }}
              placeholder="Eigenen Namen hinzufügen (z. B. Mama)"
            />
            <button type="button" onClick={addCustomName} style={btnGhost}>+</button>
          </div>
        </>
      )}
      <button
        disabled={!title.trim()}
        onClick={() => onSave({ title: title.trim(), desc, type, date, dateEnd, time, horseIds, mode, rangeEnd, recurEnd, assignTo, scope, category })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", marginTop: 6, opacity: title.trim() ? 1 : 0.5 }}
      >{editing ? "Speichern" : "Aufgabe speichern"}</button>
      {editing && (
        confirmDelete ? (
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button onClick={() => onDelete(scope)} style={{ ...btnPrimary, flex: 1, background: COLOR.dringend }}>
              {editing.series_id && scope === "series" ? "Ganze Serie löschen" : "Wirklich löschen"}
            </button>
            <button onClick={() => setConfirmDelete(false)} style={{ ...btnGhost, flex: 1 }}>Abbrechen</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={{ ...btnGhost, width: "100%", marginTop: 8, color: COLOR.dringend }}>
            {editing.series_id && scope === "series" ? "Ganze Serie löschen" : "Aufgabe löschen"}
          </button>
        )
      )}
    </Modal>
  );
}
