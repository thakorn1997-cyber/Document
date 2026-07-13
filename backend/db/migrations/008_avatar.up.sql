-- User avatar file name (stored in ./storage/avatars/)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path VARCHAR(500);
