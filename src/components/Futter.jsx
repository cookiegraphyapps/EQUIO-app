import { useEffect, useState } from "react";
import { Wheat, Plus, Trash2, Pencil } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, SectionTitle, Empty, Modal, IconBtn, Pill, COLOR, todayISO, addDays, daysUntil, fmtDate, inputStyle, labelStyle, btnPrimary, btnGhost } from "./ui";

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

// Rechnet aus Tagesmengen und Packungspreis die Kostenanteile je Pferd aus.
function computeShares({ horses, amounts, packQty, price }) {
  const rows = horses.map((h) => ({ horse: h, amt: Number(amounts[h.id] || 0) })).filter((r) => r.amt > 0);
  const sum = rows.reduce((a, r) => a + r.amt, 0);
  if (sum === 0) return { rows: [], sum: 0, days: null };
  let remaining = Number(price) || 0;
  const withCost = rows.map((r, i) => {
    const share = r.amt / sum;
    const cost = i === rows.length - 1 ? +remaining.toFixed(2) : +((Number(price) || 0) * share).toFixed(2);
    remaining -= cost;
    return { ...r, share, cost };
  });
  const days = packQty > 0 ? packQty / sum : null;
  return { rows: withCost, sum, days };
}

export default function FutterSection({ user, isAdmin }) {
  const [feedTypes, setFeedTypes] = useState([]);
  const [horseFeed, setHorseFeed] = useState([]);
  const [horses, setHorses] = useState([]);
  const [people, setPeople] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [amountsFor, setAmountsFor] = useState(null);
  const [buyFor, setBuyFor] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editingFeed, setEditingFeed] = useState(null);
  const [notice, setNotice] = useState("");

  const load = async () => {
    const [typesRes, feedRes, horsesRes, peopleRes] = await Promise.all([
      supabase.from("feed_types").select("*").order("name"),
      supabase.from("horse_feed").select("*"),
      supabase.from("horses").select("id, name, owner").order("name"),
      supabase.from("profiles").select("name"),
    ]);
    setFeedTypes(typesRes.data ?? []);
    setHorseFeed(feedRes.data ?? []);
    setHorses(horsesRes.data ?? []);
    setPeople((peopleRes.data ?? []).map((p) => p.name));
  };
  useEffect(() => { load(); }, []);

  const amountsOf = (feedId) => Object.fromEntries(horseFeed.filter((f) => f.feed_type_id === feedId).map((f) => [f.horse_id, f.amount_per_day]));

  const addFeedType = async (name, unit, shared) => {
    if (editingFeed) {
      await supabase.from("feed_types").update({ name: name.trim(), unit: unit.trim() || "g", is_shared: shared }).eq("id", editingFeed.id);
    } else {
      await supabase.from("feed_types").insert({ name: name.trim(), unit: unit.trim() || "g", is_shared: shared });
    }
    setShowNew(false);
    setEditingFeed(null);
    load();
  };
  const deleteFeedType = async (id) => {
    await supabase.from("feed_types").delete().eq("id", id);
    setConfirmDeleteId(null);
    load();
  };
  const saveAmounts = async (feed, amounts) => {
    const rows = horses.map((h) => ({ horse_id: h.id, feed_type_id: feed.id, amount_per_day: Number(amounts[h.id] || 0) }));
    await supabase.from("horse_feed").upsert(rows, { onConflict: "horse_id,feed_type_id" });
    setAmountsFor(null);
    load();
  };

  // Legt pro Pferd eine Ausgabe an (mit Pferd-Zuordnung, damit sie in der Monatsübersicht
  // des Pferds auftaucht), aufgeteilt auf die Besitzer:in des Pferds.
  const buy = async ({ feed, packQty, price, paidBy, date }) => {
    const { rows, days } = computeShares({ horses, amounts: amountsOf(feed.id), packQty, price });
    const months = days ? Math.round(days / 30) : 0;
    const label = packQty > 0
      ? `${feed.name} ${fmt(feed.unit === "g" ? packQty / 1000 : packQty)} ${feed.unit === "g" ? "kg" : feed.unit}`
      : feed.name;
    for (const r of rows) {
      if (r.cost <= 0) continue;
      const owner = r.horse.owner || paidBy;
      const { data: exp, error } = await supabase.from("expenses").insert({
        description: `${label} – Anteil ${r.horse.name}`, amount: r.cost, date, paid_by: paidBy, horse_id: r.horse.id,
        duration_months: months > 1 ? months : null,
      }).select().single();
      if (error || !exp) continue;
      await supabase.from("expense_splits").insert({
        expense_id: exp.id, user_name: owner, amount: r.cost, status: owner === paidBy ? "erhalten" : "offen",
      });
      await supabase.from("horse_feed").update({ last_bought: date, lasts_days: days ? Math.round(days) : null, last_cost: r.cost })
        .eq("horse_id", r.horse.id).eq("feed_type_id", feed.id);
    }
    setBuyFor(null);
    setNotice(`Ausgaben für ${label} angelegt – zu sehen unter Finanzen.`);
  };

  return (
    <div>
      <SectionTitle right={<IconBtn onClick={() => setShowNew(true)}><Plus size={15} /> Futtersorte</IconBtn>}>
        <Wheat size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Futter
      </SectionTitle>
      <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginTop: -6, marginBottom: 10 }}>
        <strong>Geteilte</strong> Sorten (z. B. Hafer, Leinkuchen): Tagesmenge je Pferd hinterlegen – beim Kauf wird der Preis automatisch nach diesen Mengen auf Pferde und Besitzer:innen verteilt. <strong>Einzelne</strong> Sorten (z. B. Mineralfutter) kauft und trägt jedes Pferd im eigenen Profil ein.
      </div>
      {notice && <div style={{ background: COLOR.erledigtBg, color: COLOR.erledigt, borderRadius: 10, padding: "8px 10px", fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>{notice}</div>}
      {feedTypes.length === 0 && <Empty text="Noch keine Futtersorten." />}
      {feedTypes.map((f) => {
        const amounts = amountsOf(f.id);
        const active = horses.filter((h) => Number(amounts[h.id]) > 0);
        const sum = active.reduce((a, h) => a + Number(amounts[h.id]), 0);
        return (
          <Card key={f.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: COLOR.ink, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {f.name} <span style={{ fontWeight: 400, fontSize: 12, color: COLOR.inkSoft }}>({f.unit} pro Tag)</span>
                  <Pill bg={f.is_shared === false ? "#F3ECDD" : COLOR.privatBg} fg={f.is_shared === false ? COLOR.inkSoft : COLOR.privat}>{f.is_shared === false ? "einzeln" : "geteilt"}</Pill>
                </div>
                <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginTop: 4 }}>
                  {active.length === 0 ? "Noch keine Mengen hinterlegt" : active.map((h) => `${h.name} ${fmt(Number(amounts[h.id]))}`).join(" · ")}
                </div>
                {sum > 0 && <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginTop: 2 }}>Zusammen {fmt(sum)} {f.unit} pro Tag</div>}
              </div>
              {isAdmin && (
                confirmDeleteId === f.id ? (
                  <button onClick={() => deleteFeedType(f.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.dringend, fontSize: 11 }}>sicher?</button>
                ) : (
                  <button onClick={() => setConfirmDeleteId(f.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}><Trash2 size={13} /></button>
                )
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => setAmountsFor(f)} style={btnGhost}><Pencil size={12} style={{ verticalAlign: -1 }} /> Mengen</button>
              <button onClick={() => setEditingFeed(f)} style={btnGhost}>Name/Einheit</button>
              {f.is_shared !== false && (
                <button onClick={() => { setNotice(""); setBuyFor(f); }} disabled={sum === 0} style={{ ...btnPrimary, opacity: sum === 0 ? 0.5 : 1 }}>Gekauft – Kosten verteilen</button>
              )}
            </div>
          </Card>
        );
      })}

      {(showNew || editingFeed) && <NewFeedTypeModal editing={editingFeed} onClose={() => { setShowNew(false); setEditingFeed(null); }} onSave={addFeedType} />}
      {amountsFor && <AmountsModal feed={amountsFor} horses={horses} initial={amountsOf(amountsFor.id)} onClose={() => setAmountsFor(null)} onSave={(a) => saveAmounts(amountsFor, a)} />}
      {buyFor && <BuyModal feed={buyFor} horses={horses} people={people} amounts={amountsOf(buyFor.id)} defaultPayer={user} onClose={() => setBuyFor(null)} onSave={buy} />}
    </div>
  );
}

