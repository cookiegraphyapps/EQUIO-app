import { useEffect, useState } from "react";
import { Wheat, Plus, Trash2 } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, SectionTitle, Empty, Modal, IconBtn, COLOR, fmtDate, todayISO, parseISODate, inputStyle, labelStyle, btnPrimary, btnGhost } from "./ui";

// Winter = September bis April, Sommer = Mai bis August.
function isWinterMonth(month) { return month >= 9 || month <= 4; }

export default function HeuSection({ isAdmin }) {
  const [batches, setBatches] = useState([]);
  const [horses, setHorses] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [closingId, setClosingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const load = async () => {
    const [batchesRes, horsesRes] = await Promise.all([
      supabase.from("hay_batches").select("*").order("date_bought", { ascending: false }),
      supabase.from("horses").select("id, name"),
    ]);
    setBatches(batchesRes.data ?? []);
    setHorses(horsesRes.data ?? []);
  };
  useEffect(() => { load(); }, []);

  const addBatch = async (data) => {
    await supabase.from("hay_batches").insert({
      date_bought: data.dateBought, bale_count: Number(data.baleCount), horse_ids: data.horseIds, note: data.note || null,
    });
    setShowNew(false);
    load();
  };

  const closeBatch = async (id, dateRanOut) => {
    await supabase.from("hay_batches").update({ date_ran_out: dateRanOut }).eq("id", id);
    setClosingId(null);
    load();
  };

  const deleteBatch = async (id) => {
    await supabase.from("hay_batches").delete().eq("id", id);
    setConfirmDeleteId(null);
    load();
  };

  // Hochrechnung: Ballen pro Pferd und Tag, getrennt für Winter-/Sommermonate,
  // auf Basis aller abgeschlossenen (aufgebrauchten) Ballen-Einträge.
  const seasonStats = (() => {
    const totals = { winter: { balesPerHorseDays: 0, days: 0 }, summer: { balesPerHorseDays: 0, days: 0 } };
    batches.forEach((b) => {
      if (!b.date_ran_out) return;
      const start = parseISODate(b.date_bought);
      const end = parseISODate(b.date_ran_out);
      const totalDays = Math.round((end - start) / 86400000);
      if (totalDays <= 0) return;
      const horseCount = (b.horse_ids || []).length || 1;
      const balesPerDayPerHorse = b.bale_count / totalDays / horseCount;
      const cur = new Date(start);
      for (let i = 0; i < totalDays; i++) {
        const season = isWinterMonth(cur.getMonth() + 1) ? "winter" : "summer";
        totals[season].balesPerHorseDays += balesPerDayPerHorse;
        totals[season].days += 1;
        cur.setDate(cur.getDate() + 1);
      }
    });
    const perMonth = (season) => totals[season].days > 0 ? (totals[season].balesPerHorseDays / totals[season].days) * 30 : null;
    return { winterPerHorseMonth: perMonth("winter"), summerPerHorseMonth: perMonth("summer") };
  })();

  const horseNames = Object.fromEntries(horses.map((h) => [h.id, h.name]));

  return (
    <div>
      <SectionTitle right={<IconBtn onClick={() => setShowNew(true)}><Plus size={15} /> Heuballen</IconBtn>}>
        <Wheat size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Heu-Verbrauch
      </SectionTitle>

      {(seasonStats.winterPerHorseMonth || seasonStats.summerPerHorseMonth) && (
        <Card style={{ marginBottom: 12, background: "#F3ECDD" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLOR.ink, marginBottom: 6 }}>Ø Hochrechnung pro Pferd und Monat</div>
          <div style={{ display: "flex", gap: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: COLOR.inkSoft }}>Winter (Sep–Apr)</div>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 700, color: COLOR.ink }}>
                {seasonStats.winterPerHorseMonth ? seasonStats.winterPerHorseMonth.toFixed(1) : "–"} Ballen
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: COLOR.inkSoft }}>Sommer (Mai–Aug)</div>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 700, color: COLOR.ink }}>
                {seasonStats.summerPerHorseMonth ? seasonStats.summerPerHorseMonth.toFixed(1) : "–"} Ballen
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: COLOR.inkSoft, marginTop: 6 }}>Basiert nur auf bereits aufgebrauchten Ballen-Einträgen.</div>
        </Card>
      )}

      {batches.length === 0 && <Empty text="Noch keine Heuballen eingetragen." />}
      {batches.map((b) => {
        const days = b.date_ran_out ? Math.round((parseISODate(b.date_ran_out) - parseISODate(b.date_bought)) / 86400000) : null;
        return (
          <Card key={b.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: COLOR.ink }}>{b.bale_count} Heuballen</div>
                <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginTop: 2 }}>
                  gekauft {fmtDate(b.date_bought)} · {(b.horse_ids || []).length} Pferd{(b.horse_ids || []).length === 1 ? "" : "e"}
                  {(b.horse_ids || []).length > 0 && `: ${b.horse_ids.map((id) => horseNames[id] || "?").join(", ")}`}
                </div>
                {b.date_ran_out ? (
                  <div style={{ fontSize: 12.5, color: COLOR.erledigt, marginTop: 4 }}>Aufgebraucht am {fmtDate(b.date_ran_out)} · hielt {days} Tage</div>
                ) : (
                  <div style={{ fontSize: 12.5, color: COLOR.uebernommen, marginTop: 4 }}>Noch nicht aufgebraucht</div>
                )}
                {b.note && <div style={{ fontSize: 12.5, color: COLOR.ink, marginTop: 4 }}>{b.note}</div>}
              </div>
            </div>
            {!b.date_ran_out && (
              closingId === b.id ? (
                <CloseBatchForm onSave={(date) => closeBatch(b.id, date)} onCancel={() => setClosingId(null)} />
              ) : (
                <button onClick={() => setClosingId(b.id)} style={{ ...btnGhost, marginTop: 8 }}>Als aufgebraucht markieren</button>
              )
            )}
            {isAdmin && (
              confirmDeleteId === b.id ? (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => deleteBatch(b.id)} style={{ ...btnPrimary, background: COLOR.dringend }}>Wirklich löschen</button>
                  <button onClick={() => setConfirmDeleteId(null)} style={btnGhost}>Abbrechen</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDeleteId(b.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft, marginTop: 8 }}>
                  <Trash2 size={13} />
                </button>
              )
            )}
          </Card>
        );
      })}
      {showNew && <NewBatchModal horses={horses} onClose={() => setShowNew(false)} onSave={addBatch} />}
    </div>
  );
}

