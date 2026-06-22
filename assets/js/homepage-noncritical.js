import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getFirestore, doc, getDoc, getDocs, collection, addDoc, setLogLevel } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';

// Firebase configuration (from assets/js/firebase-config.js)
const firebaseConfig = {
  apiKey: 'AIzaSyAmUGWbpbJIWLrBMJpZb8iMpFt-uc24J0k',
  authDomain: 'auth.secondhandcell.com',
  projectId: 'buyback-a0f05',
  storageBucket: 'buyback-a0f05.appspot.com',
  messagingSenderId: '876430429098',
  appId: '1:876430429098:web:f6dd64b1960d90461979d3',
};
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const firebaseApp = app;
const getFirebaseApp = () => firebaseApp;
if (typeof window !== 'undefined') { window.firebaseConfig = firebaseConfig; window.firebaseApp = firebaseApp; }

// API client (from public/js/apiClient.js)
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const defaultApiBase = "/api";

let apiBase =
  (typeof window !== "undefined" &&
    (window.SHC_API_BASE_URL || window.API_BASE_URL || window.API_BASE)) ||
  defaultApiBase;

function normalizeApiBase(base) {
  if (typeof base !== "string") {
    return base;
  }

  const trimmed = base.trim().replace(/\/$/, "");
  return trimmed;
}

apiBase = normalizeApiBase(apiBase);

function setApiBase(nextBase) {
  if (nextBase) {
    apiBase = normalizeApiBase(nextBase);
  }
}

function resolveUrl(path) {
  const cleanedBase = apiBase.replace(/\/$/, "");
  const cleanedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(`${cleanedBase}${cleanedPath}`, window.location.origin).toString();
}

async function getIdToken({ forceRefresh = false } = {}) {
  const user = auth.currentUser;
  if (!user) {
    return null;
  }
  return user.getIdToken(forceRefresh);
}

async function requestWithAuth(method, path, data, options = {}, { forceRefresh = false } = {}) {
  const { authRequired = false, headers = {}, ...fetchOptions } = options;
  const token = await getIdToken({ forceRefresh });

  if (authRequired && !token) {
    throw new Error("Authentication required. Please sign in and try again.");
  }

  const requestHeaders = {
    "Content-Type": "application/json",
    ...headers,
  };

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  return fetch(resolveUrl(path), {
    method,
    headers: requestHeaders,
    body: data ? JSON.stringify(data) : undefined,
    ...fetchOptions,
  });
}

