import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Syringe, Scissors, Stethoscope, Pill as PillIcon, Dumbbell, Plus, HeartPulse, Wheat, Pencil, Camera, X, Scale, Wallet } from "lucide-react";
import { supabase, uploadPhoto } from "../supabaseClient";
import { Card, SectionTitle, Empty, Pill, Modal, IconBtn, COLOR, fmtDate, daysUntil, nextDue, addMonths, addDays, dateToISO, parseISODate, HEALTH_LABELS, HEALTH_DEFAULT_INTERVAL, HEALTH_INTERVAL_UNIT, inputStyle, labelStyle, btnPrimary, btnGhost, navBtn, todayISO } from "../components/ui";
import { BlanketCard } from "../components/Deckenguide";
import { HorseFeedPlan } from "../components/Futter";

const ICONS = { impfung: Syringe, hufschmied: Scissors, zahnarzt: Stethoscope, entwurmung: PillIcon };
const INTENSITAETEN = ["locker", "normal", "intensiv"];

export default function Pferde({ user, isAdmin }) {
  const [loading, setLoading] = useState(true);
  const [horses, setHorses] = useState([]);
  const [open, setOpen] = useState(null);
  const [showAddHorse, setShowAddHorse] = useState(false);
  const [addHorseError, setAddHorseError] = useState("");
  const [people, setPeople] = useState([]);

  const load = async () => {
    const [horsesRes, peopleRes] = await Promise.all([
      supabase.from("horses").select("*").order("name"),
      supabase.from("profiles").select("name"),
    ]);
    setHorses(horsesRes.data ?? []);
    setPeople((peopleRes.data ?? []).map((p) => p.name));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const addHorse = async (data) => {
    setAddHorseError("");
    const { error } = await supabase.from("horses").insert({
      name: data.name, breed: data.breed || null, born: data.born || null, owner: data.owner || null, note: data.note || null, health: {},
    });
    if (error) {
      setAddHorseError(error.code === "23505" ? "Ein Pferd mit diesem Namen gibt es schon." : "Konnte nicht gespeichert werden.");
      return;
    }
    setShowAddHorse(false);
    load();
  };

  if (loading) return <Empty text="Lädt …" />;

  if (open) {
    const horse = horses.find((h) => h.id === open);
    return (
      <PferdDetail
        horse={horse}
        user={user}
        isAdmin={isAdmin}
        onBack={() => setOpen(null)}
        onSave={async (updates) => {
          const { error } = await supabase.from("horses").update(updates).eq("id", horse.id);
          load();
          return error;
        }}
        onDelete={async () => {
          await supabase.from("horses").delete().eq("id", horse.id);
          setOpen(null);
          load();
        }}
      />
    );
  }

  return (
    <div>
      <SectionTitle right={<IconBtn onClick={() => setShowAddHorse(true)}><Plus size={15} /> Pferd</IconBtn>}>Pferde</SectionTitle>
      {horses.map((h) => {
        const urgent = Object.entries(h.health || {}).filter(([k]) => HEALTH_LABELS[k]).map(([, v]) => nextDue(v)).filter(Boolean).map((due) => daysUntil(due)).sort((a, b) => a - b)[0];
        return (
          <Card key={h.id} onClick={() => setOpen(h.id)} style={{ marginBottom: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#F3ECDD", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, overflow: "hidden", flexShrink: 0 }}>
              {h.photo_url ? <img src={h.photo_url} alt={h.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🐴"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: COLOR.ink }}>{h.name}</div>
              <div style={{ fontSize: 12, color: COLOR.inkSoft }}>{h.breed} · {h.owner}</div>
            </div>
            {urgent !== undefined && urgent <= 14 && (
              <Pill bg={urgent < 0 ? COLOR.dringendBg : COLOR.uebernommenBg} fg={urgent < 0 ? COLOR.dringend : COLOR.uebernommen}>
                {urgent < 0 ? "überfällig" : `in ${urgent} Tg.`}
              </Pill>
            )}
          </Card>
        );
      })}
      {showAddHorse && <AddHorseModal error={addHorseError} people={people} onClose={() => setShowAddHorse(false)} onSave={addHorse} />}
    </div>
  );
}

function AddHorseModal({ error, people, onClose, onSave }) {
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [born, setBorn] = useState("");
  const [owner, setOwner] = useState("");
  const [note, setNote] = useState("");
  return (
    <Modal title="Neues Pferd" onClose={onClose}>
      <label style={labelStyle}>Name</label>
      <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Luna" />
      <label style={labelStyle}>Rasse (optional)</label>
      <input style={inputStyle} value={breed} onChange={(e) => setBreed(e.target.value)} />
      <label style={labelStyle}>Geburtstag (optional)</label>
      <input type="date" style={inputStyle} value={born} onChange={(e) => setBorn(e.target.value)} />
      <label style={labelStyle}>Besitzer:in (optional – wichtig für die faire Kostenaufteilung)</label>
      <select style={inputStyle} value={owner} onChange={(e) => setOwner(e.target.value)}>
        <option value="">Noch keine Angabe</option>
        {people.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <label style={labelStyle}>Notiz (optional)</label>
      <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <div style={{ fontSize: 12.5, color: COLOR.dringend, marginBottom: 8 }}>{error}</div>}
      <button
        disabled={!name.trim()}
        onClick={() => onSave({ name: name.trim(), breed: breed.trim(), born: born.trim(), owner: owner.trim(), note: note.trim() })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: name.trim() ? 1 : 0.5 }}
      >Pferd anlegen</button>
    </Modal>
  );
}

function PferdDetail({ horse, user, isAdmin, onBack, onSave, onDelete }) {
  const [editKey, setEditKey] = useState(null);
  const [editingInfo, setEditingInfo] = useState(false);
  const [confirmDeleteHorse, setConfirmDeleteHorse] = useState(false);
  const [infoBreed, setInfoBreed] = useState(horse.breed || "");
  const [infoBorn, setInfoBorn] = useState(horse.born || "");
  const [infoOwner, setInfoOwner] = useState(horse.owner || "");
  const [infoNote, setInfoNote] = useState(horse.note || "");
  const [trainings, setTrainings] = useState([]);
  const [plans, setPlans] = useState([]);
  const [showNewTraining, setShowNewTraining] = useState(false);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [uid, setUid] = useState(null);
  const [healthNotes, setHealthNotes] = useState([]);
  const [showNewHealthNote, setShowNewHealthNote] = useState(false);
  const [medications, setMedications] = useState([]);
  const [showNewMedication, setShowNewMedication] = useState(false);
  const [confirmDeleteMedId, setConfirmDeleteMedId] = useState(null);
  const [weights, setWeights] = useState([]);
  const [showNewWeight, setShowNewWeight] = useState(false);
  const [showWeightHistory, setShowWeightHistory] = useState(false);
  const [sharedExpenses, setSharedExpenses] = useState([]);
  const [privateExpenses, setPrivateExpenses] = useState([]);
  const [showNewExpense, setShowNewExpense] = useState(false);
  const [confirmDeleteExpId, setConfirmDeleteExpId] = useState(null);
  const [generalExpenses, setGeneralExpenses] = useState([]);
  const [horseCount, setHorseCount] = useState(1);
  const [hayBatches, setHayBatches] = useState([]);
  const [people, setPeople] = useState([]);
  const [showNewHorseRecurring, setShowNewHorseRecurring] = useState(false);
  const [feedPlan, setFeedPlan] = useState(horse.feed_plan || "");
  const [editingFeedPlan, setEditingFeedPlan] = useState(false);
  const [savingFeedPlan, setSavingFeedPlan] = useState(false);
  const [uploadingProfilePic, setUploadingProfilePic] = useState(false);
  const [viewerPhoto, setViewerPhoto] = useState(null);
  const profilePicInput = useRef(null);

  const onProfilePicChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProfilePic(true);
    try {
      const url = await uploadPhoto(file, `${horse.id}/profile`);
      onSave({ photo_url: url });
    } finally {
      setUploadingProfilePic(false);
      e.target.value = "";
    }
  };

  const loadHealthNotes = async () => {
    const { data } = await supabase.from("health_notes").select("*").eq("horse_id", horse.id).order("date", { ascending: false });
    setHealthNotes(data ?? []);
  };
  const addHealthNote = async (n) => {
    let photoUrl = null;
    if (n.photoFile) photoUrl = await uploadPhoto(n.photoFile, `${horse.id}/health-notes`);
    await supabase.from("health_notes").insert({ horse_id: horse.id, user_name: user, date: n.date, note: n.note, photo_url: photoUrl });
    setShowNewHealthNote(false);
    loadHealthNotes();
  };

  const loadMedications = async () => {
    const { data } = await supabase.from("medications").select("*").eq("horse_id", horse.id).order("date_from", { ascending: false });
    setMedications(data ?? []);
  };
  const addMedication = async (m) => {
    await supabase.from("medications").insert({
      horse_id: horse.id, user_name: user, name: m.name, dosage: m.dosage || null,
      date_from: m.dateFrom, date_to: m.ongoing ? null : (m.dateTo || null), note: m.note || null,
    });
    setShowNewMedication(false);
    loadMedications();
  };
  const deleteMedication = async (id) => {
    await supabase.from("medications").delete().eq("id", id);
    setConfirmDeleteMedId(null);
    loadMedications();
  };

  const loadWeights = async () => {
    const { data } = await supabase.from("weights").select("*").eq("horse_id", horse.id).order("date", { ascending: false });
    setWeights(data ?? []);
  };
  const addWeight = async (w) => {
    await supabase.from("weights").insert({ horse_id: horse.id, user_name: user, date: w.date, weight_kg: Number(w.weightKg), note: w.note || null });
    setShowNewWeight(false);
    loadWeights();
  };
  const [feedPlanError, setFeedPlanError] = useState("");
  const saveFeedPlan = async () => {
    setSavingFeedPlan(true);
    setFeedPlanError("");
    const error = await onSave({ feed_plan: feedPlan });
    setSavingFeedPlan(false);
    if (error) {
      setFeedPlanError("Konnte nicht gespeichert werden – bitte sicherstellen, dass die Datenbank auf dem neuesten Stand ist (aktuelles SQL-Skript ausgeführt).");
      return;
    }
    setEditingFeedPlan(false);
  };

  const loadTrainings = async () => {
    const { data } = await supabase.from("trainings").select("*").eq("horse_id", horse.id).order("date", { ascending: false });
    setTrainings(data ?? []);
  };
  const loadPlans = async (currentUid) => {
    const { data } = await supabase.from("training_plans").select("*").eq("horse_id", horse.id).eq("user_id", currentUid).order("date");
    setPlans(data ?? []);
  };
  const loadSharedExpenses = async () => {
    const { data } = await supabase.from("expenses").select("*").eq("horse_id", horse.id).order("date", { ascending: false });
    setSharedExpenses(data ?? []);
  };
  const loadPrivateExpenses = async (currentUid) => {
    const { data } = await supabase.from("horse_expenses").select("*").eq("horse_id", horse.id).eq("user_id", currentUid).order("date", { ascending: false });
    setPrivateExpenses(data ?? []);
  };
  // Für die Monatsübersicht: allgemeine Stallausgaben (kein bestimmtes Pferd) + Gesamtzahl
  // der Pferde (um den Anteil zu berechnen) + Heuballen, an denen dieses Pferd beteiligt ist.
  const loadCostContext = async () => {
    const [generalRes, horsesCountRes, hayRes, peopleRes] = await Promise.all([
      supabase.from("expenses").select("*").is("horse_id", null),
      supabase.from("horses").select("id", { count: "exact", head: true }),
      supabase.from("hay_batches").select("*").contains("horse_ids", [horse.id]),
      supabase.from("profiles").select("name"),
    ]);
    setGeneralExpenses(generalRes.data ?? []);
    setHorseCount(horsesCountRes.count || 1);
    setHayBatches(hayRes.data ?? []);
    setPeople((peopleRes.data ?? []).map((p) => p.name));
  };
  const addHorseRecurring = async (data) => {
    await supabase.from("recurring_expenses").insert({
      description: data.desc, amount: +data.amount, paid_by: data.paidBy, horse_id: horse.id,
      people: data.people, split_mode: "even", active: true,
    });
    setShowNewHorseRecurring(false);
  };
  useEffect(() => {
    loadTrainings();
    loadHealthNotes();
    loadMedications();
    loadWeights();
    loadSharedExpenses();
    loadCostContext();
    supabase.auth.getUser().then(({ data }) => {
      const currentUid = data?.user?.id;
      setUid(currentUid);
      if (currentUid) { loadPlans(currentUid); loadPrivateExpenses(currentUid); }
    });
  }, [horse.id]);

  const addTraining = async (t) => {
    await supabase.from("trainings").insert({ horse_id: horse.id, user_name: user, date: t.date, art: t.art, dauer_min: t.dauer_min, intensitaet: t.intensitaet, notiz: t.notiz });
    setShowNewTraining(false);
    loadTrainings();
  };
  const addPlan = async (p) => {
    if (!uid) return;
    await supabase.from("training_plans").insert({ horse_id: horse.id, user_id: uid, date: p.date, plan: p.plan });
    setShowNewPlan(false);
    loadPlans(uid);
  };
  const addPrivateExpense = async (e) => {
    if (!uid) return;
    let photoUrl = null;
    if (e.photoFile) photoUrl = await uploadPhoto(e.photoFile, `${horse.id}/rechnungen`);
    await supabase.from("horse_expenses").insert({
      horse_id: horse.id, user_id: uid, user_name: user, date: e.date, description: e.description,
      amount: Number(e.amount), note: e.note || null, photo_url: photoUrl,
    });
    setShowNewExpense(false);
    loadPrivateExpenses(uid);
  };
  const deletePrivateExpense = async (id) => {
    await supabase.from("horse_expenses").delete().eq("id", id);
    setConfirmDeleteExpId(null);
    loadPrivateExpenses(uid);
  };

  const saveHealthItem = (key, { last, interval, next }) => {
    const item = { last: last || null, interval: interval ? Number(interval) : HEALTH_DEFAULT_INTERVAL[key], next: next || null, unit: HEALTH_INTERVAL_UNIT[key] };
    onSave({ health: { ...horse.health, [key]: item } });
    setEditKey(null);
  };

  const saveInfo = () => {
    onSave({ breed: infoBreed.trim() || null, born: infoBorn.trim() || null, owner: infoOwner.trim() || null, note: infoNote.trim() || null });
    setEditingInfo(false);
  };
  return (
    <div>
      <button onClick={onBack} style={{ ...navBtn, marginTop: 14, display: "flex", alignItems: "center", gap: 4 }}><ChevronLeft size={15} /> Pferde</button>
      <div style={{ textAlign: "center", margin: "16px 0" }}>
        <div style={{ position: "relative", width: 84, height: 84, margin: "0 auto" }}>
          <div style={{
            width: 84, height: 84, borderRadius: "50%", background: "#F3ECDD", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 40, overflow: "hidden",
          }}>
            {horse.photo_url ? <img src={horse.photo_url} alt={horse.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🐴"}
          </div>
          <button
            onClick={() => profilePicInput.current?.click()}
            disabled={uploadingProfilePic}
            style={{
              position: "absolute", bottom: -2, right: -2, width: 28, height: 28, borderRadius: "50%",
              background: COLOR.ink, border: "2px solid #fff", color: "#fff", display: "flex",
              alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}
          >
            <Camera size={13} />
          </button>
          <input ref={profilePicInput} type="file" accept="image/*" style={{ display: "none" }} onChange={onProfilePicChange} />
        </div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 700, color: COLOR.ink, marginTop: 8 }}>{horse.name}</div>
        {editingInfo ? (
          <div style={{ textAlign: "left", maxWidth: 320, margin: "10px auto 0" }}>
            <label style={labelStyle}>Rasse</label>
            <input style={inputStyle} value={infoBreed} onChange={(e) => setInfoBreed(e.target.value)} />
            <label style={labelStyle}>Geburtstag</label>
            <input type="date" style={inputStyle} value={infoBorn} onChange={(e) => setInfoBorn(e.target.value)} />
            <label style={labelStyle}>Besitzer:in</label>
            <select style={inputStyle} value={infoOwner} onChange={(e) => setInfoOwner(e.target.value)}>
              <option value="">Noch keine Angabe</option>
              {people.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <label style={labelStyle}>Notiz</label>
            <input style={inputStyle} value={infoNote} onChange={(e) => setInfoNote(e.target.value)} />
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btnPrimary, flex: 1 }} onClick={saveInfo}>Speichern</button>
              <button style={{ ...btnGhost, flex: 1 }} onClick={() => setEditingInfo(false)}>Abbrechen</button>
            </div>
          </div>
        ) : (
          <>
            {(horse.breed || horse.born || horse.owner) && (
              <div style={{ fontSize: 13, color: COLOR.inkSoft }}>
                {[horse.breed, horse.born && `geb. ${new Date(horse.born + "T00:00:00").toLocaleDateString("de-DE")}`, horse.owner && `Besitzer:in ${horse.owner}`].filter(Boolean).join(" · ")}
              </div>
            )}
            {horse.note && <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginTop: 6, fontStyle: "italic" }}>{horse.note}</div>}
            <button onClick={() => setEditingInfo(true)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft, marginTop: 6, fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Pencil size={11} /> Basisdaten bearbeiten
            </button>
          </>
        )}
      </div>
      <BlanketCard horse={horse} isAdmin={isAdmin} onProfileChange={(key) => onSave({ blanket_profile: key })} />
      <SectionTitle>Gesundheit & Pflege</SectionTitle>
      {Object.keys(HEALTH_LABELS).map((k) => {
        const v = horse.health?.[k];
        const Icon = ICONS[k];
        const due = v ? nextDue(v) : null;
        const d = due ? daysUntil(due) : null;
        return (
          <Card key={k} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon size={16} color={COLOR.accent} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: COLOR.ink }}>{HEALTH_LABELS[k].label}</div>
                  <div style={{ fontSize: 11.5, color: COLOR.inkSoft }}>
                    {v?.last && `zuletzt ${fmtDate(v.last)} · `}
                    {v ? `alle ${v.interval ?? HEALTH_DEFAULT_INTERVAL[k]} ${(v.unit ?? HEALTH_INTERVAL_UNIT[k]) === "weeks" ? "Wo." : "Mon."}` : "Noch keine Angabe"}
                    {due && ` · nächster Termin ${fmtDate(due)}`}
                  </div>
                </div>
              </div>
              {due && (
                <Pill bg={d < 0 ? COLOR.dringendBg : d <= 7 ? COLOR.uebernommenBg : COLOR.erledigtBg} fg={d < 0 ? COLOR.dringend : d <= 7 ? COLOR.uebernommen : COLOR.erledigt}>
                  {d < 0 ? "überfällig" : d === 0 ? "heute" : `in ${d} Tg.`}
                </Pill>
              )}
            </div>
            {editKey === k ? (
              <HealthEditForm item={v} defaultInterval={HEALTH_DEFAULT_INTERVAL[k]} unit={HEALTH_INTERVAL_UNIT[k]} onSave={(vals) => saveHealthItem(k, vals)} onCancel={() => setEditKey(null)} />
            ) : (
              <button onClick={() => setEditKey(k)} style={{ ...btnGhost, marginTop: 8 }}>{v ? "Bearbeiten" : "Termin eintragen"}</button>
            )}
          </Card>
        );
      })}

      <SectionTitle right={<IconBtn onClick={() => setShowNewHealthNote(true)}><Plus size={15} /> Notiz</IconBtn>}>
        <HeartPulse size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Gesundheitsnotizen
      </SectionTitle>
      {healthNotes.length === 0 && <Empty text="Noch keine Notizen." />}
      {healthNotes.map((n) => (
        <Card key={n.id} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 10 }}>
            {n.photo_url && (
              <button onClick={() => setViewerPhoto({ url: n.photo_url })} style={{ border: "none", padding: 0, cursor: "pointer", width: 52, height: 52, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "#F3ECDD" }}>
                <img src={n.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </button>
            )}
            <div>
              <div style={{ fontSize: 11.5, color: COLOR.inkSoft }}>{fmtDate(n.date)} · {n.user_name}</div>
              <div style={{ fontSize: 13.5, color: COLOR.ink, marginTop: 2 }}>{n.note}</div>
            </div>
          </div>
        </Card>
      ))}

      <SectionTitle right={<IconBtn onClick={() => setShowNewWeight(true)}><Plus size={15} /> Gewicht</IconBtn>}>
        <Scale size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Gewicht
      </SectionTitle>
      {weights.length === 0 && <Empty text="Noch kein Gewicht eingetragen." />}
      {weights.length > 0 && (
        <Card style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: COLOR.ink }}>{weights[0].weight_kg} kg</div>
              <div style={{ fontSize: 11.5, color: COLOR.inkSoft }}>zuletzt gewogen {fmtDate(weights[0].date)} · {weights[0].user_name}</div>
            </div>
            {weights.length > 1 && (
              <button onClick={() => setShowWeightHistory((v) => !v)} style={btnGhost}>
                {showWeightHistory ? "Verlauf ausblenden" : `Verlauf (${weights.length})`}
              </button>
            )}
          </div>
          {showWeightHistory && weights.length > 1 && (
            <div style={{ marginTop: 12, borderTop: `1px solid ${COLOR.line}`, paddingTop: 10 }}>
              {weights.slice(1).map((w) => (
                <div key={w.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                  <span style={{ color: COLOR.inkSoft }}>{fmtDate(w.date)}</span>
                  <span style={{ color: COLOR.ink, fontWeight: 600 }}>{w.weight_kg} kg</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <SectionTitle right={<IconBtn onClick={() => setShowNewMedication(true)}><Plus size={15} /> Medikament</IconBtn>}>
        <PillIcon size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Medikamente
      </SectionTitle>
      {medications.length === 0 && <Empty text="Keine Medikamente hinterlegt." />}
      {medications.map((m) => {
        const t = todayISO();
        const active = m.date_from <= t && (!m.date_to || m.date_to >= t);
        return (
          <Card key={m.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: COLOR.ink }}>{m.name}</span>
                  {active && <Pill bg={COLOR.uebernommenBg} fg={COLOR.uebernommen}>läuft</Pill>}
                </div>
                <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginTop: 2 }}>
                  {m.dosage && `${m.dosage} · `}{fmtDate(m.date_from)} – {m.date_to ? fmtDate(m.date_to) : "dauerhaft"}
                </div>
                {m.note && <div style={{ fontSize: 12.5, color: COLOR.ink, marginTop: 4 }}>{m.note}</div>}
              </div>
            </div>
            {confirmDeleteMedId === m.id ? (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => deleteMedication(m.id)} style={{ ...btnPrimary, background: COLOR.dringend }}>Wirklich löschen</button>
                <button onClick={() => setConfirmDeleteMedId(null)} style={btnGhost}>Abbrechen</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDeleteMedId(m.id)} style={{ ...btnGhost, marginTop: 8 }}>Löschen</button>
            )}
          </Card>
        );
      })}

      <SectionTitle>
        <Wheat size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Futterplan
      </SectionTitle>
      <HorseFeedPlan horse={horse} user={user} />
      <Card style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLOR.inkSoft, marginBottom: 6 }}>Hinweise zur Fütterung</div>
        {editingFeedPlan ? (
          <>
            <textarea style={{ ...inputStyle, minHeight: 90 }} value={feedPlan} onChange={(e) => setFeedPlan(e.target.value)} placeholder="z. B. immer eingeweicht füttern, Lieblingskonsistenz dickflüssig …" />
            {feedPlanError && <div style={{ fontSize: 12, color: COLOR.dringend, marginBottom: 8 }}>{feedPlanError}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btnPrimary} disabled={savingFeedPlan} onClick={saveFeedPlan}>Speichern</button>
              <button style={btnGhost} onClick={() => { setFeedPlan(horse.feed_plan || ""); setEditingFeedPlan(false); setFeedPlanError(""); }}>Abbrechen</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13.5, color: COLOR.ink, whiteSpace: "pre-wrap" }}>{feedPlan || "Noch keine Hinweise hinterlegt."}</div>
            <button onClick={() => setEditingFeedPlan(true)} style={{ ...btnGhost, marginTop: 8 }}>Hinweise bearbeiten</button>
          </>
        )}
      </Card>

      <SectionTitle right={<IconBtn onClick={() => setShowNewTraining(true)}><Plus size={15} /> Eintrag</IconBtn>}>
        <Dumbbell size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Trainingstagebuch
      </SectionTitle>
      {trainings.length === 0 && <Empty text="Noch keine Trainingseinträge." />}
      {trainings.map((t) => (
        <Card key={t.id} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLOR.ink }}>{t.art}</div>
              <div style={{ fontSize: 11.5, color: COLOR.inkSoft }}>{fmtDate(t.date)} · {t.user_name}{t.dauer_min ? ` · ${t.dauer_min} Min.` : ""}{t.intensitaet ? ` · ${t.intensitaet}` : ""}</div>
              {t.notiz && <div style={{ fontSize: 12.5, color: COLOR.ink, marginTop: 4 }}>{t.notiz}</div>}
            </div>
          </div>
        </Card>
      ))}

      <SectionTitle right={<IconBtn onClick={() => setShowNewPlan(true)}><Plus size={15} /> Plan</IconBtn>}>Meine Trainingsplanung (privat)</SectionTitle>
      {plans.length === 0 && <Empty text="Noch keine geplanten Einheiten." />}
      {plans.map((p) => (
        <Card key={p.id} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11.5, color: COLOR.inkSoft }}>{fmtDate(p.date)}</div>
          <div style={{ fontSize: 13.5, color: COLOR.ink, marginTop: 2 }}>{p.plan}</div>
        </Card>
      ))}

      <SectionTitle right={<IconBtn onClick={() => setShowNewHorseRecurring(true)}><Plus size={15} /> Wiederkehrend</IconBtn>}>
        <Wallet size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Gemeinsame Ausgaben für {horse.name}
      </SectionTitle>
      {(() => {
        const currentMonthKey = todayISO().slice(0, 7);
        // Apportioniert eine Ausgabe (mit optionalem Zeitraum in Monaten) auf den aktuellen Monat.
        const monthShareOf = (ex) => {
          const duration = ex.duration_months && ex.duration_months > 1 ? ex.duration_months : 1;
          const [sy, sm] = ex.date.slice(0, 7).split("-").map(Number);
          for (let i = 0; i < duration; i++) {
            const m = ((sm - 1 + i) % 12) + 1;
            const y = sy + Math.floor((sm - 1 + i) / 12);
            if (`${y}-${String(m).padStart(2, "0")}` === currentMonthKey) return Number(ex.amount) / duration;
          }
          return 0;
        };
        const ownCost = sharedExpenses.reduce((sum, ex) => sum + monthShareOf(ex), 0);
        const generalShare = generalExpenses.reduce((sum, ex) => sum + monthShareOf(ex) / horseCount, 0);
        // Heukosten: bei abgeschlossenen (aufgebrauchten) Ballen den auf diesen Monat
        // entfallenden Anteil des Gesamtpreises, geteilt durch die beteiligten Pferde.
        const hayCost = hayBatches.reduce((sum, b) => {
          if (!b.total_cost || !b.date_ran_out) return sum;
          const start = parseISODate(b.date_bought), end = parseISODate(b.date_ran_out);
          const totalDays = Math.round((end - start) / 86400000);
          if (totalDays <= 0) return sum;
          const horsesInBatch = (b.horse_ids || []).length || 1;
          const costPerDayPerHorse = Number(b.total_cost) / totalDays / horsesInBatch;
          let daysInMonth = 0;
          const cur = new Date(start);
          for (let i = 0; i < totalDays; i++) {
            if (dateToISO(cur).slice(0, 7) === currentMonthKey) daysInMonth++;
            cur.setDate(cur.getDate() + 1);
          }
          return sum + costPerDayPerHorse * daysInMonth;
        }, 0);
        const monthlyCost = ownCost + generalShare + hayCost;
        return monthlyCost > 0.004 ? (
          <Card style={{ marginBottom: 10, background: "#F3ECDD" }}>
            <div style={{ fontSize: 12, color: COLOR.inkSoft }}>Kosten diesen Monat (anteilig verteilt)</div>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 700, color: COLOR.ink }}>{monthlyCost.toFixed(2)} €</div>
            <div style={{ fontSize: 11, color: COLOR.inkSoft, marginTop: 2 }}>
              davon {ownCost.toFixed(2)} € direkt, {generalShare.toFixed(2)} € Anteil an Stallkosten{hayCost > 0.004 ? `, ${hayCost.toFixed(2)} € Heu` : ""}
            </div>
          </Card>
        ) : null;
      })()}
      {sharedExpenses.length === 0 && <Empty text="Noch keine Ausgaben für dieses Pferd." />}
      {sharedExpenses.map((ex) => (
        <Card key={ex.id} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: COLOR.ink }}>{ex.description}</div>
              <div style={{ fontSize: 11.5, color: COLOR.inkSoft }}>
                bezahlt von {ex.paid_by} · {fmtDate(ex.date)}
                {ex.duration_months > 1 && ` · hält ${ex.duration_months} Mon.`}
              </div>
            </div>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 14, color: COLOR.ink }}>{Number(ex.amount).toFixed(2)} €</div>
          </div>
        </Card>
      ))}
      <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginTop: -4, marginBottom: 16 }}>
        Diese Ausgaben werden automatisch aus „Finanzen" übernommen, wenn dort {horse.name} als Kategorie ausgewählt wird.
      </div>

      <SectionTitle right={<IconBtn onClick={() => setShowNewExpense(true)}><Plus size={15} /> Rechnung</IconBtn>}>
        <Wallet size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Meine privaten Rechnungen
      </SectionTitle>
      <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginTop: -6, marginBottom: 10 }}>
        Nur für dich sichtbar – z. B. eigene Tierarzt- oder Hufschmiedrechnung.
      </div>
      {privateExpenses.length === 0 && <Empty text="Noch keine eigenen Rechnungen." />}
      {privateExpenses.map((ex) => (
        <Card key={ex.id} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 10 }}>
            {ex.photo_url && (
              <button onClick={() => setViewerPhoto({ url: ex.photo_url })} style={{ border: "none", padding: 0, cursor: "pointer", width: 52, height: 52, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "#F3ECDD" }}>
                <img src={ex.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </button>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: COLOR.ink }}>{ex.description}</div>
                <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 14, color: COLOR.ink }}>{Number(ex.amount).toFixed(2)} €</div>
              </div>
              <div style={{ fontSize: 11.5, color: COLOR.inkSoft }}>{fmtDate(ex.date)}</div>
              {ex.note && <div style={{ fontSize: 12.5, color: COLOR.ink, marginTop: 2 }}>{ex.note}</div>}
            </div>
          </div>
          {confirmDeleteExpId === ex.id ? (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => deletePrivateExpense(ex.id)} style={{ ...btnPrimary, background: COLOR.dringend }}>Wirklich löschen</button>
              <button onClick={() => setConfirmDeleteExpId(null)} style={btnGhost}>Abbrechen</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDeleteExpId(ex.id)} style={{ ...btnGhost, marginTop: 8 }}>Löschen</button>
          )}
        </Card>
      ))}

      {showNewTraining && <NewTrainingModal onClose={() => setShowNewTraining(false)} onSave={addTraining} />}
      {showNewPlan && <NewPlanModal onClose={() => setShowNewPlan(false)} onSave={addPlan} />}
      {showNewHealthNote && <NewHealthNoteModal onClose={() => setShowNewHealthNote(false)} onSave={addHealthNote} />}
      {showNewMedication && <NewMedicationModal onClose={() => setShowNewMedication(false)} onSave={addMedication} />}
      {showNewWeight && <NewWeightModal onClose={() => setShowNewWeight(false)} onSave={addWeight} />}
      {showNewExpense && <NewPrivateExpenseModal onClose={() => setShowNewExpense(false)} onSave={addPrivateExpense} />}
      {showNewHorseRecurring && (
        <NewHorseRecurringModal horseName={horse.name} people={people} onClose={() => setShowNewHorseRecurring(false)} onSave={addHorseRecurring} />
      )}

      {viewerPhoto && (
        <PhotoViewerModal
          photo={viewerPhoto}
          onClose={() => setViewerPhoto(null)}
          onUseAsProfile={null}
          onDelete={null}
        />
      )}

      {isAdmin && (
        <div style={{ marginTop: 24, textAlign: "center" }}>
          {confirmDeleteHorse ? (
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button onClick={onDelete} style={{ ...btnPrimary, background: COLOR.dringend }}>Wirklich löschen</button>
              <button onClick={() => setConfirmDeleteHorse(false)} style={btnGhost}>Abbrechen</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDeleteHorse(true)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.dringend, fontSize: 12 }}>
              {horse.name} entfernen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PhotoViewerModal({ photo, onClose, onUseAsProfile, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.9)", zIndex: 100, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
        <X size={24} />
      </button>
      <img src={photo.url} alt="" style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 10, objectFit: "contain" }} />
      {(onUseAsProfile || onDelete) && (
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          {onUseAsProfile && <button onClick={onUseAsProfile} style={{ ...btnPrimary }}>Als Profilbild verwenden</button>}
          {onDelete && !confirmDelete && <button onClick={() => setConfirmDelete(true)} style={{ ...btnGhost, color: "#fff", borderColor: "#fff" }}>Löschen</button>}
          {onDelete && confirmDelete && <button onClick={onDelete} style={{ ...btnPrimary, background: COLOR.dringend }}>Wirklich löschen?</button>}
        </div>
      )}
    </div>
  );
}

