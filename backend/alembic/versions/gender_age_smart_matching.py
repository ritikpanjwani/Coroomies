"""Add gender, age/dob, location, budget, occupation, drinking preference to student_profiles

Revision ID: gender_age_smart_matching
Revises: living_groups_cascade_hardening
Create Date: 2026-11-19
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "gender_age_smart_matching"
down_revision: Union[str, Sequence[str], None] = "living_groups_cascade_hardening"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add columns IF NOT EXISTS (safe and idempotent)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_profiles' AND column_name='dob') THEN
                ALTER TABLE student_profiles ADD COLUMN dob DATE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_profiles' AND column_name='gender') THEN
                ALTER TABLE student_profiles ADD COLUMN gender VARCHAR(20);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_profiles' AND column_name='preferred_flatmate_gender') THEN
                ALTER TABLE student_profiles ADD COLUMN preferred_flatmate_gender VARCHAR(20);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_profiles' AND column_name='location') THEN
                ALTER TABLE student_profiles ADD COLUMN location VARCHAR(150);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_profiles' AND column_name='budget_min') THEN
                ALTER TABLE student_profiles ADD COLUMN budget_min INTEGER;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_profiles' AND column_name='budget_max') THEN
                ALTER TABLE student_profiles ADD COLUMN budget_max INTEGER;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_profiles' AND column_name='occupation') THEN
                ALTER TABLE student_profiles ADD COLUMN occupation VARCHAR(100);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_profiles' AND column_name='drinking_preference') THEN
                ALTER TABLE student_profiles ADD COLUMN drinking_preference VARCHAR(50);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_profiles' AND column_name='preferred_age_min') THEN
                ALTER TABLE student_profiles ADD COLUMN preferred_age_min INTEGER;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_profiles' AND column_name='preferred_age_max') THEN
                ALTER TABLE student_profiles ADD COLUMN preferred_age_max INTEGER;
            END IF;
        END $$;
    """)

    # 2. Helpful indexes
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_student_profiles_gender_pref
        ON student_profiles (gender, preferred_flatmate_gender);
        CREATE INDEX IF NOT EXISTS idx_student_profiles_location
        ON student_profiles (location);
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS idx_student_profiles_location;
        DROP INDEX IF EXISTS idx_student_profiles_gender_pref;
        ALTER TABLE student_profiles DROP COLUMN IF EXISTS preferred_age_max;
        ALTER TABLE student_profiles DROP COLUMN IF EXISTS preferred_age_min;
        ALTER TABLE student_profiles DROP COLUMN IF EXISTS drinking_preference;
        ALTER TABLE student_profiles DROP COLUMN IF EXISTS occupation;
        ALTER TABLE student_profiles DROP COLUMN IF EXISTS budget_max;
        ALTER TABLE student_profiles DROP COLUMN IF EXISTS budget_min;
        ALTER TABLE student_profiles DROP COLUMN IF EXISTS location;
        ALTER TABLE student_profiles DROP COLUMN IF EXISTS preferred_flatmate_gender;
        ALTER TABLE student_profiles DROP COLUMN IF EXISTS gender;
        ALTER TABLE student_profiles DROP COLUMN IF EXISTS dob;
    """)
