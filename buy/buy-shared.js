import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAmUGWbpbJIWLrBMJpZb8iMpFt-uc24J0k",
    authDomain: "auth.secondhandcell.com",
    projectId: "buyback-a0f05",
    storageBucket: "buyback-a0f05.appspot.com",
    messagingSenderId: "876430429098",
    appId: "1:876430429098:web:f6dd64b1960d90461979d3",
    measurementId: "G-6WWQN44JHT"
};

let firebaseApp;
let firebaseAuth;

export function initFirebase() {
    if (!firebaseApp) {
        firebaseApp = initializeApp(firebaseConfig);
        firebaseAuth = getAuth(firebaseApp);
    }
    return { app: firebaseApp, auth: firebaseAuth };
}

export const STORAGE_KEYS = {
    inventory: "wholesaleInventoryV2",
    cart: "wholesaleCartV2",
    offers: "wholesaleOffersV2"
};

export const API_BASE = "/api/wholesale";
export const DEFAULT_IMAGE_BASE = "https://raw.githubusercontent.com/toratyosef/BuyBacking/main/";

export const GRADE_ORDER = ["A", "B", "C", "F"];

export const GRADE_LABELS = {
    A: "Grade A",
    B: "Grade B",
    C: "Grade C",
    F: "Grade F"
};

export const defaultInventory = [];

function clone(data) {
    return JSON.parse(JSON.stringify(data));
}

async function fetchInventoryFromRemote(signal) {
    try {
        const response = await fetch(`${API_BASE}/inventory`, { signal });
        if (!response.ok) {
            throw new Error(`Inventory fetch failed: ${response.status}`);
        }
        const payload = await response.json();
        const items = Array.isArray(payload.items) ? payload.items : [];
        if (items.length) {
            localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(items));
        }
        return items;
    } catch (error) {
        console.warn("Unable to fetch inventory from backend", error);
        return null;
    }
}

let inventorySyncPromise = null;

export async function syncInventoryFromRemote({ force = false, signal } = {}) {
    if (force) {
        inventorySyncPromise = null;
    }
    if (!inventorySyncPromise) {
        inventorySyncPromise = fetchInventoryFromRemote(signal)
            .then((items) => (items && items.length ? items : loadInventory()))
            .finally(() => {
                inventorySyncPromise = null;
            });
    }
    return inventorySyncPromise;
}

export function loadInventory() {
    const raw = localStorage.getItem(STORAGE_KEYS.inventory);
    if (!raw) {
        return clone(defaultInventory);
    }
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            throw new Error("Invalid inventory structure");
        }
        return parsed;
    } catch (error) {
        console.warn("Failed to parse inventory, resetting to defaults", error);
        localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(defaultInventory));
        return clone(defaultInventory);
    }
}

export function saveInventory(inventory) {
    localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(inventory));
}

export function resetInventory() {
    localStorage.removeItem(STORAGE_KEYS.inventory);
    window.dispatchEvent(new CustomEvent("wholesale-inventory-reset"));
}

export function loadCart() {
    const raw = localStorage.getItem(STORAGE_KEYS.cart);
    if (!raw) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            throw new Error("Invalid cart structure");
        }
        return parsed;
    } catch (error) {
        console.warn("Failed to parse cart, clearing it", error);
        localStorage.removeItem(STORAGE_KEYS.cart);
        return [];
    }
}

export function saveCart(cart) {
    localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent("wholesale-cart-updated", { detail: { cart } }));
}

export function clearCart() {
    localStorage.removeItem(STORAGE_KEYS.cart);
    window.dispatchEvent(new CustomEvent("wholesale-cart-updated", { detail: { cart: [] } }));
}

export function loadOffers() {
    const raw = localStorage.getItem(STORAGE_KEYS.offers);
    if (!raw) {
        return {};
    }
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
        console.warn("Failed to parse offers, clearing them", error);
        localStorage.removeItem(STORAGE_KEYS.offers);
        return {};
    }
}

export function saveOffers(offers) {
    localStorage.setItem(STORAGE_KEYS.offers, JSON.stringify(offers));
    window.dispatchEvent(new CustomEvent("wholesale-offers-updated", { detail: { offers } }));
}

export function getUserOffers(userId) {
    if (!userId) return [];
    const allOffers = loadOffers();
    return Array.isArray(allOffers[userId]) ? allOffers[userId] : [];
}

export function saveUserOffers(userId, userOffers) {
    const allOffers = loadOffers();
    allOffers[userId] = userOffers;
    saveOffers(allOffers);
}

export function generateOfferId() {
    return `offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatCurrency(value) {
    if (Number.isNaN(Number(value))) {
        return "$0.00";
    }
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
}

export function summarizeOffer(offer) {
    if (!offer || !Array.isArray(offer.items)) {
        return { units: 0, total: 0 };
    }
    const units = offer.items.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
    const total = offer.items.reduce((sum, line) => {
        const price = Number(line.offerPrice || line.counterPrice || 0);
        return sum + price * (Number(line.quantity) || 0);
    }, 0);
    return { units, total };
}

export function brandGroupsFromInventory(inventory) {
    const groups = new Map();
    inventory.forEach((device) => {
        if (!groups.has(device.brand)) {
            groups.set(device.brand, []);
        }
        groups.get(device.brand).push(device);
    });
    return groups;
}
