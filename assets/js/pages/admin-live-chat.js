import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getMessaging, getToken, onMessage, isSupported as isMessagingSupported } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const root = document.getElementById("chatAdminRoot");
const SUPPORT_REP_ICON = "/assets/img/chat-support-rep.webp";
const VAPID_KEY = "BDZVvbv6VgxZsBCPYUQyAwUbnSRwYB8F20IzCDh5SpkhTnw4PywqjoWq1dHDsv_xywTBeq7_LL142dheHTWR8uU";
let messaging = null;
let activeNotificationUid = null;
let activeNotificationToken = "";
let messageUnsubscribe = null;
let notificationHeartbeatTimer = null;
let deleteInFlight = false;
const PAY_LINK_BRANDS = [
  {
    dbBrandPaths: ["iphone", "iPhone", "apple"],
    urlBrand: "iphone",
    fallbackImage: "https://cdn.secondhandcell.com/images/assets/apple.webp",
  },
  {
    dbBrandPaths: ["Samsung", "samsung"],
    urlBrand: "samsung",
    fallbackImage: "https://cdn.secondhandcell.com/images/assets/samsung.webp",
  },
];
const PAY_LINK_IMAGE_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='280' height='280' viewBox='0 0 280 280'%3E%3Crect width='280' height='280' rx='28' fill='%23e2e8f0'/%3E%3Cpath d='M96 70h88c9 0 16 7 16 16v108c0 9-7 16-16 16H96c-9 0-16-7-16-16V86c0-9 7-16 16-16Zm44 126a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z' fill='%2394a3b8'/%3E%3C/svg%3E";
const PAY_LINK_IMAGE_EXTENSIONS = [".webp", ".png", ".jpg", ".jpeg"];
let payDeviceCatalogPromise = null;
let payDeviceCatalog = [];

const state = {
  user: null,
  adminAllowed: false,
  authLoading: true,
  authError: "",
  chats: [],
  activeTab: "inbox",
  searchTerm: "",
  selectedChatId: null,
  selectedChat: null,
  messages: [],
  unsubscribeChats: null,
  unsubscribeMessages: null,
  claimInFlight: false,
  typingStopTimer: null,
  typingStartTimer: null,
  actionMessage: "",
  replyDraft: "",
  confirmDeleteChatId: null,
  payLinkModalOpen: false,
  payLinkItems: [],
  payDeviceSearch: "",
  payDeviceLoading: false,
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMessageHtml(text) {
  const escaped = esc(text || "");
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" class="underline font-bold">${url}</a>`);
}

function fmtDate(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return "N/A";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value?.toMillis === "function") return value.toMillis();
  const date = value?.toDate?.() || (value instanceof Date ? value : null);
  if (date && !Number.isNaN(date.getTime())) return date.getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function fmtRelative(value) {
  const millis = toMillis(value);
  if (!Number.isFinite(millis)) return "Unknown";
  const diff = Math.max(0, Date.now() - millis);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 45) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(value);
}

function getChatDisplayName(chat) {
  return chat.customerName || chat.customerEmail || chat.visitorId || "Visitor";
}

function getLastCustomerMessageAt(chat, messages = []) {
  const fromMessages = [...messages].reverse().find((message) => message.senderType === "user");
  return fromMessages?.createdAt || chat.lastCustomerMessageAt || chat.updatedAt || chat.createdAt;
}

function getQueueStage(chat, messages = []) {
  const status = String(chat?.status || "").trim().toLowerCase();
  const resolution = String(chat?.resolution || "").trim().toLowerCase();
  const assigned = Boolean(chat?.assignedAdminUid);
  const handoff = Boolean(chat?.handoffRequested);
  const lastCustomerAtMillis = toMillis(getLastCustomerMessageAt(chat, messages));
  const ageMs = Number.isFinite(lastCustomerAtMillis) ? (Date.now() - lastCustomerAtMillis) : Infinity;

  if (status === "closed" && (resolution === "resolved" || resolution === "issue_resolved")) return "resolved";
  if (status === "closed") return "past";
  if (resolution === "follow_up" || resolution === "needs_follow_up") return "due";
  if (!assigned || handoff) return ageMs > 10 * 60 * 1000 ? "due" : "inbox";
  if (ageMs <= 10 * 60 * 1000) return "active";
  return "due";
}

function getQueueLabel(stage) {
  const labels = {
    inbox: "New",
    active: "Active",
    due: "Needs Follow-Up",
    resolved: "Resolved",
    past: "Past",
  };
  return labels[stage] || "Open";
}

function normalizeSearchValue(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hasImageExtension(url = "") {
  return /\.(png|jpe?g|webp)(\?.*)?$/i.test(url);
}

function getQueueBadgeClass(stage, active) {
  const classes = {
    inbox: active ? "bg-amber-300/25 text-white" : "bg-amber-100 text-amber-800",
    active: active ? "bg-emerald-300/25 text-white" : "bg-emerald-100 text-emerald-800",
    due: active ? "bg-rose-300/25 text-white" : "bg-rose-100 text-rose-800",
    resolved: active ? "bg-sky-300/25 text-white" : "bg-sky-100 text-sky-800",
    past: active ? "bg-slate-300/25 text-white" : "bg-slate-200 text-slate-700",
  };
  return classes[stage] || (active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700");
}

function getFilteredChats() {
  const term = state.searchTerm.trim().toLowerCase();
  return state.chats.filter((chat) => {
    const stage = getQueueStage(chat, chat.id === state.selectedChatId ? state.messages : []);
    const matchesTab = state.activeTab === "all" ? true : stage === state.activeTab;
    if (!matchesTab) return false;
    if (!term) return true;
    const haystack = [
      getChatDisplayName(chat),
      chat.customerEmail,
      chat.visitorId,
      chat.sourcePage,
      chat.sourcePath,
      chat.lastMessagePreview,
      chat.currentIntent,
      chat.assignedAdminName,
      chat.id,
    ].join(" ").toLowerCase();
    return haystack.includes(term);
  });
}

function getTabCounts() {
  const counts = { inbox: 0, active: 0, due: 0, resolved: 0, past: 0, all: state.chats.length };
  state.chats.forEach((chat) => {
    const stage = getQueueStage(chat, chat.id === state.selectedChatId ? state.messages : []);
    counts[stage] = (counts[stage] || 0) + 1;
  });
  return counts;
}

function createBlankPayLinkItem() {
  return {
    brand: "iphone",
    model: "",
    modelName: "",
    imageUrl: "",
    fallbackImage: "",
    prices: {},
    availableStorages: [],
    storage: "",
    lock: "unlocked",
    condition: "good",
    qty: 1,
    unitPrice: "",
    unitPriceTouched: false,
  };
}

function normalizeCarrierForPricing(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "unlocked";
  if (normalized === "t-mobile") return "tmobile";
  if (normalized === "at&t") return "att";
  return normalized;
}

function getStorageOptionsFromPrices(prices = {}) {
  return Object.keys(prices || {})
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }));
}

