import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, onSnapshot, query, orderBy, serverTimestamp, updateDoc, setDoc, getDocs, where, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const app = firebaseApp;
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', function() {

// --- UPDATED IMAGE LOADING LOGIC ---
function loadImageWithFallback(imgElement, imageUrl) {
if (!imageUrl) {
imgElement.src = 'https://placehold.co/200x200/e0e7ff/4338ca?text=No+Image';
imgElement.classList.remove('hidden');
return;
}

const extensions = ['.webp', '.avif', '.png', '.jpeg', '.jpg'];
let current = 0;

function tryLoad() {
if (current >= extensions.length) {
imgElement.src = 'https://placehold.co/200x200/e0e7ff/4338ca?text=No+Image';
imgElement.classList.remove('hidden');
return;
}
const testSrc = imageUrl + extensions[current];
const img = new Image();
img.onload = () => {
imgElement.src = testSrc;
imgElement.classList.remove('hidden');
};
img.onerror = () => { current++; tryLoad(); };
img.src = testSrc;
}
tryLoad();
}

// --- FULL AUTH & MODAL LOGIC ---
const modals = document.querySelectorAll('.modal');
const openModal = (modalId) => document.getElementById(modalId)?.classList.add('is-visible');
const closeModal = (modal) => modal.classList.remove('is-visible');

document.getElementById('loginNavBtn').addEventListener('click', (e) => { e.preventDefault(); openModal('loginModal'); showTab('login'); });
document.getElementById('aboutUsLink').addEventListener('click', (e) => { e.preventDefault(); openModal('aboutUsModal'); });
document.getElementById('privacyPolicyLink').addEventListener('click', (e) => { e.preventDefault(); openModal('privacyPolicyModal'); });
document.getElementById('termsAndConditionsLinkFooter').addEventListener('click', (e) => { e.preventDefault(); openModal('termsAndConditionsModal'); });

modals.forEach(modal => {
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
modal.querySelector('.close-modal-btn')?.addEventListener('click', () => closeModal(modal));
});

const loginTabBtn = document.getElementById('loginTabBtn');
const signupTabBtn = document.getElementById('signupTabBtn');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const authMessage = document.getElementById('authMessage');

const showTab = (tabName) => {
authMessage.classList.add('hidden');
[loginForm, signupForm].forEach(form => form.classList.add('hidden'));
[loginTabBtn, signupTabBtn].forEach(btn => btn.classList.remove('border-blue-600', 'text-blue-600'));

if (tabName === 'login') {
loginForm.classList.remove('hidden');
loginTabBtn.classList.add('border-blue-600', 'text-blue-600');
} else {
signupForm.classList.remove('hidden');
signupTabBtn.classList.add('border-blue-600', 'text-blue-600');
}
};

loginTabBtn.addEventListener('click', () => showTab('login'));
signupTabBtn.addEventListener('click', () => showTab('signup'));

const authStatusContainer = document.getElementById('authStatusContainer');
const loginNavBtn = document.getElementById('loginNavBtn');
const userMonogram = document.getElementById('userMonogram');
const authDropdown = document.getElementById('authDropdown');
const logoutBtn = document.getElementById('logoutBtn');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const googleSignupBtn = document.getElementById('googleSignupBtn');
const loginEmailInput = document.getElementById('loginEmail');
const loginPasswordInput = document.getElementById('loginPassword');
const signupNameInput = document.getElementById('signupName');
const signupEmailInput = document.getElementById('signupEmail');
const signupPasswordInput = document.getElementById('signupPassword');

function showAuthMessage(msg, type = 'error') {
authMessage.textContent = msg;
authMessage.className = 'mt-4 p-3 rounded-lg text-sm text-center'; // Reset classes
if (type === 'error') {
authMessage.classList.add('bg-red-100', 'text-red-700');
} else if (type === 'success') {
authMessage.classList.add('bg-green-100', 'text-green-700');
}
}

