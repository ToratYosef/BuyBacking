create table if not exists firebase_docs (
  path text primary key,
  collection text not null,
  doc_id text not null,
  parent_path text,
  data jsonb not null,
  create_time timestamptz,
  update_time timestamptz,
  exported_at timestamptz not null default now()
);

create index if not exists idx_firebase_docs_collection on firebase_docs(collection);
create index if not exists idx_firebase_docs_parent_path on firebase_docs(parent_path);
create index if not exists idx_firebase_docs_data_gin on firebase_docs using gin (data);

create table if not exists firebase_auth_users (
  uid text primary key,
  email text,
  phone_number text,
  display_name text,
  disabled boolean,
  custom_claims jsonb,
  provider_data jsonb,
  user_metadata jsonb,
  exported_at timestamptz not null default now()
);

create index if not exists idx_firebase_auth_users_email on firebase_auth_users(email);
