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

export const GRADE_ORDER = ["A", "B", "C", "F"];

export const GRADE_LABELS = {
    A: "Grade A",
    B: "Grade B",
    C: "Grade C",
    F: "Grade F"
};

export const defaultInventory = [
    {
        id: "apple-iphone-15",
        brand: "Apple",
        model: "iPhone 15",
        tagline: "Factory unlocked · 90-day wholesale warranty",
        image: "https://images.secondhandcell.com/devices/iphone15-midnight.png",
        highlights: ["45-point functionality tested", "Battery 90%+", "No iCloud locks"],
        storages: [
            {
                variant: "128GB · Midnight",
                asking: { A: 685, B: 655, C: 610, F: 520 },
                stock: { A: 32, B: 44, C: 26, F: 12 }
            },
            {
                variant: "256GB · Blue",
                asking: { A: 725, B: 695, C: 655, F: 545 },
                stock: { A: 24, B: 39, C: 22, F: 10 }
            }
        ]
    },
    {
        id: "apple-iphone-14",
        brand: "Apple",
        model: "iPhone 14",
        tagline: "Unlocked · Clean IMEI",
        image: "https://images.secondhandcell.com/devices/iphone14-starlight.png",
        highlights: ["Fully data-wiped", "Includes charging accessories", "Available in bulk"],
        storages: [
            {
                variant: "128GB · Starlight",
                asking: { A: 585, B: 555, C: 515, F: 420 },
                stock: { A: 48, B: 58, C: 34, F: 16 }
            },
            {
                variant: "256GB · Midnight",
                asking: { A: 625, B: 595, C: 555, F: 460 },
                stock: { A: 36, B: 51, C: 28, F: 14 }
            }
        ]
    },
    {
        id: "samsung-galaxy-s23",
        brand: "Samsung",
        model: "Galaxy S23",
        tagline: "Unlocked · North American variant",
        image: "https://images.secondhandcell.com/devices/galaxy-s23-cream.png",
        highlights: ["5G unlocked", "Factory reset", "Deep cleaned"],
        storages: [
            {
                variant: "128GB · Phantom Black",
                asking: { A: 515, B: 485, C: 445, F: 360 },
                stock: { A: 29, B: 42, C: 30, F: 18 }
            },
            {
                variant: "256GB · Lavender",
                asking: { A: 545, B: 515, C: 470, F: 380 },
                stock: { A: 24, B: 33, C: 22, F: 12 }
            }
        ]
    },
    {
        id: "google-pixel-8",
        brand: "Google",
        model: "Pixel 8",
        tagline: "Unlocked · OEM charging accessories",
        image: "https://images.secondhandcell.com/devices/pixel8-obsidian.png",
        highlights: ["Face Unlock calibrated", "Android 14", "Scratch-free screens"],
        storages: [
            {
                variant: "128GB · Obsidian",
                asking: { A: 495, B: 465, C: 425, F: 335 },
                stock: { A: 18, B: 29, C: 19, F: 9 }
            },
            {
                variant: "256GB · Hazel",
                asking: { A: 525, B: 495, C: 455, F: 355 },
                stock: { A: 14, B: 24, C: 16, F: 7 }
            }
        ]
    },
    {
        id: "apple-ipad-pro-11",
        brand: "Apple",
        model: "iPad Pro 11",
        tagline: "Wi-Fi + Cellular",
        image: "https://images.secondhandcell.com/devices/ipad-pro-11.png",
        highlights: ["Face ID calibrated", "OEM chargers included", "Crate packed"],
        storages: [
            {
                variant: "256GB · Silver",
                asking: { A: 785, B: 745, C: 685, F: 560 },
                stock: { A: 12, B: 18, C: 10, F: 6 }
            },
            {
                variant: "512GB · Space Gray",
                asking: { A: 845, B: 805, C: 745, F: 615 },
                stock: { A: 9, B: 14, C: 8, F: 4 }
            }
        ]
    }
];

function clone(data) {
    return JSON.parse(JSON.stringify(data));
}

export function loadInventory() {
    const raw = localStorage.getItem(STORAGE_KEYS.inventory);
    if (!raw) {
        localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(defaultInventory));
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
    localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(defaultInventory));
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
