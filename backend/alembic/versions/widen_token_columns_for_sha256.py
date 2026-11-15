"""widen token columns for sha256 hashes

Revision ID: widen_tokens_sha256
Revises: phase6_schema_repair
Create Date: 2026-10-24
"""
from typing import Sequence, Union
from alembic import op

revision: str = "widen_tokens_sha256"
down_revision: Union[str, Sequence[str], None] = "phase6_schema_repair"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE password_reset_tokens
        ALTER COLUMN otp TYPE character varying(64);
        """
    )
    op.execute(
        """
        ALTER TABLE email_change_tokens
        ALTER COLUMN code TYPE character varying(64);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE password_reset_tokens
        ALTER COLUMN otp TYPE character varying(6);
        """
    )
    op.execute(
        """
        ALTER TABLE email_change_tokens
        ALTER COLUMN code TYPE character varying(10);
        """
    )
