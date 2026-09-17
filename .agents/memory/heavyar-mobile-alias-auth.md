---
name: Heavyar mobile alias authentication
description: Product identity rule for mobile-number sign-in and recovery.
---

Treat a Saudi mobile number only as a unique alternate identifier for the user's existing Firebase email/password account. Never enable Firebase Phone Authentication, send login OTPs, or create a second Firebase identity.

**Why:** Heavyar requires one account, one password, and one Firebase UID whether the user enters email or mobile. A second phone-auth identity would split ownership, permissions, and account history.

**How to apply:** Resolve the protected mobile-owner mapping internally, verify the existing Firebase password, require the authenticated UID to equal the mapped UID, and issue a session for that same UID. Mobile-triggered recovery sends Firebase's reset email to the registered email address.