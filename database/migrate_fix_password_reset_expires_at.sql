ALTER TABLE password_reset_codes
  MODIFY COLUMN expires_at TIMESTAMP NOT NULL;
