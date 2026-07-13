INSERT INTO app_settings (key, value_json) VALUES
    ('login_methods', '{"azure_enabled": false, "azure_tenant_id": "", "azure_client_id": ""}')
ON CONFLICT (key) DO NOTHING;
