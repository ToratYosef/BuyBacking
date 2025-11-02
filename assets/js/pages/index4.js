import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail, signInWithCustomToken, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, onSnapshot, query, orderBy, serverTimestamp, updateDoc, setDoc, getDocs, runTransaction, increment, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

       // setLogLevel('debug');

// --- START: USER'S EXPLICIT FIREBASE CONFIG ---
// Removed global variables based on user request.

// --- END: USER'S EXPLICIT FIREBASE CONFIG ---

// Initialize Firebase with the provided config
const app = firebaseApp;
const auth = getAuth(app);
const db = getFirestore(app);

// This function would typically rely on the global initialAuthToken for immediate sign-in.
// Since we removed it, we'll ensure unauthenticated users are treated as guests/anonymous.
const getOrCreateGuestId = () => {
let id = localStorage.getItem('guestChatId');
if (!id) {
id = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
localStorage.setItem('guestChatId', id);
}
return id;
};

// --- Firebase Click Tracker Function ---
const trackButtonClick = async (buttonName) => {
const cleanedButtonName = buttonName.replace(/\s/g, '_').replace(/'/g, '');
const buttonDocRef = doc(db, "button_clicks", cleanedButtonName);
// Updated to ensure userId is retrieved safely after auth state change.
const userId = auth.currentUser?.uid || getOrCreateGuestId();
const now = new Date().toISOString();

try {
await runTransaction(db, async (transaction) => {
const buttonDoc = await transaction.get(buttonDocRef);
if (!buttonDoc.exists()) {
transaction.set(buttonDocRef, {
count: 1,
buttonName: buttonName,
history: [{ timestamp: now, userId: userId }],
lastClicked: now
});
} else {
const data = buttonDoc.data();
const updatedHistory = [...(data.history || []), { timestamp: now, userId: userId }];
transaction.update(buttonDocRef, {
count: increment(1),
history: updatedHistory,
lastClicked: now
});
}
});
console.log(`Click on '${buttonName}' successfully tracked and updated.`);
} catch (error) {
console.error("Transaction failed: ", error);
}
};
// ----------------------------------------

document.addEventListener('DOMContentLoaded', function() {
// Initial sign-in with custom token or anonymously
onAuthStateChanged(auth, async (user) => {
// Since initialAuthToken is removed, we only check for existing user and sign in anonymously if none exists.
if (!user) {
try { await signInAnonymously(auth); } catch (e) { console.error("Anonymous sign-in failed:", e); }
}
});

function loadImageWithFallback(imgElement) {
const baseSrc = imgElement.dataset.baseSrc;
if (!baseSrc) return;
const extensions = ['.webp','.svg', '.avif', '.png', '.jpeg', '.jpg', '.svg'];
let current = 0;
function tryLoad() {
if (current >= extensions.length) {
if (imgElement.id.includes('_cat_img')) { imgElement.src = `https://placehold.co/150x150/e0e7ff/4338ca?text=Category`; }
else { imgElement.src = `https://placehold.co/200x200/f0f4ff/6366f1?text=No+Image`; }
imgElement.alt = "Image not available";
return;
}
const testSrc = baseSrc + extensions[current];
const img = new Image();
img.onload = () => { imgElement.src = testSrc; };
img.onerror = () => { current++; tryLoad(); };
img.src = testSrc;
}
tryLoad();
}
document.querySelectorAll('img[data-base-src]').forEach(loadImageWithFallback);

const modals = document.querySelectorAll('.modal');
const openModal = (modalId) => document.getElementById(modalId)?.classList.add('is-visible');
const closeModal = (modal) => modal.classList.remove('is-visible');

document.getElementById('loginNavBtn').addEventListener('click', (e) => { e.preventDefault(); openModal('loginModal'); });
document.getElementById('aboutUsLink').addEventListener('click', (e) => { e.preventDefault(); openModal('aboutUsModal'); });
document.getElementById('functionalDetailsIcon')?.addEventListener('click', (e) => { e.preventDefault(); openModal('fullyFunctionalModal'); });

modals.forEach(modal => {
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
modal.querySelector('.close-modal-btn')?.addEventListener('click', () => closeModal(modal));
});

document.getElementById('heroOfferBtn').addEventListener('click', () => {
trackButtonClick('Hero_Get_Instant_Offer');
openModal('pricingModal');
});
document.getElementById('finalOfferBtn')?.addEventListener('click', () => trackButtonClick('Final_Sell_Device_Now'));

document.querySelectorAll('.feature-card h3').forEach(card => {
card.addEventListener('click', () => {
trackButtonClick(`Feature_Card_${card.textContent.trim()}`);
});
});

document.querySelectorAll('.homepage-card-link').forEach(link => {
link.addEventListener('click', (e) => {
const deviceName = e.currentTarget.querySelector('h3').textContent;
trackButtonClick(`Popular_Device_Get_Offer_${deviceName}`);
});
});

// NEW: Click handlers for external review links
document.querySelectorAll('.review-link-card').forEach(link => {
link.addEventListener('click', () => {
const platformName = link.querySelector('h3').textContent;
trackButtonClick(`External_Review_Click_${platformName.replace(/\s/g, '_')}`);
});
});

const footerEmailSignupForm = document.getElementById('footerEmailSignupForm');
const footerSignupMessage = document.getElementById('footerSignupMessage');
footerEmailSignupForm.addEventListener('submit', async (e) => {
e.preventDefault();
const email = document.getElementById('footerPromoEmail').value;
footerSignupMessage.textContent = 'Submitting...';
footerSignupMessage.className = 'mt-3 text-sm text-center text-blue-300';

try {
await addDoc(collection(db, "signed_up_emails"), {
email: email,
timestamp: new Date()
});
footerSignupMessage.textContent = 'Success! Thanks for signing up.';
footerSignupMessage.className = 'mt-3 text-sm text-center text-green-300';
footerEmailSignupForm.reset();
trackButtonClick('Footer_Email_Signup');
} catch (error) {
console.error("Error adding document: ", error);
footerSignupMessage.textContent = 'Error: Could not sign up.';
footerSignupMessage.className = 'mt-3 text-sm text-center text-red-300';
}
});

const authStatusContainer = document.getElementById('authStatusContainer');
const userMonogram = document.getElementById('userMonogram');
const authDropdown = document.getElementById('authDropdown');
const logoutBtn = document.getElementById('logoutBtn');
const loginTabBtn = document.getElementById('loginTabBtn');
const signupTabBtn = document.getElementById('signupTabBtn');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const forgotPasswordForm = document.getElementById('forgotPasswordForm');
const authMessage = document.getElementById('authMessage');

const showTab = (tabName) => {
authMessage.classList.add('hidden');
[loginForm, signupForm, forgotPasswordForm].forEach(form => form.classList.add('hidden'));
[loginTabBtn, signupTabBtn].forEach(btn => {
btn.classList.remove('border-blue-600', 'text-blue-600');
btn.classList.add('border-transparent', 'text-slate-500');
});
if (tabName === 'login') { loginForm.classList.remove('hidden'); loginTabBtn.classList.add('border-blue-600', 'text-blue-600'); }
else if (tabName === 'signup') { signupForm.classList.remove('hidden'); signupTabBtn.classList.add('border-blue-600', 'text-blue-600'); }
else if (tabName === 'forgotPassword') { forgotPasswordForm.classList.remove('hidden'); }
};

const showAuthMessage = (msg, type) => {
authMessage.textContent = msg;
authMessage.className = 'mt-4 p-3 rounded-lg text-sm text-center w-full';
if (type === 'error') authMessage.classList.add('bg-red-100', 'text-red-700');
else if (type === 'success') authMessage.classList.add('bg-green-100', 'text-green-700');
else authMessage.classList.add('bg-blue-100', 'text-blue-700');
authMessage.classList.remove('hidden');
};

loginTabBtn.addEventListener('click', () => showTab('login'));
signupTabBtn.addEventListener('click', () => showTab('signup'));
document.getElementById('switchToLogin').addEventListener('click', (e) => { e.preventDefault(); showTab('login'); });
document.getElementById('forgotPasswordLink').addEventListener('click', (e) => { e.preventDefault(); showTab('forgotPassword'); });
document.getElementById('returnToLogin').addEventListener('click', (e) => { e.preventDefault(); showTab('login'); });

const googleProvider = new GoogleAuthProvider();
const signInWithGoogle = async () => {
try {
showAuthMessage('Redirecting to Google...', 'info');
await signInWithPopup(auth, googleProvider);
} catch (error) { showAuthMessage(`Google sign-in failed: ${error.message}`, 'error'); }
};
document.getElementById('googleLoginBtn').addEventListener('click', signInWithGoogle);
document.getElementById('googleSignupBtn').addEventListener('click', signInWithGoogle);

loginForm.addEventListener('submit', async (e) => {
e.preventDefault();
const email = document.getElementById('loginEmail').value;
const password = document.getElementById('loginPassword').value;
try {
showAuthMessage('Logging in...', 'info');
await signInWithEmailAndPassword(auth, email, password);
} catch (error) { showAuthMessage(`Login failed: ${error.message}`, 'error'); }
});

signupForm.addEventListener('submit', async (e) => {
e.preventDefault();
const name = document.getElementById('signupName').value;
const email = document.getElementById('signupEmail').value.trim().toLowerCase();
const password = document.getElementById('signupPassword').value;
if (password.length < 6) { showAuthMessage('Password must be at least 6 characters.', 'error'); return; }
try {
showAuthMessage('Creating account...', 'info');

const emailQuery = query(collection(db, "signed_up_emails"), where("email", "==", email));
const emailSnapshot = await getDocs(emailQuery);

if (!emailSnapshot.empty) {
showAuthMessage('User is already signed up', 'error');
return;
}

const userCredential = await createUserWithEmailAndPassword(auth, email, password);
await updateProfile(userCredential.user, { displayName: name });

await addDoc(collection(db, "signed_up_emails"), {
email: email,
timestamp: serverTimestamp(),
userId: userCredential.user.uid
});
} catch (error) { showAuthMessage(`Sign up failed: ${error.message}`, 'error'); }
});

forgotPasswordForm.addEventListener('submit', async (e) => {
e.preventDefault();
const email = document.getElementById('forgotEmail').value;
try {
showAuthMessage('Sending reset email...', 'info');
await sendPasswordResetEmail(auth, email);
showAuthMessage('Password reset email sent! Check your inbox.', 'success');
} catch (error) { showAuthMessage(`Failed to send email: ${error.message}`, 'error'); }
});

let currentActiveUserId = null;
const headerContainer = document.querySelector('header .container');
const logoTextContainer = document.querySelector('.logo-text-container-center');

const updateMobileHeaderLayout = (isLoggedIn) => {
if (window.innerWidth <= 767) {
if (isLoggedIn) {
headerContainer.classList.remove('justify-center');
headerContainer.classList.add('justify-between');
logoTextContainer.classList.remove('hidden');
logoTextContainer.classList.add('flex');
} else {
headerContainer.classList.remove('justify-between');
headerContainer.classList.add('justify-center');
logoTextContainer.classList.remove('hidden');
logoTextContainer.classList.add('flex');
}
} else {
headerContainer.classList.remove('justify-between', 'justify-center');
headerContainer.classList.add('flex', 'justify-between');
logoTextContainer.classList.remove('hidden');
logoTextContainer.classList.add('flex');
}
};

onAuthStateChanged(auth, (user) => {
const isRealUser = user && !user.isAnonymous;

if (isRealUser) {
document.getElementById('loginNavBtn').classList.add('hidden');
userMonogram.classList.remove('hidden');
const displayName = user.displayName;
const email = user.email;
let initials = displayName ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : (email ? email.charAt(0).toUpperCase() : '');
userMonogram.textContent = initials;
closeModal(document.getElementById('loginModal'));
currentActiveUserId = user.uid;
console.log("Auth state changed: User logged in, UID:", currentActiveUserId);
} else {
document.getElementById('loginNavBtn').classList.remove('hidden');
userMonogram.classList.add('hidden');
authDropdown.classList.add('hidden');
currentActiveUserId = getOrCreateGuestId();
console.log("Auth state changed: User logged out/guest, ID:", currentActiveUserId);
}
updateMobileHeaderLayout(isRealUser);
});

window.addEventListener('resize', () => {
const isRealUser = auth.currentUser && !auth.currentUser.isAnonymous;
updateMobileHeaderLayout(isRealUser);
});

userMonogram.addEventListener('click', (e) => { e.stopPropagation(); authDropdown.classList.toggle('hidden'); });
document.addEventListener('click', (e) => { if (!authStatusContainer.contains(e.target)) { authDropdown.classList.add('hidden'); } });
logoutBtn.addEventListener('click', () => signOut(auth));

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
const friendlinessRating = document.getElementById('friendliness-rating');
const friendlinessValue = document.getElementById('friendliness-value');
const endChatConfirmModal = document.getElementById('end-chat-confirm-modal');
const endChatYesBtn = document.getElementById('end-chat-yes');
const endChatNoBtn = document.getElementById('end-chat-no');
const orderSelectionContainer = document.getElementById('order-selection-container');
const orderList = document.getElementById('order-list');
const closeOrderSelectionBtn = document.getElementById('close-order-selection-btn');
const sendMessageBtn = document.getElementById('send-message-btn');
const globalTooltip = document.getElementById('globalTooltip');

let currentChatId = localStorage.getItem('chatSessionId');
let unsubscribeFromMessages = null;
let unsubscribeFromChatSession = null;
let isChatMinimized = true;
let unreadCount = 0;
let hasUserTypedFirstMessage = false;
let userTypingTimeout = null;
let initialWelcomeRendered = {};
let isFirstMessageSent = false;

const notificationSound = new Audio('https://cdn.freesound.org/previews/253/253887_3900531-lq.mp3');
notificationSound.volume = 0.5;

// This function relies on local storage now that global vars are removed.
const getOrCreateGuestId = () => {
let id = localStorage.getItem('guestChatId');
if (!id) {
id = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
localStorage.setItem('guestChatId', id);
}
return id;
};

const getOrCreateChatSession = async () => {
const user = auth.currentUser;
const currentGuestId = getOrCreateGuestId();
const chatSessionData = {
createdAt: serverTimestamp(),
ownerUid: user?.uid || null,
guestId: user ? null : currentGuestId,
status: 'active',
agentName: null,
isAgentTyping: false,
agentAskingForOrderId: false
};
const docRef = await addDoc(collection(db, "chats"), chatSessionData);
const chatId = docRef.id;
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
isFirstMessageSent = false;
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
endChatConfirmModal.classList.add('flex');
endChatConfirmModal.classList.remove('hidden');
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

if (!isFirstMessageSent) {
isFirstMessageSent = true;
try {
const cloudFunctionUrl = 'https://us-central1-buyback-a0f05.cloudfunctions.net/api/email-support';
const user = auth.currentUser;
const userEmail = user?.email || 'Guest';
const userName = user?.displayName || userEmail;
const firstMessage = text;

await fetch(cloudFunctionUrl, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
chatId: currentChatId,
userName: userName,
userEmail: userEmail,
firstMessage: firstMessage
})
});
console.log('Support email sent for new chat session.');
} catch (error) {
console.error("Error sending support email:", error);
}
}

const user = auth.currentUser;
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

friendlinessRating.addEventListener('input', (e) => { friendlinessValue.textContent = e.target.value; });
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
friendliness: friendlinessRating.value,
resolved: document.querySelector('input[name="issue-resolved"]:checked')?.value || null,
comments: document.getElementById('survey-comments').value
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

const fetchUserOrders = async () => {
return new Promise((resolve) => {
const unsubscribe = onAuthStateChanged(auth, async (user) => {
unsubscribe();
if (!user) {
console.log("fetchUserOrders: User not logged in, returning requiresLogin: true");
resolve({ requiresLogin: true });
return;
}
const userId = user.uid;
console.log("fetchUserOrders: Current user ID:", userId);
const ordersRef = collection(db, `users/${userId}/orders`);
const q = query(ordersRef, orderBy("timestamp", "desc"));
try {
await createDummyOrder(userId);
const snapshot = await getDocs(q);
console.log("fetchUserOrders: Orders snapshot size:", snapshot.size);
if (snapshot.empty) {
console.log("fetchUserOrders: No orders found for this user in Firestore path:", `users/${userId}/orders`);
}
const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
console.log("fetchUserOrders: Fetched orders:", orders);
resolve(orders);
} catch (error) {
console.error("fetchUserOrders: Error fetching user orders:", error);
resolve({ error: error.message });
}
});
});
};

const createDummyOrder = async (userId) => {
const ordersRef = collection(db, `users/${userId}/orders`);
const existingOrders = await getDocs(ordersRef);
if (existingOrders.empty) {
console.log("Creating initial dummy orders for user:", userId);
let lastOrderNum = parseInt(localStorage.getItem('lastOrderNum') || '0', 10);
const generateSequentialOrderId = () => {
lastOrderNum++;
localStorage.setItem('lastOrderNum', lastOrderNum);
return `SHC-${String(lastOrderNum).padStart(5, '0')}`;
};
await setDoc(doc(db, `users/${userId}/orders`, generateSequentialOrderId()), {
orderId: `SHC-${String(lastOrderNum).padStart(5, '0')}`,
deviceName: 'iPhone 15 Pro Max',
storage: '256GB',
price: 700,
reoffer: null,
imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/refs/heads/main/iphone/assets/i15pm.webp',
timestamp: serverTimestamp()
});
await setDoc(doc(db, `users/${userId}/orders`, generateSequentialOrderId()), {
orderId: `SHC-${String(lastOrderNum).padStart(5, '0')}`,
deviceName: 'Samsung Galaxy S24 Ultra',
storage: '512GB',
price: 600,
reoffer: 550,
imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/refs/heads/main/samsung/assets/s24u.webp',
timestamp: serverTimestamp()
});
await setDoc(doc(db, `users/${userId}/orders`, generateSequentialOrderId()), {
orderId: `SHC-${String(lastOrderNum).padStart(5, '0')}`,
deviceName: 'iPad Pro (M2)',
storage: '128GB',
price: 550,
reoffer: null,
imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/refs/heads/main/assets/ipm2.webp',
timestamp: serverTimestamp()
});
} else {
console.log("Example orders already exist for user:", userId);
}
};

const parseCurrencyValue = (value) => {
const numeric = Number(value);
return Number.isFinite(numeric) ? numeric : null;
};

const getDisplayPrice = (order) => {
if (!order || typeof order !== 'object') {
return 0;
}
const candidates = [
order.reoffer,
order.reOffer?.newPrice,
order.reOffer,
order.price,
order.estimatedQuote,
];

for (const candidate of candidates) {
const numeric = parseCurrencyValue(candidate);
if (numeric !== null) {
return numeric;
}
}

return 0;
};

const renderOrderSelection = (orders) => {
orderList.innerHTML = '';
if (orders.requiresLogin) {
orderList.innerHTML = '<p class="text-center text-slate-500">Please <a href="#" id="orderLoginPromptLink" class="text-blue-600 font-semibold hover:underline">log in</a> to view and select your orders.</p>';
document.getElementById('orderLoginPromptLink').addEventListener('click', (e) => {
e.preventDefault();
openModal('loginModal');
orderSelectionContainer.classList.add('hidden');
});
orderSelectionPrompt.textContent = 'Login to access your orders:';
return;
}

if (orders.length === 0) {
orderList.innerHTML = '<p class="text-center text-slate-500">No recent orders found.</p>';
orderSelectionPrompt.textContent = 'Please select your order:';
return;
}
orderSelectionPrompt.textContent = 'Please select your order:';
orders.forEach(order => {
const orderCard = document.createElement('div');
orderCard.className = 'order-card';
orderCard.dataset.orderId = order.orderId;
const reofferAmount = parseCurrencyValue(order.reoffer ?? order.reOffer?.newPrice);
const displayPriceValue = getDisplayPrice(order);
const formattedPrice = displayPriceValue.toFixed(2);
orderCard.innerHTML = `
<img src="${order.imageUrl || 'https://placehold.co/48x48/e0e7ff/4338ca?text=📱'}" alt="${order.deviceName}" onerror="this.onerror=null;this.src='https://placehold.co/48x48/e0e7ff/4338ca?text=📱';">
<div class="order-card-details">
<strong>ID: ${order.orderId} - ${order.deviceName}</strong>
<span>${order.storage} | $${formattedPrice}</span>
${reofferAmount !== null ? `<span class="reoffer">Reoffer: $${reofferAmount.toFixed(2)}</span>` : ''}
</div>
`;
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
const reofferAmount = parseCurrencyValue(order.reoffer ?? order.reOffer?.newPrice);
const displayPriceValue = getDisplayPrice(order);
const formattedPrice = displayPriceValue.toFixed(2);
const messageText = `Selected Order: ID: ${order.orderId}, Device: ${order.deviceName}, Storage: ${order.storage}, Price: $${formattedPrice}${reofferAmount !== null ? `, Reoffer: $${reofferAmount.toFixed(2)}` : ''}`;
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

button.addEventListener('mouseenter', () => {
clearTimeout(tooltipTimeout);
});
});

// NEW: Intersection Observer for scroll-triggered animations
const observerOptions = {
root: null,
rootMargin: '0px',
threshold: 0.1
};
const observer = new IntersectionObserver((entries, observer) => {
entries.forEach(entry => {
if (entry.isIntersecting) {
entry.target.classList.add('animate-fadeInUp');
observer.unobserve(entry.target);
}
});
}, observerOptions);

document.querySelectorAll('.animate-on-scroll').forEach(el => {
el.style.opacity = '0';
el.style.transform = 'translateY(20px)';
observer.observe(el);
});

// --- PRICING MODAL FUNCTIONALITY ---
const pricingModal = {
brand: '',
device: '',
deviceSlug: '',
storage: '',
carrier: 'unlocked',
conditions: {
power: null,
functionality: null,
quality: null
},
deviceData: null,

init() {
const brandSelect = document.getElementById('modal-brand-select');
const deviceSelect = document.getElementById('modal-device-select');
const storageSelect = document.getElementById('modal-storage-select');
const carrierSelect = document.getElementById('modal-carrier-select');
const conditionBtns = document.querySelectorAll('.condition-btn');
const continueBtn = document.getElementById('modal-continue-btn');

brandSelect.addEventListener('change', (e) => {
this.brand = e.target.value;

// Update brand icon
const brandIcon = document.getElementById('brand-icon');
const selectedOption = e.target.options[e.target.selectedIndex];
const iconUrl = selectedOption.dataset.icon;

if (iconUrl) {
brandIcon.src = iconUrl;
brandIcon.classList.remove('hidden');
} else {
brandIcon.classList.add('hidden');
}

this.loadDevices();
});

deviceSelect.addEventListener('change', (e) => {
this.device = e.target.value;
this.loadStorage();
});

storageSelect.addEventListener('change', (e) => {
this.storage = e.target.value;
this.checkComplete();
});

carrierSelect.addEventListener('change', (e) => {
this.carrier = e.target.value;
this.checkComplete();
});

conditionBtns.forEach(btn => {
btn.addEventListener('click', () => {
const condition = btn.dataset.condition;
const value = btn.dataset.value;

document.querySelectorAll(`[data-condition="${condition}"]`).forEach(b => {
b.classList.remove('border-indigo-500', 'bg-indigo-50', 'ring-2', 'ring-indigo-200');
});

btn.classList.add('border-indigo-500', 'bg-indigo-50', 'ring-2', 'ring-indigo-200');
this.conditions[condition] = value;
this.checkComplete();
});
});

continueBtn.addEventListener('click', () => {
const params = new URLSearchParams({
// NEW: Combine brand and slug into a single 'device' parameter
device: `${this.brand}-${this.device}`,
storage: this.storage,
carrier: this.carrier,
power: this.conditions.power,
functionality: this.conditions.functionality,
quality: this.conditions.quality,
price: document.getElementById('modal-estimated-price').textContent
});
// Use the 'sell/' path consistent with other links in the page body.
window.location.href = `sell/?${params.toString()}`;
});
},

async loadDevices() {
const deviceSelect = document.getElementById('modal-device-select');
const storageSelect = document.getElementById('modal-storage-select');

deviceSelect.innerHTML = '<option value="">Loading devices...</option>';
storageSelect.innerHTML = '<option value="">Select storage...</option>';
deviceSelect.disabled = true;
storageSelect.disabled = true;

if (!this.brand) return;

try {
const devicesCol = collection(db, `devices/${this.brand}/models`);
const devicesSnapshot = await getDocs(devicesCol);

deviceSelect.innerHTML = '<option value="">Choose a device...</option>';
deviceSelect.disabled = false;

devicesSnapshot.forEach((doc) => {
const data = doc.data();
const option = document.createElement('option');
option.value = doc.id;
option.textContent = data.name || doc.id;
option.dataset.deviceData = JSON.stringify(data);
deviceSelect.appendChild(option);
});
} catch (error) {
console.error('Error loading devices:', error);
deviceSelect.innerHTML = '<option value="">Error loading devices</option>';
}

this.device = '';
this.storage = '';
this.deviceData = null;
this.checkComplete();
},

loadStorage() {
const deviceSelect = document.getElementById('modal-device-select');
const storageSelect = document.getElementById('modal-storage-select');
const selectedOption = deviceSelect.options[deviceSelect.selectedIndex];

storageSelect.innerHTML = '<option value="">Select storage...</option>';

if (this.device && selectedOption && selectedOption.dataset.deviceData) {
this.deviceData = JSON.parse(selectedOption.dataset.deviceData);
this.deviceSlug = this.device;

if (this.deviceData.prices) {
storageSelect.disabled = false;
const storageOptions = Object.keys(this.deviceData.prices);
storageOptions.forEach(storage => {
const option = document.createElement('option');
option.value = storage;
option.textContent = storage;
storageSelect.appendChild(option);
});
}
}

this.storage = '';
this.checkComplete();
},

checkComplete() {
if (this.brand && this.device && this.storage &&
this.conditions.power && this.conditions.functionality && this.conditions.quality) {
this.calculatePrice();
}
},

calculatePrice() {
if (!this.deviceData || !this.deviceData.prices) return;

const carrierKey = this.carrier === 'unlocked' ? 'unlocked' : 'locked';
const storageKey = this.storage;

let conditionKey;
if (this.conditions.power === 'no') {
conditionKey = 'noPower';
} else if (this.conditions.functionality === 'not-working') {
conditionKey = 'broken';
} else if (this.conditions.quality === 'flawless') {
conditionKey = 'flawless';
} else if (this.conditions.quality === 'scratched') {
conditionKey = 'good';
} else if (this.conditions.quality === 'damaged') {
conditionKey = 'damaged';
}

const price = this.deviceData.prices?.[storageKey]?.[carrierKey]?.[conditionKey];
if (price) {
document.getElementById('modal-estimated-price').textContent = price;
document.getElementById('modal-price-estimate').classList.remove('hidden');
}
}
};

pricingModal.init();
});