function NewFeedTypeModal({ editing, onClose, onSave }) {
  const [name, setName] = useState(editing?.name || "");
  const [unit, setUnit] = useState(editing?.unit || "g");
  const [shared, setShared] = useState(editing ? editing.is_shared !== false : true);
  return (
    <Modal title={editing ? "Futtersorte bearbeiten" : "Neue Futtersorte"} onClose={onClose}>
      <label style={labelStyle}>Name</label>
      <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Mash" />
      <label style={labelStyle}>Art</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[[true, "Geteilt (Kosten nach Menge)"], [false, "Einzeln (z. B. Mineralfutter)"]].map(([val, label]) => (
          <button key={String(val)} type="button" onClick={() => setShared(val)} style={{
            flex: 1, padding: "8px 4px", borderRadius: 9, border: `1px solid ${shared === val ? COLOR.accent : COLOR.line}`,
            background: shared === val ? "#F3ECDD" : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: COLOR.ink,
          }}>{label}</button>
        ))}
      </div>
      <label style={labelStyle}>Einheit der Tagesmenge</label>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {["g", "Becher", "Scoop"].map((u) => (
          <button key={u} type="button" onClick={() => setUnit(u)} style={{
            padding: "6px 11px", borderRadius: 999, border: `1px solid ${unit === u ? COLOR.accent : COLOR.line}`,
            background: unit === u ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
          }}>{u}</button>
        ))}
      </div>
      <input style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="oder eigene Einheit" />
      <button disabled={!name.trim()} onClick={() => onSave(name, unit, shared)} style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: name.trim() ? 1 : 0.5 }}>{editing ? "Speichern" : "Anlegen"}</button>
    </Modal>
  );
}

