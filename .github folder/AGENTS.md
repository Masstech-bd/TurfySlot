# Turfyslot --- Multi-Vendor Turf Booking Platform

## ⚠️ SCOPE RULE FOR AI TOOLS (READ THIS FIRST, EVERY SESSION)

**Do NOT add features, fields, tables, or endpoints that are not
explicitly listed in this spec** — even if they seem obviously useful,
common in similar apps, or "better." This applies to Google AI Studio,
Claude Code, or any other AI coding tool working on this project.

- If you (the AI) think a feature is missing or needed, **ASK FIRST —
  do not implement it silently.**
- Any new feature must be proposed, discussed, and then added as a
  **new numbered Section** in this file before any code for it is
  written. A feature that exists only in code and not in this document
  does not belong in this project.
- This includes small-seeming additions: extra booking options, extra
  notification types, extra admin toggles, "nice to have" UX
  conveniences, etc. Small additions accumulate into scope creep and
  make the system harder to secure, test, and reason about.
- When in doubt about whether something is in scope, treat it as
  **out of scope** and ask.

## ⚠️ NON-REGRESSION RULE FOR AI TOOLS (READ THIS FIRST, EVERY SESSION)

**Implementing a new feature or phase must never break a feature or
phase that was already working.** This is as important as the Scope
Rule above — a system that gains a new feature but silently loses an
old one is not progress.

- Before starting any phase (Section 48), **re-verify the "Done when"
  criteria of every previously completed phase still passes.** Do not
  assume old code still works just because you didn't touch that file.
- If a change to shared code (auth middleware, pricing calculation,
  the booking flow, the cancellation policy engine, etc.) is required
  to build the new feature, **explicitly check every existing feature
  that depends on that shared code** before considering the work done.
  For example: touching `bookings` table logic for Booking Add-ons
  (Section 51) must not silently break plain bookings with no add-ons,
  manual bookings (Section 7.4), or the cancellation policy engine
  (Section 47).
- If you (the AI) discover that a new feature's implementation
  *requires* changing existing, working logic in a way that risks
  breaking it, **stop and flag this explicitly** rather than making
  the change silently. Describe what would need to change and why,
  and wait for confirmation.
- Never "fix" a regression by weakening a rule elsewhere in this spec
  (e.g. removing a validation check because it was inconvenient for
  the new feature). If a genuine conflict exists between this spec and
  a new feature's needs, that is a spec problem to resolve explicitly
  — not something to code around silently.
- A feature flag (Section 52.3) being OFF must never be an excuse to
  skip testing that the rest of the system works correctly with it
  off — this is the default state every real user sees at launch.

## Table of Contents

- Section 1. Project Overview
- Section 2. Tech Stack
- Section 3. Design Principles
- Section 4. User Roles
- Section 5. Authentication & Account Lifecycle
- Section 6. Player Functionality
- Section 7. Turf Owner Functionality
- Section 8. Staff Functionality (scoped, non-financial)
- Section 9. System Admin Functionality
- Section 10. Booking, Cancellation & Refund Logic
- Section 11. Wallet & Withdrawal System
- Section 12. Security Requirements
- Section 13. Database Schema (initial draft)
- Section 14. API Structure (REST convention)
- Section 15. Conventions
- Section 16. Non-Functional Requirements
- Section 17. Current Status
- Section 18. Product Completeness & Role-Based Functional Specification
- Section 19. Turf Owner --- Expanded Functional Specification
- Section 20. Staff --- Expanded Functional Specification
- Section 21. System Admin --- Expanded Functional Specification
- Section 22. Booking Management --- Complete State Machine
- Section 23. Cancellation, Refund & Dispute Center
- Section 24. Wallet & Financial Ledger Enhancement
- Section 25. Reporting & Analytics
- Section 26. Notification Center
- Section 27. Search, Filters & Discovery
- Section 28. Reviews & Reputation
- Section 29. Audit & Administrative Controls
- Section 30. Domain Events & Messaging
- Section 31. API Expansion
- Section 32. UX / Dashboard Navigation
- Section 33. MVP Priority
- Section 34. Critical Business Rules
- Section 35. Definition of Done --- Role Functionality
- Section 36. Implementation Guidance for Google AI Studio
- Section 37. Performance & Scaling Guidelines
- Section 38. Testing Strategy & Coverage
- Section 39. Security Headers & Configuration
- Section 40. System Architecture Diagram
- Section 41. Deployment & Operations
- Section 42. Environment Variables
- Section 43. Glossary of Terms
- Section 44. User Journey Maps
- Section 45. Admin Action Workflows
- Section 46. CI/CD Pipeline
- Section 47. Flexible Cancellation Policy Engine
- Section 48. Phase-Wise Build Roadmap (Node.js / Express Stack)
- Section 49. Player Squad / Matchmaking (Phase 2 — not MVP)
- Section 50. Tournament (Simple Version — Phase 2, not MVP)
- Section 51. Booking Add-ons (Phase 2 — not MVP)
- Section 52. Feature Flags & Paid Features Listing (Phase 2 — not MVP)
- Section 53. Home Page Discovery & Listing Logic (Phase 2 — not MVP)

---

## 1. Project Overview

A multi-vendor marketplace platform where independent turf (sports
ground) owners list and manage their turfs, and players discover, check
availability, and book time slots online with secure payment. The
platform owner (System Admin) operates the entire system and earns a
commission on every booking.

This is a **marketplace model**, similar in structure to platforms like
Airbnb or Uber Eats: three-sided (Admin / Vendor / Customer) with an
internal wallet and commission system, plus a Staff role for turf-owner
delegation.

---------------------------------------------------------------------
### 1.1 System Architecture, Infrastructure Independence, Security, and Scalability

This project is being developed using Google AI Studio as the development environment only. Google AI Studio must not become a runtime, hosting, database, or infrastructure dependency of the final production system.

The application architecture must be designed from the beginning to ensure that the source code, database, configuration, credentials, APIs, and business logic remain completely independent of Google AI Studio.

#### 1.1.1 Development Environment

During the development phase, Google AI Studio will be used as a development and coding environment. The development environment may securely connect to the project's PostgreSQL database hosted on the designated server infrastructure when required.

Google AI Studio is strictly considered a development tool and must not be treated as part of the application's production architecture.

#### 1.1.2 Production Infrastructure

The production application will be deployed on a VPS server running Coolify as the primary deployment and infrastructure management platform.

PostgreSQL will be deployed and managed within the Coolify environment.

The intended production architecture is:

VPS → Coolify → Application Services + PostgreSQL Database

All production services, application components, databases, environment variables, and supporting services must operate independently within this infrastructure.

#### 1.1.3 Migration from Development to Production

The source code may remain within the Google AI Studio development environment during the active development phase.

Once development, testing, security validation, and final acceptance are completed, the complete application source code and required configuration will be migrated to the production VPS and deployed through Coolify.

After deployment, the application must operate normally without requiring:

- Google AI Studio
- Google AI Studio runtime services
- Google AI Studio APIs
- Google AI Studio-specific dependencies
- Google AI Studio for application execution or database operation

The final production environment must therefore be fully self-hosted and infrastructure-independent from Google AI Studio.

#### 1.1.4 Security as a Primary Requirement

Security must be treated as a fundamental architectural requirement throughout the entire development lifecycle.

The following principles must be strictly followed:

- No passwords, API keys, database credentials, or private secrets may be hard-coded into the source code.
- Sensitive configuration must be managed through secure environment variables or an appropriate secrets-management mechanism.
- Database credentials must never be exposed to the frontend.
- Private API keys must never be included in frontend JavaScript, HTML, React code, browser requests, or publicly accessible files.
- Sensitive communication must use HTTPS/TLS.
- Authentication credentials must be securely hashed using industry-standard password hashing mechanisms.
- Sensitive secrets that must be persisted must be encrypted using strong, industry-standard encryption.
- Encryption keys must be managed separately from encrypted data and must never be stored alongside the encrypted values.
- Database access must follow the principle of least privilege.
- The frontend must communicate with protected backend APIs rather than directly accessing privileged database resources.
- Production database ports and administrative services must not be unnecessarily exposed to the public Internet.
- Application errors and logs must not disclose passwords, API keys, database credentials, tokens, or other sensitive information.
#### 1.1.5 API and Credential Protection

All privileged APIs and third-party integrations must be implemented through the backend/server-side layer.

The frontend application must never receive or expose private API credentials.

Where API credentials or sensitive integration credentials need to be stored in the database, they must be stored in an encrypted form.

The system architecture must ensure that a user inspecting browser developer tools, frontend source code, network requests, or publicly accessible application files cannot retrieve private API keys, database credentials, encryption keys, or other privileged secrets.

#### 1.1.6 Scalability and Maintainability

Scalability must be considered from the beginning rather than introduced after deployment.

The architecture should maintain a clear separation between:

- Frontend
- Backend/API
- Business logic
- Database
- Authentication and authorization
- External API integrations
- Background/queue processing where required
- Configuration and secrets
- Logging and monitoring

The application should be designed so that individual components can be scaled, replaced, or upgraded without requiring a fundamental redesign of the entire system.

#### 1.1.7 Final Architectural Principle

The most important architectural principle is:

Google AI Studio is a development tool, not a production dependency.

The completed application must be capable of being deployed, operated, maintained, backed up, secured, and scaled entirely within the project's own production infrastructure using the VPS, Coolify, PostgreSQL, and the application's own backend and frontend services.

The final system must remain operational even if Google AI Studio is completely unavailable or removed from the development workflow.

Security, scalability, maintainability, portability, and infrastructure independence must remain first-class architectural priorities throughout every phase of development.


## 2. Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript v5.8+ (both frontend and backend) |
| Frontend framework | React 19 + React DOM |
| Build tool | Vite 6 |
| Styling | Tailwind CSS v4 |
| Icons | Lucide React |
| Animation | Motion (motion/react) |
| Data fetching/cache | TanStack Query (React Query) |
| Client state | Zustand |
| Forms & validation | React Hook Form + Zod (schema shared with backend where practical) |
| Routing | React Router v7 |
| Date handling | date-fns |
| Backend | Node.js + Express (TypeScript) |
| Database | PostgreSQL |
| Cache / Queue | Redis + BullMQ — used for slot-lock TTLs, rate limiting, and background jobs (booking-reminder scheduling, expired-lock cleanup, async email/SMS sending) |
| File storage | Local disk on the VPS (served via Nginx/Express static route). No object-storage service (e.g. MinIO/S3) for MVP — the VPS has enough disk. Must have a scheduled backup script (cron) for the uploads directory. |
| Email | Self-hosted Postal SMTP server |
| SMS / OTP | bulksmsbd.co |
| Push notifications | Web Push API (VAPID keys, via the `web-push` npm package) |
| Maps | OpenStreetMap + Leaflet (free, no API key/billing account required) |
| WhatsApp | Not included in MVP — not free per message, requires a BSP. Revisit post-launch. |
| Hosting | Coolify (self-hosted), deploying via Docker |
| Payments (online) | SSLCommerz (Bangladesh payment gateway) — carries a ~2.5% gateway fee, passed through in the price breakdown (Section 10.2) |
| Payments (manual/offline) | Cash, bKash, Nagad, Rocket, or bank transfer — used only for owner/staff-created manual bookings (Section 7.4 / 47.13). **No payment gateway fee** applies since SSLCommerz is not used for these bookings. |
| Auth | JWT (access + refresh token pattern) |

## 3. Design Principles

-   **Mobile-first, fully responsive** --- most players will book from
    mobile.
-   **Modern, minimal UI** --- no clutter, no unnecessary steps. Booking
    a slot should take a player 3 taps or fewer from the turf page.
-   **No complex UI patterns** --- avoid multi-step wizards where a
    single form will do. Favor clarity over "feature density."
-   **Security-first backend** --- this platform moves real money
    (bookings, withdrawals). Treat every input as hostile until
    validated. See Section 12.

------------------------------------------------------------------------

## 4. User Roles

The platform has **four roles**, stored on the `users` table via a
`role` enum. A single email can only hold one role.

  -----------------------------------------------------------------------
  Role                   Description
  ---------------------- ------------------------------------------------
  `player`               End customer who books turf slots. Default role
                         on public signup.

  `turf_owner`           Vendor who lists and manages one or more turfs.
                         Requires admin approval before going live.

  `staff`                Created by a turf owner, scoped to specific
                         turf(s). Limited operational permissions --- no
                         financial access.

  `admin`                Platform owner. Full control over the system.
                         Only one or a small number of trusted accounts;
                         not self-registerable.
  -----------------------------------------------------------------------

### 4.1 Role hierarchy & scoping

-   A `turf_owner` account can create multiple `staff` accounts, and
    assign each staff member to one or more specific turfs they own.
-   A `staff` account can only ever see/act on data for the turf(s)
    they're assigned to --- enforce this at the query level (never trust
    the frontend to hide unauthorized data).
-   `admin` has global visibility and override capability everywhere.

------------------------------------------------------------------------

## 5. Authentication & Account Lifecycle

### 5.1 Registration flows

-   **Player**: public signup form (name, email, phone, password). Email
    or phone OTP verification before first booking is allowed.
-   **Turf Owner**: public signup form + business details (business
    name, NID/trade license number placeholder for future KYC, contact
    info, bank or mobile wallet details for payouts). Account status
    starts as `pending_approval` --- **cannot list turfs or receive
    bookings until an Admin approves the account.**
-   **Staff**: NOT self-registered. Created only by a `turf_owner` from
    their dashboard (name, email, phone, temp password emailed, assigned
    turf(s)).
-   **Admin**: NOT self-registered, ever. Seeded directly in the
    database or created by an existing admin from an internal-only
    screen.

### 5.2 Auth mechanics

-   Passwords hashed with bcrypt (cost factor ≥ 12), never stored/logged
    in plaintext.
-   JWT access token (short-lived, \~15 min) + refresh token
    (long-lived, httpOnly secure cookie, \~7--30 days), refresh token
    rotation on use.
-   Rate-limit login attempts per IP + per account (e.g. 5 attempts / 15
    min) to prevent brute force.
-   Password reset via emailed time-limited token (single use, expires
    in 15--30 minutes).
-   Every protected API route validates the JWT AND re-checks the user's
    current role/status from the database (don't fully trust token
    claims for sensitive actions --- a suspended account's old token
    should stop working).

### 5.3 Account statuses

`active`, `pending_approval` (turf owners awaiting admin review),
`suspended` (frozen by admin --- cannot log in or transact),
`deactivated` (self- or admin-closed).

------------------------------------------------------------------------

## 6. Player Functionality

1.  **Browse & search turfs** --- filter by location/area, sport type,
    price range, rating.
2.  **Turf detail page** --- photos, description, amenities, location
    (map), pricing (may vary by day/time --- see Section 8),
    reviews/rating.
3.  **Check real-time availability** --- calendar/date picker showing
    open vs booked slots for a selected turf and date.
4.  **Book a slot (multi-hour support)** --- select date + a **start
    time** + a **duration** (1, 2, 3, 5 hours, etc. --- not restricted to
    a single 1-hour slot). The system:
    - Shows the maximum contiguous duration actually available starting
      from that start time (if another booking blocks hour 3, the
      player can only select up to 2 hours from that start time, or
      pick a different start time).
    - Internally reserves however many consecutive 1-hour `slots` rows
      the chosen duration requires, linked via `booking_slots`
      (Section 13) --- this must happen atomically (Section 10.1): all
      required slots lock together, or none do.
    - Shows a price breakdown = `base_price_per_hour × total_hours` +
      platform fee shown transparently, calculated **server-side**
      → pay via SSLCommerz → booking confirmed on successful payment.
5.  **Booking history** --- upcoming and past bookings, statuses
    (`pending_payment`, `confirmed`, `completed`, `cancelled`,
    `refunded`).
6.  **Cancel a booking** --- subject to the cancellation policy (Section
    10).
7.  **Leave a review/rating** --- only after a booking's `end_time` has
    passed and status is `completed`.
8.  **Notifications** --- booking confirmation, reminder before slot
    time, cancellation/refund confirmation (email at minimum; SMS
    optional future add-on).

------------------------------------------------------------------------

## 7. Turf Owner Functionality

1.  **Onboarding** --- submit turf details after account approval:
    -   Turf name, address, geolocation (lat/lng for map + "near me"
        search)
    -   Sport type(s) supported (football, cricket, futsal, badminton,
        etc.)
    -   Photos (multiple)
    -   Amenities (parking, floodlights, washroom, etc.)
    -   Base pricing, with optional day-of-week / peak-hour pricing
        overrides
    -   Operating hours (open/close time per day)
    -   Payout method (bank account or mobile wallet ---
        bKash/Nagad/Rocket)
2.  **Turf approval** --- a newly submitted turf starts as
    `pending_review` and is not publicly visible/bookable until an Admin
    approves it. This protects players from fake or low-quality
    listings.
3.  **Slot management** --- define slot duration/granularity
    (e.g. 1-hour blocks), block out specific slots manually
    (maintenance, private use), view a calendar of all bookings for
    their turf(s).
4.  **Staff management** --- invite/create staff accounts, assign to
    specific turf(s), revoke access, set granular permissions if needed
    (e.g. "can view bookings" vs "can also block/unblock slots").
5.  **Earnings dashboard** --- view gross booking revenue, platform
    commission deducted, net payable balance (wallet), historical payout
    records.
6.  **Withdrawal requests** --- request payout of available wallet
    balance (see Section 9). Cannot withdraw funds still held for
    bookings within the cancellation window (see Section 10).
7.  **Booking management** --- view upcoming/past bookings for their
    turf(s), see player contact info for confirmed bookings, cannot see
    other turf owners' data.
8.  **Cancel a booking (owner-initiated)** --- e.g. turf becomes
    unavailable due to an emergency. Must trigger a full refund to the
    player and flag the incident for admin visibility (repeated
    owner-cancellations should be trackable --- reputational/quality
    signal).


### 7.4 Manual / Offline Booking

An owner (or a staff member with the right permission) can create a
booking directly from the dashboard when a customer books:

- By phone
- At the turf counter
- In person
- Through another offline channel

**Manual Booking Features:**
- No payment gateway fee (SSLCommerz is not used for manual bookings)
- Platform fee (default 5%, admin-configurable) still applies
- Same cancellation policy engine applies (Section 47) — resolved via
  Turf Policy -> Owner Policy -> Default Policy, exactly like online
  bookings
- Full audit trail (who created it, when, and what was recorded)

**Manual Booking Payment Options:**

| Method | Gateway Fee | Platform Fee | Notes |
|---|---|---|---|
| Cash | 0 TK | 5% (default) | In-person payment |
| bKash / Nagad / Rocket | 0 TK | 5% (default) | Manual transfer, reference number recorded |
| Bank Transfer | 0 TK | 5% (default) | Offline transfer, reference number recorded |

**Manual Booking Restrictions:**
- No SSLCommerz integration — no automatic payment confirmation
- Owner/staff manually marks payment as received (paid / pending / partial)
- Owner is responsible for actually collecting payment from the customer
- Must reserve the slot exactly like an online booking (no double-booking)
- Must record customer name and phone even without a platform account
  (player_id nullable; customer_name / customer_phone stored instead)
- booking_source must always be tracked as one of: online, manual_owner,
  manual_staff, admin
- Must appear in the same calendar/booking list as online bookings
- Owner/staff must never alter a confirmed booking's monetary amounts
  directly outside the defined pricing/policy logic

See Section 10.2 for the fee comparison between online and manual
bookings, and Section 47.13 for how the cancellation policy engine
resolves refunds on a manual booking.

------------------------------------------------------------------------

## 8. Staff Functionality (scoped, non-financial)

Staff accounts exist so a turf owner can delegate day-to-day operations
without exposing financial data or account settings.

-   View bookings for their assigned turf(s) only.
-   Check in players on arrival (mark booking as `checked_in` /
    `completed`).
-   Block/unblock specific slots (e.g. turf temporarily unusable), if
    the owner has granted this permission.
-   **Cannot**: view earnings/wallet balance, request withdrawals, edit
    turf pricing or details, create other staff accounts, view financial
    reports.

------------------------------------------------------------------------

## 9. System Admin Functionality

The Admin is the platform owner and has full operational control.

1.  **User management** --- view/search all users across roles, suspend
    or reactivate any account, manually verify/approve turf owner
    accounts.
2.  **Turf approval queue** --- review and approve/reject newly
    submitted turfs before they go live.
3.  **Commission configuration** --- set the platform's commission
    percentage per booking. Should be configurable globally, with the
    option to override per turf owner (e.g. a promotional lower rate for
    a new partner) --- store as a `commission_rate` field, defaulting to
    the global platform setting if not overridden.
4.  **Booking oversight** --- view all bookings platform-wide, with
    filters (turf, owner, player, date range, status). Ability to
    manually intervene (force-cancel, force-refund) in disputes.
5.  **Withdrawal approval** --- every turf-owner withdrawal request must
    be reviewed and approved by admin before funds are actually
    transferred (manual payout initially --- via bank/mobile wallet ---
    is fine for MVP; full automation can come later). Admin sees pending
    requests queue.
6.  **Refund/dispute handling** --- override or manually process refunds
    outside the standard automated cancellation-window logic when a
    player or owner raises a dispute.
7.  **Revenue reporting** --- platform-wide commission earned, breakdown
    by turf/owner/time period.
8.  **Platform settings** --- cancellation window hours, refund
    percentage tiers, minimum withdrawal amount, supported sports list,
    etc. --- should be admin-configurable, not hardcoded, wherever
    reasonable.

------------------------------------------------------------------------

## 10. Booking, Cancellation & Refund Logic

### 10.1 Booking flow (multi-hour / multi-slot)

A booking may span **one or more consecutive 1-hour slots** (Section 6,
item 4) — the flow below must handle N slots atomically, not just one.

