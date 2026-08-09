# Analyse PERSO — exclusions ponctuelles et détail mensuel

Périmètre limité à En cours et Analyse.

- Création d'un débit/crédit : case « Exclure de l'analyse ».
- Modification d'un mouvement En cours : même case, modifiable a posteriori.
- Nouvelle colonne `personal_movements.exclude_from_analysis` : utilisée uniquement par Analyse.
- Analyse : menu déroulant mois par mois avec dépenses prévues (budgets inclus via le moteur existant), crédits prévus, utilisation d'épargne, épargne prévue, solde projeté et % essentiel.
- Analyse : tableau des mouvements sans catégorie, affectation à une catégorie existante ou création d'une catégorie puis rattachement.
- Après rattachement, `revalidatePath('/perso')` recharge les données et recalcule automatiquement la page Analyse.
- Aucun changement du moteur Projection, budgets ou épargne.