function AmountsModal({ feed, horses, initial, onClose, onSave }) {
  const [amounts, setAmounts] = useState(Object.fromEntries(horses.map((h) => [h.id, initial[h.id] ?? ""])));
  return (
    <Modal title={`${feed.name}: Menge pro Tag`} onClose={onClose}>
      <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginBottom: 12 }}>In {feed.unit} pro Tag. Pferde, die dieses Futter nicht bekommen, einfach leer lassen oder 0 eintragen. Bruchteile gehen auch (z. B. 0,5 oder 0,75).</div>
      {horses.map((h) => (
        <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ flex: 1, fontSize: 13.5, color: COLOR.ink }}>🐴 {h.name}</span>
          <input
            type="number" step="any" style={{ ...inputStyle, width: 100, marginBottom: 0 }}
            value={amounts[h.id]} onChange={(e) => setAmounts((a) => ({ ...a, [h.id]: e.target.value }))} placeholder="0"
          />
          <span style={{ fontSize: 12.5, color: COLOR.inkSoft, width: 44 }}>{feed.unit}</span>
        </div>
      ))}
      <button onClick={() => onSave(amounts)} style={{ ...btnPrimary, width: "100%", padding: "11px 0", marginTop: 8 }}>Speichern</button>
    </Modal>
  );
}

