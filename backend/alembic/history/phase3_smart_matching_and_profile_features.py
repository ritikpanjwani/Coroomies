"""Phase 3: Add housing intent, move-in date, preferred localities, deal breakers, bio, and profile visibility

Revision ID: phase3_smart_matching_and_profile_features
Revises: add_auth_otps_table
Create Date: 2026-11-28
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "phase3_smart_matching_and_profile_features"
down_revision: Union[str, Sequence[str], None] = "add_auth_otps_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add new columns to student_profiles safely and non-destructively
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_profiles' AND column_name='housing_intent') THEN
                ALTER TABLE student_profiles ADD COLUMN housing_intent VARCHAR(50);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_profiles' AND column_name='move_in_date') THEN
                ALTER TABLE student_profiles ADD COLUMN move_in_date VARCHAR(50);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_profiles' AND column_name='preferred_localities') THEN
                ALTER TABLE student_profiles ADD COLUMN preferred_localities JSON DEFAULT '[]'::json;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_profiles' AND column_name='deal_breakers') THEN
                ALTER TABLE student_profiles ADD COLUMN deal_breakers JSON DEFAULT '[]'::json;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_profiles' AND column_name='bio') THEN
                ALTER TABLE student_profiles ADD COLUMN bio VARCHAR(280);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_profiles' AND column_name='profile_visibility') THEN
                ALTER TABLE student_profiles ADD COLUMN profile_visibility VARCHAR(20) DEFAULT 'public';
            END IF;
        END $$;
    """)

    # 2. Backfill existing records: preserve existing users' discovery visibility (default 'public' if null)
    op.execute("""
        UPDATE student_profiles
        SET profile_visibility = 'public'
        WHERE profile_visibility IS NULL;
    """)

    # 3. Dedicated indexes for high-performance discovery and matching
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_student_profiles_visibility
        ON student_profiles (profile_visibility);

        CREATE INDEX IF NOT EXISTS idx_student_profiles_housing_intent
        ON student_profiles (housing_intent);
    """)


def downgrade() -> None:
    # Non-destructive downgrade: remove added indexes and columns if explicitly rolled back
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
