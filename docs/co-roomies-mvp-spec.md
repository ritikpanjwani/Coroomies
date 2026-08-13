# CoRoomies Corrected MVP Architecture

## 1. Final Product Definition

CoRoomies is a student-focused shared-living platform that helps students find accommodation and compatible roommates while also giving them tools to manage shared living.

The product is not hostel-owner software. The central relationship is:

```text
Student <-> Living Group <-> Other Students
```

and:

```text
Student <-> Housing Listing <-> Potential Living Group / Roommates
```

In simple words:

- A group of students living together can use CoRoomies to manage expenses, chores, rules, penalties, reliability, and group communication.
- A student looking for accommodation can use CoRoomies to find rooms, beds, PGs, flats, vacancies, and compatible roommates.
- A student can track their own daily personal spending separately from shared roommate expenses.
- An existing Living Group can publish a vacancy when a roommate leaves.

## 2. What Changed From the Previous Architecture

The earlier architecture incorrectly treated CoRoomies as a hostel or PG management system. That direction is now obsolete.

### Removed concepts

- Hostel Admin
- Hostel Owner
- PG Owner dashboard
- Hostel-level room assignment
- Hostel CRUD controlled by an external owner
- Admin dashboard for managing hostel residents
- Hostel ownership checks as a core authorization model

### Replaced with

- Student accounts
- Student profiles
- Lifestyle preferences
- Living Groups
- Group Admin as a member-level permission
- Housing listings created by users
- Vacancies created by groups or users
- Group-based expenses, chores, rules, penalties, communication, and reliability

The new architecture is more natural for the product because the people using the app every day are students, not property owners.

## 3. Core Modules

### Authentication and Student Profiles

Handles registration, login, authenticated sessions, student profile data, and lifestyle preferences.

Lifestyle preferences should include:

- Sleep schedule
- Cleanliness
- Noise tolerance
- Study habits
- Smoking preference
- Food preferences
- Social preferences
- Guest preferences

### Living Groups

A Living Group represents students sharing a living arrangement.

Examples:

- Five students sharing a rented flat.
- Four students sharing a PG room.
- Three students sharing an apartment.
- Students sharing a house.

The student who creates the group can initially become Group Admin.

Group Admin can manage only that specific group:

- Invite members
- Accept or reject join requests
- Remove members where appropriate
- Transfer Group Admin role
- Manage group settings
- Create chores
- Define group rules
- Configure chore consequences
- Manage group communication settings

### Group Communication

Each Living Group should have a simple group texting area. This is only for communication between group members.

This should not become a full social network in the MVP.

### Personal Daily Expense Tracker

Students should be able to record their everyday personal spending.

This feature answers:

```text
What am I spending my own money on?
```

Each personal expense entry should contain:

- Date
- Category
- Expense description or subcategory entered by the student
- Amount
- Optional note

Initial categories:

- Food
- Travel
- Documents
- Groceries
- Education
- Entertainment
- Health
- Shopping
- Bills
- Other

Examples of student-entered descriptions:

- Burger
- Shawarma
- Auto
- Local
- Metro
- Printout

Students can:

- Add daily expenses
- Edit personal expenses
- Delete personal expenses
- View today's spending
- View weekly spending
- View monthly spending
- See monthly total
- See category-wise totals
- Filter historical expenses by date, month, and category

This must stay lightweight. Do not add bank integration, automatic transaction detection, investments, advanced budgeting, or complex finance features.

Important separation:

- Personal Expenses answer: "What am I spending my own money on?"
- Shared Expenses answer: "What do roommates owe each other?"

Personal expenses belong directly to a student. They should not be mixed with shared expense participants, group balances, roommate debt settlement, penalties, or settlement records.

### Shared Expense Management

Students can:

- Create shared expenses
- Select who paid
- Select participants
- Split equally or unequally
- Set deadlines
- View balances
- Record settlements

Shared expenses belong to a Living Group.