1.  Player selects a turf, date, start time, and duration (e.g. 3 hours).
    The backend computes exactly which consecutive `slots` rows this
    requires (e.g. 14:00–15:00, 15:00–16:00, 16:00–17:00).
2.  The backend checks that **all** of the required slots are currently
    `available` — if even one of them is not, the whole request is
    rejected with a clear "not enough consecutive availability" error;
    it must never partially book a duration.
3.  If all required slots are available, the system:
    - Creates one `bookings` row with status `pending_payment`, storing
      `start_time`, `end_time`, and `total_hours` for the whole block.
    - Creates one `booking_slots` row per required slot, linking them to
      this booking.
    - **Locks all of the required slots together, in a single
      transaction** (short TTL, e.g. 10 minutes) so no other player can
      grab any of them individually while payment is pending. Use a
      single Redis multi/transaction (or a Postgres transaction with row
      locks) — never lock slots one-by-one in a loop without atomicity,
      since that can leave a booking holding only some of its slots if a
      concurrent request wins one of them mid-loop.
4.  Player is redirected to SSLCommerz to pay for the **total** amount
    (`base_price_per_hour × total_hours` + fees).
5.  On successful payment (via SSLCommerz IPN/webhook — never trust the
    client-side redirect alone), the booking status becomes `confirmed`
    and **every** linked slot in `booking_slots` is marked `booked`.
6.  If payment fails or the 10-minute lock expires unpaid, **all**
    linked slots are released back to `available` together, and the
    booking is marked `expired`.

### 10.1.1 Explicit Non-Feature: No Non-Consecutive Multi-Range Bookings

A single booking covers **only consecutive** 1-hour slots (e.g. 1, 2, 3,
5 hours back-to-back). It does **not** support bundling
non-consecutive time ranges into one booking — e.g. "7–8 AM and
separately 8–9 PM" on the same turf in a single transaction.

If a player wants two separate time ranges on the same day, that is
**two separate bookings** (two separate payments/transactions). This is
a deliberate scope decision, not an oversight — do not build a
"multi-range cart" checkout flow. If this is ever needed, it must be
proposed as a new numbered section (see the Scope Rule at the top of
this file) before any implementation begins.

### 10.2 Pricing & Fee Structure

| Fee Type | Online Booking | Manual Booking |
|---|---|---|
| **Turf Price** | Set by owner | Set by owner |
| **Platform Fee** | 5–10% of turf price (admin-configurable) | Same rate applies |
| **Payment Gateway Fee** | ~2.5% of total (SSLCommerz) | 0 TK — no gateway used |
| **Total Payable** | Turf Price + Platform Fee + Gateway Fee | Turf Price + Platform Fee |

**Worked example (turf price 1,000 TK, platform fee 5%, gateway fee 2.5%):**

| Item | Online Booking | Manual Booking |
|---|---|---|
| Turf Price | 1,000 TK | 1,000 TK |
| Platform Fee (5%) | 50 TK | 50 TK |
| Gateway Fee (2.5%) | 25 TK | 0 TK |
| **Total Payable** | **1,075 TK** | **1,050 TK** |

The gateway fee only exists because SSLCommerz charges it on card/mobile-wallet
transactions it processes. Manual bookings skip SSLCommerz entirely, so
there is nothing to charge a gateway fee on — the customer simply pays the
turf price plus the platform fee directly to the owner (or via a manual
bKash/Nagad/Rocket/bank transfer).

> **Note (Booking Add-ons):** the example above is for a booking with
> no add-ons. When a player selects optional add-ons (Section 51),
> platform fee and gateway fee are calculated on `(turf price +
> add-on total)`, not turf price alone. See Section 51.5 for the
> add-on-adjusted worked example and formula.

### 10.3 Cancellation Policy & Refund Calculation Matrix

> **Multi-hour bookings:** all figures below apply to the booking's
> **total amount** (`base_price_per_hour × total_hours`, i.e. summed
> across every linked `booking_slots` row), not a single slot's price.
> A 3-hour booking cancelled at the ">24h" tier refunds 100% of the full
> 3-hour amount, not one hour's worth.

Base policy tiers (the actual policy used is resolved through the
Flexible Cancellation Policy Engine — see Section 47 — but this is the
system default / fallback):

-   Cancelled **more than 24 hours** before slot start -> **100%
    refund**.
-   Cancelled **6–24 hours** before slot start -> **50% refund**.
-   Cancelled **less than 6 hours** before slot start -> **no refund**.
-   Owner-initiated cancellation (any time) -> always **100% refund** to
    player, regardless of the above tiers.

**Important rule: the payment gateway fee is never refundable.** SSLCommerz
does not return its processing fee on a refund, whether the player or the
owner initiated the cancellation. Only a platform-side system error
justifies the platform absorbing that cost itself.

#### Online Booking Refund Matrix (turf price 1,000 TK, platform fee 50 TK, gateway fee 25 TK)

| Scenario | Player Refund | Admin Keeps (Platform Fee) | Gateway Fee |
|---|---|---|---|
| Player cancels (>24h) | 1,000 TK | 50 TK | 25 TK (kept by SSLCommerz) |
| Player cancels (6–24h) | 500 TK | 50 TK | 25 TK (kept by SSLCommerz) |
| Player cancels (<6h) | 0 TK | 50 TK | 25 TK (kept by SSLCommerz) |
| Owner cancels | 1,025 TK | 0 TK | 25 TK (kept by SSLCommerz) |

#### Manual Booking Refund Matrix (same example, no gateway involved)

| Scenario | Player Refund | Admin Keeps (Platform Fee) | Gateway Fee |
|---|---|---|---|
| Player cancels (>24h) | 950 TK | 50 TK | 0 TK |
| Player cancels (6–24h) | 475 TK | 50 TK | 0 TK |
| Player cancels (<6h) | 0 TK | 50 TK | 0 TK |
| Owner cancels | 1,000 TK | 0 TK | 0 TK |

**Key differences for manual bookings:**
- No gateway fee exists to deduct in the first place.
- A player's refund on a manual booking is calculated as
  `turf_price_portion_by_tier - platform_fee` rather than
  `turf_price_portion_by_tier` alone, because there was no separate
  gateway-fee line item collected up front — the platform fee is the only
  fee, and it is non-refundable on a player-initiated cancellation.
- Owner cancellation always returns the full amount actually collected
  (turf price + platform fee for manual; turf price + platform fee, minus
  the non-refundable gateway fee, for online).

> **Note (Booking Add-ons):** the tables above are for a booking with no
> add-ons. The tier logic itself does NOT change for add-ons — the
> policy engine (Section 47) already resolves refunds against the
> booking's full total amount. See Section 51.6 for the add-on-adjusted
> worked example.

### 10.4 Refund processing

-   Refunds are initiated through SSLCommerz's refund API where
    supported (online bookings only); otherwise queued for manual admin
    processing. Manual bookings never call SSLCommerz — a "refund" there
    simply means recording that cash/bKash/bank money was returned to the
    customer.
-   A refund updates booking status to `refunded` (or
    `partially_refunded`) and logs the amount, reason, gateway-fee
    handling, and who triggered it (system/player/owner/admin) in a
    `refunds` table for auditability.

### 10.5 Commission timing

-   Platform commission is calculated and recorded **at the time of
    booking confirmation** (not at payout time), so the turf owner's
    wallet only ever reflects their net earning.
-   If a booking is later refunded, reverse the commission entry too
    (don't let the platform keep commission on a refunded booking) —
    except for the platform-fee portion the policy explicitly allows the
    platform to keep on a player-initiated cancellation (see Section
    10.3's matrices).

## 11. Wallet & Withdrawal System

-   Each `turf_owner` has a derived **wallet balance** = sum of net
    earnings from `completed`/`confirmed` bookings minus
    already-withdrawn amounts minus any amounts still held during a
    booking's active cancellation window (don't let an owner withdraw
    money for a booking that could still be fully refunded to the
    player).
-   **Withdrawal request flow**:
    1.  Owner requests withdrawal of an amount ≤ available balance.
    2.  Request enters `pending` status, visible in Admin's queue.
    3.  Admin reviews and marks `approved` (triggers manual
        bank/mobile-wallet transfer outside the app for MVP) or
        `rejected` (with a reason).
    4.  On approval, deduct the amount from the owner's available
        balance and log it in a `withdrawals` table (amount, method,
        reference, timestamps, approving admin).
-   Enforce a **minimum withdrawal amount** (admin-configurable) to
    avoid excessive small payout overhead.

------------------------------------------------------------------------

## 12. Security Requirements

-   **All monetary calculations happen server-side.** Never trust a
    price or commission value sent from the frontend.
-   **SSLCommerz IPN validation**: verify the transaction with
    SSLCommerz's validation API server-to-server before marking any
    booking as paid --- never mark a booking paid based solely on the
    browser being redirected back to a "success" URL.
-   **Role-based access control (RBAC)** enforced at the API/middleware
    layer for every route, not just hidden in the UI.
-   **Input validation & sanitization** on every endpoint (use a schema
    validator like Zod or Joi) --- protect against SQL injection (use
    parameterized queries / an ORM, never raw string concatenation),
    XSS, and mass-assignment vulnerabilities.
-   **Rate limiting** on auth endpoints and payment-initiation
    endpoints.
-   **HTTPS everywhere** (enforced via Coolify + reverse proxy / SSL
    cert).
-   **Secrets management** --- SSLCommerz store ID/password, JWT
    secrets, DB credentials all via environment variables, never
    committed to git.
-   **Audit logging** for sensitive actions: admin approvals/rejections,
    withdrawal approvals, manual refunds, account suspensions --- who
    did what, when.
-   **File upload validation** for turf photos (type/size limits, stored
    via object storage or a controlled uploads directory, never executed
    as code).

------------------------------------------------------------------------

## 13. Database Schema (initial draft)

```sql users id, name, email (unique), phone, password_hash, role
(player/turf_owner/staff/admin), status, created_at, updated_at

turf_owner_profiles id, user_id (FK -> users), business_name,
payout_method, payout_details (json), approval_status, approved_by,
approved_at

turfs id, owner_id (FK -> users), name, description, address, latitude,
longitude, sport_types (array), amenities (array), base_price_per_hour,
operating_hours (json), status (pending_review/active/inactive),
commission_rate_override, created_at

turf_photos id, turf_id (FK), url, sort_order

turf_pricing_rules -- optional peak/off-peak overrides id, turf_id (FK),
day_of_week, start_time, end_time, price_per_hour

staff_assignments id, staff_user_id (FK -> users), turf_id (FK ->
turfs), permissions (json), assigned_by, created_at

slots id, turf_id (FK), date, start_time, end_time, status
(available/locked/booked/blocked), locked_until

bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES users(id),  -- nullable for manual/guest bookings
  turf_id UUID NOT NULL REFERENCES turfs(id),
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,          -- overall start of the booked block
  end_time TIME NOT NULL,            -- overall end of the booked block
  total_hours DECIMAL(4,2) NOT NULL, -- e.g. 1.0, 2.0, 3.0, 5.0 — sum of the slots in booking_slots
  booking_source VARCHAR(50) DEFAULT 'online' CHECK (booking_source IN ('online', 'manual_owner', 'manual_staff', 'admin')),
  status VARCHAR(50) DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'confirmed', 'completed', 'cancelled', 'expired', 'refunded', 'partially_refunded')),
  base_amount DECIMAL(10,2) NOT NULL,       -- base_price_per_hour * total_hours (server-calculated, never trust client)
  addon_total DECIMAL(10,2) DEFAULT 0,      -- sum of booking_addons.total_price for this booking, see Section 51
  commission_amount DECIMAL(10,2) NOT NULL,
  platform_fee_amount DECIMAL(10,2) NOT NULL,  -- calculated on (base_amount + addon_total), see Section 51.5
  has_gateway_fee BOOLEAN DEFAULT TRUE,
  gateway_fee_amount DECIMAL(10,2) DEFAULT 0,  -- calculated on (base_amount + addon_total), see Section 51.5
  net_owner_amount DECIMAL(10,2) NOT NULL,
  cancellation_policy_id UUID REFERENCES cancellation_policies(id),  -- resolved policy used, see Section 47
  cancellation_reason TEXT,
  cancelled_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Junction table: a booking spans one OR MORE consecutive 1-hour slots.
-- A 1-hour booking has exactly one row here; a 5-hour booking has five.
-- The UNIQUE(slot_id) constraint is what actually prevents double-booking
-- at the database level, on top of the Redis-based temporary lock.
booking_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  slot_id UUID NOT NULL REFERENCES slots(id),
  UNIQUE(slot_id)
);

manual_bookings id, booking_id (FK -> bookings), customer_name,
customer_phone, customer_email, payment_method
('cash'/'bkash'/'nagad'/'rocket'/'bank_transfer'),
payment_status ('paid'/'pending'/'partial'), payment_reference,
payment_amount, created_by (FK -> users, the owner/staff who created it),
notes, created_at, updated_at

-- Table: Add-on definitions (owner-created, per turf). Full detail in Section 51.
turf_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id UUID NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL CHECK (category IN ('equipment', 'service', 'food', 'other')),
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  stock_quantity INTEGER,                        -- NULL = unlimited
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table: Add-ons selected during a booking (immutable line items, snapshotted).
booking_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  addon_id UUID NOT NULL REFERENCES turf_addons(id),
  addon_name_snapshot VARCHAR(100) NOT NULL,     -- name at booking time
  addon_price_snapshot DECIMAL(10,2) NOT NULL,   -- price at booking time
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  total_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table: Add-on stock movement log (only meaningful for stock-limited add-ons).
turf_addon_inventory_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_id UUID NOT NULL REFERENCES turf_addons(id),
  change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('decrement', 'increment', 'adjustment')),
  quantity_change INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL,
  booking_id UUID REFERENCES bookings(id),
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

payments id, booking_id (FK), gateway ("sslcommerz"), transaction_id,
amount, status (initiated/success/failed), gateway_response (json),
created_at

refunds id, booking_id (FK), amount, turf_price_refunded,
platform_fee_refunded, gateway_fee_refunded (always 0 for manual
bookings; the SSLCommerz gateway fee itself is never refunded either way
— see Section 10.3/47.13), booking_source, reason, initiated_by
(system/player/owner/admin), status (pending/completed/failed),
gateway_refund_ref, created_at

wallets -- or compute on the fly from bookings + withdrawals; -- a
materialized balance column is fine for performance id, owner_id (FK ->
users), available_balance, updated_at

withdrawals id, owner_id (FK -> users), amount, status
(pending/approved/rejected/paid), method, reference, reviewed_by (FK ->
users, admin), reviewed_at, created_at

reviews id, booking_id (FK), player_id (FK), turf_id (FK), rating (1-5),
comment, created_at

platform_settings key, value (json) -- commission_rate, cancellation
tiers, -- min_withdrawal_amount, etc.

audit_logs id, actor_id (FK -> users), action, target_type, target_id,
metadata (json), created_at 13.1 Database Schema Relationships erDiagram
users \|\|--o{ turf_owner_profiles : has users \|\|--o{ turfs : owns
users \|\|--o{ bookings : makes users \|\|--o{ staff_assignments :
assigned_to users \|\|--o{ notifications : receives users \|\|--o{
audit_logs : performs

    turfs ||--o{ turf_photos : has
    turfs ||--o{ turf_pricing_rules : has
    turfs ||--o{ slots : generates
    turfs ||--o{ bookings : contains
    turfs ||--o{ reviews : receives
    turfs ||--o{ favorites : saved_by

    bookings ||--|| payments : has
    bookings ||--o{ refunds : may_have
    bookings ||--o{ reviews : generates
    bookings ||--o{ booking_status_history : tracked_by
    bookings ||--o{ disputes : may_have

    users ||--o{ withdrawals : requests
    users ||--o{ wallet_transactions : has

    staff_assignments }o--|| turfs : scoped_to
    staff_assignments }o--|| users : staff_user

### 13.2 Critical Database Indexes

```sql
-- Performance-critical indexes
CREATE INDEX idx_slots_turf_date_status ON slots(turf_id, date, status);
CREATE INDEX idx_bookings_player_status ON bookings(player_id, status);
CREATE INDEX idx_bookings_turf_status ON bookings(turf_id, status);
CREATE INDEX idx_bookings_slot_date ON bookings(slot_id, created_at);
CREATE INDEX idx_payments_booking_status ON payments(booking_id, status);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, read_at);
CREATE INDEX idx_wallet_transactions_owner ON wallet_transactions(owner_id, created_at);
CREATE INDEX idx_audit_logs_actor_action ON audit_logs(actor_id, action);

-- Policy & Manual Booking Indexes
CREATE INDEX idx_policy_tiers_policy ON cancellation_policy_tiers(policy_id, sort_order);
CREATE INDEX idx_turf_policy_turf ON turf_cancellation_policies(turf_id);
CREATE INDEX idx_owner_policy_owner ON owner_cancellation_policies(owner_id);
CREATE INDEX idx_policy_audit_policy ON cancellation_policy_audit_logs(policy_id, created_at);
CREATE INDEX idx_bookings_policy ON bookings(cancellation_policy_id);
CREATE INDEX idx_bookings_source ON bookings(booking_source);
CREATE INDEX idx_refunds_source ON refunds(booking_source);
CREATE INDEX idx_manual_bookings_booking ON manual_bookings(booking_id);
CREATE INDEX idx_manual_bookings_customer ON manual_bookings(customer_phone);

-- Booking Add-on Indexes (Section 51)
CREATE INDEX idx_turf_addons_turf ON turf_addons(turf_id, is_active);
CREATE INDEX idx_booking_addons_booking ON booking_addons(booking_id);
CREATE INDEX idx_booking_addons_addon ON booking_addons(addon_id);
CREATE INDEX idx_addon_inventory_addon ON turf_addon_inventory_log(addon_id, created_at);

-- Soft delete support
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE turfs ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE bookings ADD COLUMN deleted_at TIMESTAMP;

-- Optimistic locking for concurrency
ALTER TABLE slots ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE bookings ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE wallets ADD COLUMN version INTEGER DEFAULT 1;
```

### 13.3 Recommended Database Extensions

The existing schema is a strong MVP foundation. The following additions are recommended:

```sql
favorites id, player_id, turf_id, created_at

notifications id, user_id, type, title, message, data, read_at,
created_at

wallet_transactions id, owner_id, booking_id, withdrawal_id, type,
amount, balance_after, reference, created_at

disputes id, booking_id, raised_by, category, description, status,
resolution, resolved_by, resolved_at, created_at

booking_status_history id, booking_id, old_status, new_status,
changed_by, reason, created_at

-- manual_bookings is NOT listed here — its full definition already
-- lives in the main Section 13 schema block above, alongside `bookings`.

staff_permissions id, staff_user_id, permission_key, enabled

turf_closures id, turf_id, date, start_time, end_time, reason,
created_by, recurrence_pattern JSONB

owner_cancellation_events id, owner_id, turf_id, booking_id, reason,
created_at

