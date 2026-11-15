"""add group notification settings

Revision ID: add_group_notification_settings
Revises: add_notification_metadata
Create Date: 2026-10-30
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "add_group_notification_settings"
down_revision: Union[str, Sequence[str], None] = "add_notification_metadata"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "group_notification_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("is_muted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("mute_messages", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("mute_expenses", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("mute_activity", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["living_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "group_id", name="uq_group_notif_user_group"),
    )
    op.create_index(
        "idx_group_notif_user_group",
        "group_notification_settings",
        ["user_id", "group_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_group_notif_user_group", table_name="group_notification_settings")
    op.drop_table("group_notification_settings")
