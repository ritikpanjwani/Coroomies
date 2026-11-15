"""add upi id to users and payment tracking to expense shares

Revision ID: add_upi_split_payment
Revises: add_otp_failed_attempts
Create Date: 2026-10-25
"""
from typing import Sequence, Union
from alembic import op

revision: str = "add_upi_split_payment"
down_revision: Union[str, Sequence[str], None] = "add_otp_failed_attempts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add upi_id to users for receiving UPI payments
    op.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS upi_id character varying(100);
        """
    )

    # 2. Add payment tracking fields to expense_shares
    op.execute(
        """
        ALTER TABLE expense_shares
        ADD COLUMN IF NOT EXISTS payment_reported_at timestamp with time zone;
        """
    )
    op.execute(
        """
        ALTER TABLE expense_shares
        ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamp with time zone;
        """
    )
    op.execute(
        """
        ALTER TABLE expense_shares
        ADD COLUMN IF NOT EXISTS payment_reference character varying(100);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE expense_shares
        DROP COLUMN IF EXISTS payment_reference;
        """
    )
    op.execute(
        """
        ALTER TABLE expense_shares
        DROP COLUMN IF EXISTS payment_confirmed_at;
        """
    )
    op.execute(
        """
        ALTER TABLE expense_shares
        DROP COLUMN IF EXISTS payment_reported_at;
        """
    )
    op.execute(
        """
        ALTER TABLE users
        DROP COLUMN IF EXISTS upi_id;
        """
    )