### Smart Debt Settlement

The settlement algorithm should be independently testable.

Graph concept:

- Students are nodes.
- Expense obligations are weighted financial relationships.
- Net balance compresses all relationships into how much each student should receive or pay.

Algorithm outline:

1. Calculate total paid and total owed for each student.
2. Compute net balance: `paid - owed`.
3. Positive net balance means the student should receive money.
4. Negative net balance means the student should pay money.
5. Match debtors and creditors until all balances are settled.
6. Return simplified settlement transactions.

The algorithm can reduce transactions, but we should not claim global optimality unless the chosen algorithm mathematically guarantees it.

Complexity:

- Net balance calculation: `O(E * P)`, where `E` is expense count and `P` is participants per expense.
- Settlement using sorted creditors and debtors: usually `O(U log U)`, where `U` is user count.

Required unit tests:

- Zero balances
- One debtor
- Multiple debtors
- Multiple creditors
- Unequal shares
- Multiple expenses
- Rounding edge cases
- Already-settled records

### Chores

Students can:

- View assigned chores
- View upcoming chores
- Mark chores completed
- View chore history

Group Admin can:

- Create chores
- Assign chores
- Set deadlines
- Rotate chores
- Configure chore rules

The MVP should use a simple fair rotation before adding complex scheduling.

### Group Rules and Chore Consequences

Living Groups can define transparent rules.

Example:

```text
Rule: Missed chore
Consequence: Rs. 50 group penalty
Applies when: Chore deadline is missed
```

Important architecture rule:

CoRoomies does not invent punishments. It only applies rules defined by the group.

Each penalty should record:

- Applied rule
- Related chore, if any
- Affected member
- Amount, if monetary
- Reason
- Date

Monetary penalties can later become part of group balances and settlement.

### Living Reliability

Reliability should be based mainly on verifiable CoRoomies activity, not arbitrary public ratings.

Expense reliability can track:

- Payments made before deadline
- Payments made late
- Outstanding balances
- Settlement history

Chore reliability can track:

- Assigned chores
- Completed chores
- On-time completions
- Late completions
- Missed chores

Do not invent the final scoring formula yet. Before implementation, we should design a fair scoring model that is transparent, privacy-conscious, objective, and difficult to manipulate.

### Housing Finder

Students can search for:

- Flats
- PGs
- Rooms
- Beds
- Shared accommodation
- Vacancies

A listing can be created by a student or a Living Group. CoRoomies does not need the property owner to be a platform admin.

### Roommate Replacement

When a member leaves, a Living Group can create a vacancy.

Flow:

```text
Member leaves
-> Vacancy exists
-> Group publishes vacancy
-> Students discover it
-> Compatibility and reliability are reviewed
-> Student requests to join
-> Group accepts or rejects
```

This is part of the core product.

### Roommate Matching

Matching should support two use cases:

- Existing group needs a replacement.
- Student is looking for accommodation.

Stable matching can be used where the problem is modeled correctly. Gale-Shapley requires a clear two-sided setup.

Possible two sides:

- Side A: students looking for accommodation.
- Side B: vacancies or Living Groups looking for candidates.

Before implementation, we must define:

- What the two sides are.
- How student preferences become rankings.
- How group or vacancy preferences become rankings.
- What stability means.
- What happens when no acceptable match exists.

Stable matching does not prove personal compatibility. It only means there is no blocking pair according to the defined preference rankings.

Compatibility percentage may be shown in the UI as supporting information, but the matching algorithm should be based on rankings, not only a simple percentage.

### AI Conflict Assistant

The AI assistant can suggest:

- Respectful messages
- Practical compromises
- Quiet hours
- Shared-rule ideas
- When to involve the Group Admin

The AI is not an authority. It must not automatically punish, remove, blame, or decide serious disputes.

OpenAI API keys must stay in backend environment variables.

## 4. Final High-Level Architecture

