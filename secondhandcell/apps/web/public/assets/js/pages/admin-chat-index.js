import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, query, where, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDocs, getDoc, writeBatch, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getDatabase, ref, onValue, set, serverTimestamp as dbServerTimestamp, onDisconnect } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging.js";

// IMPORTANT: REPLACE THIS WITH YOUR OWN FIREBASE CONFIG

const app = firebaseApp;
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const messaging = getMessaging(app);

// --- DOM Elements ---
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const chatListAside = dashboardScreen.querySelector('aside');
const mainChatView = document.getElementById('chat-view');
const backToListBtn = document.getElementById('back-to-list-btn');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const noChatSelected = document.getElementById('no-chat-selected');
const activeChatContainer = document.getElementById('active-chat-container');
const activeChatUser = document.getElementById('active-chat-user');
const activeChatId = document.getElementById('active-chat-id');
const activeChatMessages = document.getElementById('active-chat-messages');
const replyForm = document.getElementById('reply-form');
const replyInput = document.getElementById('reply-input');
const endChatBtn = document.getElementById('end-chat-btn');
const userTypingIndicator = document.getElementById('user-typing-indicator');
const userTypingText = document.getElementById('user-typing-text');
const surveyResultsContainer = document.getElementById('survey-results-container');
const suggestedRepliesContainer = document.getElementById('suggested-replies');
const viewOrdersBtn = document.getElementById('view-orders-btn');
const orderModal = document.getElementById('order-modal');
const orderModalContent = document.getElementById('order-modal-content');
const closeOrderModalBtn = document.getElementById('close-order-modal');
const orderDetailsContainer = document.getElementById('order-details-container');
const transferChatBtn = document.getElementById('transfer-chat-btn');
const transferDropdown = document.getElementById('transfer-dropdown');
const transferNotification = document.getElementById('transfer-notification');
const multiSelectActions = document.getElementById('multi-select-actions');
const assignSelectedBtn = document.getElementById('assign-selected-btn');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
const confirmModal = document.getElementById('confirm-modal');
const notificationBell = document.getElementById('notification-bell');
const notificationBadge = document.getElementById('notification-badge');
const notificationDropdown = document.getElementById('notification-dropdown');
const notificationList = document.getElementById('notification-list');
const markAllReadBtn = document.getElementById('mark-all-read-btn');
const inAppNotification = document.getElementById('in-app-notification');
const chatNotificationSound = document.getElementById('chat-notification-sound');

// --- State Variables ---
let currentAdmin = null;
let activeChatIdState = null;
let unsubscribeFromChats = () => {};
let unsubscribeFromActiveChat = () => {};
let unsubscribeFromActiveMessages = () => {};
let unsubscribeFromSurvey = () => {};
let unsubscribeFromTransfers = () => {};
let unsubscribeFromNotifications = () => {};
let adminTypingTimeout = null;
let onlineAdmins = {};
let unreadNotifications = [];
let activeUserId = null; // New state variable to hold the userId for the active chat

const suggestedReplies = [
"Hello! How can I help you today?",
"I can certainly help you with that.",
"Could you please provide your order number?",
"Is there anything else I can assist you with?",
"Thank you for contacting support. Have a great day!"
];

// --- Authentication Logic ---
onAuthStateChanged(auth, user => {
if (user) {
currentAdmin = user;
loginScreen.classList.add('hidden');
dashboardScreen.classList.remove('hidden');
dashboardScreen.classList.add('flex');

managePresence(user);
loadChatQueue();
listenForTransfers(user.uid);
populateSuggestedReplies();
setupNotifications(user);
// FIX: This listener connects the backend notifications to the frontend bell/badge
listenForFirestoreNotifications(user.uid);

const urlParams = new URLSearchParams(window.location.search);
const chatIdFromUrl = urlParams.get('chatId');
if (chatIdFromUrl) {
// Fetch the chat doc to get the user identifier before opening
getDoc(doc(db, "chats", chatIdFromUrl)).then(snap => {
const chatData = snap.data();
const userIdentifier = chatData?.ownerUid || chatData?.guestId || 'unknown_user_id';
openChat(chatIdFromUrl, userIdentifier);
});
history.replaceState({}, document.title, window.location.pathname);
}

} else {
currentAdmin = null;
loginScreen.classList.remove('hidden');
dashboardScreen.classList.add('hidden');
dashboardScreen.classList.remove('flex');
unsubscribeFromChats();
unsubscribeFromTransfers();
unsubscribeFromNotifications();
}
});

