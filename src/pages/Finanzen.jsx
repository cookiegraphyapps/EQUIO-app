import { useEffect, useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, SectionTitle, IconBtn, Modal, COLOR, fmtDate, todayISO, inputStyle, labelStyle, btnPrimary, btnGhost } from "../components/ui";

export default function Finanzen({ user }) {
  const [expenses, setExpenses] = useState([]);
  const [people, setPeople] = useState([]);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    const [expRes, profRes] = await Promise.all([
      supabase.from("expenses").select("*, expense_splits(*)").order("date", { ascending: false }),
      supabase.from("profiles").select("name"),
    ]);
    setExpenses(expRes.data ?? []);
    setPeople((profRes.data ?? []).map((p) => p.name));
  };
  useEffect(() => { load(); }, []);

  const setStatus = async (splitId, status) => {
    await supabase.from("expense_splits").update({ status }).eq("id", splitId);
    load();
  };

  const addExpense = async (data) => {
    const { data: exp, error } = await supabase.from("expenses").insert({
      description: data.desc, amount: +data.amount, date: todayISO(), paid_by: data.paidBy,
    }).select().single();
    if (error) return;
    const per = +(data.amount / data.people.length).toFixed(2);
    const rows = data.people.map((p) => ({ expense_id: exp.id, user_name: p, amount: per, status: p === data.paidBy ? "erhalten" : "offen" }));
    await supabase.from("expense_splits").insert(rows);
    setShowNew(false);
    load();
  };

  const totalOffen = expenses.reduce((s, ex) => s + (ex.expense_splits || []).filter((x) => x.status !== "erhalten" && x.user_name === user).reduce((a, b) => a + Number(b.amount), 0), 0);

  return (
    <div>
      <SectionTitle right={<IconBtn onClick={() => setShowNew(true)}><Plus size={15} /> Ausgabe</IconBtn>}>Finanzen</SectionTitle>
      <Card style={{ marginBottom: 14, background: COLOR.privatBg, border: "none" }}>
        <div style={{ fontSize: 12, color: COLOR.privat, fontWeight: 600 }}>Deine offenen Anteile</div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 700, color: COLOR.ink }}>{totalOffen.toFixed(2)} €</div>
      </Card>
      {expenses.map((ex) => (
        <Card key={ex.id} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: COLOR.ink }}>{ex.description}</div>
              <div style={{ fontSize: 12, color: COLOR.inkSoft }}>bezahlt von {ex.paid_by} · {fmtDate(ex.date)}</div>
            </div>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 16, color: COLOR.ink }}>{Number(ex.amount).toFixed(2)} €</div>
          </div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {(ex.expense_splits || []).map((s) => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: COLOR.ink }}>{s.user_name} · {Number(s.amount).toFixed(2)} €</span>
                {s.status === "erhalten" ? (
                  <span style={{ background: COLOR.erledigtBg, color: COLOR.erledigt, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={11} />erhalten</span>
                ) : s.status === "überwiesen" ? (
                  s.user_name === user ? <span style={{ background: COLOR.uebernommenBg, color: COLOR.uebernommen, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>überwiesen</span>
                    : ex.paid_by === user ? <button onClick={() => setStatus(s.id, "erhalten")} style={btnPrimary}>Zahlung erhalten</button>
                      : <span style={{ background: COLOR.uebernommenBg, color: COLOR.uebernommen, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>überwiesen</span>
                ) : (
                  s.user_name === user ? <button onClick={() => setStatus(s.id, "überwiesen")} style={btnGhost}>Überwiesen</button>
                    : <span style={{ background: COLOR.dringendBg, color: COLOR.dringend, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>offen</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
      {showNew && <NewExpenseModal people={people} onClose={() => setShowNew(false)} onSave={addExpense} />}
    </div>
  );
}

function NewExpenseModal({ people, onClose, onSave }) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(people[0] || "");
  const [selected, setSelected] = useState(people);
  const toggle = (u) => setSelected((p) => (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]));
  return (
    <Modal title="Neue Ausgabe" onClose={onClose}>
      <label style={labelStyle}>Beschreibung</label>
      <input style={inputStyle} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="z. B. Heu" />
      <label style={labelStyle}>Betrag (€)</label>
      <input type="number" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />
      <label style={labelStyle}>Bezahlt von</label>
      <select style={inputStyle} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
        {people.map((u) => <option key={u}>{u}</option>)}
      </select>
      <label style={labelStyle}>Aufteilen auf</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {people.map((u) => (
          <button key={u} type="button" onClick={() => toggle(u)} style={{
            padding: "6px 11px", borderRadius: 999, border: `1px solid ${selected.includes(u) ? COLOR.accent : COLOR.line}`,
            background: selected.includes(u) ? "#F3ECDD" : "#fff", fontSize: 12.5, cursor: "pointer", color: COLOR.ink,
          }}>{u}</button>
        ))}
      </div>
      <button disabled={!desc.trim() || !amount || selected.length === 0 || !paidBy} onClick={() => onSave({ desc: desc.trim(), amount, paidBy, people: selected })}
        style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: (!desc.trim() || !amount || selected.length === 0 || !paidBy) ? 0.5 : 1 }}>
        Ausgabe speichern
      </button>
    </Modal>
  );
}
