# Budget Épargne + Analyse — 2026-08-10

## Règle de mobilisation

Pour chaque compte d'épargne, le plancher physique de 30 € reste toujours protégé.

1. **Épargne mobilisable** : part non affectée à une enveloppe, utilisée en premier.
2. **Libre** : enveloppes utilisables ensuite si l'épargne mobilisable est épuisée.
3. **Intouchable** : exclue de toute utilisation d'épargne automatique.

Le moteur conserve une seule fonction de plafond utilisable ; la hiérarchie est induite par la ventilation du solde. À mesure que le solde baisse, la part non affectée est consommée avant les enveloppes libres. Les enveloppes intouchables restent protégées.

## Simplification de l'interface

- Protection : uniquement `Libre` et `Intouchable`.
- Suppression de la case « Disponible pour utilisation d’épargne conseillée ».
- Suppression de la priorité manuelle.
- `allow_recovery` et `priority` restent dans la table uniquement pour compatibilité mais sont dérivés automatiquement.

Migration des anciennes protections :
- `preserve + allow_recovery=true` → `free` ;
- `preserve + allow_recovery=false` → `untouchable`.

Cette migration évite de rendre automatiquement mobilisable une enveloppe auparavant protégée.

## Analyse de l'épargne

Ajout en bas de la vue Analyse d'un bloc **Analyse de l'épargne · 5 ans** basé sur les 60 audits mensuels du même moteur que Projection.

Chaque année est un menu déroulant avec récapitulatif :
- solde théorique au début de la période annuelle ;
- épargne prévue ;
- épargne utilisée ;
- solde théorique de fin de période annuelle.

Chaque mois affiche :
- solde début de mois théorique ;
- épargne prévue (versements conseillés + autres entrées prévues vers l'épargne, hors réallocations entre comptes épargne) ;
- épargne utilisée (sorties vers la trésorerie ou dépenses depuis l'épargne, hors réallocations entre comptes épargne) ;
- solde fin de mois théorique.
