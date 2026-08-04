# Correctif utilisation d'épargne à la date du découvert

L'utilisation d'épargne proposée n'est plus positionnée systématiquement au 28.

Pour chaque mois projeté, VSMI recherche désormais la première date exacte à laquelle le compte courant devient négatif après application des mouvements prévus, récurrences, encaissements photo, URSSAF et budgets restants.

La proposition d'utilisation d'épargne est datée de ce jour et son crédit est intégré immédiatement dans la projection. Le versement vers l'épargne reste, lui, proposé au 28 du mois.

Aucune migration SQL n'est nécessaire.
