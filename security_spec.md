# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Strict Tenant Isolation**: Every document in `/users/{userId}/accounts/{accountId}`, `/users/{userId}/holdings/{holdingId}`, `/users/{userId}/favorites/{favoriteId}`, and `/users/{userId}/analyses/{analysisId}` belongs exclusively to `userId`. A user can only read, create, update, or delete documents where `request.auth.uid == userId` and `incoming().userId == request.auth.uid`.
2. **Verified Identity**: All write operations require `request.auth != null` and `request.auth.token.email_verified == true`.
3. **Immutable Ownership & Creation Timestamps**: `userId` and `createdAt` can never be mutated during an `update` operation (`incoming().userId == existing().userId` and `incoming().createdAt == existing().createdAt`).
4. **Temporal Integrity**: `createdAt` on `create` and `updatedAt` on `create`/`update` must equal `request.time`.
5. **Relational Account Integrity**: A `Holding` cannot be created or updated unless the referenced parent account `/users/$(userId)/accounts/$(incoming().accountId)` exists (`exists(...)`).
6. **Strict Schema & Volumetric Bounds**: Every string field enforces strict `.size()` bounds and regex patterns where applicable (`ticker` matches `^[A-Z0-9.\-]+$`, `accountType` in `['INVESTMENT', 'RETIREMENT']`). Shadow fields are blocked via `.keys().hasAll(...)` and `.keys().hasOnly(...)`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Cross-Tenant Read/Write Spoof**: Authenticated user `uid_attacker` writes to `/users/uid_victim/holdings/lot_1` with `userId: "uid_victim"`. (Blocked by `request.auth.uid == userId`).
2. **Body-Path UID Mismatch**: Authenticated user `uid_attacker` writes to `/users/uid_attacker/holdings/lot_1` with `userId: "uid_victim"`. (Blocked by `data.userId == request.auth.uid`).
3. **Unverified Email Write**: User with `email_verified: false` attempts to create an account. (Blocked by `request.auth.token.email_verified == true`).
4. **Shadow Field Injection**: User includes `"isAdmin": true` or `"extraField": "hack"` in an Account or Holding payload. (Blocked by `data.keys().hasOnly(...)` and `affectedKeys().hasOnly(...)`).
5. **Orphaned Holding Creation**: User creates a holding referencing a non-existent `accountId: "non_existent_acct"`. (Blocked by `exists(/databases/$(database)/documents/users/$(userId)/accounts/$(incoming().accountId))`).
6. **Negative or Zero Shares/Price**: User submits `shares: -10` or `purchasePrice: 0`. (Blocked by `data.shares > 0 && data.purchasePrice > 0`).
7. **ID Poisoning Attack**: User targets a 500-character document ID containing special characters `/users/uid_1/holdings/a*b$c...`. (Blocked by `isValidId()` enforcing `<= 128` chars and `^[a-zA-Z0-9_\-]+$`).
8. **Ticker Injection**: User submits lowercase or SQL/script injection in ticker `"aapl; DROP TABLE"`. (Blocked by `data.ticker.matches('^[A-Z0-9.\\-]+$')` and `size() <= 12`).
9. **Client Timestamp Forgery**: User supplies a past or future timestamp for `createdAt` or `updatedAt` instead of `request.time`. (Blocked by `incoming().createdAt == request.time` and `incoming().updatedAt == request.time`).
10. **Immutable Field Mutation**: User updates a holding and changes `createdAt` or `userId`. (Blocked by `incoming().userId == existing().userId && incoming().createdAt == existing().createdAt`).
11. **Denial-of-Wallet Oversized String**: User submits a 50,000-character string in `notes` or `recommendationsText`. (Blocked by strict `.size() <= MAX` checks on every string field).
12. **Unauthorized Blanket Collection List**: Authenticated user queries across users or lists another user's subcollection. (Blocked by `request.auth.uid == userId && resource.data.userId == request.auth.uid`).