function HealthEditForm({ item, defaultInterval, unit, onSave, onCancel }) {
  const [last, setLastDate] = useState(item?.last || "");
  const [interval, setInterval] = useState(item?.interval ?? defaultInterval);
  const [next, setNext] = useState(item?.next || "");
  const [overrideNext, setOverrideNext] = useState(!!item?.next);
  const unitLabel = unit === "weeks" ? "Wochen" : "Monate";
  const previewDue = (l, i) => (unit === "weeks" ? addDays(l, Number(i || 0) * 7) : addMonths(l, i));

  return (
    <div style={{ marginTop: 10 }}>
      <label style={labelStyle}>Letzter Termin (optional)</label>
      <input type="date" style={inputStyle} value={last} onChange={(e) => setLastDate(e.target.value)} />
      <label style={labelStyle}>Intervall ({unitLabel})</label>
      <input type="number" min="1" style={inputStyle} value={interval} onChange={(e) => setInterval(e.target.value)} />
      <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" checked={overrideNext} onChange={(e) => setOverrideNext(e.target.checked)} />
        Nächsten Termin manuell festlegen
      </label>
      {overrideNext && (
        <input type="date" style={inputStyle} value={next} onChange={(e) => setNext(e.target.value)} />
      )}
      {!overrideNext && (
        <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginTop: -8, marginBottom: 10 }}>
          {last ? `Nächster Termin wird automatisch berechnet: ${fmtDate(previewDue(last, interval))}` : "Nächster Termin wird berechnet, sobald ein letzter Termin eingetragen ist."}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={btnPrimary} onClick={() => onSave({ last, interval, next: overrideNext ? next : "" })}>Speichern</button>
        <button style={btnGhost} onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}

function NewTrainingModal({ onClose, onSave }) {
  const [date, setDate] = useState(todayISO());
  const [art, setArt] = useState("");
  const [dauer, setDauer] = useState("");
  const [intensitaet, setIntensitaet] = useState("normal");
  const [notiz, setNotiz] = useState("");
  return (
    <Modal title="Trainingseintrag" onClose={onClose}>
      <label style={labelStyle}>Datum</label>
      <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
      <label style={labelStyle}>Art (z. B. Dressur, Bodenarbeit, Ausritt)</label>
      <input style={inputStyle} value={art} onChange={(e) => setArt(e.target.value)} placeholder="Art des Trainings" />
      <label style={labelStyle}>Dauer (Minuten)</label>
      <input type="number" style={inputStyle} value={dauer} onChange={(e) => setDauer(e.target.value)} />
      <label style={labelStyle}>Intensität</label>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {INTENSITAETEN.map((i) => (
          <button key={i} type="button" onClick={() => setIntensitaet(i)} style={{
            padding: "6px 11px", borderRadius: 999, border: `1px solid ${intensitaet === i ? COLOR.accent : COLOR.line}`,
            background: intensitaet === i ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
          }}>{i}</button>
        ))}
      </div>
      <label style={labelStyle}>Notiz (optional)</label>
      <textarea style={{ ...inputStyle, minHeight: 60 }} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
      <button
        disabled={!art}
        onClick={() => onSave({ date, art, dauer_min: dauer ? Number(dauer) : null, intensitaet, notiz })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: !art ? 0.5 : 1 }}
      >Speichern</button>
    </Modal>
  );
}