// Google Login/Signup
const googleProvider = new GoogleAuthProvider();
const signInWithGoogle = async () => {
try {
await signInWithPopup(auth, googleProvider);
closeModal(document.getElementById('loginModal'));
} catch (error) {
showAuthMessage(error.message);
}
};
googleLoginBtn.addEventListener('click', signInWithGoogle);
googleSignupBtn.addEventListener('click', signInWithGoogle);

// Email/Password Login
loginForm.addEventListener('submit', async (e) => {
e.preventDefault();
try {
await signInWithEmailAndPassword(auth, loginEmailInput.value, loginPasswordInput.value);
closeModal(document.getElementById('loginModal'));
} catch (error) {
showAuthMessage(error.message);
}
});

// Email/Password Signup
signupForm.addEventListener('submit', async (e) => {
e.preventDefault();
if (signupPasswordInput.value.length < 6) {
showAuthMessage('Password must be at least 6 characters long.');
return;
}
try {
const userCredential = await createUserWithEmailAndPassword(auth, signupEmailInput.value, signupPasswordInput.value);
await updateProfile(userCredential.user, { displayName: signupNameInput.value });
closeModal(document.getElementById('loginModal'));
} catch (error) {
showAuthMessage(error.message);
}
});

// Auth State Change Listener
onAuthStateChanged(auth, user => {
if (user) {
loginNavBtn.classList.add('hidden');
userMonogram.classList.remove('hidden');
const initials = (user.displayName || user.email).split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
userMonogram.textContent = initials;
} else {
loginNavBtn.classList.remove('hidden');
userMonogram.classList.add('hidden');
authDropdown.classList.add('hidden');
}
});

// Monogram Dropdown Toggle
userMonogram.addEventListener('click', (e) => {
e.stopPropagation();
authDropdown.classList.toggle('hidden');
});

// Close dropdown if clicking outside
document.addEventListener('click', () => {
if (!authDropdown.classList.contains('hidden')) {
authDropdown.classList.add('hidden');
}
});

// Logout
logoutBtn.addEventListener('click', () => {
signOut(auth);
});

// --- UPDATED DYNAMIC PHONE DATA & RENDERING ---
const phoneGrid = document.getElementById('phoneGrid');
const searchInput = document.getElementById('searchInput');
const noResultsMessage = document.getElementById('noResultsMessage');
const searchTermSpan = document.getElementById('searchTerm');
const loadingIndicator = document.getElementById('loadingIndicator');

// Define screen size check once at the top level
const isMobile = window.matchMedia('(max-width: 767px)').matches;

let allPhones = []; // This will now store our fetched phones

const fetchAndRenderPhones = async () => {
loadingIndicator.classList.remove('hidden');
const iPhoneCollection = collection(db, "devices/iphone/models");
allPhones = [];

try {
const querySnapshot = await getDocs(iPhoneCollection);
querySnapshot.forEach((doc) => {
const data = doc.data();
let maxPrice = 0;
if (data.prices) {
Object.values(data.prices).forEach(storageOption => {
if (storageOption.unlocked) {
Object.values(storageOption.unlocked).forEach(price => {
if (typeof price === 'number') maxPrice = Math.max(maxPrice, price);
});
}
if (storageOption.locked) {
Object.values(storageOption.locked).forEach(price => {
if (typeof price === 'number') maxPrice = Math.max(maxPrice, price);
});
}
});
}
allPhones.push({
...data,
highestPrice: maxPrice
});
});
} catch (error) {
console.error("Error fetching iPhone devices:", error);
phoneGrid.innerHTML = '<p class="text-center text-red-500">Failed to load device data.</p>';
loadingIndicator.classList.add('hidden');
return;
}

// Sort phones from newest to oldest based on the name.
// Assuming newer models have higher numbers in their names.
allPhones.sort((a, b) => {
const getModelNumber = (name) => {
const match = name.match(/(\d+)/);
return match ? parseInt(match[1]) : 0;
};
const numA = getModelNumber(a.name);
const numB = getModelNumber(b.name);

if (numA !== numB) {
return numB - numA;
}

// Secondary sort for pro/pro max etc.
if (a.name.includes('Ultra')) return -1;
if (b.name.includes('Ultra')) return 1;
if (a.name.includes('Plus')) return -1;
if (b.name.includes('Plus')) return 1;
if (a.name.includes('FE')) return 1;
if (b.name.includes('FE')) return -1;

return 0;
});

renderPhones(allPhones, isMobile);
loadingIndicator.classList.add('hidden');
};

