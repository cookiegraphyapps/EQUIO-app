-- ============================================================
-- EQUIO – Der Ponyplaner: Datenbank-Setup
-- Diesen kompletten Code in Supabase -> SQL Editor -> "New query"
-- einfügen und auf "Run" klicken.
-- ============================================================

-- Profile: verknüpft jeden Login mit einem Anzeigenamen
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);
alter table profiles add column if not exists is_admin boolean default false;
update profiles set is_admin = true
  where id = (select id from auth.users where email = 'corinna97willems@gmail.com');

-- Pferde (gemeinsam sichtbar)
create table if not exists horses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  breed text,
  born text,
  owner text,
  note text,
  health jsonb not null default '{}',
  created_at timestamptz default now()
);

-- Aufgaben (gemeinsam sichtbar)
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  type text not null default 'uebernahme', -- uebernahme | uebernahme_erledigt | info
  date date not null,
  date_end date,
  time text,
  horse_ids uuid[] default '{}',
  assigned_user text,
  done boolean default false,
  recurring boolean default false,
  created_at timestamptz default now()
);

-- Gemeinsame Termine
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  date_end date,
  time text,
  with_user text,
  created_at timestamptz default now()
);

-- Private Termine (nur für den jeweiligen Nutzer sichtbar)
create table if not exists personal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  date date not null,
  time text,
  created_at timestamptz default now()
);

-- Gemeinsame Ausgaben
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric not null,
  date date not null,
  paid_by text not null,
  note text,
  created_at timestamptz default now()
);

-- Aufteilung der Ausgaben pro Person
create table if not exists expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  user_name text not null,
  amount numeric not null,
  status text not null default 'offen' -- offen | überwiesen | erhalten
);

-- Trainingstagebuch (tatsächlich durchgeführtes Training, gemeinsame Historie des Pferdes)
create table if not exists trainings (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references horses(id) on delete cascade,
  user_name text not null,
  date date not null,
  art text not null,
  dauer_min integer,
  intensitaet text,
  notiz text,
  created_at timestamptz default now()
);

-- Trainingsplanung (privat, nur für die planende Person sichtbar)
create table if not exists training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  horse_id uuid not null references horses(id) on delete cascade,
  date date not null,
  plan text not null,
  created_at timestamptz default now()
);

-- Gesundheitsnotizen (freies Log, z.B. "steifes Becken", "Husten" – gemeinsame Historie)
create table if not exists health_notes (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references horses(id) on delete cascade,
  user_name text not null,
  date date not null,
  note text not null,
  created_at timestamptz default now()
);

-- Gewichtsverlauf (z.B. jährliches Wiegen)
create table if not exists weights (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references horses(id) on delete cascade,
  user_name text not null,
  date date not null,
  weight_kg numeric not null,
  note text,
  created_at timestamptz default now()
);

-- Neuigkeiten für alle auf der Startseite (bleiben 5 Tage sichtbar)
create table if not exists news (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  text text not null,
  photo_url text,
  created_at timestamptz default now()
);

-- Private Rechnungen pro Pferd (z.B. eigene Tierarzt-/Hufschmiedrechnung, nur für die eintragende Person sichtbar)
create table if not exists horse_expenses (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references horses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text not null,
  date date not null,
  description text not null,
  amount numeric not null,
  note text,
  photo_url text,
  created_at timestamptz default now()
);

-- Medikamente (mit Zeitraum, optional dauerhaft = kein date_to)
create table if not exists medications (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references horses(id) on delete cascade,
  user_name text not null,
  name text not null,
  dosage text,
  date_from date not null,
  date_to date,
  note text,
  created_at timestamptz default now()
);

-- Futterplan: ein gemeinsam bearbeitbares Textfeld pro Pferd
alter table horses add column if not exists feed_plan text;

-- Person bei gemeinsamen Terminen hinterlegen (falls Tabelle schon vorher existierte)
alter table events add column if not exists with_user text;

-- Zeitraum (von-bis) statt Einzeltag bei Aufgaben & Terminen (falls Tabellen schon vorher existierten)
alter table tasks add column if not exists date_end date;
alter table events add column if not exists date_end date;

