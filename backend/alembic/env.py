import os
import sys
from pathlib import Path
from logging.config import fileConfig

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.profile_models import StudentProfile

from sqlalchemy import engine_from_config, pool
from alembic import context
from dotenv import load_dotenv
from app.expense_models import Expense, RecurringExpense, ExpenseSetting
from app.models import Base
from app.request_models import RoommateRequest
from app.listing_models import RoomListing
from app.shared_expense_models import SharedExpense, ExpenseShare, ExpenseSettlement
from app.message_models import Message
from app.notification_models import Notification
from app.group_models import (
    LivingGroup,
    GroupMember,
    GroupMessage,
    MatchPreference,
    BlockedPair,
    TeamUp,
)
from app.chore_models import Chore, ChoreHistory, GroupRule, RuleViolation
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

config = context.config

if DATABASE_URL:
    db_url = DATABASE_URL
    if db_url.startswith("postgres://"):
        db_url = "postgresql+psycopg://" + db_url[len("postgres://"):]
    elif db_url.startswith("postgresql://"):
        db_url = "postgresql+psycopg://" + db_url[len("postgresql://"):]
    # ConfigParser treats '%' as interpolation syntax. Escaping '%' to '%%'
    # allows URL-encoded characters in database credentials (e.g. '%40' for '@')
    # without triggering ValueError: invalid interpolation syntax.
    config.set_main_option(
        "sqlalchemy.url",
        db_url.replace("%", "%%"),
    )

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url") or DATABASE_URL

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()