const createUrlSlug = (name) => {
return name
.toLowerCase()
.replace('iphone ', '')
.replace('galaxy ', '')
.replace(/\s+/g, '-')
.replace(/\+/g, '-plus')
.replace(/[^a-z0-9-]/g, '');
};

const renderPhones = (phoneList, isMobile) => {
phoneGrid.innerHTML = '';
if (phoneList.length === 0) {
phoneGrid.classList.add('hidden');
noResultsMessage.classList.remove('hidden');
searchTermSpan.textContent = searchInput.value;
} else {
phoneGrid.classList.remove('hidden');
noResultsMessage.classList.add('hidden');
phoneList.forEach(phone => {
const slug = createUrlSlug(phone.name);
const deviceLink = `https://secondhandcell.com/sell?device=iphone-${slug}`;

let cardContent;

if (!isMobile) {
// PC version with image and direct link
cardContent = `
<a href="${deviceLink}" class="desktop-image-link">
<div class="p-6 rounded-lg text-center">
<img src="${phone.imageUrl}.webp" onerror="this.onerror=null;this.src='https://placehold.co/200x200/e0e7ff/4338ca?text=No+Image';this.classList.remove('hidden');" class="mx-auto my-4 w-48 h-auto object-contain hidden" alt="${phone.name}">
<h3 class="text-xl font-semibold text-slate-800">${phone.name}</h3>
<p class="text-sm text-slate-500 mt-2">Highest payout up to</p>
<p class="text-2xl font-bold text-blue-600 mt-1">$${phone.highestPrice.toFixed(2)}</p>
</div>
</a>
`;
} else {
// Mobile version with modal behavior
cardContent = `
<a href="#" class="phone-card-link" data-phone-data='${JSON.stringify(phone)}'>
<div class="phone-card-inner bg-white p-6 rounded-lg shadow-md hover:shadow-xl transition-shadow text-center cursor-pointer">
<h3 class="text-xl font-semibold text-slate-800">${phone.name}</h3>
<p class="text-sm text-slate-500 mt-2">Highest payout up to</p>
<p class="text-2xl font-bold text-blue-600 mt-1">$${phone.highestPrice.toFixed(2)}</p>
</div>
</a>
`;
}

phoneGrid.insertAdjacentHTML('beforeend', cardContent);
});

// Manually load images for the PC version since they aren't hidden by default
if (!isMobile) {
document.querySelectorAll('.desktop-image-link img').forEach(img => {
loadImageWithFallback(img, img.src.replace('.webp', ''));
});
}
}
};

searchInput.addEventListener('input', () => {
const query = searchInput.value.toLowerCase().trim();
const filteredPhones = allPhones.filter(p => p.name.toLowerCase().includes(query));
renderPhones(filteredPhones, isMobile);
});

fetchAndRenderPhones();

// --- Quote Modal Logic ---
const quoteModal = document.getElementById('quoteModal');
const quoteDeviceName = document.getElementById('quoteDeviceName');
const quoteHighestPrice = document.getElementById('quoteHighestPrice');
const quoteDeviceImage = document.getElementById('quoteDeviceImage');
const continueWithDeviceBtn = document.getElementById('continueWithDeviceBtn');