-- Full cancellation-policy engine tables (cancellation_policies,
-- cancellation_policy_tiers, turf_cancellation_policies,
-- owner_cancellation_policies, cancellation_policy_audit_logs) are
-- defined in full SQL in Section 47.4.
```

---

## 14. API Structure (REST convention)

 text
/api/auth/register/player /api/auth/register/turf-owner /api/auth/login
/api/auth/refresh /api/auth/logout

/api/turfs GET (public search/list) /api/turfs/:id GET (public detail)
/api/turfs/:id/availability GET (public, by date)

/api/owner/turfs CRUD (turf_owner only, scoped to self) /api/owner/staff
CRUD (turf_owner only) /api/owner/wallet GET /api/owner/withdrawals POST
(request), GET (history)

/api/owner/turfs/:turfId/addons POST (create), GET (list), PATCH
(update by :id), DELETE (delete by :id) --- owner manages their own
turf's add-ons, see Section 51
/api/turfs/:turfId/addons GET (public, active-and-in-stock only, see
Section 51.8)

/api/staff/bookings GET (scoped to assigned turfs)
/api/staff/slots/:id/block PATCH

/api/player/bookings POST (create --- request body now accepts an
optional `addons` array, see Section 51.8) GET (history)
/api/player/bookings/:id/cancel POST /api/player/reviews POST

/api/payments/sslcommerz/init POST /api/payments/sslcommerz/ipn POST
(server-to-server webhook)

/api/admin/users GET, PATCH (suspend/reactivate)
/api/admin/turfs/pending GET /api/admin/turfs/:id/approve PATCH
/api/admin/withdrawals GET, PATCH (approve/reject) /api/admin/refunds
POST (manual override) /api/admin/settings GET, PATCH
/api/admin/reports/revenue GET 14.1 API Standards & Conventions Request
Headers All authenticated endpoints require:

http Authorization: Bearer `<jwt_access_token>` X-Request-ID:
`<uuid-v4>` Accept: application/json Content-Type:
application/json Response Structure (Standard) Success Response (2xx)

json { "success": true, "data": { // Resource or collection }, "meta": {
"requestId": "req_abc123", "timestamp": "2026-09-08T10:30:00Z",
"version": "1.0.0" } } Paginated Success Response

json { "success": true, "data": { "items": [...], "pagination": {
"page": 1, "limit": 20, "total": 150, "totalPages": 8, "next":
"/api/bookings?page=2", "prev": null } }, "meta": { "requestId":
"req_abc123", "timestamp": "2026-09-08T10:30:00Z" } } Error Response
(4xx, 5xx)

json { "success": false, "error": { "code": "BOOKING_SLOT_UNAVAILABLE",
"message": "This slot has been booked by another user", "details": {
"slotId": "slot_123", "alternativeSlots": ["slot_124", "slot_125"] },
"requestId": "req_abc123", "timestamp": "2026-09-08T10:30:00Z" } } HTTP
Status Codes Code Meaning When to Use 200 OK Successful GET, PATCH, POST
requests 201 Created Successful resource creation 202 Accepted Async
processing started 204 No Content Successful DELETE 400 Bad Request
Validation errors, malformed request 401 Unauthorized Missing/invalid
JWT token 403 Forbidden Valid token but insufficient permissions 404 Not
Found Resource doesn't exist 409 Conflict Concurrent modification 422
Unprocessable Entity Business rule violation 429 Too Many Requests Rate
limit exceeded 500 Internal Server Error Unexpected server error 503
Service Unavailable DB/Redis connection issues Rate Limiting Headers All
responses include rate limit headers:

http X-RateLimit-Limit: 100 X-RateLimit-Remaining: 45 X-RateLimit-Reset:
1631234567 X-Retry-After: 3600 

---

## 15. Conventions

 Environment variables for
all config/secrets --- never hardcode.

Every schema change goes through a migration file, never manual ALTER
TABLE in production.

Backend validates everything the frontend also validates --- frontend
validation is UX only, not a security boundary.

Consistent API response shape, e.g.:

json { "success": true, "data": { ... } } { "success": false, "error": {
"code": "...", "message": "..." } } Use UTC in the database; convert to
local time (Asia/Dhaka) only at the presentation layer.



---

## 16. Non-Functional Requirements

 Mobile responsive --- test primary flows
    (search → book → pay) on a 360px-wide viewport, not just desktop.

Performance --- availability/search queries must stay fast as turf and
booking volume grows; index slots on (turf_id, date) and bookings on
(turf_id, status).

Reliability --- payment webhook handling must be idempotent (SSLCommerz
or network issues may cause duplicate IPN calls --- don't double-confirm
or double-credit a booking).



---

## 17. Current Status

<!-- Update this checklist as the project progresses -->
- [ ] Database schema created & migrated
- [ ] Auth system (all 4 roles) working
- [ ] Turf owner onboarding + admin approval flow
- [ ] Turf listing + public search/availability
- [ ] Booking + slot locking logic
- [ ] SSLCommerz payment integration (init + IPN validation)
- [ ] Cancellation + refund logic (default tiers)
- [ ] Flexible Cancellation Policy Engine (Section 47) — CRUD, hierarchy resolution, simulator
- [ ] Manual/offline booking entry (Section 7.4 / 47.13)
- [ ] Wallet + withdrawal request flow
- [ ] Admin dashboard (approvals, withdrawals, reports)
- [ ] Staff role + scoped permissions
- [ ] Reviews/ratings
- [ ] Mobile responsive QA pass
- [ ] Security review pass (RBAC, input validation, rate limiting)
- [ ] Deployed to Coolify
- [ ] Player Squad / Matchmaking (Section 49) — Phase 2, not MVP
- [ ] Tournament (Section 50) — Phase 2, not MVP
- [ ] Booking Add-ons (Section 51) — Phase 2, not MVP
- [ ] Feature Flags (Section 52.3) — Phase 2, not MVP
- [ ] Platform Credits (Section 52.8) — Phase 2, not MVP
- [ ] Featured Turf Listing (Section 52.5) — Phase 2, not MVP
- [ ] Home Page Discovery & Listing Logic (Section 53) — Phase 2, not MVP


---

## 18. Product Completeness & Role-Based Functional Specification

 This
    section enriches the MVP specification with the operational
    functionality required to run TurfHub as a real multi-vendor turf
    marketplace. The existing core rules remain unchanged unless
    explicitly extended below.

18.1 Role Capability Matrix Capability Admin Turf Owner Staff Player
Browse public turfs Yes Yes Yes Yes Create player account No No No Yes
Register turf owner No Yes No No Create/manage own turfs All Own only
Assigned only No Approve turf owners Yes No No No Approve turfs Yes No
No No Manage operating hours Yes Own No No Manage pricing Yes Own No No
View bookings All Own turfs Assigned turfs Own only Create
manual/offline booking Yes Yes Optional permission No Block/unblock
slots Yes Yes Optional permission No Check-in players Yes Yes Yes No
Mark booking completed Yes Yes Yes No Cancel booking Yes Own
bookings/turfs Optional permission Own bookings Process refund Yes No
direct financial authority No Eligible cancellation request View
wallet/earnings Yes Own No No Request withdrawal No Yes No No Approve
withdrawal Yes No No No Manage staff Yes Own staff No No View financial
reports Global Own turfs No Payment history only Manage platform
settings Yes No No No Manage commission Yes No No No Manage disputes Yes
Raise/report Raise/report Raise/report Manage reviews Moderate all View
own turf reviews View assigned turf reviews Create own reviews Suspend
accounts Yes Cannot suspend users No No Audit logs Yes Own relevant
activity Own activity Own activity/history 18.2 Player --- Expanded
Functional Specification Account & Profile Register with name, email,
phone and password.

Verify email or phone before the first booking.

Login/logout.

Forgot/reset password.

Edit profile.

Change password.

Manage notification preferences.

Deactivate own account where permitted.

Turf Discovery Search by location/area.

Filter by sport type.

Filter by price.

Filter by rating.

Filter by availability/date.

Sort by price, rating, distance or popularity.

View turf photos, amenities, operating hours and location.

View map location.

Save/remove favorite turfs.

Booking Select date.

Select available slot.

See live price before payment.

See base price, platform fee and total payable amount separately.

Temporarily lock selected slot during payment.

Pay through SSLCommerz.

Receive booking confirmation after verified server-side payment.

View booking reference number.

Download/view booking receipt.

View booking QR/code for check-in.

My Bookings Statuses: pending_payment, confirmed, checked_in, completed,
cancelled, expired, refunded, partially_refunded

Player can:

View upcoming bookings.

View past bookings.

View booking details.

Cancel eligible bookings.

Request dispute/help.

View refund status.

Re-book a previously used turf/slot where available.

Reviews Review only eligible completed bookings.

Rating 1--5.

Written comment.

Prevent duplicate review for the same booking.

Admin moderation support.

Owner can respond to reviews if this feature is enabled later.

Notifications Player notifications should cover:

Payment success/failure.

Booking confirmed.

Booking reminder.

Booking cancelled.

Refund initiated/completed.

Owner cancellation.

Dispute status update.

Important platform announcements.



---

## 19. Turf Owner --- Expanded Functional Specification

 19.1 Owner
    Dashboard Show:

Total active turfs.

Today's bookings.

Upcoming bookings.

Today's gross revenue.

Current available balance.

Pending/held balance (with breakdown: "Held for Booking #1234 until
2026-09-10 14:00").

Platform commission.

Net earnings.

Pending withdrawal requests.

Recent transactions.

Cancellation statistics.

Occupancy/utilization rate.

19.2 Turf Management Owner can:

Create turf.

Edit turf.

Upload multiple photos.

Reorder photos.

Delete photos.

Set turf description.

Set address and map coordinates.

Set sport types.

Configure amenities.

Configure operating hours.

Set base hourly price.

Create peak/off-peak pricing rules.

Temporarily deactivate turf.

Request permanent removal.

View turf approval status.

Turf lifecycle: draft -> pending_review -> active -> inactive ->
suspended

Only active turfs are publicly bookable.

19.3 Availability & Slot Management Owner can:

Generate slots from operating hours.

Configure slot duration.

View daily/weekly calendar.

Block individual slots.

Unblock slots.

Block a date.

Mark maintenance periods.

Set recurring unavailable periods.

See booking conflicts before blocking.

See which staff member performed a block/unblock action.

A blocked slot must never be shown as bookable to players.

19.4 Manual / Offline Booking This is an important marketplace operation
feature.

Owner can create a manual booking when a customer books:

By phone.

At the turf counter.

In person.

Through another offline channel.

Manual booking must:

Reserve the slot.

Record customer name and phone where available.

Record booking source as offline/manual.

Not falsely create an online SSLCommerz payment.

Allow owner/staff to record payment status separately.

Appear in the same calendar as online bookings.

Recommended booking source values: online, manual_owner, manual_staff,
admin.

19.5 Booking Operations Owner can:

View all bookings for own turfs.

Search by booking ID/player/phone.

Filter by date/status/turf.

View player contact information for confirmed bookings.

Check booking details.

Cancel owner-initiated bookings.

Trigger the defined full refund workflow.

Mark arrival/check-in.

Mark booking completed.

View cancellation reason.

View refund status.

Owner must never be able to alter a confirmed booking's monetary amounts
directly.



---

## 20. Staff --- Expanded Functional Specification

 Staff is an operational
    role, not a financial role.

20.1 Staff Dashboard Today's assigned turf bookings.

Upcoming bookings.

Check-in queue.

Blocked slots.

Basic operational notifications.

No wallet/revenue information.

20.2 Granular Permissions Recommended permissions:

text bookings.view bookings.view_player_contact bookings.check_in
bookings.complete bookings.cancel bookings.create_manual slots.view
slots.block slots.unblock Owner decides which permissions each staff
account receives.

20.3 Staff Restrictions Staff must not:

View owner wallet.

View owner earnings.

Request withdrawal.

Approve withdrawal.

Change turf price.

Change commission.

Edit owner payout details.

Create another staff account.

Change owner account settings.

Access another owner's turf.

Access unrelated bookings.

All staff actions should be attributable to the staff user's account
through audit logging.



---

## 21. System Admin --- Expanded Functional Specification

 21.1 Admin
    Dashboard Global dashboard should show:

Total players.

Total turf owners.

Total staff.

Total turfs.

Active turfs.

Pending owner approvals.

Pending turf approvals.

Today's bookings.

Total confirmed bookings.

Cancelled bookings.

Refunds.

Gross booking value.

Platform commission.

Owner payable amount.

Pending withdrawals.

Completed withdrawals.

Disputes awaiting action.

Include date-range filters:

Today

Yesterday

Last 7 days

Last 30 days

This month

Custom range

21.2 User Management Admin can:

Search all users.

Filter by role/status.

View profile.

View account history.

Suspend account.

Reactivate account.

Deactivate account.

View related bookings.

View relevant audit events.

Suspending an account must immediately prevent sensitive actions even if
an old JWT still exists.

21.3 Turf Owner Approval Owner registration: pending_approval ->
active/rejected/suspended

Admin should see:

Business information.

Contact information.

Submitted payout details.

Registration date.

Approval status.

Approval/rejection reason.

21.4 Turf Approval Turf: draft -> pending_review ->
active/rejected/inactive/suspended

Admin can:

Preview photos.

Review description.

Review address/map location.

Review sports/amenities.

Review pricing.

Approve.

Reject with reason.

Suspend later if a problem occurs.

21.5 Commission Management Support:

Global commission percentage.

Owner-specific commission override.

Optional future turf-specific override.

Effective date for future commission changes.

Commission history/audit log.

The actual commission used for a confirmed booking must be stored on the
booking so later setting changes cannot rewrite historical transactions.



---

## 22. Booking Management --- Complete State Machine

 Recommended booking
    lifecycle:

stateDiagram-v2 [*] --> pending_payment: Player selects slot

    pending_payment --> confirmed: Payment successful
    pending_payment --> expired: Payment fails / Lock expires

    confirmed --> cancelled: Player cancels (within window)
    confirmed --> cancelled_owner: Owner cancels (any time)
    confirmed --> checked_in: Staff scans QR code

    checked_in --> completed: End_time passes

    cancelled --> refunded: Refund processed
    cancelled_owner --> refunded_full: Full refund processed

    refunded --> [*]
    completed --> [*]
    expired --> [*]

    note right of pending_payment
        Redis lock for 10 minutes
        Idempotent webhook processing
    end note

    note right of confirmed
        Money held in owner wallet
        Cancellation window active
    end note

    note right of cancelled
        Refund depends on timing:
        - >24h: 100%
        - 6-24h: 50%
        - <6h: 0%
    end note

22.1 Double Booking Protection The backend must guarantee:

One slot cannot have two successful bookings.

Redis lock protects the payment window.

Database constraints/transactions provide final consistency.

Payment webhook processing is idempotent.

Repeated SSLCommerz IPN calls cannot create duplicate confirmations.

22.2 Booking Process Flow Diagram sequenceDiagram participant Player
participant Frontend participant Backend participant Redis participant
SSLCommerz participant PostgreSQL

    Player->>Frontend: Select Slot
    Frontend->>Backend: POST /api/player/bookings
    Backend->>PostgreSQL: Check slot availability
    PostgreSQL-->>Backend: Slot available
    Backend->>Redis: Lock slot (TTL 10 min)
    Redis-->>Backend: Lock acquired
    Backend->>PostgreSQL: Create booking (pending_payment)
    Backend->>SSLCommerz: Initiate payment
    SSLCommerz-->>Backend: Payment URL
    Backend-->>Frontend: Payment redirect URL
    Frontend->>SSLCommerz: Redirect to payment page
    Player->>SSLCommerz: Complete payment
    SSLCommerz->>Backend: IPN Webhook (async)
    Backend->>SSLCommerz: Validate transaction
    SSLCommerz-->>Backend: Transaction valid
    Backend->>PostgreSQL: Update booking (confirmed)
    Backend->>Redis: Release lock
    Backend-->>Player: Booking confirmation (email/push)

22.3 Cancellation & Refund Timeline timeline title Booking Cancellation
Policy section More than 24 hours 24h+ before start : 100% Refund : Full
refund to payment method section 6-24 hours 6h to 24h before : 50%
Refund : Partial refund, 50% platform keeps section Less than 6 hours 0h
to 6h before : No Refund : Booking is non-refundable section Start Time
Booking Start : Check-in window opens : Booking marked completed after
end_time 22.4 Cancellation Decision Matrix Scenario Player Cancels Owner
Cancels Admin Force Cancels >24h before start 100% refund 100% refund
100% refund 6-24h before start 50% refund 100% refund Admin discretion
\<6h before start No refund 100% refund Admin discretion Post check-in
Not allowed 100% refund Full/partial refund Post completion Not allowed
Not allowed Not allowed (dispute) Duplicate booking N/A N/A 100%
refund + penalty Platform error N/A N/A 100% refund + compensation 

---

## 23. Cancellation, Refund & Dispute Center

 23.1 Standard Player Cancellation
Default:

More than 24 hours: 100% refund.

6--24 hours: 50% refund.

Less than 6 hours: no refund.

These values remain admin-configurable.

23.2 Owner Cancellation Owner cancellation:

Always 100% player refund.

Booking cancellation recorded.

Owner cancellation reason required.

Incident appears in Admin monitoring.

Repeated owner cancellation contributes to owner quality metrics.

23.3 Dispute Workflow graph TD A[Dispute opened] --> B[Status:
OPEN] B --> C[Admin assigned] C --> D[Admin reviews case] D -->
E{Gather evidence} E --> F[Contact both parties] F --> G[Review
booking history] G --> H{Decision} H -->\|Refund\| I[Process
refund] H -->\|Partial Refund\| J[Process partial refund] H
-->\|Reject\| K[Reject claim] H -->\|Credit\| L[Offer platform
credit]

    I --> M[Update booking status]
    J --> M
    K --> N[Status: REJECTED]
    L --> O[Status: RESOLVED]
    M --> P[Status: RESOLVED]

    P --> Q[Log audit trail]
    Q --> R[Notify parties]

    style I fill:#90EE90
    style J fill:#FFD700
    style K fill:#FFB6C1
    style L fill:#87CEEB

Player or owner can submit:

Booking reference.

Issue category.

Description.

Optional supporting photo/document where appropriate.

Admin can:

Review booking/payment/refund history.

Contact relevant party through platform workflow.

Approve full refund.

Approve partial refund.

Reject claim.

Force-cancel booking.

Add internal resolution note.

Every manual refund/dispute action must be audit logged.



---

## 24. Wallet & Financial Ledger Enhancement

 The wallet should distinguish:

gross_booking_amount

platform_commission

net_owner_amount

held_amount

available_balance

withdrawn_amount

Recommended conceptual flow:

text Player Payment \| v Gross Booking Amount \| +---- Platform
Commission \| +---- Owner Net Amount \| v Cancellation Hold \| v
Available Balance \| v Withdrawal Do not allow the frontend to calculate
or submit the final owner balance.

For financial auditability, every balance-changing event should have a
corresponding transaction/ledger record. A future wallet_transactions
table is recommended even if wallets.available_balance is retained for
performance.

Suggested ledger types: booking_credit, commission_debit, refund_debit,
withdrawal_debit, manual_adjustment.

24.1 Hold Period & Balance Release Timeline gantt title Wallet Hold
Period dateFormat HH:mm axisFormat %H:%M

    section Booking Confirmation
    Booking confirmed        :done, 10:00, 1h
    Hold funds in wallet     :active, 10:00, 14h

    section Cancellation Window
    Full refund window       :crit, 10:00, 24h
    50% refund window        :crit, 10:00, 6h
    No refund window         :crit, 10:00, 6h

    section Hold Release
    Funds released at start  :milestone, 10:00, 0h
    Funds available          :10:00, 1h
    Withdrawal possible      :10:00, 1h



---

## 25. Reporting & Analytics

 25.1 Admin Reports Gross booking value.

Platform commission.

Net owner earnings.

Total refunds.

Total withdrawals.

Booking count.

Cancellation rate.

Turf utilization.

Revenue by turf.

Revenue by owner.

Revenue by sport.

Revenue by date range.

25.2 Owner Reports Daily revenue.

Weekly revenue.

Monthly revenue.

Booking count.

Completed bookings.

Cancelled bookings.

Occupancy/utilization.

Commission paid.

Net earnings.

Withdrawal history.

25.3 Player History Total bookings.

Completed bookings.

Cancelled bookings.

Refunds.

Payment history.

Reports should support date filtering and CSV export where practical.



---

## 26. Notification Center

 Implement an in-app notification record so users
    can see historical notifications.

Recommended fields:

sql id user_id type title message data (json) read_at created_at
Notification channels:

In-app

Email

SMS

Web Push

The notification service should be asynchronous where possible using the
existing Redis/BullMQ infrastructure.



---

## 27. Search, Filters & Discovery

 Public turf search should support:

Area/location.

Map position.

Sport.

Date.

Available time.

Price range.

Rating.

Amenities.

Open now.

Sort by relevance, distance, price or rating.

Availability filtering must use real slot data rather than static turf
information.



---

## 28. Reviews & Reputation

 Review rules:

Only players with eligible completed bookings can review.

One review per booking.

Rating is 1--5.

Admin can moderate abusive/fraudulent reviews.

Owner cannot delete player reviews.

Admin moderation actions are logged.

Future reputation metrics:

Average rating.

Number of reviews.

Owner cancellation rate.

Booking completion rate.

Complaint rate.



---

## 29. Audit & Administrative Controls

 Audit logging should cover at
    minimum:

Owner approval/rejection.

Turf approval/rejection.

Account suspension/reactivation.

Commission changes.

Manual booking creation.

Booking cancellation.

Manual refund.

Withdrawal approval/rejection.

Wallet adjustment.

Staff creation/revocation.

Staff permission changes.

Turf pricing changes.

Slot blocking/unblocking.

Example:

sql actor_id action target_type target_id before (json) after (json)
metadata (json) created_at Sensitive financial/admin actions should
never be silently overwritten.



---

## 30. Domain Events & Messaging

 30.1 Event Catalog All domain events are
    published to BullMQ queues for async processing.

Event Trigger Subscribers Payload Example BookingCreated Player books
slot Email, SMS, Push, Analytics { bookingId, playerId, turfId,
startTime, amount } BookingConfirmed Payment verified Email, SMS, Push,
Wallet { bookingId, transactionId, netAmount } BookingCancelled
Cancellation initiated Email, Refund, Analytics { bookingId, reason,
refundAmount, refundPercentage } BookingCheckedIn Staff scans QR
Analytics, Notifications { bookingId, staffId, checkInTime }
BookingCompleted End_time passed Wallet Release, Review { bookingId,
actualEndTime } PaymentSucceeded IPN received BookingConfirmation,
Commission { bookingId, amount, transactionId } PaymentFailed IPN
received SlotRelease, Notification { bookingId, errorCode, retryCount }
RefundProcessed Admin approves refund Wallet, Notification { bookingId,
amount, refundId } WithdrawalRequested Owner requests payout
AdminNotification, Audit { ownerId, amount, payoutMethod }
WithdrawalApproved Admin approves PaymentProcessing, Wallet {
withdrawalId, amount, approvedBy } SlotLockAcquired Booking initiated
Redis, TimeoutJob { slotId, bookingId, expiresAt } SlotLockExpired TTL
reached Booking cleanup, Slot release { slotId, bookingId }
StaffPermissionChanged Owner updates staff Audit, Notification {
staffId, turfId, oldPermissions, newPermissions } 30.2 Queue
Architecture Queue Name Purpose Retry Policy Dead Letter email:bookings
Send booking confirmations 3 attempts, exponential backoff email:dead
email:reminders Send pre-booking reminders 3 attempts, 5min delay
email:dead sms:otp Send OTP codes 2 attempts, immediate sms:dead
push:notifications Send web push notifications 3 attempts push:dead
refund:processing Process SSLCommerz refunds 5 attempts, increasing
delay refund:failed slot:cleanup Clean expired locks 1 attempt, every
10min N/A analytics:events Track user behavior 2 attempts analytics:dead
withdrawal:admin Notify admin of new withdrawals 3 attempts
withdrawal:failed 30.3 Webhook Idempotency All external webhooks
(SSLCommerz IPN) must be idempotent:

json { "idempotency_key": "booking_12345_webhook_attempt_3",
"processed_at": "2026-09-08T10:30:00Z", "hash": "sha256(transaction_id +
amount + timestamp)", "retry_count": 3 } Duplicate webhook check:

Check Redis cache for webhook:processed:{txn_id} (TTL: 24 hours)

If exists → return 200 OK (don't reprocess)

If not exists → process normally → set Redis cache



---

## 31. API Expansion

 Additional REST endpoints recommended:

text \# Player GET /api/player/profile PATCH /api/player/profile GET
/api/player/notifications PATCH /api/player/notifications/:id/read GET
/api/player/favorites POST /api/player/favorites/:turfId DELETE
/api/player/favorites/:turfId GET /api/player/payments POST
/api/player/bookings/:id/dispute

# Owner

GET /api/owner/dashboard GET /api/owner/bookings POST
/api/owner/bookings/manual POST /api/owner/bookings/:id/cancel GET
/api/owner/reports GET /api/owner/transactions POST
/api/owner/turfs/:id/close POST /api/owner/turfs/:id/slots/block POST
/api/owner/bookings/:id/dispute

# Staff

GET /api/staff/dashboard GET /api/staff/bookings POST
/api/staff/bookings/:id/check-in POST /api/staff/bookings/:id/complete
POST /api/staff/bookings/manual PATCH /api/staff/slots/:id/block PATCH
/api/staff/slots/:id/unblock

# Admin

GET /api/admin/dashboard GET /api/admin/owners/pending PATCH
/api/admin/owners/:id/approve PATCH /api/admin/owners/:id/reject GET
/api/admin/disputes PATCH /api/admin/disputes/:id GET
/api/admin/bookings GET /api/admin/transactions GET
/api/admin/reports/bookings GET /api/admin/reports/financial GET
/api/admin/audit-logs GET /api/health Every endpoint must enforce role
and ownership scope server-side.



---

## 32. UX / Dashboard Navigation

 Admin text Dashboard Users ├── Players ├──
    Turf Owners └── Staff Turfs ├── All Turfs └── Pending Approval
    Bookings Disputes Refunds Withdrawals Finance Reports Notifications
    Platform Settings Audit Logs Turf Owner text Dashboard My Turfs
    Availability Bookings Manual Booking Players Staff Earnings Wallet
    Withdrawals Reports Notifications Profile / Business Settings Staff
    text Dashboard Today's Bookings Bookings Check-in Calendar Block
    Slots Notifications Profile Player text Home Search Favorites My
    Bookings Payments Notifications Profile


---

## 33. MVP Priority

 To prevent the project from becoming unnecessarily
    complex, implement in phases.

Phase 1 --- Core Marketplace Authentication.

Four roles.

Turf owner approval.

Turf approval.

Turf listing.

Search/filter.

Availability.

Slot locking.

Online booking.

SSLCommerz payment/IPN.

Booking history.

Basic cancellation/refund.

Owner wallet.

Withdrawal request.

Admin withdrawal approval.

Phase 2 --- Operations Staff accounts.

Granular staff permissions.

Check-in/completion.

Manual/offline bookings.

Advanced slot blocking.

Owner dashboard.

Admin dashboard.

Basic reports.

Notifications.

Phase 3 --- Marketplace Quality Favorites.

Dispute center.

Advanced refund management.

Reviews moderation.

Owner reputation metrics.

Advanced reports.

Wallet transaction ledger.

CSV exports.

Phase 4 --- Growth Features Promotions/coupons.

Featured turfs.

Loyalty/rewards.

Subscription/membership.

Automated owner payouts.

WhatsApp integration if economics justify it.

Multi-city expansion.

Advanced analytics.

The MVP should not require all Phase 3/4 features before launch.



---

## 34. Critical Business Rules

1.  A player cannot book a slot that is already locked, booked or blocked.
2.  A turf owner cannot access another owner's turf, booking, wallet or
    staff.
3.  A staff member can only access assigned turfs.
4.  Staff has no financial authority.
5.  An unapproved owner cannot receive bookings.
6.  An unapproved turf cannot appear in public search.
7.  Payment success must be confirmed server-to-server.
8.  Commission must be calculated server-side.
9.  Historical booking commission must never change when future
    commission settings change.
10. A refunded booking must reverse the corresponding owner earning and
    platform commission.
11. Owner cancellation must create a full player refund.
12. Withdrawal cannot include funds still inside the cancellation hold
    period.
13. Admin can override normal cancellation/refund logic through an
    audited action.
14. Every sensitive financial/admin action must be auditable.
15. Suspended users must lose access to sensitive operations immediately.
16. Frontend hiding is never an authorization mechanism.
17. Manual/offline bookings must be clearly distinguishable from online
    paid bookings.
18. Duplicate payment webhooks must be safely ignored/idempotently
    processed.
19. All money amounts must use safe server-side monetary handling and
    never rely on client-submitted totals.
20. All timestamps stored in the database should remain UTC, with
    Asia/Dhaka conversion only at presentation level.
21. A cancellation policy is always resolved through the hierarchy
    Turf Policy -> Owner Policy -> Default Policy (Section 47) — never
    hardcoded per feature.
22. Only one cancellation policy can be active per turf and per owner at
    a time; assigning a new one supersedes the old one but does not
    retroactively change already-confirmed bookings' recorded refund
    terms.
23. Every cancellation policy tier must have a non-negative,
    non-overlapping time boundary — the policy engine must reject
    overlapping or contradictory tiers at save time.
24. The payment gateway fee (SSLCommerz) is never refundable to the
    player or the owner under any player- or owner-initiated
    cancellation — only a documented platform-side system error may
    result in the platform absorbing it.
25. A booking's `gateway_fee_amount` is fixed at the time of payment and
    must never be recalculated retroactively if gateway fee rates change
    later.

### Manual Booking Rules

26. **No Gateway Fee**: manual bookings always have a `gateway_fee_amount`
    of 0 TK, since SSLCommerz is never used to collect payment for them.
27. **Platform Fee Still Applies**: the platform fee (default 5%,
    admin-configurable) applies to manual bookings exactly as it does to
    online bookings — manual bookings are not a way to avoid platform
    commission.
28. **Same Cancellation Policy Engine**: manual bookings resolve their
    cancellation policy through the identical Turf Policy -> Owner
    Policy -> Default Policy hierarchy used for online bookings
    (Section 47.13).
29. **Refund Calculation**: on a player-initiated cancellation, the
    player receives `(turf price portion per policy tier) - platform fee`
    — there is no gateway fee to subtract because none was ever charged.
30. **Owner Responsibility**: the owner (or staff, if permitted) is
    responsible for actually collecting payment from the customer
    offline — the platform does not guarantee, hold, or verify that this
    money changed hands.
31. **Audit Required**: every manual booking creation, payment-status
    change, and cancellation must be written to the audit log, including
    who performed the action.
32. **Payment Verification**: the owner/staff must explicitly mark a
    manual booking's payment status (`paid` / `pending` / `partial`) —
    the system cannot verify this independently the way it verifies an
    SSLCommerz IPN.
33. **Booking Source Tracking**: every booking's `booking_source` field
    must always be one of `online`, `manual_owner`, `manual_staff`, or
    `admin` — never left null or ambiguous.
34. **No Double-Booking Across Sources**: a manual booking must acquire
    the same slot lock/reservation mechanism as an online booking, so an
    online player can never book a slot a manual booking already holds,
    and vice versa.
35. **Distinguishable in All Views**: manual bookings must appear
    alongside online bookings in every calendar/list view (never
    hidden or segregated into a separate, easy-to-miss screen), but must
    be visually/programmatically distinguishable via `booking_source`.
36. **No Retroactive Fee Changes**: if the platform fee percentage
    changes after a manual booking is confirmed, the original booking's
    recorded `platform_fee_amount` must not be recalculated — only new
    bookings use the new rate.

### Booking Add-on Rules (Section 51)

37. **Add-ons Are Line Items, Not Separate Transactions**: an add-on
    cancellation is tied to its parent booking — when a booking is
    cancelled, all its add-ons are automatically cancelled and refunded
    as part of the booking's own refund calculation. No separate
    add-on refund process exists.
38. **Fees Apply to the Combined Total**: `platform_fee_amount` and
    `gateway_fee_amount` are calculated on `(base_amount +
    addon_total)`, never on `base_amount` alone once add-ons are
    present. There is no separate add-on fee.
39. **Owner Cancellation Refunds Everything**: owner-initiated
    cancellation refunds the entire booking including add-ons — the
    Section 47 policy engine applies to the booking's combined total,
    not to `base_amount` in isolation.
40. **Add-on Price/Name Snapshotting**: `addon_name_snapshot` and
    `addon_price_snapshot` are captured at booking time. If the owner
    later changes an add-on's price or name, already-confirmed
    bookings are unaffected — their recorded amounts never change
    (same principle as Rule 36).

## 35. Definition of Done --- Role Functionality

 Player □
    Registration/login works. □ Verification works. □ Search/filter
    works. □ Real-time availability works. □ Booking/payment works. □
    Booking history works. □ Cancellation/refund works. □ Review works.
    □ Notifications work. □ Profile management works. Turf Owner □
    Registration/approval works. □ Turf CRUD works. □ Turf approval
    workflow works. □ Pricing works. □ Slot/calendar works. □ Manual
    booking works. □ Booking management works. □ Staff management works.
    □ Earnings/wallet works. □ Withdrawal works. □ Reports work. Staff □
    Owner-created account works. □ Turf assignment works. □ Permission
    system works. □ Booking view is scoped. □ Check-in works. □
    Completion works. □ Slot block/unblock works according to
    permission. □ Financial information is inaccessible. Admin □ Global
    dashboard works. □ User management works. □ Owner approval works. □
    Turf approval works. □ Booking oversight works. □ Refund/dispute
    management works. □ Withdrawal approval works. □ Commission settings
    work. □ Reports work. □ Platform settings work. □ Audit logs work.


---

## 36. Implementation Guidance for Google AI Studio

 When implementing this
    specification, do not attempt to build every feature at once.

Build and test one phase at a time:

Database + authentication + RBAC.

Player turf discovery + availability.

Owner turf management + slot generation.

Booking + Redis lock + SSLCommerz.

Cancellation/refund.

Owner wallet + withdrawal.

Staff permissions + operations.

Admin dashboard + approvals.

Notifications + reports.

Disputes + advanced marketplace features.

After each phase, run functional tests and security/RBAC tests before
starting the next phase.

The backend must remain the source of truth for:

Authorization.

Turf ownership.

Slot availability.

Booking state.

Payment state.

Pricing.

Commission.

Refund.

Wallet balance.

Withdrawal eligibility.



---

## 37. Performance & Scaling Guidelines

 37.1 Database Scaling Strategy
    Stage Active Users Turfs Daily Bookings Strategy MVP \< 1,000 \< 500
    \< 500 Single DB instance, basic indexes Growth 1,000-10,000
    500-5,000 500-5,000 Read replicas, connection pooling Scale >
    10,000 > 5,000 > 5,000 Sharding by turf_id, write replicas
    Enterprise > 100,000 > 50,000 > 50,000 Horizontal sharding,
    caching layer 37.2 Query Optimization Patterns sql -- Pattern 1:
    Availability Query (High Frequency) -- Always use composite index,
    cache in Redis SELECT * FROM slots WHERE turf_id = ? AND date = ?
    AND status = 'available' FOR UPDATE; -- Use only when booking

-- Pattern 2: Dashboard Stats (Cache in Redis) -- Materialized views or
aggregated tables CREATE MATERIALIZED VIEW daily_turf_stats AS SELECT
turf_id, DATE(created_at) as booking_date, COUNT(*) as total_bookings,
SUM(total_amount) as revenue FROM bookings WHERE status IN ('confirmed',
'completed') GROUP BY turf_id, DATE(created_at);

-- Refresh every hour REFRESH MATERIALIZED VIEW daily_turf_stats; 37.3
Redis Cache Strategy Cache Key TTL Invalidation Strategy Notes
turf:list:{filters_hash} 5 min On turf create/update Search results
turf:detail:{id} 15 min On turf update Turf details
availability:{id}:{date} 2 min On booking Recalculate often
user:profile:{id} 30 min On profile update User info
dashboard:owner:{id} 5 min On booking/wallet change Owner dashboard
settings:platform 1 hour On settings change Platform config
webhook:processed:{txn} 24 hours Never Idempotency 37.4 Redis Key Design
Patterns typescript // Slot Lock Keys (TTL: 10 minutes)
`slot:lock:{turf_id}:{slot_id}` → { booking_id, player_id, expires_at }

// User Session Keys (TTL: 15 minutes) `session:{user_id}` → {
access_token, refresh_token, role }

// Rate Limiting Keys `ratelimit:auth:{ip}:{email}` → { attempts,
reset_at } `ratelimit:payment:{user_id}` → { attempts, reset_at }

// Cache Keys `cache:turf:list:{filters_hash}` → { results, expires_at }
`cache:availability:{turf_id}:{date}` → { slots, expires_at }

// Job Queues (BullMQ) `queue:email:booking-confirmation`
`queue:email:booking-reminder` `queue:sms:otp`
`queue:cleanup:expired-locks` 37.5 Connection Pool Sizing typescript //
PostgreSQL Pool { min: 2, max: process.env.NODE_ENV === 'production' ?
20 : 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 2000, //
Formula: (max_connections - 1) / replicas // Leave 20% overhead for
emergency }

// Redis Pool { min: 2, max: 10, idleTimeoutMillis: 10000,
commandTimeout: 5000, } 37.6 Background Job Performance Job Type
Frequency Average Duration Retry Policy SLAs Email sending Per booking
2-5 seconds 3 retries \< 10s 95th percentile SMS sending Per OTP 1-3
seconds 2 retries \< 5s 95th percentile Push notification Per event \< 1
second 1 retry \< 2s 99th percentile Refund processing Per cancellation
5-30 seconds 5 retries \< 60s 95th percentile Slot cleanup Every 10 min
\< 1 second 1 retry \< 5min max Report generation On demand 1-60 seconds
2 retries \< 120s 99th percentile Backup Daily at 2AM 5-30 minutes 1
retry \< 60 min max 37.7 Monitoring Alerts Metric Warning Threshold
Critical Threshold Action API response time > 500ms p95 > 1s p95 Scale
up DB connection usage > 70% > 90% Increase pool Redis memory usage >
70% > 85% Clear cache / upgrade Disk usage > 70% > 85% Clean / backup
Queue length > 1000 > 5000 Scale workers Error rate > 1% > 5%
Investigate logs Payment failure rate > 5% > 10% Check SSLCommerz 4xx
rate > 5% > 10% Check validation logic 5xx rate > 0.5% > 2%
Immediate investigation 37.8 Disaster Recovery Plan Incident RTO
(Recovery Time) RPO (Recovery Point) Procedure Database crash \< 15 min
\< 5 min Restore from replication Database corruption \< 2 hours \< 24
hours Restore from backup Redis crash \< 5 min \< 1 min Restart, clear
cache Disk failure \< 30 min \< 12 hours Restore from backup Full VPS
failure \< 4 hours \< 24 hours Deploy from backup SSLCommerz outage Not
applicable N/A Queue payments, retry DDoS attack \< 15 min N/A
Cloudflare/rate limiting 

---

## 38. Testing Strategy & Coverage

 38.1 Test
Pyramid graph TD A[E2E Tests - 10%] B[Integration Tests - 30%]
C[Unit Tests - 60%]

    C --> B --> A

    style A fill:#FFD700
    style B fill:#87CEEB
    style C fill:#90EE90

38.2 Critical Test Scenarios (Must Pass) Unit Tests (60% coverage
target) □ User registration validation □ Booking price calculation □
Commission calculation □ Refund percentage calculation □ Wallet balance
calculation □ JWT token generation/validation □ Rate limiting logic □
Slot availability logic □ Staff permission checks □ Audit log formatting
Integration Tests (30% coverage target) □ Database migrations (up/down)
□ Redis connection & operations □ BullMQ job scheduling □ Email sending
via Postal □ SMS sending via bulksmsbd □ SSLCommerz API integration
(mock) □ Webhook idempotency □ Concurrent booking handling □ Refund
processing □ Withdrawal workflow E2E Tests (10% coverage target) □
Complete booking flow (search → pay → confirm) □ Cancellation flow (all
scenarios) □ Owner → Staff → Player flow □ Admin approval flow □ Wallet
→ Withdrawal → Admin approval □ Dispute resolution flow □ Password reset
flow □ Profile update flow □ Multi-vendor isolation (Staff view scoping)
38.3 Performance Test Scenarios Scenario Concurrent Users Expected
Response SLA Turf search 500 \< 300ms 99% Availability check 1000 \<
200ms 99% Booking creation 100 \< 500ms 95% Payment initiation 50 \< 1s
95% Dashboard load 200 \< 1s 95% Admin report generation 20 \< 3s 95%
Webhook processing 100/sec \< 100ms 99.9% 38.4 Security Test Scenarios □
SQL Injection (all endpoints) □ XSS (all input fields) □ CSRF protection
verification □ Rate limit testing (auth, payment) □ JWT expiry/refresh
testing □ RBAC permission matrix (all roles) □ File upload validation
(bypass attempts) □ Mass assignment protection □ Parameter pollution
testing 

---

## 39. Security Headers & Configuration

 typescript // Express
Middleware Security Headers app.use(helmet({ contentSecurityPolicy: {
directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'",
"'strict-dynamic'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc:
["'self'", "data:", "https://*.sslcommerz.com"], connectSrc:
["'self'", "https://api.sslcommerz.com"], }, }, hsts: { maxAge:
31536000, includeSubDomains: true, preload: true, }, frameguard: {
action: 'deny' }, referrerPolicy: { policy:
'strict-origin-when-cross-origin' }, }));

// Add request ID for tracing app.use((req, res, next) => {
req.requestId = uuidv4(); res.setHeader('X-Request-Id', req.requestId);
next(); }); 39.1 Data Encryption for Sensitive Fields typescript //
Encrypt sensitive fields at rest const crypto = require('crypto');

// Payout details (bank account, mobile wallet numbers) // Algorithm:
AES-256-GCM function encryptSensitiveData(text: string): string { const
iv = crypto.randomBytes(16); const cipher =
crypto.createCipheriv('aes-256-gcm', encryptionKey, iv); const encrypted
= Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]); const
tag = cipher.getAuthTag(); return JSON.stringify({ iv:
iv.toString('hex'), tag: tag.toString('hex'), data:
encrypted.toString('hex') }); }

// Store in JSONB with encrypted fields // payout_details: { //
account_number: encrypted, // routing_number: encrypted, // bank_name:
plain_text // } 39.2 Audit Log Enum typescript enum AuditAction {
USER_LOGIN = 'user.login', USER_LOGOUT = 'user.logout', USER_REGISTER =
'user.register', USER_PASSWORD_RESET = 'user.password.reset',
USER_SUSPEND = 'user.suspend', USER_REACTIVATE = 'user.reactivate',

TURF_CREATE = 'turf.create', TURF_UPDATE = 'turf.update', TURF_APPROVE =
'turf.approve', TURF_REJECT = 'turf.reject', TURF_SUSPEND =
'turf.suspend',

BOOKING_CREATE = 'booking.create', BOOKING_CANCEL = 'booking.cancel',
BOOKING_CHECKIN = 'booking.checkin', BOOKING_COMPLETE =
'booking.complete',

PAYMENT_INITIATE = 'payment.initiate', PAYMENT_SUCCESS =
'payment.success', PAYMENT_FAILURE = 'payment.failure',

REFUND_PROCESS = 'refund.process', REFUND_APPROVE = 'refund.approve',

WITHDRAWAL_REQUEST = 'withdrawal.request', WITHDRAWAL_APPROVE =
'withdrawal.approve', WITHDRAWAL_REJECT = 'withdrawal.reject',

COMMISSION_CHANGE = 'commission.change', SETTINGS_CHANGE =
'settings.change',

STAFF_CREATE = 'staff.create', STAFF_UPDATE_PERMISSIONS =
'staff.update.permissions', STAFF_DELETE = 'staff.delete', } 

---

## 40. System Architecture Diagram

 text
┌─────────────────────────────────────────────────────────────────┐ │
CLIENT LAYER │ │ ┌──────────────┐ ┌──────────────┐
┌──────────────────────┐ │ │ │ React SPA │ │ Mobile PWA │ │ Admin
Dashboard │ │ │ │ (Vite + RQ) │ │ (Same Code) │ │ (Same Codebase) │ │ │
└──────────────┘ └──────────────┘ └──────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘ │ ▼
┌─────────────────────────────────────────────────────────────────┐ │
API GATEWAY (Express) │ │
┌─────────────────────────────────────────────────────────┐ │ │ │
Middleware: Auth → RBAC → Rate Limit → Validation │ │ │
└─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘ │ ▼
┌─────────────────────────────────────────────────────────────────┐ │
SERVICE LAYER │ │ ┌────────────┐ ┌────────────┐ ┌────────────┐
┌─────────┐ │ │ │Booking Svc │ │Payment Svc │ │Wallet Svc │ │Notif Svc│
│ │ └────────────┘ └────────────┘ └────────────┘ └─────────┘ │ │
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌─────────┐ │ │ │Turf Svc │
│User Svc │ │Report Svc │ │Audit Svc│ │ │ └────────────┘ └────────────┘
└────────────┘ └─────────┘ │
└─────────────────────────────────────────────────────────────────┘ │ ▼
┌─────────────────────────────────────────────────────────────────┐ │
DATA & CACHE LAYER │ │ ┌────────────────┐ ┌────────────────┐
┌─────────────────┐ │ │ │ PostgreSQL │ │ Redis │ │ BullMQ Queues │ │ │ │
(Primary DB) │ │ (Cache + Lock) │ │ (Jobs + Emails) │ │ │
└────────────────┘ └────────────────┘ └─────────────────┘ │ │
┌────────────────┐ ┌────────────────┐ │ │ │ Local Disk │ │ Nginx Static
│ │ │ │ (Uploads) │ │ (Serve Photos) │ │ │ └────────────────┘
└────────────────┘ │
└─────────────────────────────────────────────────────────────────┘ │ ▼
┌─────────────────────────────────────────────────────────────────┐ │
EXTERNAL SERVICES │ │ ┌──────────────┐ ┌──────────────┐
┌──────────────────────┐ │ │ │ SSLCommerz │ │ Postal SMTP │ │
bulksmsbd.co (SMS) │ │ │ │ (Payment) │ │ (Email) │ │ (OTP/Notifications)
│ │ │ └──────────────┘ └──────────────┘ └──────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘ 

---

## 41. Deployment & Operations

 41.1 Docker Configuration dockerfile \#
Dockerfile for Backend FROM node:20-alpine

WORKDIR /app

# Copy package files

COPY package*.json ./ COPY yarn.lock ./

# Install dependencies

RUN yarn install --frozen-lockfile --production

# Copy source code

COPY . .

# Build TypeScript

RUN yarn build

# Expose port

EXPOSE 3000

# Start server

CMD ["node", "dist/server.js"] yaml \# docker-compose.yml version:
'3.8'

services: backend: build: . ports: - "3000:3000" environment: -
NODE_ENV=production -
DATABASE_URL=postgresql://user:pass@postgres:5432/turfhub -
REDIS_URL=redis://redis:6379 depends_on: - postgres - redis volumes: -
./uploads:/app/uploads

postgres: image: postgres:16-alpine environment: POSTGRES_USER: turfhub
POSTGRES_PASSWORD: \${DB_PASSWORD} POSTGRES_DB: turfhub volumes: -
postgres_data:/var/lib/postgresql/data ports: - "5432:5432"

redis: image: redis:7-alpine ports: - "6379:6379" volumes: -
redis_data:/data

nginx: image: nginx:alpine ports: - "80:80" - "443:443" volumes: -
./nginx.conf:/etc/nginx/nginx.conf - ./uploads:/var/www/uploads
depends_on: - backend

volumes: postgres_data: redis_data: 41.2 Deployment Checklist □
Environment variables configured □ Database migrations run □ Seed data
inserted (admin user, settings) □ SSL certificates installed □ Nginx
reverse proxy configured □ Upload directory permissions set □ Cron jobs
scheduled (backup, cleanup) □ Monitoring alerts configured □ SSLCommerz
webhook URL configured □ Email templates tested □ SMS templates tested □
Push notification VAPID keys generated □ Rate limiting thresholds set □
Backup script tested □ Disaster recovery drill performed □ Load test
completed 41.3 Maintenance Schedule Task Frequency Impact Automated
Database backup Daily at 2AM Low Yes (cron) Upload backup Daily at 3AM
Low Yes (cron) Expired booking cleanup Every 10min None Yes (BullMQ)
Redis cache warming Hourly None Yes (job) SSL certificate renewal Every
90 days None Yes (Certbot) Performance report Weekly None Manual
Security audit Monthly Low Manual Database vacuum Weekly (off-peak)
Medium Yes (cron) Log rotation Daily None Yes (logrotate) Dependency
updates Monthly Low Manual 41.4 Troubleshooting Guide Error Symptom Root
Cause Solution BOOKING_SLOT_UNAVAILABLE User can't book Slot already
booked in race condition Retry or show alternatives
PAYMENT_WEBHOOK_TIMEOUT Payment confirmed but booking not updated
SSLCommerz IPN delayed Manual reconciliation WALLET_INSUFFICIENT_BALANCE
Withdrawal fails Hold period not released yet Calculate available
balance STAFF_PERMISSION_DENIED Staff can't access turf Permissions not
set correctly Check staff_assignments table DB_CONNECTION_TIMEOUT API
slow/unresponsive Connection pool exhausted Increase pool size, check
queries REDIS_OUT_OF_MEMORY Locks failing, cache slow Memory limit
reached Clear cache, upgrade Redis SSLCOMMERZ_ERROR_1002 Payment
initiation fails Invalid store ID/password Check environment variables
EMAIL_SEND_FAILED Users not receiving emails SMTP credentials expired
Update Postal credentials DISK_FULL Uploads failing, logs not writing
Storage limit reached Clean up logs, resize disk 41.5 Debugging
Checklist bash \# Check logs docker logs --tail 100 backend

# Check database connections

SELECT * FROM pg_stat_activity WHERE state = 'active';

# Check Redis memory

redis-cli INFO memory

# Check pending jobs

yarn bullmq:queue list

# Check background workers

yarn pm2 status

# Check SSLCommerz API

curl -X GET
https://sandbox.sslcommerz.com/validator/api/validationserverAPI

# Test email

node scripts/test-email.js

# Generate test booking

node scripts/generate-test-booking.js 

---

## 42. Environment Variables

 env \#
.env.example

# Server

NODE_ENV=development PORT=3000 HOST=0.0.0.0

# Database

DATABASE_URL=postgresql://user:password@localhost:5432/turfhub
DATABASE_POOL_MIN=2 DATABASE_POOL_MAX=10

# Redis

REDIS_URL=redis://localhost:6379 REDIS_LOCK_TTL=600 \# 10 minutes in
seconds

# JWT

JWT_ACCESS_SECRET=change_this_in_production
JWT_REFRESH_SECRET=change_this_in_production JWT_ACCESS_EXPIRY=900 \# 15
minutes JWT_REFRESH_EXPIRY=2592000 \# 30 days

# SSLCommerz

SSLCOMMERZ_STORE_ID=your_store_id
SSLCOMMERZ_STORE_PASSWORD=your_store_password SSLCOMMERZ_SANDBOX=true
SSLCOMMERZ_SUCCESS_URL=https://your-domain.com/payment/success
SSLCOMMERZ_FAIL_URL=https://your-domain.com/payment/fail
SSLCOMMERZ_CANCEL_URL=https://your-domain.com/payment/cancel
SSLCOMMERZ_IPN_URL=https://your-domain.com/api/payments/sslcommerz/ipn

# Email (Postal SMTP)

SMTP_HOST=postal.your-domain.com SMTP_PORT=587 SMTP_USER=your_smtp_user
SMTP_PASSWORD=your_smtp_password SMTP_FROM=noreply@your-domain.com

# SMS (bulksmsbd.co)

SMS_API_KEY=your_api_key SMS_SENDER_ID=TurfHub
SMS_API_URL=https://api.bulksmsbd.co/send

# Web Push (VAPID)

VAPID_PUBLIC_KEY=your_public_key VAPID_PRIVATE_KEY=your_private_key
VAPID_SUBJECT=mailto:admin@your-domain.com

# Storage

UPLOAD_DIR=./uploads MAX_FILE_SIZE=5242880 \# 5MB
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/webp

# Security

BCRYPT_ROUNDS=12 RATE_LIMIT_WINDOW=900000 \# 15 minutes
RATE_LIMIT_MAX=100 

---

## 43. Glossary of Terms

 Term Definition Turf A sports
ground/field that can be booked for playing sports Slot A specific time
block on a specific date for a specific turf Lock Temporary hold on a
slot during payment processing (10 min TTL) Hold Funds held in owner
wallet during cancellation window Payout Transfer of money from platform
to turf owner Withdrawal Owner's request to transfer wallet balance to
their bank/mobile wallet Commission Platform's cut of each booking
(percentage based) IPN Instant Payment Notification - SSLCommerz webhook
OTP One-Time Password - for verification KYC Know Your Customer -
verification documents VPS Virtual Private Server - hosting environment
RBAC Role-Based Access Control - permission system Idempotency Ability
to process same request multiple times without side effects TTL Time To
Live - expiration time for cache/lock BullMQ Job queue library for
Node.js PWA Progressive Web Application - can be installed on mobile
VAPID Voluntary Application Server Identification - for Web Push NID
National ID - Bangladeshi identity document bKash/Nagad/Rocket
Bangladeshi mobile financial services SSLCommerz Bangladeshi payment
gateway provider 

---

## 44. User Journey Maps

 Player Journey (End-to-End) Step
Action Touchpoint Success Criteria Failure Mode 1 Discover Turf Homepage
Search See relevant turfs No results found 2 Select Turf Turf Detail
Page View photos/amenities Missing information 3 Check Availability
Calendar View See open slots No slots available 4 Book Slot Booking Form
Price breakdown shown Payment gateway error 5 Pay SSLCommerz Redirect to
payment page Card declined 6 Confirm Success Page Booking reference
generated No confirmation email 7 Receive Reminder Email/Push Reminder 2
hours before Reminder not sent 8 Check-in Staff scans QR Booking marked
checked_in QR code not scanning 9 Complete Auto after end_time Status:
completed System didn't auto-complete 10 Review Booking History Rating
submitted Review not allowed 11 Cancel My Bookings Refund processed
Outside cancellation window Turf Owner Journey Step Action Touchpoint
Success Criteria Failure Mode 1 Register Signup Form Account created
Pending approval stuck 2 Submit KYC Owner Profile Documents uploaded
Document rejected 3 Admin Approval Email Notification Account activated
Approval delayed 4 Create Turf Turf Management Turf submitted Pending
review 5 Admin Turf Approval Admin Queue Turf goes live Turf rejected 6
Set Pricing Pricing Rules Slots generated Pricing conflict 7 Manage
Staff Staff Management Staff invited Permission error 8 View Bookings
Dashboard Calendar populated Bookings not showing 9 Request Withdrawal
Wallet Withdrawal submitted Minimum amount not met 10 Admin Withdrawal
Approval Admin Panel Funds transferred Withdrawal delayed 

---

## 45. Admin Action Workflows

 Turf Owner Approval Flow graph TD A[Owner registers]
--> B{Account created} B --> C[Status: PENDING_APPROVAL] C -->
D[Admin reviews application] D --> E{All documents valid?} E
-->\|Yes\| F[Approve account] E -->\|No\| G[Reject with reason] F
--> H[Account status: ACTIVE] G --> I[Account status: REJECTED] H
--> J[Owner can create turfs] I --> K[Owner receives rejection
email] K --> L[Owner can re-apply]

    style F fill:#90EE90
    style G fill:#FFB6C1

Withdrawal Approval Flow graph TD A[Owner requests withdrawal] -->
B[Check available balance] B --> C{Amount ≤ available?} C -->\|No\|
D[Reject: Insufficient funds] C -->\|Yes\| E[Create withdrawal
request] E --> F[Status: PENDING] F --> G[Admin reviews] G -->
H{Verify owner details?} H -->\|No\| I[Reject with reason] H
-->\|Yes\| J[Approve withdrawal] J --> K[Status: APPROVED] K -->
L[Admin initiates bank transfer] L --> M[Status: PAID] M -->
N[Deduct from wallet] N --> O[Send confirmation to owner]

    I --> P[Owner notified of rejection]
    P --> Q[Owner can re-apply]

    style J fill:#90EE90
    style I fill:#FFB6C1



---

## 46. CI/CD Pipeline

 yaml \# .github/workflows/deploy.yml name: Deploy to
    Coolify

on: push: branches: [main] pull_request: branches: [main]

jobs: test: runs-on: ubuntu-latest steps: - uses: actions/checkout@v3 -
uses: actions/setup-node@v3 with: node-version: '20' - run: yarn install
--frozen-lockfile - run: yarn test - run: yarn typecheck - run: yarn
lint

build-and-deploy: needs: test runs-on: ubuntu-latest if:
github.event_name == 'push' steps: - uses: actions/checkout@v3 - name:
Build Docker image run: docker build -t turfhub-backend:\${{ github.sha
}} . - name: Push to registry run: \| echo \${{ secrets.DOCKER_PASSWORD
}} \| docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
          docker tag turfhub-backend:${{ github.sha }} \${{
secrets.DOCKER_REGISTRY }}/turfhub-backend:latest docker push \${{
secrets.DOCKER_REGISTRY }}/turfhub-backend:latest - name: Trigger
Coolify Deploy run: \| curl -X POST ${{ secrets.COOLIFY_WEBHOOK_URL }} \
            -H "Content-Type: application/json" \
            -d '{"commit": "${{ github.sha }}"}'

---

## 47. Flexible Cancellation Policy Engine

This section defines a configurable, admin-managed cancellation policy
system that replaces the single hardcoded policy in Section 10.3 with a
resolvable hierarchy. **Section 10.3's default tiers remain the system's
built-in fallback ("Default Policy") — this engine is what lets the
admin override that default per turf or per owner, and manage multiple
named policies.**

### 47.1 Overview

- Admin can create, edit, and delete multiple cancellation policies from
  an admin UI screen — not just the one hardcoded default.
- Each policy has one or more **tiers**: a time-before-slot-start
  boundary paired with a refund percentage.
- A policy can be applied at three levels, resolved in priority order:
  1. **Turf-level** (highest priority) — a specific turf's own policy.
  2. **Owner-level** (medium priority) — applies to all of an owner's
     turfs that don't have their own turf-level override.
  3. **Default / Global policy** (lowest priority, fallback) — used when
     neither a turf-level nor owner-level policy is assigned.
- A **policy simulator** lets the admin test a policy against sample
  cancellation times before applying it, so they can see the resulting
  refund amounts without affecting real bookings.
- Every policy create/edit/delete/assign action is written to a
  dedicated audit trail (who, when, what changed, before/after values).

### 47.2 Policy Hierarchy

```
Turf Policy (highest priority)
    |
    v  (used only if no turf-level policy is assigned)
