"""merge notifications and messages branches

Revision ID: merge_messages_notifications
Revises: 67f861cb0d2c, add_messages_is_read
Create Date: 2026-08-20

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'merge_messages_notifications'
down_revision: Union[str, Sequence[str], None] = (
    '67f861cb0d2c',
    'add_messages_is_read',
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass