\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(310721, 3);
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), true);
LOCK TABLE alembic_version IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
    IF (SELECT count(*) FROM alembic_version) <> 1 OR NOT EXISTS
        (SELECT FROM alembic_version WHERE version_num='phase3_smart_matching_and_profile_features' FOR UPDATE) THEN
        RAISE EXCEPTION 'Expected exactly one head carrying the historical Phase 3 revision';
    END IF;
END $$;
\ir sql/phase3_auth_check.sql
\ir sql/phase3_profiles.sql
\ir sql/phase3_indexes.sql
DO $$
DECLARE
    affected integer;
BEGIN
    UPDATE alembic_version SET version_num='phase3_profile_discovery'
        WHERE version_num='phase3_smart_matching_and_profile_features';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'Unexpected revision row count'; END IF;
END $$;
COMMIT;