-- Serien-Kennung für wiederkehrende Aufgaben (damit man die ganze Serie oder nur einen Termin bearbeiten kann)
alter table tasks add column if not exists series_id uuid;

-- Kategorie für Aufgaben (Allgemein / Täglich / Umzug Sommerstall / Umzug Winterstall / Urlaub)
alter table tasks add column if not exists category text default 'allgemein';

-- Verwaltbare Kategorien-Liste (über die App bearbeitbar, kein Code-Update mehr nötig)
create table if not exists task_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  created_at timestamptz default now()
);
insert into task_categories (key, label) values
  ('allgemein', 'Allgemein'),
  ('taeglich', 'Täglich'),
  ('umzug_sommer', 'Umzug Sommerstall'),
  ('umzug_winter', 'Umzug Winterstall'),
  ('urlaub', 'Urlaub')
on conflict (key) do nothing;

-- Anweideplan Frühjahr: frei einstellbare Stufen (Dauer pro Tag + wie viele Tage die Stufe gilt)
-- plus ein gemeinsamer Startzeitpunkt für alle Pferde.
create table if not exists turnout_plan_stages (
  id uuid primary key default gen_random_uuid(),
  order_index int not null,
  label text not null,
  days int not null default 7,
  created_at timestamptz default now()
);
insert into turnout_plan_stages (order_index, label, days)
select * from (values
  (1, '5 Minuten', 7), (2, '10 Minuten', 7), (3, '30 Minuten', 7), (4, '1 Stunde', 7),
  (5, '2 Stunden', 7), (6, '3 Stunden', 7), (7, '4 Stunden', 7), (8, '5 Stunden', 7),
  (9, '6 Stunden', 7), (10, '7 Stunden', 7), (11, '8 Stunden', 7), (12, 'Ganztägig', 365)
) as seed(order_index, label, days)
where not exists (select 1 from turnout_plan_stages);

create table if not exists turnout_plan_settings (
  id int primary key default 1,
  start_date date,
  constraint turnout_plan_settings_singleton check (id = 1)
);
insert into turnout_plan_settings (id, start_date) values (1, null) on conflict (id) do nothing;

-- Dienstleister (Tierärzte, Physio-/Osteopathen, …) – Kategorien frei erweiterbar wie bei Aufgaben.
create table if not exists service_provider_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  created_at timestamptz default now()
);
insert into service_provider_categories (key, label) values
  ('tierarzt', 'Tierarzt'),
  ('physio_osteo', 'Physio-/Osteopath:in'),
  ('hufbearbeitung', 'Hufbearbeitung')
on conflict (key) do nothing;

create table if not exists service_providers (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'tierarzt',
  name text not null,
  phone text,
  specialty text,
  notes text,
  created_at timestamptz default now()
);
-- Unique-Constraint nachrüsten, falls die Tabelle schon vorher (ohne diese Regel) angelegt wurde.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'service_providers_name_key') then
    alter table service_providers add constraint service_providers_name_key unique (name);
  end if;
end $$;