// --- FIREBASE CLICK TRACKER LOGIC ---
// This function handles the logic for incrementing the click counter and logging the timestamp.
const trackDeviceClick = async (slug, deviceName) => {
const user = auth.currentUser;

try {
// Reference the specific device's click count document in the 'device_clicks' collection.
const deviceClicksRef = doc(db, 'device_clicks', slug);

// Use a transaction to safely increment the counter and add the log entry.
// This prevents race conditions where multiple users could click at the same time.
await runTransaction(db, async (transaction) => {
const docSnapshot = await transaction.get(deviceClicksRef);

// Get the current count and click history, or initialize them if the document doesn't exist.
const currentCount = docSnapshot.exists() ? docSnapshot.data().count : 0;
const clickHistory = docSnapshot.exists() ? docSnapshot.data().history : [];

// Add the new click event to the history array.
clickHistory.push({
timestamp: new Date().toISOString(), // Use local ISO timestamp for client-side logging
userId: user ? user.uid : null
});

// Update the document with the new count and updated history.
transaction.set(deviceClicksRef, {
count: currentCount + 1,
history: clickHistory,
lastClicked: serverTimestamp(),
deviceName: deviceName
}, { merge: true }); // 'merge: true' ensures we only update the specified fields.
});

// Log the new total count to the console
console.log(`Click tracked for ${deviceName}. New count: ${currentCount + 1}`);
} catch (error) {
console.error("Error tracking device click:", error);
}
};

// --- Updated Event Listener for PC and Mobile Cards ---
// Using event delegation on the parent container to handle clicks on dynamically created elements.
document.getElementById('phoneGrid').addEventListener('click', (e) => {
const card = e.target.closest('.phone-card-link');
const desktopLink = e.target.closest('.desktop-image-link');

if (card) {
e.preventDefault();
const phoneData = JSON.parse(card.dataset.phoneData);
const slug = createUrlSlug(phoneData.name);

// Track click for the mobile card
trackDeviceClick(slug, phoneData.name);

// Show the quote modal
quoteDeviceName.textContent = phoneData.name;
quoteHighestPrice.textContent = `$${phoneData.highestPrice.toFixed(2)}`;
continueWithDeviceBtn.dataset.phoneData = JSON.stringify(phoneData);
loadImageWithFallback(quoteDeviceImage, phoneData.imageUrl);
openModal('quoteModal');
} else if (desktopLink) {
// Track click for the desktop card
const phoneName = desktopLink.querySelector('h3').textContent;
const slug = createUrlSlug(phoneName);
trackDeviceClick(slug, phoneName);
}
});

// --- REDIRECT LOGIC FOR THE "CONTINUE" BUTTON ---
continueWithDeviceBtn.addEventListener('click', (event) => {
event.preventDefault();
const phoneData = JSON.parse(continueWithDeviceBtn.dataset.phoneData);
if (phoneData) {
const slug = createUrlSlug(phoneData.name);
window.location.href = `https://secondhandcell.com/sell?device=iphone-${slug}`;
}
});

document.getElementById('chooseDifferentDeviceBtn').addEventListener('click', () => {
closeModal(quoteModal);
});

