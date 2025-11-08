import { firebaseApp, firebaseConfig } from "/assets/js/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, getDoc, collectionGroup, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Firebase configuration provided by the user

// Check if firebase config is provided
if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) {
document.getElementById('error-message').innerText = 'Firebase configuration is missing. Please provide the config for your project.';
document.getElementById('error-message').classList.remove('hidden');
document.getElementById('loading').classList.add('hidden');
throw new Error('Firebase configuration is missing.');
}

// Initialize Firebase
const app = firebaseApp;
const db = getFirestore(app);
const auth = getAuth(app);

// Corrected Firestore paths
const devicesCollection = collection(db, 'devices');
const deviceClicksCollection = collection(db, 'device_clicks');
const usersCollection = collection(db, 'users');
const adminsCollection = collection(db, 'admins');

let unsubscribeDevices = null;

// DOM elements
const loginFormContainer = document.getElementById('login-form-container');
const mainContainer = document.getElementById('main-container');
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const loginMessage = document.getElementById('login-message');
const signOutButton = document.getElementById('sign-out-btn');
const loadingEl = document.getElementById('loading');
const errorMessageEl = document.getElementById('error-message');
const devicesContainerEl = document.getElementById('devices-container');
const historyModalEl = document.getElementById('history-modal');
const modalTitleEl = document.getElementById('modal-title');
const modalContentEl = document.getElementById('modal-content');
const modalSummaryEl = document.getElementById('modal-summary');
const closeModalButton = document.getElementById('close-modal');

// Handle admin login
loginForm.addEventListener('submit', async (e) => {
e.preventDefault();
const email = emailInput.value;
const password = passwordInput.value;
loginMessage.classList.add('hidden');

try {
const userCredential = await signInWithEmailAndPassword(auth, email, password);
const user = userCredential.user;

// Check if the user is an admin
const adminDoc = await getDoc(doc(db, 'admins', user.uid));
if (!adminDoc.exists) {
await signOut(auth);
loginMessage.textContent = 'Access Denied: You are not an admin.';
loginMessage.classList.remove('hidden');
return;
}

console.log("Admin signed in:", user.email);
loginFormContainer.classList.add('hidden');
mainContainer.classList.remove('hidden');
startListeningForDevices();
} catch (error) {
console.error("Login error:", error);
loginMessage.textContent = `Login failed: ${error.message}`;
loginMessage.classList.remove('hidden');
}
});

signOutButton.addEventListener('click', async () => {
try {
await signOut(auth);
mainContainer.classList.add('hidden');
loginFormContainer.classList.remove('hidden');
if (unsubscribeDevices) {
unsubscribeDevices();
}
} catch (error) {
console.error("Error signing out:", error);
}
});

onAuthStateChanged(auth, (user) => {
if (user) {
getDoc(doc(db, 'admins', user.uid)).then(adminDoc => {
if (adminDoc.exists()) {
console.log('User is already signed in as an admin.');
loginFormContainer.classList.add('hidden');
mainContainer.classList.remove('hidden');
startListeningForDevices();
} else {
console.log('User is signed in but is not an admin.');
signOut(auth);
}
});
} else {
console.log('User is not signed in.');
mainContainer.classList.add('hidden');
loginFormContainer.classList.remove('hidden');
if (unsubscribeDevices) {
unsubscribeDevices();
}
}
});

function startListeningForDevices() {
if (unsubscribeDevices) {
unsubscribeDevices();
}

loadingEl.classList.remove('hidden');
errorMessageEl.classList.add('hidden');

const allDevices = {};

// Use a collection group query to get all documents in all 'models' subcollections
const modelsCollectionGroup = collectionGroup(db, 'models');

let unsubscribeModels = onSnapshot(modelsCollectionGroup, (modelsSnapshot) => {
modelsSnapshot.docs.forEach(doc => {
const data = doc.data();
const slug = data.slug || doc.id;

allDevices[slug] = {
id: slug,
deviceName: data.name || data.model || slug,
imageUrl: data.imageUrl || `https://placehold.co/100x100/E5E7EB/4B5563?text=${slug}`,
clicks: 0,
history: [],
};
});

// Once we have all devices, fetch the click counts and history from the 'device_clicks' collection.
let unsubscribeClicks = onSnapshot(deviceClicksCollection, (clicksSnapshot) => {
clicksSnapshot.docs.forEach(doc => {
const clicksData = doc.data();
if (allDevices[doc.id]) {
allDevices[doc.id].clicks = clicksData.count || 0;
allDevices[doc.id].history = clicksData.history || [];
}
});

// After combining the data, render the final list of devices.
renderDevices(Object.values(allDevices));
}, (error) => {
console.error("Error fetching device clicks:", error);
errorMessageEl.innerText = `Error fetching device clicks: ${error.message}`;
errorMessageEl.classList.remove('hidden');
loadingEl.classList.add('hidden');
});

// Combine unsubscribes so we can clean up both listeners later
unsubscribeDevices = () => {
unsubscribeModels();
unsubscribeClicks();
};
}, (error) => {
console.error("Error fetching device models:", error);
errorMessageEl.innerText = `Error fetching device models: ${error.message}`;
errorMessageEl.classList.remove('hidden');
loadingEl.classList.add('hidden');
});
}

