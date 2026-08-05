-- Une opération cochée est réputée réalisée le jour du pointage,
-- même si sa date prévisionnelle est ultérieure.
update public.personal_movements
set completed_date = current_date
where status = 'completed'
  and completed_date > current_date;
