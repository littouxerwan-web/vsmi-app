# Correctif Projection — PHOTO, seuils et graphique lié

- Les paiements PHOTO déjà marqués reçus/cancelled côté PHOTO ne sont plus reprojetés comme crédits PERSO.
- Une recette mariage n'est projetée que si elle est encore attendue côté PHOTO et non déjà intégrée côté PERSO.
- La logique de seuil est générique pour chaque profil compte courant ↔ compte épargne configuré.
- Le surplus du courant est évalué avec la fenêtre prudente de 45 jours avant proposition de mise en épargne.
- Quand un compte courant est sélectionné dans Projection, la courbe de son compte épargne rattaché est affichée en pointillés violets.
- Aucun changement SQL requis.