function renderDevices(devices) {
devicesContainerEl.innerHTML = '';

if (devices.length === 0) {
devicesContainerEl.innerHTML = '<p class="text-center text-gray-500 col-span-full">No devices found.</p>';
} else {
devices.sort((a, b) => a.deviceName.localeCompare(b.deviceName));
devices.forEach(device => {
const card = document.createElement('div');
card.className = "bg-white p-4 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 ease-in-out cursor-pointer flex flex-col items-center justify-center space-y-4";
card.innerHTML = `
<img src="${device.imageUrl}" alt="${device.deviceName}" class="w-24 h-24 object-contain rounded-full shadow-inner">
<h3 class="text-xl font-semibold text-center text-gray-800">${device.deviceName}</h3>
<p class="text-gray-500 text-sm text-center">Clicks: <span class="font-bold text-gray-900">${device.clicks}</span></p>
`;
card.addEventListener('click', () => showHistory(device.id, device.deviceName, device.history));
devicesContainerEl.appendChild(card);
});
}
loadingEl.classList.add('hidden');
errorMessageEl.classList.add('hidden');
}

async function fetchUserNameAndEmail(userId) {
if (!userId || userId === 'anonymous') {
return { name: 'Anonymous User', email: 'N/A' };
}
try {
const userDocRef = doc(db, 'users', userId);
const userDoc = await getDoc(userDocRef);
if (userDoc.exists()) {
const userData = userDoc.data();
return {
name: userData.displayName || userData.email || 'Unknown User',
email: userData.email || 'N/A'
};
} else {
return { name: 'Unknown User', email: 'N/A' };
}
} catch (error) {
console.error("Error fetching user data:", error);
return { name: 'Error fetching user', email: 'N/A' };
}
}

async function showHistory(deviceId, deviceName, historyData) {
modalTitleEl.innerText = `${deviceName} Clicks`;
modalContentEl.innerHTML = '<div class="flex justify-center items-center"><div class="spinner"></div><span class="ml-2 text-gray-500">Loading history...</span></div>';
modalSummaryEl.innerText = '';

historyModalEl.classList.remove('hidden');
setTimeout(() => {
historyModalEl.querySelector('div').classList.add('scale-100', 'opacity-100');
}, 10);

if (!historyData || historyData.length === 0) {
modalContentEl.innerHTML = '<p class="text-center text-gray-500">No click history available for this device.</p>';
modalSummaryEl.innerText = 'Total Clicks: 0';
return;
}

try {
// Fetch user data for each click in parallel
const historyPromises = historyData.map(async (click, index) => {
const userData = await fetchUserNameAndEmail(click.userId);
return { ...click, userName: userData.name, userEmail: userData.email, index };
});

const clicksWithUserData = await Promise.all(historyPromises);

modalContentEl.innerHTML = '';
clicksWithUserData.forEach((click, index) => {
const clickDate = click.timestamp ? new Date(click.timestamp).toLocaleString() : 'N/A';
const clickItem = document.createElement('div');
clickItem.className = "border-b border-gray-200 py-3 last:border-b-0";
clickItem.innerHTML = `
<p class="text-sm font-semibold text-gray-900">Click #${index + 1}</p>
<p class="text-xs text-gray-500">Time: ${clickDate}</p>
<p class="text-sm">User: <span class="font-medium text-gray-800">${click.userName}</span></p>
<p class="text-sm">Email: <span class="font-medium text-gray-800">${click.userEmail}</span></p>
`;
modalContentEl.appendChild(clickItem);
});

modalSummaryEl.innerText = `Total Clicks: ${clicksWithUserData.length}`;
} catch (error) {
console.error("Error fetching history:", error);
modalContentEl.innerHTML = `<p class="text-center text-red-500">Error loading history: ${error.message}</p>`;
modalSummaryEl.innerText = '';
}
}

closeModalButton.addEventListener('click', () => {
historyModalEl.querySelector('div').classList.remove('scale-100', 'opacity-100');
historyModalEl.querySelector('div').classList.add('scale-95', 'opacity-0');
setTimeout(() => {
historyModalEl.classList.add('hidden');
}, 300);
});

// Close modal when clicking outside
historyModalEl.addEventListener('click', (e) => {
if (e.target.id === 'history-modal') {
closeModalButton.click();
}
});
