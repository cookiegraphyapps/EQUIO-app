import { useEffect, useState } from "react";
import { Hammer, Plus, ChevronLeft, ChevronUp, ChevronDown, Trash2, Camera, Link as LinkIcon, Lock } from "lucide-react";
import { supabase, uploadPhoto } from "../supabaseClient";
import { Card, SectionTitle, Empty, Pill, Modal, IconBtn, COLOR, inputStyle, labelStyle, btnPrimary, btnGhost } from "./ui";

const STATUS = {
  idee: { label: "Idee", bg: "#F3ECDD", fg: COLOR.inkSoft },
  geplant: { label: "Geplant", bg: COLOR.privatBg, fg: COLOR.privat },
  in_arbeit: { label: "In Arbeit", bg: COLOR.uebernommenBg, fg: COLOR.uebernommen },
  fertig: { label: "Fertig", bg: COLOR.erledigtBg, fg: COLOR.erledigt },
};
const SEASON = {
  egal: { label: "Egal wann", icon: "🔁" },
  sommer: { label: "Nur Sommer", icon: "☀️" },
  winter: { label: "Nur Winter", icon: "❄️" },
};
const CATEGORY = {
  umbau: { label: "Umbauprojekte", icon: "🔨" },
  aufraeumen: { label: "Verschönerungsprojekte", icon: "🧹" },
};

// Rechnet die effektive Wartezeit eines Projekts: eigene Tage + Tage aller noch nicht
// fertigen Abhängigkeiten (rekursiv, mit Zyklenschutz).
function effectiveDays(project, allProjects, seen = new Set()) {
  if (seen.has(project.id)) return 0; // Zyklenschutz
  seen.add(project.id);
  let total = Number(project.days) || 0;
  (project.depends_on || []).forEach((depId) => {
    const dep = allProjects.find((p) => p.id === depId);
    if (dep && dep.status !== "fertig") total += effectiveDays(dep, allProjects, seen);
  });
  return total;
}