function getPayLinkSuggestedOffer(item = {}) {
  const prices = item.prices || {};
  const storage = String(item.storage || "").trim();
  const carrier = normalizeCarrierForPricing(item.lock || "unlocked");
  const conditionRaw = String(item.condition || "good").trim().toLowerCase();
  const condition = conditionRaw === "damaged" ? "broken" : conditionRaw;
  if (!storage) return "";
  const storageMap = prices[storage] || prices[String(storage).toUpperCase()] || prices[String(storage).toLowerCase()];
  if (!storageMap) return "";
  const carrierMap = storageMap[carrier] || storageMap.unlocked || storageMap.other;
  if (!carrierMap) return "";
  if (condition === "no_power") {
    const brokenOffer = Number(carrierMap.broken ?? carrierMap.damaged ?? 0);
    if (!Number.isFinite(brokenOffer) || brokenOffer <= 0) return "";
    return String(Math.round((brokenOffer * 0.5) * 100) / 100);
  }
  const directOffer = Number(carrierMap[condition]);
  if (!Number.isFinite(directOffer) || directOffer <= 0) return "";
  return String(directOffer);
}

function hydratePayLinkItem(item = {}) {
  const next = {
    ...createBlankPayLinkItem(),
    ...item,
  };
  next.availableStorages = Array.isArray(item.availableStorages) && item.availableStorages.length
    ? item.availableStorages
    : getStorageOptionsFromPrices(next.prices);
  if (!next.storage && next.availableStorages.length) {
    next.storage = next.availableStorages[0];
  }
  if (!next.unitPriceTouched) {
    next.unitPrice = getPayLinkSuggestedOffer(next);
  }
  return next;
}

async function loadPayDeviceCatalog() {
  if (payDeviceCatalog.length) return payDeviceCatalog;
  if (payDeviceCatalogPromise) return payDeviceCatalogPromise;

  state.payDeviceLoading = true;
  payDeviceCatalogPromise = (async () => {
    const allDevices = [];
    const seen = new Set();
    for (const brand of PAY_LINK_BRANDS) {
      for (const dbBrandPath of brand.dbBrandPaths) {
        let snap;
        try {
          snap = await getDocs(collection(db, "devices", dbBrandPath, "models"));
        } catch (error) {
          console.warn(`Pay-link search skipped devices/${dbBrandPath}/models`, error);
          continue;
        }
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const name = String(data.name || docSnap.id || "").trim();
          const slug = String(data.slug || data.modelID || docSnap.id || "").trim();
          if (!name || !slug) return;
          const uniqueKey = `${brand.urlBrand}:${slug.toLowerCase()}`;
          if (seen.has(uniqueKey)) return;
          seen.add(uniqueKey);
          allDevices.push({
            brand: brand.urlBrand,
            slug,
            name,
            imageUrl: data.imageUrl || "",
            fallbackImage: brand.fallbackImage,
            prices: data.prices || {},
            searchText: normalizeSearchValue([
              brand.urlBrand,
              docSnap.id,
              data.slug,
              data.modelID,
              name,
            ].filter(Boolean).join(" ")),
          });
        });
      }
    }
    allDevices.sort((a, b) => a.name.localeCompare(b.name));
    payDeviceCatalog = allDevices;
    state.payDeviceLoading = false;
    return allDevices;
  })().finally(() => {
    payDeviceCatalogPromise = null;
  });

  return payDeviceCatalogPromise;
}

function encodePrefillCart(items = []) {
  return encodeURIComponent(JSON.stringify(items));
}

function buildPrefilledCheckoutLink(items = [], email = "") {
  const cleanedItems = items
    .map((item) => ({
      brand: String(item.brand || "").trim(),
      model: String(item.model || "").trim(),
      modelName: String(item.modelName || "").trim(),
      storage: String(item.storage || "").trim(),
      lock: String(item.lock || "").trim(),
      condition: String(item.condition || "").trim(),
      qty: Math.max(1, Math.floor(Number(item.qty || 1))),
      unitPrice: Number(item.unitPrice || 0),
    }))
    .filter((item) => item.modelName && Number.isFinite(item.unitPrice) && item.unitPrice > 0);
  if (!cleanedItems.length) return "";
  const url = new URL("https://secondhandcell.com/sell/checkout.html");
  url.searchParams.set("prefillCart", encodePrefillCart(cleanedItems));
  if (email) url.searchParams.set("email", email);
  return url.toString();
}

function getFilteredPayDevices() {
  const query = normalizeSearchValue(state.payDeviceSearch);
  if (!query) return payDeviceCatalog.slice(0, 36);
  return payDeviceCatalog.filter((entry) => entry.searchText.includes(query)).slice(0, 36);
}

