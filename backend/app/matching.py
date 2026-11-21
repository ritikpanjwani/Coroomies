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
    """Return deterministic, mutually acceptable, one-to-one roommate pairs.

    Gale-Shapley is only valid for two disjoint populations.  CoRoomies has a
    single roommate population, so treating every member as both a proposer
    and an acceptor could put the same person in multiple pairs.  This helper
    instead forms an undirected candidate graph and greedily selects the best
    mutually ranked edge while never reusing a member.  It deliberately keeps
    the public function name for API compatibility.
    """
    user_ids = sorted(preferences)
    ranks = {
        uid: {candidate: index for index, candidate in enumerate(candidates)}
        for uid, candidates in preferences.items()
    }

    edges = []
    for user_id in user_ids:
        for candidate_id, my_rank in ranks[user_id].items():
            if candidate_id <= user_id or candidate_id not in ranks:
                continue
            candidate_rank = ranks[candidate_id].get(user_id)
            if candidate_rank is None:
                continue
            # Lower combined rank is better; IDs make ties deterministic.
            edges.append((my_rank + candidate_rank, max(my_rank, candidate_rank), user_id, candidate_id))

    matched = set()
    pairs = []
    for _combined_rank, _worst_rank, user_id, candidate_id in sorted(edges):
        if user_id in matched or candidate_id in matched:
            continue
        pairs.append((user_id, candidate_id))
        matched.update((user_id, candidate_id))

    return pairs, [uid for uid in user_ids if uid not in matched]


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


def is_gender_compatible(
    my_gender: str | None,
    my_pref: str | None,
    other_gender: str | None,
    other_pref: str | None,
) -> bool:
    """Check mutual gender compatibility between two users.

    Rules:
    - User A's preference dictates who User A is willing to live with:
        * 'unisex': accepts all genders ('male', 'female', 'prefer_not_to_say').
        * 'male': accepts only 'male'.
        * 'female': accepts only 'female'.
    - User B's preference dictates who User B is willing to live with similarly.
    - Mutual compatibility requires that User A accepts User B's gender AND User B accepts User A's gender.
    - If either user's gender or preference is not set (e.g. legacy/incomplete profile),
      they cannot be verified as mutually compatible.
    - Users with 'prefer_not_to_say' for gender can only be matched with users who selected 'unisex'.
    """
    if not my_gender or not my_pref or not other_gender or not other_pref:
        return False

    mg = my_gender.strip().lower()
    mp = my_pref.strip().lower()
    og = other_gender.strip().lower()
    op = other_pref.strip().lower()

    # Does 'my' preference accept 'other'?
    if mp == "unisex":
        my_accepts_other = True
    elif mp == "male":
        my_accepts_other = (og == "male")
    elif mp == "female":
        my_accepts_other = (og == "female")
    else:
        my_accepts_other = False

    # Does 'other' preference accept 'me'?
    if op == "unisex":
        other_accepts_me = True
    elif op == "male":
        other_accepts_me = (mg == "male")
    elif op == "female":
        other_accepts_me = (mg == "female")
    else:
        other_accepts_me = False

    return my_accepts_other and other_accepts_me


def is_age_compatible(
    candidate_age: int | None,
    min_age: int | None = None,
    max_age: int | None = None,
) -> bool:
    """Check if candidate age satisfies specified age limits.

    If candidate_age is None, they are excluded when an age filter is active.
    If no bounds are provided, candidate is accepted.
    """
    if min_age is None and max_age is None:
        return True
    if candidate_age is None:
        return False
    if min_age is not None and candidate_age < min_age:
        return False
    if max_age is not None and candidate_age > max_age:
        return False
    return True
