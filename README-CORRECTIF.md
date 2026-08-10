# Correctif boutons Mouvements — 2026-08-10

- « Ce mois-ci uniquement » respecte désormais `personal_recurrence_exclusions` dans En cours : l'échéance disparaît réellement après suppression et n'est plus reconstruite côté client.
- La suppression d'un virement interne supprime toujours les deux jambes du transfert, y compris depuis le menu détaillé.
- La modification d'un virement interne synchronise libellé, montant, date, catégorie et exclusion d'analyse sur les deux jambes sans changer le compte destinataire.
- Pointer/dépointer un virement reste groupé via `transfer_group_id`.
- Pointer une échéance récurrente conserve la création correcte d'une paire débit/crédit pour les virements récurrents.
- « Toute la série » conserve la page/vue active après l'action.
- Aucun changement de schéma Supabase.