Owner Policy (medium priority)
    |
    v  (used only if no owner-level policy is assigned either)
Default Policy (lowest priority — always exists, system fallback)
```

```mermaid
graph TD
    A[Booking needs a refund calculated] --> B{Does the turf have its own policy?}
    B -->|Yes| C[Use Turf Policy]
    B -->|No| D{Does the owner have a policy?}
    D -->|Yes| E[Use Owner Policy]
    D -->|No| F[Use Default/Global Policy]
    C --> G[Apply matching tier by cancellation time]
    E --> G
    F --> G
    G --> H[Calculate refund percentage]
```

### 47.3 Example Policies

| Policy Name | Tiers |
|---|---|
| Standard (system default) | >24h: 100%, 6–24h: 50%, <6h: 0% |
| Liberal | >12h: 100%, 4–12h: 75%, <4h: 50% |
| Strict | >48h: 100%, 24–48h: 25%, <24h: 0% |
| Non-Refundable | Always 0% |
| Full Refund | Always 100% |

An owner running a premium/high-demand turf might apply "Strict" to
discourage last-minute cancellations, while a new turf trying to attract
first-time customers might use "Liberal."

### 47.4 Database Schema

```sql
-- The policy itself (name, description, ownership of the policy definition)
CREATE TABLE cancellation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,   -- exactly one row should be TRUE
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- The time-based refund tiers belonging to a policy
CREATE TABLE cancellation_policy_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES cancellation_policies(id) ON DELETE CASCADE,
  hours_before_start_min INTEGER NOT NULL,  -- inclusive lower bound, e.g. 6
  hours_before_start_max INTEGER CHECK (hours_before_start_max IS NULL OR hours_before_start_max > hours_before_start_min),  -- exclusive upper bound, NULL = "and beyond"
  refund_percentage DECIMAL(5,2) NOT NULL CHECK (refund_percentage BETWEEN 0 AND 100),
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Turf-level assignment (highest priority)
CREATE TABLE turf_cancellation_policies (
  turf_id UUID PRIMARY KEY REFERENCES turfs(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES cancellation_policies(id),
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMP DEFAULT NOW()
);

-- Owner-level assignment (medium priority)
CREATE TABLE owner_cancellation_policies (
  owner_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES cancellation_policies(id),
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMP DEFAULT NOW()
);

-- Audit trail for every policy change
CREATE TABLE cancellation_policy_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES cancellation_policies(id),
  action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'deleted', 'assigned_turf', 'assigned_owner', 'unassigned'
  actor_id UUID REFERENCES users(id),
  target_type VARCHAR(50),     -- 'turf', 'owner', 'policy'
  target_id UUID,
  before JSONB,
  after JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_policy_tiers_policy ON cancellation_policy_tiers(policy_id, sort_order);
CREATE INDEX idx_turf_policy_turf ON turf_cancellation_policies(turf_id);
CREATE INDEX idx_owner_policy_owner ON owner_cancellation_policies(owner_id);
CREATE INDEX idx_policy_audit_policy ON cancellation_policy_audit_logs(policy_id, created_at);

-- Exactly one default policy must exist — enforce at the application layer
-- (a partial unique index is the DB-level backstop):
CREATE UNIQUE INDEX idx_one_default_policy
  ON cancellation_policies (is_default)
  WHERE is_default = TRUE;
```

### 47.5 Policy Resolution Logic

```
function resolveCancellationPolicy(booking):
    turf = booking.turf
    if turf_cancellation_policies has an entry for turf.id:
        return that policy
    owner = turf.owner
    if owner_cancellation_policies has an entry for owner.id:
        return that policy
    return the policy where is_default = TRUE
```

This resolution must run **server-side, at the moment a refund is
calculated** — never cached indefinitely, since an owner or admin may
reassign a policy after a booking was made but before it's cancelled.
Always resolve against the *current* assignment unless the business
decides bookings should be pinned to the policy in effect at booking
time (if so, store `policy_id_snapshot` on the booking at confirmation
time instead of re-resolving on cancellation — pick one approach and be
consistent).

### 47.6 API Endpoints

```
GET    /api/admin/cancellation-policies              List all policies
POST   /api/admin/cancellation-policies              Create a policy (with tiers)
GET    /api/admin/cancellation-policies/:id          Get one policy + tiers
PATCH  /api/admin/cancellation-policies/:id          Update a policy/tiers
DELETE /api/admin/cancellation-policies/:id          Delete (blocked if it's the default or in use)

POST   /api/admin/cancellation-policies/:id/simulate  Test a policy against a sample
                                                       cancellation time, returns the
                                                       refund percentage/amount it would produce

POST   /api/admin/turfs/:turfId/cancellation-policy    Assign a policy to a turf
DELETE /api/admin/turfs/:turfId/cancellation-policy    Remove turf-level override (falls back to owner/default)

POST   /api/admin/owners/:ownerId/cancellation-policy  Assign a policy to an owner
DELETE /api/admin/owners/:ownerId/cancellation-policy  Remove owner-level override (falls back to default)
```

### 47.7 Admin UI Flow

1. **Policy List** — table of all policies (name, tier summary, how many
   turfs/owners use it, active/inactive toggle).
2. **Create/Edit Policy** — name, description, add/remove/reorder tiers
   (each tier: hours-before-start range + refund %). Validate tiers don't
   overlap and cover the full 0-to-infinity range without gaps.
3. **Policy Simulator** — a small form: "If cancelled X hours before
   start, this policy refunds Y%." Lets the admin sanity-check a policy
   before assigning it anywhere.
4. **Assign Policy** — from a turf's or owner's settings page, a dropdown
   to pick a policy (or "Use owner's policy" / "Use default policy" to
   clear an override).
5. **Audit Log Viewer** — filterable list of all policy changes.

### 47.8 Policy Simulator (conceptual)

```
Input: policy_id, hours_before_start (e.g. 18)
Output: {
  matched_tier: { hours_before_start_min: 6, hours_before_start_max: 24, refund_percentage: 50 },
  refund_percentage: 50,
  example_amounts: {
    turf_price: 1000,
    player_refund: 500,
    platform_keeps: 50   // for online bookings; for manual bookings, platform_fee only, no gateway line
  }
}
```

### 47.9 Validation Rules for Tiers

- Tiers must not overlap (e.g. two tiers both claiming the "10–20 hours"
  range is invalid).
- Tiers must not leave a gap — every possible cancellation time (from 0
  hours to infinity) must resolve to exactly one tier.
- The tier with `hours_before_start_max = NULL` represents "this many
  hours or more" and there must be exactly one such open-ended tier per
  policy (the highest one).
- `refund_percentage` must be between 0 and 100 inclusive.

### 47.10 Interaction with Owner-Initiated Cancellation

Regardless of which policy tier applies, an **owner-initiated**
cancellation always results in a full refund to the player (Section
10.3 / Business Rule 11) — the tiered policy only governs
**player-initiated** cancellations. This rule is not overridden by any
custom policy; it is a platform-wide guarantee to protect players from
owner unreliability.

### 47.11 Interaction with Admin Override

An admin can always force-cancel/force-refund a booking outside the
policy engine (Section 9, dispute handling) — this is logged as a manual
override in `cancellation_policy_audit_logs` with `action = 'admin_override'`
and must include a reason.

### 47.12 Migration Path from the Old Hardcoded Policy

1. On first deploy of this engine, seed exactly one `cancellation_policies`
   row with `is_default = TRUE`, named "Standard", using the Section
   10.3 default tiers (>24h: 100%, 6–24h: 50%, <6h: 0%).
2. No existing turf or owner gets an explicit assignment initially — they
   all fall back to this seeded default, so behavior does not change
   until an admin deliberately creates and assigns a different policy.
3. Do not delete or alter Section 10.3's description of the default
   tiers — it documents what ships in the seeded "Standard" policy.

### 47.13 Manual Booking Policy Resolution

Manual bookings use the **exact same policy resolution logic** as online
bookings (Section 47.5) — there is no separate policy system for manual
bookings.

**How it works for a manual booking:**

1. **Policy Resolution** — identical hierarchy: Turf Policy -> Owner
   Policy -> Default Policy. The fact that a booking is `manual_owner`
   or `manual_staff` sourced does not change which policy applies.
2. **Refund Calculation** — the only difference from an online booking's
   calculation is the absence of a gateway fee line item:
   - No gateway fee exists to deduct (it was never charged).
   - The platform fee is **non-refundable** on a player-initiated
     cancellation (matches the online-booking rule of the platform
     keeping its fee), but **is refunded** on an owner-initiated
     cancellation (full refund, since the owner is at fault).
3. **Payment Tracking** fields relevant to refund processing on a manual
   booking:
   - `booking_source`: `manual_owner` / `manual_staff` / `admin`
   - `payment_method`: `cash` / `bkash` / `nagad` / `rocket` /
     `bank_transfer`
   - `payment_status`: `paid` / `pending` / `partial`

```mermaid
graph TD
    A[Manual Booking Created] --> B[Resolve Cancellation Policy: Turf -> Owner -> Default]
    B --> C[Booking Confirmed]
    C --> D[Player Cancels]
    D --> E[Apply Matching Policy Tier]
    E --> F[Calculate Refund: no gateway fee to deduct]
    F --> G[Player Gets: Turf-Price-Portion - Platform Fee]
    G --> H[Admin Keeps: Platform Fee]
    H --> I[Owner Marks Refund as Paid Manually - cash/bKash/bank]
```

Since a manual booking's "payment" never actually passed through
SSLCommerz, a "refund" here is a bookkeeping action: the system
calculates the amount owed back to the customer, and the owner/staff who
collected the original payment is responsible for physically returning
it (cash, bKash send-money, bank transfer) and then marking the refund
as `completed` in the system with a reference note.


---

## 48. Phase-Wise Build Roadmap (Node.js / Express Stack)

This is the **execution order**. Each phase is small and self-contained.
Do not start a phase until the previous phase's "Done when" checklist is
fully true and tested. This keeps Google AI Studio focused on one small,
verifiable unit of work at a time instead of trying to build everything
at once.

### Phase 0 — Environment & Database Connection
- Initialize the Node.js + TypeScript + Express project skeleton.
- Set up `.env` handling (never hardcoded secrets — Section 4).
- Connect to the PostgreSQL instance (Coolify-hosted) using a
  connection pool (`pg` or an ORM's client).
- Add a `/health` endpoint that also checks DB connectivity.
- **Done when:** `GET /health` returns 200 and confirms a live DB
  connection, with zero business logic written yet.

### Phase 1 — Core Database Schema (Users, Turfs, Slots)
- Create migrations for: `users`, `turf_owner_profiles`, `turfs`,
  `turf_photos`, `slots` (Section 13).
- Run migrations against the real database.
- **Done when:** all five tables exist in PostgreSQL with correct
  columns/types/foreign keys, verified directly in the DB.

### Phase 2 — Auth: Registration & Login
- Implement player and turf-owner registration endpoints (Section 5.1).
- Password hashing (bcrypt), JWT access + refresh token issuing.
- **Done when:** you can register a player and a turf owner, log in, and
  receive a valid JWT — tested via a REST client (Postman/curl), not
  just "looks right in code."

### Phase 3 — Role-Based Access Control Middleware
- Middleware that validates JWT **and** re-checks the user's current
  role/status from the DB on every protected request (Section 5.2).
- **Done when:** a suspended user's old token is rejected immediately,
  and a player token cannot access an owner-only route.

### Phase 4 — Turf Submission & Admin Approval
- Turf owner: create/edit/list own turfs (`pending_review` status).
- Admin: list pending turfs, approve/reject (Section 9.2).
- **Done when:** a newly submitted turf is invisible in public search
  until an admin approves it.

### Phase 5 — Public Turf Search & Availability
- Public search/list/detail endpoints.
- Availability endpoint driven by the `slots` table.
- **Done when:** an unauthenticated request can browse turfs and see
  real open/booked slots for a given date.

### Phase 6 — Multi-Slot Locking (Redis) & Booking Creation
- Implement duration-based booking: player picks a start time + duration
  (1–5+ hours), backend resolves the exact list of consecutive `slots`
  needed and creates matching `booking_slots` rows (Section 10.1,
  Section 13).
- Redis-based 10-minute lock applied to **all required slots together,
  atomically** — not one-by-one.
- Background job (BullMQ) to release expired locks across all of a
  booking's slots at once.
- **Done when:** (a) two simultaneous booking attempts on the same slot
  — exactly one succeeds; (b) a 3-hour booking request that only has 2
  consecutive hours free is correctly rejected rather than partially
  booked; (c) a successful 5-hour booking creates exactly 5
  `booking_slots` rows and locks/confirms/releases them together.

### Phase 7 — SSLCommerz Payment Integration
- Payment initiation + redirect flow.
- IPN (webhook) endpoint with **server-to-server validation** before
  marking any booking `confirmed` (Section 12).
- Idempotent webhook handling — replaying the same IPN must not
  double-confirm a booking.
- **Done when:** a full SSLCommerz sandbox/test payment correctly
  confirms a booking, and resending the same IPN payload changes
  nothing.

### Phase 8 — Manual / Offline Booking
- Owner/staff endpoint to create a manual booking (Section 7.4).
- `booking_source`, `manual_bookings` table wiring, no gateway fee.
- **Done when:** an owner-created manual booking locks the same slot an
  online booking would, and shows up in the same booking list.

### Phase 9 — Cancellation Policy Engine
- CRUD for `cancellation_policies` + `cancellation_policy_tiers`
  (Section 47.4).
- Policy resolution logic: Turf → Owner → Default (Section 47.5).
- Policy simulator endpoint (Section 47.8).
- **Done when:** assigning a custom policy to one turf changes only
  that turf's refund calculation, without affecting others.

### Phase 10 — Cancellation & Refund Execution
- Player/owner cancellation endpoints applying the resolved policy.
- Refund recording (`refunds` table), gateway-fee-never-refunded rule
  enforced (Section 10.3).
- **Done when:** cancelling at each time tier (>24h, 6–24h, <6h, and
  owner-initiated) produces exactly the refund amounts in your test
  matrix — for both online and manual bookings.

### Phase 11 — Wallet & Withdrawal System
- Derived wallet balance calculation (Section 11) — never a blindly
  incremented stored number.
- Withdrawal request → admin approval → balance deduction flow.
- **Done when:** an owner cannot withdraw funds still inside an active
  cancellation hold window, and the balance is correct after a refund.

### Phase 12 — Staff Role & Scoped Permissions
- Staff creation by owner, turf-scoped data access enforced at the
  query level (Section 8).
- **Done when:** a staff account genuinely cannot retrieve another
  turf's data, even by guessing IDs directly in API calls.

### Phase 13 — Admin Dashboard
- User management, turf approval queue, withdrawal approval, revenue
  reports, platform settings (Section 9).
- **Done when:** every admin action listed in Section 9 has a working,
  properly authorized endpoint.

### Phase 14 — Notifications, Reviews, Search Polish
- Booking confirmation/reminder via Web Push + email (Postal SMTP) +
  SMS (bulksmsbd.co).
- Reviews after `completed` bookings only.
- Search filters (location, sport type, price, rating).

### Phase 15 — Security Hardening & Test Pass
- Rate limiting on auth and payment-initiation endpoints.
- Full manual RBAC walkthrough — attempt to access data you shouldn't
  as each role, confirm every attempt is blocked.
- Input validation review on every endpoint (no client-trusted
  amounts/roles).
- **Done when:** you (or a tester) cannot find a single role-boundary or
  input-validation gap after a deliberate attempt to break it.

### Phase 16 — Migration Off Google AI Studio & Deployment (MVP Launch)
- Confirm the codebase has **zero** Google AI Studio–specific runtime
  dependencies (Section 1.1, System Architecture, Infrastructure
  Independence, Security, and Scalability).
- Write the Dockerfile, configure Coolify environment variables.
- Deploy backend + frontend to the VPS, point at the Coolify-managed
  PostgreSQL and Redis.
- Full smoke test of the entire booking → payment → cancellation →
  refund → withdrawal flow in the production environment.
- **Done when:** the application runs correctly on the VPS with Google
  AI Studio completely disconnected/unavailable.

**This is the MVP launch line.** Phases 0–16 are everything required
to go live. Phases 17+ below are Phase 2 (post-launch) features — all
shipped code-complete but behind feature flags (Section 52.3)
**default OFF**, so building them does not delay or risk the MVP
launch above.

---

### Phase 17 — Feature Flags Foundation
- `feature_flags` table + seed (all `FALSE`), `requireFeatureFlag()`
  middleware, admin list/toggle endpoints with audit logging
  (Section 52.3).
- **Non-regression check:** confirm every MVP endpoint from Phases
  1–16 still works completely normally with zero flags touched — this
  phase only adds new admin capability, it must not alter any existing
  route's behavior.
- **Done when:** an admin can toggle any seeded flag and see the
  change reflected (via cache invalidation) within the 60s TTL, with
  zero impact on any MVP feature.

### Phase 18 — Player Squad / Matchmaking (Section 49)
- Implement fully, gated by `squad_enabled` (default OFF).
- **Non-regression check:** re-run Phase 6/7/10 booking, payment, and
  cancellation "Done when" tests — a booking that gets an Open Match
  posted on it, then cancelled, must still refund correctly per
  Section 47, completely unaffected by the squad layer.
- **Done when:** Section 49's Definition of Done (49.10) passes, and
  with `squad_enabled = FALSE` the feature is fully invisible with no
  behavior change to anything else.

### Phase 19 — Tournament (Section 50)
- Implement fully, gated by `tournament_enabled` (default OFF).
- **Non-regression check:** verify a turf with an active tournament
  correctly blocks the reserved slots from public booking (Phase 5/6),
  and that cancelling the tournament correctly releases those slots
  back to normal availability — re-test Phase 6's double-booking
  protection specifically against tournament-blocked slots.
- **Done when:** Section 50's Definition of Done (50.9) passes, and
  with `tournament_enabled = FALSE` no tournament UI or data leaks
  into the normal booking flow.

### Phase 20 — Booking Add-ons (Section 51)
- Implement fully, gated by `addons_enabled` (default OFF).
- **Non-regression check:** this phase touches the `bookings` pricing
  calculation directly (Section 51.5 extends Section 10.2's formula).
  Re-run Phase 7 (payment), Phase 9 (policy engine), and Phase 10
  (refund execution) tests for a booking with **zero** add-ons and
  confirm amounts are identical to before this phase — the formula
  must degrade to the original `base_amount`-only calculation when
  `addon_total = 0`.
- **Done when:** Section 51's Definition of Done (51.13) passes, and a
  plain booking with no add-ons produces byte-identical pricing to a
  Phase 7-era booking.

### Phase 21 — Paid Features Listing & Home Page Discovery (Sections 52, 53)
- Implement Feature Flags' remaining flags, Platform Credits, Featured
  Turf Listing, and the 5-section home page discovery logic — gated by
  `featured_turf_enabled`, `trending_enabled`, `near_you_enabled`
  (all default OFF).
- **Non-regression check:** confirm Section 53.6 (All Turfs) — the
  only always-on discovery section — still returns correct, unfiltered
  results when all three discovery flags are OFF; this is what every
  real user sees at MVP launch and must not regress as these flags are
  built out.
- **Done when:** Section 52's Definition of Done (52.13) and Section
  53's Definition of Done (53.16) both pass, and turning
  `featured_turf_enabled` OFF after listings exist hides them from the
  home page without cancelling them or affecting their timers
  (Section 52.4).

---

### 48.1 How to Instruct Google AI Studio Per Session

Start every working session with a message like:

> "Read AGENTS.md fully, especially the Table of Contents, the Scope
> Rule, the Non-Regression Rule, and Section 48. We are on Phase N.
> Only build what Phase N requires — do not implement later phases
> yet. Before declaring Phase N done, re-verify the 'Done when'
> criteria of the phases immediately before it, per the Non-Regression
> Rule. Tell me when Phase N's own 'Done when' criteria is met so I
> can verify before we continue."

This keeps each session scoped to one small, testable increment
instead of attempting the whole platform at once, and keeps new work
from silently breaking what already worked.

---

## 49. Player Squad / Matchmaking (Phase 2 — not MVP)

### 49.1 Overview

A community feature: a player who has **already booked a turf slot**
(the "captain") can post an "Open Match" so other players can join
their squad (finding missing teammates for 5v5/7v7/6v6 games). This
solves a real problem people currently solve over Facebook/WhatsApp.

**This feature is purely social.** It creates zero new financial
transactions — see 49.2, this is non-negotiable.

### 49.2 Hard Financial Boundary (CRITICAL — read before building)

The only financially-binding record is the captain's original booking
(Sections 10/47, unchanged). Squad/join actions must **never**:

- Create a `bookings`, `payments`, `refunds`, or `wallet_transactions` row
- Calculate/charge commission, platform fee, or gateway fee
- Hold funds in escrow or split payment between captain and participants
- Let a participant open a refund dispute against the platform

Participants settle payment with the captain **offline** (cash/bKash/
bank) — the platform is a discovery medium only, never a party to that
money. If any squad code path touches money, that's a bug.

**Feature flag:** this feature is gated by `squad_enabled` (Section
52.3). It ships **DISABLED by default**. All squad endpoints must check
the flag server-side and return 404 if disabled. Turning the flag off
preserves all existing data.

### 49.3 Database Schema

```sql
CREATE TABLE open_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  captain_id UUID NOT NULL REFERENCES users(id),
  sport_type VARCHAR(50) NOT NULL,        -- snapshot from turf
  skill_level VARCHAR(50) NOT NULL CHECK (skill_level IN ('casual', 'intermediate', 'competitive')),
  max_players INTEGER NOT NULL CHECK (max_players >= 2),
  joined_count INTEGER NOT NULL DEFAULT 1,  -- captain counts as 1
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'full', 'closed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE match_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES open_matches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES users(id),
  joined_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'joined' CHECK (status IN ('joined', 'left', 'removed')),
  UNIQUE (match_id, player_id)
);

CREATE INDEX idx_open_matches_status ON open_matches(status, created_at);
CREATE INDEX idx_open_matches_booking ON open_matches(booking_id);
CREATE INDEX idx_match_participants_match ON match_participants(match_id, status);
```

### 49.4 Business Rules

1. Only the captain (booking owner) can post/edit/delete an Open Match
   for their own booking. One booking → at most one Open Match.
2. Posting requires the booking to be `confirmed` and the slot's start
   time to be in the future.
3. `joined_count >= max_players` → status auto-flips to `full`, "Join"
   disabled.
4. Captain can remove a participant anytime; a participant can leave
   voluntarily. Removed/left players cannot rejoin unless the captain
   re-invites.
5. If the captain cancels the underlying booking (normal Section 10/47
   flow), the Open Match auto-cancels and participants are notified —
   but they get **no refund from the platform** (49.2).
6. A scheduled job auto-marks the match `closed` 30 minutes after the
   slot's `end_time` if not already closed/cancelled.
7. Feature must be toggleable off globally from platform settings
   (Section 9), in case of abuse.

### 49.5 API Endpoints

```
GET    /api/open-matches                              List (filters: area, sport, date, skill)
GET    /api/open-matches/:id                          Match detail + participants

POST   /api/player/bookings/:bookingId/open-match      Create (captain only)
PATCH  /api/open-matches/:id                            Update (captain only)
DELETE /api/open-matches/:id                            Cancel (captain only)
DELETE /api/open-matches/:id/participants/:playerId     Remove participant (captain only)

POST   /api/open-matches/:id/join                       Join (any player, not captain)
POST   /api/open-matches/:id/leave                      Leave

GET    /api/player/open-matches                         My created/joined matches
```
All require auth; ownership checks enforced server-side (Section 12).

### 49.6 Home Page Display

A "Looking for Teammates?" section (card grid: sport, area, turf, date/
time, skill level, captain's first name, "Needs N players", Join
button), plus a "View All Squads" link to the full list. Uses existing
notification infra (Section 26) for join/full/cancelled events —
in-app only, except cancellation and the 2-hour-before reminder, which
also go by email.

### 49.7 Terms of Service Requirement

Add a ToS clause: *"Open Matches are a community feature. TurfHub is
not a party to any payment between a match captain and participants —
they settle directly. TurfHub does not hold, refund, or mediate such
payments."* Show a one-time checkbox on "Join Match": *"I understand
payment is settled directly with the captain, not with TurfHub."*

### 49.8 Explicitly Out of Scope

In-app chat, payment splitting/escrow, tracking whether participants
paid the captain, refunding participants, adjudicating captain/
participant disputes, skill verification, participant ratings,
recurring matches/leagues. (Follows the Scope Rule at the top of this
file — propose a new section first if any of these are ever wanted.)

### 49.9 Phase & Dependencies

**Phase 2 — not required for MVP.** Build only after Phase 1 is done:
Auth/RBAC, turf + booking flow, SSLCommerz payment, cancellation/
refund, wallet/withdrawal. Do not pull this into Phase 1 — it has zero
dependency for launch and would only delay it.

### 49.10 Definition of Done

- [ ] `open_matches` + `match_participants` migrated
- [ ] Captain can post an Open Match from a confirmed booking
- [ ] Public list + detail endpoints with filters
- [ ] Home page section + "View All Squads" list render correctly
- [ ] Join/Leave/Remove-participant work with correct auth checks
- [ ] `joined_count`/`status` auto-update correctly
- [ ] Booking cancellation auto-cancels the linked Open Match
- [ ] No code path here touches bookings/payments/refunds/wallets
      (except the read-only `booking_id` FK)
- [ ] Feature flag exists in platform settings
- [ ] ToS clause published + join checkbox enforced
- [ ] Duplicate-join prevented by the UNIQUE constraint

---

## 50. Tournament (Simple Version — Phase 2, not MVP)

### 50.1 Overview

Lets a turf owner (or admin) organize a tournament at their turf:
create the event, let teams register, schedule matches across the
turf's slots, and record results/standings. **Entry fee and prize
money are informational only — the platform does not collect, hold,
or distribute this money** (organizer handles it offline or via a
third-party link). This keeps Tournament as simple and low-risk as the
Squad feature (Section 49) — same financial-boundary approach.

### 50.2 Hard Financial Boundary

Same principle as Section 49.2:
- No `payments`, `refunds`, or `wallet_transactions` row is ever
  created for tournament registration.
- `entry_fee_amount` and `prize_pool_note` are just **display text**
  the organizer sets — a team's captain pays the organizer offline
  (cash/bKash/bank) or via a link the organizer provides elsewhere.
- The platform never verifies who has paid the entry fee. That's the
  organizer's responsibility.

**Feature flag:** this feature is gated by `tournament_enabled`
(Section 52.3). It ships **DISABLED by default**. All tournament
endpoints must check the flag server-side and return 404 if disabled.
Turning the flag off preserves all existing data and releases any
blocked slots from cancelled tournaments.

### 50.3 Database Schema

```sql
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id UUID NOT NULL REFERENCES turfs(id),
  organizer_id UUID NOT NULL REFERENCES users(id),  -- turf owner or admin
  name VARCHAR(150) NOT NULL,
  sport_type VARCHAR(50) NOT NULL,
  format VARCHAR(50),                 -- e.g. 'knockout', 'round_robin' (free text for MVP)
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  max_teams INTEGER NOT NULL CHECK (max_teams >= 2),
  entry_fee_amount DECIMAL(10,2),     -- display only, not charged by platform
  prize_pool_note TEXT,               -- display only, e.g. "1st place: 10,000 TK"
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'registration_closed', 'ongoing', 'completed', 'cancelled')),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tournament_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  captain_id UUID NOT NULL REFERENCES users(id),
  team_name VARCHAR(100) NOT NULL,
  roster_notes TEXT,                  -- free-text player list for MVP, no per-player rows needed
  status VARCHAR(20) NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'withdrawn', 'disqualified')),
  registered_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (tournament_id, team_name)
);

