# VSMI

Application de gestion commerciale pour photographe de mariage.

## Inclus dans ce démarrage
- Navigation VSMI avec le logo fourni
- Pages Aujourd'hui, Prospects, Clients, Agenda, Comptabilité et Paramètres
- Schéma PostgreSQL/Supabase initial
- Historique comptable à partir de 2026 prévu par le modèle de paiements
- Projection d'encaissements sur 24 mois prévue

## Lancement
```bash
npm install
cp .env.example .env.local
npm run dev
```

## Supabase
Créer un projet Supabase indépendant, puis exécuter `supabase/schema.sql` dans l'éditeur SQL.

## Étape suivante
Brancher Supabase, créer les formulaires Prospects/Clients/Prestations/Paiements et l'import CSV de l'historique 2026.
