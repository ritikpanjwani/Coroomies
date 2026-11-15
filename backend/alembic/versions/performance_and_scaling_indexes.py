"""add performance and scaling indexes

Revision ID: performance_and_scaling_indexes
Revises: add_upi_split_payment
Create Date: 2026-10-26
"""
from typing import Sequence, Union
from alembic import op

revision: str = "performance_and_scaling_indexes"
down_revision: Union[str, Sequence[str], None] = "add_upi_split_payment"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Group membership indexes for fast roster and authorization checks
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_group_members_user_status
        ON group_members (user_id, status);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_group_members_group_status
        ON group_members (group_id, status);
        """
    )

    # 2. Group messages index for rapid chat retrieval
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_group_messages_group_created
        ON group_messages (group_id, created_at ASC);
        """
    )

    # 3. Direct chat messages indexes
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages (sender_id, receiver_id, created_at);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_messages_receiver
        ON messages (receiver_id, created_at);
        """
    )

    # 4. Shared expenses and shares indexes
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_shared_expenses_group_id
        ON shared_expenses (group_id, id DESC);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_expense_shares_expense_status
        ON expense_shares (expense_id, status);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_expense_shares_user
        ON expense_shares (user_id);
        """
    )

    # 5. Settlements and violations indexes
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_expense_settlements_group
        ON expense_settlements (group_id);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rule_violations_group
        ON rule_violations (group_id);
        """
    )

    # 6. Roommate requests indexes
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_roommate_requests_receiver
        ON roommate_requests (receiver_id, status);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_roommate_requests_sender
        ON roommate_requests (sender_id, status);
        """
    )

    # 7. Notifications index
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notifications_user_read
        ON notifications (user_id, is_read);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_notifications_user_read;")
    op.execute("DROP INDEX IF EXISTS idx_roommate_requests_sender;")
    op.execute("DROP INDEX IF EXISTS idx_roommate_requests_receiver;")
    op.execute("DROP INDEX IF EXISTS idx_rule_violations_group;")
    op.execute("DROP INDEX IF EXISTS idx_expense_settlements_group;")
    op.execute("DROP INDEX IF EXISTS idx_expense_shares_user;")
    op.execute("DROP INDEX IF EXISTS idx_expense_shares_expense_status;")
    op.execute("DROP INDEX IF EXISTS idx_shared_expenses_group_id;")
    op.execute("DROP INDEX IF EXISTS idx_messages_receiver;")
    op.execute("DROP INDEX IF EXISTS idx_messages_conversation;")
    op.execute("DROP INDEX IF EXISTS idx_group_messages_group_created;")
    op.execute("DROP INDEX IF EXISTS idx_group_members_group_status;")
    op.execute("DROP INDEX IF EXISTS idx_group_members_user_status;")