```text
Frontend: React + Vite + Tailwind
        |
        v
Backend: FastAPI + Pydantic
        |
        v
Database: PostgreSQL
        |
        v
Services:
  - Authentication
  - Student Profiles
  - Living Groups
  - Group Communication
  - Personal Expenses
  - Expenses
  - Debt Settlement
  - Chores
  - Group Rules and Penalties
  - Reliability
  - Housing Listings and Vacancies
  - Roommate Matching
  - AI Conflict Assistant
```

Recommended backend layout:

```text
backend/
  app/
    main.py
    core/
      config.py
      security.py
    db/
      database.py
      models.py
    schemas/
      auth.py
      users.py
      profiles.py
      living_groups.py
      group_messages.py
      personal_expenses.py
      expenses.py
      settlements.py
      chores.py
      group_rules.py
      reliability.py
      housing.py
      matching.py
      conflict_assistant.py
    api/
      deps.py
      routes/
        auth.py
        users.py
        profiles.py
        living_groups.py
        group_messages.py
        personal_expenses.py
        expenses.py
        settlements.py
        chores.py
        group_rules.py
        reliability.py
        housing.py
        matching.py
        conflict_assistant.py
    services/
      expense_settlement.py
      personal_expense_summary.py
      chore_rotation.py
      penalty_application.py
      reliability_calculation.py
      roommate_matching.py
      conflict_assistant.py
    tests/
```

Recommended frontend routes:

```text
/login
/register
/profile
/preferences
/groups
/groups/:groupId
/groups/:groupId/chat
/personal-expenses
/groups/:groupId/expenses
/groups/:groupId/chores
/groups/:groupId/rules
/groups/:groupId/reliability
/housing
/housing/:listingId
/vacancies/:vacancyId
/matching
/conflict-assistant
```

## 5. Module Dependencies

```text
Auth
  -> Student Profiles
  -> Living Groups
  -> Housing Listings

Student Profiles
  -> Lifestyle Preferences
  -> Reliability
  -> Matching

Personal Expenses
  -> Authenticated User
  -> Personal Expense Summary

Living Groups
  -> Group Members
  -> Group Communication
  -> Expenses
  -> Chores
  -> Group Rules
  -> Vacancies

Shared Expenses
  -> Expense Participants
  -> Settlements
  -> Debt Settlement Service
  -> Reliability Records

Chores
  -> Chore Assignments
  -> Group Rules
  -> Penalties
  -> Reliability Records

Housing Listings
  -> Vacancies
  -> Matching
  -> Join Requests

Matching
  -> Lifestyle Preferences
  -> Vacancies
  -> Reliability Summary

AI Conflict Assistant
  -> Authenticated User
  -> Optional Living Group Context
```

## 6. Preliminary Database Entities

These are planning-level entities only. They should not all be created immediately.

### User

Represents a registered student account.

Relationships:

- Has one StudentProfile.
- Can belong to many LivingGroups through GroupMember.
- Can create HousingListings.
- Can create PersonalExpenses.
- Can create Shared Expenses.
- Can send GroupMessages.

### StudentProfile

Stores personal student profile information.

Relationships:

- Belongs to one User.
- Has one LifestylePreference.
- Has many ReliabilityRecords.

### LifestylePreference

Stores structured roommate preference data.

Relationships:

- Belongs to one User or StudentProfile.
- Used by matching service.

### LivingGroup

Represents a shared-living group.

Relationships:

- Has many GroupMembers.
- Has many Expenses.
- Has many Chores.
- Has many GroupRules.
- Has many GroupMessages.
- Can have many Vacancies.

### GroupMember

Join entity between User and LivingGroup.

Possible fields:

- Role: `admin` or `member`
- Status: `invited`, `active`, `left`, `removed`
- Joined date

### GroupMessage

Represents a simple message inside one Living Group.

Relationships:

- Belongs to LivingGroup.
- Belongs to sender User.

### PersonalExpense

