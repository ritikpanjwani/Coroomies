"""Enforce valid matching preference ranges for future writes.

Revision ID: matching_preference_constraints
Revises: gender_age_smart_matching
"""

from alembic import op


revision = "matching_preference_constraints"
down_revision = "gender_age_smart_matching"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NOT VALID protects all new/updated rows without failing deployment because
    # of legacy data. Existing rows can be corrected and constraints validated
    # later in a separately approved data-maintenance operation.
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_profiles_budget_range_ck') THEN
                ALTER TABLE student_profiles
                    ADD CONSTRAINT student_profiles_budget_range_ck
                    CHECK (budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max) NOT VALID;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_profiles_age_range_ck') THEN
                ALTER TABLE student_profiles
                    ADD CONSTRAINT student_profiles_age_range_ck
                    CHECK (
                        (preferred_age_min IS NULL OR preferred_age_min BETWEEN 18 AND 100)
                        AND (preferred_age_max IS NULL OR preferred_age_max BETWEEN 18 AND 100)
                        AND (preferred_age_min IS NULL OR preferred_age_max IS NULL OR preferred_age_min <= preferred_age_max)
                    ) NOT VALID;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE student_profiles DROP CONSTRAINT IF EXISTS student_profiles_age_range_ck;
        ALTER TABLE student_profiles DROP CONSTRAINT IF EXISTS student_profiles_budget_range_ck;
    """)
