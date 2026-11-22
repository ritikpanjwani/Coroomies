"""add Google OIDC identity mapping to users

Revision ID: google_identity_mapping
Revises: production_schema_repair
Create Date: 2026-11-22
"""

from typing import Sequence, Union

from alembic import op


revision: str = "google_identity_mapping"
down_revision: Union[str, Sequence[str], None] = "production_schema_repair"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS google_sub varchar(255)
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique
        ON users (google_sub)
        WHERE google_sub IS NOT NULL
        """
    )


def downgrade() -> None:
    # Forward-only: removing identity mappings could strand Google accounts.
    pass
