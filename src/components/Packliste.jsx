import { useEffect, useState } from "react";
import { Briefcase, Plus, ChevronLeft, Trash2, Pencil, BookOpen } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, SectionTitle, Empty, Modal, COLOR, fmtDate, todayISO, inputStyle, labelStyle, btnPrimary, btnGhost } from "./ui";

export const PACKING_CATEGORIES = {
  umzug: "Umzug / Koppelwechsel",
  wanderritt_1tag: "Wanderritt (1 Tag)",
  wanderritt_mehrtaegig: "Wanderritt (mehrtägig)",
  urlaub_mit_pferd: "Urlaub mit Pferd",
};

export async function fetchPackingTemplates() {
  const { data } = await supabase.from("packing_templates").select("*").order("order_index");
  return data ?? [];
}

export async function fetchPackingLists() {
  const { data } = await supabase.from("packing_lists").select("*, packing_items(*)").order("created_at", { ascending: false });
  return data ?? [];
}

export async function fetchPackingListForEvent(eventId) {
  const { data } = await supabase.from("packing_lists").select("*, packing_items(*)").eq("event_id", eventId).maybeSingle();
  return data ?? null;
}

export async function createPackingList({ category, title, date, horseIds, people, eventId }) {
  const templates = await fetchPackingTemplates();
  const tpl = templates.filter((t) => t.category === category);
  const { data: list, error } = await supabase.from("packing_lists").insert({
    category, title: title || PACKING_CATEGORIES[category], date: date || null,
    horse_ids: horseIds, people, event_id: eventId || null, status: "active",
  }).select().single();
  if (error || !list) return { id: null, error: error || new Error("Liste konnte nicht angelegt werden") };
  const items = [];
  tpl.forEach((t) => {
    if (t.scope === "shared") items.push({ list_id: list.id, text: t.item_text, scope: "shared" });
    else if (t.scope === "per_horse") horseIds.forEach((hid) => items.push({ list_id: list.id, text: t.item_text, scope: "per_horse", horse_id: hid }));
    else if (t.scope === "per_person") people.forEach((p) => items.push({ list_id: list.id, text: t.item_text, scope: "per_person", person_name: p }));
  });
  let itemsError = null;
  if (items.length > 0) {
    const res = await supabase.from("packing_items").insert(items);
    itemsError = res.error;
  }
  return { id: list.id, error: itemsError || null };
}

export async function togglePackingItem(item) {
  await supabase.from("packing_items").update({ done: !item.done }).eq("id", item.id);
}
export async function addPackingItem(listId, text, scope, horseId, personName) {
  if (!text.trim()) return null;
  const { error } = await supabase.from("packing_items").insert({ list_id: listId, text: text.trim(), scope, horse_id: horseId || null, person_name: personName || null });
  return error;
}
export async function deletePackingItem(id) {
  await supabase.from("packing_items").delete().eq("id", id);
}
export async function assignPackingItem(id, personName) {
  await supabase.from("packing_items").update({ assigned_to: personName || null }).eq("id", id);
}
export async function deletePackingList(id) {
  await supabase.from("packing_lists").delete().eq("id", id);
}

// Liste abschließen: wird zum "letzten Beispiel" der Kategorie (ersetzt ein vorheriges),
// und die Vorlage der Kategorie wird durch die Punkte dieser Liste ersetzt.
export async function finishPackingList(list) {
  const { data: oldExamples } = await supabase.from("packing_lists").select("id").eq("category", list.category).eq("status", "example");
  if (oldExamples) for (const e of oldExamples) await supabase.from("packing_lists").delete().eq("id", e.id);
  await supabase.from("packing_lists").update({ status: "example" }).eq("id", list.id);

  const items = list.packing_items || [];
  const dedup = new Map();
  items.forEach((i) => {
    const existing = dedup.get(i.text);
    if (!existing || i.scope !== "shared") dedup.set(i.text, i.scope);
  });
  const { data: oldTemplates } = await supabase.from("packing_templates").select("id").eq("category", list.category);
  if (oldTemplates && oldTemplates.length > 0) await supabase.from("packing_templates").delete().in("id", oldTemplates.map((t) => t.id));
  const rows = Array.from(dedup.entries()).map(([item_text, scope], idx) => ({ category: list.category, item_text, scope, order_index: idx + 1 }));
  if (rows.length > 0) await supabase.from("packing_templates").insert(rows);
}