function NewHealthNoteModal({ onClose, onSave }) {
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const onPhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  return (
    <Modal title="Gesundheitsnotiz" onClose={onClose}>
      <label style={labelStyle}>Datum</label>
      <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
      <label style={labelStyle}>Notiz (z. B. "steifes Becken", "leichter Husten")</label>
      <textarea style={{ ...inputStyle, minHeight: 70 }} value={note} onChange={(e) => setNote(e.target.value)} />
      <label style={labelStyle}>Foto (optional)</label>
      {photoPreview ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <img src={photoPreview} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover" }} />
          <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} style={btnGhost}>Entfernen</button>
        </div>
      ) : (
        <input type="file" accept="image/*" onChange={onPhotoChange} style={{ marginBottom: 12, fontSize: 12.5 }} />
      )}
      <button
        disabled={!note.trim()}
        onClick={() => onSave({ date, note: note.trim(), photoFile })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: !note.trim() ? 0.5 : 1 }}
      >Speichern</button>
    </Modal>
  );
}

function NewMedicationModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [dateFrom, setDateFrom] = useState(todayISO());
  const [ongoing, setOngoing] = useState(false);
  const [dateTo, setDateTo] = useState("");
  const [note, setNote] = useState("");
  return (
    <Modal title="Medikament" onClose={onClose}>
      <label style={labelStyle}>Name</label>
      <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Schmerzmittel" />
      <label style={labelStyle}>Dosierung (optional)</label>
      <input style={inputStyle} value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="z. B. 2x täglich 10ml" />
      <label style={labelStyle}>Von</label>
      <input type="date" style={inputStyle} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
      <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" checked={ongoing} onChange={(e) => setOngoing(e.target.checked)} />
        Dauerhaft / kein Enddatum
      </label>
      {!ongoing && (
        <>
          <label style={labelStyle}>Bis</label>
          <input type="date" style={inputStyle} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </>
      )}
      <label style={labelStyle}>Notiz (optional)</label>
      <textarea style={{ ...inputStyle, minHeight: 60 }} value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        disabled={!name.trim() || !dateFrom}
        onClick={() => onSave({ name: name.trim(), dosage: dosage.trim(), dateFrom, ongoing, dateTo, note: note.trim() })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: (!name.trim() || !dateFrom) ? 0.5 : 1 }}
      >Speichern</button>
    </Modal>
  );
}