function BuyModal({ feed, horses, people, amounts, defaultPayer, onClose, onSave }) {
  const isGram = feed.unit === "g";
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [paidBy, setPaidBy] = useState(defaultPayer || people[0] || "");
  const [date, setDate] = useState(todayISO());
  const packQty = isGram ? Number(qty || 0) * 1000 : Number(qty || 0); // Sack wird in kg eingegeben
  const { rows, sum, days } = computeShares({ horses, amounts, packQty, price });
  const canSave = price && paidBy && rows.length > 0; // Sackgröße ist optional
  return (
    <Modal title={`${feed.name} gekauft`} onClose={onClose}>
      <label style={labelStyle}>Gesamtpreis (€)</label>
      <input type="number" step="any" style={inputStyle} value={price} onChange={(e) => setPrice(e.target.value)} />
      <label style={labelStyle}>Bezahlt von</label>
      <select style={inputStyle} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
        {people.map((p) => <option key={p}>{p}</option>)}
      </select>
      <label style={labelStyle}>Datum</label>
      <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
      <label style={labelStyle}>Packungsgröße in {isGram ? "kg" : feed.unit} (optional)</label>
      <input type="number" step="any" style={inputStyle} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="leer lassen, wenn unbekannt" />
      <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginTop: -8, marginBottom: 10 }}>
        Nur für die Anzeige „reicht ca. X Tage“ und die Verteilung auf Monate. Die Kostenaufteilung braucht sie nicht.
      </div>

      {rows.length > 0 && (
        <div style={{ background: "#F3ECDD", borderRadius: 10, padding: 10, marginBottom: 12 }}>
          {days && <div style={{ fontSize: 12.5, color: COLOR.ink, marginBottom: 6 }}>Reicht ca. <strong>{Math.round(days)} Tage</strong> bei zusammen {fmt(sum)} {feed.unit} pro Tag.</div>}
          {rows.map((r) => (
            <div key={r.horse.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: COLOR.ink, padding: "2px 0" }}>
              <span>🐴 {r.horse.name} ({Math.round(r.share * 100)} %) → {r.horse.owner || paidBy}</span>
              <strong>{r.cost.toFixed(2)} €</strong>
            </div>
          ))}
        </div>
      )}
      <button
        disabled={!canSave}
        onClick={() => onSave({ feed, packQty, price: Number(price), paidBy, date })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: canSave ? 1 : 0.5 }}
      >Ausgaben anlegen</button>
    </Modal>
  );
}

