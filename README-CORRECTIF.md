# Correctif Aujourd’hui — Après épargne

- Aligne le moteur du dashboard Aujourd’hui sur le même horizon de projection (60 mois) que la vue En cours.
- Le montant « Après épargne » reste issu de `audit.closing[accountId]` : aucun nouveau calcul financier n’est créé.
- Corrige les retours Supabase `null` sur les collections pour éviter les erreurs `.map`, `.filter` et `is not iterable` en dev.
- Aligne visuellement le libellé « Après épargne », le pictogramme et le montant, sans troncature.
- Aucun changement de base de données / Supabase.
