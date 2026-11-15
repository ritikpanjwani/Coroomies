"""phase 5 security hardening

Revision ID: phase5_security_hardening
Revises: team_ups
Create Date: 2026-10-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "phase5_security_hardening"
down_revision: Union[str, Sequence[str], None] = "team_ups"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CHECK_CONSTRAINTS = (
    ("expenses", "ck_expenses_amount_positive", "amount > 0"),
    ("recurring_expenses", "ck_recurring_expenses_amount_positive", "amount > 0"),
    ("shared_expenses", "ck_shared_expenses_amount_positive", "amount > 0"),
    ("expense_shares", "ck_expense_shares_amount_nonnegative", "amount >= 0"),
    ("expense_settlements", "ck_expense_settlements_amount_positive", "amount > 0"),
    ("group_rules", "ck_group_rules_penalty_nonnegative", "penalty_amount >= 0"),
    ("rule_violations", "ck_rule_violations_penalty_nonnegative", "penalty_amount >= 0"),
)


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "token_version",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )

    for table, name, expression in CHECK_CONSTRAINTS:
        op.execute(
            f"ALTER TABLE {table} ADD CONSTRAINT {name} "
            f"CHECK ({expression}) NOT VALID"
        )
        op.execute(f"ALTER TABLE {table} VALIDATE CONSTRAINT {name}")


def downgrade() -> None:
    for table, name, _ in reversed(CHECK_CONSTRAINTS):
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}")

    op.drop_column("users", "token_version")