function CloseBatchForm({ onSave, onCancel }) {
  const [date, setDate] = useState(todayISO());
  return (
    <div style={{ marginTop: 8 }}>
      <label style={labelStyle}>Aufgebraucht am</label>
      <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onSave(date)} style={{ ...btnPrimary, flex: 1 }}>Speichern</button>
        <button onClick={onCancel} style={{ ...btnGhost, flex: 1 }}>Abbrechen</button>
      </div>
    </div>
  );
}

function NewBatchModal({ horses, onClose, onSave }) {
  const [dateBought, setDateBought] = useState(todayISO());
  const [baleCount, setBaleCount] = useState("");
  const [horseIds, setHorseIds] = useState([]);
  const [note, setNote] = useState("");
  const toggleHorse = (id) => setHorseIds((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  return (
    <Modal title="Heuballen eintragen" onClose={onClose}>
      <label style={labelStyle}>Datum (gekauft/geliefert)</label>
      <input type="date" style={inputStyle} value={dateBought} onChange={(e) => setDateBought(e.target.value)} />
      <label style={labelStyle}>Anzahl Heuballen</label>
      <input type="number" style={inputStyle} value={baleCount} onChange={(e) => setBaleCount(e.target.value)} placeholder="z. B. 20" />
      <label style={labelStyle}>Welche Pferde fressen davon?</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {horses.map((h) => (
          <button key={h.id} type="button" onClick={() => toggleHorse(h.id)} style={{
            padding: "6px 11px", borderRadius: 999, border: `1px solid ${horseIds.includes(h.id) ? COLOR.accent : COLOR.line}`,
            background: horseIds.includes(h.id) ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
          }}>{h.name}</button>
        ))}
      </div>
      <label style={labelStyle}>Notiz (optional)</label>
      <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        disabled={!baleCount || horseIds.length === 0}
        onClick={() => onSave({ dateBought, baleCount, horseIds, note })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: (!baleCount || horseIds.length === 0) ? 0.5 : 1 }}
      >Speichern</button>
    </Modal>
  );
}
