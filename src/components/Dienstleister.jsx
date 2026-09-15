import { useEffect, useState } from "react";
import { ChevronLeft, Stethoscope, Phone, Star, Plus, Settings, Pencil, Trash2 } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, SectionTitle, Empty, Pill, Modal, IconBtn, COLOR, inputStyle, labelStyle, btnPrimary, btnGhost } from "./ui";

const VERDICTS = {
  ja: { label: "Ja", bg: COLOR.erledigtBg, fg: COLOR.erledigt },
  notfall: { label: "Nur im Notfall", bg: COLOR.uebernommenBg, fg: COLOR.uebernommen },
  nein: { label: "No-Go", bg: COLOR.dringendBg, fg: COLOR.dringend },
};

export default function DienstleisterSection({ user, isAdmin }) {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState("alle");
  const [open, setOpen] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showManageCategories, setShowManageCategories] = useState(false);

  const load = async () => {
    const [provRes, catRes] = await Promise.all([
      supabase.from("service_providers").select("*, service_provider_reviews(*)").order("name"),
      supabase.from("service_provider_categories").select("*").order("created_at"),
    ]);
    setProviders(provRes.data ?? []);
    setCategories(catRes.data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const addProvider = async (data) => {
    await supabase.from("service_providers").insert({
      name: data.name, category: data.category, phone: data.phone || null, specialty: data.specialty || null, notes: data.notes || null,
    });
    setShowAdd(false);
    load();
  };

  const addCategory = async (label) => {
    let key = label.trim().toLowerCase()
      .replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" }[c]))
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!key) return;
    if (categories.some((c) => c.key === key)) key = `${key}_${Date.now().toString().slice(-4)}`;
    await supabase.from("service_provider_categories").insert({ key, label: label.trim() });
    load();
  };
  const deleteCategory = async (key) => {
    await supabase.from("service_provider_categories").delete().eq("key", key);
    if (categoryFilter === key) setCategoryFilter("alle");
    load();
  };

  if (loading) return null;

  if (open) {
    const provider = providers.find((p) => p.id === open);
    return (
      <ProviderDetail
        provider={provider}
        user={user}
        isAdmin={isAdmin}
        categories={categories}
        onBack={() => setOpen(null)}
        onSaved={load}
        onDeleted={() => { setOpen(null); load(); }}
      />
    );
  }

  const filtered = categoryFilter === "alle" ? providers : providers.filter((p) => p.category === categoryFilter);

  return (
    <div>
      <SectionTitle right={<IconBtn onClick={() => setShowAdd(true)}><Plus size={15} /> Dienstleister</IconBtn>}>
        <Stethoscope size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Dienstleister
      </SectionTitle>
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
        {isAdmin && (
          <button onClick={() => setShowManageCategories(true)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft, padding: 4, display: "flex" }}>
            <Settings size={15} />
          </button>
        )}
      </div>
      {filtered.length === 0 && <Empty text="Noch keine Dienstleister eingetragen." />}
      {filtered.map((p) => {
        const reviews = p.service_provider_reviews || [];
        const avgRating = reviews.filter((r) => r.rating).length
          ? (reviews.reduce((a, r) => a + (r.rating || 0), 0) / reviews.filter((r) => r.rating).length).toFixed(1)
          : null;
        const catLabel = categories.find((c) => c.key === p.category)?.label || p.category;
        return (
          <Card key={p.id} onClick={() => setOpen(p.id)} style={{ marginBottom: 8, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: COLOR.ink }}>{p.name}</div>
                <div style={{ fontSize: 12, color: COLOR.inkSoft, marginTop: 2 }}>{catLabel}{p.specialty ? ` · ${p.specialty}` : ""}</div>
                {p.phone && <div style={{ fontSize: 12.5, color: COLOR.ink, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}><Phone size={12} />{p.phone}</div>}
              </div>
              {avgRating && (
                <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12.5, color: COLOR.ink, flexShrink: 0 }}>
                  <Star size={13} fill={COLOR.accent} color={COLOR.accent} />{avgRating}
                </div>
              )}
            </div>
          </Card>
        );
      })}
      {showAdd && <AddProviderModal categories={categories} onClose={() => setShowAdd(false)} onSave={addProvider} />}
      {showManageCategories && (
        <ManageProviderCategoriesModal categories={categories} onAdd={addCategory} onDelete={deleteCategory} onClose={() => setShowManageCategories(false)} />
      )}
    </div>
  );
}

