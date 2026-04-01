import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFirebaseApp } from "../firebase-app.js";

const app = getFirebaseApp();
const auth = getAuth(app);
const db = getFirestore(app);

const faqList = document.getElementById("faqList");
const supportForm = document.getElementById("supportForm");
const supportStatus = document.getElementById("supportStatus");
const orderIdInput = document.getElementById("orderIdInput");

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
      "You can view status updates from your account or from the tracking link in your emails. Include your order ID in the form if you need help with a specific trade-in.",
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

function showStatus(message, isError = false) {
  supportStatus.textContent = message;
  supportStatus.className = isError ? "text-sm text-red-400" : "text-sm text-green-300";
}

function resetStatus() {
  showStatus("");
}

renderFaqs();

onAuthStateChanged(auth, (user) => {
  signedInUser = user;
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
  const manualOrderId = String(orderIdInput?.value || "").trim().toUpperCase();
  const orderId = manualOrderId || "";

  if (!email || !subject || !message) {
    showStatus("Email, subject, and message are required.", true);
    return;
  }

  if (!consent) {
    showStatus("Please acknowledge email updates for this ticket.", true);
    return;
  }

  const ticketNumber = `T-${Date.now().toString(36).toUpperCase()}`;
  const payload = {
    email,
    subject,
    message,
    dataConsent: consent,
    orderId: orderId || null,
    orderLabel: orderId || null,
    userId: signedInUser?.uid || null,
    customerName: signedInUser?.displayName || null,
    ticketNumber,
    status: "open",
    createdAt: serverTimestamp(),
  };

  try {
    await addDoc(collection(db, "support_tickets"), payload);
    supportForm.reset();
    showStatus(`Ticket submitted! Your number is ${ticketNumber}.`);
  } catch (error) {
    console.error("Error submitting support ticket", error);
    showStatus("Something went wrong. Please try again.", true);
  }
});

supportForm.addEventListener("reset", () => {
  resetStatus();
});