// --- ADVANCED LIVE CHAT LOGIC ---
const chatWindow = document.getElementById('chat-window');
const chatOpenBtn = document.getElementById('chat-open-btn');
const chatCloseBtn = document.getElementById('chat-close-btn');
const chatMinimizeBtn = document.getElementById('chat-minimize-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatInputContainer = document.getElementById('chat-input-container');
const guestPromptContainer = document.getElementById('guest-prompt-container');
const guestLoginBtn = document.getElementById('guest-login-btn');
const guestContinueBtn = document.getElementById('guest-continue-btn');
const unreadCounter = document.getElementById('unread-counter');
const typingIndicatorContainer = document.getElementById('typing-indicator-container');
const surveyContainer = document.getElementById('chat-survey-container');
const surveyForm = document.getElementById('chat-survey-form');
const starRatingContainer = document.getElementById('star-rating');
const endChatConfirmModal = document.getElementById('end-chat-confirm-modal');
const endChatYesBtn = document.getElementById('end-chat-yes');
const endChatNoBtn = document.getElementById('end-chat-no');
const orderSelectionContainer = document.getElementById('order-selection-container');
const orderList = document.getElementById('order-list');
const closeOrderSelectionBtn = document.getElementById('close-order-selection-btn');
const sendMessageBtn = document.getElementById('send-message-btn');
const globalTooltip = document.getElementById('globalTooltip');

let currentChatId = null;
let unsubscribeFromMessages = null;
let unsubscribeFromChatSession = null;
let isChatMinimized = true;
let unreadCount = 0;
let hasUserTypedFirstMessage = false;
let userTypingTimeout = null;
let initialWelcomeRendered = {};

const notificationSound = new Audio('https://cdn.freesound.org/previews/253/253887_3900531-lq.mp3');
notificationSound.volume = 0.5;

const getOrCreateGuestId = () => {
let id = localStorage.getItem('guestChatId');
if (!id) {
id = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
localStorage.setItem('guestChatId', id);
}
return id;
};

const getOrCreateChatSession = async () => {
let chatId = localStorage.getItem('chatSessionId');
if (chatId) return chatId;

const user = auth.currentUser;
const currentGuestId = getOrCreateGuestId();
const chatSessionData = {
createdAt: serverTimestamp(),
ownerUid: user ? user.uid : null,
guestId: user ? null : currentGuestId,
status: 'active',
agentName: null,
isAgentTyping: false,
userTypingText: '',
agentAskingForOrderId: false
};
const docRef = await addDoc(collection(db, "chats"), chatSessionData);
chatId = docRef.id;
localStorage.setItem('chatSessionId', chatId);
return chatId;
};

const renderMessage = (msg) => {
const messageDiv = document.createElement('div');
const user = auth.currentUser;
const currentGuestId = localStorage.getItem('guestChatId');
const isMyMessage = (user && msg.sender === user.uid) || (!user && msg.sender === currentGuestId);

let classes = 'p-3 rounded-lg max-w-[85%] mb-2 break-words';
if (msg.type === 'system') {
classes = 'text-center text-sm text-slate-500 my-2';
messageDiv.innerHTML = `<span class="bg-white px-2 py-1 rounded-full">${msg.text}</span>`;
} else {
classes += isMyMessage ? ' bg-gray-200 text-slate-800 self-end' : ' bg-blue-100 text-blue-800 self-start';
messageDiv.textContent = msg.text;
}

messageDiv.className = classes;
if (msg.type === 'system' && msg.text.includes('has joined the chat.')) {
messageDiv.id = `agent-joined-${currentChatId}`;
}
chatMessages.appendChild(messageDiv);
chatMessages.scrollTop = chatMessages.scrollHeight;
};

const listenForChatSessionChanges = (chatId) => {
if (unsubscribeFromChatSession) unsubscribeFromChatSession();
unsubscribeFromChatSession = onSnapshot(doc(db, "chats", chatId), async (docSnap) => {
const data = docSnap.data();
if (!data) return;

const agentJoinedFlag = localStorage.getItem(`agentJoined_${chatId}`);
if (data.agentName && data.agentHasJoined && !agentJoinedFlag) {
const joinMsgText = `<i class="fa-solid fa-headset mr-2"></i>${data.agentName} has joined the chat.`;
await addDoc(collection(db, `chats/${chatId}/messages`), {
text: joinMsgText,
timestamp: serverTimestamp(),
sender: 'system',
type: 'system'
});
localStorage.setItem(`agentJoined_${chatId}`, 'true');
}

typingIndicatorContainer.style.display = data.isAgentTyping ? 'block' : 'none';
if (data.isAgentTyping) chatMessages.scrollTop = chatMessages.scrollHeight;
if (data.status === 'ended_by_agent') {
chatInputContainer.classList.add('hidden');
guestPromptContainer.classList.add('hidden');
surveyContainer.classList.remove('hidden');
orderSelectionContainer.classList.add('hidden');
localStorage.removeItem('chatSessionId');
localStorage.removeItem(`agentJoined_${chatId}`);
}
if (data.agentAskingForOrderId) {
displayOrderSelectionUI();
} else {
orderSelectionContainer.classList.add('hidden');
}
});
};

const listenForMessages = (chatId) => {
if (unsubscribeFromMessages) unsubscribeFromMessages();
currentChatId = chatId;
const messagesRef = collection(db, `chats/${chatId}/messages`);
const q = query(messagesRef, orderBy("timestamp"));
unsubscribeFromMessages = onSnapshot(q, (snapshot) => {
chatMessages.innerHTML = '';
if (!initialWelcomeRendered[chatId] && snapshot.empty) {
const user = auth.currentUser;
const userName = user?.displayName?.split(' ')[0] || 'there';
renderMessage({ type: 'system', text: `Hi ${userName}, how can we help you today?` });
initialWelcomeRendered[chatId] = true;
}

snapshot.forEach(doc => {
const msgData = doc.data();
renderMessage(msgData);
const user = auth.currentUser;
const currentGuestId = localStorage.getItem('guestChatId');
const isMyMessage = (user && msgData.sender === user.uid) || (!user && msgData.sender === currentGuestId);
if (!isMyMessage && isChatMinimized) {
unreadCount++;
unreadCounter.textContent = unreadCount;
unreadCounter.classList.add('visible');
notificationSound.play().catch(e => console.log("Audio play failed:", e));
}
});
});
};

const resetChatUI = () => {
endChatConfirmModal.classList.add('hidden');
endChatConfirmModal.classList.remove('flex');
surveyContainer.classList.add('hidden');
guestPromptContainer.classList.add('hidden');
chatInputContainer.classList.remove('hidden');
orderSelectionContainer.classList.add('hidden');
typingIndicatorContainer.style.display = 'none';
chatMessages.innerHTML = '';
initialWelcomeRendered = {};
};

const openChat = async () => {
if (!currentChatId) {
currentChatId = await getOrCreateChatSession();
hasUserTypedFirstMessage = false;
}
resetChatUI();
chatWindow.classList.add('is-visible');
isChatMinimized = false;
unreadCount = 0;
unreadCounter.classList.remove('visible');
if (currentChatId) {
listenForMessages(currentChatId);
listenForChatSessionChanges(currentChatId);
}
};
chatOpenBtn.addEventListener('click', openChat);

const minimizeChat = () => {
chatWindow.classList.remove('is-visible');
isChatMinimized = true;
};
chatMinimizeBtn.addEventListener('click', minimizeChat);

chatCloseBtn.addEventListener('click', () => {
endChatConfirmModal.classList.remove('hidden');
endChatConfirmModal.classList.add('flex');
});

endChatNoBtn.addEventListener('click', () => {
endChatConfirmModal.classList.add('hidden');
endChatConfirmModal.classList.remove('flex');
});

endChatYesBtn.addEventListener('click', async () => {
if (currentChatId) {
await addDoc(collection(db, `chats/${currentChatId}/messages`), {
text: "Chat ended by user.",
timestamp: serverTimestamp(),
sender: 'system',
type: 'system'
});
await updateDoc(doc(db, "chats", currentChatId), { status: 'ended_by_user' });
}
localStorage.removeItem('chatSessionId');
localStorage.removeItem(`agentJoined_${currentChatId}`);
currentChatId = null;
hasUserTypedFirstMessage = false;
chatMessages.innerHTML = '';
endChatConfirmModal.classList.add('hidden');
endChatConfirmModal.classList.remove('flex');
minimizeChat();
});

const sendMessage = async (text) => {
if (text.trim() === '' || !currentChatId) return;
const user = auth.currentUser;
if (!user && !hasUserTypedFirstMessage) {
hasUserTypedFirstMessage = true;
chatInputContainer.classList.add('hidden');
guestPromptContainer.classList.remove('hidden');
return;
}
const currentGuestId = getOrCreateGuestId();
const messageData = { text, timestamp: serverTimestamp(), sender: user ? user.uid : currentGuestId };
await addDoc(collection(db, `chats/${currentChatId}/messages`), messageData);
chatInput.value = '';
await updateDoc(doc(db, "chats", currentChatId), {
userTypingText: '',
lastMessage: `User: ${text}`,
lastMessageTimestamp: serverTimestamp()
});
};

chatInput.addEventListener('keypress', (e) => {
if (e.key === 'Enter') {
e.preventDefault();
sendMessage(chatInput.value);
}
});
sendMessageBtn.addEventListener('click', () => {
sendMessage(chatInput.value);
});

chatInput.addEventListener('keyup', () => {
clearTimeout(userTypingTimeout);
userTypingTimeout = setTimeout(async () => {
if (currentChatId) {
await updateDoc(doc(db, "chats", currentChatId), { userTypingText: chatInput.value });
}
}, 300);
});

guestLoginBtn.addEventListener('click', () => openModal('loginModal'));
guestContinueBtn.addEventListener('click', () => {
guestPromptContainer.classList.add('hidden');
chatInputContainer.classList.remove('hidden');
chatInput.focus();
});

const friendlinessRating = document.getElementById('friendliness-rating');
const friendlinessValue = document.getElementById('friendliness-value');
if (friendlinessRating) {
friendlinessRating.addEventListener('input', (e) => { friendlinessValue.textContent = e.target.value; });
}
starRatingContainer.addEventListener('mouseover', e => {
if (e.target.tagName === 'I') {
const rating = e.target.dataset.value;
Array.from(starRatingContainer.children).forEach(star => star.classList.toggle('selected', star.dataset.value <= rating));
}
});
starRatingContainer.addEventListener('mouseout', () => {
const currentRating = starRatingContainer.dataset.rating;
Array.from(starRatingContainer.children).forEach(star => star.classList.toggle('selected', star.dataset.value <= currentRating));
});
starRatingContainer.addEventListener('click', e => {
if (e.target.tagName === 'I') {
starRatingContainer.dataset.rating = e.target.dataset.value;
}
});
surveyForm.addEventListener('submit', async (e) => {
e.preventDefault();
const surveyData = {
overallRating: parseInt(starRatingContainer.dataset.rating, 10),
friendliness: friendlinessRating ? friendlinessRating.value : null,
resolved: document.querySelector('input[name="issue-resolved"]:checked')?.value || null,
comments: document.getElementById('survey-comments')?.value || null
};
await setDoc(doc(db, `chats/${currentChatId}/survey/feedback`), { ...surveyData, submittedAt: serverTimestamp() });
try {
const cloudFunctionUrl = 'https://us-central1-buyback-a0f05.cloudfunctions.net/api/submit-chat-feedback';
const response = await fetch(cloudFunctionUrl, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ chatId: currentChatId, surveyData: surveyData })
});
if (!response.ok) throw new Error(`Server responded with status: ${response.status}`);
console.log('Feedback email sent successfully:', await response.json());
} catch (error) { console.error("Error sending feedback email:", error); }
surveyContainer.innerHTML = '<p class="text-center font-semibold text-green-600">Thank you for your feedback!</p>';
});

