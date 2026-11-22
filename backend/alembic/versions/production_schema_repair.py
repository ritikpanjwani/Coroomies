"""repair schema objects required by current API routes

Revision ID: production_schema_repair
Revises: matching_preference_constraints
Create Date: 2026-11-22

"""
from typing import Sequence, Union

from alembic import op


revision: str = "production_schema_repair"
down_revision: Union[str, Sequence[str], None] = "matching_preference_constraints"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The messaging router has always used this per-user conversation setting,
    # but the table was never represented in the migration history.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS conversation_notification_settings (
            id serial PRIMARY KEY,
            user_id integer NOT NULL
                REFERENCES users(id) ON DELETE CASCADE,
            peer_id integer NOT NULL
                REFERENCES users(id) ON DELETE CASCADE,
            is_muted boolean NOT NULL DEFAULT false,
            updated_at timestamp with time zone NOT NULL DEFAULT now(),
            CONSTRAINT conversation_notification_settings_user_peer_key
                UNIQUE (user_id, peer_id),
            CONSTRAINT conversation_notification_settings_distinct_users
                CHECK (user_id <> peer_id)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_conversation_settings_user
        ON conversation_notification_settings (user_id, peer_id)
        """
    )

    # Existing request queries and API responses rely on a creation timestamp.
    op.execute(
        """
        ALTER TABLE roommate_requests
        ADD COLUMN IF NOT EXISTS created_at timestamp with time zone
        """
    )
    op.execute(
        """
        UPDATE roommate_requests
        SET created_at = now()
        WHERE created_at IS NULL
        """
    )
    op.execute(
        """
        ALTER TABLE roommate_requests
        ALTER COLUMN created_at SET DEFAULT now(),
        ALTER COLUMN created_at SET NOT NULL
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_roommate_requests_created_at
        ON roommate_requests (receiver_id, created_at DESC)
        """
    )


def downgrade() -> None:
    # Keep this repair forward-only: dropping the table/column could remove
    # live notification preferences or request history.
    pass
