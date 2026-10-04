-- Add board_member to app_roles (was missing from initial seed)
INSERT INTO app_roles (id, display_name, description, is_system_role)
VALUES ('board_member', 'Board Member', 'Executive read-only access — board dashboard and financial reports', false)
ON CONFLICT (id) DO UPDATE
  SET display_name  = EXCLUDED.display_name,
      description   = EXCLUDED.description;
