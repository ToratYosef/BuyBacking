// download_faces.js
const https = require("https");
const fs = require("fs");
const path = require("path");

// How many faces you want
const COUNT = 100;

// Where to save them (relative to this script)
const OUTPUT_DIR = path.join(__dirname, "assets", "faces");

// Helper: make sure directory exists
function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Download a single image and save as N.jpg
function downloadImage(index) {
  return new Promise((resolve, reject) => {
    const url = "https://thispersondoesnotexist.com/";
    const filePath = path.join(OUTPUT_DIR, `${index}.jpg`);
    const file = fs.createWriteStream(filePath);

    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          file.close(() => {
            fs.unlink(filePath, () => {}); // clean up partial file
          });
          return reject(
            new Error(`Request failed. Status code: ${res.statusCode}`)
          );
        }

        res.pipe(file);

        file.on("finish", () => {
          file.close(() => {
            console.log(`Saved ${filePath}`);
            resolve(filePath);
          });
        });
      })
      .on("error", (err) => {
        file.close(() => {
          fs.unlink(filePath, () => {}); // clean up partial file
        });
        reject(err);
      });
  });
}

// Small delay to be nice to the server / avoid rate limiting
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Main runner
(async () => {
  try {
    ensureDirSync(OUTPUT_DIR);

    for (let i = 1; i <= COUNT; i++) {
      console.log(`Downloading face ${i}/${COUNT}...`);
      await downloadImage(i);
      await sleep(1500); // 1.5 second delay between requests (tweak if you want)
    }

    console.log("✅ Done downloading faces.");
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
})();
