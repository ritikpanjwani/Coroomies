"""add notification metadata

Revision ID: add_notification_metadata
Revises: performance_and_scaling_indexes
Create Date: 2026-10-30
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "add_notification_metadata"
down_revision: Union[str, Sequence[str], None] = "performance_and_scaling_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add created_at column with default NOW()
    op.add_column(
        "notifications",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # 2. Add notification_type column
    op.add_column(
        "notifications",
        sa.Column(
            "notification_type",
            sa.String(length=50),
            server_default="general",
            nullable=False,
        ),
    )

    # 3. Add reference_id and reference_type
    op.add_column(
        "notifications",
        sa.Column("reference_id", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "notifications",
        sa.Column("reference_type", sa.String(length=50), nullable=True),
    )

    # 4. Add sender_id (with foreign key) and sender_name
    op.add_column(
        "notifications",
        sa.Column("sender_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_notifications_sender_id_users",
        "notifications",
        "users",
        ["sender_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column(
        "notifications",
        sa.Column("sender_name", sa.String(length=150), nullable=True),
    )

    # 5. Create index for fast retrieval ordered by created_at DESC
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notifications_user_created
        ON notifications (user_id, created_at DESC);
        """
    )

    # 6. Create index for deduplication lookups
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notifications_dedup
        ON notifications (user_id, notification_type, reference_id, is_read);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_notifications_dedup;")
    op.execute("DROP INDEX IF EXISTS idx_notifications_user_created;")
    op.drop_constraint("fk_notifications_sender_id_users", "notifications", type_="foreignkey")
    op.drop_column("notifications", "sender_name")
    op.drop_column("notifications", "sender_id")
    op.drop_column("notifications", "reference_type")
    op.drop_column("notifications", "reference_id")
    op.drop_column("notifications", "notification_type")
    op.drop_column("notifications", "created_at")
