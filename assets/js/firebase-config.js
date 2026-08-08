/* Firebase web configuration for the appointment system.
 *
 * This is the project's web config exactly as the Firebase console printed
 * it (Project settings, General, Your apps, Web). A web config IDENTIFIES a
 * project; it is not a credential and hiding it buys nothing, which is why
 * every Firebase site on earth ships it in the open. The security of the
 * system lives in firestore.rules, which the server enforces whatever any
 * client says, and in the admin's own sign-in.
 *
 * Nothing else on the site touches Firebase, so no page pays a byte for it
 * until the moment the booking form is submitted or the studio unlocks. If
 * the project is ever rebuilt, paste the new config over this object; set
 * it back to null and the form goes back to offering the store's phone.
 */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD48Io2f5ZNtBl1JyE2zmcd_ciyAuK1neQ",
  authDomain: "adriano-jewelry.firebaseapp.com",
  projectId: "adriano-jewelry",
  storageBucket: "adriano-jewelry.firebasestorage.app",
  messagingSenderId: "1029373256576",
  appId: "1:1029373256576:web:debb1f7236f9922c155765",
};

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