async function updateSelectedChatMeta(patch = {}, successMessage = "") {
  if (!state.selectedChatId) return;
  await updateDoc(doc(db, "chats", state.selectedChatId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
  if (successMessage) {
    setActionMessage(successMessage);
  }
}

async function sendAdminMessage(text) {
  const messageText = String(text || "").trim();
  if (!messageText || !state.selectedChatId || !state.user) return false;
  const joined = await ensureAdminJoinedSelectedChat();
  if (!joined) return false;
  await addDoc(collection(db, `chats/${state.selectedChatId}/messages`), {
    senderType: "admin",
    senderUid: state.user.uid,
    senderName: state.user.displayName || state.user.email || "Admin",
    text: messageText,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "chats", state.selectedChatId), {
    updatedAt: serverTimestamp(),
    unreadByCustomer: true,
    lastMessagePreview: messageText.slice(0, 140),
    assignedAdminUid: state.user.uid,
    assignedAdminName: state.user.displayName || state.user.email || "Admin",
  });
  return true;
}

async function addAdminInternalNote(text) {
  const noteText = String(text || "").trim();
  if (!noteText || !state.selectedChatId || !state.user) return false;
  await addDoc(collection(db, `chats/${state.selectedChatId}/messages`), {
    senderType: "system",
    systemType: "internal_note",
    internalOnly: true,
    senderUid: state.user.uid,
    senderName: state.user.displayName || state.user.email || "Admin",
    text: noteText,
    createdAt: serverTimestamp(),
  });
  return true;
}

function setActionMessage(message) {
  state.actionMessage = String(message || "");
}

function getAdminBrowserTokenDocId() {
  const storageKey = "shc_admin_browser_push_doc_id_v1";
  try {
    let existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const created = `browser_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem(storageKey, created);
    return created;
  } catch (_) {
    return "browser_fallback";
  }
}

async function removeStoredNotificationToken(uid = activeNotificationUid, token = activeNotificationToken) {
  if (!uid || !token) return;
  try {
    await deleteDoc(doc(db, `admins/${uid}/fcmTokens`, getAdminBrowserTokenDocId()));
  } catch (_) {}
  if (uid === activeNotificationUid && token === activeNotificationToken) {
    activeNotificationToken = "";
  }
}

function stopNotificationHeartbeat() {
  if (notificationHeartbeatTimer) {
    clearInterval(notificationHeartbeatTimer);
    notificationHeartbeatTimer = null;
  }
}

async function touchNotificationToken() {
  if (!activeNotificationUid || !activeNotificationToken) return;
  try {
    await setDoc(doc(db, `admins/${activeNotificationUid}/fcmTokens`, getAdminBrowserTokenDocId()), {
      token: activeNotificationToken,
      page: "admin_chat",
      userAgent: navigator.userAgent,
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      active: true,
    }, { merge: true });
  } catch (_) {}
}

async function detachAdminNotifications() {
  stopNotificationHeartbeat();
  if (typeof messageUnsubscribe === "function") {
    try { messageUnsubscribe(); } catch (_) {}
  }
  messageUnsubscribe = null;
  await removeStoredNotificationToken();
  activeNotificationUid = null;
}

async function setupAdminNotifications(user) {
  if (!user?.uid) return;
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

  let supported = false;
  try {
    supported = await isMessagingSupported();
  } catch (_) {
    supported = false;
  }
  if (!supported) return;

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return;

  try {
    await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
    const registration = await navigator.serviceWorker.ready;
    if (!registration || !registration.pushManager) {
      console.warn("Admin chat notifications skipped: push manager unavailable.");
      return;
    }
    if (!messaging) messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return;

    if (activeNotificationUid && activeNotificationToken && (activeNotificationUid !== user.uid || activeNotificationToken !== token)) {
      await removeStoredNotificationToken(activeNotificationUid, activeNotificationToken);
    }

    activeNotificationUid = user.uid;
    activeNotificationToken = token;

    await setDoc(doc(db, `admins/${user.uid}/fcmTokens`, getAdminBrowserTokenDocId()), {
      token,
      page: "admin_chat",
      userAgent: navigator.userAgent,
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      active: true,
    }, { merge: true });

    if (typeof messageUnsubscribe === "function") {
      try { messageUnsubscribe(); } catch (_) {}
    }
    messageUnsubscribe = onMessage(messaging, (payload) => {
      setActionMessage(`${payload?.notification?.title || payload?.data?.title || "Notification"} — ${payload?.notification?.body || payload?.data?.body || ""}`);
      renderShell();
    });

    stopNotificationHeartbeat();
    notificationHeartbeatTimer = setInterval(() => {
      void touchNotificationToken();
    }, 5 * 60 * 1000);
  } catch (error) {
    console.error("Failed to set up admin chat notifications:", error);
  }
}

async function isUidAdmin(uid) {
  if (!uid) return false;
  const snap = await getDoc(doc(db, "admins", uid));
  return snap.exists();
}

function renderLogin() {
  root.innerHTML = `
    <div class="min-h-screen flex items-center justify-center px-4">
      <div class="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <p class="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">SecondHandCell</p>
        <h1 class="mt-2 text-3xl font-black text-slate-900">Admin Chat</h1>
        <p class="mt-3 text-sm text-slate-600">Sign in to review live support handoffs and customer conversations.</p>
        ${state.authError ? `<div class="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">${esc(state.authError)}</div>` : ""}
        <form id="adminChatLoginForm" class="mt-6 space-y-4">
          <input id="adminChatEmail" type="email" autocomplete="email" placeholder="Admin email" class="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500" required>
          <input id="adminChatPassword" type="password" autocomplete="current-password" placeholder="Password" class="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500" required>
          <button type="submit" class="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white">Sign In</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById("adminChatLoginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("adminChatEmail")?.value || "";
    const password = document.getElementById("adminChatPassword")?.value || "";
    state.authError = "";
    render();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (_) {
      state.authError = "Invalid email or password.";
      render();
    }
  });
}

function renderShell() {
  const activeElement = document.activeElement;
  const hadReplyFocus = activeElement?.id === "adminChatReplyInput";
  const previousSelectionStart = hadReplyFocus && typeof activeElement.selectionStart === "number"
    ? activeElement.selectionStart
    : null;
  const previousSelectionEnd = hadReplyFocus && typeof activeElement.selectionEnd === "number"
    ? activeElement.selectionEnd
    : previousSelectionStart;

  const tabCounts = getTabCounts();
  const filteredChats = getFilteredChats();
  const chatsHtml = filteredChats.map((chat) => {
    const active = chat.id === state.selectedChatId;
    const intent = chat.currentIntent || "general";
    const assignee = chat.assignedAdminName || "Unassigned";
    const stage = getQueueStage(chat, chat.id === state.selectedChatId ? state.messages : []);
    const status = getQueueLabel(stage);
    return `
      <button type="button" data-chat-id="${esc(chat.id)}" class="w-full rounded-2xl border px-4 py-4 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:border-slate-300"}">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-sm font-bold">${esc(getChatDisplayName(chat))}</div>
            <div class="mt-1 text-xs ${active ? "text-slate-300" : "text-slate-500"}">${esc(chat.sourcePage || chat.sourcePath || "")}</div>
          </div>
          <div class="text-[11px] font-semibold ${active ? "text-slate-200" : "text-slate-500"}">${esc(fmtRelative(chat.updatedAt || chat.createdAt))}</div>
        </div>
        <div class="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
          <span class="rounded-full px-2 py-1 ${getQueueBadgeClass(stage, active)}">${esc(status)}</span>
          <span class="rounded-full ${active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"} px-2 py-1">${esc(intent)}</span>
          <span class="rounded-full ${active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"} px-2 py-1">${esc(assignee)}</span>
        </div>
        <div class="mt-3 text-sm ${active ? "text-slate-200" : "text-slate-600"}">${esc(chat.lastMessagePreview || "")}</div>
      </button>
    `;
  }).join("");

  const selected = state.selectedChat;
  const selectedVisible = Boolean(selected && filteredChats.some((chat) => chat.id === selected.id));
  const visibleSelected = selectedVisible ? selected : null;
  const assignedToCurrentAdmin = Boolean(visibleSelected && state.user && visibleSelected.assignedAdminUid === state.user.uid);
  const isClosed = String(visibleSelected?.status || "").trim().toLowerCase() === "closed";
  const selectedStage = visibleSelected ? getQueueStage(visibleSelected, state.messages) : null;
  const typingCustomerAt = visibleSelected?.typingCustomerAt?.toDate?.() || (visibleSelected?.typingCustomerAt ? new Date(visibleSelected.typingCustomerAt) : null);
  const isCustomerTyping = Boolean(
    visibleSelected?.typingCustomer &&
    typingCustomerAt &&
    !Number.isNaN(typingCustomerAt.getTime()) &&
    (Date.now() - typingCustomerAt.getTime()) < 6000
  );
  const payDeviceResults = getFilteredPayDevices();
  const payLinkModalHtml = state.payLinkModalOpen ? `
    <div class="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div class="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p class="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Assist Builder</p>
            <h3 class="mt-1 text-2xl font-black text-slate-900">Send Pay Order Link</h3>
            <p class="mt-1 text-sm text-slate-500">Search the device catalog, pick the model, set storage, lock status, quality, and offer, then send the prefilled checkout link.</p>
          </div>
          <div class="flex gap-2">
            <button id="closePayLinkModalBtn" type="button" class="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700">Close</button>
          </div>
        </div>
        <div class="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(380px,.9fr)]">
          <div class="min-h-0 overflow-y-auto border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
            <div class="sticky top-0 z-10 bg-white pb-4">
              <input id="payDeviceSearchInput" type="text" value="${esc(state.payDeviceSearch)}" placeholder="Search all devices..." class="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500">
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              ${(state.payDeviceLoading ? `<div class="col-span-full rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">Loading devices…</div>` : "")}
              ${(!state.payDeviceLoading ? payDeviceResults.map((entry) => `
                <button type="button" data-pick-device="${esc(entry.brand)}::${esc(entry.slug)}" class="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-400 hover:bg-white">
                  <div class="flex h-40 items-center justify-center overflow-hidden rounded-2xl bg-white">
                    <img src="${esc(hasImageExtension(entry.imageUrl) ? entry.imageUrl : (entry.fallbackImage || PAY_LINK_IMAGE_PLACEHOLDER))}" data-pay-image="${esc(entry.imageUrl || "")}" data-pay-fallback="${esc(entry.fallbackImage || PAY_LINK_IMAGE_PLACEHOLDER)}" alt="${esc(entry.name)}" class="h-full w-full object-contain">
                  </div>
                  <div class="mt-4">
                    <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">${esc(entry.brand)}</div>
                    <div class="mt-1 text-base font-bold text-slate-900">${esc(entry.name)}</div>
                    <div class="mt-3 inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600">Select Device</div>
                  </div>
                </button>
              `).join("") : "")}
              ${(!state.payDeviceLoading && !payDeviceResults.length) ? `<div class="col-span-full rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">No devices found.</div>` : ""}
            </div>
          </div>
          <div class="min-h-0 overflow-y-auto bg-slate-50 p-5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Selected Devices</p>
                <h4 class="mt-1 text-lg font-black text-slate-900">${state.payLinkItems.length ? `${state.payLinkItems.length} device${state.payLinkItems.length === 1 ? "" : "s"} selected` : "No devices selected"}</h4>
              </div>
              <button id="addPayLinkItemBtn" type="button" class="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700">Add Blank Row</button>
            </div>
            <div class="mt-4 space-y-3">
              ${state.payLinkItems.map((item, index) => `
                <div class="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div class="flex items-start gap-4">
                    <div class="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                      <img src="${esc(hasImageExtension(item.imageUrl) ? item.imageUrl : (item.fallbackImage || PAY_LINK_IMAGE_PLACEHOLDER))}" data-pay-image="${esc(item.imageUrl || "")}" data-pay-fallback="${esc(item.fallbackImage || PAY_LINK_IMAGE_PLACEHOLDER)}" alt="${esc(item.modelName || "Selected device")}" class="h-full w-full object-contain">
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">${esc(item.brand || "device")}</div>
                      <div class="mt-1 text-lg font-black text-slate-900">${esc(item.modelName || "Select a device from the left")}</div>
                      <div class="mt-1 text-xs font-semibold text-slate-500">${item.model ? `Slug: ${esc(item.model)}` : "No model selected yet"}</div>
                    </div>
                    <button type="button" data-remove-pay-item="${index}" class="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">Remove</button>
                  </div>
                  <div class="mt-4 grid grid-cols-2 gap-3">
                    <select data-pay-field="storage" data-pay-index="${index}" class="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500">
                      ${(item.availableStorages || []).map((value) => `<option value="${esc(value)}" ${item.storage === value ? "selected" : ""}>${esc(value)}</option>`).join("") || `<option value="">No storage data</option>`}
                    </select>
                    <select data-pay-field="lock" data-pay-index="${index}" class="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500">
                      ${["unlocked","verizon","att","tmobile","locked","other"].map((value) => `<option value="${value}" ${item.lock === value ? "selected" : ""}>${value}</option>`).join("")}
                    </select>
                    <select data-pay-field="condition" data-pay-index="${index}" class="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500">
                      ${["flawless","good","fair","broken","no_power"].map((value) => `<option value="${value}" ${item.condition === value ? "selected" : ""}>${value}</option>`).join("")}
                    </select>
                    <input data-pay-field="qty" data-pay-index="${index}" value="${esc(item.qty)}" inputmode="numeric" placeholder="Qty" class="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500">
                    <input data-pay-field="unitPrice" data-pay-index="${index}" value="${esc(item.unitPrice)}" inputmode="decimal" placeholder="Offer amount" class="col-span-2 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500">
                    <div class="col-span-2 text-xs font-semibold text-slate-500">
                      ${item.unitPriceTouched
                        ? `DB suggestion: ${esc(getPayLinkSuggestedOffer(item) || "Unavailable")} · manually overridden`
                        : `Suggested from DB: ${esc(getPayLinkSuggestedOffer(item) || "Unavailable")}`}
                    </div>
                  </div>
                </div>
              `).join("")}
              ${!state.payLinkItems.length ? `
                <div class="rounded-3xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
                  Search on the left and click a device image card to add it here.
                </div>
              ` : ""}
            </div>
            <div class="mt-5 flex flex-wrap gap-2">
              <button id="sendPayLinkBtn" type="button" class="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ` : "";
  const messagesHtml = state.messages.map((message) => {
    const senderType = message.senderType || "system";
    if (senderType === "system") {
      if (message.internalOnly || message.systemType === "internal_note") {
        return `
          <div class="mr-auto max-w-[85%] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
            <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Admin Only</div>
            <div class="mt-1 whitespace-pre-wrap font-semibold">${formatMessageHtml(message.text || "")}</div>
            <div class="mt-2 text-[11px] opacity-70">${esc(fmtDate(message.createdAt))}</div>
          </div>
        `;
      }
      return `
        <div class="mx-auto flex max-w-[85%] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm">
          ${(message.systemType === "admin_joined" || message.systemType === "admin_closed")
            ? `<img src="${esc(SUPPORT_REP_ICON)}" alt="Support representative" class="h-8 w-8 rounded-full object-cover">`
            : ``}
          <span>${formatMessageHtml(message.text || "")}</span>
        </div>
      `;
    }
    const bubbleClass =
      senderType === "admin" ? "ml-auto bg-slate-900 text-white" :
      senderType === "user" ? "mr-auto bg-white border border-slate-200 text-slate-900" :
      senderType === "bot" ? "mr-auto bg-blue-50 border border-blue-200 text-blue-900" :
      "mr-auto bg-amber-50 border border-amber-200 text-amber-900";
    return `
      <div class="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 ${bubbleClass}">
        <div class="font-semibold text-[11px] uppercase tracking-[0.18em] opacity-70">${esc(senderType)}</div>
        <div class="mt-1 whitespace-pre-wrap">${formatMessageHtml(message.text || "")}</div>
        <div class="mt-2 text-[11px] opacity-70">${esc(fmtDate(message.createdAt))}</div>
      </div>
    `;
  }).join("");

  root.innerHTML = `
    <div class="min-h-screen bg-slate-100">
      <header class="border-b border-slate-200 bg-white px-6 py-4">
        <div class="mx-auto flex max-w-[1400px] items-center justify-between gap-4">
          <div>
            <p class="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">SecondHandCell</p>
            <h1 class="mt-1 text-2xl font-black text-slate-900">Support Console</h1>
            <p class="mt-1 text-sm text-slate-500">Triage new handoffs, keep active chats moving, and close threads cleanly.</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">${esc(state.user?.email || "")}</span>
            <button id="adminChatLogoutBtn" type="button" class="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700">Sign Out</button>
          </div>
        </div>
      </header>
      <div class="mx-auto max-w-[1400px] px-4 py-6">
        <section class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          ${[
            ["inbox", "Inbox"],
            ["active", "Active"],
            ["due", "Due"],
            ["resolved", "Resolved"],
            ["past", "Past"],
            ["all", "All Chats"],
          ].map(([id, label]) => `
            <button type="button" data-tab-id="${esc(id)}" class="rounded-3xl border px-4 py-4 text-left transition ${state.activeTab === id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}">
              <div class="text-xs font-bold uppercase tracking-[0.18em] ${state.activeTab === id ? "text-slate-300" : "text-slate-400"}">${esc(label)}</div>
              <div class="mt-2 text-3xl font-black">${esc(tabCounts[id] || 0)}</div>
            </button>
          `).join("")}
        </section>
        <div class="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <aside class="space-y-4">
          <div class="rounded-3xl border border-slate-200 bg-white p-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Queue</p>
                <h2 class="mt-1 text-xl font-black text-slate-900">${esc(({
                  inbox: "New Handoffs",
                  active: "Active Conversations",
                  due: "Needs Follow-Up",
                  resolved: "Resolved Threads",
                  past: "Past Closed Threads",
                  all: "All Conversations",
                })[state.activeTab] || "Queue")}</h2>
              </div>
              <span class="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">${esc(filteredChats.length)} shown</span>
            </div>
            <div class="mt-4">
              <input id="chatSearchInput" type="text" value="${esc(state.searchTerm)}" placeholder="Search by customer, email, order, path..." class="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500">
            </div>
          </div>
          <div class="space-y-3">
          ${chatsHtml || `<div class="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">No chats match this queue right now.</div>`}
          </div>
        </aside>
        <main class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          ${visibleSelected ? `
            <div class="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div class="flex flex-col gap-4">
                <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Selected Conversation</p>
                      <span class="rounded-full px-3 py-1 text-xs font-bold ${getQueueBadgeClass(selectedStage, false)}">${esc(getQueueLabel(selectedStage))}</span>
                      ${visibleSelected.currentIntent ? `<span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">${esc(visibleSelected.currentIntent)}</span>` : ``}
                    </div>
                    <h2 class="mt-2 break-words text-2xl font-black leading-tight text-slate-900">${esc(getChatDisplayName(visibleSelected))}</h2>
                    <p class="mt-2 break-all text-sm text-slate-500">${esc(visibleSelected.sourcePath || "")}</p>
                  </div>
                  <div class="flex flex-wrap gap-2 xl:max-w-[520px] xl:justify-end">
                    <button id="claimChatBtn" type="button" class="rounded-2xl ${assignedToCurrentAdmin ? "bg-emerald-600" : "bg-slate-900"} px-4 py-2 text-sm font-bold text-white ${state.claimInFlight ? "opacity-60 cursor-not-allowed" : ""}" ${state.claimInFlight ? "disabled" : ""}>${assignedToCurrentAdmin ? "Chat Claimed" : (state.claimInFlight ? "Claiming…" : "Claim Chat")}</button>
                    <button id="markFollowUpBtn" type="button" class="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800">Mark Follow-Up</button>
                    <button id="markResolvedBtn" type="button" class="rounded-2xl border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-bold text-sky-800">Issue Resolved</button>
                    <button id="reopenChatBtn" type="button" class="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 ${!isClosed ? "hidden" : ""}">Reopen</button>
                    <button id="closeChatBtn" type="button" class="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 ${isClosed ? "opacity-60 cursor-not-allowed" : ""}" ${isClosed ? "disabled" : ""}>${isClosed ? "Chat Closed" : "Close Chat"}</button>
                    <button id="deleteChatBtn" type="button" class="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 ${deleteInFlight ? "opacity-60 cursor-not-allowed" : ""}" ${deleteInFlight ? "disabled" : ""}>${state.confirmDeleteChatId === state.selectedChatId ? "Confirm Delete" : (deleteInFlight ? "Deleting…" : "Delete Chat")}</button>
                  </div>
                </div>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Assigned</div>
                    <div class="mt-1 text-sm font-semibold text-slate-800">${esc(visibleSelected.assignedAdminName || "Unassigned")}</div>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Opened</div>
                    <div class="mt-1 text-sm font-semibold text-slate-800">${esc(fmtDate(visibleSelected.createdAt))}</div>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Last update</div>
                    <div class="mt-1 text-sm font-semibold text-slate-800">${esc(fmtRelative(visibleSelected.updatedAt || visibleSelected.createdAt))}</div>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Source</div>
                    <div class="mt-1 text-sm font-semibold text-slate-800">${esc(visibleSelected.sourcePage || "unknown")}</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Assist Actions</p>
                  <h3 class="mt-1 text-lg font-black text-slate-900">Suggested replies and shortcuts</h3>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button id="assistOrderLookupBtn" type="button" class="rounded-2xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800">Ask For Order Lookup</button>
                  <button id="assistShippingReplyBtn" type="button" class="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700">Shipping Help Reply</button>
                  <button id="assistPaymentReplyBtn" type="button" class="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700">Payment Timing Reply</button>
                  <button id="assistPayLinkBtn" type="button" class="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">Send Pay Order Link</button>
                </div>
              </div>
            </div>
            ${state.actionMessage ? `<div class="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">${esc(state.actionMessage)}</div>` : ``}
            <div id="adminChatMessages" class="mt-4 flex min-h-[420px] flex-col gap-3 overflow-auto rounded-2xl border border-slate-200 bg-slate-100 p-4">${messagesHtml}</div>
            ${isCustomerTyping ? `
              <div class="mt-3 inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm">
                <span>Customer is typing</span>
                <span class="inline-flex gap-1">
                  <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]"></span>
                  <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]"></span>
                  <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"></span>
                </span>
              </div>
            ` : ``}
            ${isClosed ? `
              <div class="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
                This chat is closed. Customer replies are disabled.
              </div>
            ` : !assignedToCurrentAdmin ? `
              <div class="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center">
                <p class="text-sm font-semibold text-slate-500">Claim this chat before replying.</p>
                <button id="claimChatComposerBtn" type="button" class="mt-4 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white ${state.claimInFlight ? "opacity-60 cursor-not-allowed" : ""}" ${state.claimInFlight ? "disabled" : ""}>
                  ${state.claimInFlight ? "Claiming…" : "Claim Chat"}
                </button>
              </div>
            ` : `
              <form id="adminChatReplyForm" class="mt-4 flex gap-3">
                <input id="adminChatReplyInput" type="text" value="${esc(state.replyDraft || "")}" placeholder="Type your reply..." class="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500">
                <button type="submit" class="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">Send</button>
              </form>
            `}
          ` : `
            <div class="flex min-h-[560px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-center text-slate-500">
              <div>
                <p class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">No Chat Selected</p>
                <h2 class="mt-2 text-2xl font-black text-slate-700">${filteredChats.length ? "Choose a conversation from the queue" : "This queue is empty"}</h2>
              </div>
            </div>
          `}
        </main>
      </div>
      </div>
    </div>
    ${payLinkModalHtml}
  `;

  document.querySelectorAll("[data-tab-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.getAttribute("data-tab-id") || "inbox";
      const visibleChats = getFilteredChats();
      if (!visibleChats.some((chat) => chat.id === state.selectedChatId)) {
        state.selectedChatId = visibleChats[0]?.id || null;
        if (state.selectedChatId) {
          attachMessagesListener();
        } else if (state.unsubscribeMessages) {
          state.unsubscribeMessages();
          state.unsubscribeMessages = null;
          state.messages = [];
          state.selectedChat = null;
        }
      }
      render();
    });
  });

  document.getElementById("chatSearchInput")?.addEventListener("input", (event) => {
    state.searchTerm = event.target.value || "";
    const visibleChats = getFilteredChats();
    if (!visibleChats.some((chat) => chat.id === state.selectedChatId)) {
      state.selectedChatId = visibleChats[0]?.id || null;
      if (state.selectedChatId) {
        attachMessagesListener();
      } else if (state.unsubscribeMessages) {
        state.unsubscribeMessages();
        state.unsubscribeMessages = null;
        state.messages = [];
        state.selectedChat = null;
      }
    }
    renderShell();
  });

  document.querySelectorAll("[data-chat-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedChatId = button.getAttribute("data-chat-id");
      state.confirmDeleteChatId = null;
      attachMessagesListener();
      render();
    });
  });

  document.getElementById("adminChatLogoutBtn")?.addEventListener("click", () => {
    signOut(auth);
  });

  document.getElementById("assistOrderLookupBtn")?.addEventListener("click", async () => {
    if (!state.selectedChatId || !state.user) return;
    const joined = await ensureAdminJoinedSelectedChat();
    if (!joined) return;
    await updateDoc(doc(db, "chats", state.selectedChatId), {
      requestedFlow: {
        type: "track_order",
        requestKey: `track_${Date.now()}`,
        requestedByName: state.user.displayName || state.user.email || "Admin",
      },
      updatedAt: serverTimestamp(),
    });
    const sent = await sendAdminMessage("Please use the form below to enter your order number and the email used on the order so I can look it up.");
    if (!sent) {
      setActionMessage("Order lookup form failed to send.");
      renderShell();
      return;
    }
    await addAdminInternalNote("Sent customer the order lookup form request.");
    setActionMessage("Order lookup form sent.");
    renderShell();
  });

  document.getElementById("assistShippingReplyBtn")?.addEventListener("click", async () => {
    const sent = await sendAdminMessage("If this is about shipping, label delivery, or package movement, send your order number and the email used on the order and I’ll check it for you.");
    if (!sent) {
      setActionMessage("Shipping help reply failed to send.");
      renderShell();
      return;
    }
    await addAdminInternalNote("Sent shipping help canned reply.");
    setActionMessage("Shipping help reply sent.");
    renderShell();
  });

  document.getElementById("assistPaymentReplyBtn")?.addEventListener("click", async () => {
    const sent = await sendAdminMessage("Payout is sent after the device arrives, passes inspection, and any issues are cleared. If you want me to review a specific order, send your order number and the email used on the order.");
    if (!sent) {
      setActionMessage("Payment timing reply failed to send.");
      renderShell();
      return;
    }
    await addAdminInternalNote("Sent payout timing canned reply.");
    setActionMessage("Payment timing reply sent.");
    renderShell();
  });

  document.getElementById("assistPayLinkBtn")?.addEventListener("click", () => {
    state.payLinkModalOpen = true;
    state.payDeviceSearch = "";
    void loadPayDeviceCatalog().then(() => renderShell());
    renderShell();
  });

  document.getElementById("closePayLinkModalBtn")?.addEventListener("click", () => {
    state.payLinkModalOpen = false;
    renderShell();
  });

  document.getElementById("addPayLinkItemBtn")?.addEventListener("click", () => {
    state.payLinkItems = [...state.payLinkItems, hydratePayLinkItem(createBlankPayLinkItem())];
    renderShell();
  });

  document.getElementById("payDeviceSearchInput")?.addEventListener("input", (event) => {
    state.payDeviceSearch = event.target.value || "";
    renderShell();
  });

  document.querySelectorAll("[data-pick-device]").forEach((button) => {
    button.addEventListener("click", () => {
      const [brand, slug] = String(button.getAttribute("data-pick-device") || "").split("::");
      const picked = payDeviceCatalog.find((entry) => entry.brand === brand && entry.slug === slug);
      if (!picked) return;
      state.payLinkItems = [
        ...state.payLinkItems,
        hydratePayLinkItem({
          ...createBlankPayLinkItem(),
          brand: picked.brand,
          model: picked.slug,
          modelName: picked.name,
          imageUrl: picked.imageUrl,
          fallbackImage: picked.fallbackImage,
          prices: picked.prices || {},
        }),
      ];
      renderShell();
    });
  });

  document.querySelectorAll("[data-pay-field]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const index = Number(event.target.getAttribute("data-pay-index"));
      const field = event.target.getAttribute("data-pay-field");
      if (!Number.isInteger(index) || !field || !state.payLinkItems[index]) return;
      const currentItem = state.payLinkItems[index];
      const nextValue = event.target.value;
      const nextItem = {
        ...currentItem,
        [field]: nextValue,
      };
      if (field === "unitPrice") {
        nextItem.unitPriceTouched = Boolean(String(nextValue).trim());
      }
      if (field === "storage" || field === "lock" || field === "condition") {
        if (!currentItem.unitPriceTouched) {
          nextItem.unitPriceTouched = false;
          nextItem.unitPrice = "";
        }
      }
      state.payLinkItems[index] = hydratePayLinkItem(nextItem);
      if (field === "unitPrice" && !String(nextValue).trim()) {
        state.payLinkItems[index].unitPriceTouched = false;
        state.payLinkItems[index] = hydratePayLinkItem(state.payLinkItems[index]);
      }
      renderShell();
    });
  });

  document.querySelectorAll("[data-remove-pay-item]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.getAttribute("data-remove-pay-item"));
      if (!Number.isInteger(index)) return;
      state.payLinkItems = state.payLinkItems.filter((_, itemIndex) => itemIndex !== index);
      if (!state.payLinkItems.length) state.payLinkItems = [hydratePayLinkItem(createBlankPayLinkItem())];
      renderShell();
    });
  });

  document.getElementById("sendPayLinkBtn")?.addEventListener("click", async () => {
    const link = buildPrefilledCheckoutLink(state.payLinkItems, visibleSelected?.customerEmail || "");
    if (!link) {
      setActionMessage("Add at least one device model and offer amount before sending the checkout link.");
      renderShell();
      return;
    }
    const sent = await sendAdminMessage(`I created your checkout link: ${link}`);
    if (!sent) {
      setActionMessage("Checkout link failed to send.");
      renderShell();
      return;
    }
    await addAdminInternalNote("Sent prefilled pay order checkout link.");
    state.payLinkModalOpen = false;
    setActionMessage("Checkout link sent.");
    renderShell();
  });

  async function ensureAdminJoinedSelectedChat() {
    if (!state.selectedChatId || !state.user) return false;
    const adminName = state.user.displayName || state.user.email || "Admin";
    const alreadyClaimedBySelf = Boolean(state.selectedChat?.assignedAdminUid === state.user.uid);
    const joinAlreadyExists = state.messages.some((message) => (
      message?.systemType === "admin_joined" &&
      String(message?.senderName || "").trim() === adminName
    ));
    if (alreadyClaimedBySelf && (joinAlreadyExists || state.selectedChat?.humanJoinedAt)) {
      return true;
    }

    const previousSelectedChat = state.selectedChat ? { ...state.selectedChat } : null;
    state.chats = state.chats.map((chat) => (
      chat.id === state.selectedChatId
        ? {
            ...chat,
            assignedAdminUid: state.user.uid,
            assignedAdminName: adminName,
            handoffRequested: false,
            humanJoinedAt: new Date().toISOString(),
            lastMessagePreview: `${adminName} joined the chat.`,
          }
        : chat
    ));
    state.selectedChat = state.chats.find((chat) => chat.id === state.selectedChatId) || previousSelectedChat;
    renderShell();

    try {
      await updateDoc(doc(db, "chats", state.selectedChatId), {
        assignedAdminUid: state.user.uid,
        assignedAdminName: adminName,
        handoffRequested: false,
        humanJoinedAt: serverTimestamp(),
        unreadByCustomer: true,
        updatedAt: serverTimestamp(),
        lastMessagePreview: `${adminName} joined the chat.`,
      });
      if (!joinAlreadyExists) {
        await addDoc(collection(db, `chats/${state.selectedChatId}/messages`), {
          senderType: "system",
          systemType: "admin_joined",
          senderName: adminName,
          text: `${adminName} joined the chat.`,
          createdAt: serverTimestamp(),
        });
      }
      return true;
    } catch (error) {
      console.error("Failed to join chat:", error);
      state.selectedChat = previousSelectedChat;
      state.chats = state.chats.map((chat) => (
        previousSelectedChat && chat.id === previousSelectedChat.id ? previousSelectedChat : chat
      ));
      setActionMessage(`Join chat failed: ${error?.message || "Unknown error"}`);
      renderShell();
      return false;
    }
  }

  async function claimSelectedChat() {
    if (!state.selectedChatId || !state.user || state.claimInFlight) return;
    const adminName = state.user.displayName || state.user.email || "Admin";
    state.claimInFlight = true;
    state.activeTab = "active";
    setActionMessage("");
    renderShell();
    try {
      const joined = await ensureAdminJoinedSelectedChat();
      if (joined) {
        setActionMessage(`You claimed this chat as ${adminName}.`);
      }
    } catch (error) {
      console.error("Failed to claim chat:", error);
      setActionMessage(`Claim chat failed: ${error?.message || "Unknown error"}`);
    } finally {
      state.claimInFlight = false;
      renderShell();
    }
  }

  document.getElementById("claimChatBtn")?.addEventListener("click", async () => {
    await claimSelectedChat();
  });

  document.getElementById("claimChatComposerBtn")?.addEventListener("click", async () => {
    await claimSelectedChat();
  });

  document.getElementById("closeChatBtn")?.addEventListener("click", async () => {
    if (!state.selectedChatId) return;
    await updateDoc(doc(db, "chats", state.selectedChatId), {
      status: "closed",
      resolution: "closed_by_admin",
      closedAt: serverTimestamp(),
      handoffRequested: false,
      typingAdmin: false,
      typingCustomer: false,
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, `chats/${state.selectedChatId}/messages`), {
      senderType: "system",
      systemType: "admin_closed",
      text: "Chat closed by admin.",
      createdAt: serverTimestamp(),
    });
  });

  document.getElementById("markFollowUpBtn")?.addEventListener("click", async () => {
    if (!state.selectedChatId) return;
    await updateSelectedChatMeta({
      status: "open",
      resolution: "follow_up",
      handoffRequested: false,
      assignedAdminUid: state.user?.uid || null,
      assignedAdminName: state.user?.displayName || state.user?.email || "Admin",
    }, "Chat marked for follow-up.");
  });

  document.getElementById("markResolvedBtn")?.addEventListener("click", async () => {
    if (!state.selectedChatId) return;
    await updateDoc(doc(db, "chats", state.selectedChatId), {
      status: "closed",
      resolution: "issue_resolved",
      resolvedAt: serverTimestamp(),
      handoffRequested: false,
      typingAdmin: false,
      typingCustomer: false,
      assignedAdminUid: state.user?.uid || null,
      assignedAdminName: state.user?.displayName || state.user?.email || "Admin",
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, `chats/${state.selectedChatId}/messages`), {
      senderType: "system",
      systemType: "admin_closed",
      text: "Issue resolved. Chat closed by support.",
      createdAt: serverTimestamp(),
    });
    setActionMessage("Chat marked resolved.");
  });

  document.getElementById("reopenChatBtn")?.addEventListener("click", async () => {
    if (!state.selectedChatId) return;
    await updateSelectedChatMeta({
      status: "open",
      resolution: "reopened",
      handoffRequested: true,
      typingAdmin: false,
      typingCustomer: false,
    }, "Chat reopened.");
  });

  document.getElementById("deleteChatBtn")?.addEventListener("click", async () => {
    if (!state.selectedChatId || deleteInFlight) return;
    if (state.confirmDeleteChatId !== state.selectedChatId) {
      state.confirmDeleteChatId = state.selectedChatId;
      setActionMessage("Click delete again to permanently remove this chat.");
      renderShell();
      return;
    }
    deleteInFlight = true;
    state.confirmDeleteChatId = null;
    setActionMessage("");
    renderShell();
    const chatId = state.selectedChatId;
    try {
      const messagesSnapshot = await getDocs(collection(db, `chats/${chatId}/messages`));
      for (const messageDoc of messagesSnapshot.docs) {
        await deleteDoc(messageDoc.ref);
      }
      await deleteDoc(doc(db, "chats", chatId));
      if (state.unsubscribeMessages) {
        state.unsubscribeMessages();
        state.unsubscribeMessages = null;
      }
      state.messages = [];
      state.selectedChatId = state.chats.find((chat) => chat.id !== chatId)?.id || null;
      state.selectedChat = state.chats.find((chat) => chat.id === state.selectedChatId) || null;
      if (state.selectedChatId) {
        attachMessagesListener();
      }
      setActionMessage("Chat deleted.");
    } catch (error) {
      console.error("Failed to delete chat:", error);
      setActionMessage(`Delete chat failed: ${error?.message || "Unknown error"}`);
    } finally {
      deleteInFlight = false;
      renderShell();
    }
  });

  document.getElementById("adminChatReplyForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (String(state.selectedChat?.status || "").trim().toLowerCase() === "closed") return;
    const input = document.getElementById("adminChatReplyInput");
    const text = String(state.replyDraft || input?.value || "").trim();
    if (!text || !state.selectedChatId || !state.user) return;
    const joined = await ensureAdminJoinedSelectedChat();
    if (!joined) return;
    state.replyDraft = "";
    if (input) input.value = "";
    clearTimeout(state.typingStartTimer);
    clearTimeout(state.typingStopTimer);
    await updateDoc(doc(db, "chats", state.selectedChatId), {
      typingAdmin: false,
      typingAdminAt: serverTimestamp(),
      typingAdminName: state.user.displayName || state.user.email || "Admin",
    });
    await addDoc(collection(db, `chats/${state.selectedChatId}/messages`), {
      senderType: "admin",
      senderUid: state.user.uid,
      senderName: state.user.displayName || state.user.email || "Admin",
      text,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "chats", state.selectedChatId), {
      updatedAt: serverTimestamp(),
      unreadByCustomer: true,
      lastMessagePreview: text.slice(0, 140),
      assignedAdminUid: state.user.uid,
      assignedAdminName: state.user.displayName || state.user.email || "Admin",
    });
  });

  document.getElementById("adminChatReplyInput")?.addEventListener("input", () => {
    if (String(state.selectedChat?.status || "").trim().toLowerCase() === "closed") return;
    if (!state.selectedChatId || !state.user) return;
    const input = document.getElementById("adminChatReplyInput");
    state.replyDraft = String(input?.value || "");
    const hasTextNow = Boolean(state.replyDraft.trim());
    if (!hasTextNow) {
      clearTimeout(state.typingStartTimer);
      clearTimeout(state.typingStopTimer);
      void updateDoc(doc(db, "chats", state.selectedChatId), {
        typingAdmin: false,
        typingAdminAt: serverTimestamp(),
        typingAdminName: state.user.displayName || state.user.email || "Admin",
      });
      return;
    }
    clearTimeout(state.typingStartTimer);
    state.typingStartTimer = window.setTimeout(() => {
      if (!state.selectedChatId || !state.user) return;
      void (async () => {
        const hasText = Boolean(String(state.replyDraft || "").trim());
        if (!hasText) {
          await updateDoc(doc(db, "chats", state.selectedChatId), {
            typingAdmin: false,
            typingAdminAt: serverTimestamp(),
            typingAdminName: state.user.displayName || state.user.email || "Admin",
          });
          return;
        }
        const joined = await ensureAdminJoinedSelectedChat();
        if (!joined) return;
        await updateDoc(doc(db, "chats", state.selectedChatId), {
          typingAdmin: true,
          typingAdminAt: serverTimestamp(),
          typingAdminName: state.user.displayName || state.user.email || "Admin",
        });
      })();
    }, 150);
    clearTimeout(state.typingStopTimer);
    state.typingStopTimer = window.setTimeout(() => {
      if (!state.selectedChatId || !state.user) return;
      void updateDoc(doc(db, "chats", state.selectedChatId), {
        typingAdmin: false,
        typingAdminAt: serverTimestamp(),
        typingAdminName: state.user.displayName || state.user.email || "Admin",
      });
    }, 1800);
  });

  if (hadReplyFocus) {
    const replyInput = document.getElementById("adminChatReplyInput");
    if (replyInput) {
      replyInput.focus({ preventScroll: true });
      if (typeof previousSelectionStart === "number" && typeof replyInput.setSelectionRange === "function") {
        const nextLength = replyInput.value.length;
        const start = Math.min(previousSelectionStart, nextLength);
        const end = Math.min(typeof previousSelectionEnd === "number" ? previousSelectionEnd : start, nextLength);
        replyInput.setSelectionRange(start, end);
      }
    }
  }
}

