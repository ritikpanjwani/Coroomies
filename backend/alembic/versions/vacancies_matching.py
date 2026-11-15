"""vacancies and matching

Revision ID: vacancies_matching
Revises: shared_expense_created_at
Create Date: 2026-08-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'vacancies_matching'
down_revision: Union[str, Sequence[str], None] = 'shared_expense_created_at'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'living_groups',
        sa.Column('open_slots', sa.Integer(), server_default='0', nullable=False),
    )
    op.create_table(
        'match_preferences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('preferred_user_id', sa.Integer(), nullable=False),
        sa.Column('rank', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['preferred_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'preferred_user_id'),
    )
    op.create_table(
        'blocked_pairs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_a_id', sa.Integer(), nullable=False),
        sa.Column('user_b_id', sa.Integer(), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_a_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_b_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('blocked_pairs')
    op.drop_table('match_preferences')
    op.drop_column('living_groups', 'open_slots')