"""merge the Google and staging repair migration heads

Revision ID: consolidated_migration_heads
Revises: google_identity_mapping, staging_schema_repair
"""

from typing import Sequence, Union


revision: str = "consolidated_migration_heads"
down_revision: Union[str, Sequence[str], None] = (
    "google_identity_mapping",
    "staging_schema_repair",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Both parent revisions are idempotent forward repairs. This revision
    # only joins their Alembic graph into a single deployment head.
    pass


def downgrade() -> None:
    # Forward-only merge: no data or schema objects are removed.
    pass
