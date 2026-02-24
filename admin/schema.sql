CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  migrated_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  migrated_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admins (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  migrated_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signed_up_emails (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  migrated_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS counters (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  migrated_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices_iphone_models (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  migrated_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices_samsung_models (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  migrated_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_status_idx
ON orders ((data->>'status'));

CREATE INDEX IF NOT EXISTS orders_email_idx
ON orders ((data->>'email'));

CREATE INDEX IF NOT EXISTS orders_price_idx
ON orders (((data->>'price')::numeric));

CREATE INDEX IF NOT EXISTS users_email_idx
ON users ((data->>'email'));

CREATE INDEX IF NOT EXISTS admins_email_idx
ON admins ((data->>'email'));

CREATE INDEX IF NOT EXISTS orders_created_at_idx
ON orders (((data->>'createdAt')::timestamptz));
