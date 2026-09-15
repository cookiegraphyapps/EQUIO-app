import { useEffect, useState } from "react";
import { Briefcase, Plus, ChevronLeft, Trash2, Pencil, BookOpen } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, SectionTitle, Empty, Modal, COLOR, fmtDate, todayISO, inputStyle, labelStyle, btnPrimary, btnGhost } from "./ui";

const CATEGORIES = {
  umzug: "Umzug / Koppelwechsel",
  wanderritt_1tag: "Wanderritt (1 Tag)",
  wanderritt_mehrtaegig: "Wanderritt (mehrtägig)",
  urlaub_mit_pferd: "Urlaub mit Pferd",
};

export default function PacklisteSection({ user }) {
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [horses, setHorses] = useState([]);
  const [people, setPeople] = useState([]);
  const [openListId, setOpenListId] = useState(null);
  const [showNewFor, setShowNewFor] = useState(null); // category key
  const [showTemplateFor, setShowTemplateFor] = useState(null); // category key

  const load = async () => {
    const [listsRes, tplRes, horsesRes, peopleRes] = await Promise.all([
      supabase.from("packing_lists").select("*, packing_items(*)").order("created_at", { ascending: false }),
      supabase.from("packing_templates").select("*").order("order_index"),
      supabase.from("horses").select("id, name"),
      supabase.from("profiles").select("name"),
    ]);
    setLists(listsRes.data ?? []);
    setTemplates(tplRes.data ?? []);
    setHorses(horsesRes.data ?? []);
    setPeople((peopleRes.data ?? []).map((p) => p.name));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const startList = async (category, data) => {
    const tpl = templates.filter((t) => t.category === category);
    const { data: list, error } = await supabase.from("packing_lists").insert({
      category, title: data.title || CATEGORIES[category], date: data.date || null,
      horse_ids: data.horseIds, people: data.people, status: "active",
    }).select().single();
    if (error || !list) return;
    const items = [];
    tpl.forEach((t) => {
      if (t.scope === "shared") {
        items.push({ list_id: list.id, text: t.item_text, scope: "shared", horse_id: null });
      } else {
        data.horseIds.forEach((hid) => items.push({ list_id: list.id, text: t.item_text, scope: "per_horse", horse_id: hid }));
      }
    });
    if (items.length > 0) await supabase.from("packing_items").insert(items);
    setShowNewFor(null);
    load();
  };

  const toggleItem = async (item) => {
    await supabase.from("packing_items").update({ done: !item.done }).eq("id", item.id);
    load();
  };

  const addItem = async (list, text, scope, horseId) => {
    if (!text.trim()) return;
    await supabase.from("packing_items").insert({ list_id: list.id, text: text.trim(), scope, horse_id: horseId || null });
    load();
  };

  const deleteItem = async (id) => {
    await supabase.from("packing_items").delete().eq("id", id);
    load();
  };

  const finishList = async (list) => {
    const oldExample = lists.find((l) => l.category === list.category && l.status === "example");
    if (oldExample) await supabase.from("packing_lists").delete().eq("id", oldExample.id);
    await supabase.from("packing_lists").update({ status: "example" }).eq("id", list.id);
    setOpenListId(null);
    load();
  };

  const deleteList = async (id) => {
    await supabase.from("packing_lists").delete().eq("id", id);
    setOpenListId(null);
    load();
  };

  const addTemplateItem = async (category, text, scope) => {
    if (!text.trim()) return;
    const maxOrder = Math.max(0, ...templates.filter((t) => t.category === category).map((t) => t.order_index));
    await supabase.from("packing_templates").insert({ category, item_text: text.trim(), scope, order_index: maxOrder + 1 });
    load();
  };
  const deleteTemplateItem = async (id) => {
    await supabase.from("packing_templates").delete().eq("id", id);
    load();
  };

  if (loading) return null;

  if (openListId) {
    const list = lists.find((l) => l.id === openListId);
    if (!list) { setOpenListId(null); return null; }
    return (
      <ListDetail
        list={list} horses={horses} user={user}
        onBack={() => setOpenListId(null)}
        onToggleItem={toggleItem} onAddItem={addItem} onDeleteItem={deleteItem}
        onFinish={() => finishList(list)} onDelete={() => deleteList(list.id)}
      />
    );
  }

  return (
    <div>
      <SectionTitle>
        <Briefcase size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Packlisten
      </SectionTitle>
      {Object.entries(CATEGORIES).map(([key, label]) => {
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
          category={showNewFor} label={CATEGORIES[showNewFor]} horses={horses} people={people}
          onClose={() => setShowNewFor(null)} onSave={(data) => startList(showNewFor, data)}
        />
      )}
      {showTemplateFor && (
        <TemplateEditModal
          category={showTemplateFor} label={CATEGORIES[showTemplateFor]}
          items={templates.filter((t) => t.category === showTemplateFor)}
          onAdd={(text, scope) => addTemplateItem(showTemplateFor, text, scope)}
          onDelete={deleteTemplateItem}
          onClose={() => setShowTemplateFor(null)}
        />
      )}
    </div>
  );
}

function ListDetail({ list, horses, user, onBack, onToggleItem, onAddItem, onDeleteItem, onFinish, onDelete }) {
  const [newShared, setNewShared] = useState("");
  const [newPerHorse, setNewPerHorse] = useState({});
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const readOnly = list.status === "example";
  const items = list.packing_items || [];
  const sharedItems = items.filter((i) => i.scope === "shared");
  const horseNames = Object.fromEntries(horses.map((h) => [h.id, h.name]));

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft, display: "flex", alignItems: "center", gap: 4, padding: "8px 0", fontSize: 13 }}>
        <ChevronLeft size={15} /> Packlisten
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 19, fontWeight: 700, color: COLOR.ink }}>{list.title}</div>
          <div style={{ fontSize: 12, color: COLOR.inkSoft, marginTop: 2 }}>
            {list.date && `${fmtDate(list.date)} · `}
            {(list.people || []).length > 0 && `${list.people.join(", ")}`}
            {readOnly && " · Letztes Beispiel (nur Ansicht)"}
          </div>
        </div>
      </div>

      <SectionTitle>Gemeinsam</SectionTitle>
      {sharedItems.length === 0 && <Empty text="Keine gemeinsamen Punkte." />}
      {sharedItems.map((i) => (
        <ItemRow key={i.id} item={i} readOnly={readOnly} onToggle={() => onToggleItem(i)} onDelete={() => onDeleteItem(i.id)} />
      ))}
      {!readOnly && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <input
            style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={newShared}
            onChange={(e) => setNewShared(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { onAddItem(list, newShared, "shared", null); setNewShared(""); } }}
            placeholder="Punkt hinzufügen …"
          />
          <button onClick={() => { onAddItem(list, newShared, "shared", null); setNewShared(""); }} style={btnGhost}>+</button>
        </div>
      )}

      {(list.horse_ids || []).map((hid) => {
        const horseItems = items.filter((i) => i.scope === "per_horse" && i.horse_id === hid);
        return (
          <div key={hid}>
            <SectionTitle>Für {horseNames[hid] || "?"}</SectionTitle>
            {horseItems.length === 0 && <Empty text="Keine Punkte." />}
            {horseItems.map((i) => (
              <ItemRow key={i.id} item={i} readOnly={readOnly} onToggle={() => onToggleItem(i)} onDelete={() => onDeleteItem(i.id)} />
            ))}
            {!readOnly && (
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                <input
                  style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={newPerHorse[hid] || ""}
                  onChange={(e) => setNewPerHorse((s) => ({ ...s, [hid]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { onAddItem(list, newPerHorse[hid] || "", "per_horse", hid); setNewPerHorse((s) => ({ ...s, [hid]: "" })); } }}
                  placeholder="Punkt hinzufügen …"
                />
                <button onClick={() => { onAddItem(list, newPerHorse[hid] || "", "per_horse", hid); setNewPerHorse((s) => ({ ...s, [hid]: "" })); }} style={btnGhost}>+</button>
              </div>
            )}
          </div>
        );
      })}

      {!readOnly && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {confirmFinish ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onFinish} style={{ ...btnPrimary, flex: 1 }}>Ja, abschließen</button>
              <button onClick={() => setConfirmFinish(false)} style={{ ...btnGhost, flex: 1 }}>Abbrechen</button>
            </div>
          ) : (
            <button onClick={() => setConfirmFinish(true)} style={btnPrimary}>Liste abschließen</button>
          )}
          {confirmDelete ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onDelete} style={{ ...btnPrimary, background: COLOR.dringend, flex: 1 }}>Wirklich löschen</button>
              <button onClick={() => setConfirmDelete(false)} style={{ ...btnGhost, flex: 1 }}>Abbrechen</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.dringend, fontSize: 12 }}>
              Ohne Speichern löschen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, readOnly, onToggle, onDelete }) {
  return (
    <Card style={{ marginBottom: 6, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
      <button onClick={readOnly ? undefined : onToggle} disabled={readOnly} style={{
        width: 20, height: 20, borderRadius: 5, border: `2px solid ${item.done ? COLOR.erledigt : COLOR.line}`,
        background: item.done ? COLOR.erledigt : "#fff", cursor: readOnly ? "default" : "pointer", flexShrink: 0,
      }} />
      <span style={{ fontSize: 13.5, color: item.done ? COLOR.inkSoft : COLOR.ink, textDecoration: item.done ? "line-through" : "none", flex: 1 }}>{item.text}</span>
      {!readOnly && (
        <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}>
          <Trash2 size={13} />
        </button>
      )}
    </Card>
  );
}

function NewListModal({ category, label, horses, people, onClose, onSave }) {
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

function TemplateEditModal({ category, label, items, onAdd, onDelete, onClose }) {
  const [newText, setNewText] = useState("");
  const [newScope, setNewScope] = useState("shared");
  return (
    <Modal title={`Vorlage: ${label}`} onClose={onClose}>
      <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginBottom: 12 }}>
        Diese Vorschläge werden beim Starten einer neuen Liste automatisch übernommen. Änderungen hier wirken sich nicht auf bereits laufende Listen aus.
      </div>
      {items.map((t) => (
        <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${COLOR.line}` }}>
          <span style={{ fontSize: 13, color: COLOR.ink }}>{t.item_text} <span style={{ fontSize: 11, color: COLOR.inkSoft }}>({t.scope === "shared" ? "gemeinsam" : "pro Pferd"})</span></span>
          <button onClick={() => onDelete(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 14, marginBottom: 8 }}>
        <button type="button" onClick={() => setNewScope("shared")} style={{
          flex: 1, padding: "6px 0", borderRadius: 9, border: `1px solid ${newScope === "shared" ? COLOR.accent : COLOR.line}`,
          background: newScope === "shared" ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer",
        }}>Gemeinsam</button>
        <button type="button" onClick={() => setNewScope("per_horse")} style={{
          flex: 1, padding: "6px 0", borderRadius: 9, border: `1px solid ${newScope === "per_horse" ? COLOR.accent : COLOR.line}`,
          background: newScope === "per_horse" ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer",
        }}>Pro Pferd</button>
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
