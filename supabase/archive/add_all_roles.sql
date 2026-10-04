-- Add all company roles to app_roles
-- Schema: id (text PK), display_name, description, is_system_role

INSERT INTO app_roles (id, display_name, description, is_system_role)
VALUES
  ('bdm',                'Business Development Manager', 'Manages customer relationships, orders and delivery scheduling',       false),
  ('ico',                'Internal Control Officer',     'Reviews and approves schedules; read-only access to all modules',      false),
  ('store_officer',      'Store Officer',                'Manages inventory, batches, waybills and approved schedules',           false),
  ('logistics_manager',  'Logistics Manager',            'Manages deliveries, vehicles and waybills',                            false),
  ('marketer',           'Marketer',                     'Manages own customers and orders',                                     false),
  ('driver',             'Driver',                       'Views assigned waybills only',                                         false),
  ('hr_officer',         'HR Officer',                   'Manages staff, attendance and payroll',                                false),
  ('production_manager', 'Production Manager',           'Manages production log, inventory and batches',                        false)
ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description;
