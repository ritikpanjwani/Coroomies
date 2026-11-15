from datetime import timedelta
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user_id
from app.database import get_connection
from app.group_auth import require_active_member as _require_active_member
from app.Routers.reliability import _get_member_score
from app.timeutils import local_today

router = APIRouter(
    prefix="/assistant",
    tags=["Assistant"],
)

PAYMENT_AGE_DAYS = 7
HIGH_DEBT_THRESHOLD = 1000.0


def _group_info(cursor, group_id: int):
    cursor.execute(
        "SELECT id, name FROM living_groups WHERE id = %s",
        (group_id,),
    )
    return cursor.fetchone()


def _active_members(cursor, group_id: int):
    cursor.execute(
        """
        SELECT u.id, u.name
        FROM group_members gm
        JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = %s AND gm.status = 'active'
        ORDER BY gm.joined_at ASC
        """,
        (group_id,),
    )
    return cursor.fetchall()


def _overdue_shares(cursor, group_id: int):
    """Return {user_id: (count, total_amount)} for shares unpaid >7 days."""
    cursor.execute(
        """
        SELECT es.user_id, es.amount, e.description
        FROM expense_shares es
        JOIN shared_expenses e ON e.id = es.expense_id
        WHERE e.group_id = %s
          AND es.status = 'pending'
          AND e.created_at::date < %s
        ORDER BY e.created_at ASC
        """,
        (group_id, local_today() - timedelta(days=PAYMENT_AGE_DAYS)),
    )
    agg = defaultdict(lambda: [0, 0.0, []])
    for user_id, amount, desc in cursor.fetchall():
        agg[user_id][0] += 1
        agg[user_id][1] += float(amount)
        agg[user_id][2].append(desc)
    return {uid: {"count": c, "amount": round(a, 2), "items": items}
            for uid, (c, a, items) in agg.items()}


def _overdue_chores(cursor, group_id: int):
    cursor.execute(
        """
        SELECT c.assigned_to, c.title, c.due_date
        FROM chores c
        WHERE c.group_id = %s
          AND c.status = 'pending'
          AND c.due_date IS NOT NULL
          AND c.due_date < %s
        ORDER BY c.due_date ASC
        """,
        (group_id, local_today().isoformat()),
    )
    agg = defaultdict(list)
    for user_id, title, due in cursor.fetchall():
        agg[user_id].append({"title": title, "due_date": due})
    return dict(agg)


def _recent_violations(cursor, group_id: int):
    cursor.execute(
        """
        SELECT v.user_id, v.penalty_amount, r.title, v.created_at
        FROM rule_violations v
        JOIN group_rules r ON r.id = v.rule_id
        WHERE v.group_id = %s
          AND v.created_at::date >= %s
        ORDER BY v.created_at DESC
        """,
        (group_id, local_today() - timedelta(days=90)),
    )
    agg = defaultdict(list)
    for user_id, penalty, title, created in cursor.fetchall():
        agg[user_id].append({
            "rule": title,
            "penalty": float(penalty) if penalty else 0.0,
            "date": created.isoformat() if created else None,
        })
    return dict(agg)


def _net_balances(cursor, group_id: int):
    members = _active_members(cursor, group_id)
    member_ids = [m[0] for m in members]

    debts = defaultdict(float)
    cursor.execute(
        """
        SELECT e.id, e.payer_id
        FROM shared_expenses e
        WHERE e.group_id = %s
        """,
        (group_id,),
    )
    for expense_id, payer_id in cursor.fetchall():
        cursor.execute(
            """
            SELECT user_id, amount
            FROM expense_shares
            WHERE expense_id = %s AND status = 'pending'
            """,
            (expense_id,),
        )
        for share_user_id, amount in cursor.fetchall():
            if share_user_id != payer_id:
                debts[(share_user_id, payer_id)] += float(amount)

    cursor.execute(
        """
        SELECT payer_id, receiver_id, amount
        FROM expense_settlements
        WHERE group_id = %s
        """,
        (group_id,),
    )
    for payer_id, receiver_id, amount in cursor.fetchall():
        debts[(payer_id, receiver_id)] -= float(amount)

    cursor.execute(
        """
        SELECT v.user_id, v.penalty_amount, gm.user_id
        FROM rule_violations v
        JOIN group_members gm
          ON gm.group_id = v.group_id AND gm.role = 'admin' AND gm.status = 'active'
        WHERE v.group_id = %s AND v.penalty_amount > 0
        """,
        (group_id,),
    )
    for violator_id, penalty, admin_id in cursor.fetchall():
        if violator_id != admin_id:
            debts[(violator_id, admin_id)] += float(penalty)

    net = defaultdict(float)
    for (from_id, to_id), amount in debts.items():
        if amount > 0.004:
            net[from_id] -= amount
            net[to_id] += amount

    return {mid: round(net.get(mid, 0.0), 2) for mid in member_ids}


