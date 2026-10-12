import { useEffect, useState } from "react";
import { CheckCircle2, Plus, Repeat, Trash2, Pause, Play, ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, SectionTitle, Empty, IconBtn, Modal, COLOR, fmtDate, todayISO, inputStyle, labelStyle, btnPrimary, btnGhost } from "../components/ui";

export default function Finanzen({ user, isAdmin }) {
  const [expenses, setExpenses] = useState([]);
  const [people, setPeople] = useState([]);
  const [horses, setHorses] = useState([]);
  const [recurringExpenses, setRecurringExpenses] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [showNewRecurring, setShowNewRecurring] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteRecurringId, setConfirmDeleteRecurringId] = useState(null);
  const [showPaid, setShowPaid] = useState(false);
  const [standingOrders, setStandingOrders] = useState([]);
  const [showNewStanding, setShowNewStanding] = useState(false);
  const [confirmDeleteStandingId, setConfirmDeleteStandingId] = useState(null);

  // Erzeugt die Personen-Aufteilung für eine einzelne Ausgabe (gleichmäßig oder individuell).
  const splitPeopleForExpense = async (expenseId, recurring) => {
    let rows;
    if (recurring.split_mode === "custom") {
      rows = Object.entries(recurring.custom_splits || {}).filter(([, amt]) => Number(amt) > 0).map(([p, amt]) => ({
        expense_id: expenseId, user_name: p, amount: +Number(amt).toFixed(2), status: p === recurring.paid_by ? "erhalten" : "offen",
      }));
    } else {
      const per = +(Number(recurring.amount) / recurring.people.length).toFixed(2);
      rows = recurring.people.map((p) => ({ expense_id: expenseId, user_name: p, amount: per, status: p === recurring.paid_by ? "erhalten" : "offen" }));
    }
    if (rows.length > 0) await supabase.from("expense_splits").insert(rows);
  };

  // Für jede aktive wiederkehrende Kostenposition prüfen, ob für den aktuellen Monat
  // schon eine echte Ausgabe erzeugt wurde – falls nicht, automatisch anlegen.
  // Bei Pro-Pferd-Aufteilung wird pro Pferd eine eigene Ausgabe mit dessen Anteil erzeugt,
  // und die Personen-Aufteilung bezieht sich dann jeweils auf diesen Pferde-Anteil.
  const generateRecurring = async (recurring, existingExpenses) => {
    const monthStart = todayISO().slice(0, 7) + "-01";
    const alreadyExists = existingExpenses.some((ex) => ex.recurring_expense_id === recurring.id && ex.date >= monthStart);
    if (alreadyExists) return;

    if (recurring.split_by_horse) {
      const entries = Object.entries(recurring.horse_splits || {}).filter(([, amt]) => Number(amt) > 0);
      for (const [horseId, amt] of entries) {
        const { data: exp, error } = await supabase.from("expenses").insert({
          description: recurring.description, amount: +Number(amt).toFixed(2), date: todayISO(),
          paid_by: recurring.paid_by, horse_id: horseId, recurring_expense_id: recurring.id,
        }).select().single();
        if (error || !exp) continue;
        await splitPeopleForExpense(exp.id, { ...recurring, amount: amt, split_mode: "even" });
      }
      return;
    }

    const { data: exp, error } = await supabase.from("expenses").insert({
      description: recurring.description, amount: recurring.amount, date: todayISO(),
      paid_by: recurring.paid_by, horse_id: recurring.horse_id || null, recurring_expense_id: recurring.id,
    }).select().single();
    if (error || !exp) return;
    await splitPeopleForExpense(exp.id, recurring);
  };

  // Verrechnet pro aktivem Dauerauftrag den monatlichen Betrag (+ evtl. vorhandenes Guthaben)
  // mit den aktuell offenen Posten zwischen Zahler:in und Empfänger:in – älteste zuerst.
  // Was übrig bleibt, wird als neues Guthaben gespeichert und deckt automatisch spätere offene Posten ab.
  const applyStandingOrders = async (orders, currentExpenses) => {
    for (const order of orders) {
      let available = Number(order.amount) + Number(order.credit_balance || 0);
      if (available <= 0) continue;
      const openSplits = [];
      currentExpenses.forEach((ex) => {
        (ex.expense_splits || []).forEach((s) => {
          if (s.status !== "erhalten" && s.user_name === order.payer && ex.paid_by === order.payee) {
            openSplits.push({ id: s.id, amount: Number(s.amount), date: ex.date });
          }
        });
      });
      openSplits.sort((a, b) => a.date.localeCompare(b.date));
      const toSettle = [];
      for (const s of openSplits) {
        if (available < s.amount) break;
        toSettle.push(s.id);
        available -= s.amount;
      }
      if (toSettle.length > 0) await supabase.from("expense_splits").update({ status: "erhalten" }).in("id", toSettle);
      if (available !== Number(order.credit_balance || 0)) {
        await supabase.from("standing_orders").update({ credit_balance: available }).eq("id", order.id);
      }
    }
  };

  const load = async () => {
    const [expRes, profRes, horsesRes, recurringRes, standingRes] = await Promise.all([
      supabase.from("expenses").select("*, expense_splits(*)").order("date", { ascending: false }),
      supabase.from("profiles").select("name"),
      supabase.from("horses").select("id, name"),
      supabase.from("recurring_expenses").select("*").order("created_at"),
      supabase.from("standing_orders").select("*").order("created_at"),
    ]);
    const existingExpenses = expRes.data ?? [];
    const recurring = recurringRes.data ?? [];
    const standing = standingRes.data ?? [];
    const activeRecurring = recurring.filter((r) => r.active);
    const activeStanding = standing.filter((s) => s.active);
    if (activeRecurring.length > 0) {
      await Promise.all(activeRecurring.map((r) => generateRecurring(r, existingExpenses)));
    }
    if (activeRecurring.length > 0 || activeStanding.length > 0) {
      const { data: refreshed } = await supabase.from("expenses").select("*, expense_splits(*)").order("date", { ascending: false });
      const freshExpenses = refreshed ?? existingExpenses;
      if (activeStanding.length > 0) {
        await applyStandingOrders(activeStanding, freshExpenses);
        const { data: afterStanding } = await supabase.from("expenses").select("*, expense_splits(*)").order("date", { ascending: false });
        setExpenses(afterStanding ?? freshExpenses);
        const { data: standingRefreshed } = await supabase.from("standing_orders").select("*").order("created_at");
        setStandingOrders(standingRefreshed ?? standing);
      } else {
        setExpenses(freshExpenses);
        setStandingOrders(standing);
      }
    } else {
      setExpenses(existingExpenses);
      setStandingOrders(standing);
    }
    setPeople((profRes.data ?? []).map((p) => p.name));
    setHorses(horsesRes.data ?? []);
    setRecurringExpenses(recurring);
  };
  useEffect(() => { load(); }, []);

  const addStandingOrder = async (data) => {
    await supabase.from("standing_orders").insert({
      payer: data.payer, payee: data.payee, amount: +data.amount, note: data.note || null, active: true,
    });
    setShowNewStanding(false);
    load();
  };
  const toggleStandingActive = async (s) => {
    await supabase.from("standing_orders").update({ active: !s.active }).eq("id", s.id);
    load();
  };
  const deleteStandingOrder = async (id) => {
    await supabase.from("standing_orders").delete().eq("id", id);
    setConfirmDeleteStandingId(null);
    load();
  };

  const addRecurring = async (data) => {
    const horseTotal = data.splitByHorse ? Object.values(data.horseSplits).reduce((a, b) => a + Number(b || 0), 0) : null;
    await supabase.from("recurring_expenses").insert({
      description: data.desc,
      amount: data.splitByHorse ? horseTotal : +data.amount,
      paid_by: data.paidBy,
      horse_id: data.splitByHorse ? null : (data.horseId || null),
      split_by_horse: data.splitByHorse,
      horse_splits: data.splitByHorse ? data.horseSplits : {},
      people: data.people, split_mode: data.mode, custom_splits: data.mode === "custom" ? data.splits : {}, active: true,
    });
    setShowNewRecurring(false);
    load();
  };
  const toggleRecurringActive = async (r) => {
    await supabase.from("recurring_expenses").update({ active: !r.active }).eq("id", r.id);
    load();
  };
  const deleteRecurring = async (id) => {
    await supabase.from("recurring_expenses").delete().eq("id", id);
    setConfirmDeleteRecurringId(null);
    load();
  };

  const setStatus = async (splitId, status) => {
    await supabase.from("expense_splits").update({ status }).eq("id", splitId);
    load();
  };

  const deleteExpense = async (id) => {
    await supabase.from("expenses").delete().eq("id", id);
    setConfirmDeleteId(null);
    load();
  };

  const addExpense = async (data) => {
    const total = data.mode === "custom"
      ? Object.values(data.splits).reduce((a, b) => a + Number(b || 0), 0)
      : +data.amount;
    const { data: exp, error } = await supabase.from("expenses").insert({
      description: data.desc, amount: total, date: todayISO(), paid_by: data.paidBy, horse_id: data.horseId || null,
      duration_months: data.durationMonths ? Number(data.durationMonths) : null,
    }).select().single();
    if (error) return;
    let rows;
    if (data.mode === "custom") {
      rows = Object.entries(data.splits).filter(([, amt]) => Number(amt) > 0).map(([p, amt]) => ({
        expense_id: exp.id, user_name: p, amount: +Number(amt).toFixed(2), status: p === data.paidBy ? "erhalten" : "offen",
      }));
    } else {
      const per = +(total / data.people.length).toFixed(2);
      rows = data.people.map((p) => ({ expense_id: exp.id, user_name: p, amount: per, status: p === data.paidBy ? "erhalten" : "offen" }));
    }
    await supabase.from("expense_splits").insert(rows);
    setShowNew(false);
    load();
  };

  const totalOffen = expenses.reduce((s, ex) => s + (ex.expense_splits || []).filter((x) => x.status !== "erhalten" && x.user_name === user).reduce((a, b) => a + Number(b.amount), 0), 0);

  // Alle offenen Beträge zwischen je zwei Personen gegenrechnen, damit am Ende nur
  // noch ein einziger Betrag pro Personenpaar übrig bleibt (statt vieler Einzelposten).
  const netBalances = (() => {
    const debts = {}; // debts[schuldet][an] = betrag
    expenses.forEach((ex) => {
      (ex.expense_splits || []).forEach((s) => {
        if (s.status === "erhalten" || s.user_name === ex.paid_by) return;
        debts[s.user_name] = debts[s.user_name] || {};
        debts[s.user_name][ex.paid_by] = (debts[s.user_name][ex.paid_by] || 0) + Number(s.amount);
      });
    });
    const names = new Set();
    Object.keys(debts).forEach((d) => { names.add(d); Object.keys(debts[d]).forEach((c) => names.add(c)); });
    const arr = Array.from(names);
    const pairs = [];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        const net = (debts[a]?.[b] || 0) - (debts[b]?.[a] || 0);
        if (Math.abs(net) > 0.004) {
          pairs.push(net > 0 ? { debtor: a, creditor: b, amount: net } : { debtor: b, creditor: a, amount: -net });
        }
      }
    }
    return pairs.sort((x, y) => y.amount - x.amount);
  })();

  const isExpensePaid = (ex) => (ex.expense_splits || []).length > 0 && (ex.expense_splits || []).every((s) => s.status === "erhalten");
  const openExpenses = expenses.filter((ex) => !isExpensePaid(ex));
  const paidExpenses = expenses.filter(isExpensePaid);

  const settlePair = async (debtor, creditor) => {
    const splitIds = [];
    expenses.forEach((ex) => {
      (ex.expense_splits || []).forEach((s) => {
        if (s.status === "erhalten") return;
        if ((s.user_name === debtor && ex.paid_by === creditor) || (s.user_name === creditor && ex.paid_by === debtor)) {
          splitIds.push(s.id);
        }
      });
    });
    if (splitIds.length > 0) {
      await supabase.from("expense_splits").update({ status: "erhalten" }).in("id", splitIds);
      load();
    }
  };

  return (
    <div>
      <SectionTitle right={<IconBtn onClick={() => setShowNew(true)}><Plus size={15} /> Ausgabe</IconBtn>}>Finanzen</SectionTitle>
      <Card style={{ marginBottom: 14, background: COLOR.privatBg, border: "none" }}>
        <div style={{ fontSize: 12, color: COLOR.privat, fontWeight: 600 }}>Deine offenen Anteile</div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 700, color: COLOR.ink }}>{totalOffen.toFixed(2)} €</div>
      </Card>

      <SectionTitle>⚖️ Verrechnung</SectionTitle>
      {netBalances.length === 0 && <Empty text="Alles beglichen." />}
      {netBalances.map((p) => (
        <Card key={`${p.debtor}-${p.creditor}`} style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13.5, color: COLOR.ink }}>
            <strong>{p.debtor}</strong> schuldet <strong>{p.creditor}</strong>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 700, marginTop: 2 }}>{p.amount.toFixed(2)} €</div>
          </div>
          <button onClick={() => settlePair(p.debtor, p.creditor)} style={btnPrimary}>Als beglichen markieren</button>
        </Card>
      ))}

      <SectionTitle right={<IconBtn onClick={() => setShowNewStanding(true)}><Plus size={15} /> Dauerauftrag</IconBtn>}>
        <Repeat size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Daueraufträge
      </SectionTitle>
      <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginTop: -6, marginBottom: 10 }}>
        Deckt offene Beträge zwischen zwei Personen automatisch ab – ohne manuelles „Überwiesen" klicken. Zahlst du mehr als gerade offen ist, bleibt der Rest als Guthaben stehen und deckt automatisch den nächsten offenen Betrag mit ab.
      </div>
      {standingOrders.length === 0 && <Empty text="Noch keine Daueraufträge." />}
      {standingOrders.map((s) => (
        <Card key={s.id} style={{ marginBottom: 8, opacity: s.active ? 1 : 0.55 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: COLOR.ink }}>{s.payer} → {s.payee}</div>
              <div style={{ fontSize: 11.5, color: COLOR.inkSoft }}>
                {Number(s.amount).toFixed(2)} € monatlich{!s.active && " · pausiert"}
                {s.note && ` · ${s.note}`}
              </div>
              {Number(s.credit_balance) > 0.004 && (
                <div style={{ fontSize: 12, color: COLOR.erledigt, marginTop: 2 }}>Guthaben: {Number(s.credit_balance).toFixed(2)} € (deckt den nächsten offenen Betrag automatisch mit ab)</div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => toggleStandingActive(s)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}>
                {s.active ? <Pause size={14} /> : <Play size={14} />}
              </button>
              {isAdmin && (
                confirmDeleteStandingId === s.id ? (
                  <button onClick={() => deleteStandingOrder(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.dringend, fontSize: 11 }}>sicher?</button>
                ) : (
                  <button onClick={() => setConfirmDeleteStandingId(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}>
                    <Trash2 size={14} />
                  </button>
                )
              )}
            </div>
          </div>
        </Card>
      ))}

      <SectionTitle right={<IconBtn onClick={() => setShowNewRecurring(true)}><Plus size={15} /> Wiederkehrend</IconBtn>}>
        <Repeat size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Wiederkehrende Kosten
      </SectionTitle>
      {recurringExpenses.length === 0 && <Empty text="Noch keine wiederkehrenden Kosten." />}
      {recurringExpenses.map((r) => (
        <Card key={r.id} style={{ marginBottom: 8, opacity: r.active ? 1 : 0.55 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: COLOR.ink }}>{r.description}</div>
              <div style={{ fontSize: 11.5, color: COLOR.inkSoft }}>
                bezahlt von {r.paid_by} · jeden Monat{!r.active && " · pausiert"}
                {r.horse_id && ` · 🐴 ${horses.find((h) => h.id === r.horse_id)?.name || ""}`}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 14, color: COLOR.ink }}>{Number(r.amount).toFixed(2)} €</span>
              <button onClick={() => toggleRecurringActive(r)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}>
                {r.active ? <Pause size={14} /> : <Play size={14} />}
              </button>
              {isAdmin && (
                confirmDeleteRecurringId === r.id ? (
                  <button onClick={() => deleteRecurring(r.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.dringend, fontSize: 11 }}>sicher?</button>
                ) : (
                  <button onClick={() => setConfirmDeleteRecurringId(r.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}>
                    <Trash2 size={14} />
                  </button>
                )
              )}
            </div>
          </div>
        </Card>
      ))}

      <SectionTitle>Ausgaben</SectionTitle>
      {openExpenses.length === 0 && <Empty text="Keine offenen Ausgaben." />}
      {openExpenses.map((ex) => (
        <ExpenseCard key={ex.id} ex={ex} horses={horses} user={user} isAdmin={isAdmin} onSetStatus={setStatus}
          confirmDelete={confirmDeleteId === ex.id} onConfirmDelete={() => setConfirmDeleteId(ex.id)}
          onCancelDelete={() => setConfirmDeleteId(null)} onDelete={() => deleteExpense(ex.id)} />
      ))}

      {paidExpenses.length > 0 && (
        <>
          <button onClick={() => setShowPaid((v) => !v)} style={{
            display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer",
            color: COLOR.inkSoft, fontSize: 13, fontWeight: 600, padding: "10px 0",
          }}>
            {showPaid ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            ✅ Bezahlt ({paidExpenses.length})
          </button>
          {showPaid && paidExpenses.map((ex) => (
            <ExpenseCard key={ex.id} ex={ex} horses={horses} user={user} isAdmin={isAdmin} onSetStatus={setStatus}
              confirmDelete={confirmDeleteId === ex.id} onConfirmDelete={() => setConfirmDeleteId(ex.id)}
              onCancelDelete={() => setConfirmDeleteId(null)} onDelete={() => deleteExpense(ex.id)} />
          ))}
        </>
      )}
      {showNew && <NewExpenseModal people={people} horses={horses} onClose={() => setShowNew(false)} onSave={addExpense} />}
      {showNewRecurring && <NewRecurringExpenseModal people={people} horses={horses} onClose={() => setShowNewRecurring(false)} onSave={addRecurring} />}
      {showNewStanding && <NewStandingOrderModal people={people} defaultPayer={user} onClose={() => setShowNewStanding(false)} onSave={addStandingOrder} />}
    </div>
  );
}

