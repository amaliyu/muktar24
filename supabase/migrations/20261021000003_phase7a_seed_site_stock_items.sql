-- ALREADY APPLIED to the live DB by the planning chat on 2026-10-21, verified. Kept here as the tracked record. DO NOT RE-RUN.
-- After PR #122 (site + material deduction) went live. Opening balances 0 by MD decision.
insert into public.inventory_items (name, unit, current_stock, reorder_level, unit_cost, site_id, owner, material, date_added) values
 ('CEMENT - KADO (SEQUOIA)','bags',0,0,0,'00000000-0000-4000-8000-000000000002','apcl','cement',current_date),
 ('DUST - KADO (SEQUOIA)','kg',0,0,0,'00000000-0000-4000-8000-000000000002','apcl','dust',current_date),
 ('DIESEL - KADO (SEQUOIA)','litres',0,0,0,'00000000-0000-4000-8000-000000000002','apcl','diesel',current_date),
 ('CEMENT - LIFE CAMP (BILAAD-OWNED)','bags',0,0,0,'00000000-0000-4000-8000-000000000003','client','cement',current_date),
 ('DUST - LIFE CAMP (BILAAD-OWNED)','kg',0,0,0,'00000000-0000-4000-8000-000000000003','client','dust',current_date),
 ('DIESEL - LIFE CAMP (BILAAD-OWNED)','litres',0,0,0,'00000000-0000-4000-8000-000000000003','client','diesel',current_date);