// Eingebettet im Pferdeprofil: eine Übersicht für ALLE Futtersorten (geteilt und einzeln) mit
// Tagesmenge, letztem Kauf, "reicht bis" und Monatskosten.
export function HorseFeedPlan({ horse, user }) {
  const [feedTypes, setFeedTypes] = useState([]);
  const [rows, setRows] = useState([]);
  const [people, setPeople] = useState([]);
  const [editing, setEditing] = useState(false);
  const [amounts, setAmounts] = useState({});
  const [buyFor, setBuyFor] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    const [typesRes, feedRes, peopleRes] = await Promise.all([
      supabase.from("feed_types").select("*").order("name"),
      supabase.from("horse_feed").select("*").eq("horse_id", horse.id),
      supabase.from("profiles").select("name"),
    ]);
    setFeedTypes(typesRes.data ?? []);
    setRows(feedRes.data ?? []);
    setPeople((peopleRes.data ?? []).map((p) => p.name));
    setAmounts(Object.fromEntries((feedRes.data ?? []).map((r) => [r.feed_type_id, String(r.amount_per_day)])));
  };
  useEffect(() => { load(); }, [horse.id]);

  const rowOf = (typeId) => rows.find((r) => r.feed_type_id === typeId);

  const saveAmounts = async () => {
    const payload = feedTypes.map((f) => ({ horse_id: horse.id, feed_type_id: f.id, amount_per_day: Number(amounts[f.id] || 0) }));
    await supabase.from("horse_feed").upsert(payload, { onConflict: "horse_id,feed_type_id" });
    setEditing(false);
    load();
  };

  const addType = async (name, unit, shared) => {
    await supabase.from("feed_types").insert({ name: name.trim(), unit: unit.trim() || "g", is_shared: shared });
    setShowNew(false);
    load();
  };

  // Einzelfutter (z.B. Mineralfutter für 90 Tage): Ausgabe für dieses Pferd anlegen, an die
  // Besitzer:in gehängt, mit Zeitraum, damit es in der Monatsübersicht anteilig auftaucht.
  const buyIndividual = async ({ feed, price, days, paidBy, date }) => {
    const owner = horse.owner || paidBy;
    const months = days ? Math.round(days / 30) : 0;
    const { data: exp } = await supabase.from("expenses").insert({
      description: `${feed.name} – ${horse.name}${days ? ` (reicht ca. ${days} Tage)` : ""}`, amount: price, date, paid_by: paidBy,
      horse_id: horse.id, duration_months: months > 1 ? months : null,
    }).select().single();
    if (exp) {
      await supabase.from("expense_splits").insert({
        expense_id: exp.id, user_name: owner, amount: price, status: owner === paidBy ? "erhalten" : "offen",
      });
    }
    await supabase.from("horse_feed").upsert({
      horse_id: horse.id, feed_type_id: feed.id, amount_per_day: Number(rowOf(feed.id)?.amount_per_day || 0),
      last_bought: date, lasts_days: days || null, last_cost: price,
    }, { onConflict: "horse_id,feed_type_id" });
    setBuyFor(null);
    load();
  };

  const active = feedTypes.map((t) => ({ t, row: rowOf(t.id) })).filter((x) => Number(x.row?.amount_per_day) > 0);
  const monthly = (row) => (row?.last_cost && row?.lasts_days ? (Number(row.last_cost) / Number(row.lasts_days)) * 30 : null);
  const totalMonthly = active.reduce((a, x) => a + (monthly(x.row) || 0), 0);

  return (
    <Card style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>Futter pro Tag</div>
          {!editing && totalMonthly > 0 && (
            <div style={{ fontSize: 12, color: COLOR.inkSoft, marginTop: 2 }}>≈ {totalMonthly.toFixed(2)} € Futterkosten pro Monat (nach den letzten Käufen)</div>
          )}
        </div>
        {!editing && <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}><Pencil size={14} /></button>}
      </div>

      {editing ? (
        <>
          {feedTypes.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ flex: 1, fontSize: 13.5, color: COLOR.ink }}>
                {f.name} <span style={{ fontSize: 11, color: COLOR.inkSoft }}>{f.is_shared === false ? "einzeln" : "geteilt"}</span>
              </span>
              <input
                type="number" step="any" style={{ ...inputStyle, width: 90, marginBottom: 0 }}
                value={amounts[f.id] ?? ""} onChange={(e) => setAmounts((a) => ({ ...a, [f.id]: e.target.value }))} placeholder="0"
              />
              <span style={{ fontSize: 12.5, color: COLOR.inkSoft, width: 54 }}>{f.unit}</span>
            </div>
          ))}
          <button onClick={() => setShowNew(true)} style={{ background: "none", border: "none", color: COLOR.inkSoft, fontSize: 12, cursor: "pointer", padding: "2px 0 10px" }}>＋ Neue Futtersorte</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveAmounts} style={{ ...btnPrimary, flex: 1 }}>Speichern</button>
            <button onClick={() => { setEditing(false); load(); }} style={{ ...btnGhost, flex: 1 }}>Abbrechen</button>
          </div>
        </>
      ) : active.length === 0 ? (
        <div style={{ fontSize: 13, color: COLOR.inkSoft }}>Noch keine Futtermengen hinterlegt – oben auf ✏️ tippen.</div>
      ) : (
        active.map(({ t, row }, i) => {
          const endISO = row.last_bought && row.lasts_days ? addDays(row.last_bought, row.lasts_days) : null;
          const left = endISO ? daysUntil(endISO) : null;
          const m = monthly(row);
          return (
            <div key={t.id} style={{ padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${COLOR.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: COLOR.ink }}>{t.name}</span>
                  <Pill bg={t.is_shared === false ? "#F3ECDD" : COLOR.privatBg} fg={t.is_shared === false ? COLOR.inkSoft : COLOR.privat}>{t.is_shared === false ? "einzeln" : "geteilt"}</Pill>
                </div>
                <span style={{ fontFamily: "Fraunces, serif", fontSize: 16, fontWeight: 700, color: COLOR.ink, whiteSpace: "nowrap" }}>{fmt(Number(row.amount_per_day))} {t.unit}</span>
              </div>
              {row.last_bought ? (
                <div style={{ fontSize: 12, color: COLOR.inkSoft, marginTop: 4 }}>
                  zuletzt gekauft {fmtDate(row.last_bought)}{row.last_cost ? ` · ${Number(row.last_cost).toFixed(2)} €` : ""}
                  {endISO && (
                    <> · <span style={{ color: left <= 7 ? COLOR.dringend : COLOR.inkSoft, fontWeight: left <= 7 ? 700 : 400 }}>
                      {left > 0 ? `reicht noch ca. ${left} Tage (bis ${fmtDate(endISO)})` : "Vorrat vermutlich aufgebraucht"}
                    </span></>
                  )}
                  {m && <> · ≈ {m.toFixed(2)} €/Monat</>}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: COLOR.inkSoft, marginTop: 4 }}>Noch kein Kauf eingetragen</div>
              )}
              {t.is_shared === false && (
                <button onClick={() => setBuyFor(t)} style={{ ...btnGhost, marginTop: 6, padding: "4px 10px", fontSize: 12 }}>Gekauft eintragen</button>
              )}
            </div>
          );
        })
      )}

      {showNew && <NewFeedTypeModal onClose={() => setShowNew(false)} onSave={addType} />}
      {buyFor && (
        <BuyIndividualModal
          feed={buyFor} horse={horse} people={people} defaultPayer={user} amountPerDay={Number(rowOf(buyFor.id)?.amount_per_day || 0)}
          onClose={() => setBuyFor(null)} onSave={buyIndividual}
        />
      )}
    </Card>
  );
}

