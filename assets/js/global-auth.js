import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirebaseApp } from "./firebase-app.js";

const INIT_FLAG = "__shcAuthInitialized";
if (!window[INIT_FLAG]) {
  window[INIT_FLAG] = true;

  const auth = getAuth(getFirebaseApp());
  setPersistence(auth, browserLocalPersistence).catch(() => {});

  const ensureStyle = () => {
    const styleId = "shc-auth-styles";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
    .shc-auth-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: none; align-items: center; justify-content: center; padding: 18px; z-index: 2000; overflow-y: auto; }
    .shc-auth-modal.is-visible { display: flex; }
    .shc-auth-card { width: min(520px, 100%); background: #fff; border-radius: 20px; box-shadow: 0 30px 80px -40px rgba(15,23,42,0.6); padding: 28px; position: relative; }
    .shc-auth-close { position: absolute; top: 12px; right: 12px; background: transparent; border: none; color: #94a3b8; font-size: 22px; cursor: pointer; }
    .shc-auth-tabs { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; margin: 16px 0 12px; }
    .shc-auth-tab { padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700; color: #475569; cursor: pointer; }
    .shc-auth-tab.is-active { border-color: #5b21b6; color: #111827; box-shadow: 0 5px 18px -12px rgba(91,33,182,0.6); }
    .shc-auth-field { width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 12px; font-size: 15px; }
    .shc-auth-primary { width: 100%; padding: 13px 16px; border-radius: 14px; border: none; background: linear-gradient(120deg,#5b21b6,#2563eb); color: #fff; font-weight: 800; cursor: pointer; box-shadow: 0 20px 40px -28px rgba(37,99,235,0.9); }
    .shc-auth-google { width: 100%; padding: 12px 16px; border-radius: 14px; border: 1px solid #e2e8f0; background: #fff; display: inline-flex; align-items: center; justify-content: center; gap: 10px; font-weight: 700; color: #0f172a; cursor: pointer; }
    .shc-auth-or { display: flex; align-items: center; gap: 10px; margin: 14px 0; color: #94a3b8; font-size: 14px; }
    .shc-auth-or::before, .shc-auth-or::after { content: ""; flex: 1; height: 1px; background: #e2e8f0; }
    .shc-auth-meta { text-align: center; font-size: 14px; color: #475569; margin-top: 10px; }
    .shc-auth-link { color: #2563eb; font-weight: 700; text-decoration: none; }
    .shc-auth-link:hover { text-decoration: underline; }
    .shc-auth-message { display: none; margin-top: 8px; padding: 10px 12px; border-radius: 12px; font-weight: 600; font-size: 14px; }
    .shc-auth-message.is-visible { display: block; }
    .shc-auth-message.is-error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecdd3; }
    .shc-auth-message.is-success { background: #ecfdf3; color: #15803d; border: 1px solid #bbf7d0; }
    .shc-auth-google img { width: 18px; height: 18px; }
    .shc-auth-header { text-align: center; }
    .shc-auth-title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
    .shc-auth-subtitle { margin: 6px 0 0; color: #475569; font-weight: 500; }
    .shc-auth-form { display: none; }
    .shc-auth-form.is-visible { display: block; }
    .shc-monogram { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg,#5b21b6,#2563eb); color: #fff; font-weight: 800; cursor: pointer; box-shadow: 0 14px 30px -18px rgba(37,99,235,0.9); }
    .shc-auth-dropdown { position: absolute; top: calc(100% + 8px); right: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 30px 80px -48px rgba(15,23,42,0.55); padding: 10px; min-width: 180px; display: none; z-index: 1200; }
    .shc-auth-dropdown.is-visible { display: block; }
    .shc-auth-dropdown a, .shc-auth-dropdown button { width: 100%; display: block; text-align: left; padding: 10px 12px; border-radius: 10px; color: #0f172a; font-weight: 600; border: none; background: transparent; cursor: pointer; }
    .shc-auth-dropdown a:hover, .shc-auth-dropdown button:hover { background: #f1f5f9; }
  `;
    document.head.appendChild(style);
  };

  const createModal = () => {
    if (document.getElementById("loginModal")) return document.getElementById("loginModal");

    ensureStyle();
    const overlay = document.createElement("div");
    overlay.id = "loginModal";
    overlay.className = "shc-auth-modal";
    overlay.style.display = "none";
  overlay.innerHTML = `
    <div class="shc-auth-card" role="dialog" aria-modal="true" aria-labelledby="shc-auth-title">
      <button class="shc-auth-close" type="button" aria-label="Close authentication modal">&times;</button>
      <div class="shc-auth-header">
        <p class="shc-auth-title" id="shc-auth-title">Your SecondHandCell Account</p>
        <p class="shc-auth-subtitle">Sign in or create an account to keep your quote in sync.</p>
      </div>
      <div class="shc-auth-tabs" role="tablist">
        <button class="shc-auth-tab is-active" id="loginTabBtn" type="button" data-tab="login">Login</button>
        <button class="shc-auth-tab" id="signupTabBtn" type="button" data-tab="signup">Sign Up</button>
      </div>
      <div id="authMessage" class="shc-auth-message" role="alert"></div>
      <form id="loginForm" class="shc-auth-form is-visible" novalidate>
        <button type="button" id="googleLoginBtn" class="shc-auth-google"><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google icon"/>Login with Google</button>
        <div class="shc-auth-or"><span>or</span></div>
        <input type="email" id="loginEmail" class="shc-auth-field" placeholder="Email address" autocomplete="email" required />
        <input type="password" id="loginPassword" class="shc-auth-field" placeholder="Password" autocomplete="current-password" required />
        <button type="submit" class="shc-auth-primary">Login</button>
        <p class="shc-auth-meta">Forgot your password? <a href="#" id="forgotPasswordLink" class="shc-auth-link">Reset it</a></p>
      </form>
      <form id="signupForm" class="shc-auth-form" novalidate>
        <button type="button" id="googleSignupBtn" class="shc-auth-google"><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google icon"/>Sign up with Google</button>
        <div class="shc-auth-or"><span>or</span></div>
        <input type="text" id="signupName" class="shc-auth-field" placeholder="Full name" autocomplete="name" required />
        <input type="email" id="signupEmail" class="shc-auth-field" placeholder="Email address" autocomplete="email" required />
        <input type="password" id="signupPassword" class="shc-auth-field" placeholder="Password (min 6 characters)" autocomplete="new-password" required />
        <button type="submit" class="shc-auth-primary">Create Account</button>
        <p class="shc-auth-meta">Already have an account? <a href="#" id="switchToLogin" class="shc-auth-link">Login</a></p>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
    return overlay;
  };

  const getInitial = (user) => {
    if (!user) return "";
    if (user.displayName && user.displayName.trim()) return user.displayName.trim().charAt(0).toUpperCase();
    if (user.email && user.email.trim()) return user.email.trim().charAt(0).toUpperCase();
    return "U";
  };

  const toggleModal = (modal, isVisible) => {
    if (!modal) return;
    modal.style.display = isVisible ? "flex" : "none";
    modal.classList.toggle("is-visible", isVisible);
  };

  const showMessage = (messageEl, message, isError = false) => {
    if (!messageEl) return;
    messageEl.textContent = message;
    messageEl.classList.add("is-visible");
    messageEl.classList.toggle("is-error", isError);
    messageEl.classList.toggle("is-success", !isError);
  };

  const clearMessage = (messageEl) => {
    if (!messageEl) return;
    messageEl.textContent = "";
    messageEl.classList.remove("is-visible", "is-error", "is-success");
  };

  const setActiveTab = (tab) => {
    const loginTabBtn = document.getElementById("loginTabBtn");
    const signupTabBtn = document.getElementById("signupTabBtn");
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    if (!loginTabBtn || !signupTabBtn || !loginForm || !signupForm) return;

    const isLogin = tab === "login";
    loginTabBtn.classList.toggle("is-active", isLogin);
    signupTabBtn.classList.toggle("is-active", !isLogin);
    loginForm.classList.toggle("is-visible", isLogin);
    signupForm.classList.toggle("is-visible", !isLogin);
  };

  const bindAuthUi = () => {
    const modal = createModal();
    toggleModal(modal, false);
    const loginNavBtn = document.getElementById("loginNavBtn");
    const userMonogram = document.getElementById("userMonogram");
    const authDropdown = document.getElementById("authDropdown");
    const logoutBtn = document.getElementById("logoutBtn");
    const authMessage = document.getElementById("authMessage");
    const closeBtn = modal.querySelector(".shc-auth-close");
    const signupSwitch = document.getElementById("switchToLogin");
    const forgotPassword = document.getElementById("forgotPasswordLink");
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const googleLoginBtn = document.getElementById("googleLoginBtn");
    const googleSignupBtn = document.getElementById("googleSignupBtn");

    const provider = new GoogleAuthProvider();

    const updateUiForUser = (user) => {
      if (loginNavBtn) {
        loginNavBtn.textContent = user ? "My Account" : "Login/Sign Up";
        loginNavBtn.classList.toggle("hidden", !!user);
      }
      if (userMonogram) {
        userMonogram.textContent = getInitial(user);
        userMonogram.classList.toggle("hidden", !user);
      }
      if (authDropdown) {
        authDropdown.classList.add("shc-auth-dropdown");
        authDropdown.classList.remove("is-visible"); // Always ensure dropdown is closed
        authDropdown.classList.remove("hidden"); // Remove the hidden class that has !important
        if (user) {
          // Don't add any visibility classes - dropdown should only show when clicked
        } else {
          // Keep it hidden via CSS when no user
          authDropdown.style.display = 'none';
        }
      }
      if (!user && modal) toggleModal(modal, false);
      if (user) {
        localStorage.setItem("shcAuthUser", JSON.stringify({ uid: user.uid, email: user.email, name: user.displayName || "" }));
      } else {
        localStorage.removeItem("shcAuthUser");
      }
    };

    onAuthStateChanged(auth, (user) => updateUiForUser(user));

    const attachDropdown = () => {
      if (!userMonogram || !authDropdown) return;
      userMonogram.classList.add("shc-monogram");
      
      // Ensure dropdown starts hidden
      authDropdown.classList.remove("is-visible");
      
      userMonogram.addEventListener("click", (e) => {
        e.stopPropagation();
        const isCurrentlyVisible = authDropdown.classList.contains("is-visible");
        authDropdown.classList.toggle("is-visible", !isCurrentlyVisible);
      });
      document.addEventListener("click", (e) => {
        if (!authDropdown.contains(e.target) && e.target !== userMonogram) {
          authDropdown.classList.remove("is-visible");
        }
      });
    };
    attachDropdown();

    const openLogin = () => {
      clearMessage(authMessage);
      setActiveTab("login");
      toggleModal(modal, true);
    };

    const openSignup = () => {
      clearMessage(authMessage);
      setActiveTab("signup");
      toggleModal(modal, true);
    };

    if (loginNavBtn) {
      loginNavBtn.addEventListener("click", (e) => {
        e.preventDefault();
        openLogin();
      });
    }

    closeBtn?.addEventListener("click", () => toggleModal(modal, false));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) toggleModal(modal, false);
    });

    document.getElementById("loginTabBtn")?.addEventListener("click", () => openLogin());
    document.getElementById("signupTabBtn")?.addEventListener("click", () => openSignup());
    signupSwitch?.addEventListener("click", (e) => {
      e.preventDefault();
      openLogin();
    });

    const handleAuthError = (error) => {
      const friendly = error?.message || "Something went wrong. Please try again.";
      showMessage(authMessage, friendly, true);
    };

    loginForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearMessage(authMessage);
      const email = document.getElementById("loginEmail")?.value?.trim();
      const password = document.getElementById("loginPassword")?.value;
      if (!email || !password) {
        showMessage(authMessage, "Please enter your email and password.", true);
        return;
      }
      try {
        await signInWithEmailAndPassword(auth, email, password);
        showMessage(authMessage, "Welcome back!", false);
        setTimeout(() => toggleModal(modal, false), 600);
      } catch (error) {
        handleAuthError(error);
      }
    });

    signupForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearMessage(authMessage);
      const name = document.getElementById("signupName")?.value?.trim();
      const email = document.getElementById("signupEmail")?.value?.trim();
      const password = document.getElementById("signupPassword")?.value;
      if (!name || !email || !password) {
        showMessage(authMessage, "Please complete all fields to sign up.", true);
        return;
      }
      try {
        const credentials = await createUserWithEmailAndPassword(auth, email, password);
        if (credentials.user && name) {
          await updateProfile(credentials.user, { displayName: name });
        }
        showMessage(authMessage, "Account created! Redirecting...", false);
        setTimeout(() => toggleModal(modal, false), 700);
      } catch (error) {
        handleAuthError(error);
      }
    });

    forgotPassword?.addEventListener("click", async (e) => {
      e.preventDefault();
      clearMessage(authMessage);
      const email = document.getElementById("loginEmail")?.value?.trim();
      if (!email) {
        showMessage(authMessage, "Enter your email above to reset your password.", true);
        return;
      }
      try {
        await sendPasswordResetEmail(auth, email);
        showMessage(authMessage, "Password reset sent. Check your inbox.", false);
      } catch (error) {
        handleAuthError(error);
      }
    });

    const handleGoogle = async () => {
      clearMessage(authMessage);
      try {
        await signInWithPopup(auth, provider);
        showMessage(authMessage, "Signed in with Google!", false);
        setTimeout(() => toggleModal(modal, false), 600);
      } catch (error) {
        handleAuthError(error);
      }
    };

    googleLoginBtn?.addEventListener("click", handleGoogle);
    googleSignupBtn?.addEventListener("click", handleGoogle);

    logoutBtn?.addEventListener("click", async () => {
      try {
        await signOut(auth);
        toggleModal(modal, false);
        if (authDropdown) authDropdown.classList.remove("is-visible");
      } catch (error) {
        handleAuthError(error);
      }
    });

    // Close dropdown when clicking any link/button inside it
    authDropdown?.addEventListener("click", (e) => {
      if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') {
        authDropdown.classList.remove("is-visible");
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindAuthUi);
  } else {
    bindAuthUi();
  }

} // End of INIT_FLAG check