export async function addTemplateItem(category, text, scope) {
  if (!text.trim()) return;
  const { data: existing } = await supabase.from("packing_templates").select("order_index").eq("category", category).order("order_index", { ascending: false }).limit(1);
  const nextOrder = (existing?.[0]?.order_index ?? 0) + 1;
  await supabase.from("packing_templates").insert({ category, item_text: text.trim(), scope, order_index: nextOrder });
}
export async function deleteTemplateItem(id) {
  await supabase.from("packing_templates").delete().eq("id", id);
}

// ---------- UI-Bausteine ----------

export function ListDetail({ list, horses, onBack, onChanged, embedded }) {
  const [newShared, setNewShared] = useState("");
  const [newForAllHorses, setNewForAllHorses] = useState("");
  const [newForAllPeople, setNewForAllPeople] = useState("");
  const [newPerHorse, setNewPerHorse] = useState({});
  const [newPerPerson, setNewPerPerson] = useState({});
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const readOnly = list.status === "example";
  const items = list.packing_items || [];
  const sharedItems = items.filter((i) => i.scope === "shared");
  const horseNames = Object.fromEntries(horses.map((h) => [h.id, h.name]));

  const doAdd = async (text, scope, horseId, personName) => {
    const error = await addPackingItem(list.id, text, scope, horseId, personName);
    if (error) { alert("Konnte nicht gespeichert werden: " + (error.message || JSON.stringify(error))); return; }
    onChanged();
  };
  const doToggle = async (item) => { await togglePackingItem(item); onChanged(); };
  const doDelete = async (id) => { await deletePackingItem(id); onChanged(); };
  const doAssign = async (id, personName) => { await assignPackingItem(id, personName); onChanged(); };
  const doFinish = async () => { await finishPackingList(list); onChanged(); onBack(); };
  const doDeleteList = async () => { await deletePackingList(list.id); onChanged(); onBack(); };

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft, display: "flex", alignItems: "center", gap: 4, padding: "8px 0", fontSize: 13 }}>
        <ChevronLeft size={15} /> {embedded ? "Zurück zum Termin" : "Packlisten"}
      </button>
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 19, fontWeight: 700, color: COLOR.ink }}>{list.title}</div>
        <div style={{ fontSize: 12, color: COLOR.inkSoft, marginTop: 2 }}>
          {list.date && `${fmtDate(list.date)} · `}
          {(list.people || []).length > 0 && list.people.join(", ")}
          {readOnly && " · Letztes Beispiel (nur Ansicht)"}
        </div>
      </div>

      <SectionTitle>Gemeinsam</SectionTitle>
      {sharedItems.length === 0 && <Empty text="Keine gemeinsamen Punkte." />}
      {sharedItems.map((i) => (
        <ItemRow key={i.id} item={i} readOnly={readOnly} people={list.people || []} onToggle={() => doToggle(i)} onDelete={() => doDelete(i.id)} onAssign={(p) => doAssign(i.id, p)} />
      ))}
      {!readOnly && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <input
            style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={newShared}
            onChange={(e) => setNewShared(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { doAdd(newShared, "shared", null, null); setNewShared(""); } }}
            placeholder="Punkt hinzufügen …"
          />
          <button onClick={() => { doAdd(newShared, "shared", null, null); setNewShared(""); }} style={btnGhost}>+</button>
        </div>
      )}

      {!readOnly && (list.horse_ids || []).length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <input
            style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={newForAllHorses}
            onChange={(e) => setNewForAllHorses(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { (list.horse_ids || []).forEach((hid) => doAdd(newForAllHorses, "per_horse", hid, null)); setNewForAllHorses(""); } }}
            placeholder="Für alle Pferde hinzufügen (z. B. Halfter) …"
          />
          <button onClick={() => { (list.horse_ids || []).forEach((hid) => doAdd(newForAllHorses, "per_horse", hid, null)); setNewForAllHorses(""); }} style={btnGhost}>+</button>
        </div>
      )}

      {(list.horse_ids || []).map((hid) => {
        const horseItems = items.filter((i) => i.scope === "per_horse" && i.horse_id === hid);
        return (
          <div key={hid}>
            <SectionTitle>Für {horseNames[hid] || "?"}</SectionTitle>
            {horseItems.length === 0 && <Empty text="Keine Punkte." />}
            {horseItems.map((i) => (
              <ItemRow key={i.id} item={i} readOnly={readOnly} people={list.people || []} onToggle={() => doToggle(i)} onDelete={() => doDelete(i.id)} onAssign={(p) => doAssign(i.id, p)} />
            ))}
            {!readOnly && (
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                <input
                  style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={newPerHorse[hid] || ""}
                  onChange={(e) => setNewPerHorse((s) => ({ ...s, [hid]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { doAdd(newPerHorse[hid] || "", "per_horse", hid, null); setNewPerHorse((s) => ({ ...s, [hid]: "" })); } }}
                  placeholder="Punkt hinzufügen …"
                />
                <button onClick={() => { doAdd(newPerHorse[hid] || "", "per_horse", hid, null); setNewPerHorse((s) => ({ ...s, [hid]: "" })); }} style={btnGhost}>+</button>
              </div>
            )}
          </div>
        );
      })}

      {!readOnly && (list.people || []).length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <input
            style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={newForAllPeople}
            onChange={(e) => setNewForAllPeople(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { (list.people || []).forEach((p) => doAdd(newForAllPeople, "per_person", null, p)); setNewForAllPeople(""); } }}
            placeholder="Für alle Personen hinzufügen (z. B. Reithelm) …"
          />
          <button onClick={() => { (list.people || []).forEach((p) => doAdd(newForAllPeople, "per_person", null, p)); setNewForAllPeople(""); }} style={btnGhost}>+</button>
        </div>
      )}

      {(list.people || []).map((p) => {
        const personItems = items.filter((i) => i.scope === "per_person" && i.person_name === p);
        return (
          <div key={p}>
            <SectionTitle>Für {p}</SectionTitle>
            {personItems.length === 0 && <Empty text="Keine Punkte." />}
            {personItems.map((i) => (
              <ItemRow key={i.id} item={i} readOnly={readOnly} people={list.people || []} onToggle={() => doToggle(i)} onDelete={() => doDelete(i.id)} onAssign={(p) => doAssign(i.id, p)} />
            ))}
            {!readOnly && (
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                <input
                  style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={newPerPerson[p] || ""}
                  onChange={(e) => setNewPerPerson((s) => ({ ...s, [p]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { doAdd(newPerPerson[p] || "", "per_person", null, p); setNewPerPerson((s) => ({ ...s, [p]: "" })); } }}
                  placeholder="Punkt hinzufügen …"
                />
                <button onClick={() => { doAdd(newPerPerson[p] || "", "per_person", null, p); setNewPerPerson((s) => ({ ...s, [p]: "" })); }} style={btnGhost}>+</button>
              </div>
            )}
          </div>
        );
      })}

      {!readOnly && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {confirmFinish ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={doFinish} style={{ ...btnPrimary, flex: 1 }}>Ja, abschließen</button>
              <button onClick={() => setConfirmFinish(false)} style={{ ...btnGhost, flex: 1 }}>Abbrechen</button>
            </div>
          ) : (
            <button onClick={() => setConfirmFinish(true)} style={btnPrimary}>Liste abschließen</button>
          )}
          {confirmDelete ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={doDeleteList} style={{ ...btnPrimary, background: COLOR.dringend, flex: 1 }}>Wirklich löschen</button>
              <button onClick={() => setConfirmDelete(false)} style={{ ...btnGhost, flex: 1 }}>Abbrechen</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.dringend, fontSize: 12 }}>
              Liste löschen
            </button>
          )}
        </div>
      )}
      {readOnly && (
        <div style={{ marginTop: 12 }}>
          {confirmDelete ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={doDeleteList} style={{ ...btnPrimary, background: COLOR.dringend, flex: 1 }}>Wirklich löschen</button>
              <button onClick={() => setConfirmDelete(false)} style={{ ...btnGhost, flex: 1 }}>Abbrechen</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.dringend, fontSize: 12 }}>
              Beispiel löschen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, readOnly, people, onToggle, onDelete, onAssign }) {
  return (
    <Card style={{ marginBottom: 6, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
      <button onClick={readOnly ? undefined : onToggle} disabled={readOnly} style={{
        width: 20, height: 20, borderRadius: 5, border: `2px solid ${item.done ? COLOR.erledigt : COLOR.line}`,
        background: item.done ? COLOR.erledigt : "#fff", cursor: readOnly ? "default" : "pointer", flexShrink: 0,
      }} />
      <span style={{ fontSize: 13.5, color: item.done ? COLOR.inkSoft : COLOR.ink, textDecoration: item.done ? "line-through" : "none", flex: 1 }}>{item.text}</span>
      {!readOnly && (people || []).length > 0 && (
        <select
          value={item.assigned_to || ""}
          onChange={(e) => onAssign(e.target.value || null)}
          style={{
            fontSize: 11.5, color: item.assigned_to ? COLOR.ink : COLOR.inkSoft, border: `1px solid ${COLOR.line}`,
            borderRadius: 999, padding: "3px 8px", background: item.assigned_to ? "#F3ECDD" : "#fff", flexShrink: 0, maxWidth: 90,
          }}
        >
          <option value="">wer bringt's?</option>
          {people.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      )}
      {readOnly && item.assigned_to && (
        <span style={{ fontSize: 11, color: COLOR.inkSoft, flexShrink: 0 }}>{item.assigned_to}</span>
      )}
      {!readOnly && (
        <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft, flexShrink: 0 }}>
          <Trash2 size={13} />
        </button>
      )}
    </Card>
  );
}

export function NewListModal({ category, label, horses, people, onClose, onSave }) {
  const [title, setTitle] = useState(label);
  const [date, setDate] = useState(todayISO());
  const [horseIds, setHorseIds] = useState([]);
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [customName, setCustomName] = useState("");
  const toggleHorse = (id) => setHorseIds((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  const togglePerson = (p) => setSelectedPeople((a) => (a.includes(p) ? a.filter((x) => x !== p) : [...a, p]));
  const addCustomPerson = () => {
    const n = customName.trim();
    if (n && !selectedPeople.includes(n)) setSelectedPeople((a) => [...a, n]);
    setCustomName("");
  };
  return (
    <Modal title={`Neue Liste: ${label}`} onClose={onClose}>
      <label style={labelStyle}>Titel</label>
      <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
      <label style={labelStyle}>Datum (optional)</label>
      <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
      <label style={labelStyle}>Welche Pferde sind betroffen?</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {horses.map((h) => (
          <button key={h.id} type="button" onClick={() => toggleHorse(h.id)} style={{
            padding: "6px 11px", borderRadius: 999, border: `1px solid ${horseIds.includes(h.id) ? COLOR.accent : COLOR.line}`,
            background: horseIds.includes(h.id) ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
          }}>{h.name}</button>
        ))}
      </div>
      <label style={labelStyle}>Wer ist betroffen?</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {people.map((p) => (
          <button key={p} type="button" onClick={() => togglePerson(p)} style={{
            padding: "6px 11px", borderRadius: 999, border: `1px solid ${selectedPeople.includes(p) ? COLOR.accent : COLOR.line}`,
            background: selectedPeople.includes(p) ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
          }}>{p}</button>
        ))}
        {selectedPeople.filter((n) => !people.includes(n)).map((n) => (
          <button key={n} type="button" onClick={() => togglePerson(n)} style={{
            padding: "6px 11px", borderRadius: 999, border: `1px solid ${COLOR.accent}`, background: "#F3ECDD", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
          }}>{n} ✕</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        <input
          style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={customName} onChange={(e) => setCustomName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomPerson(); } }}
          placeholder="Eigenen Namen hinzufügen"
        />
        <button type="button" onClick={addCustomPerson} style={btnGhost}>+</button>
      </div>
      <button
        disabled={!title.trim()}
        onClick={() => onSave({ title: title.trim(), date, horseIds, people: selectedPeople })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: title.trim() ? 1 : 0.5 }}
      >Liste erstellen</button>
    </Modal>
  );
}

export function TemplateEditModal({ category, label, items, onAdd, onDelete, onClose }) {
  const [newText, setNewText] = useState("");
  const [newScope, setNewScope] = useState("shared");
  const scopeLabel = { shared: "gemeinsam", per_horse: "pro Pferd", per_person: "pro Person" };
  return (
    <Modal title={`Vorlage: ${label}`} onClose={onClose}>
      <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginBottom: 12 }}>
        Diese Vorschläge werden beim Starten einer neuen Liste automatisch übernommen. Beim Abschließen einer Liste wird diese Vorlage außerdem automatisch durch deren Punkte ersetzt.
      </div>
      {items.map((t) => (
        <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${COLOR.line}` }}>
          <span style={{ fontSize: 13, color: COLOR.ink }}>{t.item_text} <span style={{ fontSize: 11, color: COLOR.inkSoft }}>({scopeLabel[t.scope]})</span></span>
          <button onClick={() => onDelete(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 14, marginBottom: 8 }}>
        <button type="button" onClick={() => setNewScope("shared")} style={{
          flex: 1, padding: "6px 0", borderRadius: 9, border: `1px solid ${newScope === "shared" ? COLOR.accent : COLOR.line}`,
          background: newScope === "shared" ? "#F3ECDD" : "#fff", fontSize: 11.5, cursor: "pointer",
        }}>Gemeinsam</button>
        <button type="button" onClick={() => setNewScope("per_horse")} style={{
          flex: 1, padding: "6px 0", borderRadius: 9, border: `1px solid ${newScope === "per_horse" ? COLOR.accent : COLOR.line}`,
          background: newScope === "per_horse" ? "#F3ECDD" : "#fff", fontSize: 11.5, cursor: "pointer",
        }}>Pro Pferd</button>
        <button type="button" onClick={() => setNewScope("per_person")} style={{
          flex: 1, padding: "6px 0", borderRadius: 9, border: `1px solid ${newScope === "per_person" ? COLOR.accent : COLOR.line}`,
          background: newScope === "per_person" ? "#F3ECDD" : "#fff", fontSize: 11.5, cursor: "pointer",
        }}>Pro Person</button>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={newText} onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { onAdd(newText, newScope); setNewText(""); } }}
          placeholder="Neuer Vorschlag"
        />
        <button onClick={() => { onAdd(newText, newScope); setNewText(""); }} style={btnPrimary}>+</button>
      </div>
    </Modal>
  );
}

// Übersicht aller Packlisten (aktiv + letztes Beispiel je Kategorie), z.B. vom Kalender aus aufrufbar.
export default function PacklistenOverview({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [horses, setHorses] = useState([]);
  const [people, setPeople] = useState([]);
  const [openListId, setOpenListId] = useState(null);
  const [showNewFor, setShowNewFor] = useState(null);
  const [showTemplateFor, setShowTemplateFor] = useState(null);

  const load = async () => {
    const [listsData, tplData, horsesRes, peopleRes] = await Promise.all([
      fetchPackingLists(),
      fetchPackingTemplates(),
      supabase.from("horses").select("id, name"),
      supabase.from("profiles").select("name"),
    ]);
    setLists(listsData);
    setTemplates(tplData);
    setHorses(horsesRes.data ?? []);
    setPeople((peopleRes.data ?? []).map((p) => p.name));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const startList = async (category, data) => {
    const { error } = await createPackingList({ category, title: data.title, date: data.date, horseIds: data.horseIds, people: data.people });
    if (error) { alert("Konnte nicht gespeichert werden: " + (error.message || JSON.stringify(error))); return; }
    setShowNewFor(null);
    load();
  };

  if (loading) return null;

  if (openListId) {
    const list = lists.find((l) => l.id === openListId);
    if (!list) { setOpenListId(null); return null; }
    return <ListDetail list={list} horses={horses} onBack={() => setOpenListId(null)} onChanged={load} />;
  }

  return (
    <div>
      <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft, display: "flex", alignItems: "center", gap: 4, padding: "8px 0", fontSize: 13 }}>
        <ChevronLeft size={15} /> Kalender
      </button>
      <SectionTitle>
        <Briefcase size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Packlisten
      </SectionTitle>
      {Object.entries(PACKING_CATEGORIES).map(([key, label]) => {
        const active = lists.find((l) => l.category === key && l.status === "active");
        const example = lists.find((l) => l.category === key && l.status === "example");
        const doneCount = active ? (active.packing_items || []).filter((i) => i.done).length : 0;
        const totalCount = active ? (active.packing_items || []).length : 0;
        return (
          <Card key={key} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: COLOR.ink }}>{label}</span>
              <button onClick={() => setShowTemplateFor(key)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}>
                <Pencil size={13} />
              </button>
            </div>
            {active ? (
              <button onClick={() => setOpenListId(active.id)} style={{ ...btnPrimary, marginTop: 8 }}>
                {active.title} · {doneCount}/{totalCount} erledigt
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button onClick={() => setShowNewFor(key)} style={btnPrimary}><Plus size={13} style={{ verticalAlign: -2 }} /> Liste starten</button>
                {example && (
                  <button onClick={() => setOpenListId(example.id)} style={btnGhost}><BookOpen size={13} style={{ verticalAlign: -2 }} /> Letztes Beispiel</button>
                )}
              </div>
            )}
          </Card>
        );
      })}
      {showNewFor && (
        <NewListModal
          category={showNewFor} label={PACKING_CATEGORIES[showNewFor]} horses={horses} people={people}
          onClose={() => setShowNewFor(null)} onSave={(data) => startList(showNewFor, data)}
        />
      )}
      {showTemplateFor && (
        <TemplateEditModal
          category={showTemplateFor} label={PACKING_CATEGORIES[showTemplateFor]}
          items={templates.filter((t) => t.category === showTemplateFor)}
          onAdd={async (text, scope) => { await addTemplateItem(showTemplateFor, text, scope); load(); }}
          onDelete={async (id) => { await deleteTemplateItem(id); load(); }}
          onClose={() => setShowTemplateFor(null)}
        />
      )}
    </div>
  );
}