function BuyIndividualModal({ feed, horse, people, defaultPayer, amountPerDay, onClose, onSave }) {
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("");
  const [qty, setQty] = useState("");
  const [paidBy, setPaidBy] = useState(defaultPayer || people[0] || "");
  const [date, setDate] = useState(todayISO());
  // Hält-Tage entweder direkt eingeben oder aus Packungsmenge ÷ Tagesmenge berechnen lassen.
  const effectiveDays = days ? Math.round(Number(days)) : (Number(qty) > 0 && amountPerDay > 0 ? Math.round(Number(qty) / amountPerDay) : 0);
  const monthlyCost = Number(price) > 0 && effectiveDays > 0 ? (Number(price) / effectiveDays) * 30 : null;
  return (
    <Modal title={`${feed.name} für ${horse.name}`} onClose={onClose}>
      <label style={labelStyle}>Preis (€)</label>
      <input type="number" step="any" style={inputStyle} value={price} onChange={(e) => setPrice(e.target.value)} />
      <label style={labelStyle}>Reicht ca. wie viele Tage? (z. B. 90)</label>
      <input type="number" style={inputStyle} value={days} onChange={(e) => setDays(e.target.value)} placeholder="z. B. 90" />
      {!days && (
        <>
          <label style={labelStyle}>… oder Packungsmenge in {feed.unit} (rechnet die Tage aus)</label>
          <input type="number" step="any" style={inputStyle} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="optional" />
        </>
      )}
      <label style={labelStyle}>Bezahlt von</label>
      <select style={inputStyle} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
        {people.map((p) => <option key={p}>{p}</option>)}
      </select>
      <label style={labelStyle}>Datum</label>
      <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
      {monthlyCost && (
        <div style={{ background: "#F3ECDD", borderRadius: 10, padding: 10, marginBottom: 12, fontSize: 13, color: COLOR.ink }}>
          Reicht ca. <strong>{effectiveDays} Tage</strong> → ≈ <strong>{monthlyCost.toFixed(2)} € pro Monat</strong>. Kosten gehen an {horse.owner || paidBy}.
        </div>
      )}
      <button
        disabled={!price || !paidBy}
        onClick={() => onSave({ feed, price: Number(price), days: effectiveDays || null, paidBy, date })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: !price || !paidBy ? 0.5 : 1 }}
      >Ausgabe anlegen</button>
    </Modal>
  );
}
