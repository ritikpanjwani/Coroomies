"""add shared expense created_at

Revision ID: shared_expense_created_at
Revises: chores_rules_reliability
Create Date: 2026-08-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'shared_expense_created_at'
down_revision: Union[str, Sequence[str], None] = 'chores_rules_reliability'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'shared_expenses',
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.execute("UPDATE shared_expenses SET created_at = NOW() WHERE created_at IS NULL")
    op.alter_column('shared_expenses', 'created_at', nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('shared_expenses', 'created_at')