-- Startbestand: recherchierte Pferdetierärzte und Physio-/Osteopath:innen im Raum 66663 Merzig.
-- Bitte Angaben (v.a. Telefonnummern bei den Physio-/Osteopath:innen) noch einmal selbst prüfen/ergänzen.
insert into service_providers (category, name, phone, specialty, notes) values
  ('tierarzt', 'Mobile Tierarztpraxis Dr. B. Schubert', '06861 938966 (mobil 0171 7742651)', 'Ausschließlich Pferde', 'Zur Unk 19, Rehlingen-Siersburg (Ortsteil Fremersdorf), ca. 10–15 km von Merzig'),
  ('tierarzt', 'Pferdeklinik Altforweiler (Dr. Andreas Rupp)', '06836 919080', 'Pferdeklinik, 24h-Notruf', 'Raiffeisenstr. 100, Überherrn – inzwischen fusioniert zu "Pferdeklinik SaarLorLux", Kontaktdaten unverändert'),
  ('tierarzt', 'Tierärztin Groß – Pferdefahrpraxis', '06831 42778', 'Pferde, Fahrpraxis', 'Saarlouis'),
  ('tierarzt', 'Tierärzte Drs. Besse', '06881 2178', 'Kleintier- und Pferdefahrpraxis', 'Lebach'),
  ('tierarzt', 'Pferdepraxis Dr. Nina Medina', '0176 55320739', 'Pferdezahnheilkunde, Fahrpraxis', 'Wahlener Str. 78, 66679 Losheim'),
  ('tierarzt', 'Tierarztpraxis Jürgen Pietsch', '06835 68967', 'Groß- und Kleintiere, auch Pferde', 'Am Marienberg 1, 66780 Rehlingen-Siersburg'),
  ('physio_osteo', 'Sabine Seiffarth – Pferdeosteopathie', null, 'Osteopathie', 'Mobil, fährt u.a. Merzig, Saarlouis, Saarbrücken, Neunkirchen, St. Wendel an – Kontakt über Website, Telefonnummer noch ergänzen'),
  ('physio_osteo', 'Zoé Heblich – Pferdephysiotherapie & -osteopathie', null, 'Physiotherapie, Osteopathie', 'Mobil im Saarland – Telefonnummer noch ergänzen'),
  ('physio_osteo', 'Manfred Klein – Pferdeosteopathie Saarland', null, 'Osteopathie', 'Raum Trier/Saarland – Telefonnummer noch ergänzen'),
  ('physio_osteo', 'Annika Schmidt – Pferdephysiotherapie', null, 'Physiotherapie, Osteopathie', 'Mobil im Saarland – Telefonnummer noch ergänzen'),
  ('hufbearbeitung', 'Tanja Selzer', '0160 5035615', 'Barhufbearbeitung', 'Perler Straße 21, 66663 Merzig · info@hufbearbeitung-selzer.de')
on conflict (name) do nothing;

-- Bewertung/Einschätzung ist öffentlich sichtbar (wichtig im Notfall!), aber jede:r bearbeitet nur die eigene.
create table if not exists service_provider_reviews (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references service_providers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text not null,
  rating int,
  verdict text not null default 'ja', -- ja | notfall | nein
  comment text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (provider_id, user_id)
);

-- Mehrere Personen pro Aufgabe zuweisen können (manche Aufgaben schafft man nicht allein)
alter table tasks add column if not exists assigned_users text[] default '{}';
update tasks set assigned_users = array[assigned_user]
  where assigned_user is not null and (assigned_users is null or assigned_users = '{}');

-- Ausgabe einem Pferd zuordnen (statt nur allgemeine Stallausgabe)
alter table expenses add column if not exists horse_id uuid references horses(id);

-- Fotos: Profilbild pro Pferd + Foto bei Gesundheitsnotiz
alter table horses add column if not exists photo_url text;
alter table health_notes add column if not exists photo_url text;
alter table news add column if not exists photo_url text;

-- Fotogalerie pro Pferd
create table if not exists horse_photos (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references horses(id) on delete cascade,
  url text not null,
  caption text,
  user_name text,
  created_at timestamptz default now()
);
alter table horse_photos enable row level security;
drop policy if exists "horse_photos_all" on horse_photos;
create policy "horse_photos_all" on horse_photos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Storage-Bucket für Fotos (öffentlich lesbar, nur angemeldete Nutzer:innen dürfen hochladen/löschen)
insert into storage.buckets (id, name, public) values ('horse-photos', 'horse-photos', true) on conflict (id) do nothing;
-- Hinweis: RLS ist bei storage.objects in Supabase bereits standardmäßig aktiv,
-- ein eigenes "enable row level security" ist hier nicht erlaubt (Fehler 42501) und nicht nötig.
drop policy if exists "horse_photos_storage_read" on storage.objects;
drop policy if exists "horse_photos_storage_insert" on storage.objects;
drop policy if exists "horse_photos_storage_delete" on storage.objects;
create policy "horse_photos_storage_read" on storage.objects for select using (bucket_id = 'horse-photos');
create policy "horse_photos_storage_insert" on storage.objects for insert with check (bucket_id = 'horse-photos' and auth.role() = 'authenticated');
create policy "horse_photos_storage_delete" on storage.objects for delete using (bucket_id = 'horse-photos' and auth.role() = 'authenticated');

