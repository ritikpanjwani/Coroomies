-- Confine unqualified DDL to the selected application schema.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), true);
DO $$
DECLARE
    item record;
    actual record;
    auth oid := to_regclass(format('%I.auth_otps', current_schema()));
    users_table oid := to_regclass(format('%I.users', current_schema()));
    seq text;
BEGIN
    IF auth IS NULL OR users_table IS NULL OR
       to_regclass(format('%I.student_profiles', current_schema())) IS NULL THEN
        RAISE EXCEPTION 'Required release dependency missing in application schema';
    END IF;
    LOCK TABLE auth_otps IN SHARE ROW EXCLUSIVE MODE;
    IF (SELECT count(*) FROM pg_attribute WHERE attrelid = auth AND attnum > 0 AND NOT attisdropped) <> 9 THEN
        RAISE EXCEPTION 'Unexpected auth_otps column set';
    END IF;
    seq := pg_get_serial_sequence(format('%I.auth_otps', current_schema()), 'id');
    IF seq IS NULL THEN RAISE EXCEPTION 'Missing owned auth_otps id sequence'; END IF;
    FOR item IN SELECT * FROM (VALUES
        ('id','integer',true,format('nextval(%L::regclass)',seq::regclass::text)),
        ('email','character varying(255)',true,NULL),
        ('otp_hash','character varying(255)',true,NULL),
        ('purpose','character varying(32)',true,'''login''::character varying'),
        ('user_id','integer',false,NULL),
        ('expires_at','timestamp with time zone',true,NULL),
        ('used','boolean',true,'false'),
        ('failed_attempts','integer',true,'0'),
        ('created_at','timestamp with time zone',true,'now()')
    ) AS fields(col, typ, required, def)
    LOOP
        SELECT format_type(a.atttypid,a.atttypmod) AS typ, a.attnotnull AS required,
               pg_get_expr(d.adbin,d.adrelid) AS def, a.attgenerated AS generated, a.attidentity AS ident
        INTO actual FROM pg_attribute a LEFT JOIN pg_attrdef d
          ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=auth AND a.attname=item.col AND NOT a.attisdropped;
        IF NOT FOUND OR (actual.typ, actual.required, actual.def) IS DISTINCT FROM
            (item.typ,item.required,item.def) OR actual.generated <> '' OR actual.ident <> '' THEN
            RAISE EXCEPTION 'Incompatible auth_otps column %', item.col;
        END IF;
    END LOOP;
    IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid=auth AND contype='p'
                   AND pg_get_constraintdef(oid)='PRIMARY KEY (id)')
       OR NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid=auth AND confrelid=users_table
                   AND contype='f' AND convalidated AND pg_get_constraintdef(oid)=
                   'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE') THEN
        RAISE EXCEPTION 'Incompatible auth_otps constraints';
    END IF;
END $$;
