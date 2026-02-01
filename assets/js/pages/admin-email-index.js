import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { apiPost } from "/public/js/apiClient.js";

// Firebase init
const app = firebaseApp;
const db = getFirestore(app);
const auth = getAuth(app);

// UI elements
const htmlInput = document.getElementById("htmlInput");
const previewBtn = document.getElementById("previewBtn");
const previewFrame = document.getElementById("previewFrame");
const toInput = document.getElementById("toInput");
const bccInput = document.getElementById("bccInput");
const subjectInput = document.getElementById("subjectInput");

const pullEmailsBtn = document.getElementById("pullEmailsBtn");
const emailsDisplay = document.getElementById("emailsDisplay");
const copyEmailsBtn = document.getElementById("copyEmailsBtn");

const makeBatchesBtn = document.getElementById("makeBatchesBtn");
const batchInfo = document.getElementById("batchInfo");
const currentBatchEmails = document.getElementById("currentBatchEmails");
const prevBatchBtn = document.getElementById("prevBatchBtn");
const nextBatchBtn = document.getElementById("nextBatchBtn");
const sendBatchBtn = document.getElementById("sendBatchBtn");

const statusMessage = document.getElementById("statusMessage");

// State for batching
let allBccEmails = [];
let batches = [];
let currentBatchIndex = 0;

// Firebase auth
async function setupFirebase() {
  try {
    await signInAnonymously(auth);
    console.log("Signed in anonymously to Firebase.");
  } catch (error) {
    console.error("Error signing in to Firebase:", error);
    statusMessage.textContent = "Error signing in to Firebase. Check console.";
    statusMessage.style.color = "red";
  }
}
setupFirebase();

// Helpers
function parseEmailList(raw) {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(/[,\n;]/)
        .map((e) => e.trim())
        .filter((e) => e)
    )
  );
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function renderBatch() {
  if (!batches.length) {
    batchInfo.textContent = "No batches created.";
    currentBatchEmails.textContent = "";
    prevBatchBtn.disabled = true;
    nextBatchBtn.disabled = true;
    sendBatchBtn.disabled = true;
    return;
  }

  const batch = batches[currentBatchIndex];
  batchInfo.textContent = `Batch ${currentBatchIndex + 1} of ${
    batches.length
  } – ${batch.length} recipients`;

  currentBatchEmails.textContent = batch.join(", ");
  // Also show the current batch in the BCC input so you can see / edit if needed
  bccInput.value = batch.join(", ");

  prevBatchBtn.disabled = currentBatchIndex === 0;
  nextBatchBtn.disabled = currentBatchIndex === batches.length - 1;
  sendBatchBtn.disabled = batch.length === 0;
}

// Pull emails from Firestore
pullEmailsBtn.addEventListener("click", async () => {
  statusMessage.textContent = "Pulling emails...";
  statusMessage.style.color = "gray";

  try {
    const emailsRef = collection(db, "signed_up_emails");
    const snapshot = await getDocs(emailsRef);

    const emails = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.email) emails.push(String(data.email).trim());
    });

    const list = emails.join(", ");
    emailsDisplay.textContent = list || "No emails found.";
    bccInput.value = list;

    statusMessage.textContent = `Found ${emails.length} emails. Paste/edit and then click "Create 99-recipient Batches".`;
    statusMessage.style.color = "green";
  } catch (err) {
    console.error("Error pulling emails:", err);
    statusMessage.textContent = "Error pulling emails. Check console.";
    statusMessage.style.color = "red";
  }
});

// Copy displayed emails
copyEmailsBtn.addEventListener("click", () => {
  const text = emailsDisplay.textContent;
  if (!text || text === "No emails found.") {
    statusMessage.textContent = "No emails to copy.";
    statusMessage.style.color = "red";
    return;
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);

  statusMessage.textContent = "Emails copied to clipboard.";
  statusMessage.style.color = "green";
});

// Preview HTML in iframe
previewBtn.addEventListener("click", () => {
  const htmlContent = htmlInput.value || "";
  const iframeDoc = previewFrame.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(htmlContent);
  iframeDoc.close();
});

// Create batches of 99
makeBatchesBtn.addEventListener("click", () => {
  statusMessage.textContent = "";
  allBccEmails = parseEmailList(bccInput.value);

  if (!allBccEmails.length) {
    statusMessage.textContent = "No emails found in BCC field.";
    statusMessage.style.color = "red";
    return;
  }

  batches = chunkArray(allBccEmails, 99); // max 99 per batch
  currentBatchIndex = 0;
  renderBatch();

  statusMessage.textContent = `Created ${batches.length} batches of up to 99 emails. Use Prev/Next and "Send Current Batch".`;
  statusMessage.style.color = "green";
});

// Navigate batches
prevBatchBtn.addEventListener("click", () => {
  if (currentBatchIndex > 0) {
    currentBatchIndex--;
    renderBatch();
  }
});

nextBatchBtn.addEventListener("click", () => {
  if (currentBatchIndex < batches.length - 1) {
    currentBatchIndex++;
    renderBatch();
  }
});

// Send current batch only
sendBatchBtn.addEventListener("click", async () => {
  statusMessage.textContent = "Sending current batch...";
  statusMessage.style.color = "gray";

  const htmlContent = htmlInput.value;
  const toAddress = toInput.value.trim();
  const subject = subjectInput.value.trim();

  if (!toAddress || !subject || !htmlContent) {
    statusMessage.textContent = "To, Subject, and HTML content are required.";
    statusMessage.style.color = "red";
    return;
  }

  if (!batches.length) {
    statusMessage.textContent = "No batches created. Click 'Create 99-recipient Batches' first.";
    statusMessage.style.color = "red";
    return;
  }

  const batch = batches[currentBatchIndex];
  if (!batch.length) {
    statusMessage.textContent = "This batch is empty.";
    statusMessage.style.color = "red";
    return;
  }

  try {
    await apiPost(
      "/send-email",
      {
        to: toAddress,
        bcc: batch,
        subject,
        html: htmlContent,
      },
      { authRequired: true }
    );
    statusMessage.textContent = `Batch ${currentBatchIndex + 1} sent (${batch.length} recipients).`;
    statusMessage.style.color = "green";
  } catch (err) {
    console.error("Network/server error:", err);
    statusMessage.textContent = "Network error sending batch. Check console.";
    statusMessage.style.color = "red";
  }
});
