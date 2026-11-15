"""add message media attachments

Revision ID: add_message_media_attachments
Revises: add_group_notification_settings
Create Date: 2026-11-01
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "add_message_media_attachments"
down_revision: Union[str, Sequence[str], None] = "add_group_notification_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Allow nullable content in messages so media-only messages can have empty/null content
    op.alter_column("messages", "content", existing_type=sa.Text(), nullable=True)

    # 2. Create message_attachments table
    op.create_table(
        "message_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=False),
        sa.Column("sender_id", sa.Integer(), nullable=False),
        sa.Column("receiver_id", sa.Integer(), nullable=False),
        sa.Column("media_type", sa.String(length=20), nullable=False),
        sa.Column("storage_path", sa.String(length=255), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("duration", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["receiver_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "idx_message_attachments_message_id",
        "message_attachments",
        ["message_id"],
    )
    op.create_index(
        "idx_message_attachments_sender_receiver",
        "message_attachments",
        ["sender_id", "receiver_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_message_attachments_sender_receiver", table_name="message_attachments")
    op.drop_index("idx_message_attachments_message_id", table_name="message_attachments")
    op.drop_table("message_attachments")
    op.alter_column("messages", "content", existing_type=sa.Text(), nullable=False)
