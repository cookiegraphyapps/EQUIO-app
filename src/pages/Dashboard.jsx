import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, SectionTitle, Empty, Pill, COLOR, todayISO, addDays, daysUntil, nextDue, HEALTH_LABELS } from "../components/ui";

export default function Dashboard({ user }) {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [horses, setHorses] = useState([]);
  const [expenses, setExpenses] = useState([]);

  useEffect(() => {
    (async () => {
      const t = todayISO();
      const [tasksRes, eventsRes, horsesRes, expensesRes] = await Promise.all([
        supabase.from("tasks").select("*").lte("date", addDays(t, 1)).order("date"),
        supabase.from("events").select("*").eq("date", t),
        supabase.from("horses").select("*"),
        supabase.from("expenses").select("*, expense_splits(*)"),
      ]);
      setTasks(tasksRes.data ?? []);
      setEvents(eventsRes.data ?? []);
      setHorses(horsesRes.data ?? []);
      setExpenses(expensesRes.data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <Empty text="Lädt …" />;

  const t = todayISO();
  const myTasks = tasks.filter((x) => x.assigned_user === user && !x.done && x.date <= addDays(t, 1));
  const openTasks = tasks.filter((x) => x.date === t && !x.assigned_user && x.type !== "info");
  const todayEvents = [...events, ...tasks.filter((x) => x.type === "info" && x.date === t)].sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  const dueSoon = [];
  horses.forEach((h) => Object.entries(h.health || {}).forEach(([k, v]) => {
    if (!HEALTH_LABELS[k]) return;
    const due = nextDue(v);
    const d = daysUntil(due);
    if (d <= 14) dueSoon.push({ horse: h.name, label: HEALTH_LABELS[k].label, days: d });
  }));
  dueSoon.sort((a, b) => a.days - b.days);

  const myBalance = [];
  expenses.forEach((ex) => (ex.expense_splits || []).forEach((s) => {
    if (s.user_name === user && s.status !== "erhalten" && ex.paid_by !== user) myBalance.push({ to: ex.paid_by, amount: s.amount, status: s.status, desc: ex.description });
  }));

  return (
    <div>
      {openTasks.length > 0 && (
        <Card style={{ borderColor: COLOR.dringend, background: COLOR.dringendBg, marginTop: 14 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <AlertTriangle size={18} color={COLOR.dringend} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 700, color: COLOR.dringend, fontSize: 14 }}>Für heute noch offen</div>
              {openTasks.map((o) => <div key={o.id} style={{ fontSize: 13, color: COLOR.ink, marginTop: 3 }}>{o.title}</div>)}
            </div>
          </div>
        </Card>
      )}

      <SectionTitle>📋 Meine Aufgaben</SectionTitle>
      {myTasks.length === 0 && <Empty text="Nichts Offenes für dich – schönen Tag!" />}
      {myTasks.map((x) => (
        <Card key={x.id} style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, color: COLOR.ink, fontWeight: 600 }}>{x.title}</span>
          <Pill bg={COLOR.uebernommenBg} fg={COLOR.uebernommen}>übernommen</Pill>
        </Card>
      ))}

      <SectionTitle>📅 Heute im Stall</SectionTitle>
      {todayEvents.length === 0 && <Empty text="Keine Termine heute." />}
      {todayEvents.map((e) => (
        <Card key={e.id} style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, color: COLOR.ink }}>{e.title}</span>
          <Pill bg={COLOR.gemeinsamBg} fg={COLOR.gemeinsam}>{e.time}</Pill>
        </Card>
      ))}

      <SectionTitle>❤️ Gesundheit</SectionTitle>
      {dueSoon.length === 0 && <Empty text="Aktuell nichts Anstehendes." />}
      {dueSoon.slice(0, 4).map((d, i) => (
        <Card key={i} style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, color: COLOR.ink }}>{d.horse} · {d.label}</span>
          <Pill bg={d.days < 0 ? COLOR.dringendBg : d.days <= 5 ? COLOR.uebernommenBg : COLOR.erledigtBg} fg={d.days < 0 ? COLOR.dringend : d.days <= 5 ? COLOR.uebernommen : COLOR.erledigt}>
            {d.days < 0 ? "überfällig" : d.days === 0 ? "heute" : `in ${d.days} Tg.`}
          </Pill>
        </Card>
      ))}

      <SectionTitle>💰 Finanzen</SectionTitle>
      {myBalance.length === 0 && <Empty text="Aktuell nichts offen." />}
      {myBalance.map((b, i) => (
        <Card key={i} style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, color: COLOR.ink }}>{b.desc}: du → {b.to}</span>
          <Pill bg={b.status === "offen" ? COLOR.dringendBg : COLOR.uebernommenBg} fg={b.status === "offen" ? COLOR.dringend : COLOR.uebernommen}>
            {Number(b.amount).toFixed(2)} € · {b.status}
          </Pill>
        </Card>
      ))}
    </div>
  );
}
