"""Phase 3: Add housing intent, move-in date, preferred localities, deal breakers, bio, and profile visibility

Revision ID: phase3_profile_discovery
Revises: add_auth_otps_table
Create Date: 2026-11-28
"""
from typing import Sequence, Union
from alembic import op
from pathlib import Path


revision: str = "phase3_profile_discovery"
down_revision: Union[str, Sequence[str], None] = "add_auth_otps_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    sql_dir = Path(__file__).resolve().parents[1] / "sql"
    for filename in ("phase3_auth_check.sql", "phase3_profiles.sql", "phase3_indexes.sql"):
        op.execute(sql_dir.joinpath(filename).read_text(encoding="utf-8"))


def downgrade() -> None:
    # Downgrading discards data stored in the six Phase 3 columns.
    op.execute("""
        DROP INDEX IF EXISTS idx_student_profiles_housing_intent;
        DROP INDEX IF EXISTS idx_student_profiles_visibility;
        ALTER TABLE student_profiles DROP COLUMN IF EXISTS profile_visibility;
        ALTER TABLE student_profiles DROP COLUMN IF EXISTS bio;
        ALTER TABLE student_profiles DROP COLUMN IF EXISTS deal_breakers;
        ALTER TABLE student_profiles DROP COLUMN IF EXISTS preferred_localities;
        ALTER TABLE student_profiles DROP COLUMN IF EXISTS move_in_date;
        ALTER TABLE student_profiles DROP COLUMN IF EXISTS housing_intent;
    """)