loginForm.addEventListener('submit', async (e) => {
e.preventDefault();
const email = document.getElementById('login-email').value;
const password = document.getElementById('login-password').value;
loginError.textContent = '';
try {
await signInWithEmailAndPassword(auth, email, password);
} catch (error) {
loginError.textContent = "Invalid credentials. Please try again.";
}
});

logoutBtn.addEventListener('click', () => {
const userStatusDatabaseRef = ref(rtdb, '/status/' + currentAdmin.uid);
set(userStatusDatabaseRef, { state: 'offline', last_changed: dbServerTimestamp(), name: currentAdmin.displayName });
signOut(auth);
});

// --- Mobile View Logic ---
backToListBtn.addEventListener('click', () => {
chatListAside.classList.remove('hidden');
mainChatView.classList.add('hidden');
activeChatIdState = null;
document.querySelectorAll('[id^="chat-item-"]').forEach(el => el.classList.remove('bg-blue-50'));
});

// --- Presence Management ---
function managePresence(user) {
const userStatusDatabaseRef = ref(rtdb, '/status/' + user.uid);
const isOfflineForDatabase = { state: 'offline', last_changed: dbServerTimestamp(), name: user.displayName };
const isOnlineForDatabase = { state: 'online', last_changed: dbServerTimestamp(), name: user.displayName };

onValue(ref(rtdb, '.info/connected'), (snapshot) => {
if (snapshot.val() === false) return;
onDisconnect(userStatusDatabaseRef).set(isOfflineForDatabase).then(() => {
set(userStatusDatabaseRef, isOnlineForDatabase);
});
});

onValue(ref(rtdb, '/status'), (snapshot) => {
onlineAdmins = snapshot.val() || {};
});
}

// --- Main Chat Logic ---
function getStatusFlag(chatData) {
if (chatData.status === 'ended_by_agent' || chatData.status === 'ended_by_user') {
return `<span class="px-3 py-1 text-xs font-semibold text-slate-600 bg-slate-200 rounded-full">Closed</span>`;
}
if (chatData.assignedAdminName) {
return `<span class="px-3 py-1 text-xs font-semibold text-blue-700 bg-blue-100 rounded-full">${chatData.assignedAdminName}</span>`;
}
return `<span class="px-3 py-1 text-xs font-semibold text-green-700 bg-green-100 rounded-full">Open</span>`;
}