export default function StallumbauSection({ isAdmin }) {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("renovation_projects").select("*").order("order_index");
    setProjects(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const addProject = async (data) => {
    const siblings = projects.filter((p) => (p.parent_id || null) === (data.parentId || null));
    const maxOrder = Math.max(0, ...siblings.map((p) => p.order_index));
    await supabase.from("renovation_projects").insert({ title: data.title, order_index: maxOrder + 1, parent_id: data.parentId || null });
    setShowNew(false);
    load();
  };

  // Sortiert nur innerhalb derselben Geschwister-Ebene (gleiches Überprojekt bzw. beide Top-Level).
  const move = async (list, i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const a = list[i], b = list[j];
    await Promise.all([
      supabase.from("renovation_projects").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("renovation_projects").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    load();
  };

  if (loading) return null;

  if (openId) {
    const project = projects.find((p) => p.id === openId);
    if (!project) { setOpenId(null); return null; }
    return (
      <ProjectDetail
        project={project} allProjects={projects} isAdmin={isAdmin}
        onBack={() => setOpenId(project.parent_id || null)} onOpen={setOpenId} onChanged={load}
        onAddChild={(data) => addProject({ ...data, parentId: project.id })}
        onMoveChild={move}
        onDelete={async () => { await supabase.from("renovation_projects").delete().eq("id", project.id); setOpenId(project.parent_id || null); load(); }}
      />
    );
  }

  const topLevel = projects.filter((p) => !p.parent_id);

  return (
    <div>
      <SectionTitle right={<IconBtn onClick={() => setShowNew(true)}><Plus size={15} /> Projekt</IconBtn>}>
        <Hammer size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Stallprojekte
      </SectionTitle>
      {topLevel.length === 0 && <Empty text="Noch keine Projekte." />}
      {topLevel.map((p, i) => {
        const blockedBy = (p.depends_on || []).map((id) => projects.find((x) => x.id === id)).filter((d) => d && d.status !== "fertig");
        const days = effectiveDays(p, projects);
        const statusInfo = STATUS[p.status] || STATUS.idee;
        const childCount = projects.filter((x) => x.parent_id === p.id).length;
        return (
          <Card key={p.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div onClick={() => setOpenId(p.id)} style={{ cursor: "pointer", flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: COLOR.ink }}>{p.title}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  <Pill bg={statusInfo.bg} fg={statusInfo.fg}>{statusInfo.label}</Pill>
                  <span style={{ fontSize: 11.5, color: COLOR.inkSoft }}>{CATEGORY[p.category]?.icon} {CATEGORY[p.category]?.label}</span>
                  {p.season !== "egal" && <span style={{ fontSize: 11.5, color: COLOR.inkSoft }}>{SEASON[p.season]?.icon} {SEASON[p.season]?.label}</span>}
                  {days > 0 && <span style={{ fontSize: 11.5, color: COLOR.inkSoft }}>~{days} Tg. gesamt</span>}
                  {childCount > 0 && <span style={{ fontSize: 11.5, color: COLOR.inkSoft }}>· {childCount} Teilprojekt{childCount === 1 ? "" : "e"}</span>}
                </div>
                {blockedBy.length > 0 && (
                  <div style={{ fontSize: 11.5, color: COLOR.dringend, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <Lock size={11} /> Blockiert durch: {blockedBy.map((d) => d.title).join(", ")}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <button onClick={() => move(topLevel, i, -1)} disabled={i === 0} style={{ background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.3 : 1, padding: 0 }}><ChevronUp size={14} /></button>
                <button onClick={() => move(topLevel, i, 1)} disabled={i === topLevel.length - 1} style={{ background: "none", border: "none", cursor: i === topLevel.length - 1 ? "default" : "pointer", opacity: i === topLevel.length - 1 ? 0.3 : 1, padding: 0 }}><ChevronDown size={14} /></button>
              </div>
            </div>
          </Card>
        );
      })}
      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onSave={addProject} />}
    </div>
  );
}

function NewProjectModal({ onClose, onSave }) {
  const [title, setTitle] = useState("");
  return (
    <Modal title="Neues Projekt" onClose={onClose}>
      <label style={labelStyle}>Titel</label>
      <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Reitplatzbeleuchtung" />
      <button disabled={!title.trim()} onClick={() => onSave({ title: title.trim() })} style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: title.trim() ? 1 : 0.5 }}>Anlegen</button>
    </Modal>
  );
}

function ProjectDetail({ project, allProjects, isAdmin, onBack, onOpen, onAddChild, onMoveChild, onChanged, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [showNewChild, setShowNewChild] = useState(false);
  const children = allProjects.filter((p) => p.parent_id === project.id);
  const parentProject = project.parent_id ? allProjects.find((p) => p.id === project.parent_id) : null;
  const [title, setTitle] = useState(project.title);
  const [status, setStatus] = useState(project.status);
  const [description, setDescription] = useState(project.description || "");
  const [days, setDays] = useState(project.days || "");
  const [season, setSeason] = useState(project.season || "egal");
  const [category, setCategory] = useState(project.category || "umbau");
  const [dependsOn, setDependsOn] = useState(project.depends_on || []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [links, setLinks] = useState([]);
  const [items, setItems] = useState([]);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkNote, setNewLinkNote] = useState("");
  const [newItemText, setNewItemText] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadSub = async () => {
    const [linksRes, itemsRes] = await Promise.all([
      supabase.from("renovation_links").select("*").eq("project_id", project.id).order("created_at"),
      supabase.from("renovation_shopping_items").select("*").eq("project_id", project.id).order("created_at"),
    ]);
    setLinks(linksRes.data ?? []);
    setItems(itemsRes.data ?? []);
  };
  useEffect(() => { loadSub(); }, [project.id]);

  const otherProjects = allProjects.filter((p) => p.id !== project.id);
  // Verhindert Ringabhängigkeiten: ein Projekt darf nicht ausgewählt werden,
  // wenn es (direkt oder über die Kette) bereits von diesem Projekt abhängt.
  const wouldCycle = (candidateId) => {
    const visited = new Set();
    const dependsOnThis = (id) => {
      if (visited.has(id)) return false;
      visited.add(id);
      const p = allProjects.find((x) => x.id === id);
      if (!p) return false;
      if ((p.depends_on || []).includes(project.id)) return true;
      return (p.depends_on || []).some(dependsOnThis);
    };
    return dependsOnThis(candidateId);
  };
  const toggleDepend = (id) => setDependsOn((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  const save = async () => {
    await supabase.from("renovation_projects").update({
      title: title.trim(), status, description: description.trim() || null, days: days ? Number(days) : 0, depends_on: dependsOn, season, category,
    }).eq("id", project.id);
    setEditing(false);
    onChanged();
  };

  const onSketchChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadPhoto(file, "renovation");
    await supabase.from("renovation_projects").update({ sketch_url: url }).eq("id", project.id);
    setUploading(false);
    onChanged();
  };

  const addLink = async () => {
    if (!newLinkUrl.trim()) return;
    await supabase.from("renovation_links").insert({ project_id: project.id, url: newLinkUrl.trim(), note: newLinkNote.trim() || null });
    setNewLinkUrl(""); setNewLinkNote("");
    loadSub();
  };
  const deleteLink = async (id) => { await supabase.from("renovation_links").delete().eq("id", id); loadSub(); };

  const addItem = async () => {
    if (!newItemText.trim()) return;
    await supabase.from("renovation_shopping_items").insert({ project_id: project.id, text: newItemText.trim(), estimated_price: newItemPrice ? Number(newItemPrice) : null });
    setNewItemText(""); setNewItemPrice("");
    loadSub();
  };
  const toggleItem = async (it) => { await supabase.from("renovation_shopping_items").update({ bought: !it.bought }).eq("id", it.id); loadSub(); };
  const deleteItem = async (id) => { await supabase.from("renovation_shopping_items").delete().eq("id", id); loadSub(); };

  const total = items.reduce((s, it) => s + Number(it.estimated_price || 0), 0);
  const days_total = effectiveDays({ ...project, days: Number(days) || 0, depends_on: dependsOn }, allProjects);

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft, display: "flex", alignItems: "center", gap: 4, padding: "8px 0", fontSize: 13 }}>
        <ChevronLeft size={15} /> {parentProject ? parentProject.title : "Stallprojekte"}
      </button>

      {editing ? (
        <Card style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Titel</label>
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
          <label style={labelStyle}>Status</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {Object.entries(STATUS).map(([key, v]) => (
              <button key={key} type="button" onClick={() => setStatus(key)} style={{
                padding: "6px 11px", borderRadius: 999, border: `1px solid ${status === key ? COLOR.accent : COLOR.line}`,
                background: status === key ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
              }}>{v.label}</button>
            ))}
          </div>
          <label style={labelStyle}>Art des Projekts</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {Object.entries(CATEGORY).map(([key, v]) => (
              <button key={key} type="button" onClick={() => setCategory(key)} style={{
                padding: "6px 11px", borderRadius: 999, border: `1px solid ${category === key ? COLOR.accent : COLOR.line}`,
                background: category === key ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
              }}>{v.icon} {v.label}</button>
            ))}
          </div>
          <label style={labelStyle}>Wann machbar?</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {Object.entries(SEASON).map(([key, v]) => (
              <button key={key} type="button" onClick={() => setSeason(key)} style={{
                padding: "6px 11px", borderRadius: 999, border: `1px solid ${season === key ? COLOR.accent : COLOR.line}`,
                background: season === key ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
              }}>{v.icon} {v.label}</button>
            ))}
          </div>
          <label style={labelStyle}>Grobe Planung</label>
          <textarea style={{ ...inputStyle, minHeight: 80 }} value={description} onChange={(e) => setDescription(e.target.value)} />
          <label style={labelStyle}>Eigene Zeitschätzung (Tage)</label>
          <input type="number" style={inputStyle} value={days} onChange={(e) => setDays(e.target.value)} />
          <label style={labelStyle}>Hängt ab von (optional)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {otherProjects.length === 0 && <div style={{ fontSize: 12, color: COLOR.inkSoft }}>Keine anderen Projekte vorhanden.</div>}
            {otherProjects.map((p) => {
              const disabled = wouldCycle(p.id);
              return (
                <button key={p.id} type="button" disabled={disabled} onClick={() => toggleDepend(p.id)} style={{
                  padding: "6px 11px", borderRadius: 999, border: `1px solid ${dependsOn.includes(p.id) ? COLOR.accent : COLOR.line}`,
                  background: dependsOn.includes(p.id) ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: disabled ? "not-allowed" : "pointer",
                  color: disabled ? COLOR.line : COLOR.ink, opacity: disabled ? 0.5 : 1,
                }}>{p.title}</button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} style={{ ...btnPrimary, flex: 1 }}>Speichern</button>
            <button onClick={() => setEditing(false)} style={{ ...btnGhost, flex: 1 }}>Abbrechen</button>
          </div>
        </Card>
      ) : (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 19, fontWeight: 700, color: COLOR.ink }}>{project.title}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                <Pill bg={STATUS[project.status]?.bg} fg={STATUS[project.status]?.fg}>{STATUS[project.status]?.label}</Pill>
                <span style={{ fontSize: 12, color: COLOR.inkSoft }}>{CATEGORY[project.category]?.icon} {CATEGORY[project.category]?.label}</span>
                {project.season !== "egal" && <span style={{ fontSize: 12, color: COLOR.inkSoft }}>{SEASON[project.season]?.icon} {SEASON[project.season]?.label}</span>}
                {days_total > 0 && <span style={{ fontSize: 12, color: COLOR.inkSoft }}>~{days_total} Tg. gesamt (inkl. Abhängigkeiten)</span>}
              </div>
              {project.description && <div style={{ fontSize: 13, color: COLOR.ink, marginTop: 8, whiteSpace: "pre-wrap" }}>{project.description}</div>}
              {(project.depends_on || []).length > 0 && (
                <div style={{ fontSize: 12, color: COLOR.inkSoft, marginTop: 6 }}>
                  Hängt ab von: {project.depends_on.map((id) => allProjects.find((p) => p.id === id)?.title).filter(Boolean).join(", ")}
                </div>
              )}
            </div>
            <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}>✏️</button>
          </div>
        </Card>
      )}

      <SectionTitle right={<IconBtn onClick={() => setShowNewChild(true)}><Plus size={14} /> Teilprojekt</IconBtn>}>Teilprojekte</SectionTitle>
      {children.length === 0 && <Empty text="Noch keine Teilprojekte." />}
      {children.map((c, i) => {
        const statusInfo = STATUS[c.status] || STATUS.idee;
        return (
          <Card key={c.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div onClick={() => onOpen(c.id)} style={{ cursor: "pointer", flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: COLOR.ink }}>{c.title}</div>
                <div style={{ marginTop: 3 }}><Pill bg={statusInfo.bg} fg={statusInfo.fg}>{statusInfo.label}</Pill></div>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <button onClick={() => onMoveChild(children, i, -1)} disabled={i === 0} style={{ background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.3 : 1, padding: 0 }}><ChevronUp size={13} /></button>
                <button onClick={() => onMoveChild(children, i, 1)} disabled={i === children.length - 1} style={{ background: "none", border: "none", cursor: i === children.length - 1 ? "default" : "pointer", opacity: i === children.length - 1 ? 0.3 : 1, padding: 0 }}><ChevronDown size={13} /></button>
              </div>
            </div>
          </Card>
        );
      })}
      {showNewChild && (
        <NewProjectModal onClose={() => setShowNewChild(false)} onSave={(data) => { onAddChild(data); setShowNewChild(false); }} />
      )}

      <SectionTitle>Skizze</SectionTitle>
      <Card style={{ marginBottom: 14 }}>
        {project.sketch_url && <img src={project.sketch_url} alt="Skizze" style={{ width: "100%", borderRadius: 10, marginBottom: 10 }} />}
        <label style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <Camera size={14} /> {uploading ? "Lädt hoch …" : project.sketch_url ? "Skizze ersetzen" : "Skizze hochladen"}
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={onSketchChange} />
        </label>
      </Card>

      <SectionTitle>Links</SectionTitle>
      {links.length === 0 && <Empty text="Noch keine Links." />}
      {links.map((l) => (
        <Card key={l.id} style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <a href={l.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: COLOR.ink, textDecoration: "none", display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
            <LinkIcon size={13} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.note || l.url}</span>
          </a>
          <button onClick={() => deleteLink(l.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft, flexShrink: 0 }}>
            <Trash2 size={13} />
          </button>
        </Card>
      ))}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
        <input style={{ ...inputStyle, marginBottom: 0 }} value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} placeholder="Link (URL)" />
        <div style={{ display: "flex", gap: 6 }}>
          <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={newLinkNote} onChange={(e) => setNewLinkNote(e.target.value)} placeholder="Notiz (optional)" />
          <button onClick={addLink} style={btnGhost}>+</button>
        </div>
      </div>

      <SectionTitle>Einkaufsliste</SectionTitle>
      {items.length === 0 && <Empty text="Noch keine Positionen." />}
      {items.map((it) => (
        <Card key={it.id} style={{ marginBottom: 6, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => toggleItem(it)} style={{
            width: 20, height: 20, borderRadius: 5, border: `2px solid ${it.bought ? COLOR.erledigt : COLOR.line}`,
            background: it.bought ? COLOR.erledigt : "#fff", cursor: "pointer", flexShrink: 0,
          }} />
          <span style={{ fontSize: 13.5, color: it.bought ? COLOR.inkSoft : COLOR.ink, textDecoration: it.bought ? "line-through" : "none", flex: 1 }}>{it.text}</span>
          {it.estimated_price != null && <span style={{ fontSize: 12.5, color: COLOR.inkSoft }}>{Number(it.estimated_price).toFixed(2)} €</span>}
          <button onClick={() => deleteItem(it.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}>
            <Trash2 size={13} />
          </button>
        </Card>
      ))}
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={newItemText} onChange={(e) => setNewItemText(e.target.value)} placeholder="Position" />
        <input type="number" style={{ ...inputStyle, marginBottom: 0, width: 90 }} value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value)} placeholder="€" />
        <button onClick={addItem} style={btnGhost}>+</button>
      </div>
      {total > 0 && (
        <div style={{ fontSize: 13, color: COLOR.ink, marginBottom: 16 }}>
          Grobe Kalkulation gesamt: <strong>{total.toFixed(2)} €</strong>
        </div>
      )}

      {isAdmin && (
        <div style={{ marginTop: 12, textAlign: "center" }}>
          {confirmDelete ? (
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button onClick={onDelete} style={{ ...btnPrimary, background: COLOR.dringend }}>Wirklich löschen</button>
              <button onClick={() => setConfirmDelete(false)} style={btnGhost}>Abbrechen</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.dringend, fontSize: 12 }}>
              Projekt löschen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
