/* Firebase web configuration for the appointment system.
 *
 * PASTE THE PROJECT'S WEB CONFIG OBJECT over the null below, exactly as the
 * Firebase console prints it (Project settings, General, Your apps, Web).
 * A web config IDENTIFIES a project; it is not a credential and hiding it
 * buys nothing, which is why every Firebase site on earth ships it in the
 * open. The security of the system lives in firestore.rules, which the
 * server enforces whatever any client says, and in the admin's own sign-in.
 *
 * While this is null the site stays whole: the booking form explains itself
 * and offers the store's phone, and the admin studio opens in preview with
 * no data connection. Nothing else on the site touches Firebase, so no page
 * pays a byte for it until it is real.
 *
 * Example shape (all values from the console, none invented):
 *
 *   export const FIREBASE_CONFIG = {
 *     apiKey: "AIza...",
 *     authDomain: "adriano-jewelry.firebaseapp.com",
 *     projectId: "adriano-jewelry",
 *     appId: "1:1234567890:web:abc123",
 *   };
 */
export const FIREBASE_CONFIG = null;

/* The one account the Firestore rules trust. Create it in the console
 * (Authentication, Users) BEFORE the rules go live, so nobody else can ever
 * register the address, and see scripts/firebase-setup.md for the two
 * settings that must go with it. The studio signs in as this user with the
 * same password that unlocks the studio itself. */
export const ADMIN_EMAIL = "admin@adrianojewelry.com";

/* The modular SDK, loaded from Google's CDN only on the two pages that ask
 * for it, and only at the moment they actually need Firebase: the booking
 * page imports it on first submit, the studio after its gate opens. Nothing
 * is fetched from here on any other page, and neither page blocks its first
 * paint on the network. */
export const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
