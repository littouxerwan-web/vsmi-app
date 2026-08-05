# Correctif épargne démesurée et découvert projeté

Ce correctif sécurise le moteur sur trois points :

1. Un transfert d'épargne accepté déjà matérialisé dans `personal_movements` n'est plus appliqué une seconde fois dans la projection.
2. Une proposition d'épargne n'est générée que lorsque le cycle est réellement borné par un revenu principal actuel et le revenu principal suivant.
3. Le montant proposé est plafonné à la fois par la marge disponible à la date de proposition et par le point bas du cycle.

Formule appliquée :

`proposition = min(solde à la date de proposition - seuil, point bas du cycle - seuil)`

La proposition est nulle si le prochain revenu principal n'est pas identifié ou si une reprise d'épargne est nécessaire.