Represents one student's private daily spending entry.

Suggested fields:

- Date
- Category
- Description
- Amount
- Optional note

Relationships:

- Belongs to User.

Important:

- Does not belong to LivingGroup.
- Does not create ExpenseParticipants.
- Does not affect roommate balances.
- Does not affect debt settlement.
- Does not affect Living Reliability unless a future approved requirement explicitly says so.

### Expense

Represents a shared group expense.

Naming note:

In code, this may later be named `SharedExpense` to keep it clearly separate from `PersonalExpense`.

Relationships:

- Belongs to LivingGroup.
- Created by User.
- Paid by User.
- Has many ExpenseParticipants.
- Can have many Settlement records indirectly.

### ExpenseParticipant

Represents each participant's share in an expense.

Relationships:

- Belongs to Expense.
- Belongs to User.

### Settlement

Represents a recorded payment from one member to another.

Relationships:

- Belongs to LivingGroup.
- Has payer User.
- Has receiver User.

### Chore

Represents a recurring or one-time group chore.

Relationships:

- Belongs to LivingGroup.
- Has many ChoreAssignments.

### ChoreAssignment

Represents a chore assigned to a specific member for a specific date or period.

Relationships:

- Belongs to Chore.
- Assigned to User.
- Can produce ReliabilityRecord.
- Can trigger Penalty when missed.

### GroupRule

Represents a group-defined rule.

Relationships:

- Belongs to LivingGroup.
- Can be referenced by Penalty.

### Penalty

Represents a transparent consequence applied from a group rule.

Relationships:

- Belongs to LivingGroup.
- Belongs to GroupRule.
- Applies to User.
- May relate to ChoreAssignment.
- May affect balances if monetary.

### ReliabilityRecord

Represents objective activity used for reliability.

Relationships:

- Belongs to User.
- May relate to Expense, Settlement, ChoreAssignment, or Penalty.

### HousingListing

Represents a flat, PG, room, bed, or shared accommodation listing.

Relationships:

- Created by User.
- May be linked to LivingGroup.
- Can have many Vacancies.

### Vacancy

Represents an available room, bed, or spot in a Living Group.

Relationships:

- May belong to HousingListing.
- May belong to LivingGroup.
- Can have many JoinRequests or candidates.

### JoinRequest

Represents a student's request to join a Living Group or vacancy.

Relationships:

- Belongs to User.
- Belongs to Vacancy or LivingGroup.
- Reviewed by Group Admin.

### RoommateMatch

Represents a proposed match between student and vacancy, group, or another student.

Relationships:

- References candidate User.
- References Vacancy or LivingGroup.
- Uses LifestylePreference inputs.
- May include ranking metadata and compatibility summary.

### AIInteraction

Represents optional logged AI assistant interaction metadata.

Important:

- Storing full conflict text should be a later privacy decision.
- MVP can avoid storing raw AI conversations.

## 7. Preliminary API Structure

No routes should be implemented yet. This is the proposed shape.

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

### Profiles and Preferences

- `GET /profiles/me`
- `PATCH /profiles/me`
- `GET /preferences/me`
- `PUT /preferences/me`

### Personal Expenses

- `POST /personal-expenses`
- `GET /personal-expenses`
- `GET /personal-expenses/today`
- `GET /personal-expenses/summary`
- `PATCH /personal-expenses/{expense_id}`
- `DELETE /personal-expenses/{expense_id}`

### Living Groups

- `POST /groups`
- `GET /groups`
- `GET /groups/{group_id}`
- `PATCH /groups/{group_id}`
- `POST /groups/{group_id}/invite`
- `POST /groups/{group_id}/join-requests`
- `PATCH /groups/{group_id}/members/{member_id}`

### Group Communication

- `GET /groups/{group_id}/messages`
- `POST /groups/{group_id}/messages`

### Shared Expenses and Settlements

