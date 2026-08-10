# Optimisation performances + responsive iPhone — 2026-08-10

## Périmètre
Optimisations techniques uniquement. Aucun calcul financier, seuil, budget, règle d'épargne, mouvement ou donnée métier n'est modifié.

## Performances
- Suppression du double calcul de projection 60 mois à l'ouverture de la vue **Projection** : le serveur ne reconstruit plus une projection qui est immédiatement reconstruite côté client pour les simulations interactives.
- Suppression du calcul 60 mois inutile dans **Paramètres**.
- Conservation du calcul serveur complet pour **En cours**, **Analyse** et **Budgets Épargne**, qui utilisent effectivement ses résultats.
- Indexation interne du moteur de projection : mouvements budgétaires par mois/catégorie, échéances projetées, CA photo mensuel, états URSSAF, propositions en attente, opérations par compte et opérations mensuelles par compte. Les règles et l'ordre des opérations restent identiques ; seuls les rescans répétés des mêmes tableaux sont supprimés.

## Responsive iPhone
- Graphique **En cours > Soldes par compte** réellement ajusté à la largeur du téléphone : suppression de la largeur minimale de 680 px, modal en panneau bas sur mobile, hauteur bornée et défilement vertical du contenu.
- Zone graphique réduite de façon proportionnelle avec graduations plus lisibles et résumé ouverture/clôture adapté à l'écran étroit.
- Valeurs des cartes de comptes compactées sur petit écran pour éviter les débordements.
- Lignes de mouvements **En cours** et **Projection** empilées sur iPhone afin que libellés, métadonnées, montant et boutons restent accessibles.
- Protection globale contre les débordements WebKit des champs date/mois/heure et des éléments `details`/`summary`.
