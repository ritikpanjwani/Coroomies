"""living groups cascade hardening and email lower index

Revision ID: living_groups_cascade_hardening
Revises: add_message_media_attachments
Create Date: 2026-11-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "living_groups_cascade_hardening"
down_revision: Union[str, Sequence[str], None] = "add_message_media_attachments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Protect living groups from accidental cascade deletion when creator account is deleted
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'living_groups_created_by_fkey'
            ) THEN
                ALTER TABLE living_groups DROP CONSTRAINT living_groups_created_by_fkey;
            END IF;
        END $$;
    """)

    op.create_foreign_key(
        "living_groups_created_by_fkey",
        "living_groups",
        "users",
        ["created_by"],
        ["id"],
        ondelete="RESTRICT",
    )

    # 2. Case-insensitive unique index on users.email
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_users_lower_email
        ON users (lower(email));
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_users_lower_email;")

    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'living_groups_created_by_fkey'
            ) THEN
                ALTER TABLE living_groups DROP CONSTRAINT living_groups_created_by_fkey;
            END IF;
        END $$;
    """)

    op.create_foreign_key(
        "living_groups_created_by_fkey",
        "living_groups",
        "users",
        ["created_by"],
        ["id"],
        ondelete="CASCADE",
    )
