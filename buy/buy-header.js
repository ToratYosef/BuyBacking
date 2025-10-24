import {
    initFirebase,
    loadCart,
    clearCart,
    formatCurrency,
    GRADE_LABELS,
    STORAGE_KEYS
} from "./buy-shared.js";
import {
    GoogleAuthProvider,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const { auth } = initFirebase();
const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({ prompt: "select_account" });

export function initializeBuyHeader(options = {}) {
    const {
        cartButtonId = "cartButton",
        cartBadgeId = "cartBadge",
        cartPreviewId = "cartPreview",
        cartPreviewListId = "cartPreviewList",
        cartEmptyId = "cartPreviewEmpty",
        authButtonId = "accountButton",
        accountInitialId = "accountInitial",
        accountDropdownId = "accountDropdown",
        openCartLinkId = "openCartLink",
        closeCartPreviewSelector = "[data-close-cart-preview]",
        toggleAuthModeSelector = "[data-auth-mode]",
        authModalId = "authModal",
        authFormId = "authForm",
        authNameRowId = "authNameRow",
        authErrorId = "authError",
        authBackdropId = "authBackdrop",
        authCloseSelector = "[data-close-auth-modal]",
        forgotPasswordId = "forgotPassword"
    } = options;

    const cartButton = document.getElementById(cartButtonId);
    const cartBadge = document.getElementById(cartBadgeId);
    const cartPreview = document.getElementById(cartPreviewId);
    const cartPreviewList = document.getElementById(cartPreviewListId);
    const cartPreviewEmpty = document.getElementById(cartEmptyId);
    const openCartLink = document.getElementById(openCartLinkId);
    const authButton = document.getElementById(authButtonId);
    const accountInitial = document.getElementById(accountInitialId);
    const accountClone = document.getElementById("accountInitialClone");
    const accountDropdown = document.getElementById(accountDropdownId);
    const authModal = document.getElementById(authModalId);
    const authForm = document.getElementById(authFormId);
    const authNameRow = document.getElementById(authNameRowId);
    const authError = document.getElementById(authErrorId);
    const authBackdrop = document.getElementById(authBackdropId);
    const forgotPasswordLink = document.getElementById(forgotPasswordId);

    let currentAuthMode = "signIn";

    function hideCartPreview() {
        if (cartPreview) {
            cartPreview.classList.add("hidden");
        }
    }

    function updateCartPreview() {
        if (!cartBadge) return;
        const cart = loadCart();
        const units = cart.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
        cartBadge.textContent = units;
        cartBadge.classList.toggle("hidden", units === 0);

        if (cartPreview && cartPreviewList && cartPreviewEmpty) {
            cartPreviewList.innerHTML = "";
            if (!cart.length) {
                cartPreviewEmpty.classList.remove("hidden");
            } else {
                cartPreviewEmpty.classList.add("hidden");
                const topThree = cart.slice(0, 3);
                topThree.forEach((line) => {
                    const item = document.createElement("div");
                    item.className = "rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm";
                    item.innerHTML = `
                        <p class="font-semibold text-slate-900">${line.brand} ${line.model}</p>
                        <p class="mt-1 text-xs uppercase tracking-[0.3em] text-slate-500">${line.storageVariant} · ${GRADE_LABELS[line.grade] || line.grade}</p>
                        <p class="mt-2 flex items-center justify-between text-xs text-slate-500">
                            <span>${line.quantity} units</span>
                            <span>${formatCurrency(line.askingPrice || 0)}</span>
                        </p>
                    `;
                    cartPreviewList.appendChild(item);
                });
                if (cart.length > topThree.length) {
                    const more = document.createElement("p");
                    more.className = "text-xs text-slate-500";
                    more.textContent = `+${cart.length - topThree.length} more line items in cart`;
                    cartPreviewList.appendChild(more);
                }
            }
        }
    }

    function toggleCartPreview() {
        if (!cartPreview) return;
        if (cartPreview.classList.contains("hidden")) {
            cartPreview.classList.remove("hidden");
        } else {
            cartPreview.classList.add("hidden");
        }
    }

    function openAuthModal(mode = "signIn") {
        currentAuthMode = mode;
        if (authModal) {
            authModal.classList.remove("hidden");
        }
        if (authBackdrop) {
            authBackdrop.classList.remove("hidden");
        }
        if (authForm) {
            authForm.reset();
            authForm.dataset.mode = mode;
        }
        if (authNameRow) {
            authNameRow.classList.toggle("hidden", mode === "signIn");
        }
        if (authError) {
            authError.textContent = "";
            authError.classList.add("hidden");
        }
        const title = authModal?.querySelector("[data-auth-title]");
        if (title) {
            title.textContent = mode === "signIn" ? "Sign in" : "Create your buyer account";
        }
        const submit = authForm?.querySelector("button[type=submit]");
        if (submit) {
            submit.textContent = mode === "signIn" ? "Sign in" : "Sign up";
        }
        const switchLinks = document.querySelectorAll(toggleAuthModeSelector);
        switchLinks.forEach((link) => {
            link.classList.toggle("font-semibold", link.dataset.authMode === mode);
        });
    }

    function closeAuthModal() {
        if (authModal) {
            authModal.classList.add("hidden");
        }
        if (authBackdrop) {
            authBackdrop.classList.add("hidden");
        }
        if (authError) {
            authError.textContent = "";
            authError.classList.add("hidden");
        }
    }

    function updateAccountUI(user) {
        if (!accountInitial) return;
        if (user) {
            const initial = user.displayName?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || "U";
            accountInitial.textContent = initial;
            if (accountClone) {
                accountClone.textContent = initial;
            }
            accountInitial.classList.remove("bg-slate-200", "text-slate-500");
            accountInitial.classList.add("bg-emerald-500", "text-white");
            authButton?.setAttribute("aria-expanded", "true");
        } else {
            accountInitial.textContent = "";
            if (accountClone) {
                accountClone.textContent = "SC";
            }
            accountInitial.classList.remove("bg-emerald-500", "text-white");
            accountInitial.classList.add("bg-slate-200", "text-slate-500");
            authButton?.setAttribute("aria-expanded", "false");
        }
        if (accountDropdown) {
            accountDropdown.classList.add("hidden");
        }
    }

    function toggleDropdown() {
        if (!accountDropdown) return;
        accountDropdown.classList.toggle("hidden");
    }

    if (cartButton) {
        cartButton.addEventListener("click", (event) => {
            event.preventDefault();
            if (!loadCart().length) {
                hideCartPreview();
                cartButton.blur();
                return;
            }
            toggleCartPreview();
        });
    }

    if (cartPreview) {
        cartPreview.addEventListener("click", (event) => {
            if (event.target.matches(closeCartPreviewSelector) || event.target.closest(closeCartPreviewSelector)) {
                hideCartPreview();
            }
        });
        document.addEventListener("click", (event) => {
            if (!cartPreview.contains(event.target) && event.target !== cartButton) {
                hideCartPreview();
            }
        });
    }

    if (openCartLink) {
        openCartLink.addEventListener("click", () => {
            hideCartPreview();
        });
    }

    if (authButton) {
        authButton.addEventListener("click", (event) => {
            event.preventDefault();
            if (!auth.currentUser) {
                openAuthModal("signIn");
            } else {
                toggleDropdown();
            }
        });
    }

    document.querySelectorAll(toggleAuthModeSelector).forEach((link) => {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            openAuthModal(link.dataset.authMode === "signUp" ? "signUp" : "signIn");
        });
    });

    document.querySelectorAll(authCloseSelector).forEach((button) => {
        button.addEventListener("click", () => {
            closeAuthModal();
        });
    });

    if (authBackdrop) {
        authBackdrop.addEventListener("click", closeAuthModal);
    }

    if (authForm) {
        authForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const formData = new FormData(authForm);
            const email = formData.get("email");
            const password = formData.get("password");
            const displayName = formData.get("displayName");
            try {
                if (currentAuthMode === "signIn") {
                    await signInWithEmailAndPassword(auth, email, password);
                } else {
                    const { user } = await createUserWithEmailAndPassword(auth, email, password);
                    if (displayName) {
                        await updateProfile(user, { displayName });
                    }
                }
                closeAuthModal();
            } catch (error) {
                if (authError) {
                    authError.textContent = error.message;
                    authError.classList.remove("hidden");
                }
            }
        });
    }

    const googleButton = authModal?.querySelector("[data-google-signin]");
    if (googleButton) {
        googleButton.addEventListener("click", async () => {
            try {
                await signInWithPopup(auth, googleProvider);
                closeAuthModal();
            } catch (error) {
                if (authError) {
                    authError.textContent = error.message;
                    authError.classList.remove("hidden");
                }
            }
        });
    }

    const signOutButton = accountDropdown?.querySelector("[data-sign-out]");
    if (signOutButton) {
        signOutButton.addEventListener("click", async (event) => {
            event.preventDefault();
            await signOut(auth);
            clearCart();
            hideCartPreview();
        });
    }

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener("click", async (event) => {
            event.preventDefault();
            if (!authForm) return;
            const emailInput = authForm.querySelector("input[name=email]");
            const email = emailInput?.value;
            if (!email) {
                if (authError) {
                    authError.textContent = "Enter your email to reset your password.";
                    authError.classList.remove("hidden");
                }
                return;
            }
            try {
                await sendPasswordResetEmail(auth, email);
                if (authError) {
                    authError.textContent = "Password reset email sent.";
                    authError.classList.remove("hidden");
                }
            } catch (error) {
                if (authError) {
                    authError.textContent = error.message;
                    authError.classList.remove("hidden");
                }
            }
        });
    }

    onAuthStateChanged(auth, (user) => {
        updateAccountUI(user);
        const emailLabel = accountDropdown?.querySelector("[data-account-email]");
        if (emailLabel) {
            emailLabel.textContent = user?.email || "";
            emailLabel.classList.toggle("hidden", !user?.email);
        }
        const nameLabel = accountDropdown?.querySelector("[data-account-name]");
        if (nameLabel) {
            nameLabel.textContent = user?.displayName || "SecondHandCell buyer";
        }
        document.dispatchEvent(new CustomEvent("wholesale-auth-changed", { detail: { user } }));
    });

    document.addEventListener("wholesale-require-auth", () => {
        openAuthModal("signIn");
    });

    window.addEventListener("storage", (event) => {
        if (event.key === STORAGE_KEYS.cart) {
            updateCartPreview();
        }
    });

    window.addEventListener("wholesale-cart-updated", updateCartPreview);

    updateCartPreview();
}

export function requireAuthOrPrompt() {
    if (!auth.currentUser) {
        const event = new CustomEvent("wholesale-require-auth");
        document.dispatchEvent(event);
        return false;
    }
    return true;
}

export { auth };