CREATE TABLE tournament_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_name VARCHAR(50),             -- e.g. 'Quarter-final', 'Group A - Match 2'
  team_a_id UUID REFERENCES tournament_teams(id),
  team_b_id UUID REFERENCES tournament_teams(id),
  scheduled_date DATE,
  scheduled_start_time TIME,
  scheduled_end_time TIME,
  slot_id UUID REFERENCES slots(id),  -- optional link if this match reserves a turf slot
  score_a INTEGER,
  score_b INTEGER,
  winner_team_id UUID REFERENCES tournament_teams(id),
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tournaments_turf ON tournaments(turf_id, status);
CREATE INDEX idx_tournament_teams_tournament ON tournament_teams(tournament_id);
CREATE INDEX idx_tournament_matches_tournament ON tournament_matches(tournament_id, scheduled_date);
```

### 50.4 Business Rules

1. Only the **turf owner** (of the linked turf) or **admin** can create/
   edit/cancel a tournament.
2. A team registers with a captain + team name + free-text roster notes
   (no per-player accounts required for MVP — keeps this simple).
3. Registration closes automatically at `start_date`, or manually via
   `registration_closed` status set by the organizer.
4. If a `tournament_matches` row reserves a `slot_id`, that slot must be
   blocked from public booking for that date/time (mark the underlying
   `slots.status = 'blocked'`, same mechanism already used for owner
   maintenance blocks — Section 7.3).
5. The organizer manually enters match schedule and results — **no
   automatic bracket-generation engine for MVP** (that's a later,
   separate enhancement if ever needed — propose it as a new section
   first, per the Scope Rule).
6. A team can be marked `withdrawn` or `disqualified` by the organizer;
   this does not trigger any refund logic (Section 50.2).
7. Cancelling a tournament cancels all its `scheduled` matches and
   releases any blocked slots back to `available`.
8. Feature must be toggleable off globally from platform settings
   (Section 9), same as Section 49.

### 50.5 API Endpoints

```
GET    /api/tournaments                          Public list (filters: area, sport, status)
GET    /api/tournaments/:id                      Detail (teams, matches, standings)

