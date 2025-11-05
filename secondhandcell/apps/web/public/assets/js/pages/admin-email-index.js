import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// IMPORTANT: In a real-world scenario, you would not expose API keys directly in client-side code.
// These keys should be stored securely on a server.

// Initialize Firebase
const app = firebaseApp;
const db = getFirestore(app);
const auth = getAuth(app);

// UI Elements
const htmlInput = document.getElementById('htmlInput');
const previewBtn = document.getElementById('previewBtn');
const previewFrame = document.getElementById('previewFrame');
const toInput = document.getElementById('toInput');
const bccInput = document.getElementById('bccInput');
const subjectInput = document.getElementById('subjectInput');
const pullEmailsBtn = document.getElementById('pullEmailsBtn');
const emailsDisplay = document.getElementById('emailsDisplay');
const copyEmailsBtn = document.getElementById('copyEmailsBtn');
const sendBtn = document.getElementById('sendBtn');
const statusMessage = document.getElementById('statusMessage');

// Authentication and Firestore setup
async function setupFirebase() {
try {
// Sign in anonymously to read public data
await signInAnonymously(auth);
console.log("Signed in anonymously to Firebase.");
} catch (error) {
console.error("Error signing in to Firebase:", error);
statusMessage.textContent = "Error signing in to Firebase. Check console for details.";
statusMessage.style.color = 'red';
}
}

setupFirebase();

// Pull all emails from the 'signed_up_emails' collection
pullEmailsBtn.addEventListener('click', async () => {
statusMessage.textContent = 'Pulling emails...';
statusMessage.style.color = 'gray';
try {
const emailsRef = collection(db, "signed_up_emails");
const querySnapshot = await getDocs(emailsRef);
const emails = [];
querySnapshot.forEach((doc) => {
const emailData = doc.data();
if (emailData.email) {
emails.push(emailData.email);
}
});
const emailList = emails.join(', ');
emailsDisplay.textContent = emailList || 'No emails found.';
statusMessage.textContent = `Found ${emails.length} emails.`;
statusMessage.style.color = 'green';
} catch (error) {
console.error("Error pulling emails:", error);
statusMessage.textContent = "Error pulling emails. Check console for details.";
statusMessage.style.color = 'red';
}
});

// Copy emails to clipboard
copyEmailsBtn.addEventListener('click', () => {
const emails = emailsDisplay.textContent;
if (emails && emails !== 'No emails found.') {
// Use a temporary element to copy the text
const tempTextarea = document.createElement('textarea');
tempTextarea.value = emails;
document.body.appendChild(tempTextarea);
tempTextarea.select();
document.execCommand('copy');
document.body.removeChild(tempTextarea);

statusMessage.textContent = 'Emails copied to clipboard!';
statusMessage.style.color = 'green';
} else {
statusMessage.textContent = 'No emails to copy.';
statusMessage.style.color = 'red';
}
});

// Preview email in the iframe
previewBtn.addEventListener('click', () => {
const htmlContent = htmlInput.value;
const iframeDoc = previewFrame.contentWindow.document;
iframeDoc.open();
iframeDoc.write(htmlContent);
iframeDoc.close();
});

// Send the email
sendBtn.addEventListener('click', async () => {
statusMessage.textContent = 'Sending email...';
statusMessage.style.color = 'gray';

const htmlContent = htmlInput.value;
const toAddress = toInput.value;
const bccAddresses = bccInput.value.split(',').map(e => e.trim()).filter(e => e);
const subject = subjectInput.value;

// This is the URL to your deployed Firebase Function
const functionsUrl = 'https://us-central1-buyback-a0f05.cloudfunctions.net/api/send-email';

try {
const response = await fetch(functionsUrl, {
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify({
to: toAddress,
bcc: bccAddresses,
subject: subject,
html: htmlContent
})
});

if (response.ok) {
statusMessage.textContent = 'Email sent successfully!';
statusMessage.style.color = 'green';
} else {
const errorText = await response.text();
console.error("Failed to send email:", errorText);
statusMessage.textContent = `Failed to send email. Error: ${errorText}`;
statusMessage.style.color = 'red';
}
} catch (error) {
console.error("Network or server error:", error);
statusMessage.textContent = "A network error occurred. Check your server connection.";
statusMessage.style.color = 'red';
}
});
