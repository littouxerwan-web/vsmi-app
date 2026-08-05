# Correctif du moteur de trésorerie

Ce correctif unifie le calcul des projections, de l'épargne proposée et de l'épargne à reprendre.

## Corrections appliquées

- La simulation du mois courant commence au solde réel du jour, et non au premier jour du mois.
- Les opérations pointées ne sont pas rejouées dans la projection, mais elles réduisent correctement le reliquat des budgets.
- Le point bas est calculé depuis la date de proposition jusqu'à la veille du prochain revenu principal.
- Une reprise d'épargne et un versement vers l'épargne ne peuvent plus être proposés simultanément pour le même cycle.
- Une proposition non acceptée ne modifie plus artificiellement les soldes projetés.
- Seuls les transferts déjà acceptés modifient les projections des comptes courant et épargne.
- Les budgets restent remis à zéro chaque mois et le reliquat du mois est déduit à la fin de ce mois.

## Formules

- Épargne proposée = max(0, point bas du cycle - seuil de sécurité)
- Épargne à reprendre = min(solde épargne, max(0, seuil de sécurité - point bas du cycle))
