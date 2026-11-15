import os
import sys
from pathlib import Path
import psycopg
from alembic.config import Config
from alembic import command

backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.database import DATABASE_URL

# Parse connection to connect to default postgres db for creating temp test db
parsed = psycopg.conninfo.conninfo_to_dict(DATABASE_URL)
test_db_name = "coroomies_staging_mig_test"

# Connect to postgres server to create isolated staging test database
admin_conninfo = dict(parsed)
admin_conninfo["dbname"] = "postgres"

with psycopg.connect(**admin_conninfo, autocommit=True) as conn:
    with conn.cursor() as cur:
        cur.execute(f"DROP DATABASE IF EXISTS {test_db_name}")
        cur.execute(f"CREATE DATABASE {test_db_name}")
print(f"Created isolated test database: {test_db_name}")

try:
    user = parsed.get("user") or ""
    password = parsed.get("password") or ""
    host = parsed.get("host") or "localhost"
    port = parsed.get("port") or 5432
    auth = f"{user}:{password}@" if user else ""
    test_db_url = f"postgresql://{auth}{host}:{port}/{test_db_name}"

    # Point DATABASE_URL environment variable to the isolated test database
    os.environ["DATABASE_URL"] = test_db_url

    # Run alembic upgrade head on the isolated test database
    alembic_cfg = Config(str(backend_dir / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    command.upgrade(alembic_cfg, "head")
    print("Alembic upgrade head completed on isolated test database.")

    # Verify tables created
    with psycopg.connect(test_db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name;
            """)
            tables = [r[0] for r in cur.fetchall()]
            print(f"Total tables created: {len(tables)}")
            print(f"Tables: {', '.join(tables)}")

            cur.execute("SELECT version_num FROM alembic_version")
            head_rev = cur.fetchone()[0]
            print(f"Alembic verified head revision: {head_rev}")

            # Verify crucial columns exist on token tables
            cur.execute("""
                SELECT column_name, data_type, character_maximum_length 
                FROM information_schema.columns 
                WHERE table_name = 'password_reset_tokens' 
                ORDER BY ordinal_position;
            """)
            prt_cols = {r[0]: (r[1], r[2]) for r in cur.fetchall()}
            assert "failed_attempts" in prt_cols, "failed_attempts missing from password_reset_tokens"
            assert prt_cols["otp"][1] == 64, f"otp column should be varchar(64), got {prt_cols['otp']}"

            cur.execute("""
                SELECT column_name, data_type, character_maximum_length 
                FROM information_schema.columns 
                WHERE table_name = 'email_change_tokens' 
                ORDER BY ordinal_position;
            """)
            ect_cols = {r[0]: (r[1], r[2]) for r in cur.fetchall()}
            assert "failed_attempts" in ect_cols, "failed_attempts missing from email_change_tokens"
            assert ect_cols["code"][1] == 64, f"code column should be varchar(64), got {ect_cols['code']}"

    print("SUCCESS: Fresh staging database migration verified completely!")
finally:
    # Always clean up and drop the test database
    with psycopg.connect(**admin_conninfo, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP DATABASE IF EXISTS {test_db_name}")
    print(f"Cleanly dropped temporary test database: {test_db_name}")
