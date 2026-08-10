# Correctif reliquat budgets — 2026-08-10

Le moteur de projection calcule désormais le budget restant à lisser à partir de tous les mouvements du mois, y compris les mouvements déjà pointés qui sont déjà intégrés au solde actuel.

Il ajoute aussi les échéances récurrentes encore projetées afin d'éviter de les compter une seconde fois dans le reliquat lissé.

Conséquence attendue : si l'écran Budgets indique 686,38 € restant à débiter, Projection lisse 686,38 € et non le budget nominal complet de 1 190 €.
