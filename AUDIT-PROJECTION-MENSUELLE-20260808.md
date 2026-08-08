# Audit Projection mensuelle — 2026-08-08

## Règle d'architecture

- **En cours** reste journalier et affiche un seul mois à la fois.
- Le sélecteur En cours est limité au mois courant, M+1 et M+2.
- **Projection** consolide une seule valeur de fin de mois.
- Le calcul interne conserve les dates de chaque flux afin de ne rien perdre, mais le graphique et le sélecteur n'exposent que les fins de mois.
- La protection de trésorerie reste portée par le moteur d'épargne J-2 / grâce 5 jours. Projection n'ajoute plus un second filet quotidien concurrent.

## Flux intégrés à Projection

- mouvements ponctuels débit / crédit non cochés ;
- mouvements en retard non cochés, considérés dus aujourd'hui ;
- transferts internes matérialisés ;
- récurrences futures et récurrences en retard non cochées ;
- exclusions et overrides de récurrence ;
- crédits PHOTO attendus ;
- URSSAF calculé mensuellement ;
- budgets : reste à consommer en fin de mois, en tenant compte des débits **et crédits** rattachés ;
- mouvements ENFANTS synchronisés présents dans les mouvements personnels ;
- versements vers l'épargne et utilisations d'épargne issus du moteur d'épargne ;
- décisions d'épargne déjà acceptées via les mouvements matérialisés.

## Correction de période En cours

Une proposition d'utilisation/versement d'épargne datée du mois suivant ne modifie plus la carte « Après épargne » du mois courant. Seules les opérations d'épargne dont la date appartient au mois courant sont appliquées à cet indicateur.
