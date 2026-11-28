DO $$
DECLARE
    spec record;
BEGIN
    FOR spec IN SELECT * FROM (VALUES
        ('auth_otps','idx_auth_otps_email_lookup','btree (lower((email)::text), used, expires_at)'),
        ('auth_otps','idx_auth_otps_email_created','btree (lower((email)::text), created_at DESC)'),
        ('student_profiles','idx_student_profiles_visibility','btree (profile_visibility)'),
        ('student_profiles','idx_student_profiles_housing_intent','btree (housing_intent)')
    ) AS indexes(tbl, idx, definition)
    LOOP
        IF NOT EXISTS (SELECT FROM pg_index i
            WHERE i.indexrelid=to_regclass(format('%I.%I',current_schema(),spec.idx))
              AND i.indrelid=to_regclass(format('%I.%I',current_schema(),spec.tbl))
              AND i.indisvalid AND i.indisready AND i.indislive AND NOT i.indisunique
              AND split_part(pg_get_indexdef(i.indexrelid),' USING ',2)=spec.definition) THEN
            RAISE EXCEPTION 'Incompatible or missing index %', spec.idx;
        END IF;
    END LOOP;
END $$;