POST   /api/owner/tournaments                     Create (owner/admin, own turf only)
PATCH  /api/owner/tournaments/:id                 Update / close registration / cancel
POST   /api/owner/tournaments/:id/matches          Add/edit a match (schedule, score, winner)

POST   /api/tournaments/:id/register               Register a team (any player, becomes captain)
DELETE /api/tournaments/:id/teams/:teamId          Withdraw a team (captain or organizer)

GET    /api/player/tournaments                      Tournaments I registered a team for
```
All require auth; ownership/role checks enforced server-side (Section 12).

### 50.6 Standings (Simple, MVP)

A basic table computed from `tournament_matches`: team name, matches
played, wins, losses, points (if the organizer wants a league-style
scoring — simplest default: win = 3 pts, draw = 1, loss = 0). Computed
on read, no separate standings table needed for MVP.

### 50.7 Explicitly Out of Scope

Automatic bracket generation, in-app entry fee collection or prize
distribution, prize-money escrow, live match commentary/scoreboard,
per-player statistics, team chat, multi-turf tournaments spanning
different venues. (Per the Scope Rule — propose a new section first if
any of these are ever wanted.)

### 50.8 Phase & Dependencies

**Phase 2 — not required for MVP**, same as Section 49. Build after
Phase 1 (Auth/RBAC, turf + booking flow, payment, cancellation/refund,
wallet/withdrawal) is complete.

### 50.9 Definition of Done

- [ ] `tournaments`, `tournament_teams`, `tournament_matches` migrated
- [ ] Owner/admin can create a tournament for their own turf
- [ ] Teams can register with captain + team name
- [ ] Organizer can add/edit match schedule and enter results
- [ ] A match's linked slot correctly blocks that slot from public booking
- [ ] Standings compute correctly from match results
- [ ] Cancelling a tournament releases all blocked slots
- [ ] No code path here touches payments/refunds/wallets
- [ ] Feature flag exists in platform settings
- [ ] Only turf owner (own turf) or admin can manage a tournament

---

## 51. Booking Add-ons (Phase 2 — not MVP)

### 51.1 Overview

Booking Add-ons let a turf owner offer optional paid extras (ball
rental, bibs/jerseys, referee service, water bottles, photography,
etc.) that a player attaches to a slot booking at checkout. An add-on
is **a line item on the existing booking — never a separate booking,
payment, or transaction.**

This design keeps the financial core untouched:
- Section 47 (Cancellation Policy Engine) is **not modified in any
  way** — it already resolves refunds against a booking's total
  amount, so add-ons are covered automatically with zero new policy
  logic.
- Section 11 (Wallet), Section 22 (Booking State Machine), and Section
  23 (Disputes) are **not modified**.
- Sections 1–9, 12, 24–33, 35–50 are **not modified**.

### 51.2 Core Principle (READ FIRST)

**An add-on is a line item on a booking, not a separate entity.**

- Player selects add-ons while booking a slot — same transaction, same
  payment, same SSLCommerz call.
- Add-on amounts sum into the booking's `addon_total` column
  (Section 13).
- Platform fee and gateway fee are calculated on
  `(base_amount + addon_total)`, not `base_amount` alone.
- The owner's `net_owner_amount` includes the add-on portion (minus
  the platform's cut on that portion).
- If the booking is cancelled, add-ons are cancelled and refunded
  automatically as part of the booking's normal refund calculation
  (Section 47) — there is no separate add-on refund process.

**Feature flag:** this feature is gated by `addons_enabled` (Section
52.3). It ships **DISABLED by default**. All add-on endpoints must
check the flag server-side and return 404 if disabled. Turning the
flag off does NOT affect already-confirmed bookings with recorded
add-ons — their pricing is frozen at booking time.

### 51.3 Turf Owner Management (Section 7 enrichment)

An owner may add zero or more add-ons per turf, either during turf
onboarding (Section 7.1) or later from the turf management dashboard.
Each add-on has:

- **Name** (max 100 chars)
- **Description** (optional, short text)
- **Category**: `equipment` | `service` | `food` | `other`
- **Price** (BDT, ≥ 0)
- **Stock quantity** (optional; `NULL` = unlimited)
- **Active/inactive** toggle
- **Display order** (for sorting in the player-facing list)

Owners can create, edit, delete, reorder, and toggle add-ons at any
time. Editing an existing add-on's price/name never changes
already-confirmed bookings (Section 51.4 snapshotting, Business
Rule 40).

### 51.4 Database Schema

The three new tables and the one new `bookings` column are already
reflected in Section 13's main schema block and Section 13.2's index
list. Summary for reference:

- `turf_addons` — owner-defined add-on catalog per turf.
- `booking_addons` — immutable, **snapshotted** line items recorded
  against a specific booking (`addon_name_snapshot`,
  `addon_price_snapshot` capture the values at booking time, so later
  catalog edits never retroactively change a past booking's amounts).
- `turf_addon_inventory_log` — an audit trail of stock movements for
  stock-limited add-ons (decrement on booking, increment on
  cancellation, manual adjustment by the owner).
- `bookings.addon_total` — the sum of that booking's `booking_addons`,
  used directly in the pricing formula (Section 51.5).

### 51.5 Pricing Formula (extends Section 10.2)

```
base_amount         = turf price for the booked slot(s)
addon_total         = sum of booking_addons.total_price
subtotal            = base_amount + addon_total
platform_fee_amount = subtotal × platform_fee_percentage
gateway_fee_amount  = subtotal × gateway_fee_percentage   (online only, 0 for manual)
net_owner_amount    = subtotal - platform_fee_amount - gateway_fee_amount
total_payable       = subtotal + platform_fee_amount + gateway_fee_amount
```

**Worked example (turf price 1,000 TK, add-ons 250 TK, platform fee
5%, gateway fee 2.5%, online booking):**

| Item | Amount |
|---|---|
| Turf Price | 1,000 TK |
| Add-ons | 250 TK |
| Subtotal | 1,250 TK |
| Platform Fee (5%) | 62.50 TK |
| Gateway Fee (2.5%) | 31.25 TK |
| **Total Payable** | **1,343.75 TK** |

### 51.6 Refund Impact (extends Section 10.3 — logic unchanged)

The tier logic in Section 10.3 (>24h / 6–24h / <6h / owner-cancels) is
**not changed**. Only the amounts differ because the booking total now
includes add-ons.

**Worked example (turf price 1,000 TK, add-ons 250 TK, platform fee
62.50 TK, gateway fee 31.25 TK):**

| Scenario | Player Refund | Admin Keeps (Platform Fee) | Gateway Fee |
|---|---|---|---|
| Player cancels (>24h) | 1,250 TK | 62.50 TK | 31.25 TK (kept by SSLCommerz) |
| Player cancels (6–24h) | 625 TK | 62.50 TK | 31.25 TK (kept by SSLCommerz) |
| Player cancels (<6h) | 0 TK | 62.50 TK | 31.25 TK (kept by SSLCommerz) |
| Owner cancels | 1,281.25 TK | 0 TK | 31.25 TK (kept by SSLCommerz) |

Section 47's policy engine requires **zero changes** to produce this —
it already operates on the booking's total amount.

### 51.7 Stock / Inventory Behavior (decision confirmed with product owner)

- If `stock_quantity` is `NULL`, the add-on is always purchasable
  (subject to `is_active`).
- If `stock_quantity` is set, **available stock** = `stock_quantity -
  (sum of quantity across all bookings with status in
  ('pending_payment', 'confirmed', 'completed') for that add-on)`.
- **When available stock reaches 0, the add-on remains VISIBLE in the
  player's add-on list but is shown in a disabled "Out of stock"
  state** — it is never hidden entirely. This was a deliberate product
  decision: hiding a previously-seen add-on is more confusing to a
  player than showing it as temporarily unavailable.
- Stock is decremented at booking **confirmation** (not at
  `pending_payment`, to avoid holding stock hostage to abandoned/
  expired payment attempts — mirrors the slot-lock pattern in Section
  10.1, though add-on stock does not need the same hard Redis lock
  since a brief oversell race is a low-cost, recoverable business
  problem, unlike a double-booked slot).
- On booking cancellation/refund, stock is incremented back
  automatically, logged in `turf_addon_inventory_log` with
  `change_type = 'increment'`.
- The owner can manually adjust stock (`change_type = 'adjustment'`)
  from the dashboard, e.g. to correct a physical inventory count.

### 51.8 API Endpoints

```
# Owner manages add-ons
POST   /api/owner/turfs/:turfId/addons              Create add-on
GET    /api/owner/turfs/:turfId/addons              List add-ons (incl. inactive, for management)
PATCH  /api/owner/turfs/:turfId/addons/:id          Update add-on
DELETE /api/owner/turfs/:turfId/addons/:id          Delete add-on