function NewExpenseModal({ people, horses, onClose, onSave }) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(people[0] || "");
  const [selected, setSelected] = useState(people);
  const [mode, setMode] = useState("even"); // even | custom
  const [splits, setSplits] = useState({});
  const [horseId, setHorseId] = useState("");
  const [durationMonths, setDurationMonths] = useState("");
  const toggle = (u) => setSelected((p) => (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]));
  const setSplitAmount = (u, val) => setSplits((s) => ({ ...s, [u]: val }));
  const modeBtn = { flex: 1, padding: "8px 0", borderRadius: 9, border: `1px solid ${COLOR.line}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
  const customTotal = selected.reduce((a, u) => a + Number(splits[u] || 0), 0);

  const canSave = mode === "even"
    ? (desc.trim() && amount && selected.length > 0 && paidBy)
    : (desc.trim() && selected.length > 0 && paidBy && customTotal > 0);

  return (
    <Modal title="Neue Ausgabe" onClose={onClose}>
      <label style={labelStyle}>Beschreibung</label>
      <input style={inputStyle} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="z. B. Mineralfutter" />
      <label style={labelStyle}>Kategorie</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        <button type="button" onClick={() => setHorseId("")} style={{
          padding: "6px 11px", borderRadius: 999, border: `1px solid ${horseId === "" ? COLOR.accent : COLOR.line}`,
          background: horseId === "" ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
        }}>Allgemeine Stallausgabe</button>
        {horses.map((h) => (
          <button key={h.id} type="button" onClick={() => setHorseId(h.id)} style={{
            padding: "6px 11px", borderRadius: 999, border: `1px solid ${horseId === h.id ? COLOR.accent : COLOR.line}`,
            background: horseId === h.id ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
          }}>🐴 {h.name}</button>
        ))}
      </div>
      {horseId && (
        <>
          <label style={labelStyle}>Hält wie viele Monate? (optional, z. B. Mineralfutter: 3)</label>
          <input type="number" min="1" style={inputStyle} value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} placeholder="1 = nur dieser Monat" />
          <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginTop: -8, marginBottom: 10 }}>
            Wird dann beim Pferd auf die Monate verteilt angezeigt (Gesamtbetrag ÷ Monate).
          </div>
        </>
      )}
      <label style={labelStyle}>Bezahlt von</label>
      <select style={inputStyle} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
        {people.map((u) => <option key={u}>{u}</option>)}
      </select>
      <label style={labelStyle}>Aufteilen auf</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {people.map((u) => (
          <button key={u} type="button" onClick={() => toggle(u)} style={{
            padding: "6px 11px", borderRadius: 999, border: `1px solid ${selected.includes(u) ? COLOR.accent : COLOR.line}`,
            background: selected.includes(u) ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
          }}>{u}</button>
        ))}
      </div>
      <label style={labelStyle}>Aufteilung</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => setMode("even")} style={{ ...modeBtn, ...(mode === "even" ? { background: "#F3ECDD", borderColor: COLOR.accent } : {}) }}>Gleichmäßig</button>
        <button type="button" onClick={() => setMode("custom")} style={{ ...modeBtn, ...(mode === "custom" ? { background: "#F3ECDD", borderColor: COLOR.accent } : {}) }}>Individuell</button>
      </div>
      {mode === "even" ? (
        <>
          <label style={labelStyle}>Gesamtbetrag (€)</label>
          <input type="number" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </>
      ) : (
        <>
          {selected.length === 0 && <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginBottom: 10 }}>Wähle oben aus, wer beteiligt ist.</div>}
          {selected.map((u) => (
            <div key={u} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: COLOR.ink, flex: 1 }}>{u}</span>
              <input
                type="number" style={{ ...inputStyle, width: 100, marginBottom: 0 }}
                value={splits[u] || ""} onChange={(e) => setSplitAmount(u, e.target.value)} placeholder="0,00"
              />
              <span style={{ fontSize: 12.5, color: COLOR.inkSoft }}>€</span>
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginTop: 4, marginBottom: 12 }}>
            Gesamt: <strong style={{ color: COLOR.ink }}>{customTotal.toFixed(2)} €</strong>
          </div>
        </>
      )}
      <button disabled={!canSave} onClick={() => onSave({ desc: desc.trim(), amount, paidBy, people: selected, mode, splits, horseId, durationMonths })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: canSave ? 1 : 0.5 }}>
        Ausgabe speichern
      </button>
    </Modal>
  );
}

function NewStandingOrderModal({ people, defaultPayer, onClose, onSave }) {
  const [payer, setPayer] = useState(defaultPayer || people[0] || "");
  const [payee, setPayee] = useState(people.find((p) => p !== defaultPayer) || "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const canSave = payer && payee && payer !== payee && amount;
  return (
    <Modal title="Neuer Dauerauftrag" onClose={onClose}>
      <label style={labelStyle}>Von</label>
      <select style={inputStyle} value={payer} onChange={(e) => setPayer(e.target.value)}>
        {people.map((u) => <option key={u}>{u}</option>)}
      </select>
      <label style={labelStyle}>An</label>
      <select style={inputStyle} value={payee} onChange={(e) => setPayee(e.target.value)}>
        {people.map((u) => <option key={u}>{u}</option>)}
      </select>
      <label style={labelStyle}>Betrag monatlich (€)</label>
      <input type="number" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="z. B. 150" />
      <label style={labelStyle}>Notiz (optional)</label>
      <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. deckt Stallmiete + etwas Heu-Vorauszahlung" />
      <button
        disabled={!canSave}
        onClick={() => onSave({ payer, payee, amount, note })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: canSave ? 1 : 0.5 }}
      >Speichern</button>
    </Modal>
  );
}

function ExpenseCard({ ex, horses, user, isAdmin, onSetStatus, confirmDelete, onConfirmDelete, onCancelDelete, onDelete }) {
  return (
    <Card style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: COLOR.ink }}>{ex.description}</div>
          <div style={{ fontSize: 12, color: COLOR.inkSoft }}>
            bezahlt von {ex.paid_by} · {fmtDate(ex.date)}
            {ex.horse_id && ` · 🐴 ${horses.find((h) => h.id === ex.horse_id)?.name || ""}`}
            {ex.duration_months > 1 && ` · hält ${ex.duration_months} Mon.`}
          </div>
        </div>
        <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 16, color: COLOR.ink }}>{Number(ex.amount).toFixed(2)} €</div>
      </div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {(ex.expense_splits || []).map((s) => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: COLOR.ink }}>{s.user_name} · {Number(s.amount).toFixed(2)} €</span>
            {s.status === "erhalten" ? (
              <span style={{ background: COLOR.erledigtBg, color: COLOR.erledigt, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={11} />erhalten</span>
            ) : ex.paid_by === user ? (
              <button onClick={() => onSetStatus(s.id, "erhalten")} style={btnPrimary}>Als erhalten markieren</button>
            ) : s.status === "überwiesen" ? (
              s.user_name === user
                ? <span style={{ background: COLOR.uebernommenBg, color: COLOR.uebernommen, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>überwiesen</span>
                : <span style={{ background: COLOR.dringendBg, color: COLOR.dringend, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>offen</span>
            ) : (
              s.user_name === user ? <button onClick={() => onSetStatus(s.id, "überwiesen")} style={btnGhost}>Überwiesen</button>
                : <span style={{ background: COLOR.dringendBg, color: COLOR.dringend, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>offen</span>
            )}
          </div>
        ))}
      </div>
      {isAdmin && (
        confirmDelete ? (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={onDelete} style={{ ...btnPrimary, background: COLOR.dringend }}>Wirklich löschen</button>
            <button onClick={onCancelDelete} style={btnGhost}>Abbrechen</button>
          </div>
        ) : (
          <button onClick={onConfirmDelete} style={{ ...btnGhost, marginTop: 10, color: COLOR.dringend }}>Ausgabe löschen</button>
        )
      )}
    </Card>
  );
}

function NewRecurringExpenseModal({ people, horses, onClose, onSave }) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(people[0] || "");
  const [selected, setSelected] = useState(people);
  const [mode, setMode] = useState("even");
  const [splits, setSplits] = useState({});
  const [horseId, setHorseId] = useState("");
  const [splitByHorse, setSplitByHorse] = useState(false);
  const [horseSplits, setHorseSplits] = useState({});
  const toggle = (u) => setSelected((p) => (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]));
  const setSplitAmount = (u, val) => setSplits((s) => ({ ...s, [u]: val }));
  const setHorseSplitAmount = (hid, val) => setHorseSplits((s) => ({ ...s, [hid]: val }));
  const modeBtn = { flex: 1, padding: "8px 0", borderRadius: 9, border: `1px solid ${COLOR.line}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
  const customTotal = selected.reduce((a, u) => a + Number(splits[u] || 0), 0);
  const horseTotal = Object.values(horseSplits).reduce((a, b) => a + Number(b || 0), 0);

  const canSave = (desc.trim() && selected.length > 0 && paidBy) &&
    (splitByHorse ? horseTotal > 0 : (mode === "even" ? amount : customTotal > 0));

  return (
    <Modal title="Wiederkehrende Kosten" onClose={onClose}>
      <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginBottom: 12 }}>
        Wird automatisch einmal pro Monat als neue Ausgabe angelegt, bis du es pausierst oder löschst.
      </div>
      <label style={labelStyle}>Beschreibung</label>
      <input style={inputStyle} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="z. B. Stallmiete" />

      <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" checked={splitByHorse} onChange={(e) => setSplitByHorse(e.target.checked)} />
        Pro Pferd mit unterschiedlichen Beträgen aufteilen
      </label>

      {splitByHorse ? (
        <>
          <label style={labelStyle}>Betrag je Pferd</label>
          {horses.length === 0 && <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginBottom: 10 }}>Keine Pferde vorhanden.</div>}
          {horses.map((h) => (
            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: COLOR.ink, flex: 1 }}>🐴 {h.name}</span>
              <input
                type="number" style={{ ...inputStyle, width: 100, marginBottom: 0 }}
                value={horseSplits[h.id] || ""} onChange={(e) => setHorseSplitAmount(h.id, e.target.value)} placeholder="0,00"
              />
              <span style={{ fontSize: 12.5, color: COLOR.inkSoft }}>€</span>
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginTop: 4, marginBottom: 12 }}>
            Gesamt: <strong style={{ color: COLOR.ink }}>{horseTotal.toFixed(2)} €</strong> – es entsteht jeden Monat eine eigene Ausgabe pro Pferd.
          </div>
        </>
      ) : (
        <>
          <label style={labelStyle}>Kategorie</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            <button type="button" onClick={() => setHorseId("")} style={{
              padding: "6px 11px", borderRadius: 999, border: `1px solid ${horseId === "" ? COLOR.accent : COLOR.line}`,
              background: horseId === "" ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
            }}>Allgemeine Stallausgabe</button>
            {horses.map((h) => (
              <button key={h.id} type="button" onClick={() => setHorseId(h.id)} style={{
                padding: "6px 11px", borderRadius: 999, border: `1px solid ${horseId === h.id ? COLOR.accent : COLOR.line}`,
                background: horseId === h.id ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
              }}>🐴 {h.name}</button>
            ))}
          </div>
        </>
      )}

      <label style={labelStyle}>Bezahlt von</label>
      <select style={inputStyle} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
        {people.map((u) => <option key={u}>{u}</option>)}
      </select>
      <label style={labelStyle}>Aufteilen auf</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {people.map((u) => (
          <button key={u} type="button" onClick={() => toggle(u)} style={{
            padding: "6px 11px", borderRadius: 999, border: `1px solid ${selected.includes(u) ? COLOR.accent : COLOR.line}`,
            background: selected.includes(u) ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
          }}>{u}</button>
        ))}
      </div>
      <label style={labelStyle}>Personen-Aufteilung</label>
      {splitByHorse ? (
        <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginBottom: 12 }}>
          Bei Pro-Pferd-Aufteilung wird der jeweilige Pferde-Anteil gleichmäßig auf die ausgewählten Personen verteilt.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button type="button" onClick={() => setMode("even")} style={{ ...modeBtn, ...(mode === "even" ? { background: "#F3ECDD", borderColor: COLOR.accent } : {}) }}>Gleichmäßig</button>
            <button type="button" onClick={() => setMode("custom")} style={{ ...modeBtn, ...(mode === "custom" ? { background: "#F3ECDD", borderColor: COLOR.accent } : {}) }}>Individuell</button>
          </div>
          {mode === "even" ? (
            <>
              <label style={labelStyle}>Gesamtbetrag (€)</label>
              <input type="number" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </>
          ) : (
            <>
              {selected.length === 0 && <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginBottom: 10 }}>Wähle oben aus, wer beteiligt ist.</div>}
              {selected.map((u) => (
                <div key={u} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: COLOR.ink, flex: 1 }}>{u}</span>
                  <input
                    type="number" style={{ ...inputStyle, width: 100, marginBottom: 0 }}
                    value={splits[u] || ""} onChange={(e) => setSplitAmount(u, e.target.value)} placeholder="0,00"
                  />
                  <span style={{ fontSize: 12.5, color: COLOR.inkSoft }}>€</span>
                </div>
              ))}
              <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginTop: 4, marginBottom: 12 }}>
                Gesamt: <strong style={{ color: COLOR.ink }}>{customTotal.toFixed(2)} €</strong>
              </div>
            </>
          )}
        </>
      )}
      <button
        disabled={!canSave}
        onClick={() => onSave({ desc: desc.trim(), amount, paidBy, people: selected, mode, splits, horseId, splitByHorse, horseSplits })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: canSave ? 1 : 0.5 }}>
        Wiederkehrende Kosten speichern
      </button>
    </Modal>
  );
}