async function apiRequest(method, path, data, options = {}) {
  let response = await requestWithAuth(method, path, data, options, { forceRefresh: false });

  if (response.status === 401) {
    response = await requestWithAuth(method, path, data, options, { forceRefresh: true });
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = payload?.error || payload?.message || response.statusText;
    const error = new Error(message || "API request failed.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function apiRaw(path, options = {}) {
  const { authRequired = false, headers = {}, body, method = "GET", ...fetchOptions } = options;
  const makeRequest = async (forceRefresh = false) => {
    const token = await getIdToken({ forceRefresh });

    if (authRequired && !token) {
      throw new Error("Authentication required. Please sign in and try again.");
    }

    const requestHeaders = { ...headers };
    if (token) {
      requestHeaders.Authorization = `Bearer ${token}`;
    }

    return fetch(resolveUrl(path), {
      method,
      headers: requestHeaders,
      body,
      ...fetchOptions,
    });
  };

  let response = await makeRequest(false);
  if (response.status === 401) {
    response = await makeRequest(true);
  }
  return response;
}

function apiGet(path, options) {
  return apiRequest("GET", path, undefined, options);
}

function apiPost(path, data, options) {
  return apiRequest("POST", path, data, options);
}

function apiPut(path, data, options) {
  return apiRequest("PUT", path, data, options);
}

function apiDelete(path, data, options) {
  return apiRequest("DELETE", path, data, options);
}

function apiFetch(path, options = {}) {
  return apiRequest(options.method || "GET", path, options.body, options);
}

// Popular pricing (from assets/js/popular-pricing.js)
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

const normalizeSlug = (value = '') => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\s+/g, '-')
    .replace(/_+/g, '-');

const toSlugCore = (value = '') => normalizeSlug(value)
    .replace(/^iphone[-/]/, '')
    .replace(/^samsung[-/]/, '')
    .replace(/[^a-z0-9]+/g, '');

const buildSlugCandidates = (brand, slug) => {
    const normalizedBrand = normalizeSlug(brand);
    const normalizedSlug = normalizeSlug(slug);
    const core = toSlugCore(normalizedSlug);

    const candidates = new Set([
        normalizedSlug,
        `${normalizedBrand}-${normalizedSlug}`,
        normalizedSlug.replace(/\//g, '-'),
        normalizedSlug.replace(/-/g, '/'),
    ]);

    if (core) {
        candidates.add(`${normalizedBrand}-${core}`);
        candidates.add(`${normalizedBrand}/${core}`);
    }

    return Array.from(candidates).filter(Boolean);
};

const getModelDocBySlug = async (brand, slug) => {
    const candidates = buildSlugCandidates(brand, slug);

    for (const candidate of candidates) {
        const direct = await getDoc(doc(db, "devices", brand, "models", candidate));
        if (direct.exists()) return direct.data();
    }

    const modelsSnap = await getDocs(collection(db, "devices", brand, "models"));
    let matchedData = null;
    const candidateSet = new Set(candidates.map(normalizeSlug));
    const candidateCores = new Set(candidates.map(toSlugCore));

    modelsSnap.forEach((modelDoc) => {
        if (matchedData) return;
        const model = modelDoc.data() || {};
        const docId = normalizeSlug(modelDoc.id);
        const modelSlug = normalizeSlug(model.slug);
        const modelID = normalizeSlug(model.modelID);
        const docIdCore = toSlugCore(docId);
        const modelSlugCore = toSlugCore(modelSlug);
        const modelIdCore = toSlugCore(modelID);

        if (
            candidateSet.has(docId) ||
            candidateSet.has(modelSlug) ||
            candidateSet.has(modelID) ||
            candidateCores.has(docIdCore) ||
            candidateCores.has(modelSlugCore) ||
            candidateCores.has(modelIdCore)
        ) {
            matchedData = model;
        }
    });

    return matchedData;
};

const applyPopularPricing = async () => {
    const priceEls = document.querySelectorAll('[data-device-price]');
    if (!priceEls.length) return;

    await Promise.all(Array.from(priceEls).map(async (el) => {
        const brand = el.getAttribute('data-brand');
        const slug = el.getAttribute('data-slug');
        if (!brand || !slug) return;

        try {
            const modelData = await getModelDocBySlug(brand, slug);
            if (!modelData) {
                console.warn(`No pricing found for ${brand}/${slug}`);
                el.textContent = formatPrice(null);
                return;
            }

            const highest = findHighestPrice(modelData.prices || {});
            el.textContent = formatPrice(highest);
        } catch (error) {
            console.error(`Failed to load pricing for ${brand}/${slug}:`, error);
            el.textContent = formatPrice(null);
        }
    }));
};

document.addEventListener('DOMContentLoaded', applyPopularPricing);

const currency = (value) => `$${Math.round(value).toLocaleString()}`;
const OVERPAY_IMAGE_EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg'];
const hasImageExtension = (url) => /\.(png|jpe?g|webp)(\?.*)?$/i.test(url || '');

const resolveOverpayImageUrl = (imgEl, imageUrl, brand) => {
    if (!imgEl) return;

    const brandFallback = brand === 'samsung' ? 'https://cdn.secondhandcell.com/images/assets/samsung.webp' : 'https://cdn.secondhandcell.com/images/assets/apple.webp';
    if (!imageUrl) {
        imgEl.src = brandFallback;
        return;
    }

    if (hasImageExtension(imageUrl)) {
        imgEl.src = imageUrl;
        imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = brandFallback; };
        return;
    }

    const candidates = OVERPAY_IMAGE_EXTENSIONS.map((ext) => `${imageUrl}${ext}`);
    let index = 0;

    const tryNext = () => {
        if (index >= candidates.length) {
            imgEl.src = brandFallback;
            return;
        }

        const probe = new Image();
        const candidate = candidates[index];
        probe.onload = () => {
            imgEl.src = candidate;
            imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = brandFallback; };
        };
        probe.onerror = () => {
            index += 1;
            tryNext();
        };
        probe.src = candidate;
    };

    tryNext();
};

const buildOverpaySellUrl = (entry) => {
    const params = new URLSearchParams();
    params.set('model', entry.slug);
    params.set('storage', entry.storage);
    params.set('carrier', entry.carrier);
    params.set('device', `${entry.brand}-${entry.slug}`);
    return `/sell/?${params.toString()}`;
};