# Public — player views add-ons on turf detail page
GET    /api/turfs/:turfId/addons                    Public list: active only, includes available_stock
                                                     per add-on so the frontend can render out-of-stock
                                                     items as disabled rather than filtering them out
```

**Modified existing endpoint** — `POST /api/player/bookings` now
accepts an optional `addons` array:

```json
{
  "slot_id": "uuid",
  "turf_id": "uuid",
  "addons": [
    { "addon_id": "uuid", "quantity": 1 },
    { "addon_id": "uuid", "quantity": 2 }
  ]
}
```

The backend must re-validate stock and price **server-side** at
booking time regardless of what the frontend displayed — never trust
a client-submitted `total_price`. The response includes the add-on
breakdown and updated pricing fields (`addon_total`,
`platform_fee_amount`, `gateway_fee_amount`, `total_payable`).

### 51.9 UI Changes

**New:**
- Owner Dashboard → My Turfs → [Turf] → Add-ons (create/edit/delete/
  reorder/toggle)
- Turf Detail Page (player view) — add-on selector before "Book Now",
  with out-of-stock items shown disabled (Section 51.7)
- Booking Confirmation — itemized add-ons with prices
- Owner Booking Detail — "Add-ons to prepare" checklist

**Modified:**
- Player Booking Detail — add-on line items in the payment breakdown

**Unchanged:** all auth screens, all admin screens (no add-on
moderation in this MVP — may be considered later as its own proposed
section), wallet/withdrawal screens, dispute screens. Staff can view
add-ons on a booking if they already have `booking.view` permission
for that turf (Section 8) — they cannot create/edit add-on
definitions.

### 51.10 Explicitly Out of Scope

Separate bookings/payments/refunds/wallet entries for add-ons,
physical shipping or delivery, returns/exchanges, a third-party
add-on marketplace (add-ons are owner-created only), admin add-on
moderation (may be proposed later as its own section per the Scope
Rule).

### 51.11 Business Rules

See Section 34, rules 37–40 (Booking Add-on Rules), which are the
authoritative rule set for this feature.

### 51.12 Phase & Dependencies

**Phase 2 — not required for MVP**, same as Sections 49 and 50. Build
after Phase 1 (Auth/RBAC, turf + booking flow, SSLCommerz payment,
cancellation/refund, wallet/withdrawal) is complete.

### 51.13 Definition of Done

- [ ] `turf_addons`, `booking_addons`, `turf_addon_inventory_log`
      tables migrated; `bookings.addon_total` column migrated
- [ ] Owner can create/edit/delete/reorder/toggle add-ons from the
      turf dashboard
- [ ] Turf onboarding includes an optional add-on step
- [ ] Player turf detail page shows active add-ons, with out-of-stock
      items visibly disabled (not hidden)
- [ ] Player booking form accepts add-on selection; server
      re-validates stock and price independently of client input
- [ ] Booking price calculation includes add-ons server-side
      (`platform_fee`/`gateway_fee` on the combined subtotal)
- [ ] Booking confirmation and owner booking detail both display
      add-ons correctly
- [ ] Booking cancellation automatically cancels + refunds add-ons via
      the existing Section 47 engine — verified with the Section 51.6
      worked example
- [ ] Stock decrements on confirmation, increments on
      cancellation/refund, logged in `turf_addon_inventory_log`
- [ ] Add-on name/price are snapshotted at booking time; later catalog
      edits never change an existing booking's recorded amounts
- [ ] **Section 47 verified byte-for-byte unchanged**
- [ ] **Sections 1–9, 11, 12, 22–33, 35–50 verified unchanged** apart
      from the explicitly listed targeted edits in Sections 10.2,
      10.3, 13, 13.2, 14, 17, and 34
- [ ] RBAC: only the turf's own owner can manage that turf's add-ons;
      staff with `booking.view` can see but not edit add-ons on
      bookings

---

## 52. Feature Flags & Paid Features Listing (Phase 2 — not MVP)

### 52.1 Overview

This section defines two things:

1. A **global feature flag system** that gates every optional feature
   (Squad, Tournament, Booking Add-ons, Paid Features Listing). All
   flags default to **DISABLED**. System Admin controls them at
   runtime — no redeployment needed to turn a feature on/off.
2. **Paid Features Listing** — a paid promotional layer letting turf
   owners pay to boost their turf's visibility. It reuses existing
   payment infrastructure and does not touch the booking financial
   core (Sections 10, 11, 22, 47).

Both are Phase 2. Neither is required for MVP launch.

### 52.2 Design Principles (READ BEFORE BUILDING)

1. **All optional features ship DISABLED by default.** Deploying the
   code does not activate the feature — only an admin toggling the
   flag does.
2. **Feature flags are enforced server-side.** Never trust the
   frontend to hide a disabled feature. Every public endpoint for a
   flagged feature must check the flag and return 404 (or an empty
   list) if off.
3. **Turning a flag off never deletes data.** The feature just
   becomes inaccessible; turning it back on restores full access.
4. **Paid features reuse existing infrastructure.** No new payment
   gateway, no new financial core. Featured listing payments use the
   existing `payments` table (nullable `booking_id`).
5. **Section 47 is NOT modified.** Featured listing cancellations use
   a separate credit-based model (Section 52.9), never Section 47's
   policy engine.
6. **Cancellations issue platform credits, not cash refunds**
   (Section 52.9) — this keeps the money flow simple and avoids a new
   gateway-refund path.

### 52.3 Feature Flags (Foundation)

A single source of truth for which optional features are active
platform-wide. Every flag is a boolean, default `FALSE`.

| Flag Key | Gates |
|---|---|
| `addons_enabled` | Booking Add-ons (Section 51) |
| `squad_enabled` | Player Squad / Matchmaking (Section 49) |
| `tournament_enabled` | Tournament (Section 50) |
| `featured_turf_enabled` | Featured Turf Listing (Section 52.5) |
| `featured_addon_enabled` | Featured Add-on Listing (reserved, Phase 3) |
| `whatsapp_enabled` | Reserved for future |
| `trending_enabled` | "Trending Now" home page section (Section 53.4) |
| `near_you_enabled` | "Near You" home page section (Section 53.5) |

**Behavior:**
- If a flag is off, the corresponding public endpoints return 404 (or
  empty list) and UI elements are hidden.
- Owner-facing endpoints return 403 with a `feature_disabled` error
  code if an owner tries to access a disabled feature.
- Existing data is preserved when a flag is off.
- Every toggle writes to `audit_logs` (Section 29) with actor_id,
  before/after values, timestamp.
- Flags are checked via a `requireFeatureFlag('flag_key')` middleware
  reading from a short-lived Redis cache (TTL 60s, invalidated on
  toggle).

```sql
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key VARCHAR(100) UNIQUE NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,   -- default DISABLED
  description TEXT,
  enabled_by UUID REFERENCES users(id),
  enabled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_feature_flags_key ON feature_flags(flag_key);

-- Seed on first deploy (all FALSE)
INSERT INTO feature_flags (flag_key, is_enabled, description) VALUES
  ('addons_enabled',         FALSE, 'Booking Add-ons (Section 51)'),
  ('squad_enabled',          FALSE, 'Player Squad / Matchmaking (Section 49)'),
  ('tournament_enabled',     FALSE, 'Tournament (Section 50)'),
  ('featured_turf_enabled',  FALSE, 'Featured Turf Listing (Section 52.5)'),
  ('featured_addon_enabled', FALSE, 'Featured Add-on Listing (Phase 3)'),
  ('whatsapp_enabled',       FALSE, 'Reserved for future'),
  ('trending_enabled',       FALSE, '"Trending Now" home page section (Section 53.4) — enable once enough booking volume exists'),
  ('near_you_enabled',       FALSE, '"Near You" home page section (Section 53.5) — enable once enough turf density exists');
