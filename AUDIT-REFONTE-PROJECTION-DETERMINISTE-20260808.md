# Refonte Projection déterministe — 08/08/2026

## Cause racine trouvée

L'application importe `src/components/perso/projection-view.tsx` depuis la page PERSO.
Une précédente refonte avait été écrite dans `src/lib/perso/projection-view.tsx`, fichier qui n'était pas celui utilisé par l'interface.
Il existait donc deux implémentations concurrentes de Projection.

Cette version supprime ce doublon : le composant réellement importé utilise désormais `buildReliableProjection()`.

## Règles du moteur unique

1. Le point de départ de chaque compte est le solde courant déjà reconstruit côté serveur à partir du dernier snapshot et des mouvements réellement pointés après ce snapshot.
2. Un mouvement `completed` n'est jamais reprojeté.
3. Une occurrence récurrente déjà matérialisée dans `personal_movements` n'est jamais générée une seconde fois.
4. Une exclusion annule l'occurrence concernée ; un override ne modifie que le montant du mois concerné.
5. Les virements sont traités par paire et sont plafonnés lorsqu'ils sortent d'un compte d'épargne.
6. Un compte d'épargne ne peut jamais devenir négatif.
7. Les budgets ne projettent que le reliquat net du mois après débits ET crédits déjà rattachés au budget.
8. PHOTO et URSSAF sont chacun intégrés une seule fois selon leur état PERSO.
9. La protection d'un compte courant utilise le minimum intramensuel pour déterminer le besoin réel d'épargne et date l'opération J-2.
10. Une mise de côté vers l'épargne n'utilise plus tout l'excédent aveuglément : elle conserve ce qui est nécessaire pour les flux connus des 45 jours suivants.
11. Projection reste consolidée mois par mois sur 60 mois.

## Contrôle comptable visible

La page Projection contient désormais un bloc `Contrôle du calcul` pour le mois sélectionné.
Pour chaque compte il affiche :

- solde d'ouverture ;
- crédits ;
- débits ;
- part des débits correspondant aux budgets ;
- épargne utilisée ;
- épargne mise de côté ;
- solde de clôture.

Ce tableau sert à identifier immédiatement l'origine de tout montant anormal.

## Vérification technique effectuée

Les deux fichiers TypeScript/TSX modifiés passent la transpilation syntaxique TypeScript sans diagnostic.
Le build Next.js complet reste à exécuter sur le Mac de production, le ZIP ne contenant pas `node_modules`.