-- ============================================================
-- Row Level Security aktivieren
-- ============================================================
alter table profiles enable row level security;
alter table horses enable row level security;
alter table tasks enable row level security;
alter table events enable row level security;
alter table personal_events enable row level security;
alter table expenses enable row level security;
alter table expense_splits enable row level security;
alter table trainings enable row level security;
alter table training_plans enable row level security;
alter table health_notes enable row level security;
alter table medications enable row level security;
alter table weights enable row level security;
alter table news enable row level security;
alter table horse_expenses enable row level security;
alter table task_categories enable row level security;
alter table turnout_plan_stages enable row level security;
alter table turnout_plan_settings enable row level security;
alter table service_provider_categories enable row level security;
alter table service_providers enable row level security;
alter table service_provider_reviews enable row level security;

-- Profile: jede:r sieht alle Namen (für Zuordnung), bearbeitet nur sich selbst.
-- Entfernen (löschen) eines Profils nur durch Admin.
drop policy if exists "profiles_select_all" on profiles;
drop policy if exists "profiles_insert_own" on profiles;
drop policy if exists "profiles_update_own" on profiles;
drop policy if exists "profiles_delete_admin" on profiles;
create policy "profiles_select_all" on profiles for select using (auth.role() = 'authenticated');
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
create policy "profiles_delete_admin" on profiles for delete
  using (exists (select 1 from profiles p2 where p2.id = auth.uid() and p2.is_admin = true));

-- Gemeinsame Tabellen: alle angemeldeten Nutzer:innen dürfen lesen & schreiben
drop policy if exists "horses_all" on horses;
drop policy if exists "tasks_all" on tasks;
drop policy if exists "events_all" on events;
drop policy if exists "expenses_all" on expenses;
drop policy if exists "expense_splits_all" on expense_splits;
drop policy if exists "trainings_all" on trainings;
drop policy if exists "health_notes_all" on health_notes;
drop policy if exists "medications_all" on medications;
drop policy if exists "weights_all" on weights;
drop policy if exists "news_all" on news;
drop policy if exists "task_categories_all" on task_categories;
create policy "tasks_all" on tasks for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "events_all" on events for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "expense_splits_all" on expense_splits for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "trainings_all" on trainings for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "health_notes_all" on health_notes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "medications_all" on medications for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "weights_all" on weights for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "news_all" on news for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Pferde: alle dürfen lesen/anlegen/bearbeiten, aber nur Admin darf löschen
drop policy if exists "horses_select" on horses;
drop policy if exists "horses_insert" on horses;
drop policy if exists "horses_update" on horses;
drop policy if exists "horses_delete_admin" on horses;
create policy "horses_select" on horses for select using (auth.role() = 'authenticated');
create policy "horses_insert" on horses for insert with check (auth.role() = 'authenticated');
create policy "horses_update" on horses for update using (auth.role() = 'authenticated');
create policy "horses_delete_admin" on horses for delete
  using (exists (select 1 from profiles p2 where p2.id = auth.uid() and p2.is_admin = true));

-- Ausgaben: alle dürfen lesen/anlegen/bearbeiten, aber nur Admin darf löschen
drop policy if exists "expenses_select" on expenses;
drop policy if exists "expenses_insert" on expenses;
drop policy if exists "expenses_update" on expenses;
drop policy if exists "expenses_delete_admin" on expenses;
create policy "expenses_select" on expenses for select using (auth.role() = 'authenticated');
create policy "expenses_insert" on expenses for insert with check (auth.role() = 'authenticated');
create policy "expenses_update" on expenses for update using (auth.role() = 'authenticated');
create policy "expenses_delete_admin" on expenses for delete
  using (exists (select 1 from profiles p2 where p2.id = auth.uid() and p2.is_admin = true));

-- Kategorien: alle dürfen lesen, aber nur Admin darf anlegen/löschen (Verwalten-Menü)
drop policy if exists "task_categories_select" on task_categories;
drop policy if exists "task_categories_insert_admin" on task_categories;
drop policy if exists "task_categories_delete_admin" on task_categories;
create policy "task_categories_select" on task_categories for select using (auth.role() = 'authenticated');
create policy "task_categories_insert_admin" on task_categories for insert
  with check (exists (select 1 from profiles p2 where p2.id = auth.uid() and p2.is_admin = true));
