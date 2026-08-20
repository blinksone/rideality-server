# QA Test Cases — Admin Portal, Finance & Fleet

**Environment:** Staging / Production admin UI + API  
**Date covered:** Changes through 1 Jul 2026  
**Apps:** RidealityAdmin (port 8080), RidealityBackend API (port 3000)

---

## Test accounts (prepare before testing)

| Role | Purpose | Notes |
|------|---------|--------|
| Super Admin | Full platform access | e.g. `admin@rideality.com` |
| Finance Officer | Finance approvals (optional) | If seeded in your env |
| Fleet Owner A | Own fleet, no platform finance | e.g. `irfan.fleet@gmail.com` |
| Fleet Owner B | Second approver (optional) | For maker-checker negative tests |
| Portal user (driver) | Invite target | Same **region** as fleet company |

**Pre-requisites:** Hard refresh admin UI after deploy (`Ctrl+Shift+R`). API and admin PM2 processes restarted after build.

---

## 1. User management — Create user & temporary password

| ID | TC-USER-01 |
|----|------------|
| **Feature** | Create user with random temporary password |
| **Role** | Super Admin / user with `manage_users` |
| **Steps** | 1. Go to **Users** → **Create user**.<br>2. Fill name, email, phone, region, platform role → **Create user**.<br>3. On success screen, note email + temporary password.<br>4. Use **Copy** buttons (email, password, both).<br>5. Click **Done**. |
| **Expected** | Credentials dialog shows once. Copy works (HTTPS or HTTP fallback). User appears in list. |
| **Priority** | High |

| ID | TC-USER-02 |
|----|------------|
| **Feature** | Super Admin reset password |
| **Role** | Super Admin |
| **Steps** | 1. Open **Users** → select a portal user (not yourself).<br>2. Click **Reset password** → confirm.<br>3. Copy new temporary password from dialog. |
| **Expected** | New random password shown once. User must change password on next login. Active sessions revoked. |
| **Priority** | High |

| ID | TC-USER-03 |
|----|------------|
| **Feature** | Reset password — self blocked |
| **Role** | Super Admin |
| **Steps** | Open your own user detail → **Reset password** |
| **Expected** | Button hidden or API returns error directing to change-password flow. |
| **Priority** | Medium |

| ID | TC-USER-04 |
|----|------------|
| **Feature** | Users list layout |
| **Role** | Any with `manage_users` |
| **Steps** | Open **Users** list with 10+ users. |
| **Expected** | Name and Email columns close together; no excessive gap; no horizontal scroll for normal widths. Long text truncates with ellipsis. |
| **Priority** | Low |

---

## 2. Finance — Wallet adjustments (email lookup)

| ID | TC-FIN-01 |
|----|------------|
| **Feature** | Request adjustment by email |
| **Role** | User with `manage_wallet_adjustments` |
| **Steps** | 1. **Finance → Adjustments** → **Request adjustment**.<br>2. Enter user email (2+ chars, valid format).<br>3. Wait for lookup (~400ms). |
| **Expected** | **Account title** fills read-only. **Amount** shows currency suffix (e.g. PKR). Submit enabled when amount + reason filled. |
| **Priority** | High |

| ID | TC-FIN-02 |
|----|------------|
| **Feature** | Adjustment — user not found |
| **Role** | Finance user |
| **Steps** | Enter email with no wallet / wrong region / non-existent user. |
| **Expected** | Error: no wallet found. Submit disabled. |
| **Priority** | Medium |

| ID | TC-FIN-03 |
|----|------------|
| **Feature** | Adjustment — personal + fleet wallet |
| **Role** | Finance user |
| **Steps** | Use email of fleet owner who has both user wallet and fleet wallet. |
| **Expected** | **Wallet** dropdown appears; selecting one updates title, currency, and internal wallet id. |
| **Priority** | Medium |

| ID | TC-FIN-04 |
|----|------------|
| **Feature** | Submit adjustment for approval |
| **Role** | Finance user |
| **Steps** | Complete credit adjustment (top-up method, reason) → **Submit for approval**. |
| **Expected** | Row appears in list with status **Pending**. Finance summary pending count increases. |
| **Priority** | High |

---

## 3. Finance — Maker-checker & Super Admin bypass

| ID | TC-FIN-05 |
|----|------------|
| **Feature** | Non–Super Admin cannot approve own adjustment |
| **Role** | Finance Officer (not Super Admin) |
| **Steps** | 1. Request an adjustment.<br>2. Try to **Approve** the same row. |
| **Expected** | UI shows **Awaiting another approver** OR error toast. Status stays Pending. |
| **Priority** | High |

| ID | TC-FIN-06 |
|----|------------|
| **Feature** | Super Admin can approve own adjustment |
| **Role** | Super Admin |
| **Steps** | 1. Request adjustment.<br>2. **Approve** same row. |
| **Expected** | Status **Approved**. Wallet balance updated. Audit log entry created. |
| **Priority** | High |

