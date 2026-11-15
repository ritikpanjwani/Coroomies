"""debt settlement

Revision ID: debt_settlement
Revises: personal_expense_upgrade
Create Date: 2026-08-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'debt_settlement'
down_revision: Union[str, Sequence[str], None] = 'personal_expense_upgrade'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'expense_settlements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('payer_id', sa.Integer(), nullable=False),
        sa.Column('receiver_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('note', sa.String(length=200), nullable=True),
        sa.Column('settled_at', sa.String(length=10), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['living_groups.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['payer_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['receiver_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('expense_settlements')