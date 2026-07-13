-- Add local_enabled default (true) to existing login_methods settings row
UPDATE app_settings
   SET value_json = value_json || '{"local_enabled": true}'::jsonb
 WHERE key = 'login_methods'
   AND NOT (value_json ? 'local_enabled');