def _recent_settlements(cursor, group_id: int):
    cursor.execute(
        """
        SELECT payer_id, receiver_id, amount
        FROM expense_settlements
        WHERE group_id = %s
          AND settled_at >= %s
        """,
        (group_id, (local_today() - timedelta(days=60)).isoformat()),
    )
    return cursor.fetchall()


@router.get("/analysis")
def analyze_group(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            _require_active_member(cursor, group_id, user_id)

            info = _group_info(cursor, group_id)
            if not info:
                raise HTTPException(status_code=404, detail="Group not found")

            members = _active_members(cursor, group_id)
            names = {m[0]: m[1] for m in members}

            scores = {s["user_id"]: s for s in
                      [_get_member_score(cursor, group_id, m[0]) for m in members]}

            overdue_shares = _overdue_shares(cursor, group_id)
            overdue_chores = _overdue_chores(cursor, group_id)
            violations = _recent_violations(cursor, group_id)
            net = _net_balances(cursor, group_id)
            settlements = _recent_settlements(cursor, group_id)

            conflicts = []

            # Payment conflicts
            for uid, info_o in overdue_shares.items():
                conflicts.append({
                    "type": "payment",
                    "severity": "high" if info_o["amount"] >= HIGH_DEBT_THRESHOLD else "medium",
                    "member_ids": [uid],
                    "title": f"{names.get(uid, 'A member')} has unpaid shared expenses",
                    "detail": (
                        f"{info_o['count']} share(s) unpaid for over {PAYMENT_AGE_DAYS} days "
                        f"totalling ₹{info_o['amount']:.2f}."
                    ),
                    "suggestion": (
                        f"Reach out to {names.get(uid, 'them')} to confirm a date to settle. "
                        "Use the Balances tab to record the settlement once paid."
                    ),
                    "message": (
                        f"Hey {names.get(uid, 'there')}, just checking in on a couple of shared "
                        "expenses from last week that are still marked pending on my side. "
                        "Could we settle them by the weekend? Happy to chat if anything's unclear."
                    ),
                })

            # Chore conflicts
            for uid, chores in overdue_chores.items():
                count = len(chores)
                first = chores[0]
                conflicts.append({
                    "type": "chore",
                    "severity": "medium",
                    "member_ids": [uid],
                    "title": f"{names.get(uid, 'A member')} has {count} overdue chore(s)",
                    "detail": (
                        f"Including \"{first['title']}\" (due {first['due_date']}). "
                        "The rotation may be stuck."
                    ),
                    "suggestion": (
                        "Ask if they can complete it soon; otherwise reassign or mark it "
                        "as a recurring rotation in the Household tab."
                    ),
                    "message": (
                        f"Hey {names.get(uid, 'there')}, the chore \"{first['title']}\" is a few "
                        "days overdue — would it work to get it done in the next day or two? "
                        "Let me know if you want to swap."
                    ),
                })

            # Violation conflicts
            for uid, items in violations.items():
                total_penalty = sum(i["penalty"] for i in items)
                conflict = {
                    "type": "violation",
                    "severity": "high" if len(items) >= 2 or total_penalty >= 100 else "medium",
                    "member_ids": [uid],
                    "title": f"{names.get(uid, 'A member')} has {len(items)} recent violation(s)",
                    "detail": (
                        f"{len(items)} violation(s) in the last 90 days, "
                        f"totalling ₹{total_penalty:.2f} in penalties."
                    ),
                    "suggestion": (
                        "Have a calm group chat about the affected rule(s). Consider adjusting "
                        "the rule or penalty if it keeps getting broken."
                    ),
                    "message": (
                        f"Hey {names.get(uid, 'there')}, I noticed a couple of penalty flags came "
                        "up for our house rule recently. I don't want it to become a pattern — "
                        "is something making it hard to follow? Happy to talk it through."
                    ),
                }
                conflicts.append(conflict)

            # High debt conflicts
            for uid, balance in net.items():
                if balance <= -HIGH_DEBT_THRESHOLD:
                    conflicts.append({
                        "type": "debt",
                        "severity": "medium",
                        "member_ids": [uid],
                        "title": f"{names.get(uid, 'A member')} carries a large balance",
                        "detail": f"Their net balance is ₹{abs(balance):.2f} owed to the group.",
                        "suggestion": (
                            "Suggest a repayment plan in smaller chunks rather than one big "
                            "settlement to make it easier to clear."
                        ),
                        "message": (
                            f"Hey {names.get(uid, 'there')}, the group balances show you're "
                            f"currently at about ₹{abs(balance):.2f} owed. Want to break that "
                            "into smaller payments so it's easier to manage?"
                        ),
                    })

            # Order: high severity first
            sev_rank = {"high": 0, "medium": 1, "low": 2}
            conflicts.sort(key=lambda c: sev_rank[c["severity"]])

            # Rule suggestions from patterns
            suggestions = []
            if sum(len(v) for v in violations.values()) >= 2:
                suggestions.append({
                    "title": "Set a clear penalty reminder",
                    "detail": "Multiple violations were recorded this quarter. Re-confirm the "
                              "rule and penalty amounts so everyone knows the cost of breaking them.",
                })
            if overdue_shares:
                suggestions.append({
                    "title": "Agree on a payment deadline",
                    "detail": "Unpaid shares keep piling up. Consider agreeing that shared "
                              "expenses are settled within 7 days of creation.",
                })
            if not suggestions:
                suggestions.append({
                    "title": "Keep up the good pattern",
                    "detail": "No recurring conflict patterns detected. Consider adding a rule "
                              "that rewards consistent on-time behavior.",
                })

            # Highlights (positive signals)
            highlights = []
            if settlements:
                total = sum(float(s[2]) for s in settlements)
                highlights.append(f"₹{total:.2f} settled in the last 60 days across {len(settlements)} payment(s).")
            completed_chores = sum(
                min(s["chores_completed"], 1) for s in scores.values() if s["chores_completed"] > 0
            )
            if completed_chores:
                highlights.append(f"{completed_chores} member(s) completed chores in the last 30 days.")
            good_scores = [s for s in scores.values() if s["score"] >= 85]
            if good_scores:
                names_list = ", ".join(names[s["user_id"]] for s in good_scores)
                highlights.append(f"{names_list} maintain a strong reliability score (85+).")

            # Overall health
            total_penalties = sum(len(v) for v in violations.values())
            health = 100
            health -= 15 * min(len(overdue_shares), 5)
            health -= 10 * min(sum(len(c) for c in overdue_chores.values()), 5)
            health -= 15 * min(total_penalties, 5)
            health -= 5 * min(sum(1 for b in net.values() if b <= -HIGH_DEBT_THRESHOLD), 3)
            health = max(0, min(100, health))

            if health >= 85:
                summary = "Your group is in great shape. Keep up the healthy habits!"
                severity = "low"
            elif health >= 60:
                summary = "A few things need attention, but nothing that a quick group chat can't fix."
                severity = "medium"
            else:
                summary = "Several issues need resolving. Prioritize the flagged items below."
                severity = "high"

            return {
                "group_id": group_id,
                "group_name": info[1],
                "my_user_id": user_id,
                "overall": {
                    "health_score": health,
                    "severity": severity,
                    "summary": summary,
                    "counts": {
                        "overdue_shares": sum(v["count"] for v in overdue_shares.values()),
                        "overdue_chores": sum(len(v) for v in overdue_chores.values()),
                        "violations": total_penalties,
                        "high_debts": sum(1 for b in net.values() if b <= -HIGH_DEBT_THRESHOLD),
                    },
                },
                "conflicts": conflicts,
                "suggestions": suggestions,
                "highlights": highlights,
                "members": [
                    {
                        "user_id": m[0],
                        "name": m[1],
                        "score": scores[m[0]]["score"],
                        "net_balance": net.get(m[0], 0.0),
                    }
                    for m in members
                ],
            }

    finally:
        connection.close()