function formatTimestamp(timestamp) {
if (!timestamp) return '';
const date = timestamp.toDate();
const now = new Date();
const isToday = date.toDateString() === now.toDateString();
if (isToday) {
return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
} else {
return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
}

function loadChatQueue() {
const q = query(collection(db, "chats"), orderBy("createdAt", "desc"));
unsubscribeFromChats = onSnapshot(q, (snapshot) => {
const openList = document.getElementById('open-chats-list');
const myList = document.getElementById('my-chats-list');
const closedList = document.getElementById('closed-chats-list');
openList.innerHTML = '';
myList.innerHTML = '';
closedList.innerHTML = '';

snapshot.forEach(doc => {
const chatData = doc.data();
const chatId = doc.id;

const lastMessageText = chatData.userTypingText ? `<em class="text-blue-500">Typing: ${chatData.userTypingText}</em>` : (chatData.lastMessage || 'New chat session started...');
const isClosed = chatData.status === 'ended_by_agent' || chatData.status === 'ended_by_user';
const hasUnread = chatData.lastMessageSeenByAdmin === false && chatData.lastMessageSender !== currentAdmin?.uid;

// Play sound for new message if not already viewing this chat
if (hasUnread && chatId !== activeChatIdState) {
chatNotificationSound.play();
}

const newItem = document.createElement('div');
newItem.id = `chat-item-${chatId}`;
newItem.className = `p-4 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors ${activeChatIdState === chatId ? 'bg-blue-50' : ''} ${hasUnread ? 'font-semibold' : ''}`;

// Determine the correct user identifier for display and passing to openChat
const userIdentifier = chatData.ownerUid || chatData.guestId;

newItem.innerHTML = `
<div class="flex justify-between items-start">
${!isClosed ? `<input type="checkbox" data-chat-id="${chatId}" class="chat-checkbox mt-1 mr-3">` : '<div class="w-7"></div>'}
<div class="flex-1 overflow-hidden">
<div class="flex justify-between items-center">
<p class="font-bold text-slate-700 truncate">${userIdentifier}</p>
<p class="text-xs text-slate-400 flex-shrink-0 ml-2">${formatTimestamp(chatData.lastMessageTimestamp || chatData.createdAt)}</p>
</div>
<p class="text-sm text-slate-500 truncate mt-1">${lastMessageText}</p>
</div>
<div class="flex flex-col items-end ml-2">
${getStatusFlag(chatData)}
</div>
</div>
`;

if (isClosed) {
closedList.appendChild(newItem);
} else if (chatData.assignedAdminUid === currentAdmin.uid) {
myList.appendChild(newItem);
} else if (!chatData.assignedAdminUid) {
openList.appendChild(newItem);
}

newItem.addEventListener('click', (e) => {
if (e.target.type !== 'checkbox') {
openChat(chatId, userIdentifier, isClosed);
}
});
});

document.querySelectorAll('.chat-checkbox').forEach(cb => cb.addEventListener('change', updateMultiSelectActions));
});
}

async function openChat(chatId, userIdentifier, isReadOnly = false) {
if (activeChatIdState === chatId) return;

if (window.innerWidth < 768) {
chatListAside.classList.add('hidden');
mainChatView.classList.remove('hidden');
mainChatView.classList.add('flex');
}

unsubscribeFromActiveChat();
unsubscribeFromActiveMessages();
unsubscribeFromSurvey();

activeChatIdState = chatId;
// IMPORTANT: Set the activeUserId based on the userIdentifier passed from the list/URL
activeUserId = userIdentifier;

noChatSelected.classList.add('hidden');
activeChatContainer.classList.remove('hidden');
activeChatContainer.classList.add('flex');
activeChatMessages.innerHTML = '';
surveyResultsContainer.classList.add('hidden');

document.querySelectorAll('[id^="chat-item-"]').forEach(el => el.classList.remove('bg-blue-50', 'font-semibold'));
document.getElementById(`chat-item-${chatId}`)?.classList.add('bg-blue-50');

const agentName = currentAdmin.displayName || currentAdmin.email.split('@')[0];
const chatRef = doc(db, "chats", chatId);

const chatSnap = await getDoc(chatRef);
if (chatSnap.exists() && !chatSnap.data().assignedAdminUid && !isReadOnly) {
await updateDoc(chatRef, {
assignedAdminUid: currentAdmin.uid,
assignedAdminName: agentName,
agentName: agentName,
status: 'active',
agentHasJoined: true
});
}

unsubscribeFromActiveChat = onSnapshot(chatRef, (docSnap) => {
const data = docSnap.data();
if (!data) return;
activeChatUser.textContent = data.ownerUid || data.guestId;
activeChatId.textContent = `ID: ${chatId}`;
userTypingIndicator.classList.toggle('hidden', !data.userTypingText);
userTypingText.textContent = data.userTypingText;
});

const messagesRef = collection(db, `chats/${chatId}/messages`);
const q = query(messagesRef, orderBy("timestamp"));
unsubscribeFromActiveMessages = onSnapshot(q, (snapshot) => {
activeChatMessages.innerHTML = '';
snapshot.forEach(doc => renderMessage(doc.data()));
activeChatMessages.scrollTop = activeChatMessages.scrollHeight;

// Mark chat as seen when opened
updateDoc(chatRef, { lastMessageSeenByAdmin: true });
});

const surveyRef = doc(db, `chats/${chatId}/survey/feedback`);
unsubscribeFromSurvey = onSnapshot(surveyRef, (docSnap) => {
if (docSnap.exists()) {
const data = docSnap.data();
surveyResultsContainer.innerHTML = `
<h4 class="font-bold text-lg mb-2 text-center">Customer Survey Feedback</h4>
<div class="text-sm space-y-2">
<p><strong>Rating:</strong> ${'⭐'.repeat(data.overallRating)}</p>
<p><strong>Friendliness:</strong> ${data.friendliness}/10</p>
<p><strong>Resolved:</strong> ${data.resolved || 'N/A'}</p>
<p><strong>Comments:</strong> ${data.comments || 'No comments provided.'}</p>
</div>
`;
surveyResultsContainer.classList.remove('hidden');
}
});
}

function renderMessage(msg) {
const isAdminMessage = msg.sender === currentAdmin.uid;
const isSystemMessage = msg.type === 'system';
const isBotMessage = msg.senderType === 'bot';

let bubbleClass = isSystemMessage ? 'chat-bubble-system text-center text-sm italic' : (isBotMessage ? 'chat-bubble-bot' : (isAdminMessage ? 'chat-bubble-admin' : 'chat-bubble-user'));
let alignment = isSystemMessage ? 'self-center' : (isBotMessage ? 'self-start' : (isAdminMessage ? 'self-end' : 'self-start'));

const messageDiv = document.createElement('div');
messageDiv.className = `p-3 rounded-xl max-w-[85%] break-words ${bubbleClass} ${alignment}`;

if (!isSystemMessage) {
const senderName = isBotMessage ? 'Auto-responder' : (isAdminMessage ? 'You' : 'Customer');
const senderColor = isAdminMessage ? 'text-white' : 'text-slate-800';
messageDiv.innerHTML = `<p class="text-xs font-bold mb-1 ${senderColor}">${senderName}</p>`;
}

messageDiv.innerHTML += `<p>${msg.text}</p>`;
activeChatMessages.appendChild(messageDiv);

// Auto-detect order number and display a clickable pill
if (!isSystemMessage && !isAdminMessage) {
const orderRegex = /(\d{2}-\d{3})|(\d{26})/;
const match = msg.text.match(orderRegex);
if (match) {
const identifier = match[0];
showDetectedOrder(identifier);
}
}
}

// Function to display a clickable pill for a detected order number
function showDetectedOrder(identifier) {
let pill = activeChatMessages.querySelector(`.order-pill[data-order-id="${identifier}"]`);
if (pill) return; // Already displayed

pill = document.createElement('button');
pill.className = 'order-pill self-start px-3 py-1 text-xs font-semibold text-purple-700 bg-purple-100 rounded-full hover:bg-purple-200 transition-colors cursor-pointer mt-2';
pill.textContent = `Order: ${identifier} (Click to view)`;
pill.setAttribute('data-order-id', identifier);
pill.onclick = async () => {
pill.textContent = 'Loading...';
const order = await findOrderByIdentifier(identifier);
if (order) {
window.showOrderDetails(order);
} else {
showConfirmModal("Order Not Found", `Order with ID/External ID "${identifier}" was not found.`, () => {});
}
pill.textContent = `Order: ${identifier} (Click to view)`;
};
activeChatMessages.appendChild(pill);
activeChatMessages.scrollTop = activeChatMessages.scrollHeight; // Scroll to show the pill
}

// --- Event Listeners & Helpers ---
replyForm.addEventListener('submit', (e) => { e.preventDefault(); sendReply(); });
async function sendReply(textOverride = null) {
const text = textOverride || replyInput.value.trim();
if (text === '' || !activeChatIdState) return;

const agentName = currentAdmin.displayName || currentAdmin.email.split('@')[0];
const chatRef = doc(db, "chats", activeChatIdState);
const messagesRef = collection(db, `chats/${activeChatIdState}/messages`);

await addDoc(messagesRef, {
text,
sender: currentAdmin.uid,
timestamp: serverTimestamp(),
senderType: "agent" // explicitly set sender type
});

if (!textOverride) replyInput.value = '';

clearTimeout(adminTypingTimeout);
await updateDoc(chatRef, {
isAgentTyping: false,
lastMessage: `${agentName}: ${text}`,
lastMessageTimestamp: serverTimestamp(),
lastMessageSeenByAdmin: true,
lastMessageSender: currentAdmin.uid
});
}
replyInput.addEventListener('keyup', () => {
if (!activeChatIdState) return;
const chatRef = doc(db, "chats", activeChatIdState);
updateDoc(chatRef, { isAgentTyping: true });
clearTimeout(adminTypingTimeout);
adminTypingTimeout = setTimeout(() => {
updateDoc(chatRef, { isAgentTyping: false });
}, 2000);
});
endChatBtn.addEventListener('click', async () => {
if (!activeChatIdState) return;
showConfirmModal(
'End Chat Session?',
'This will close the chat and it will no longer appear in the "Open" queue.',
async () => {
const chatRef = doc(db, "chats", activeChatIdState);
await updateDoc(chatRef, { status: 'ended_by_agent' });
activeChatContainer.classList.add('hidden');
noChatSelected.classList.remove('hidden');
activeChatIdState = null;
}
);
});
function populateSuggestedReplies() {
suggestedRepliesContainer.innerHTML = '';
suggestedReplies.forEach(text => {
const button = document.createElement('button');
button.className = 'px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-100 rounded-full hover:bg-blue-200 transition-colors';
button.textContent = text;
button.onclick = () => {
replyInput.value = text;
replyInput.focus();
};
suggestedRepliesContainer.appendChild(button);
});
}

// --- Order Modal Logic ---
async function findOrderByIdentifier(identifier) {
const baseUrl = 'https://us-central1-buyback-a0f05.cloudfunctions.net/api';
const url = `${baseUrl}/orders/find?identifier=${identifier}`; // Adjusted endpoint for clarity
try {
const response = await fetch(url);
if (!response.ok) return null;
return await response.json();
} catch (error) {
console.error("Failed to fetch order:", error);
return null;
}
}

async function fetchAllUserOrders(userId) {
const baseUrl = 'https://us-central1-buyback-a0f05.cloudfunctions.net/api';
const url = `${baseUrl}/orders/by-user/${userId}`;
try {
const response = await fetch(url);
if (!response.ok) return [];
return await response.json();
} catch (error) {
console.error("Failed to fetch user's orders:", error);
return [];
}
}

// This global function is needed because it's called from inline HTML (onclick)
window.showOrderDetails = function(order) {
orderDetailsContainer.innerHTML = `
<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
<div class="bg-slate-100 p-5 rounded-xl border border-slate-200">
<h4 class="font-bold text-slate-800 text-lg mb-3">Order Info</h4>
<p class="text-sm"><strong>ID:</strong> <span class="font-mono">${order.id}</span></p>
<p class="text-sm mt-1"><strong>Status:</strong> <span class="font-semibold text-blue-600">${order.status}</span></p>
<p class="text-sm mt-1"><strong>Device:</strong> ${order.device} ${order.storage}</p>
<p class="text-sm mt-1"><strong>Quote:</strong> $${order.estimatedQuote?.toFixed(2) || 'N/A'}</h4></p>
</div>
<div class="bg-slate-100 p-5 rounded-xl border border-slate-200">
<h4 class="font-bold text-slate-800 text-lg mb-3">Customer Info</h4>
<p class="text-sm"><strong>Name:</strong> ${order.shippingInfo.fullName}</p>
<p class="text-sm mt-1"><strong>Email:</strong> ${order.shippingInfo.email}</p>
<p class="text-sm mt-1"><strong>Address:</strong> ${order.shippingInfo.streetAddress}, ${order.shippingInfo.city}, ${order.shippingInfo.state} ${order.shippingInfo.zipCode}</p>
</div>
<div class="md:col-span-2 bg-slate-100 p-5 rounded-xl border border-slate-200">
<h4 class="font-bold text-slate-800 text-lg mb-3">Shipping</h4>
<p class="text-sm"><strong>Preference:</strong> ${order.shippingPreference}</p>
<p class="text-sm mt-1"><strong>Tracking #:</strong> ${order.trackingNumber || 'N/A'}</p>
</div>
</div>
<div class="mt-8 text-center">
<button id="send-order-to-user" class="px-6 py-3 font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-md">
<i class="fa-solid fa-share-from-square mr-2"></i>Send Order Details to User
</button>
</div>
`;
orderModal.classList.remove('invisible', 'opacity-0');
orderModalContent.classList.remove('scale-95');

document.getElementById('send-order-to-user').onclick = () => {
const confirmationText = `Hello! Based on your query, here are the details for order #${order.id}:
Device: ${order.device}
Quote: $${order.estimatedQuote?.toFixed(2) || 'N/A'}
Current Status: ${order.status}`;
sendReply(confirmationText);
closeOrderModal();
};
}

viewOrdersBtn.addEventListener('click', async () => {
if (!activeUserId || activeUserId.startsWith('guest_')) {
showConfirmModal("Guest User", "This user is a guest and has no associated Firebase account/orders.", () => {});
return;
}
orderDetailsContainer.innerHTML = '<div class="text-center p-8 text-slate-500"><i class="fa-solid fa-spinner fa-spin text-4xl"></i><p class="mt-4">Loading orders...</p></div>';
orderModal.classList.remove('invisible', 'opacity-0');
orderModalContent.classList.remove('scale-95');

const orders = await fetchAllUserOrders(activeUserId);
if (orders.length === 0) {
orderDetailsContainer.innerHTML = `<div class="text-center p-8 text-slate-500">
<i class="fa-solid fa-box-open text-4xl mb-4"></i>
<p class="text-lg font-semibold">No orders found for this user.</p>
</div>`;
return;
}

let ordersHtml = `<h4 class="text-xl font-bold mb-6">All Orders for User</h4>`;
orders.forEach(order => {
// Safely encode and decode the full order object for passing via inline HTML
const encodedOrder = encodeURIComponent(JSON.stringify(order));
ordersHtml += `
<div class="bg-slate-100 p-5 rounded-xl mb-4 border border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors" onclick="window.showOrderDetails(JSON.parse(decodeURIComponent('${encodedOrder}')))">
<div class="flex justify-between items-center">
<p class="font-bold">Order ID: <span class="font-mono">${order.id}</span></p>
<span class="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">${order.status}</span>
</div>
<p class="text-sm mt-2">Device: ${order.device}</p>
<p class="text-sm">Quote: $${order.estimatedQuote?.toFixed(2) || 'N/A'}</p>
</div>
`;
});
orderDetailsContainer.innerHTML = ordersHtml;
});

function closeOrderModal() {
orderModal.classList.add('invisible', 'opacity-0');
orderModalContent.classList.add('scale-95');
}
closeOrderModalBtn.addEventListener('click', closeOrderModal);

// --- Tab, Multi-Select, and Confirmation Modal Logic ---
document.querySelectorAll('.tab-btn').forEach(btn => {
btn.addEventListener('click', () => {
const tab = btn.dataset.tab;
document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
btn.classList.add('active');

document.getElementById('open-chats-list').classList.toggle('hidden', tab !== 'open');
document.getElementById('my-chats-list').classList.toggle('hidden', tab !== 'my');
document.getElementById('closed-chats-list').classList.toggle('hidden', tab !== 'closed');

multiSelectActions.classList.toggle('hidden', tab !== 'open');
updateMultiSelectActions();
});
});
function getSelectedChatIds() {
const selected = [];
document.querySelectorAll('#open-chats-list .chat-checkbox:checked').forEach(cb => {
selected.push(cb.dataset.chatId);
});
return selected;
}
function updateMultiSelectActions() {
const selectedIds = getSelectedChatIds();
const hasSelection = selectedIds.length > 0;
assignSelectedBtn.disabled = !hasSelection;
deleteSelectedBtn.disabled = !hasSelection;
}
assignSelectedBtn.addEventListener('click', async () => {
const chatIds = getSelectedChatIds();
if (chatIds.length === 0) return;

const agentName = currentAdmin.displayName || currentAdmin.email.split('@')[0];
const batch = writeBatch(db);
chatIds.forEach(chatId => {
const chatRef = doc(db, "chats", chatId);
batch.update(chatRef, {
assignedAdminUid: currentAdmin.uid,
assignedAdminName: agentName,
agentName: agentName,
status: 'active',
agentHasJoined: true
});
});
await batch.commit();
});
deleteSelectedBtn.addEventListener('click', () => {
const chatIds = getSelectedChatIds();
if (chatIds.length === 0) return;

showConfirmModal(
`Delete ${chatIds.length} chats?`,
"This will permanently delete the selected chat conversations.",
async () => {
const batch = writeBatch(db);
for (const chatId of chatIds) {
const messagesRef = collection(db, `chats/${chatId}/messages`);
const messagesSnapshot = await getDocs(messagesRef);
messagesSnapshot.forEach(msgDoc => batch.delete(msgDoc.ref));
batch.delete(doc(db, "chats", chatId));
}
await batch.commit();
console.log(`${chatIds.length} chats deleted.`);
}
);
});
function showConfirmModal(title, text, onConfirm) {
document.getElementById('confirm-modal-title').textContent = title;
document.getElementById('confirm-modal-text').textContent = text;
confirmModal.classList.remove('invisible', 'opacity-0');
confirmModal.querySelector('.modal-content').classList.remove('scale-95');

const confirmBtn = document.getElementById('confirm-modal-confirm');
const cancelBtn = document.getElementById('confirm-modal-cancel');

const confirmHandler = () => {
onConfirm();
hideConfirmModal();
confirmBtn.removeEventListener('click', confirmHandler);
cancelBtn.removeEventListener('click', cancelHandler);
};
const cancelHandler = () => {
hideConfirmModal();
confirmBtn.removeEventListener('click', confirmHandler);
cancelBtn.removeEventListener('click', cancelHandler);
};

confirmBtn.addEventListener('click', confirmHandler);
cancelBtn.addEventListener('click', cancelHandler);
}
function hideConfirmModal() {
confirmModal.classList.add('invisible', 'opacity-0');
confirmModal.querySelector('.modal-content').classList.add('scale-95');
}

// --- Transfer Logic ---
transferChatBtn.addEventListener('click', (e) => {
e.stopPropagation();
populateTransferDropdown();
transferDropdown.classList.toggle('hidden');
});
document.addEventListener('click', () => transferDropdown.classList.add('hidden'));
function populateTransferDropdown() {
transferDropdown.innerHTML = '';
const availableAdmins = Object.entries(onlineAdmins)
.filter(([uid, data]) => data.state === 'online' && uid !== currentAdmin.uid);

if (availableAdmins.length === 0) {
transferDropdown.innerHTML = `<div class="p-4 text-sm text-slate-500">No other admins are online.</div>`;
return;
}

availableAdmins.forEach(([uid, data]) => {
const adminItem = document.createElement('button');
adminItem.className = 'w-full p-4 text-left hover:bg-slate-100 transition-colors flex items-center justify-between';
adminItem.innerHTML = `
<span>${data.name}</span>
<span class="w-2.5 h-2.5 bg-green-500 rounded-full"></span>
`;
adminItem.onclick = () => initiateTransfer(uid, data.name);
transferDropdown.appendChild(adminItem);
});
}
async function initiateTransfer(toAdminUid, toAdminName) {
if (!activeChatIdState) return;
const chatRef = doc(db, "chats", activeChatIdState);
const userDisplayName = activeChatUser.textContent;
await updateDoc(chatRef, {
transferRequest: {
fromUid: currentAdmin.uid,
fromName: currentAdmin.displayName || currentAdmin.email.split('@')[0],
toUid: toAdminUid,
toName: toAdminName,
status: 'pending',
chatId: activeChatIdState,
userDisplayName: userDisplayName
}
});
transferDropdown.classList.add('hidden');
sendReply(`I am transferring you to ${toAdminName}, one moment please.`);
// Optionally, clear the active chat for the transferring admin
activeChatContainer.classList.add('hidden');
noChatSelected.classList.remove('hidden');
activeChatIdState = null;
}

function listenForTransfers(adminUid) {
const q = query(collection(db, "chats"), where("transferRequest.toUid", "==", adminUid), where("transferRequest.status", "==", "pending"));
unsubscribeFromTransfers = onSnapshot(q, (snapshot) => {
if (snapshot.empty) {
transferNotification.classList.add('translate-x-full');
transferNotification.classList.add('hidden');
return;
}
const change = snapshot.docChanges()[0];
if (change.type === 'added' || change.type === 'modified') {
const chatData = change.doc.data();
const chatId = change.doc.id;
document.getElementById('transfer-from-admin').textContent = chatData.transferRequest.fromName;
document.getElementById('transfer-chat-user').textContent = chatData.transferRequest.userDisplayName || chatData.ownerUid || chatData.guestId;
transferNotification.classList.remove('hidden');
transferNotification.classList.remove('translate-x-full');

document.getElementById('accept-transfer-btn').onclick = async () => {
const chatRef = doc(db, "chats", chatId);
await updateDoc(chatRef, {
assignedAdminUid: currentAdmin.uid,
assignedAdminName: currentAdmin.displayName || currentAdmin.email.split('@')[0],
agentName: currentAdmin.displayName || currentAdmin.email.split('@')[0],
'transferRequest.status': 'accepted',
status: 'active' // Ensure chat status is active upon acceptance
});
openChat(chatId, chatData.ownerUid || chatData.guestId);
transferNotification.classList.add('translate-x-full');
};

document.getElementById('decline-transfer-btn').onclick = async () => {
const chatRef = doc(db, "chats", chatId);
await updateDoc(chatRef, { 'transferRequest.status': 'declined' });
transferNotification.classList.add('translate-x-full');
};
}
});
}

// --- NOTIFICATION LOGIC (FIXED/IMPROVED) ---
const VAPID_KEY = 'BDZVvbv6VgxZsBCPYUQyAwUbnSRwYB8F20IzCDh5SpkhTnw4PywqjoWq1dHDsv_xywTBeq7_LL142dheHTWR8uU'; // Use your actual VAPID key

async function setupNotifications(user) {
try {
// Request permission for native push notifications
const permission = await Notification.requestPermission();
if (permission === 'granted') {
// Get the FCM token and save it to Firestore
const fcmToken = await getToken(messaging, { vapidKey: VAPID_KEY });
if (fcmToken) {
const tokenRef = doc(db, `admins/${user.uid}/fcmTokens`, fcmToken);
await setDoc(tokenRef, { timestamp: serverTimestamp() });
}
}
} catch (error) {
console.error('An error occurred while setting up notifications:', error);
}
}

// Listener for foreground FCM messages (to display as in-app toast)
onMessage(messaging, (payload) => {
const notification = inAppNotification;
// Use default title/body if not provided by the payload
document.getElementById('in-app-notification-title').textContent = payload.notification?.title || "New Notification";
document.getElementById('in-app-notification-body').textContent = payload.notification?.body || "Check your dashboard.";

notification.classList.remove('hidden', 'translate-x-full');

// Hide after 5 seconds
setTimeout(() => {
notification.classList.add('translate-x-full');
}, 5000);

if (payload.data && payload.data.relatedDocType === 'chat' && payload.data.relatedDocId) {
notification.onclick = () => {
openChat(payload.data.relatedDocId, payload.data.relatedUserId || 'unknown_user_id');
notification.classList.add('translate-x-full');
};
} else if (payload.data && payload.data.relatedDocType === 'order' && payload.data.relatedDocId) {
notification.onclick = () => {
// For new orders, there's no chat to open, so simply hide the notification.
notification.classList.add('translate-x-full');
};
}
});

// FIX: Main logic to listen to Firestore notifications and update the bell/badge
function listenForFirestoreNotifications(adminUid) {
const notificationsCollectionRef = collection(db, `admins/${adminUid}/notifications`);
const q = query(
notificationsCollectionRef,
where('isRead', '==', false),
orderBy('createdAt', 'desc')
);

// This onSnapshot will keep unreadNotifications state updated in real-time
unsubscribeFromNotifications = onSnapshot(q, (snapshot) => {
unreadNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
updateNotificationUI(); // Update UI whenever unread notifications change
});
}

async function updateNotificationUI() {
notificationList.innerHTML = '';
if (unreadNotifications.length === 0) {
notificationList.innerHTML = `<div class="p-4 text-sm text-slate-500 text-center">No new notifications.</div>`;
notificationBadge.classList.add('hidden');
markAllReadBtn.disabled = true;
} else {
notificationBadge.textContent = unreadNotifications.length;
notificationBadge.classList.remove('hidden');
markAllReadBtn.disabled = false;

unreadNotifications.forEach(notification => {
const notificationItem = document.createElement('div');
// FIX: Ensure unread background is applied for visibility
notificationItem.className = `notification-item text-sm text-slate-700 unread`;

let timeString = '';
if (notification.createdAt?.toDate) {
// Display the notification time clearly
timeString = notification.createdAt.toDate().toLocaleString();
} else if (notification.createdAt) {
timeString = new Date(notification.createdAt).toLocaleString();
}

notificationItem.innerHTML = `
<p>${notification.message}</p>
<p class="text-xs text-slate-500 mt-1"><i class="fa-regular fa-clock mr-1"></i> ${timeString}</p>
`;
notificationItem.addEventListener('click', () => handleNotificationClick(notification));
notificationList.appendChild(notificationItem);
});
}
}

async function handleNotificationClick(notification) {
// Mark as read in Firestore
const notificationDocRef = doc(db, `admins/${currentAdmin.uid}/notifications`, notification.id);
await updateDoc(notificationDocRef, { isRead: true });

// The onSnapshot listener will automatically update unreadNotifications.

if (notification.relatedDocType === 'chat' && notification.relatedDocId) {
// Open the chat using the stored chat ID and user ID
openChat(notification.relatedDocId, notification.relatedUserId || 'unknown_user_id');
notificationDropdown.classList.add('hidden');
} else if (notification.relatedDocType === 'order' && notification.relatedDocId) {
// For orders, navigate to the dashboard or admin page where they manage orders
// Log a message for the admin to check the orders tab.
console.log(`Order Notification Clicked: ${notification.relatedDocId}. Admin should navigate to the order view.`);
notificationDropdown.classList.add('hidden');
}
}

notificationBell.addEventListener('click', (e) => {
e.stopPropagation();
notificationDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
if (!notificationDropdown.contains(e.target) && !notificationBell.contains(e.target)) {
notificationDropdown.classList.add('hidden');
}
});

markAllReadBtn.addEventListener('click', async () => {
const batch = writeBatch(db);
unreadNotifications.forEach(notification => {
const notificationDocRef = doc(db, `admins/${currentAdmin.uid}/notifications`, notification.id);
batch.update(notificationDocRef, { isRead: true });
});
await batch.commit();
// The onSnapshot listener will automatically update unreadNotifications and the UI
});
