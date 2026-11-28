"""add auth_otps table for secure passwordless authentication

Revision ID: add_auth_otps_table
Revises: consolidated_migration_heads
Create Date: 2026-11-24
"""

from typing import Sequence, Union
from alembic import op


revision: str = "add_auth_otps_table"
down_revision: Union[str, Sequence[str], None] = "consolidated_migration_heads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS auth_otps (
            id serial NOT NULL,
            email varchar(255) NOT NULL,
            otp_hash varchar(255) NOT NULL,
            purpose varchar(32) NOT NULL DEFAULT 'login',
            user_id integer,
            expires_at timestamp with time zone NOT NULL,
            used boolean NOT NULL DEFAULT false,
            failed_attempts integer NOT NULL DEFAULT 0,
            created_at timestamp with time zone NOT NULL DEFAULT now(),
            CONSTRAINT auth_otps_pkey PRIMARY KEY (id),
            CONSTRAINT auth_otps_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_auth_otps_email_lookup
        ON auth_otps (lower(email), used, expires_at)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_auth_otps_email_created
        ON auth_otps (lower(email), created_at DESC)
        """
    )


def downgrade() -> None:
    # Forward-only: preserve authentication history and tokens
    pass
