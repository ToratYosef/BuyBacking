import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import path from "path";
import { fileURLToPath } from "url";

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Construct the correct path to the service account key
const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
let db;

/**
 * Initializes Firebase Admin SDK and gets the Firestore database instance.
 */
async function initializeAppWithCredentials() {
  try {
    // We use the 'with' keyword to explicitly tell Node.js that the imported file is JSON.
    const { default: serviceAccount } = await import(serviceAccountPath, {
      with: { type: "json" }
    });
    const app = initializeApp({
      credential: cert(serviceAccount)
    });
    db = getFirestore(app);
  } catch (error) {
    console.error("Error initializing Firebase Admin SDK:", error);
    console.error("Please ensure the serviceAccountPath is correct and the file exists.");
    process.exit(1);
  }
}

/**
 * Deletes all Firestore user documents where the email field is null.
 * It fetches documents in batches to handle large numbers of users.
 */
async function deleteAnonymousUsersFromDatabase() {
  const BATCH_SIZE = 500;
  let deletedCount = 0;
  let hasMore = true;

  console.log("Starting to delete anonymous users from the Firestore database...");

  try {
    const usersRef = db.collection("users");
    let lastDoc = null;

    while (hasMore) {
      let query = usersRef.where("email", "==", null).limit(BATCH_SIZE);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }
      
      const snapshot = await query.get();
      hasMore = !snapshot.empty;
      
      if (!hasMore) {
        console.log("No more anonymous users found in the database.");
        break;
      }
      
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
        deletedCount++;
      });

      await batch.commit();
      console.log(`Successfully deleted a batch of ${snapshot.docs.length} anonymous user documents.`);
      
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    console.log("--- Deletion complete ---");
    console.log(`Successfully deleted a total of ${deletedCount} anonymous user documents from the database.`);
  } catch (error) {
    console.error("Error deleting anonymous users:", error);
    return 1;
  }
}

// Wrap the main execution logic in an async IIFE to use top-level await
(async () => {
  await initializeAppWithCredentials();
  await deleteAnonymousUsersFromDatabase();
})();