function ProviderDetail({ provider, user, isAdmin, categories, onBack, onSaved, onDeleted }) {
  const [editingInfo, setEditingInfo] = useState(false);
  const [name, setName] = useState(provider.name);
  const [category, setCategory] = useState(provider.category);
  const [phone, setPhone] = useState(provider.phone || "");
  const [specialty, setSpecialty] = useState(provider.specialty || "");
  const [notes, setNotes] = useState(provider.notes || "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const reviews = provider.service_provider_reviews || [];
  const myReview = reviews.find((r) => r.user_name === user);
  const [myRating, setMyRating] = useState(myReview?.rating || 0);
  const [myVerdict, setMyVerdict] = useState(myReview?.verdict || "ja");
  const [myComment, setMyComment] = useState(myReview?.comment || "");
  const [savingReview, setSavingReview] = useState(false);

  const saveInfo = async () => {
    await supabase.from("service_providers").update({
      name: name.trim(), category, phone: phone.trim() || null, specialty: specialty.trim() || null, notes: notes.trim() || null,
    }).eq("id", provider.id);
    setEditingInfo(false);
    onSaved();
  };

  const saveReview = async () => {
    setSavingReview(true);
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("service_provider_reviews").upsert({
      provider_id: provider.id, user_id: userData.user.id, user_name: user,
      rating: myRating || null, verdict: myVerdict, comment: myComment.trim() || null, updated_at: new Date().toISOString(),
    }, { onConflict: "provider_id,user_id" });
    setSavingReview(false);
    onSaved();
  };

  const deleteProvider = async () => {
    await supabase.from("service_providers").delete().eq("id", provider.id);
    onDeleted();
  };

  const catLabel = categories.find((c) => c.key === provider.category)?.label || provider.category;

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft, display: "flex", alignItems: "center", gap: 4, padding: "8px 0", fontSize: 13 }}>
        <ChevronLeft size={15} /> Dienstleister
      </button>

      {editingInfo ? (
        <Card style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Name</label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
          <label style={labelStyle}>Kategorie</label>
          <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <label style={labelStyle}>Telefonnummer</label>
          <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <label style={labelStyle}>Fachgebiet</label>
          <input style={inputStyle} value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
          <label style={labelStyle}>Notiz / Erreichbarkeit</label>
          <textarea style={{ ...inputStyle, minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveInfo} style={{ ...btnPrimary, flex: 1 }}>Speichern</button>
            <button onClick={() => setEditingInfo(false)} style={{ ...btnGhost, flex: 1 }}>Abbrechen</button>
          </div>
        </Card>
      ) : (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 19, fontWeight: 700, color: COLOR.ink }}>{provider.name}</div>
              <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginTop: 2 }}>{catLabel}{provider.specialty ? ` · ${provider.specialty}` : ""}</div>
              {provider.phone && (
                <a href={`tel:${provider.phone}`} style={{ fontSize: 13.5, color: COLOR.ink, marginTop: 8, display: "flex", alignItems: "center", gap: 5, textDecoration: "none" }}>
                  <Phone size={13} />{provider.phone}
                </a>
              )}
              {provider.notes && <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginTop: 8 }}>{provider.notes}</div>}
            </div>
            <button onClick={() => setEditingInfo(true)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}>
              <Pencil size={14} />
            </button>
          </div>
        </Card>
      )}

      <SectionTitle>Meine Einschätzung</SectionTitle>
      <Card style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Würde ich für mein Pferd nehmen?</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {Object.entries(VERDICTS).map(([k, v]) => (
            <button key={k} type="button" onClick={() => setMyVerdict(k)} style={{
              padding: "6px 11px", borderRadius: 999, border: `1px solid ${myVerdict === k ? v.fg : COLOR.line}`,
              background: myVerdict === k ? v.bg : "#fff", fontSize: 12.5, cursor: "pointer", color: myVerdict === k ? v.fg : COLOR.ink, fontWeight: myVerdict === k ? 700 : 400,
            }}>{v.label}</button>
          ))}
        </div>
        <label style={labelStyle}>Bewertung (optional)</label>
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setMyRating(myRating === n ? 0 : n)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <Star size={22} fill={n <= myRating ? COLOR.accent : "none"} color={COLOR.accent} />
            </button>
          ))}
        </div>
        <label style={labelStyle}>Kommentar (optional)</label>
        <textarea style={{ ...inputStyle, minHeight: 60 }} value={myComment} onChange={(e) => setMyComment(e.target.value)} placeholder="z. B. war super bei Koliken, sehr ruhige Hand" />
        <button onClick={saveReview} disabled={savingReview} style={{ ...btnPrimary, width: "100%", padding: "11px 0" }}>Speichern</button>
      </Card>

      <SectionTitle>Alle Einschätzungen</SectionTitle>
      {reviews.length === 0 && <Empty text="Noch keine Einschätzungen." />}
      {reviews.map((r) => {
        const v = VERDICTS[r.verdict] || VERDICTS.ja;
        return (
          <Card key={r.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: COLOR.ink }}>{r.user_name}</span>
              <Pill bg={v.bg} fg={v.fg}>{v.label}</Pill>
            </div>
            {r.rating > 0 && (
              <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
                {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={13} fill={n <= r.rating ? COLOR.accent : "none"} color={COLOR.accent} />)}
              </div>
            )}
            {r.comment && <div style={{ fontSize: 12.5, color: COLOR.ink, marginTop: 6 }}>{r.comment}</div>}
          </Card>
        );
      })}

      {isAdmin && (
        <div style={{ marginTop: 20, textAlign: "center" }}>
          {confirmDelete ? (
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button onClick={deleteProvider} style={{ ...btnPrimary, background: COLOR.dringend }}>Wirklich löschen</button>
              <button onClick={() => setConfirmDelete(false)} style={btnGhost}>Abbrechen</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.dringend, fontSize: 12 }}>
              {provider.name} entfernen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AddProviderModal({ categories, onClose, onSave }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categories[0]?.key || "");
  const [phone, setPhone] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <Modal title="Neuer Dienstleister" onClose={onClose}>
      <label style={labelStyle}>Name</label>
      <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Dr. Müller" />
      <label style={labelStyle}>Kategorie</label>
      <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
        {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      <label style={labelStyle}>Telefonnummer</label>
      <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="z. B. 0170 1234567" />
      <label style={labelStyle}>Fachgebiet (optional)</label>
      <input style={inputStyle} value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="z. B. Chirurgie, Akupunktur" />
      <label style={labelStyle}>Notiz / Erreichbarkeit (optional)</label>
      <textarea style={{ ...inputStyle, minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="z. B. Notdienst rund um die Uhr" />
      <button
        disabled={!name.trim() || !category}
        onClick={() => onSave({ name: name.trim(), category, phone, specialty, notes })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: (!name.trim() || !category) ? 0.5 : 1 }}
      >Speichern</button>
    </Modal>
  );
}

function ManageProviderCategoriesModal({ categories, onAdd, onDelete, onClose }) {
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
          placeholder="Neue Kategorie (z. B. Sattler)"
        />
        <button onClick={add} style={btnPrimary}>+ Hinzufügen</button>
      </div>
    </Modal>
  );
}