| ID | TC-FIN-07 |
|----|------------|
| **Feature** | Second approver flow |
| **Role** | User A requests, User B approves |
| **Steps** | User A submits adjustment; log in as User B with `approve_wallet_adjustments` → Approve. |
| **Expected** | Approved successfully. |
| **Priority** | High |

| ID | TC-FIN-08 |
|----|------------|
| **Feature** | Reject adjustment |
| **Role** | Approver |
| **Steps** | **Reject** a pending adjustment. |
| **Expected** | Status **Rejected**. No ledger posting. |
| **Priority** | Medium |

---

## 4. Finance — Payouts

| ID | TC-FIN-09 |
|----|------------|
| **Feature** | Request fleet payout |
| **Role** | Fleet owner on company **Wallet** tab |
| **Steps** | 1. **Operations → Fleet** → open company → **Wallet**.<br>2. **Request payout** → amount + bank details → Submit. |
| **Expected** | Success toast. Pending payout created. |
| **Priority** | High |

| ID | TC-FIN-10 |
|----|------------|
| **Feature** | Payouts list & approve |
| **Role** | Super Admin / approver |
| **Steps** | 1. **Finance → Payouts** (or click **Pending payouts** on dashboard).<br>2. **Approve** pending payout. |
| **Expected** | Status **Completed**. Fleet wallet balance reduced. |
| **Priority** | High |

| ID | TC-FIN-11 |
|----|------------|
| **Feature** | Super Admin approve own payout |
| **Role** | Super Admin |
| **Steps** | Request payout as fleet owner (if same account is Super Admin, use separate test); approve own request as Super Admin. |
| **Expected** | Super Admin bypass allowed (same as adjustments). |
| **Priority** | Medium |

---

## 5. Finance — Dashboard (currency breakdown)

| ID | TC-FIN-12 |
|----|------------|
| **Feature** | Finance overview — per currency |
| **Role** | Super Admin / `view_finance` |
| **Steps** | Open **Finance → Overview**. |
| **Expected** | Top cards: Wallets, Pending adjustments, Pending payouts, 24h volume.<br>**No** single mixed “Total wallet balance” number.<br>Tables: **Balances by currency** and **24h volume by currency**.<br>Info banner warns not to add currencies together. |
| **Priority** | High |

| ID | TC-FIN-13 |
|----|------------|
| **Feature** | Negative balance display |
| **Role** | Super Admin |
| **Steps** | Find currency with net negative wallets (e.g. after penalties). |
| **Expected** | Negative total shown in red in **Balances by currency** table. |
| **Priority** | Low |

| ID | TC-FIN-14 |
|----|------------|
| **Feature** | Dashboard links |
| **Role** | Super Admin |
| **Steps** | Click **Pending adjustments** and **Pending payouts** stat cards. |
| **Expected** | Navigates to Adjustments / Payouts pages. |
| **Priority** | Low |

---

## 6. Fleet — Owner assignment (Option 2)

| ID | TC-FLEET-01 |
|----|------------|
| **Feature** | Admin create fleet with assigned owner |
| **Role** | Super Admin (`manage_users`) |
| **Steps** | 1. **Operations → Fleet → Create company**.<br>2. Search and select **Fleet owner** (existing user).<br>3. Legal name, region → **Create**. |
| **Expected** | Company created with selected user as owner. Owner’s dashboard shows **My fleets: 1**. |
| **Priority** | High |

| ID | TC-FLEET-02 |
|----|------------|
| **Feature** | Fleet owner creates own company |
| **Role** | Fleet Owner (no `manage_users`) |
| **Steps** | Log in as fleet owner → **Fleet → Create company** (no owner picker). |
| **Expected** | Logged-in user becomes owner. **My fleets** increments. |
| **Priority** | High |

| ID | TC-FLEET-03 |
|----|------------|
| **Feature** | Reassign fleet owner (admin) |
| **Role** | Super Admin |
| **Steps** | 1. Open fleet company → **Overview**.<br>2. Under **Admin — edit company**, change **Fleet owner** search to another user.<br>3. **Save changes**. |
| **Expected** | Details card shows new owner. New owner sees company under **My fleets**. Previous owner membership removed as owner. |
| **Priority** | High |

| ID | TC-FLEET-04 |
|----|------------|
| **Feature** | Fleet owner cannot reassign owner |
| **Role** | Fleet Owner |
| **Steps** | Open own company → Overview edit section. |
| **Expected** | Title **Edit company** (not Admin). Only **Legal name** and **Tax ID** editable. No Status, Region, or Fleet owner fields. |
| **Priority** | High |

| ID | TC-FLEET-05 |
|----|------------|
| **Feature** | Fleet owner save company details |
| **Role** | Fleet Owner |
| **Steps** | Change legal name / tax ID → **Save changes**. |
| **Expected** | Saved via fleet API. Name updates on page. Status/region unchanged. |
| **Priority** | Medium |

| ID | TC-FLEET-06 |
|----|------------|
| **Feature** | Fleet list scoped for fleet owner |
| **Role** | Fleet Owner |
| **Steps** | Open **Operations → Fleet**. |
| **Expected** | Only companies user owns or is member of — not all platform fleets. |
| **Priority** | High |

