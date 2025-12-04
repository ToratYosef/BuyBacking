import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  orderBy,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFirebaseApp } from "../firebase-app.js";

const app = getFirebaseApp();
const auth = getAuth(app);
const db = getFirestore(app);

const faqList = document.getElementById("faqList");
const supportForm = document.getElementById("supportForm");
const supportStatus = document.getElementById("supportStatus");
const orderSelect = document.getElementById("orderSelect");
const orderHint = document.getElementById("orderHint");
const phoneInput = document.getElementById("phoneInput");
const preferPhoneBtn = document.getElementById("preferPhoneBtn");

let prefersPhone = false;
let signedInUser = null;

const faqs = [
  {
    question: "When will I get paid?",
    answer:
      "Once your device is received and inspected, payouts typically go out within 2 business days based on the condition you selected.",
  },
  {
    question: "How do I ship my device?",
    answer:
      "After submitting your order, you can request a prepaid label or a kit. Pack your device securely, remove SIM/eSIM, and drop it at USPS.",
  },
  {
    question: "Can I update my payout method?",
    answer:
      "Yes. Include the new payout details in your ticket and we'll confirm the update before sending funds.",
  },
  {
    question: "What if my device has iCloud or FRP lock?",
    answer:
      "Please remove iCloud/Find My or Factory Reset Protection before shipping. If the device arrives locked, we'll reach out with steps.",
  },
  {
    question: "How do I track my order?",
    answer:
      "You can view status updates from your account. If you linked an order here, we'll reference it in our reply.",
  },
];

function renderFaqs() {
  faqList.innerHTML = "";
  faqs.forEach((faq, index) => {
    const item = document.createElement("div");
    item.className = "border border-slate-800 rounded-2xl bg-slate-900/60 overflow-hidden";
    item.innerHTML = `
      <button class="w-full flex items-center justify-between gap-4 px-4 py-4 text-left text-white hover:bg-slate-800/80 transition" data-index="${index}">
        <span class="font-semibold">${faq.question}</span>
        <i class="fa-solid fa-chevron-down text-sm text-slate-400"></i>
      </button>
      <div class="px-4 pb-4 hidden text-slate-300">${faq.answer}</div>
    `;
    faqList.appendChild(item);
  });

  faqList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-index]");
    if (!button) return;
    const content = button.nextElementSibling;
    const icon = button.querySelector("i");
    const isOpen = !content.classList.contains("hidden");
    content.classList.toggle("hidden", isOpen);
    icon.classList.toggle("rotate-180", !isOpen);
  });
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  const parts = [];
  if (digits.length > 0) {
    parts.push("(" + digits.slice(0, 3));
  }
  if (digits.length >= 4) {
    parts[0] += ")" + digits.slice(3, 6);
  }
  if (digits.length >= 7) {
    parts.push("-" + digits.slice(6, 10));
  }
  return parts.join("");
}

function updatePhonePreferenceState() {
  const digits = phoneInput.value.replace(/\D/g, "");
  preferPhoneBtn.disabled = digits.length !== 10;
  preferPhoneBtn.classList.toggle("bg-indigo-500", prefersPhone);
  preferPhoneBtn.classList.toggle("text-white", prefersPhone);
  preferPhoneBtn.classList.toggle("border-indigo-400", prefersPhone);
  preferPhoneBtn.classList.toggle("bg-slate-800/70", !prefersPhone);
  preferPhoneBtn.classList.toggle("text-slate-300", !prefersPhone);
}

async function loadOrdersForUser(user) {
  if (!user) {
    orderHint.textContent = "Sign in to see yours";
    orderSelect.innerHTML = '<option value="">Select an order (optional)</option>';
    orderSelect.disabled = true;
    return;
  }

  orderSelect.disabled = false;
  orderHint.textContent = "Orders linked to your account";
  orderSelect.innerHTML = '<option value="">Select an order (optional)</option>';

  try {
    const ordersRef = collection(db, "orders");
    const userOrdersQuery = query(
      ordersRef,
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(userOrdersQuery);
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const labelParts = [docSnap.id];
      if (data.device) labelParts.push(data.device);
      if (data.storage) labelParts.push(data.storage);
      const option = document.createElement("option");
      option.value = docSnap.id;
      option.dataset.summary = labelParts.join(" • ");
      option.textContent = labelParts.join(" • ");
      orderSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Failed to load orders for user", error);
    orderHint.textContent = "Could not load orders";
    orderSelect.disabled = true;
  }
}

function showStatus(message, isError = false) {
  supportStatus.textContent = message;
  supportStatus.className = isError ? "text-sm text-red-400" : "text-sm text-green-300";
}

function resetStatus() {
  showStatus("");
}

renderFaqs();
updatePhonePreferenceState();

phoneInput.addEventListener("input", (event) => {
  const formatted = formatPhone(event.target.value);
  phoneInput.value = formatted;
  if (prefersPhone && phoneInput.value.replace(/\D/g, "").length !== 10) {
    prefersPhone = false;
  }
  updatePhonePreferenceState();
});

preferPhoneBtn.addEventListener("click", () => {
  if (preferPhoneBtn.disabled) return;
  prefersPhone = !prefersPhone;
  updatePhonePreferenceState();
});

onAuthStateChanged(auth, (user) => {
  signedInUser = user;
  loadOrdersForUser(user);
  if (user && user.email) {
    const emailField = document.getElementById("supportEmail");
    if (emailField && !emailField.value) {
      emailField.value = user.email;
    }
  }
});

supportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  resetStatus();

  const email = document.getElementById("supportEmail").value.trim();
  const subject = document.getElementById("supportSubject").value.trim();
  const message = document.getElementById("supportMessage").value.trim();
  const consent = document.getElementById("consentCheckbox").checked;
  const digits = phoneInput.value.replace(/\D/g, "");
  const phone = digits ? formatPhone(digits) : "";
  const orderId = orderSelect.value || "";
  const orderLabel = orderSelect.selectedOptions[0]?.dataset.summary || "";

  if (!email || !subject || !message) {
    showStatus("Email, subject, and message are required.", true);
    return;
  }

  if (prefersPhone && digits.length !== 10) {
    showStatus("Enter a 10-digit phone number to request phone support.", true);
    return;
  }

  if (!consent) {
    showStatus("Please acknowledge message & data rates.", true);
    return;
  }

  const ticketNumber = `T-${Date.now().toString(36).toUpperCase()}`;
  const payload = {
    email,
    subject,
    message,
    dataConsent: consent,
    phone: phone || null,
    prefersPhone,
    orderId: orderId || null,
    orderLabel: orderLabel || null,
    userId: signedInUser?.uid || null,
    customerName: signedInUser?.displayName || null,
    ticketNumber,
    status: "open",
    createdAt: serverTimestamp(),
  };

  try {
    await addDoc(collection(db, "support_tickets"), payload);
    supportForm.reset();
    prefersPhone = false;
    updatePhonePreferenceState();
    showStatus(`Ticket submitted! Your number is ${ticketNumber}.`);
  } catch (error) {
    console.error("Error submitting support ticket", error);
    showStatus("Something went wrong. Please try again.", true);
  }
});

supportForm.addEventListener("reset", () => {
  prefersPhone = false;
  updatePhonePreferenceState();
  resetStatus();
});