// --- USER ORDERS LOGIC ---
const fetchUserOrders = async () => {
return new Promise((resolve) => {
const unsubscribe = onAuthStateChanged(auth, async (user) => {
unsubscribe();
if (!user) {
resolve({ requiresLogin: true });
return;
}
const userId = user.uid;
const ordersRef = collection(db, "orders");
const q = query(ordersRef, where("userId", "==", userId), orderBy("createdAt", "desc"));
try {
const snapshot = await getDocs(q);
const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
resolve(orders);
} catch (error) {
console.error("Error fetching user orders:", error);
resolve({ error: error.message });
}
});
});
};

const renderOrderSelection = (orders) => {
orderList.innerHTML = '';
if (orders.requiresLogin) {
orderList.innerHTML = '<p class="text-center text-slate-500">Please <a href="#" id="orderLoginPromptLink" class="text-blue-600 font-semibold hover:underline">log in</a> to view orders.</p>';
document.getElementById('orderLoginPromptLink').addEventListener('click', (e) => {
e.preventDefault();
openModal('loginModal');
});
return;
}

if (!orders || orders.length === 0) {
orderList.innerHTML = '<p class="text-center text-slate-500">No recent orders found.</p>';
return;
}
orders.forEach(order => {
const orderCard = document.createElement('div');
orderCard.className = 'order-card';
orderCard.dataset.orderId = order.orderId;
orderCard.innerHTML = `
<img src="${order.imageUrl || 'https://placehold.co/48x48/e0e7ff/4338ca?text=📱'}" alt="${order.device}" onerror="this.onerror=null;this.src='https://placehold.co/48x48/e0e7ff/4338ca?text=📱';">
<div class="order-card-details">
<strong>ID: ${order.orderId} - ${order.device}</strong>
<span>${order.storage} | $${order.estimatedQuote}</span>
</div>`;
orderCard.addEventListener('click', () => handleOrderSelection(order));
orderList.appendChild(orderCard);
});
};

