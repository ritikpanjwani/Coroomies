"""personal expense upgrade

Revision ID: personal_expense_upgrade
Revises: roommate_listings
Create Date: 2026-08-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'personal_expense_upgrade'
down_revision: Union[str, Sequence[str], None] = 'roommate_listings'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'expense_settings',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('monthly_budget', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id'),
    )

    op.create_table(
        'recurring_expenses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('subcategory', sa.String(length=100), nullable=False),
        sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('frequency', sa.String(length=20), nullable=False),
        sa.Column('start_date', sa.String(length=10), nullable=False),
        sa.Column('end_date', sa.String(length=10), nullable=True),
        sa.Column('next_run_date', sa.String(length=10), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('recurring_expenses')
    op.drop_table('expense_settings')