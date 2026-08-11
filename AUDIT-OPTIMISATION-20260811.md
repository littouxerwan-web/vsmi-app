# VSMI — Passe optimisation / nettoyage — 11 août 2026

## Modifications appliquées

### 1. Allègement des icônes PWA
- `src/app/icon.png` : 1254×1254 → 512×512.
- `src/app/apple-icon.png` : 1254×1254 → 180×180.
- Poids cumulé : ~1,15 Mo → ~132 Ko, sans changement de visuel.

### 2. Calculs de soldes PERSO / Aujourd’hui
- Les mouvements terminés, encaissements photo et cotisations URSSAF sont désormais regroupés par compte une seule fois.
- Le CA photo mensuel est pré-calculé dans une `Map` au lieu de refiltrer toute la liste pour chaque calcul URSSAF.
- Les règles de calcul ne changent pas ; on retire des parcours répétés de tableaux lors du rendu serveur.

Fichiers :
- `src/app/(app)/perso/page.tsx`
- `src/app/(app)/aujourd-hui/page.tsx`

### 3. Code mort / artefacts supprimés de `src`
Ces fichiers ne sont référencés par aucun import ou route active :
- `src/lib/perso/projection-view.tsx`
- `src/components/AppShell.tsx`
- `src/components/perso/savings-analysis.tsx`
- `src/components/perso/category-budget-analysis.tsx`
- `src/app/globals 2.css`
- `src/app/globals 3.css`
- `src/app/agenda.textClipping`

Gain direct dans `src` : ~100 Ko de code/artefacts obsolètes, en plus des icônes.

### 4. Scripts projet
- Suppression du script `next lint`, obsolète avec Next.js 16.
- Ajout de `npm run typecheck` → `tsc --noEmit`.

### 5. Prévention des régressions de structure
`.gitignore` renforcé pour empêcher le retour de :
- `.backup-*`
- `src-backup-*`
- dossier `/components/` accidentel à la racine
- fichiers macOS `*.textClipping`
- export `.env.vercel.production`

## Audit de design

`src/app/globals.css` fait environ 59 Ko / 1265 lignes. Plusieurs générations successives de correctifs dark/light utilisent les mêmes sélecteurs et beaucoup de `!important`. C’est la principale source potentielle d’incohérences visuelles entre PERSO, COMMUN, MARIAGES et ENFANTS.

Je n’ai pas fusionné brutalement ces règles pendant cette passe : cela aurait un risque important de régression visuelle. La prochaine passe de design devrait transformer les règles dark/light en un seul bloc canonique basé sur des variables (`surface`, `card`, `control`, `text`, `muted`, `border`) puis supprimer les anciens overrides devenus redondants.

## Points de performance encore identifiés mais non modifiés

- `COMMUN` charge encore plusieurs tables avec `select("*")`. Le passage à des colonnes explicites réduirait le volume réseau, mais doit être fait avec un contrôle fonctionnel complet.
- Les pages PERSO et Aujourd’hui chargent une profondeur importante d’historique pour garantir les projections. Une optimisation supplémentaire nécessiterait une vue/RPC Supabase dédiée aux derniers soldes et aux plages utiles afin de ne pas modifier les règles financières.
- `projection-view.tsx` reste un gros composant client. Il peut être découpé en sous-composants, mais ce travail est plus structurel et mérite un test fonctionnel dédié.

## Contrôles recommandés après copie

```bash
rm -rf .next
npm run typecheck
npm run build
```

Vérifier ensuite les routes habituelles et tester rapidement : Aujourd’hui, PERSO En cours, Projection, Budgets Épargne, Analyse, COMMUN, MARIAGES et ENFANTS en dark + white mode.
