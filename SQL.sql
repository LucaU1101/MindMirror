-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.analysis (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entry_id uuid,
  meaning double precision,
  agency double precision,
  rationalism double precision,
  individualism double precision,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT analysis_pkey PRIMARY KEY (id),
  CONSTRAINT analysis_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id)
);
CREATE TABLE public.entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  content text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT entries_pkey PRIMARY KEY (id)
);