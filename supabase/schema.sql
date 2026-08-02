create extension if not exists pgcrypto;

create table if not exists sources_prospects (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  actif boolean not null default true
);

create table if not exists statuts_prospects (
  id uuid primary key default gen_random_uuid(),
  ordre int not null,
  libelle text not null unique,
  actif boolean not null default true
);

create table if not exists prospects (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources_prospects(id),
  statut_id uuid references statuts_prospects(id),
  nom text not null,
  email text,
  telephone text,
  date_mariage_prevue date,
  lieu_mariage_prevu text,
  message_initial text,
  montant_estime numeric(12,2),
  prochaine_relance_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  prenom1 text,
  nom1 text,
  prenom2 text,
  nom2 text,
  email text,
  telephone text,
  adresse text,
  code_postal text,
  ville text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists types_prestations (
  id uuid primary key default gen_random_uuid(),
  libelle text not null unique,
  actif boolean not null default true
);

create table if not exists prestations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  type_id uuid references types_prestations(id),
  titre text not null,
  date_prestation date,
  lieu_prestation text,
  montant_total numeric(12,2) not null default 0,
  statut text not null default 'a_venir',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists devis (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references prospects(id) on delete cascade,
  prestation_id uuid references prestations(id) on delete set null,
  numero text,
  date_emission date,
  date_envoi date,
  montant_total numeric(12,2) not null default 0,
  statut text not null default 'brouillon',
  pdf_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists paiements (
  id uuid primary key default gen_random_uuid(),
  prestation_id uuid not null references prestations(id) on delete cascade,
  type_paiement text not null check (type_paiement in ('acompte','solde','complement')),
  montant numeric(12,2) not null,
  date_prevue date,
  date_encaissement date,
  moyen_paiement text,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists evenements (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references prospects(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  prestation_id uuid references prestations(id) on delete cascade,
  type_evenement text not null,
  titre text not null,
  debut_at timestamptz not null,
  fin_at timestamptz,
  lieu text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into sources_prospects (nom) values ('Mariages.net'),('Site internet'),('Instagram'),('Recommandation'),('Autre') on conflict do nothing;
insert into statuts_prospects (ordre,libelle) values (1,'Nouveau'),(2,'Contacté'),(3,'Rendez-vous prévu'),(4,'Devis envoyé'),(5,'En réflexion'),(6,'Accepté'),(7,'Refusé') on conflict do nothing;
insert into types_prestations (libelle) values ('Mariage'),('Shooting engagement'),('Shooting couple'),('Shooting famille'),('Autre') on conflict do nothing;