function renderOverpayDevices(devices) {
    const mount = document.getElementById('overpay-devices-list');
    if (!mount) return;

    if (!Array.isArray(devices) || !devices.length) {
        mount.innerHTML = '<div class="overpay-card"><p class="text-slate-800 font-semibold">No bonus devices available right now.</p><p class="overpay-meta">Check back soon for updated daily offers.</p></div>';
        return;
    }

    mount.innerHTML = '';
    devices.forEach((device) => {
        const card = document.createElement('article');
        card.className = 'overpay-card';

        const bonusText = `+$${Math.round(device.bonus)} Bonus Today`;
        card.innerHTML = `
            <span class="overpay-bonus">${bonusText}</span>
            <div class="overpay-device-media">
                <img class="overpay-device-image" alt="${device.name}" loading="lazy" decoding="async">
            </div>
            <h3 class="text-lg font-bold text-slate-900 leading-snug">${device.name}</h3>
            <p class="overpay-meta">${(device.carrierLabel || device.carrier).toUpperCase()}</p>
            <p class="overpay-price">Now At- ${currency(device.basePayout)}</p>
            <button type="button" class="overpay-cta">Sell Now</button>
        `;

        const imageEl = card.querySelector('.overpay-device-image');
        resolveOverpayImageUrl(imageEl, device.imageUrl, device.brand);

        const cta = card.querySelector('.overpay-cta');
        const navigate = () => {
            window.location.href = buildOverpaySellUrl(device);
        };

        card.addEventListener('click', navigate);
        if (cta) cta.addEventListener('click', (event) => {
            event.stopPropagation();
            navigate();
        });

        mount.appendChild(card);
    });
}

const getOverpayCandidates = async () => {
    const brands = ['iphone', 'samsung'];
    const candidates = [];

    await Promise.all(brands.map(async (brand) => {
        const snap = await getDocs(collection(db, 'devices', brand, 'models'));
        snap.forEach((modelDoc) => {
            const modelData = modelDoc.data() || {};
            const prices = modelData.prices || {};
            const overpayBonusRaw = modelData.overpayBonus;
            const hasManualBonus = !!overpayBonusRaw;
            const manualBonusValue = typeof overpayBonusRaw === 'number'
                ? overpayBonusRaw
                : Number(overpayBonusRaw?.amount || 0);

            Object.entries(prices).forEach(([storage, carrierMap]) => {
                Object.entries(carrierMap || {}).forEach(([carrier, conditionMap]) => {
                    const flawless = Number(conditionMap?.flawless || 0);
                    const best = flawless || Math.max(...Object.values(conditionMap || {}).map((value) => Number(value || 0)));
                    if (!Number.isFinite(best) || best <= 0) return;
                    candidates.push({
                        brand,
                        slug: modelDoc.id,
                        name: modelData.name || modelDoc.id,
                        imageUrl: modelData.imageUrl || '',
                        storage,
                        carrier,
                        carrierLabel: carrier,
                        basePayout: best,
                        overpayBonus: hasManualBonus,
                        manualBonus: manualBonusValue
                    });
                });
            });
        });
    }));

    return candidates;
};

const getFallbackOverpayDevices = (candidates) => {
    const iphoneCandidates = candidates
        .filter((item) => item.brand === 'iphone')
        .sort((a, b) => b.basePayout - a.basePayout);

    const chosen = [];
    const seenSlug = new Set();
    iphoneCandidates.forEach((candidate) => {
        if (chosen.length >= 2) return;
        if (seenSlug.has(candidate.slug)) return;
        seenSlug.add(candidate.slug);
        chosen.push({
            ...candidate,
            bonus: (Math.floor(Math.random() * 8) + 8)
        });
    });
    return chosen;
};

const loadOverpayDevices = async () => {
    try {
        const candidates = await getOverpayCandidates();
        if (!candidates.length) {
            renderOverpayDevices([]);
            return;
        }

        const averagePayout = candidates.reduce((sum, item) => sum + item.basePayout, 0) / candidates.length;
        const threshold = averagePayout * 1.1;
        const live = candidates
            .filter((item) => item.basePayout >= threshold || item.overpayBonus)
            .map((item) => ({
                ...item,
                bonus: item.manualBonus > 0 ? item.manualBonus : (Math.floor(Math.random() * 8) + 8)
            }))
            .sort((a, b) => (b.basePayout + b.bonus) - (a.basePayout + a.bonus))
            .slice(0, 2);

        const output = live.length ? live : getFallbackOverpayDevices(candidates);
        renderOverpayDevices(output);
    } catch (error) {
        console.error('Failed to load overpay devices:', error);
        renderOverpayDevices([]);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const run = () => loadOverpayDevices();
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 1500 });
    } else {
        window.setTimeout(run, 120);
    }
});

// Home page logic (from assets/js/pages/index-b8699033.js)
setLogLevel('error');