function NewWeightModal({ onClose, onSave }) {
  const [date, setDate] = useState(todayISO());
  const [weightKg, setWeightKg] = useState("");
  const [note, setNote] = useState("");
  return (
    <Modal title="Gewicht eintragen" onClose={onClose}>
      <label style={labelStyle}>Datum</label>
      <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
      <label style={labelStyle}>Gewicht (kg)</label>
      <input type="number" style={inputStyle} value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="z. B. 520" />
      <label style={labelStyle}>Notiz (optional)</label>
      <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        disabled={!weightKg}
        onClick={() => onSave({ date, weightKg, note })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: !weightKg ? 0.5 : 1 }}
      >Speichern</button>
    </Modal>
  );
}

function NewPrivateExpenseModal({ onClose, onSave }) {
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const onPhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  return (
    <Modal title="Private Rechnung" onClose={onClose}>
      <label style={labelStyle}>Beschreibung</label>
      <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="z. B. Tierarztrechnung" />
      <label style={labelStyle}>Datum</label>
      <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
      <label style={labelStyle}>Betrag (€)</label>
      <input type="number" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />
      <label style={labelStyle}>Notiz (optional)</label>
      <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
      <label style={labelStyle}>Beleg-Foto (optional)</label>
      {photoPreview ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <img src={photoPreview} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover" }} />
          <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} style={btnGhost}>Entfernen</button>
        </div>
      ) : (
        <input type="file" accept="image/*" onChange={onPhotoChange} style={{ marginBottom: 12, fontSize: 12.5 }} />
      )}
      <button
        disabled={!description.trim() || !amount}
        onClick={() => onSave({ date, description: description.trim(), amount, note, photoFile })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: (!description.trim() || !amount) ? 0.5 : 1 }}
      >Speichern</button>
    </Modal>
  );
}