```

```
GET    /api/admin/feature-flags                 List all flags
PATCH  /api/admin/feature-flags/:key            Toggle a flag on/off
```
`PATCH` body: `{ "is_enabled": true, "reason": "Launch of paid features" }`
— response includes the updated flag and the audit log entry ID.

### 52.4 Flag Integration Across Existing Sections

When a flag is off, the corresponding feature's endpoints/UI are
inaccessible but code and data remain intact.

- **Section 49 (Squad)** — gated by `squad_enabled`. Off: `/api/open-matches/*`
  return 404; home "Looking for Teammates?" section and "Post Open
  Match" button hidden. Data in `open_matches`/`match_participants`
  preserved.
- **Section 50 (Tournament)** — gated by `tournament_enabled`. Off:
  `/api/tournaments/*` return 404; owner tournament management hidden;
  any blocked slots from cancelled tournaments are released. Data
  preserved.
- **Section 51 (Booking Add-ons)** — gated by `addons_enabled`. Off:
  add-on endpoints return 404; add-on selector and management screen
  hidden. **Already-confirmed bookings with recorded add-ons are
  unaffected** — the flag only gates new add-on creation/selection.
- **Section 52.5 (Featured Turf Listing)** — gated by
  `featured_turf_enabled`. Off: home "Featured Turfs" section hidden,
  `/api/home/featured-turfs` returns empty, new purchases blocked.
  **Existing active listings are hidden from the home page but their
  timers keep running** — toggling the flag off does NOT cancel
  listings, issue credits, or extend `ends_at`. Admin must consider
  this before toggling off.

### 52.5 Featured Turf Listing

A turf owner pays a flat fee to promote their turf in the home page's
"Featured Turfs" section, in search results (priority sort), and with
a "Featured" badge on the turf detail page. Gated by
`featured_turf_enabled` (default OFF).

**Packages (admin-configurable, suggested defaults):**

| Package | Price (BDT) | Duration | Priority |
|---|---|---|---|
| Spotlight | 500 | 7 days | 3rd |
| Boost | 1,500 | 30 days | 2nd |
| Banner | 5,000 | 30 days | 1st |

A turf cannot have two overlapping active featured listings.

**Purchase flow:** owner selects a package → may apply available
platform credits (Section 52.8) to reduce the cash amount → pays the
cash portion via SSLCommerz (existing flow) → listing enters
`pending_approval` → admin approves/rejects with a reason → on
approval, `starts_at = NOW`, `ends_at = NOW + duration` → a scheduled
job deactivates it at `ends_at`.

```sql
CREATE TABLE featured_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id UUID NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id),
  package_type VARCHAR(50) NOT NULL CHECK (package_type IN
    ('spotlight_7d', 'boost_30d', 'banner_30d')),
  total_amount DECIMAL(10,2) NOT NULL,
  credit_applied DECIMAL(10,2) NOT NULL DEFAULT 0,
  cash_paid DECIMAL(10,2) NOT NULL,
  gateway_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_id UUID REFERENCES payments(id),       -- NULL if fully credit-paid
  starts_at TIMESTAMP,
  ends_at TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'active', 'rejected', 'cancelled', 'expired')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  rejection_reason TEXT,
  cancelled_by UUID REFERENCES users(id),
  cancelled_at TIMESTAMP,
  cancellation_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_featured_listings_status ON featured_listings(status, ends_at);
CREATE INDEX idx_featured_listings_turf ON featured_listings(turf_id, status);
CREATE INDEX idx_featured_listings_owner ON featured_listings(owner_id, status);
```

```
# Owner
GET    /api/owner/featured-packages              List packages + affordability
POST   /api/owner/featured-listings              Purchase (with optional credit)
GET    /api/owner/featured-listings              My listings
POST   /api/owner/featured-listings/:id/cancel   Cancel (Section 52.9)

# Admin
GET    /api/admin/featured-listings              Moderation queue
PATCH  /api/admin/featured-listings/:id/approve  Approve
PATCH  /api/admin/featured-listings/:id/reject   Reject with reason
PATCH  /api/admin/featured-listings/:id/revoke   Revoke an active listing

# Public
GET    /api/home/featured-turfs                  Top 6 (checks flag)
```

**Business Rules:**
1. Only the turf's own owner (or admin) can request a featured listing.
2. The turf must be `status = 'active'` at request and stay active for
   the listing to remain visible. If suspended/inactivated, the
   listing auto-deactivates and the owner receives platform credit
   (Section 52.9).
3. Two active listings for the same turf is forbidden.
4. `featured_turf_enabled` must be `TRUE` to purchase. If toggled to
   `FALSE` while listings are active, they're hidden but timers keep
   running — no automatic refunds/credits on flag toggle.

### 52.6 Home Page Featured Section

Featured turf listings appear in Section 2 of the home page. The
complete home page discovery logic — all 5 sections, deduplication
rules, sorting, caching, empty/loading/error states, mobile vs desktop
layouts, and filter behavior — is defined in **Section 53**.

This subsection only records the Featured-specific rules:

- Up to 6 featured turfs, sorted by package priority (Banner > Boost >
  Spotlight) then `ends_at` ASC.
- Only turfs with `status = 'active'` and an approved, non-expired
  listing appear.
- If `featured_turf_enabled` is `FALSE`, Section 2 is hidden entirely
  (title and cards) and no query is made.
- If fewer than 6 qualify, the section renders with however many
  exist — no backfill from other sections.

See Section 53.3 for the selection query and full behavior.

### 52.7 Payment for Featured Listings

Reuses the existing SSLCommerz flow and `payments` table.
`payments.booking_id` is nullable for this purpose; linkage is via
`featured_listings.payment_id`.

| Scenario | Gateway charge | Payment row |
|---|---|---|
| No credit applied | Full package price + gateway fee | `booking_id = NULL`, `amount = package_price` |
| Partial credit | Cash portion + gateway fee on cash | `booking_id = NULL`, `amount = cash_paid` |
| Full credit (no cash) | No gateway call | No payment row; listing created directly |

Gateway fee (~2.5%) applies only to the cash portion. **No platform
fee** applies to featured listings — the entire package price minus
the gateway fee is platform revenue.

### 52.8 Platform Credits (Owner-Facing)

A simple owner credit balance used toward a future featured-listing
purchase. **Not cash, not withdrawable, not transferable.**

**Sources:** owner-initiated featured-listing cancellation; admin
cancellation without owner fault; platform-error compensation; admin
manual adjustment (with reason).

**Behavior:** optional `expires_at` (default 6 months from issuance);
applied at checkout via a checkbox; applied FIFO (soonest expiry
first) if multiple credits exist; partial use allowed; if the cash
portion is ৳0 (fully credit-paid), no SSLCommerz call is made.

```sql
CREATE TABLE platform_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  used_amount DECIMAL(10,2) NOT NULL DEFAULT 0
    CHECK (used_amount >= 0 AND used_amount <= amount),
  reason VARCHAR(100) NOT NULL CHECK (reason IN (
    'featured_listing_cancel_owner',
    'featured_listing_cancel_admin_no_fault',
    'featured_listing_cancel_platform_error',
    'promotional_grant',
    'admin_adjustment'
  )),
  source_type VARCHAR(50),
  source_id UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'used', 'expired', 'revoked')),
  expires_at TIMESTAMP,
  expired_at TIMESTAMP,
  revoked_at TIMESTAMP,
  revoked_by UUID REFERENCES users(id),
  revoke_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_platform_credits_owner ON platform_credits(owner_id, status);
CREATE INDEX idx_platform_credits_expiry ON platform_credits(expires_at) WHERE status = 'active';

CREATE TABLE platform_credit_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id UUID NOT NULL REFERENCES platform_credits(id),
  amount_used DECIMAL(10,2) NOT NULL CHECK (amount_used > 0),
  used_for_type VARCHAR(50) NOT NULL,   -- 'featured_listing'
  used_for_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_credit_usages_credit ON platform_credit_usages(credit_id);
```

```
GET    /api/owner/credits                        List available credits
GET    /api/owner/credits/history                Credit ledger (earned + used)
```

**Business Rules:** credits are never withdrawable as cash; owner-
scoped, non-transferable; a daily BullMQ job expires overdue credits
(`status = 'expired'`); credit application is atomic with the purchase
transaction (rolled back together if payment fails); admin can revoke
a credit with a mandatory reason, logged to `audit_logs`.

### 52.9 Featured Listing Cancellation (Credit-Based)

Uses a **credit-based model, not the cash refund model in Section
47.** Section 47 governs player bookings only and is **not modified**
by this section.

| Scenario | Owner receives |
|---|---|
| Owner cancels before `starts_at` | Full credit of `cash_paid + credit_applied`, valid 6 months |
| Owner cancels during active cycle | Credit for unused portion, valid 6 months |
| Admin cancels — owner fault (fraud, ToS violation) | No credit |
| Admin cancels — no owner fault | Full credit of `cash_paid + credit_applied`, valid 6 months |
| Platform error | Full credit of `cash_paid + credit_applied`, valid 6 months |
| Natural expiry at `ends_at` | No credit |

**Owner-initiated mid-cycle formula:**
```
days_total     = (ends_at - starts_at) in days
days_remaining = (ends_at - NOW()) in days
unused_value   = (cash_paid + credit_applied) × (days_remaining / days_total)
credit_issued  = round(unused_value, 2)
```

**Worked example (Boost 30d, ৳1,500 total = ৳1,000 credit + ৳500 cash,
cancelled on day 10):**

| Item | Amount |
|---|---|
| Total paid at purchase | ৳1,500 (৳1,000 credit + ৳500 cash) |
| Days total | 30 |
| Days remaining | 20 |
| Unused value | ৳1,500 × 20/30 = ৳1,000 |
| Credit issued on cancel | ৳1,000 |
| Credit expiry | 6 months from cancellation |

No gateway refund is ever issued — the gateway fee is a sunk cost
(SSLCommerz doesn't refund it). The owner gets a **credit**, not cash.

```sql
CREATE TABLE featured_listing_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES featured_listings(id),
  cancelled_by UUID NOT NULL REFERENCES users(id),
  cancelled_by_role VARCHAR(20) NOT NULL
    CHECK (cancelled_by_role IN ('owner', 'admin', 'system')),
  reason TEXT,
  days_total INTEGER NOT NULL,
  days_remaining INTEGER NOT NULL,
  total_paid DECIMAL(10,2) NOT NULL,
  credit_issued DECIMAL(10,2) NOT NULL,
  credit_id UUID REFERENCES platform_credits(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_featured_cancel_listing ON featured_listing_cancellations(listing_id);
```

```
POST /api/owner/featured-listings/:id/cancel
Request:  { "reason": "turf_sold" }
Response: { "listing_id": "uuid", "credit_issued": 1000, "credit_id": "uuid",
             "credit_expires_at": "2027-03-11T00:00:00Z" }
```

### 52.10 Additional Business Rules (extends Section 34)

Add these rules to Section 34 after rule 40 (Booking Add-on Rules):

41. All optional features (Squad, Tournament, Booking Add-ons, Paid
    Features Listing) are gated by global feature flags and default
    to DISABLED. Features ship fully implemented in code but inactive
    until an admin enables them.
42. Feature flags are enforced server-side at the middleware layer.
    Frontend hiding is never the authorization mechanism.
43. Turning a feature flag OFF never deletes data. It only hides the
    feature. Turning it back ON restores access.
44. Turning `featured_turf_enabled` OFF does not cancel active
    featured listings, issue credits, or extend their timers. It only
    hides them from the public home page.
45. Turning `addons_enabled` OFF does not affect already-confirmed
    bookings that have recorded add-ons. Their pricing is frozen at
    booking time.
46. Featured listings are a promotional service, not a booking. They
    must never create a `bookings`, `refunds`, or `wallet_transactions`
    row for a player.
47. Section 47's policy engine applies to player bookings ONLY.
    Featured listing cancellations use the credit model in Section
    52.9 — never reuse Section 47 tiers for them.
48. Platform credits are owner-scoped, non-withdrawable,
    non-transferable, and expire after `expires_at` if unused.
49. Credit application is atomic with the purchase transaction. If
    payment fails, credit usage is rolled back in the same DB
    transaction — otherwise credits would be lost.
50. A featured listing only goes live after admin approval. No
    auto-approval, ever.
51. A turf can have only one active featured listing at a time.
    Overlapping requests are rejected at purchase time.
52. Every feature flag toggle, featured listing approval/rejection/
    cancellation, and credit issuance/revocation is written to
    `audit_logs` (Section 29) with actor, reason, and before/after
    values.

### 52.11 Explicitly Out of Scope

Featured Add-on Listing (reserved for Phase 3), automatic renewal of
featured listings, self-service admin approval, banner image uploads
or creative design tools, third-party ad networks, CPC/impression-based
pricing (flat-fee only), cash refunds for featured listing
cancellations (credit-only by design), credit transfer between owner
accounts, credit cash-out. (Per the Scope Rule at the top of this
file — propose a new numbered section first if any of these are ever
wanted.)

### 52.12 Phase & Dependencies

**Phase 2 — not required for MVP.** Build after Phase 1 (Auth/RBAC,
turf + booking flow, SSLCommerz payment, cancellation/refund, wallet/
withdrawal) is complete.

Sub-feature build order: (1) Feature Flags — foundation, everything
else depends on it; (2) Platform Credits — needed for the cancel flow;
(3) Featured Turf Listing — purchase + admin moderation; (4) Home Page
Featured Section; (5) Featured listing cancellation.

### 52.13 Definition of Done

- [ ] `feature_flags` migrated; seeds inserted with all flags `FALSE`
- [ ] Admin can list/toggle flags; toggles write to `audit_logs`;
      Redis cache invalidated on toggle
- [ ] `requireFeatureFlag('key')` middleware works; disabled features
      return 404 for public endpoints
- [ ] Sections 49, 50, 51 endpoints respect their respective flags
- [ ] `featured_listings`, `platform_credits`,
      `platform_credit_usages`, `featured_listing_cancellations`
      tables migrated
- [ ] Owner can view packages with affordability info (credit + cash
      vs package price)
- [ ] Owner can purchase with optional credit application
- [ ] Full-credit purchase completes without an SSLCommerz call
- [ ] Partial-credit purchase charges only the cash portion
- [ ] Credit usage + payment + listing creation are atomic in one DB
      transaction
- [ ] Admin moderation queue: approve/reject/revoke all work with
      audit logging
- [ ] Only approved listings appear on the home page, sorted by
      package priority then `ends_at` ASC, hidden entirely when
      `featured_turf_enabled` is `FALSE`
- [ ] Owner-initiated cancellation issues correct credit per Section
      52.9's formula
- [ ] Admin-initiated cancellation differentiates owner-fault vs
      no-fault
- [ ] Daily BullMQ job expires overdue credits
- [ ] Turf suspension/inactivation auto-deactivates its active
      featured listing
- [ ] **Section 47 verified byte-for-byte unchanged**
- [ ] Sections 1–51 verified unchanged apart from the targeted edits
      to Sections 17, 49.2, 50.2, and 51.2

---

## 53. Home Page Discovery & Listing Logic (Phase 2 — not MVP)

### 53.1 Overview

This section defines exactly how the public home page discovers and
displays turfs: all five home-page sections, deduplication rules,
sorting, caching, empty/loading/error states, mobile vs desktop
layouts, and filter behavior — including how Featured Turf Listing
(Section 52.5) integrates.

This is a discovery/UX section — it creates no new financial
transactions and does not touch Section 47. Two of its five sections
(Trending Now, Near You) are **gated behind feature flags, default
DISABLED**, and are meant to be turned on by the admin once the
platform has enough turf/booking data for them to be meaningful
(Section 53.4, 53.5).

### 53.2 Section Structure (5 sections, ordered)

1. Hero + Search Bar
2. Featured Turfs (paid — Section 52.5, gated by `featured_turf_enabled`)
3. Trending Now (algorithmic, gated by `trending_enabled`)
4. Near You (location-based, gated by `near_you_enabled`)
5. All Turfs (browsable catalog — always on, this is the MVP core)

Rendering order is fixed. Any of Sections 2–4 that are flag-disabled
are skipped entirely (not shown empty — simply absent), and Section 5
still renders normally regardless. On mobile, sections stack
vertically. On desktop, Sections 2–4 render as 3-column grids (2 rows
each); Section 5 renders as a paginated grid.

### 53.3 Section 2 — Featured Turfs

Source: `featured_listings` (Section 52.5). Gated by
`featured_turf_enabled` (see Section 52.6 for the authoritative rules
and query — not duplicated here).

### 53.4 Section 3 — Trending Now

**Feature flag: gated by `trending_enabled` (Section 52.3), default
DISABLED.** When off, this section does not render and no query is
made — enable it once there's enough booking volume (rolling 7-day
window) for "trending" to mean anything; on a near-empty platform this
section would otherwise sit empty or misleadingly show 1–2 turfs as
"trending."

Algorithmic ranking based on recent booking activity. No paid
influence.

- Window: rolling 7 days (admin-configurable via
  `platform_settings.trending_window_days`).
- Counted booking statuses: `confirmed` + `completed`. Cancelled,
  expired, refunded bookings do NOT count.

```sql
SELECT t.*, COUNT(b.id) AS booking_count_7d
FROM turfs t
LEFT JOIN bookings b
  ON b.turf_id = t.id
 AND b.status IN ('confirmed', 'completed')
 AND b.created_at > NOW() - INTERVAL '7 days'
WHERE t.status = 'active'
  AND t.deleted_at IS NULL
GROUP BY t.id
HAVING COUNT(b.id) > 0
ORDER BY
  booking_count_7d DESC,
  t.average_rating DESC,
  t.created_at DESC
LIMIT 12;   -- fetch extra to allow dedup; display top 6 after
```

- Deduplication: any turf already shown in Section 2 (Featured) is
  excluded.
- Empty behavior: if 0 qualify (or all are deduped away), the section
  is hidden entirely — same visual result as the flag being off.

### 53.5 Section 4 — Near You

**Feature flag: gated by `near_you_enabled` (Section 52.3), default
DISABLED.** When off, no geolocation is requested and no query is
made — enable it once there's enough turf density in a city/area for
a 10–25 km radius search to return meaningful results.

Location-based discovery using the browser Geolocation API with
permission.

- Coordinates source: browser Geolocation (one-time consent per
  session, cached in `sessionStorage`) → Fallback A: IP-based city
  center (if denied) → Fallback B: hide section entirely (if IP
  unavailable).
- Radius: 10 km default, admin-configurable via
  `platform_settings.nearby_radius_km`. Expansion rule: if 0 turfs
  found in 10 km, retry with 25 km; if still 0, hide the section.
- Calculation: server-side, bounding-box pre-filter followed by
  Haversine distance verification. No PostGIS required for MVP — a
  precomputed grid index on `turfs(latitude, longitude)` is enough.

```sql
SELECT t.*,
  (6371 * acos(
    cos(radians(:lat)) * cos(radians(t.latitude)) *
    cos(radians(t.longitude) - radians(:lng)) +
    sin(radians(:lat)) * sin(radians(t.latitude))
  )) AS distance_km
FROM turfs t
WHERE t.status = 'active'
  AND t.deleted_at IS NULL
  AND t.latitude  BETWEEN :lat_min AND :lat_max
  AND t.longitude BETWEEN :lng_min AND :lng_max
ORDER BY distance_km ASC
LIMIT 12;   -- fetch extra to allow dedup; display top 6 after
```

- Deduplication: exclude turfs already shown in Sections 2 and 3.
- Empty behavior: hide section if 0 remain after dedup, or if
  location is unavailable and the IP fallback yields no results.

### 53.6 Section 5 — All Turfs

Full browsable catalog with filters and sorting. **Always on — this
is not behind a feature flag, it is the core MVP browsing
experience.** Includes every active turf, including those shown in
Sections 2–4.

- Page size: 12 per page.
- Pagination: infinite scroll on mobile, "Load More" button on desktop.
- Sort options: Relevance (default — featured first, then rating,
  then newest), Price low→high, Price high→low, Rating high→low,
  Distance (only if location available), Newest first.
- Filter options (Section 27): area/location, sport type, price
  range, rating (e.g. 4+ stars), amenities, availability (date + time
  — uses real slot data, never static turf info), open now.
- URL state: filters and sort sync to URL query params
  (`?area=banani&sport=football&sort=price_asc&page=2`) so the page
  is shareable and back-button-safe.
- Empty behavior: if 0 results match, show "No turfs match your
  filters" with a "Clear filters" button. Section 5 is always
  rendered, even when empty — never hidden.

### 53.7 Deduplication Rule

Priority order (highest first): Featured Turfs (2) → Trending Now (3)
→ Near You (4) → All Turfs (5).

- A turf may appear in **at most one** of Sections 2, 3, or 4 — the
  highest-priority one it qualifies for.
- **Section 5 exception:** Section 5 is the full browsable index and
  intentionally includes every active turf, including those already
  shown in Sections 2–4. This is by design — Section 5 is the
  complete catalog, not a "leftover bucket."
- Implementation: the backend performs dedup across Sections 2–4
  before returning the home payload. The frontend renders as-is with
  no additional client-side dedup.
- When `trending_enabled` and/or `near_you_enabled` are `FALSE`,
  dedup simply skips those sections — Featured still dedupes against
  whatever sections are actually active.

### 53.8 Empty States

| Section | Empty Behavior |
|---|---|
| Featured Turfs | Hide section entirely (title + cards) |
| Trending Now | Hide section entirely (also hidden if flag is off) |
| Near You (no location) | Fallback to "Popular in [City]" (IP-based) |
| Near You (0 in 10km, 0 in 25km) | Hide section entirely (also hidden if flag is off) |
| All Turfs (0 results) | Show empty state + "Clear filters" button |
| Entire home page (0 turfs platform-wide) | Full-page onboarding empty state ("No turfs available yet — check back soon") |

### 53.9 Loading & Error States

- **Loading:** skeleton cards (not spinners) per section. Load
  priority order: Hero → Featured → Trending → Near You → All Turfs.
  Sections render progressively as their data arrives — do not block
  the whole page on the slowest query.
- **Error (section-level):** if one section's endpoint fails, the
  other sections continue rendering. The failed section shows
  "Couldn't load — Retry" with a local retry action (React Query
  refetch).
- **Error (page-level):** if ALL endpoints fail, show a full-page
  error state with a "Retry" button.

### 53.10 Caching Strategy

Applies once the relevant section/flag is enabled and real traffic
exists — not needed to build ahead of actual load, but documented now
so the pattern is consistent when it's turned on.

| Section | Cache | TTL | Invalidation |
|---|---|---|---|
| Featured Turfs | Redis | 5 min | On listing approve/reject/cancel/expire, on flag toggle |
| Trending Now | Redis | 15 min | On booking confirmed/completed event |
| Near You | No cache | — | Per-request (location-specific) |
| All Turfs (page 1) | Redis | 5 min | On turf create/update/approve/suspend |
| All Turfs (pages 2+) | No cache | — | Per-request |

Cache keys: `home:featured:{flag_state}` (TTL 5 min),
`home:trending:{window_days}` (TTL 15 min),
`home:all_turfs:page1:{filters_hash}` (TTL 5 min). Never cache Near
You — it's location-specific per request.

### 53.11 API Endpoints

Separate endpoints per section (not one big call). The frontend fetches
them in parallel with React Query; each section renders independently.

```
GET /api/home/featured-turfs
    → returns empty items if featured_turf_enabled is FALSE

GET /api/home/trending-turfs
    → returns empty items if trending_enabled is FALSE

GET /api/home/nearby-turfs?lat=<float>&lng=<float>
    → returns empty items if near_you_enabled is FALSE; 400 if lat/lng missing

GET /api/home/all-turfs?page=1&limit=12&sort=relevance&area=&sport=&price_min=&price_max=&rating_min=&amenities=&date=&open_now=
    → standard paginated response (Section 14.1); always active
```

All endpoints are public (no auth required). Each performs its own
dedup against higher-priority *enabled* sections (Featured > Trending
> Near You) — prefer server-side aggregation (a single backend
aggregation step passing already-shown turf IDs down the chain) over
frontend-side dedup, for correctness and cache simplicity.

### 53.12 Mobile vs Desktop Layout

- **Desktop (≥1024px):** Featured / Trending / Near You (whichever
  are enabled): 3-column grid × 2 rows = 6 cards. All Turfs: 3-column
  grid, paginated.
- **Tablet (768–1023px):** 2-column grid for all sections.
- **Mobile (<768px):** Featured / Trending / Near You: horizontal
  swipeable carousel (one card per view, peek of next card). All
  Turfs: single-column list, infinite scroll.
- Featured card contents: turf photo, name, area, sport type, rating,
  price range, "Featured" badge, "Book Now" button.

### 53.13 Filter Interaction (Search Bar)

- No filter active: all currently-enabled sections render normally.
- Filter active (any of: area, sport, date, price, rating, amenities,
  open-now): Sections 2, 3, and 4 (whichever are enabled) are hidden
  entirely. Only Section 5 renders, with the filtered results, and its
  title updates (e.g. "Football turfs in Banani" instead of "All
  Turfs").
- Rationale: Featured/Trending/Near You are editorial/algorithmic
  sections. Once a player issues an explicit search, they want a
  filtered catalog, not curated content.
- Search bar state is driven by URL query params (Section 53.6).

### 53.14 Feature Flag Interaction

- `featured_turf_enabled = FALSE` → Section 2 hidden, no query made.
- `trending_enabled = FALSE` → Section 3 hidden, no query made.
- `near_you_enabled = FALSE` → Section 4 hidden, no geolocation
  requested, no query made.
- `squad_enabled = TRUE` → an additional "Looking for Teammates?"
  section (Section 49.6) appears between the last enabled discovery
  section and Section 5. When `FALSE`, absent.
- `tournament_enabled = TRUE` → an additional "Tournaments" section
  (Section 50) may appear similarly. When `FALSE`, absent.
- `addons_enabled` → turf cards in any section may show a small
  add-on preview badge. When `FALSE`, no add-on badges appear.

Feature flags are always checked **server-side** (Section 52.3). The
frontend never decides which sections to hide based on stale local
state.

### 53.15 Performance SLA

Documented as a target for when the relevant sections are enabled and
under real load — not a blocker for initial build.

- Full home page render (all enabled sections visible): < 500ms p95
  for API aggregation, < 1s p95 total to first meaningful paint.
- Each individual section endpoint: < 200ms p95.
- Frontend: fetch sections in parallel (React Query), render
  progressively — never serialize fetches.

### 53.16 Definition of Done

- [ ] Section 5 (All Turfs) works standalone with pagination, all
      sorts, all filters, and URL state sync — this alone is
      sufficient for MVP home page launch
- [ ] Section 2 (Featured) respects `featured_turf_enabled` and
      `featured_listings` state
- [ ] Section 3 (Trending) respects `trending_enabled`; when enabled,
      uses a 7-day window, counts only confirmed+completed, tie-breaks
      by rating then newest
- [ ] Section 4 (Near You) respects `near_you_enabled`; when enabled,
      uses browser geolocation with IP-city fallback and hide-if-empty
- [ ] Deduplication enforced across whichever of Sections 2–4 are
      currently enabled
- [ ] Section 5 always includes every active turf regardless of what
      appears in 2–4
- [ ] Empty states match Section 53.8 exactly
- [ ] Loading uses skeleton cards, not spinners; section-level errors
      don't break the rest of the page
- [ ] Caching TTLs match Section 53.10 once the relevant sections are
      enabled
- [ ] All 4 endpoints match the shapes in Section 53.11
- [ ] Mobile uses carousels for enabled 2–4 sections; desktop uses
      3-col grids
- [ ] Filters hide Sections 2–4 (whichever enabled) and update
      Section 5's title
- [ ] Feature flags checked server-side for every section
- [ ] **Section 47 verified byte-for-byte unchanged**
- [ ] Sections 1–51, and 52.1–52.5 and 52.7–52.13, verified unchanged
      apart from the Section 52.6 edit and Section 17 line