document.addEventListener('DOMContentLoaded', function() {
    // Image loading with fallback
    function loadImageWithFallback(imgElement) {
        const rawBaseSrc = imgElement.dataset.baseSrc;
        if (!rawBaseSrc) return;

        const baseSrc = rawBaseSrc.startsWith('http')
            ? rawBaseSrc
            : `https://cdn.secondhandcell.com/images${rawBaseSrc.startsWith('/') ? '' : '/'}${rawBaseSrc}`;

        const extensions = ['.webp', '.png', '.jpg', '.jpeg', '.svg', '.avif'];
        const tried = new Set();
        let current = 0;

        function tryLoad() {
            if (current >= extensions.length) {
                if (imgElement.id.includes('_cat_img')) {
                    imgElement.src = `https://placehold.co/150x150/e0e7ff/4338ca?text=Category`;
                } else {
                    imgElement.src = `https://placehold.co/200x200/f0f4ff/6366f1?text=No+Image`;
                }
                imgElement.alt = "Image not available";
                return;
            }

            const testSrc = `${baseSrc}${extensions[current]}`;
            current += 1;
            if (tried.has(testSrc)) {
                tryLoad();
                return;
            }
            tried.add(testSrc);

            const img = new Image();
            img.onload = () => { imgElement.src = testSrc; };
            img.onerror = () => { tryLoad(); };
            img.src = testSrc;
        }

        tryLoad();
    }
    document.querySelectorAll('img[data-base-src]').forEach(loadImageWithFallback);

    // Modals
    const modals = document.querySelectorAll('.modal');
    const animateModalOpen = (modal) => {
        if (!modal) return;
        modal.classList.remove('is-hiding');
        modal.classList.remove('is-visible');
        modal.setAttribute('aria-hidden', 'false');
        void modal.offsetWidth;
        requestAnimationFrame(() => modal.classList.add('is-visible'));
    };
    const animateModalClose = (modal) => {
        if (!modal) return;
        modal.classList.add('is-hiding');
        modal.setAttribute('aria-hidden', 'true');
        const onTransitionEnd = (event) => {
            if (event.target !== modal) return;
            modal.classList.remove('is-visible', 'is-hiding');
            modal.removeEventListener('transitionend', onTransitionEnd);
        };
        modal.addEventListener('transitionend', onTransitionEnd);
        setTimeout(() => {
            modal.classList.remove('is-visible', 'is-hiding');
        }, 350);
    };
    const openModal = (modalId) => animateModalOpen(document.getElementById(modalId));
    const closeModal = (modal) => animateModalClose(modal);

    const aboutUsLink = document.getElementById('aboutUsLink');
    if (aboutUsLink) {
        aboutUsLink.addEventListener('click', (e) => {
            e.preventDefault();
            openModal('aboutUsModal');
        });
    }

    const privacyPolicyLink = document.getElementById('privacyPolicyLink');
    if (privacyPolicyLink) {
        privacyPolicyLink.addEventListener('click', (e) => {
            e.preventDefault();
            openModal('privacyPolicyModal');
        });
    }

    const termsAndConditionsLinkFooter = document.getElementById('termsAndConditionsLinkFooter');
    if (termsAndConditionsLinkFooter) {
        termsAndConditionsLinkFooter.addEventListener('click', (e) => {
            e.preventDefault();
            openModal('termsAndConditionsModal');
        });
    }

    modals.forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
        const closeBtn = modal.querySelector('.close-modal-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => closeModal(modal));
        }
    });

    // Footer email signup
    const footerEmailSignupForm = document.getElementById('footerEmailSignupForm');
    let footerSignupMessage = document.getElementById('footerSignupMessage');
    if (footerEmailSignupForm) {
        if (!footerSignupMessage) {
            footerSignupMessage = document.createElement('div');
            footerSignupMessage.id = 'footerSignupMessage';
            footerEmailSignupForm.insertAdjacentElement('afterend', footerSignupMessage);
        }
        footerEmailSignupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = (document.getElementById('footerEmail')?.value || '').trim().toLowerCase();
            footerSignupMessage.textContent = 'Submitting...';
            footerSignupMessage.className = 'mt-3 text-sm text-center text-blue-300';

            if (!email) {
                footerSignupMessage.textContent = 'Please enter an email address.';
                footerSignupMessage.className = 'mt-3 text-sm text-center text-red-300';
                return;
            }

            try {
                await addDoc(collection(db, "signed_up_emails"), {
                    email: email,
                    timestamp: new Date()
                });
                footerSignupMessage.textContent = 'Success! Thanks for signing up.';
                footerSignupMessage.className = 'mt-3 text-sm text-center text-green-300';
                footerEmailSignupForm.reset();
            } catch (error) {
                console.error("Error adding document: ", error);
                footerSignupMessage.textContent = 'Error: Could not sign up.';
                footerSignupMessage.className = 'mt-3 text-sm text-center text-red-300';
            }
        });
    }

    // Scroll animations
    setupScrollAnimations();

    // Trustpilot reviews are rendered by the official TrustBox widget in the page markup.

});

function setupScrollAnimations() {
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
}

// Site header mobile navigation toggle
(() => {
  function initNavToggle() {
    const toggle = document.querySelector('[data-site-nav-toggle]');
    const nav = document.getElementById('siteNav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.addEventListener('click', (event) => {
      if (!nav.contains(event.target) && !toggle.contains(event.target) && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavToggle);
  } else {
    initNavToggle();
  }
})();
