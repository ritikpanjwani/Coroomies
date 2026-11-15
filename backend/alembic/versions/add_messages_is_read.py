"""Add is_read column to messages and cascade deletes on foreign keys

Revision ID: add_messages_is_read
Revises: add_message_timestamps
Create Date: 2026-08-20

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_messages_is_read'
down_revision = 'add_message_timestamps'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add is_read column to messages table
    op.add_column('messages', sa.Column(
        'is_read',
        sa.Boolean,
        nullable=False,
        server_default='false'
    ))

    # Add cascade deletes on foreign keys
    # student_profiles.user_id -> users.id
    op.execute("""
        ALTER TABLE student_profiles
        DROP CONSTRAINT IF EXISTS student_profiles_user_id_fkey,
        ADD CONSTRAINT student_profiles_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    """)

    # expenses.user_id -> users.id
    op.execute("""
        ALTER TABLE expenses
        DROP CONSTRAINT IF EXISTS expenses_user_id_fkey,
        ADD CONSTRAINT expenses_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    """)

    # shared_expenses.payer_id -> users.id
    op.execute("""
        ALTER TABLE shared_expenses
        DROP CONSTRAINT IF EXISTS shared_expenses_payer_id_fkey,
        ADD CONSTRAINT shared_expenses_payer_id_fkey
        FOREIGN KEY (payer_id) REFERENCES users(id) ON DELETE CASCADE
    """)

    # expense_shares.user_id -> users.id
    op.execute("""
        ALTER TABLE expense_shares
        DROP CONSTRAINT IF EXISTS expense_shares_user_id_fkey,
        ADD CONSTRAINT expense_shares_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    """)

    # room_listings.owner_id -> users.id
    op.execute("""
        ALTER TABLE room_listings
        DROP CONSTRAINT IF EXISTS room_listings_owner_id_fkey,
        ADD CONSTRAINT room_listings_owner_id_fkey
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    """)

    # roommate_requests.sender_id -> users.id
    op.execute("""
        ALTER TABLE roommate_requests
        DROP CONSTRAINT IF EXISTS roommate_requests_sender_id_fkey,
        ADD CONSTRAINT roommate_requests_sender_id_fkey
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    """)

    # roommate_requests.receiver_id -> users.id
    op.execute("""
        ALTER TABLE roommate_requests
        DROP CONSTRAINT IF EXISTS roommate_requests_receiver_id_fkey,
        ADD CONSTRAINT roommate_requests_receiver_id_fkey
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    """)

    # messages.sender_id -> users.id
    op.execute("""
        ALTER TABLE messages
        DROP CONSTRAINT IF EXISTS messages_sender_id_fkey,
        ADD CONSTRAINT messages_sender_id_fkey
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    """)

    # messages.receiver_id -> users.id
    op.execute("""
        ALTER TABLE messages
        DROP CONSTRAINT IF EXISTS messages_receiver_id_fkey,
        ADD CONSTRAINT messages_receiver_id_fkey
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    """)

    # notifications.user_id -> users.id
    # notifications is created on a parallel branch of this revision, so guard
    # the ALTER to keep fresh installs working regardless of branch order.
    op.execute("""
        DO $$
        BEGIN
            IF to_regclass('public.notifications') IS NOT NULL THEN
                ALTER TABLE notifications
                DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
                ALTER TABLE notifications
                ADD CONSTRAINT notifications_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    # Remove is_read column
    op.drop_column('messages', 'is_read')

    # Remove cascade deletes (revert to default behavior)
    op.execute("""
        ALTER TABLE student_profiles
        DROP CONSTRAINT IF EXISTS student_profiles_user_id_fkey,
        ADD CONSTRAINT student_profiles_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id)
    """)
    op.execute("""
        ALTER TABLE expenses
        DROP CONSTRAINT IF EXISTS expenses_user_id_fkey,
        ADD CONSTRAINT expenses_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id)
    """)
    op.execute("""
        ALTER TABLE shared_expenses
        DROP CONSTRAINT IF EXISTS shared_expenses_payer_id_fkey,
        ADD CONSTRAINT shared_expenses_payer_id_fkey
        FOREIGN KEY (payer_id) REFERENCES users(id)
    """)
    op.execute("""
        ALTER TABLE expense_shares
        DROP CONSTRAINT IF EXISTS expense_shares_user_id_fkey,
        ADD CONSTRAINT expense_shares_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id)
    """)
    op.execute("""
        ALTER TABLE room_listings
        DROP CONSTRAINT IF EXISTS room_listings_owner_id_fkey,
        ADD CONSTRAINT room_listings_owner_id_fkey
        FOREIGN KEY (owner_id) REFERENCES users(id)
    """)
    op.execute("""
        ALTER TABLE roommate_requests
        DROP CONSTRAINT IF EXISTS roommate_requests_sender_id_fkey,
        ADD CONSTRAINT roommate_requests_sender_id_fkey
        FOREIGN KEY (sender_id) REFERENCES users(id)
    """)
    op.execute("""
        ALTER TABLE roommate_requests
        DROP CONSTRAINT IF EXISTS roommate_requests_receiver_id_fkey,
        ADD CONSTRAINT roommate_requests_receiver_id_fkey
        FOREIGN KEY (receiver_id) REFERENCES users(id)
    """)
    op.execute("""
        ALTER TABLE messages
        DROP CONSTRAINT IF EXISTS messages_sender_id_fkey,
        ADD CONSTRAINT messages_sender_id_fkey
        FOREIGN KEY (sender_id) REFERENCES users(id)
    """)
    op.execute("""
        ALTER TABLE messages
        DROP CONSTRAINT IF EXISTS messages_receiver_id_fkey,
        ADD CONSTRAINT messages_receiver_id_fkey
        FOREIGN KEY (receiver_id) REFERENCES users(id)
    """)
    op.execute("""
        DO $$
        BEGIN
            IF to_regclass('public.notifications') IS NOT NULL THEN
                ALTER TABLE notifications
                DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
                ALTER TABLE notifications
                ADD CONSTRAINT notifications_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES users(id);
            END IF;
        END $$;
    """)
