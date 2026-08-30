-- Expand first. Backfill and build indexes with the resume-search maintenance script
-- BEFORE deploying the queries that use these columns. No table rewrite here.
ALTER TABLE "resume_pool_item" ADD COLUMN "search_text" text;
ALTER TABLE "resume_pool_item" ADD COLUMN "search_cjk_bigrams" text[];
ALTER TABLE "studio_interview" ADD COLUMN "search_text" text;
ALTER TABLE "studio_interview" ADD COLUMN "search_cjk_bigrams" text[];

CREATE FUNCTION resume_search_text(
  candidate_name text, candidate_email text, candidate_phone text,
  resume_file_name text, target_role text, profile jsonb
) RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE
  -- Match JavaScript \s, independent of the database locale (including NBSP/fullwidth spaces).
  whitespace_pattern CONSTANT text := U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+';
  parts text[] := ARRAY[candidate_name, candidate_email, candidate_phone, resume_file_name, target_role];
  schools text[];
  companies text[];
  result text;
BEGIN
  SELECT array_agg(item->>'company') INTO companies
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(profile->'workExperiences') = 'array'
      THEN profile->'workExperiences' ELSE '[]'::jsonb END
  ) AS item
  WHERE jsonb_typeof(item->'company') = 'string';

  SELECT array_agg(item->>'school') INTO schools
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(profile->'educationExperiences') = 'array'
      THEN profile->'educationExperiences' ELSE '[]'::jsonb END
  ) AS item
  WHERE jsonb_typeof(item->'school') = 'string'
    AND btrim(regexp_replace((item->>'school') COLLATE "C", whitespace_pattern, ' ', 'g'))
      NOT IN ('', '未发现信息');

  -- Structured education takes precedence so stale legacy school names do not survive edits.
  IF coalesce(cardinality(schools), 0) = 0 THEN
    SELECT array_agg(item #>> '{}') INTO schools
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(profile->'schools') = 'array'
        THEN profile->'schools' ELSE '[]'::jsonb END
    ) AS item
    WHERE jsonb_typeof(item) = 'string';
  END IF;

  SELECT string_agg(value, E'\n' ORDER BY ordinal) INTO result
  FROM (
    SELECT btrim(regexp_replace(value COLLATE "C", whitespace_pattern, ' ', 'g')) AS value, ordinal
    FROM unnest(parts || coalesce(companies, '{}'::text[]) || coalesce(schools, '{}'::text[]))
      WITH ORDINALITY AS entries(value, ordinal)
  ) AS normalized
  WHERE value IS NOT NULL AND value NOT IN ('', '未发现信息');
  RETURN coalesce(result, '');
END;
$$;

CREATE FUNCTION resume_search_bigrams(value text)
RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT coalesce(array_agg(DISTINCT pair ORDER BY pair), '{}'::text[])
  FROM (
    SELECT substring(value FROM position FOR 2) AS pair
    FROM generate_series(1, char_length(value) - 1) AS position
  ) AS pairs
  -- Keep this common-Han range identical to the query builder.
  WHERE pair COLLATE "C" ~ '^[㐀-䶿一-鿿豈-﫿]{2}$';
$$;

CREATE FUNCTION sync_resume_search_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.search_text IS NOT NULL AND NEW.search_cjk_bigrams IS NOT NULL
      AND ROW(NEW.search_text, NEW.search_cjk_bigrams)
        IS NOT DISTINCT FROM ROW(OLD.search_text, OLD.search_cjk_bigrams)
      AND ROW(NEW.candidate_name, NEW.candidate_email, NEW.candidate_phone,
        NEW.resume_file_name, NEW.target_role, NEW.resume_profile)
      IS NOT DISTINCT FROM
      ROW(OLD.candidate_name, OLD.candidate_email, OLD.candidate_phone,
        OLD.resume_file_name, OLD.target_role, OLD.resume_profile)
    THEN
      RETURN NEW;
    END IF;
  END IF;
  NEW.search_text := resume_search_text(
    NEW.candidate_name, NEW.candidate_email, NEW.candidate_phone,
    NEW.resume_file_name, NEW.target_role, NEW.resume_profile
  );
  NEW.search_cjk_bigrams := resume_search_bigrams(NEW.search_text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER resume_pool_item_sync_search
BEFORE INSERT OR UPDATE OF candidate_name, candidate_email, candidate_phone,
  resume_file_name, target_role, resume_profile, search_text, search_cjk_bigrams
ON resume_pool_item FOR EACH ROW EXECUTE FUNCTION sync_resume_search_fields();

CREATE TRIGGER studio_interview_sync_search
BEFORE INSERT OR UPDATE OF candidate_name, candidate_email, candidate_phone,
  resume_file_name, target_role, resume_profile, search_text, search_cjk_bigrams
ON studio_interview FOR EACH ROW EXECUTE FUNCTION sync_resume_search_fields();