---

## 7. Fleet — Invites & drivers

| ID | TC-FLEET-07 |
|----|------------|
| **Feature** | Invite search — same region |
| **Role** | Fleet owner / admin with fleet access |
| **Steps** | 1. **Invites** tab → **Search user** (2+ chars).<br>2. Use user in **same region** as fleet. |
| **Expected** | User appears in dropdown with name, phone, email, roles. |
| **Priority** | High |

| ID | TC-FLEET-08 |
|----|------------|
| **Feature** | Invite search — wrong region |
| **Role** | Fleet owner |
| **Steps** | Search user from different region. |
| **Expected** | “No users found”. |
| **Priority** | Medium |

| ID | TC-FLEET-09 |
|----|------------|
| **Feature** | Manual invite by phone/email |
| **Role** | Fleet owner |
| **Steps** | Skip search; enter phone or email → **Create invite**. |
| **Expected** | Invite token returned/shown. Works even when search fails. |
| **Priority** | High |

| ID | TC-FLEET-10 |
|----|------------|
| **Feature** | Invite existing member blocked |
| **Role** | Fleet owner |
| **Steps** | Search/select user already in fleet → create invite. |
| **Expected** | Error: already a member. |
| **Priority** | Medium |

---

## 8. Fleet owner — Finance menu scoping

| ID | TC-FLEET-11 |
|----|------------|
| **Feature** | No platform Finance sidebar |
| **Role** | Fleet Owner |
| **Steps** | Log in as fleet owner. Check sidebar. |
| **Expected** | **No** Finance group (Overview, Wallets, Adjustments, Payouts). **Operations → Fleet** only. |
| **Priority** | High |

| ID | TC-FLEET-12 |
|----|------------|
| **Feature** | Fleet wallet tab |
| **Role** | Fleet Owner |
| **Steps** | Open own company → **Wallet** tab. |
| **Expected** | Balance, transaction list, **Request payout** button visible. |
| **Priority** | High |

| ID | TC-FLEET-13 |
|----|------------|
| **Feature** | Fleet owner dashboard |
| **Role** | Fleet Owner |
| **Steps** | Open **Dashboard**. |
| **Expected** | Shows **My fleets**, **My fleet drivers**, **Pending invites**, **Pending driver approvals**.<br>Does **not** show platform **Total fleets: N** (all companies). |
| **Priority** | Medium |

---

## 9. Regions & other (if in scope)

| ID | TC-REG-01 |
|----|------------|
| **Feature** | Add region — country dropdown |
| **Role** | Super Admin |
| **Steps** | **Platform → Regions → Add** → pick country from searchable dropdown. |
| **Expected** | Code, currency, phone prefix auto-filled and disabled. |
| **Priority** | Medium |

| ID | TC-NAV-01 |
|----|------------|
| **Feature** | Sidebar groups |
| **Role** | Super Admin |
| **Steps** | Collapse/expand nav groups; refresh page. |
| **Expected** | Groups Platform, Access, Operations, Finance persist collapsed state. |
| **Priority** | Low |

---

## 10. Regression / API smoke

| ID | TC-REG-02 |
|----|------------|
| **Feature** | Login & password reset gate |
| **Role** | New user with `mustResetPassword` |
| **Steps** | Login with temporary password → forced reset page. |
| **Expected** | Cannot access admin until password changed. |
| **Priority** | High |

| ID | TC-REG-03 |
|----|------------|
| **Feature** | Clipboard on HTTP |
| **Role** | Any |
| **Steps** | Copy credentials on non-HTTPS admin URL. |
| **Expected** | Copy succeeds via fallback or clear error message. |
| **Priority** | Low |

---

## Test data checklist

- [ ] At least 2 regions (e.g. PK, AE) with active status  
- [ ] Fleet company in region PK owned by Fleet Owner A  
- [ ] Portal user in **same** region as fleet (for invite search)  
- [ ] Portal user in **different** region (negative invite search)  
- [ ] User with personal + fleet wallet (same owner email) for adjustment dropdown test  
- [ ] Super Admin + one non-admin approver for maker-checker  

---

## Known limitations (not bugs)

1. **24h volume** sums transaction amounts per currency; credits and debits are not netted separately on dashboard.  
2. **Fleet company created by admin** without owner picker (old flow) leaves Platform Admin as owner until reassigned.  
3. **Invite accept flow** requires mobile/app or API — admin only creates token.  
4. Currency codes like **RUP** may be test/legacy region data — verify against region config.

---

## Sign-off template

| Area | Tester | Date | Pass / Fail | Notes |
|------|--------|------|-------------|-------|
| Users & passwords | | | | |
| Finance adjustments | | | | |
| Finance payouts | | | | |
| Finance dashboard | | | | |
| Fleet owner assignment | | | | |
| Fleet invites | | | | |
| Fleet owner UX | | | | |

---

*Document version: 1.0 — generated for QA handoff, Jul 2026*
