def calculate_match(profile1, profile2):
    score = 0
    total = 0

    # Exact preference matches
    exact_fields = [
        "sleep_schedule",
        "study_habits",
        "smoking_preference",
        "food_preferences",
        "social_preferences",
        "guest_preferences",
    ]

    for field in exact_fields:
        value1 = getattr(profile1, field, None)
        value2 = getattr(profile2, field, None)

        if value1 is not None and value2 is not None:
            total += 1

            if value1 == value2:
                score += 1

    # Cleanliness: closer values = better match
    cleanliness1 = getattr(profile1, "cleanliness", None)
    cleanliness2 = getattr(profile2, "cleanliness", None)

    if cleanliness1 is not None and cleanliness2 is not None:
        total += 1
        difference = abs(cleanliness1 - cleanliness2)

        if difference == 0:
            score += 1
        elif difference == 1:
            score += 0.75
        elif difference == 2:
            score += 0.5
        elif difference == 3:
            score += 0.25

    # Noise tolerance: closer values = better match
    noise1 = getattr(profile1, "noise_tolerance", None)
    noise2 = getattr(profile2, "noise_tolerance", None)

    if noise1 is not None and noise2 is not None:
        total += 1
        difference = abs(noise1 - noise2)

        if difference == 0:
            score += 1
        elif difference == 1:
            score += 0.75
        elif difference == 2:
            score += 0.5
        elif difference == 3:
            score += 0.25

    if total == 0:
        return 0

    return round((score / total) * 100)


def stable_match(preferences):
    """Gale-Shapley deferred-acceptance stable matching.

    `preferences` maps a user_id to an ordered list of preferred user_ids
    (best first). Returns the set of stable pairs and any unmatched users.
    """
    proposers = list(preferences.keys())
    acceptors = {uid for prefs in preferences.values() for uid in prefs}

    # For each proposer, index of next preference to propose to.
    next_proposal = {uid: 0 for uid in proposers}
    # Current engagement of each acceptor (who they've tentatively accepted).
    engaged = {}
    # Acceptor's rank of a given proposer (lower is better).
    acceptor_rank = {
        acc: {uid: idx for idx, uid in enumerate(prefs)}
        for acc, prefs in [(uid, preferences.get(uid, [])) for uid in acceptors]
    }

    free = [uid for uid in proposers if uid not in engaged.values()]

    while free:
        proposer = free.pop(0)
        prefs = preferences.get(proposer, [])
        if next_proposal[proposer] >= len(prefs):
            continue

        target = prefs[next_proposal[proposer]]
        next_proposal[proposer] += 1

        current = engaged.get(target)
        if current is None:
            engaged[target] = proposer
        else:
            # Does target prefer proposer over current?
            rank_new = acceptor_rank.get(target, {}).get(proposer, float("inf"))
            rank_old = acceptor_rank.get(target, {}).get(current, float("inf"))
            if rank_new < rank_old:
                engaged[target] = proposer
                free.append(current)
            else:
                free.append(proposer)

    pairs = [(proposer, acceptor) for acceptor, proposer in engaged.items()]

    # Mutual engagements may appear twice as (a, b) and (b, a).
    # Deduplicate into undirected pairs so each user appears exactly once.
    seen = set()
    unique_pairs = []
    for a, b in pairs:
        key = (min(a, b), max(a, b))
        if key in seen:
            continue
        seen.add(key)
        unique_pairs.append(key)

    matched = set()
    for a, b in unique_pairs:
        matched.add(a)
        matched.add(b)

    unmatched = [uid for uid in proposers if uid not in matched]

    return unique_pairs, unmatched


def find_blocking_pairs(preferences, pairs):
    """Find blocking pairs: two users who prefer each other over their
    current partners, and are not already paired together."""
    pairs_set = set()
    for a, b in pairs:
        pairs_set.add((a, b))
        pairs_set.add((b, a))

    # Partner lookup
    partner = {}
    for a, b in pairs:
        partner[a] = b
        partner[b] = a

    blocking = []
    for uid, prefs in preferences.items():
        current_partner = partner.get(uid)
        if current_partner is None:
            continue
        current_rank = prefs.index(current_partner) if current_partner in prefs else len(prefs)

        for preferred in prefs[:current_rank]:
            if preferred == current_partner:
                continue
            if (uid, preferred) in pairs_set:
                continue
            # Does preferred also prefer uid over their own partner?
            preferred_partner = partner.get(preferred)
            if preferred_partner is None:
                continue
            preferred_prefs = preferences.get(preferred, [])
            preferred_rank_of_uid = (
                preferred_prefs.index(uid) if uid in preferred_prefs else len(preferred_prefs)
            )
            preferred_rank_of_partner = (
                preferred_prefs.index(preferred_partner)
                if preferred_partner in preferred_prefs
                else len(preferred_prefs)
            )
            if preferred_rank_of_uid < preferred_rank_of_partner:
                blocking.append({
                    "user_a_id": uid,
                    "user_b_id": preferred,
                    "reason": (
                        f"{uid} prefers {preferred} over partner {current_partner}, "
                        f"and {preferred} prefers {uid} over partner {preferred_partner}"
                    ),
                })

    return blocking