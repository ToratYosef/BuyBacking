// hi.cjs
const admin = require("firebase-admin");
const path = require("path");

// Load service account from this folder
const serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));

// Initialize Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function cloneS25ToGalaxyS25() {
  const srcPath = "devices/samsung/models/s25-ultra";
  const destPath = "devices/samsung/models/galaxy-s25-ultra";

  const srcRef = db.doc(srcPath);
  const destRef = db.doc(destPath);

  const snap = await srcRef.get();

  if (!snap.exists) {
    console.error("Source document does not exist:", srcPath);
    return;
  }

  const data = snap.data();

  const cloned = {
    ...data,
    slug: "galaxy-s25-ultra",
    name: "Galaxy S25 Ultra",
    deeplink: data.deeplink
      ? data.deeplink.replace(
          "device=samsung-s25-ultra",
          "device=samsung-galaxy-s25-ultra"
        )
      : `https://secondhandcell.com/sell/?device=samsung-galaxy-s25-ultra&storage={storage}&carrier={carrier}&power={power}&functionality={functionality}&quality={quality}`,
  };

  await destRef.set(cloned);

  console.log("Cloned successfully →", destPath);
}

cloneS25ToGalaxyS25()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
