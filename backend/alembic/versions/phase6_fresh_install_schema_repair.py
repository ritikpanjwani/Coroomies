"""repair fresh-install schema gaps

Several app tables and columns were created outside the migration history, so a
new database produced by ``alembic upgrade head`` was missing objects that the
running application depends on. This migration adds them idempotently so both a
fresh install and an already-populated database converge on the same schema.

Revision ID: phase6_schema_repair
Revises: phase5_security_hardening
Create Date: 2026-10-20
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "phase6_schema_repair"
down_revision: Union[str, Sequence[str], None] = "phase5_security_hardening"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Missing tables (auth + chore scheduling) -----------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id serial NOT NULL,
            user_id integer NOT NULL,
            otp character varying(6) NOT NULL,
            expires_at timestamp with time zone NOT NULL,
            used boolean NOT NULL DEFAULT false,
            created_at timestamp with time zone NOT NULL DEFAULT now(),
            CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id),
            CONSTRAINT password_reset_tokens_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_prt_user "
        "ON password_reset_tokens (user_id)"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS email_change_tokens (
            id serial NOT NULL,
            user_id integer NOT NULL,
            new_email character varying(255) NOT NULL,
            code character varying(10) NOT NULL,
            expires_at timestamp with time zone NOT NULL,
            used boolean DEFAULT false,
            created_at timestamp with time zone DEFAULT now(),
            CONSTRAINT email_change_tokens_pkey PRIMARY KEY (id),
            CONSTRAINT email_change_tokens_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_email_change_tokens_user "
        "ON email_change_tokens (user_id)"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS chore_schedules (
            id serial NOT NULL,
            group_id integer NOT NULL,
            title character varying(200) NOT NULL,
            description text,
            assigned_to integer,
            frequency character varying(10) NOT NULL,
            day_of_week integer,
            day_of_month integer,
            active boolean NOT NULL DEFAULT true,
            created_by integer NOT NULL,
            created_at timestamp with time zone NOT NULL DEFAULT now(),
            reminder_time character varying(5),
            last_reminder_date date,
            CONSTRAINT chore_schedules_pkey PRIMARY KEY (id),
            CONSTRAINT chore_schedules_group_id_fkey
                FOREIGN KEY (group_id) REFERENCES living_groups(id) ON DELETE CASCADE,
            CONSTRAINT chore_schedules_assigned_to_fkey
                FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
            CONSTRAINT chore_schedules_created_by_fkey
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT chore_schedules_day_of_week_check
                CHECK (day_of_week >= 0 AND day_of_week <= 6),
            CONSTRAINT chore_schedules_day_of_month_check
                CHECK (day_of_month >= 1 AND day_of_month <= 31),
            CONSTRAINT chore_schedules_frequency_check
                CHECK (frequency::text = ANY (ARRAY['weekly'::character varying, 'monthly'::character varying]::text[]))
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_chore_schedules_group "
        "ON chore_schedules (group_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_chore_schedules_active "
        "ON chore_schedules (group_id, active) WHERE active = true"
    )

    # --- Missing columns on existing tables -----------------------------------
    op.execute("ALTER TABLE chores ADD COLUMN IF NOT EXISTS due_day integer")
    op.execute(
        "ALTER TABLE expense_settings ADD COLUMN IF NOT EXISTS budget_reminder integer"
    )
    op.execute("ALTER TABLE living_groups ADD COLUMN IF NOT EXISTS avatar_url text")
    op.execute(
        "ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS pets_preference character varying(20)"
    )
    op.execute(
        "ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS study_environment character varying(20)"
    )
    op.execute(
        "ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS work_from_home character varying(20)"
    )
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text")
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS username character varying(30)"
    )
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS username_changed_at timestamp with time zone"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username "
        "ON users (username) WHERE username IS NOT NULL"
    )
    # Align the users.email nullability with the verified live schema.
    op.execute("ALTER TABLE users ALTER COLUMN email DROP NOT NULL")

    # --- Missing check constraint ---------------------------------------------
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'expense_settings_budget_reminder_check'
            ) THEN
                ALTER TABLE expense_settings
                    ADD CONSTRAINT expense_settings_budget_reminder_check
                    CHECK (budget_reminder IS NULL OR (budget_reminder >= 1 AND budget_reminder <= 100));
            END IF;
        END $$;
        """
    )

    # --- Ensure notifications FK cascades on fresh installs --------------------
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.notifications') IS NOT NULL THEN
                ALTER TABLE notifications
                    DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
                ALTER TABLE notifications
                    ADD CONSTRAINT notifications_user_id_fkey
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    """Intentionally a no-op.

    This migration repairs objects that pre-existed in the deployed database
    (they hold live password-reset and chore-schedule data). Dropping them on a
    downgrade would destroy real data, so rollback is handled operationally via
    database backup/restore instead.
    """
    pass
