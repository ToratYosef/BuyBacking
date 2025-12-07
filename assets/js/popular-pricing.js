import { firebaseApp } from '/assets/js/firebase-app.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

const db = getFirestore(firebaseApp);

const formatPrice = (value) => value ? `Up to $${Math.round(value).toLocaleString()}` : 'Pricing coming soon';

const findHighestPrice = (prices = {}) => {
    let max = 0;
    Object.values(prices).forEach((storageOption = {}) => {
        Object.values(storageOption || {}).forEach((carrierPrices = {}) => {
            Object.values(carrierPrices || {}).forEach((price) => {
                if (typeof price === 'number') {
                    max = Math.max(max, price);
                }
            });
        });
    });
    return max || null;
};

const applyPopularPricing = async () => {
    const priceEls = document.querySelectorAll('[data-device-price]');
    if (!priceEls.length) return;

    await Promise.all(Array.from(priceEls).map(async (el) => {
        const brand = el.getAttribute('data-brand');
        const slug = el.getAttribute('data-slug');
        if (!brand || !slug) return;

        try {
            const snap = await getDoc(doc(db, `devices/${brand}/models`, slug));
            if (!snap.exists()) {
                console.warn(`No pricing found for ${brand}/${slug}`);
                el.textContent = formatPrice(null);
                return;
            }

            const highest = findHighestPrice(snap.data().prices || {});
            el.textContent = formatPrice(highest);
        } catch (error) {
            console.error(`Failed to load pricing for ${brand}/${slug}:`, error);
            el.textContent = formatPrice(null);
        }
    }));
};

document.addEventListener('DOMContentLoaded', applyPopularPricing);
