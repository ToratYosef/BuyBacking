import { firebaseApp } from "/assets/js/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, deleteDoc, doc, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Set Firebase debug logging for development
setLogLevel('debug');

const app = firebaseApp;
const db = getFirestore(app);

const form = document.getElementById('unsubscribeForm');
const emailInput = document.getElementById('emailInput');
const statusMessage = document.getElementById('statusMessage');

// Function to display status messages to the user
const showStatus = (message, type) => {
statusMessage.textContent = message;
statusMessage.className = 'message-box';
if (type === 'success') {
statusMessage.classList.add('success');
} else if (type === 'error') {
statusMessage.classList.add('error');
} else if (type === 'loading') {
statusMessage.classList.add('loading');
}
statusMessage.classList.remove('hidden');
};

form.addEventListener('submit', async (e) => {
e.preventDefault();
const email = emailInput.value.toLowerCase();
showStatus('Processing...', 'loading');

try {
// Query the database for the document with the matching email
const q = query(collection(db, `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/public/data/signed_up_emails`), where("email", "==", email));
const querySnapshot = await getDocs(q);

if (querySnapshot.empty) {
showStatus("This email is not on our mailing list, or it has already been unsubscribed.", 'success');
} else {
// Assuming email is a unique field, there should only be one document
const docToDelete = querySnapshot.docs[0];
await deleteDoc(doc(db, `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/public/data/signed_up_emails`, docToDelete.id));
showStatus("You have been successfully unsubscribed.", 'success');
}
} catch (error) {
console.error("Error unsubscribing:", error);
showStatus("An error occurred. Please try again later.", 'error');
}
});
