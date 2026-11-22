"""repair roommate request and direct-message notification schema

Revision ID: staging_schema_repair
Revises: matching_preference_constraints
"""

from typing import Sequence, Union

from alembic import op


revision: str = "staging_schema_repair"
down_revision: Union[str, Sequence[str], None] = "matching_preference_constraints"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Historical request timestamps are unknown. Keep legacy NULLs as NULL
    # instead of fabricating a migration-time or account-registration date.
    op.execute(
        """
        ALTER TABLE roommate_requests
        ADD COLUMN IF NOT EXISTS created_at timestamp with time zone
        """
    )
    op.execute(
        """
        ALTER TABLE roommate_requests
        ALTER COLUMN created_at SET DEFAULT now()
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS conversation_notification_settings (
            id serial NOT NULL,
            user_id integer NOT NULL,
            peer_id integer NOT NULL,
            is_muted boolean NOT NULL DEFAULT false,
            created_at timestamp with time zone NOT NULL DEFAULT now(),
            updated_at timestamp with time zone NOT NULL DEFAULT now(),
            CONSTRAINT conversation_notification_settings_pkey PRIMARY KEY (id),
            CONSTRAINT conversation_notification_settings_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT conversation_notification_settings_peer_id_fkey
                FOREIGN KEY (peer_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT uq_conversation_notification_user_peer
                UNIQUE (user_id, peer_id),
            CONSTRAINT conversation_notification_settings_no_self
                CHECK (user_id <> peer_id)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_conversation_notification_user_peer
        ON conversation_notification_settings (user_id, peer_id)
        """
    )


def downgrade() -> None:
    # Data-preserving downgrade: this repair migration does not destructively
    # remove live messaging settings or request history.
    pass
