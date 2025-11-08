import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const app = firebaseApp;
const auth = getAuth(app);
const db = getFirestore(app);
window.firebaseAuth = auth;
window.GoogleAuthProvider = GoogleAuthProvider;
window.signInWithPopup = signInWithPopup;
window.signInWithEmailAndPassword = signInWithEmailAndPassword;
window.createUserWithEmailAndPassword = createUserWithEmailAndPassword;
window.signOut = signOut;
window.onAuthStateChanged = onAuthStateChanged;
window.updateProfile = updateProfile;
window.sendPasswordResetEmail = sendPasswordResetEmail;
window.firebaseDb = db;
window.firebaseServerTimestamp = serverTimestamp;
document.addEventListener('DOMContentLoaded', () => {
            const form = document.getElementById('templateForm');
            const generateBtn = document.getElementById('generateBtn');
            const outputContainer = document.getElementById('outputContainer');
            const outputHtml = document.getElementById('outputHtml');
            const copyBtn = document.getElementById('copyBtn');
            const copyMessage = document.getElementById('copyMessage');

            generateBtn.addEventListener('click', () => {
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return;
                }

                const company = document.getElementById('company').value;
                const model = document.getElementById('model').value;
                const image = document.getElementById('image').value;
                const carrierDeduction = parseInt(document.getElementById('carrierLockedDeduction').value);
                const noPowerDeduction = parseInt(document.getElementById('noPowerDeduction').value) / 100;
                const notFunctionalDeduction = parseInt(document.getElementById('notFunctionalDeduction').value) / 100;

                const prices = {
                    '128GB': parseInt(document.getElementById('price1').value),
                    '256GB': parseInt(document.getElementById('price2').value),
                    '512GB': parseInt(document.getElementById('price3').value),
                    '1TB': parseInt(document.getElementById('price4').value),
                };
                
                const cosmeticDeductions = {
                    'flawless': parseInt(document.getElementById('flawlessDeduction').value),
                    'good': parseInt(document.getElementById('goodDeduction').value),
                    'fair': parseInt(document.getElementById('fairDeduction').value),
                    'damaged': parseInt(document.getElementById('damagedDeduction').value),
                };

                const formattedHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>secondhandcell - Sell ${model}</title>
    <script src="https://cdn.tailwindcss.com">document.addEventListener('DOMContentLoaded', function() {
            const auth = window.firebaseAuth;
            const GoogleAuthProvider = window.GoogleAuthProvider;
            const signInWithPopup = window.signInWithPopup;
            const signInWithEmailAndPassword = window.signInWithEmailAndPassword;
            const createUserWithEmailAndPassword = window.createUserWithEmailAndPassword;
            const signOut = window.signOut;
            const onAuthStateChanged = window.onAuthStateChanged;
            const updateProfile = window.updateProfile;
            const sendPasswordResetEmail = window.sendPasswordResetEmail;
            const db = window.firebaseDb;
            const serverTimestamp = window.firebaseServerTimestamp;

            const getQuoteBtn = document.getElementById('getQuoteBtn');
            const quoteMessage = document.getElementById('quoteMessage');
            const nextSteps = document.getElementById('nextSteps');
            const finalQuoteAmountMain = document.getElementById('mainQuoteDisplay');
            const finalQuoteAmountMainText = document.getElementById('finalQuoteAmountMain');
            const finalQuoteAmountPopup = document.getElementById('finalQuoteAmountPopup');
            const paymentAndShipping = document.getElementById('paymentAndShipping');
            const venmoFields = document.getElementById('venmoFields');
            const zelleFields = document.getElementById('zelleFields');
            const paypalFields = document.getElementById('paypalFields');
            const shippingOptions = document.getElementById('shippingOptions');
            const overviewShippingPreference = document.getElementById('overviewShippingPreference');
            const orderOverview = document.getElementById('orderOverview');
            const overviewQuote = document.getElementById('overviewQuote');
            const overviewPayment = document.getElementById('overviewPayment');
            const overviewAddress = document.getElementById('overviewAddress');
            const sendPhoneBtn = document.getElementById('sendPhoneBtn');
            const loginModal = document.getElementById('loginModal');
            const closeModalBtn = document.getElementById('closeModalBtn');
            const loginTabBtn = document.getElementById('loginTabBtn');
            const signupTabBtn = document.getElementById('signupTabBtn');
            const loginNavBtn = document.getElementById('loginNavBtn');
            const quoteModal = document.getElementById('quoteModal');
            const quoteModalContinueBtn = document.getElementById('quoteModalContinueBtn');
            const authStatusContainer = document.getElementById('authStatusContainer');
            const userMonogram = document.getElementById('userMonogram');
            const authDropdown = document.getElementById('authDropdown');
            const logoutBtn = document.getElementById('logoutBtn');
            const functionalDetails = document.getElementById('functionalDetails');
            const cosmeticConditionDescription = document.getElementById('cosmeticConditionDescription');
            const googleLoginBtn = document.getElementById('googleLoginBtn');
            const emailLoginBtn = document.getElementById('emailLoginBtn');
            const loginEmailInput = document.getElementById('loginEmail');
            const loginPasswordInput = document.getElementById('loginPassword');
            const googleSignupBtn = document.getElementById('googleSignupBtn');
            const emailSignupBtn = document.getElementById('emailSignupBtn');
            const signupNameInput = document.getElementById('signupName');
            const signupEmailInput = document.getElementById('signupEmail');
            const signupPasswordInput = document.getElementById('signupPassword');
            const signupPhoneInput = document.getElementById('signupPhone');
            const authMessage = document.getElementById('authMessage');
            const loginForm = document.getElementById('loginForm');
            const signupForm = document.getElementById('signupForm');
            const switchToLogin = document.getElementById('switchToLogin');
            const forgotPasswordLink = document.getElementById('forgotPasswordLink');
            const forgotPasswordForm = document.getElementById('forgotPasswordForm');
            const forgotEmailInput = document.getElementById('forgotEmail');
            const sendResetEmailBtn = document.getElementById('sendResetEmailBtn');
            const returnToLoginLink = document.getElementById('returnToLogin');
            const shippingInfoEmailInput = document.getElementById('email');
            
            let isUserLoggedIn = false;
            let currentUserId = null;
            let finalQuote = 0;

            function getRandomLightColor() {
                const hue = Math.floor(Math.random() * 360);
                const saturation = Math.floor(Math.random() * 30) + 70;
                const lightness = Math.floor(Math.random() * 20) + 70;
                return 'hsl(' + hue + ', ' + saturation + '%, ' + lightness + '%)';
            }

            onAuthStateChanged(auth, (user) => {
                if (user) {
                    isUserLoggedIn = true;
                    currentUserId = user.uid;
                    loginNavBtn.classList.add('hidden');
                    userMonogram.classList.remove('hidden');

                    const displayName = user.displayName;
                    const email = user.email;
                    let initials = '';

                    if (displayName) {
                        initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                    } else if (email) {
                        const username = email.split('@')[0];
                        const nameParts = username.split('.');
                        initials = nameParts.map(part => part.charAt(0)).join('').toUpperCase().substring(0, 2);
                    }

                    userMonogram.textContent = initials;
                    userMonogram.style.backgroundColor = getRandomLightColor();

                    hideLoginModal();

                    if (shippingInfoEmailInput && user.email) {
                        shippingInfoEmailInput.value = user.email;
                    }

                    if (finalQuote > 0 && nextSteps.classList.contains('hidden')) {
                        nextSteps.classList.remove('hidden');
                        paymentAndShipping.classList.remove('hidden');
                        updateOverview();
                    }
                } else {
                    isUserLoggedIn = false;
                    currentUserId = null;
                    loginNavBtn.classList.remove('hidden');
                    loginNavBtn.textContent = 'Login/Sign Up';
                    userMonogram.classList.add('hidden');
                    userMonogram.textContent = '';
                    authDropdown.classList.add('hidden');

                    if (shippingInfoEmailInput) {
                        shippingInfoEmailInput.value = '';
                    }
                }
            });
            userMonogram.addEventListener('click', (e) => {
                e.stopPropagation();
                authDropdown.classList.toggle('hidden');
            });

            document.addEventListener('click', (e) => {
                if (!authStatusContainer.contains(e.target)) {
                    authDropdown.classList.add('hidden');
                }
            });

            logoutBtn.addEventListener('click', async () => {
                try {
                    await signOut(auth);
                } catch (error) {
                    console.error("Logout error:", error);
                }
            });

            const BACKEND_URL = 'https://us-central1-buyback-a0f05.cloudfunctions.net/api';

            function showAuthMessage(msg, type) {
                authMessage.textContent = msg;
                authMessage.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-blue-100', 'text-blue-700');
                if (type === 'error') {
                    authMessage.classList.add('bg-red-100', 'text-red-700');
                } else if (type === 'success') {
                    authMessage.classList.add('bg-green-100', 'text-green-700');
                } else if (type === 'info') {
                    authMessage.classList.add('bg-blue-100', 'text-blue-700');
                }
                authMessage.classList.remove('hidden');
            }

            function clearAuthMessage() {
                authMessage.classList.add('hidden');
                authMessage.textContent = '';
            }

            function showLoginModal() {
                loginModal.classList.add('is-visible');
                clearAuthMessage();
                showTab('login');
            }

            function hideLoginModal() {
                loginModal.classList.remove('is-visible');
            }

            function showTab(tabName) {
                clearAuthMessage();
                loginTabBtn.classList.remove('border-indigo-600', 'text-indigo-600');
                signupTabBtn.classList.remove('border-indigo-600', 'text-indigo-600');
                loginTabBtn.classList.add('border-transparent', 'text-slate-500');
                signupTabBtn.classList.add('border-transparent', 'text-slate-500');
                loginTabBtn.classList.remove('hidden');
                signupTabBtn.classList.remove('hidden');

                if (tabName === 'login') {
                    loginForm.classList.remove('hidden');
                    signupForm.classList.add('hidden');
                    forgotPasswordForm.classList.add('hidden');
                    loginTabBtn.classList.add('border-indigo-600', 'text-indigo-600');
                } else if (tabName === 'signup') {
                    signupForm.classList.remove('hidden');
                    loginForm.classList.add('hidden');
                    forgotPasswordForm.classList.add('hidden');
                    signupTabBtn.classList.add('border-indigo-600', 'text-indigo-600');
                } else if (tabName === 'forgotPassword') {
                    forgotPasswordForm.classList.remove('hidden');
                    loginForm.classList.add('hidden');
                    signupForm.classList.add('hidden');
                    loginTabBtn.classList.add('hidden');
                    signupTabBtn.classList.add('hidden');
                }
            }

            function showQuotePopup() {
                quoteModal.classList.add('is-visible');
            }

            function hideQuotePopup() {
                quoteModal.classList.remove('is-visible');
            }

            closeModalBtn.addEventListener('click', hideLoginModal);
            loginModal.addEventListener('click', (e) => {
                if (e.target.id === 'loginModal') {
                    hideLoginModal();
                }
            });
            loginTabBtn.addEventListener('click', () => {
                showTab('login');
            });
            signupTabBtn.addEventListener('click', () => {
                showTab('signup');
            });
            loginNavBtn.addEventListener('click', (e) => {
                e.preventDefault();
                showLoginModal();
            });
            switchToLogin.addEventListener('click', (e) => {
                e.preventDefault();
                showTab('login');
            });
            returnToLoginLink.addEventListener('click', (e) => {
                e.preventDefault();
                showTab('login');
            });
            
            forgotPasswordLink.addEventListener('click', (e) => {
                e.preventDefault();
                showTab('forgotPassword');
            });

            forgotPasswordForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = forgotEmailInput.value;
                if (!email) {
                    showAuthMessage('Please enter your email address.', 'error');
                    return;
                }
                
                try {
                    clearAuthMessage();
                    showAuthMessage('Sending password reset email...', 'info');
                    await sendPasswordResetEmail(auth, email);
                    showAuthMessage('A password reset link has been sent to your email. Check your inbox and spam folder.', 'success');
                    forgotEmailInput.value = '';
                } catch (error) {
                    console.error("Password reset error:", error);
                    showAuthMessage('Password reset failed: ' + error.message, 'error');
                }
            });


            quoteModalContinueBtn.addEventListener('click', () => {
                hideQuotePopup();
                finalQuoteAmountMain.classList.remove('hidden');
                if (isUserLoggedIn) {
                    nextSteps.classList.remove('hidden');
                    paymentAndShipping.classList.remove('hidden');
                    updateOverview();
                } else {
                    showLoginModal();
                }
            });


            // --- Firebase Authentication Logic --- 

            const googleProvider = new GoogleAuthProvider();

            googleLoginBtn.addEventListener('click', async () => {
                try {
                    clearAuthMessage();
                    showAuthMessage('Signing in with Google...', 'info');
                    await signInWithPopup(auth, googleProvider);
                } catch (error) {
                    console.error("Google login error:", error);
                    showAuthMessage('Google login failed: ' + error.message, 'error');
                }
            });

            googleSignupBtn.addEventListener('click', async () => {
                try {
                    clearAuthMessage();
                    showAuthMessage('Signing up with Google...', 'info');
                    await signInWithPopup(auth, googleProvider);
                } catch (error) {
                    console.error("Google signup error:", error);
                    showAuthMessage('Google signup failed: ' + error.message, 'error');
                }
            });

            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = loginEmailInput.value;
                const password = loginPasswordInput.value;
                if (!email || !password) {
                    showAuthMessage('Please enter both email and password.', 'error');
                    return;
                }
                try {
                    clearAuthMessage();
                    showAuthMessage('Logging in...', 'info');
                    await signInWithEmailAndPassword(auth, email, password);
                } catch (error) {
                    console.error("Email login error:", error);
                    showAuthMessage('Login failed: ' + error.message, 'error');
                }
            });

            signupForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = signupNameInput.value;
                const email = signupEmailInput.value;
                const password = signupPasswordInput.value;
                const phone = signupPhoneInput.value;

                if (!name || !email || !password) {
                    showAuthMessage('Please enter your name, email, and password.', 'error');
                    return;
                }
                if (password.length < 6) {
                    showAuthMessage('Password should be at least 6 characters.', 'error');
                    return;
                }

                try {
                    clearAuthMessage();
                    showAuthMessage('Creating account...', 'info');
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    await updateProfile(userCredential.user, {
                        displayName: name
                    });
                    showAuthMessage('Account created successfully! You are now logged in.', 'success');
                } catch (error) {
                    console.error("Email signup error:", error);
                    showAuthMessage('Sign up failed: ' + error.message, 'error');
                }
            });


            function showQuoteMessage(msg, type) {
                quoteMessage.textContent = msg;
                quoteMessage.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-blue-100', 'text-blue-700');
                if (type === 'error') {
                    quoteMessage.classList.add('bg-red-100', 'text-red-700');
                } else if (type === 'success') {
                    quoteMessage.classList.add('bg-green-100', 'text-green-700');
                } else if (type === 'info') {
                    quoteMessage.classList.add('bg-blue-100', 'text-blue-700');
                }
                quoteMessage.classList.remove('hidden');
            }

            function clearQuoteMessage() {
                quoteMessage.classList.add('hidden');
                quoteMessage.textContent = '';
            }

            function clearHighlights() {
                document.querySelectorAll('.highlight-missing').forEach(el => {
                    el.classList.remove('highlight-missing');
                });
                document.querySelectorAll('.carrier-option label, .payment-option label, .shipping-option label').forEach(label => {
                    label.classList.remove('highlight-missing');
                });
                document.querySelectorAll('.custom-checkbox .checkmark').forEach(checkmark => {
                    checkmark.classList.remove('highlight-missing');
                });
            }

            function getFirstMissingRadioGroup(groupName, sectionId) {
                if (!document.querySelector('input[name="' + groupName + '"]:checked')) {
                    return document.getElementById(sectionId);
                }
                return null;
            }

            const cosmeticDescriptions = {
                'flawless': 'Looks new with no signs of use. This is the best condition a used device can be in. There are no scratches, scuffs, or any other cosmetic imperfections visible to the naked eye. The device appears as if it just came out of its original packaging, offering a pristine aesthetic and feel.',
                'good': 'There may be a few light scuffs or scratches that are smaller than the size of a pencil eraser. These minor imperfections are typically on the casing or screen, but do not affect the device\\'s functionality or overall aesthetic significantly. They are generally only noticeable upon close inspection and do not detract from the device\\'s premium feel.',
                'fair': 'There are noticeable scratches or scuffs on the front and back. These could include multiple visible scratches, minor dents, or paint chips on the frame or back glass. While these cosmetic issues are more prominent, they do not impede the device\\'s core functions, and the screen remains fully usable despite the marks.',
                'damaged': 'Major cosmetic damage includes being bent, chipped, dented, or sunbleached. This category also covers devices with significant wear and tear, deep scratches, or other substantial visual defects that clearly impact the device\\'s appearance. These issues are immediately apparent and go beyond normal wear, affecting the overall integrity and look of the device.'
            };

            document.querySelectorAll('input[name="q4_cosmetic_condition"]').forEach(radio => {
                radio.addEventListener('change', (event) => {
                    const selectedCondition = event.target.value;
                    const description = cosmeticDescriptions[selectedCondition];
                    if (description) {
                        cosmeticConditionDescription.textContent = description;
                        cosmeticConditionDescription.classList.remove('hidden');
                    } else {
                        cosmeticConditionDescription.classList.add('hidden');
                        cosmeticConditionDescription.textContent = '';
                    }
                });
            });

            getQuoteBtn.addEventListener('click', () => {
                clearQuoteMessage();
                clearHighlights();
                nextSteps.classList.add('hidden');
                paymentAndShipping.classList.add('hidden');
                finalQuoteAmountMain.classList.add('hidden');

                const selectedCarrier = document.querySelector('input[name="carrier"]:checked');
                const selectedStorage = document.getElementById('storage');
                const q1PowerOn = document.querySelector('input[name="q1_power_on"]:checked');
                const q2Functional = document.querySelector('input[name="q2_fully_functional"]:checked');
                const q4Cosmetic = document.querySelector('input[name="q4_cosmetic_condition"]:checked');

                let firstMissingElement = null;

                if (!selectedCarrier) {
                    document.getElementById('carrierOptions').classList.add('highlight-missing');
                    if (!firstMissingElement) firstMissingElement = document.getElementById('carrierSection');
                }
                if (selectedStorage.value === '') {
                    selectedStorage.classList.add('highlight-missing');
                    if (!firstMissingElement) firstMissingElement = selectedStorage;
                }
                if (!q1PowerOn) {
                    document.getElementById('q1Options').classList.add('highlight-missing');
                    if (!firstMissingElement) firstMissingElement = document.getElementById('powerOnSection');
                }
                if (!q2Functional) {
                    document.getElementById('q2Options').classList.add('highlight-missing');
                    if (!firstMissingElement) firstMissingElement = document.getElementById('functionalSection');
                }
                if (!q4Cosmetic) {
                    document.getElementById('q4Options').classList.add('highlight-missing');
                    if (!firstMissingElement) firstMissingElement = document.getElementById('cosmeticSection');
                }

                if (firstMissingElement) {
                    showQuoteMessage('Please answer all questions to get an accurate quote.', 'error');
                    firstMissingElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return;
                }

                let currentQuote = 0;
                const prices = {
                    '128GB': ${prices['128GB']},
                    '256GB': ${prices['256GB']},
                    '512GB': ${prices['512GB']},
                    '1TB': ${prices['1TB']},
                };
                currentQuote = prices[selectedStorage.value];

                if (selectedCarrier.value !== 'Unlocked') { currentQuote -= ${carrierDeduction}; }
                if (q1PowerOn.value === 'no') { currentQuote *= (1 - ${noPowerDeduction}); }
                if (q2Functional.value === 'no') { currentQuote *= (1 - ${notFunctionalDeduction}); }
                switch (q4Cosmetic.value) {
                    case 'damaged': currentQuote -= ${cosmeticDeductions.damaged}; break;
                    case 'fair': currentQuote -= ${cosmeticDeductions.fair}; break;
                    case 'good': currentQuote -= ${cosmeticDeductions.good}; break;
                    case 'flawless': currentQuote -= ${cosmeticDeductions.flawless}; break;
                }

                finalQuote = Math.max(0, currentQuote);
                finalQuoteAmountMainText.textContent = '$' + finalQuote.toFixed(2);
                finalQuoteAmountPopup.textContent = '$' + finalQuote.toFixed(2);

                showQuotePopup();
            });

            document.querySelectorAll('input[name="payment_method"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    venmoFields.classList.add('hidden');
                    zelleFields.classList.add('hidden');
                    paypalFields.classList.add('hidden');

                    document.querySelectorAll('.payment-option label').forEach(label => label.classList.remove('highlight-missing'));

                    const selectedMethod = e.target.value;
                    if (selectedMethod === 'venmo') {
                        venmoFields.classList.remove('hidden');
                    } else if (selectedMethod === 'zelle') {
                        zelleFields.classList.remove('hidden');
                    } else if (selectedMethod === 'paypal') {
                        paypalFields.classList.remove('hidden');
                    }
                    updateOverview();
                });
            });

            document.querySelectorAll('input[name="shipping_preference"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    document.querySelectorAll('.shipping-option label').forEach(label => label.classList.remove('highlight-missing'));
                    updateOverview();
                });
            });

            const shippingInputs = document.querySelectorAll('#paymentAndShipping input[type="text"], #paymentAndShipping input[type="email"]');
            shippingInputs.forEach(input => {
                input.addEventListener('input', updateOverview);
            });

            function updateOverview() {
                const selectedPayment = document.querySelector('input[name="payment_method"]:checked')?.value || 'Not Selected';
                const selectedShippingPreference = document.querySelector('input[name="shipping_preference"]:checked')?.value;
                const fullName = document.getElementById('fullName').value;
                const streetAddress = document.getElementById('streetAddress').value;
                const city = document.getElementById('city').value;
                const state = document.getElementById('state').value;
                const zipCode = document.getElementById('zipCode').value;

                overviewQuote.textContent = '$' + finalQuote.toFixed(2);
                overviewPayment.textContent = selectedPayment.charAt(0).toUpperCase() + selectedPayment.slice(1);
                
                let displayShippingPreferenceText = 'Not Selected';
                if (selectedShippingPreference === 'ship_kit') {
                    displayShippingPreferenceText = 'Shipping Kit Requested';
                } else if (selectedShippingPreference === 'email_label') {
                    displayShippingPreferenceText = 'Email Label Requested';
                }
                overviewShippingPreference.textContent = displayShippingPreferenceText;

                const fullAddress = [fullName, streetAddress, city, state, zipCode].filter(Boolean).join(', ');
                overviewAddress.textContent = fullAddress || 'Not Entered';
            }

            sendPhoneBtn.addEventListener('click', async () => {
                clearQuoteMessage();
                clearHighlights();

                const selectedPayment = document.querySelector('input[name="payment_method"]:checked');
                const selectedShippingPreference = document.querySelector('input[name="shipping_preference"]:checked');
                const termsAccepted = document.getElementById('termsAccepted');
                const fullName = document.getElementById('fullName');
                const email = document.getElementById('email');
                const streetAddress = document.getElementById('streetAddress');
                const city = document.getElementById('city');
                const state = document.getElementById('state');
                const zipCode = document.getElementById('zipCode');

                let firstMissingElement = null;

                if (!selectedPayment) {
                    const paymentOptionsContainer = document.getElementById('paymentOptions');
                    if (paymentOptionsContainer) {
                        paymentOptionsContainer.classList.add('highlight-missing');
                        if (!firstMissingElement) firstMissingElement = paymentOptionsContainer;
                    }
                } else {
                    if (selectedPayment.value === 'venmo') {
                        const venmoUsername = document.getElementById('venmoUsername');
                        const venmoUsernameConfirm = document.getElementById('venmoUsernameConfirm');
                        if (!venmoUsername.value) { venmoUsername.classList.add('highlight-missing'); if (!firstMissingElement) firstMissingElement = venmoUsername; }
                        if (!venmoUsernameConfirm.value || venmoUsername.value !== venmoUsernameConfirm.value) { venmoUsernameConfirm.classList.add('highlight-missing'); if (!firstMissingElement) firstMissingElement = venmoUsernameConfirm; }
                    } else if (selectedPayment.value === 'zelle') {
                        const zelleIdentifier = document.getElementById('zelleIdentifier');
                        if (!zelleIdentifier.value) { zelleIdentifier.classList.add('highlight-missing'); if (!firstMissingElement) firstMissingElement = zelleIdentifier; }
                    } else if (selectedPayment.value === 'paypal') {
                        const paypalEmail = document.getElementById('paypalEmail');
                        if (!paypalEmail.value) { paypalEmail.classList.add('highlight-missing'); if (!firstMissingElement) firstMissingElement = paypalEmail; }
                    }
                }

                if (!selectedShippingPreference) {
                    const shippingOptionsContainer = document.getElementById('shippingOptions');
                    if (shippingOptionsContainer) {
                        shippingOptionsContainer.classList.add('highlight-missing');
                        if (!firstMissingElement) firstMissingElement = shippingOptionsContainer;
                    }
                }

                if (!fullName.value) { fullName.classList.add('highlight-missing'); if (!firstMissingElement) firstMissingElement = fullName; }
                if (!email.value) { email.classList.add('highlight-missing'); if (!firstMissingElement) firstMissingElement = email; }
                if (!streetAddress.value) { streetAddress.classList.add('highlight-missing'); if (!firstMissingElement) firstMissingElement = streetAddress; }
                if (!city.value) { city.classList.add('highlight-missing'); if (!firstMissingElement) firstMissingElement = city; }
                if (!state.value) { state.classList.add('highlight-missing'); if (!firstMissingElement) firstMissingElement = state; }
                if (!zipCode.value) { zipCode.classList.add('highlight-missing'); if (!firstMissingElement) firstMissingElement = zipCode; }
                if (!termsAccepted.checked) {
                    document.querySelector('#orderOverview .checkmark').classList.add('highlight-missing');
                    if (!firstMissingElement) firstMissingElement = termsAccepted;
                }

                if (firstMissingElement) {
                    showQuoteMessage('Please fill out all required fields to proceed.', 'error');
                    firstMissingElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return;
                }
                
                sendPhoneBtn.disabled = true;
                sendPhoneBtn.textContent = 'Order Submitting...';
                sendPhoneBtn.classList.remove('btn-primary-indigo');
                sendPhoneBtn.classList.add('btn-disabled');

                const orderData = {
                    device: "${model}",
                    carrier: document.querySelector('input[name="carrier"]:checked').value,
                    storage: document.getElementById('storage').value,
                    condition_power_on: document.querySelector('input[name="q1_power_on"]:checked').value,
                    condition_functional: document.querySelector('input[name="q2_fully_functional"]:checked').value,
                    condition_cracks: 'Included in cosmetic condition',
                    condition_cosmetic: document.querySelector('input[name="q4_cosmetic_condition"]:checked').value,
                    estimatedQuote: finalQuote,
                    paymentMethod: selectedPayment.value,
                    shippingPreference: selectedShippingPreference.value,
                    paymentDetails: {},
                    shippingInfo: {
                        fullName: fullName.value,
                        email: email.value,
                        streetAddress: streetAddress.value,
                        city: city.value,
                        state: state.value,
                        zipCode: zipCode.value
                    },
                    termsAccepted: termsAccepted.checked,
                    userId: currentUserId,
                    createdAt: serverTimestamp()
                };

                if (selectedPayment.value === 'venmo') {
                    orderData.paymentDetails.venmoUsername = document.getElementById('venmoUsername').value;
                } else if (selectedPayment.value === 'zelle') {
                    orderData.paymentDetails.zelleIdentifier = document.getElementById('zelleIdentifier').value;
                } else if (selectedPayment.value === 'paypal') {
                    orderData.paymentDetails.paypalEmail = document.getElementById('paypalEmail').value;
                }

                try {
                    showQuoteMessage('Submitting your order...', 'info');
                    const response = await fetch(\`\${BACKEND_URL}/submit-order\`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(orderData),
                    });

                    const result = await response.json();

                    if (!response.ok) {
                        throw new Error(result.error || 'Failed to submit order.');
                    }

                    showQuoteMessage('Your order has been submitted successfully! We will send a shipping label to your email shortly.', 'success');
                    
                    sendPhoneBtn.textContent = 'Order Submitted!';
                } catch (e) {
                    console.error("Error submitting order: ", e);
                    showQuoteMessage('There was an error submitting your order. Please try again.', 'error');
                    
                    sendPhoneBtn.disabled = false;
                    sendPhoneBtn.textContent = 'Send Phone In Now';
                    sendPhoneBtn.classList.remove('btn-disabled');
                    sendPhoneBtn.classList.add('btn-primary-indigo');
                }
            });
        });
