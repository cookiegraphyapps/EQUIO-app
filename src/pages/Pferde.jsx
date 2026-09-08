import { useEffect, useState } from "react";
import { ChevronLeft, Syringe, Scissors, Stethoscope, Pill as PillIcon, Dumbbell, Plus, HeartPulse, Wheat } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, SectionTitle, Empty, Pill, Modal, IconBtn, COLOR, fmtDate, daysUntil, nextDue, HEALTH_LABELS, HEALTH_DEFAULT_INTERVAL, inputStyle, labelStyle, btnPrimary, btnGhost, navBtn, todayISO } from "../components/ui";

const ICONS = { impfung: Syringe, hufschmied: Scissors, zahnarzt: Stethoscope, entwurmung: PillIcon };
const INTENSITAETEN = ["locker", "normal", "intensiv"];

export default function Pferde({ user }) {
  const [loading, setLoading] = useState(true);
  const [horses, setHorses] = useState([]);
  const [open, setOpen] = useState(null);

  const load = async () => {
    const { data } = await supabase.from("horses").select("*").order("name");
    setHorses(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  if (loading) return <Empty text="Lädt …" />;

  if (open) {
    const horse = horses.find((h) => h.id === open);
    return (
      <PferdDetail
        horse={horse}
        user={user}
        onBack={() => setOpen(null)}
        onSave={async (h) => {
          await supabase.from("horses").update({ health: h.health }).eq("id", h.id);
          load();
        }}
      />
    );
  }

  return (
    <div>
      <SectionTitle>Pferde</SectionTitle>
      {horses.map((h) => {
        const urgent = Object.entries(h.health || {}).filter(([k]) => HEALTH_LABELS[k]).map(([, v]) => daysUntil(nextDue(v))).sort((a, b) => a - b)[0];
        return (
          <Card key={h.id} onClick={() => setOpen(h.id)} style={{ marginBottom: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#F3ECDD", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🐴</div>
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
    </div>
  );
}

function PferdDetail({ horse, user, onBack, onSave }) {
  const [editKey, setEditKey] = useState(null);
  const [trainings, setTrainings] = useState([]);
  const [plans, setPlans] = useState([]);
  const [showNewTraining, setShowNewTraining] = useState(false);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [uid, setUid] = useState(null);
  const [healthNotes, setHealthNotes] = useState([]);
  const [showNewHealthNote, setShowNewHealthNote] = useState(false);
  const [feedPlan, setFeedPlan] = useState(horse.feed_plan || "");
  const [editingFeedPlan, setEditingFeedPlan] = useState(false);
  const [savingFeedPlan, setSavingFeedPlan] = useState(false);

  const loadHealthNotes = async () => {
    const { data } = await supabase.from("health_notes").select("*").eq("horse_id", horse.id).order("date", { ascending: false });
    setHealthNotes(data ?? []);
  };
  const addHealthNote = async (n) => {
    await supabase.from("health_notes").insert({ horse_id: horse.id, user_name: user, date: n.date, note: n.note });
    setShowNewHealthNote(false);
    loadHealthNotes();
  };
  const saveFeedPlan = async () => {
    setSavingFeedPlan(true);
    await supabase.from("horses").update({ feed_plan: feedPlan }).eq("id", horse.id);
    setSavingFeedPlan(false);
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
  useEffect(() => {
    loadTrainings();
    loadHealthNotes();
    supabase.auth.getUser().then(({ data }) => {
      const currentUid = data?.user?.id;
      setUid(currentUid);
      if (currentUid) loadPlans(currentUid);
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

  const setLast = (key, date) => {
    const existing = horse.health?.[key];
    const interval = existing?.interval ?? HEALTH_DEFAULT_INTERVAL[key];
    onSave({ ...horse, health: { ...horse.health, [key]: { last: date, interval } } });
    setEditKey(null);
  };
  return (
    <div>
      <button onClick={onBack} style={{ ...navBtn, marginTop: 14, display: "flex", alignItems: "center", gap: 4 }}><ChevronLeft size={15} /> Pferde</button>
      <div style={{ textAlign: "center", margin: "16px 0" }}>
        <div style={{ fontSize: 40 }}>🐴</div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 700, color: COLOR.ink }}>{horse.name}</div>
        {(horse.breed || horse.born || horse.owner) && (
          <div style={{ fontSize: 13, color: COLOR.inkSoft }}>
            {[horse.breed, horse.born && `geb. ${horse.born}`, horse.owner && `Besitzer:in ${horse.owner}`].filter(Boolean).join(" · ")}
          </div>
        )}
        {horse.note && <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginTop: 6, fontStyle: "italic" }}>{horse.note}</div>}
      </div>
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
                    {v ? `zuletzt ${fmtDate(v.last)} · alle ${v.interval} Wo.` : "Noch keine Angabe"}
                  </div>
                </div>
              </div>
              {v && (
                <Pill bg={d < 0 ? COLOR.dringendBg : d <= 7 ? COLOR.uebernommenBg : COLOR.erledigtBg} fg={d < 0 ? COLOR.dringend : d <= 7 ? COLOR.uebernommen : COLOR.erledigt}>
                  {d < 0 ? "überfällig" : d === 0 ? "heute" : `in ${d} Tg.`}
                </Pill>
              )}
            </div>
            {editKey === k ? (
              <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                <input type="date" defaultValue={v?.last} id={`d-${k}`} style={{ ...inputStyle, marginBottom: 0 }} />
                <button style={btnPrimary} onClick={() => setLast(k, document.getElementById(`d-${k}`).value)}>OK</button>
              </div>
            ) : (
              <button onClick={() => setEditKey(k)} style={{ ...btnGhost, marginTop: 8 }}>{v ? "Als erledigt markieren" : "Datum eintragen"}</button>
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
          <div style={{ fontSize: 11.5, color: COLOR.inkSoft }}>{fmtDate(n.date)} · {n.user_name}</div>
          <div style={{ fontSize: 13.5, color: COLOR.ink, marginTop: 2 }}>{n.note}</div>
        </Card>
      ))}

      <SectionTitle>
        <Wheat size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Futterplan
      </SectionTitle>
      <Card style={{ marginBottom: 8 }}>
        {editingFeedPlan ? (
          <>
            <textarea style={{ ...inputStyle, minHeight: 90 }} value={feedPlan} onChange={(e) => setFeedPlan(e.target.value)} placeholder="z. B. morgens 1 Schöpfer Müsli + Heu nach Bedarf …" />
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btnPrimary} disabled={savingFeedPlan} onClick={saveFeedPlan}>Speichern</button>
              <button style={btnGhost} onClick={() => { setFeedPlan(horse.feed_plan || ""); setEditingFeedPlan(false); }}>Abbrechen</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13.5, color: COLOR.ink, whiteSpace: "pre-wrap" }}>{feedPlan || "Noch kein Futterplan hinterlegt."}</div>
            <button onClick={() => setEditingFeedPlan(true)} style={{ ...btnGhost, marginTop: 8 }}>Futterplan bearbeiten</button>
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

      {showNewTraining && <NewTrainingModal onClose={() => setShowNewTraining(false)} onSave={addTraining} />}
      {showNewPlan && <NewPlanModal onClose={() => setShowNewPlan(false)} onSave={addPlan} />}
      {showNewHealthNote && <NewHealthNoteModal onClose={() => setShowNewHealthNote(false)} onSave={addHealthNote} />}
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
  return (
    <Modal title="Gesundheitsnotiz" onClose={onClose}>
      <label style={labelStyle}>Datum</label>
      <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
      <label style={labelStyle}>Notiz (z. B. "steifes Becken", "leichter Husten")</label>
      <textarea style={{ ...inputStyle, minHeight: 70 }} value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        disabled={!note.trim()}
        onClick={() => onSave({ date, note: note.trim() })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: !note.trim() ? 0.5 : 1 }}
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