function NewHorseRecurringModal({ horseName, people, onClose, onSave }) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(people[0] || "");
  const [selected, setSelected] = useState(people);
  const toggle = (u) => setSelected((p) => (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]));
  const canSave = desc.trim() && amount && paidBy && selected.length > 0;
  return (
    <Modal title={`Wiederkehrende Kosten für ${horseName}`} onClose={onClose}>
      <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginBottom: 12 }}>
        Wird automatisch einmal pro Monat als neue Ausgabe für {horseName} angelegt (sichtbar, sobald du die Finanzen-Seite einmal geöffnet hast).
      </div>
      <label style={labelStyle}>Beschreibung</label>
      <input style={inputStyle} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="z. B. Pferdeversicherung" />
      <label style={labelStyle}>Betrag monatlich (€)</label>
      <input type="number" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />
      <label style={labelStyle}>Bezahlt von</label>
      <select style={inputStyle} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
        {people.map((u) => <option key={u}>{u}</option>)}
      </select>
      <label style={labelStyle}>Aufteilen auf (gleichmäßig)</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {people.map((u) => (
          <button key={u} type="button" onClick={() => toggle(u)} style={{
            padding: "6px 11px", borderRadius: 999, border: `1px solid ${selected.includes(u) ? COLOR.accent : COLOR.line}`,
            background: selected.includes(u) ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
          }}>{u}</button>
        ))}
      </div>
      <button
        disabled={!canSave}
        onClick={() => onSave({ desc: desc.trim(), amount, paidBy, people: selected })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: canSave ? 1 : 0.5 }}
      >Speichern</button>
    </Modal>
  );
}

function NewPlanModal({ onClose, onSave }) {
  const [date, setDate] = useState(todayISO());
  const [plan, setPlan] = useState("");
  return (
    <Modal title="Trainingsplanung" onClose={onClose}>
      <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginBottom: 12 }}>
        Nur für dich sichtbar – niemand sonst sieht deine Planung.
      </div>
      <label style={labelStyle}>Datum</label>
      <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
      <label style={labelStyle}>Plan</label>
      <textarea style={{ ...inputStyle, minHeight: 70 }} value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Was möchtest du üben?" />
      <button
        disabled={!plan}
        onClick={() => onSave({ date, plan })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: !plan ? 0.5 : 1 }}
      >Speichern</button>
    </Modal>
  );
}
