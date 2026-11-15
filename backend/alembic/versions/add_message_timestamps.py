"""Add created_at column to messages table

Revision ID: add_message_timestamps
Revises: fcfedad53df6
Create Date: 2026-08-18

"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime, timezone

# revision identifiers, used by Alembic.
revision = 'add_message_timestamps'
down_revision = 'fcfedad53df6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add created_at column to messages table
    op.add_column('messages', sa.Column(
        'created_at',
        sa.DateTime(timezone=True),
        nullable=True  # Allow null for existing records
    ))
    
    # Update existing messages with current timestamp
    op.execute("UPDATE messages SET created_at = NOW() WHERE created_at IS NULL")
    
    # Make it NOT NULL after filling existing records
    op.alter_column('messages', 'created_at',
        existing_type=sa.DateTime(timezone=True),
        nullable=False)


def downgrade() -> None:
    # Remove created_at column
    op.drop_column('messages', 'created_at')
