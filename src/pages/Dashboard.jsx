import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Trash2, Camera } from "lucide-react";
import { supabase, uploadPhoto } from "../supabaseClient";
import { Card, SectionTitle, Empty, Pill, COLOR, todayISO, addDays, fmtDate, daysUntil, nextDue, dateToISO, HEALTH_LABELS, inputStyle, btnPrimary } from "../components/ui";

function relativeDay(timestamp) {
  const diff = daysUntil(dateToISO(new Date(timestamp))) * -1; // Tage in der Vergangenheit, positiv
  if (diff <= 0) return "heute";
  if (diff === 1) return "gestern";
  return `vor ${diff} Tagen`;
}

// Extrahiert den Storage-Pfad aus einer öffentlichen Supabase-URL, um die Datei gezielt löschen zu können.
function storagePathFromUrl(url) {
  const marker = "/horse-photos/";
  const i = url.indexOf(marker);
  return i >= 0 ? url.slice(i + marker.length) : null;
}

export default function Dashboard({ user }) {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [horses, setHorses] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [news, setNews] = useState([]);
  const [newsText, setNewsText] = useState("");
  const [newsPhotoFile, setNewsPhotoFile] = useState(null);
  const [newsPhotoPreview, setNewsPhotoPreview] = useState(null);
  const [postingNews, setPostingNews] = useState(false);
  const newsPhotoInput = useRef(null);

  const loadNews = async () => {
    const cutoff = new Date(Date.now() - 5 * 86400000).toISOString();
    // Abgelaufene Neuigkeiten (inkl. Foto) endgültig aus Datenbank & Speicher entfernen,
    // damit sich über die Zeit keine Altdaten ansammeln.
    const { data: expired } = await supabase.from("news").select("id, photo_url").lt("created_at", cutoff);
    if (expired && expired.length > 0) {
      const paths = expired.map((n) => n.photo_url && storagePathFromUrl(n.photo_url)).filter(Boolean);
      if (paths.length > 0) await supabase.storage.from("horse-photos").remove(paths);
      await supabase.from("news").delete().lt("created_at", cutoff);
    }
    const { data } = await supabase.from("news").select("*").order("created_at", { ascending: false });
    setNews(data ?? []);
  };

  const onNewsPhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewsPhotoFile(file);
    setNewsPhotoPreview(URL.createObjectURL(file));
  };

  const postNews = async () => {
    const text = newsText.trim();
    if (!text) return;
    setPostingNews(true);
    let photoUrl = null;
    if (newsPhotoFile) photoUrl = await uploadPhoto(newsPhotoFile, "news");
    await supabase.from("news").insert({ user_name: user, text, photo_url: photoUrl });
    setNewsText("");
    setNewsPhotoFile(null);
    setNewsPhotoPreview(null);
    setPostingNews(false);
    loadNews();
  };

  const deleteNews = async (n) => {
    if (n.photo_url) {
      const path = storagePathFromUrl(n.photo_url);
      if (path) await supabase.storage.from("horse-photos").remove([path]);
    }
    await supabase.from("news").delete().eq("id", n.id);
    loadNews();
  };

  useEffect(() => {
    (async () => {
      const t = todayISO();
      const [tasksRes, eventsRes, horsesRes, expensesRes] = await Promise.all([
        supabase.from("tasks").select("*").lte("date", addDays(t, 7)).order("date"),
        supabase.from("events").select("*").eq("date", t),
        supabase.from("horses").select("*"),
        supabase.from("expenses").select("*, expense_splits(*)"),
      ]);
      const existingTasks = tasksRes.data ?? [];
      const horsesData = horsesRes.data ?? [];

      // 1 Woche vor Fälligkeit automatisch eine Aufgabe "Termin ausmachen" anlegen,
      // falls noch keine offene Aufgabe dafür existiert.
      const newReminders = [];
      horsesData.forEach((h) => {
        Object.entries(h.health || {}).forEach(([k, v]) => {
          if (!HEALTH_LABELS[k]) return;
          const due = nextDue(v);
          if (!due) return;
          const reminderDate = addDays(due, -7);
          if (t < reminderDate) return;
          const title = `${HEALTH_LABELS[k].label}-Termin ausmachen – ${h.name}`;
          const alreadyExists = existingTasks.some((task) => task.title === title && !task.done && (task.horse_ids || []).includes(h.id));
          if (!alreadyExists) {
            newReminders.push({
              title, description: `Fällig: ${fmtDate(due)}`, type: "uebernahme_erledigt",
              date: t, horse_ids: [h.id], assigned_users: [], done: false, recurring: false,
            });
          }
        });
      });
      if (newReminders.length > 0) {
        const { data: inserted } = await supabase.from("tasks").insert(newReminders).select();
        if (inserted) existingTasks.push(...inserted);
      }

      setTasks(existingTasks);
      setEvents(eventsRes.data ?? []);
      setHorses(horsesData);
      setExpenses(expensesRes.data ?? []);
      loadNews();
      setLoading(false);
    })();
  }, []);

  if (loading) return <Empty text="Lädt …" />;

  const t = todayISO();
  const myTasks = tasks.filter((x) => (x.assigned_users || []).includes(user) && !x.done && x.date <= addDays(t, 1));
  const openTasks = tasks.filter((x) => x.date === t && (x.assigned_users || []).length === 0 && x.type !== "info");
  const birthdaysToday = horses.filter((h) => h.born && h.born.slice(5, 10) === t.slice(5, 10)).map((h) => ({
    id: `bday-${h.id}`, title: `🎂 Geburtstag ${h.name}`, time: "",
  }));
  const todayEvents = [...events, ...tasks.filter((x) => x.type === "info" && x.date === t), ...birthdaysToday].sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  const next7 = tasks
    .filter((x) => x.type !== "info" && !x.done && (x.category || "allgemein") !== "taeglich")
    .filter((x) => x.date > t && x.date <= addDays(t, 7))
    .sort((a, b) => a.date.localeCompare(b.date));

  const dueSoon = [];
  horses.forEach((h) => Object.entries(h.health || {}).forEach(([k, v]) => {
    if (!HEALTH_LABELS[k]) return;
    const due = nextDue(v);
    if (!due) return;
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
      <SectionTitle>📢 Neuigkeiten</SectionTitle>
      <Card style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
            value={newsText}
            onChange={(e) => setNewsText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") postNews(); }}
            placeholder="Kurze Nachricht an alle …"
          />
          <button onClick={() => newsPhotoInput.current?.click()} type="button" style={{ background: "none", border: `1px solid ${COLOR.line}`, borderRadius: 9, padding: "0 12px", cursor: "pointer", color: COLOR.inkSoft }}>
            <Camera size={16} />
          </button>
          <input ref={newsPhotoInput} type="file" accept="image/*" style={{ display: "none" }} onChange={onNewsPhotoChange} />
          <button onClick={postNews} disabled={postingNews || !newsText.trim()} style={{ ...btnPrimary, opacity: newsText.trim() ? 1 : 0.5 }}>Posten</button>
        </div>
        {newsPhotoPreview && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <img src={newsPhotoPreview} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
            <button type="button" onClick={() => { setNewsPhotoFile(null); setNewsPhotoPreview(null); }} style={{ background: "none", border: "none", color: COLOR.inkSoft, cursor: "pointer", fontSize: 12.5 }}>Entfernen</button>
          </div>
        )}
      </Card>
      {news.length === 0 && <Empty text="Keine aktuellen Neuigkeiten." />}
      {news.map((n) => (
        <Card key={n.id} style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ display: "flex", gap: 10 }}>
            {n.photo_url && <img src={n.photo_url} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />}
            <div>
              <div style={{ fontSize: 14, color: COLOR.ink }}>{n.text}</div>
              <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginTop: 3 }}>{n.user_name} · {relativeDay(n.created_at)}</div>
            </div>
          </div>
          {n.user_name === user && (
            <button onClick={() => deleteNews(n)} style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: COLOR.inkSoft, flexShrink: 0 }}>
              <Trash2 size={14} />
            </button>
          )}
        </Card>
      ))}

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

      <SectionTitle>📆 Nächste 7 Tage</SectionTitle>
      {next7.length === 0 && <Empty text="Nichts Größeres in den nächsten 7 Tagen." />}
      {next7.map((x) => {
        const assignedUsers = x.assigned_users || [];
        const isOpen = assignedUsers.length === 0;
        return (
          <Card key={x.id} style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 14, color: COLOR.ink, fontWeight: 600 }}>{x.title}</div>
              <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginTop: 2 }}>{fmtDate(x.date)}</div>
            </div>
            {isOpen
              ? <Pill bg={COLOR.dringendBg} fg={COLOR.dringend}>offen</Pill>
              : <Pill bg={COLOR.uebernommenBg} fg={COLOR.uebernommen}>{assignedUsers.join(", ")}</Pill>}
          </Card>
        );
      })}

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
          {e.time && <Pill bg={COLOR.gemeinsamBg} fg={COLOR.gemeinsam}>{e.time}</Pill>}
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