create policy "task_categories_delete_admin" on task_categories for delete
  using (exists (select 1 from profiles p2 where p2.id = auth.uid() and p2.is_admin = true));

-- Anweideplan: alle dürfen lesen, nur Admin darf Stufen/Start bearbeiten
drop policy if exists "turnout_plan_stages_select" on turnout_plan_stages;
drop policy if exists "turnout_plan_stages_insert_admin" on turnout_plan_stages;
drop policy if exists "turnout_plan_stages_update_admin" on turnout_plan_stages;
drop policy if exists "turnout_plan_stages_delete_admin" on turnout_plan_stages;
drop policy if exists "turnout_plan_settings_select" on turnout_plan_settings;
drop policy if exists "turnout_plan_settings_update_admin" on turnout_plan_settings;
create policy "turnout_plan_stages_select" on turnout_plan_stages for select using (auth.role() = 'authenticated');
create policy "turnout_plan_stages_insert_admin" on turnout_plan_stages for insert
  with check (exists (select 1 from profiles p2 where p2.id = auth.uid() and p2.is_admin = true));
create policy "turnout_plan_stages_update_admin" on turnout_plan_stages for update
  using (exists (select 1 from profiles p2 where p2.id = auth.uid() and p2.is_admin = true));
create policy "turnout_plan_stages_delete_admin" on turnout_plan_stages for delete
  using (exists (select 1 from profiles p2 where p2.id = auth.uid() and p2.is_admin = true));
create policy "turnout_plan_settings_select" on turnout_plan_settings for select using (auth.role() = 'authenticated');
create policy "turnout_plan_settings_update_admin" on turnout_plan_settings for update
  using (exists (select 1 from profiles p2 where p2.id = auth.uid() and p2.is_admin = true));

-- Dienstleister-Kategorien: alle lesen, nur Admin verwaltet (wie bei Aufgaben-Kategorien)
drop policy if exists "service_provider_categories_select" on service_provider_categories;
drop policy if exists "service_provider_categories_insert_admin" on service_provider_categories;
drop policy if exists "service_provider_categories_delete_admin" on service_provider_categories;
create policy "service_provider_categories_select" on service_provider_categories for select using (auth.role() = 'authenticated');
create policy "service_provider_categories_insert_admin" on service_provider_categories for insert
  with check (exists (select 1 from profiles p2 where p2.id = auth.uid() and p2.is_admin = true));
create policy "service_provider_categories_delete_admin" on service_provider_categories for delete
  using (exists (select 1 from profiles p2 where p2.id = auth.uid() and p2.is_admin = true));

-- Dienstleister-Einträge: alle lesen/anlegen/bearbeiten, nur Admin löscht (wie bei Pferden)
drop policy if exists "service_providers_select" on service_providers;
drop policy if exists "service_providers_insert" on service_providers;
drop policy if exists "service_providers_update" on service_providers;
drop policy if exists "service_providers_delete_admin" on service_providers;
create policy "service_providers_select" on service_providers for select using (auth.role() = 'authenticated');
create policy "service_providers_insert" on service_providers for insert with check (auth.role() = 'authenticated');
create policy "service_providers_update" on service_providers for update using (auth.role() = 'authenticated');
create policy "service_providers_delete_admin" on service_providers for delete
  using (exists (select 1 from profiles p2 where p2.id = auth.uid() and p2.is_admin = true));

