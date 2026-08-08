# Switching the appointment system on

The site ships complete without Firebase: the booking form offers the phone,
and the Studio opens in preview. Everything below is the one-time work that
makes both live. It lives in `scripts/` so it deploys nowhere.

## 1. Create the project (DONE, v0.4.6)

- console.firebase.google.com, Add project. No Analytics needed.
- Add a Web app (the `</>` icon). Copy the config object it prints.
- Paste that object over the `null` in `assets/js/firebase-config.js`
  (`export const FIREBASE_CONFIG = { ... };`). The config identifies the
  project; it is not a secret, and every Firebase site ships it openly. The
  security is the rules and the sign-in, below.
- This step is done: the `adriano-jewelry` project exists and its web
  config is pasted in. Steps 2 and 3 are what remain, and the Studio's own
  banner says so after every unlock until they are finished.

## 2. Firestore

- Build, Firestore Database, Create database, production mode, region of
  your choice (us-east nearest the store).
- Deploy the rules that ARE the backend's security:

  ```bash
  npx firebase-tools deploy --only firestore --project <project-id>
  ```

  Run from the repo root; `firebase.json` already points at
  `firestore.rules` and `firestore.indexes.json`. (Or paste
  `firestore.rules` into the console's Rules tab by hand; the file is the
  source of truth either way.)

## 3. The admin account

- Build, Authentication, Get started, enable **Email/Password** (just the
  first toggle; no email link sign-in).
- Users, Add user: email `admin@adrianojewelry.com`, password **the studio
  password** (the one in `.env.admin` on the dev machine). The two MUST
  match: unlocking the Studio and signing into Firebase are one gesture
  with one password.
- Authentication, Settings, User actions: **uncheck "Enable create
  (sign-up)"**. The rules trust the admin email; creating the account first
  makes the address unregistrable by anyone else, and disabling sign-up
  closes the door on new accounts entirely.
- Optional hardening once the account exists: paste its UID into
  `firestore.rules` in place of the email test (the comment in the file
  shows the one line).

## 4. Prove it

- Open `/book-appointment/`, send a test request; the form should land on
  "Request received."
- Open `/admin/`, unlock with the studio password; the request should be
  sitting in New, live. Confirm it, complete it, delete it.
- Wrong-password check: a bad password at the gate must say "That is not
  the password" and nothing else.

## The password, and where it lives

- The studio password is stored ONCE on the dev machine, in `.env.admin`
  at the repo root, which `.gitignore` (`.env.*`) keeps out of the repo.
- Nothing derived from it ships. The dashboard ships as AES-256-GCM
  ciphertext (`admin/payload.js`) keyed through 600,000 PBKDF2 rounds;
  a wrong password is indistinguishable from corrupt data.
- Changing it: edit `.env.admin`, run `node scripts/admin-payload.js`,
  change the Firebase user's password to match, commit the new payload.
- After editing anything in `scripts/admin-src/`, rebuild the payload the
  same way; `node scripts/admin-payload.js --check` tells you when the
  shipped ciphertext is stale, in the same spirit as `build.js --check`.

## What the rules enforce (so nobody has to trust the pages)

- Anyone may CREATE an appointment request of exactly one shape: all nine
  fields present and typed, name 2 to 80, phone 7 to 25 from a dial pad's
  characters, email empty or sane and under 120, service and slot from
  their enums, date a `YYYY-MM-DD` string, message under 600, status born
  `"new"`, `createdAt` stamped by the server's clock, no extra keys.
- The slot enum is the diary's own grid since v0.4.6: fifteen half-hour
  start times, `"09:00"` through `"16:00"`, inside the store's 9:00 am to
  4:30 pm. The service enum starts with `"wedding"` (Wedding Ring). Change
  either in three places together or not at all: `firestore.rules`, the
  booking form's markup and `booking.js`, and the studio's `dashboard.js`.
- Nobody unauthenticated reads anything, not even their own submission.
- The admin (matched by email, optionally pinned to UID) may read the
  list, may change ONLY the `status` field and only to one of its four
  values, and may delete. A customer's words cannot be edited by anyone.
- Everything else in the database is closed by an explicit catch-all.

Worth adding later, not blocking: **App Check** (reCAPTCHA v3) over
Firestore raises the cost of scripted spam; the honeypot and the rules'
shape checks carry that job until then.
