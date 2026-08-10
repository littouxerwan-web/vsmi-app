# Correctif épargne — 2026-08-10

- Analyse de l’épargne filtrée par le compte courant sélectionné : seuls les comptes d’épargne liés aux profils de ce compte sont agrégés, et les virements d’entrée/sortie sont rattachés au bon compte courant.
- Projection : ajout de l’épargne totale et de l’épargne mobilisable de premier rang dans les indicateurs et le graphique. Les enveloppes « Libre » restent utilisables ensuite par le moteur, mais ne sont pas confondues avec la réserve mobilisable affichée.
- Projection > Mouvements : les lignes quotidiennes synthétiques de lissage des budgets ne sont plus affichées dans le détail. Les budgets restent visibles dans les cartes dédiées et restent intégralement pris en compte dans les calculs.
- Vérification du bouton « Accepter » : acceptSavingsProposal valide le couple de comptes, crée un transfer_out sur le compte source et un transfer_in du même montant sur le compte destination avec le même transfer_group_id. Pour une date aujourd’hui ou passée, les deux mouvements sont completed et la page PERSO est revalidée ; pour une date future, ils restent planned et mettent à jour Projection sans fausser le solde actuel.
