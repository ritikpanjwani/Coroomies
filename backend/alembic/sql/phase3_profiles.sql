DO $$
DECLARE
    target_schema text := current_schema();
    spec record;
    actual_type text;
    constrained boolean;
BEGIN
    FOR spec IN SELECT * FROM (VALUES
        ('housing_intent', 'character varying(50)', ''),
        ('move_in_date', 'character varying(50)', ''),
        ('preferred_localities', 'json', ' DEFAULT ''[]''::json'),
        ('deal_breakers', 'json', ' DEFAULT ''[]''::json'),
        ('bio', 'character varying(280)', ''),
        ('profile_visibility', 'character varying(20)', ' DEFAULT ''public''')
    ) AS fields(column_name, expected_type, initial_default)
    LOOP
        SELECT format_type(a.atttypid, a.atttypmod),
               a.attnotnull OR a.attgenerated <> '' OR a.attidentity <> ''
        INTO actual_type, constrained
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = target_schema AND c.relname = 'student_profiles'
          AND a.attname = spec.column_name AND NOT a.attisdropped;
        IF NOT FOUND THEN
            EXECUTE format('ALTER TABLE %I.student_profiles ADD COLUMN %I %s%s',
                target_schema, spec.column_name, spec.expected_type, spec.initial_default);
        ELSIF constrained OR actual_type <> spec.expected_type THEN
            RAISE EXCEPTION 'Incompatible type for %.student_profiles.%: expected %, found %',
                target_schema, spec.column_name, spec.expected_type, actual_type;
        END IF;
    END LOOP;
    -- When the column is new, historical rows inherit legacy discovery.
    -- Existing values (including NULL) are preserved; future rows opt in.
    EXECUTE format('ALTER TABLE %I.student_profiles ALTER COLUMN profile_visibility SET DEFAULT %L',
        target_schema, 'hidden');
END $$;

CREATE INDEX IF NOT EXISTS idx_student_profiles_visibility
ON student_profiles (profile_visibility);

CREATE INDEX IF NOT EXISTS idx_student_profiles_housing_intent
ON student_profiles (housing_intent);

-- Normalize defaults without rewriting stored preferences.
ALTER TABLE student_profiles
    ALTER COLUMN housing_intent DROP DEFAULT,
    ALTER COLUMN move_in_date DROP DEFAULT,
    ALTER COLUMN bio DROP DEFAULT,
    ALTER COLUMN deal_breakers SET DEFAULT '[]'::json,
    ALTER COLUMN preferred_localities SET DEFAULT '[]'::json;


-- Check the persisted definitions before a caller advances the revision row.
DO $$
DECLARE
    field record;
BEGIN
    FOR field IN SELECT * FROM (VALUES
        ('housing_intent', 'character varying(50)', NULL),
        ('move_in_date', 'character varying(50)', NULL),
        ('preferred_localities', 'json', '''[]''::json'),
        ('deal_breakers', 'json', '''[]''::json'),
        ('bio', 'character varying(280)', NULL),
        ('profile_visibility', 'character varying(20)', '''hidden''::character varying')
    ) AS fields(col, typ, def)
    LOOP
        IF NOT EXISTS (
            SELECT FROM pg_attribute a LEFT JOIN pg_attrdef d
              ON d.adrelid=a.attrelid AND d.adnum=a.attnum
            WHERE a.attrelid=to_regclass(format('%I.student_profiles',current_schema()))
              AND a.attname=field.col AND NOT a.attisdropped AND NOT a.attnotnull
              AND a.attidentity='' AND a.attgenerated=''
              AND format_type(a.atttypid,a.atttypmod)=field.typ
              AND pg_get_expr(d.adbin,d.adrelid) IS NOT DISTINCT FROM field.def
        ) THEN
            RAISE EXCEPTION 'Unexpected final definition for student_profiles.%',field.col;
        END IF;
    END LOOP;
END $$;