- `POST /groups/{group_id}/expenses`
- `GET /groups/{group_id}/expenses`
- `GET /groups/{group_id}/balances`
- `GET /groups/{group_id}/settlement-suggestions`
- `POST /groups/{group_id}/settlements`

### Chores, Rules, and Penalties

- `POST /groups/{group_id}/chores`
- `GET /groups/{group_id}/chores`
- `POST /groups/{group_id}/chores/assignments`
- `PATCH /groups/{group_id}/chores/assignments/{assignment_id}`
- `POST /groups/{group_id}/rules`
- `GET /groups/{group_id}/rules`
- `GET /groups/{group_id}/penalties`

### Reliability

- `GET /profiles/{user_id}/reliability-summary`
- `GET /groups/{group_id}/reliability`

Privacy note:

Public reliability should show summary metrics, not detailed private financial history.

### Housing and Vacancies

- `POST /housing/listings`
- `GET /housing/listings`
- `GET /housing/listings/{listing_id}`
- `POST /groups/{group_id}/vacancies`
- `GET /vacancies`
- `GET /vacancies/{vacancy_id}`
- `POST /vacancies/{vacancy_id}/join-requests`

### Matching

- `GET /matching/recommendations`
- `POST /matching/run-for-vacancy/{vacancy_id}`
- `GET /matching/results`

### AI Conflict Assistant

- `POST /conflict-assistant/suggest`

## 8. Updated Development Phases

### Phase 1: Foundation and Architecture

- React
- Vite
- Tailwind CSS
- FastAPI
- PostgreSQL
- Git/GitHub
- Project structure
- Environment variable examples

### Phase 2: Authentication and Student Profiles

- Registration
- Login
- Authentication
- Student profile
- Lifestyle preferences

### Phase 3: Living Groups

- Create group
- Join group
- Invitations
- Group membership
- Group Admin
- Group settings
- Basic group communication

### Phase 4: Chores and Group Rules

- Chores
- Assignments
- Rotation
- Completion
- Group rules
- Missed chores
- Consequences or penalties
- Reliability records

### Phase 5: Personal and Shared Expense Management

- Personal daily expenses
- Personal expense categories
- Daily, weekly, and monthly summaries
- Category-wise personal totals
- Shared expenses
- Participants
- Balances
- Deadlines
- Settlement records

### Phase 6: Smart Debt Settlement

- Net balances
- Graph-based settlement
- Transaction reduction
- Unit tests

### Phase 7: Housing and Roommate Matching

- Housing listings
- Vacancies
- Flats, PGs, rooms, beds
- Candidate discovery
- Lifestyle preferences
- Stable matching
- Roommate replacement
- Reliability information

### Phase 8: AI, Quality, and Deployment

- AI conflict assistant
- Testing
- Security
- Error handling
- Docker
- Documentation
- Deployment

## 9. Remaining Architecture Decisions

These need approval before implementation:

1. Should students join groups using invite links, invite codes, or manual approval only?
2. Can one student belong to multiple active Living Groups, or only one active group at a time?
3. Should HousingListing and Vacancy be separate entities in MVP, or should Vacancy be a simplified listing type first?
4. Should group chat messages be persisted permanently, or should the MVP keep only recent messages?
5. Should penalties automatically become expense entries, or should Group Admin review them before adding to balances?
6. What exact reliability scoring model is fair enough for MVP?
7. Should roommate matching initially match students to vacancies, students to groups, or students to students?
8. Should AI conflict assistant history be stored, or should requests be temporary and private by default?
9. Should groups support unequal expense splits from day one, or start with equal splits and add unequal splits immediately after?
10. Should the first implementation prioritize Living Groups first or profile plus housing search first?

## 10. Recommended Approval Scope

For the first coding milestone, approve only:

- Phase 1: project foundation.
- Phase 2: authentication, student profiles, and lifestyle preferences.
- The corrected student-first architecture.

This gives the project a clean base before building Living Groups, expenses, housing, matching, and AI.
