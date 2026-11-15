"""extend listings, profiles, shared expenses for roommate + group features

Revision ID: roommate_listings
Revises: create_living_groups
Create Date: 2026-08-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'roommate_listings'
down_revision: Union[str, Sequence[str], None] = 'create_living_groups'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Roommate listing fields (owner is the student living there, not a landlord)
    op.add_column('room_listings', sa.Column('deposit', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('room_listings', sa.Column('spots', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('room_listings', sa.Column('amenities', sa.Text(), nullable=True))
    op.add_column('room_listings', sa.Column('college', sa.String(length=150), nullable=True))
    op.add_column('room_listings', sa.Column('degree', sa.String(length=150), nullable=True))
    op.add_column('room_listings', sa.Column('stream', sa.String(length=150), nullable=True))
    op.add_column('room_listings', sa.Column('year', sa.Integer(), nullable=True))
    op.add_column('room_listings', sa.Column('lifestyle_preferences', sa.Text(), nullable=True))

    # Student education fields
    op.add_column('student_profiles', sa.Column('college', sa.String(length=150), nullable=True))
    op.add_column('student_profiles', sa.Column('degree', sa.String(length=150), nullable=True))
    op.add_column('student_profiles', sa.Column('stream', sa.String(length=150), nullable=True))
    op.add_column('student_profiles', sa.Column('year', sa.Integer(), nullable=True))

    # Shared expenses now belong to a living group
    # Add as nullable first, clean legacy rows, then enforce NOT NULL.
    op.add_column('shared_expenses', sa.Column('group_id', sa.Integer(), nullable=True))
    op.execute("DELETE FROM expense_shares WHERE expense_id IN (SELECT id FROM shared_expenses WHERE group_id IS NULL)")
    op.execute("DELETE FROM shared_expenses WHERE group_id IS NULL")
    op.alter_column('shared_expenses', 'group_id', nullable=False)
    op.create_foreign_key(
        'shared_expenses_group_id_fkey',
        'shared_expenses',
        'living_groups',
        ['group_id'],
        ['id'],
        ondelete='CASCADE',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('shared_expenses_group_id_fkey', 'shared_expenses', type_='foreignkey')
    op.drop_column('shared_expenses', 'group_id')

    op.drop_column('student_profiles', 'year')
    op.drop_column('student_profiles', 'stream')
    op.drop_column('student_profiles', 'degree')
    op.drop_column('student_profiles', 'college')

    op.drop_column('room_listings', 'lifestyle_preferences')
    op.drop_column('room_listings', 'year')
    op.drop_column('room_listings', 'stream')
    op.drop_column('room_listings', 'degree')
    op.drop_column('room_listings', 'college')
    op.drop_column('room_listings', 'amenities')
    op.drop_column('room_listings', 'spots')
    op.drop_column('room_listings', 'deposit')