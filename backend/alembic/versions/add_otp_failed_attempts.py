"""add failed_attempts column to otp and email change tokens

Revision ID: add_otp_failed_attempts
Revises: widen_tokens_sha256
Create Date: 2026-10-24
"""
from typing import Sequence, Union
from alembic import op

revision: str = "add_otp_failed_attempts"
down_revision: Union[str, Sequence[str], None] = "widen_tokens_sha256"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE password_reset_tokens
        ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0;
        """
    )
    op.execute(
        """
        ALTER TABLE email_change_tokens
        ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE password_reset_tokens
        DROP COLUMN IF EXISTS failed_attempts;
        """
    )
    op.execute(
        """
        ALTER TABLE email_change_tokens
        DROP COLUMN IF EXISTS failed_attempts;
        """
    )
