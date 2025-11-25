// clone-order.js
const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function cloneOrder() {
  const sourcePath = "orders/SHC-18429";
  const targetPath = "users/ghaDOQTRiFTsOrLNnUhhB86jg1k1/orders/SHC-18429";

  const sourceRef = db.doc(sourcePath);
  const targetRef = db.doc(targetPath);

  const snap = await sourceRef.get();

  if (!snap.exists) {
    console.error("Source document does not exist:", sourcePath);
    process.exit(1);
  }

  const data = snap.data();

  await targetRef.set(data, { merge: false }); // overwrite target fully
  console.log(`Cloned ${sourcePath} → ${targetPath}`);
}

cloneOrder()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
