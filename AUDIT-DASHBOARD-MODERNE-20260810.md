# Dashboard Aujourd'hui — correctif visuel 2026-08-10

Modifications limitées au dashboard Aujourd'hui et au filtrage de navigation demandé.

- Suppression du libellé VSMI en haut de la page Aujourd'hui.
- Fond sombre et palette Noir / Or / Argent.
- Cartes compactes responsive : 2 colonnes iPhone, 3 tablette, 4+ desktop.
- Affichage par compte : Aujourd'hui, Fin de mois, Après épargne.
- Picto tirelire lorsqu'une utilisation d'épargne est proposée sur le compte.
- Clic sur une carte personnelle -> En cours avec filtre de compte.
- Clic sur COMMUN -> En cours COMMUN.
- Bouton + conservé pour créer rapidement un mouvement sur le bon compte.
- Mode Organiser conservé, avec déplacement gauche/droite.
- Choix de couleur Noir / Or / Argent par carte, mémorisé dans user_metadata.
- Barre de navigation mobile sombre uniquement sur Aujourd'hui.
- Aucun changement de schéma Supabase.
- Les valeurs personnelles Fin de mois / Après épargne sont issues du moteur buildReliableProjection sur le mois courant.
- Le filtre account de l'URL initialise le filtre du bloc Mouvements dans En cours.