-- Bewertungen: für alle öffentlich lesbar, aber jede:r bearbeitet nur die eigene Einschätzung
drop policy if exists "service_provider_reviews_select" on service_provider_reviews;
drop policy if exists "service_provider_reviews_own" on service_provider_reviews;
create policy "service_provider_reviews_select" on service_provider_reviews for select using (auth.role() = 'authenticated');
create policy "service_provider_reviews_own" on service_provider_reviews for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private Termine, Trainingsplanung & Rechnungen: nur der/die Ersteller:in sieht & bearbeitet eigene Einträge
drop policy if exists "personal_events_own" on personal_events;
drop policy if exists "training_plans_own" on training_plans;
drop policy if exists "horse_expenses_own" on horse_expenses;
create policy "personal_events_own" on personal_events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "training_plans_own" on training_plans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "horse_expenses_own" on horse_expenses for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Packlisten: Vorlagen (Vorschläge je Anlass) + tatsächliche Listen + Punkte.
-- Von allen bearbeitbar (kein Admin-Schutz), da gemeinsam gepflegt werden soll.
create table if not exists packing_templates (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  item_text text not null,
  scope text not null default 'shared', -- shared | per_horse
  order_index int not null default 0,
  created_at timestamptz default now(),
  unique (category, item_text)
);
insert into packing_templates (category, item_text, scope, order_index) values
  ('umzug', 'Zaunmaterial', 'shared', 1),
  ('umzug', 'Wassereimer', 'shared', 2),
  ('umzug', 'Schubkarre/Mistgabel', 'shared', 3),
  ('umzug', 'Halfter + Strick', 'per_horse', 4),
  ('umzug', 'Futter', 'per_horse', 5),
  ('umzug', 'Medikamente', 'per_horse', 6),
  ('umzug', 'Pferdepass', 'per_horse', 7),
  ('wanderritt_1tag', 'Erste-Hilfe-Set Pferd', 'shared', 1),
  ('wanderritt_1tag', 'Hufkratzer', 'shared', 2),
  ('wanderritt_1tag', 'Sattel + Zubehör', 'per_horse', 3),
  ('wanderritt_1tag', 'Wasser/Eimer für Pferd', 'per_horse', 4),
  ('wanderritt_1tag', 'Pferdepass', 'per_horse', 5),
  ('wanderritt_mehrtaegig', 'Erste-Hilfe-Set Pferd', 'shared', 1),
  ('wanderritt_mehrtaegig', 'Zelt/Unterkunft-Material', 'shared', 2),
  ('wanderritt_mehrtaegig', 'Sattel + Zubehör', 'per_horse', 3),
  ('wanderritt_mehrtaegig', 'Futter für alle Tage', 'per_horse', 4),
  ('wanderritt_mehrtaegig', 'Decke/Übernachtungsausrüstung', 'per_horse', 5),
  ('wanderritt_mehrtaegig', 'Hufschutz/Ersatzbeschlag', 'per_horse', 6),
  ('wanderritt_mehrtaegig', 'Pferdepass + Impfnachweis', 'per_horse', 7),
  ('urlaub_mit_pferd', 'Pflegeausrüstung', 'shared', 1),
  ('urlaub_mit_pferd', 'Futter für den Zeitraum', 'per_horse', 2),
  ('urlaub_mit_pferd', 'Medikamente', 'per_horse', 3),
  ('urlaub_mit_pferd', 'Pferdepass + Impfnachweis', 'per_horse', 4)
on conflict (category, item_text) do nothing;

create table if not exists packing_lists (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  date date,
  horse_ids uuid[] default '{}',
  people text[] default '{}',
  status text not null default 'active', -- active | example
  created_at timestamptz default now()
);

create table if not exists packing_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references packing_lists(id) on delete cascade,
  text text not null,
  scope text not null default 'shared', -- shared | per_horse
  horse_id uuid references horses(id) on delete set null,
  done boolean default false,
  created_at timestamptz default now()
);

alter table packing_templates enable row level security;
alter table packing_lists enable row level security;
alter table packing_items enable row level security;
drop policy if exists "packing_templates_all" on packing_templates;
drop policy if exists "packing_lists_all" on packing_lists;
drop policy if exists "packing_items_all" on packing_items;
create policy "packing_templates_all" on packing_templates for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "packing_lists_all" on packing_lists for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "packing_items_all" on packing_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Eure echten Pferde (Gesundheitsdaten trägst du später direkt in der App ein)
insert into horses (name, breed, born, owner, note, health) values
  ('Goldi', null, null, null, null, '{}'),
  ('Nanni', null, null, null, null, '{}'),
  ('Karl', null, null, null, null, '{}')
on conflict do nothing;
