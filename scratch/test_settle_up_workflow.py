import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, "backend")
from app.database import get_connection
from app.timeutils import local_today

conn = get_connection()
cur = conn.cursor()

try:
    print("Testing Settle Up backend workflow...")
    # Find 3 active users
    cur.execute("SELECT id, name FROM users ORDER BY id ASC LIMIT 3")
    users = cur.fetchall()
    assert len(users) >= 3, "Need at least 3 users"
    u1, u2, u3 = users[0], users[1], users[2]
    print(f"Users: {u1[1]} (ID {u1[0]}), {u2[1]} (ID {u2[0]}), {u3[1]} (ID {u3[0]})")

    import time
    code = f"TSET{int(time.time()) % 100000}"
    # Create test living group
    cur.execute(
        "INSERT INTO living_groups (name, invite_code, created_by, created_at) VALUES (%s, %s, %s, %s) RETURNING id",
        ("Test Settle Group", code, u1[0], local_today().isoformat()),
    )
    group_id = cur.fetchone()[0]

    for u, role in [(u1, "admin"), (u2, "member"), (u3, "member")]:
        cur.execute(
            "INSERT INTO group_members (group_id, user_id, role, status, joined_at) VALUES (%s, %s, %s, 'active', %s)",
            (group_id, u[0], role, local_today().isoformat()),
        )
    conn.commit()
    print(f"Created group {group_id}")

    # Expense 1: U1 pays 600 split among U1, U2, U3 (200 each)
    cur.execute(
        """
        INSERT INTO shared_expenses (group_id, payer_id, description, amount, split_count, status, created_at)
        VALUES (%s, %s, %s, %s, %s, 'pending', NOW()) RETURNING id
        """,
        (group_id, u1[0], "Groceries", 600.0, 3),
    )
    exp1_id = cur.fetchone()[0]
    for u in [u1, u2, u3]:
        cur.execute(
            """
            INSERT INTO expense_shares (expense_id, user_id, amount, status)
            VALUES (%s, %s, %s, %s)
            """,
            (exp1_id, u[0], 200.0, "paid" if u[0] == u1[0] else "pending"),
        )

    # Expense 2: U2 pays 300 split among U1, U2, U3 (100 each)
    cur.execute(
        """
        INSERT INTO shared_expenses (group_id, payer_id, description, amount, split_count, status, created_at)
        VALUES (%s, %s, %s, %s, %s, 'pending', NOW()) RETURNING id
        """,
        (group_id, u2[0], "Internet", 300.0, 3),
    )
    exp2_id = cur.fetchone()[0]
    for u in [u1, u2, u3]:
        cur.execute(
            """
            INSERT INTO expense_shares (expense_id, user_id, amount, status)
            VALUES (%s, %s, %s, %s)
            """,
            (exp2_id, u[0], 100.0, "paid" if u[0] == u2[0] else "pending"),
        )
    conn.commit()

    # Import router handlers to test
    from app.Routers.shared_expenses import (
        get_balances,
        report_settle_up_payment,
        confirm_settlement_receipt,
        reject_settlement_receipt,
        SettleUpReport,
        ConfirmSettlementReceipt,
        RejectSettlementReceipt,
        get_settlements,
    )

    # Check initial balances for U2
    bal_u2 = get_balances(group_id=group_id, user_id=u2[0])
    u2_owes = [o for o in bal_u2["owes"] if o["from_user_id"] == u2[0]]
    u2_owed_to = [o for o in bal_u2["owes"] if o["to_user_id"] == u2[0]]
    print("Initial U2 owes:", u2_owes)
    print("Initial U2 is owed by:", u2_owed_to)

    # U2 owes U1 200
    assert any(o["to_user_id"] == u1[0] and o["amount"] == 200.0 for o in u2_owes), "U2 must owe U1 200"

    # Step 1: U2 reports paying U1 200 via UPI
    rep_res = report_settle_up_payment(
        data=SettleUpReport(
            group_id=group_id,
            receiver_id=u1[0],
            amount=200.0,
            payment_reference="UPI-REF-998877",
            note="Paid via PhonePe",
        ),
        user_id=u2[0],
    )
    print("Report result:", rep_res)
    assert rep_res["updated_shares"] == 1, "Should update 1 share to reported"

    # Verify share is payment_reported
    cur.execute(
        "SELECT status, payment_reference FROM expense_shares WHERE expense_id = %s AND user_id = %s",
        (exp1_id, u2[0]),
    )
    sh = cur.fetchone()
    print("Share status after report:", sh)
    assert sh[0] == "payment_reported"
    assert sh[1] == "UPI-REF-998877"

    # Step 2: U1 confirms receipt of payment
    conf_res = confirm_settlement_receipt(
        data=ConfirmSettlementReceipt(group_id=group_id, payer_id=u2[0]),
        user_id=u1[0],
    )
    print("Confirm result:", conf_res)
    assert conf_res["amount"] == 200.0

    # Verify share is now paid
    cur.execute(
        "SELECT status FROM expense_shares WHERE expense_id = %s AND user_id = %s",
        (exp1_id, u2[0]),
    )
    sh_paid = cur.fetchone()[0]
    print("Share status after confirm:", sh_paid)
    assert sh_paid == "paid"

    # Check updated balances for U2
    bal_u2_after = get_balances(group_id=group_id, user_id=u2[0])
    u2_owes_after = [o for o in bal_u2_after["owes"] if o["from_user_id"] == u2[0]]
    print("U2 owes after settlement:", u2_owes_after)
    assert not any(o["to_user_id"] == u1[0] for o in u2_owes_after), "U2 should no longer owe U1!"

    # Check settlements history
    settles = get_settlements(group_id=group_id, user_id=u2[0])
    print("Settlements history:", settles["settlements"])
    assert len(settles["settlements"]) >= 1, "Settlement audit record must exist"
    assert settles["settlements"][0]["amount"] == 200.0

    # Step 3: Test rejection workflow
    # U1 owes U2 100 on exp2. U1 reports payment.
    report_settle_up_payment(
        data=SettleUpReport(
            group_id=group_id,
            receiver_id=u2[0],
            amount=100.0,
            payment_reference="WRONG-REF",
        ),
        user_id=u1[0],
    )
    cur.execute("SELECT status FROM expense_shares WHERE expense_id = %s AND user_id = %s", (exp2_id, u1[0]))
    assert cur.fetchone()[0] == "payment_reported"

    # U2 rejects it (not received)
    rej_res = reject_settlement_receipt(
        data=RejectSettlementReceipt(group_id=group_id, payer_id=u1[0]),
        user_id=u2[0],
    )
    print("Reject result:", rej_res)
    cur.execute("SELECT status FROM expense_shares WHERE expense_id = %s AND user_id = %s", (exp2_id, u1[0]))
    assert cur.fetchone()[0] == "pending", "Should reset back to pending"

    print("ALL BACKEND SETTLE UP TESTS PASSED PERFECTLY!")

finally:
    # Cleanup test group
    conn.rollback()
    if "group_id" in locals():
        cur.execute("DELETE FROM expense_settlements WHERE group_id = %s", (group_id,))
        cur.execute("DELETE FROM expense_shares WHERE expense_id IN (SELECT id FROM shared_expenses WHERE group_id = %s)", (group_id,))
        cur.execute("DELETE FROM shared_expenses WHERE group_id = %s", (group_id,))
        cur.execute("DELETE FROM group_members WHERE group_id = %s", (group_id,))
        cur.execute("DELETE FROM living_groups WHERE id = %s", (group_id,))
        conn.commit()
        print("Cleaned up test group")
    conn.close()