function attachChatsListener() {
  if (state.unsubscribeChats) {
    state.unsubscribeChats();
  }
  const chatsQuery = query(collection(db, "chats"), orderBy("updatedAt", "desc"));
  state.unsubscribeChats = onSnapshot(chatsQuery, (snapshot) => {
    state.chats = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    const visibleChats = getFilteredChats();
    if (!state.selectedChatId && visibleChats.length) {
      state.selectedChatId = visibleChats[0].id;
      attachMessagesListener();
    }
    state.selectedChat = state.chats.find((chat) => chat.id === state.selectedChatId) || null;
    if (state.selectedChat && !visibleChats.some((chat) => chat.id === state.selectedChat.id)) {
      state.selectedChatId = null;
      state.selectedChat = null;
      state.messages = [];
      if (state.unsubscribeMessages) {
        state.unsubscribeMessages();
        state.unsubscribeMessages = null;
      }
    } else if (!state.selectedChat && visibleChats.length) {
      state.selectedChatId = visibleChats[0].id;
      attachMessagesListener();
      state.selectedChat = state.chats.find((chat) => chat.id === state.selectedChatId) || null;
    }
    renderShell();
  });
}

function attachMessagesListener() {
  if (!state.selectedChatId) return;
  if (state.unsubscribeMessages) {
    state.unsubscribeMessages();
  }
  state.replyDraft = "";
  const messagesQuery = query(collection(db, `chats/${state.selectedChatId}/messages`), orderBy("createdAt", "asc"));
  state.unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
    state.messages = snapshot.docs.map((snap) => snap.data() || {});
    state.selectedChat = state.chats.find((chat) => chat.id === state.selectedChatId) || null;
    renderShell();
  });
}

function render() {
  if (state.authLoading) {
    root.innerHTML = `<div class="min-h-screen flex items-center justify-center"><div class="h-12 w-12 animate-spin rounded-full border-b-2 border-slate-900"></div></div>`;
    return;
  }
  if (!state.user || !state.adminAllowed) {
    renderLogin();
    return;
  }
  renderShell();
}

onAuthStateChanged(auth, async (user) => {
  state.authLoading = true;
  render();
  if (!user) {
    await detachAdminNotifications();
    state.user = null;
    state.adminAllowed = false;
    state.authLoading = false;
    render();
    return;
  }

  const allowed = await isUidAdmin(user.uid);
  state.user = user;
  state.adminAllowed = allowed;
  state.authLoading = false;
  state.authError = allowed ? "" : "This account is not listed in admins.";
  state.actionMessage = "";
  render();

  if (!allowed) {
    await detachAdminNotifications();
    await signOut(auth);
    return;
  }

  await setupAdminNotifications(user);
  attachChatsListener();
});
