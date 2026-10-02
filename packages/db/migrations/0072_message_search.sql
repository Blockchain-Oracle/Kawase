-- Search across every conversation (A5): a message's searchable text is its words, the cards it showed (tool names)
-- and what those cards were asked (their string inputs, e.g. a recipient), kept as a generated column.
CREATE OR REPLACE FUNCTION kawase_message_text(parts jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT coalesce(string_agg(piece, ' '), '')
  FROM (
    SELECT CASE
      WHEN part->>'type' = 'text' THEN part->>'text'
      WHEN part->>'type' LIKE 'tool-%' THEN replace(substr(part->>'type', 6), '_', ' ') || coalesce(' ' || (
        SELECT string_agg(field.value, ' ')
        FROM jsonb_each_text(CASE WHEN jsonb_typeof(part->'input') = 'object' THEN part->'input' ELSE '{}'::jsonb END) AS field
      ), '')
    END AS piece
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(parts) = 'array' THEN parts ELSE '[]'::jsonb END) AS part
  ) AS pieces
  WHERE piece IS NOT NULL AND piece <> ''
$$;
--> statement-breakpoint
ALTER TABLE "thread_messages" ADD COLUMN "search_text" text GENERATED ALWAYS AS (kawase_message_text("parts")) STORED;
--> statement-breakpoint
CREATE INDEX "thread_messages_search_idx" ON "thread_messages" USING gin (to_tsvector('simple', "search_text"));
--> statement-breakpoint
CREATE INDEX "thread_messages_user_idx" ON "thread_messages" USING btree ("user_id", "created_at");