const displayOrderSelectionUI = async () => {
guestPromptContainer.classList.add('hidden');
orderSelectionContainer.classList.remove('hidden');
orderList.innerHTML = '<p class="text-center text-blue-500">Loading your orders...</p>';
const orders = await fetchUserOrders();
renderOrderSelection(orders);
};

const handleOrderSelection = async (order) => {
const messageText = `Selected Order: ID: ${order.orderId}, Device: ${order.device}`;
await sendMessage(messageText);
orderSelectionContainer.classList.add('hidden');
if (currentChatId) {
await updateDoc(doc(db, "chats", currentChatId), { agentAskingForOrderId: false });
}
};

closeOrderSelectionBtn.addEventListener('click', async () => {
orderSelectionContainer.classList.add('hidden');
if (currentChatId) {
await updateDoc(doc(db, "chats", currentChatId), { agentAskingForOrderId: false });
}
});

const chatOrderBtn = document.getElementById('chat-order-btn');
chatOrderBtn.addEventListener('click', async () => {
if (currentChatId) {
await updateDoc(doc(db, "chats", currentChatId), { agentAskingForOrderId: true });
} else {
displayOrderSelectionUI();
}
});

const chatHeaderButtons = document.querySelectorAll('.chat-header-button');
chatHeaderButtons.forEach(button => {
let tooltipTimeout;
button.addEventListener('mouseover', (e) => {
clearTimeout(tooltipTimeout);
const tooltipText = button.dataset.tooltipText;
if (tooltipText) {
globalTooltip.textContent = tooltipText;
globalTooltip.style.visibility = 'visible';
globalTooltip.style.opacity = '1';
const rect = button.getBoundingClientRect();
globalTooltip.style.top = `${rect.bottom + 8}px`;
globalTooltip.style.left = `${rect.left + rect.width / 2}px`;
globalTooltip.style.transform = `translateX(-50%)`;
}
});
button.addEventListener('mouseout', () => {
tooltipTimeout = setTimeout(() => {
globalTooltip.style.visibility = 'hidden';
globalTooltip.style.opacity = '0';
}, 100);
});
});
});
