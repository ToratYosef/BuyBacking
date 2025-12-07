import { app, db } from "../firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, addDoc, doc, onSnapshot, query, orderBy, serverTimestamp, updateDoc, setDoc, getDocs, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

setLogLevel('error');

// --- Firebase Click Tracker Function ---
const trackButtonClick = async (buttonName) => {
    const cleanedButtonName = buttonName.replace(/\s/g, '_').replace(/'/g, '');
    const buttonDocRef = doc(db, "button_clicks", cleanedButtonName);
    const userId = auth.currentUser?.uid || getOrCreateGuestId();

    try {
        await runTransaction(db, async (transaction) => {
            const buttonDoc = await transaction.get(buttonDocRef);
            if (!buttonDoc.exists()) {
                transaction.set(buttonDocRef, {
                    count: 1,
                    buttonName: buttonName,
                    history: [{ timestamp: serverTimestamp(), userId: userId }],
                    lastClicked: serverTimestamp()
                });
            } else {
                const data = buttonDoc.data();
                const updatedHistory = [...data.history, { timestamp: serverTimestamp(), userId: userId }];
                transaction.update(buttonDocRef, {
                    count: (data.count || 0) + 1,
                    history: updatedHistory,
                    lastClicked: serverTimestamp()
                });
            }
        });
        console.log(`Click on '${buttonName}' successfully tracked and updated.`);
    } catch (error) {
        console.error("Transaction failed: ", error);
    }
};

const getOrCreateGuestId = () => {
    let id = localStorage.getItem('guestChatId');
    if (!id) {
        id = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        localStorage.setItem('guestChatId', id);
    }
    return id;
};

document.addEventListener('DOMContentLoaded', function() {
    // Image loading with fallback
    function loadImageWithFallback(imgElement) {
        const baseSrc = imgElement.dataset.baseSrc;
        if (!baseSrc) return;
        const extensions = ['.webp', '.svg', '.avif', '.png', '.webp', '.webp'];
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
            const testSrc = baseSrc + extensions[current];
            const img = new Image();
            img.onload = () => { imgElement.src = testSrc; };
            img.onerror = () => { current++; tryLoad(); };
            img.src = testSrc;
        }
        tryLoad();
    }
    document.querySelectorAll('img[data-base-src]').forEach(loadImageWithFallback);

    // Modals
    const modals = document.querySelectorAll('.modal');
    const openModal = (modalId) => document.getElementById(modalId)?.classList.add('is-visible');
    const closeModal = (modal) => modal.classList.remove('is-visible');

    // Auth-aware header controls
    const auth = getAuth(app);
    const loginNavBtn = document.getElementById('loginNavBtn');
    const userMonogram = document.getElementById('userMonogram');
    const authDropdown = document.getElementById('authDropdown');

    onAuthStateChanged(auth, (user) => {
        const isLoggedIn = !!user && !user.isAnonymous;
        if (loginNavBtn) {
            loginNavBtn.classList.toggle('hidden', isLoggedIn);
        }
        if (userMonogram) {
            const initialsSource = (user?.displayName || user?.email || '').trim();
            const initials = initialsSource
                ? initialsSource.split(' ').map((part) => part[0]).join('').substring(0, 2).toUpperCase()
                : '';
            if (isLoggedIn && initials) {
                userMonogram.textContent = initials;
            }
            userMonogram.classList.toggle('hidden', !isLoggedIn);
        }
        if (authDropdown) {
            authDropdown.classList.toggle('hidden', !isLoggedIn);
            if (!isLoggedIn) {
                authDropdown.classList.remove('is-visible');
            }
        }
    });

    const aboutUsLink = document.getElementById('aboutUsLink');
    if (aboutUsLink) {
        aboutUsLink.addEventListener('click', (e) => {
            e.preventDefault();
            openModal('aboutUsModal');
        });
    }

    modals.forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
        const closeBtn = modal.querySelector('.close-modal-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => closeModal(modal));
        }
    });

    // Click tracking for buttons
    const heroOfferBtn = document.getElementById('heroOfferBtn');
    if (heroOfferBtn) {
        heroOfferBtn.addEventListener('click', () => trackButtonClick('Hero_Get_Instant_Offer'));
    }

    const finalOfferBtn = document.getElementById('final OfferBtn');
    if (finalOfferBtn) {
        finalOfferBtn.addEventListener('click', () => trackButtonClick('Final_Sell_Device_Now'));
    }

    document.querySelectorAll('.feature-card h3').forEach(card => {
        card.addEventListener('click', () => {
            trackButtonClick(`Feature_Card_${card.textContent.trim()}`);
        });
    });

    document.querySelectorAll('.homepage-card-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const deviceName = e.currentTarget.querySelector('h3').textContent;
            trackButtonClick(`Popular_Device_Get_Offer_${deviceName}`);
        });
    });

    document.querySelectorAll('.review-link-card').forEach(link => {
        link.addEventListener('click', () => {
            const platformName = link.querySelector('h3').textContent;
            trackButtonClick(`External_Review_Click_${platformName.replace(/\s/g, '_')}`);
        });
    });

    // Footer email signup
    const footerEmailSignupForm = document.getElementById('footerEmailSignupForm');
    const footerSignupMessage = document.getElementById('footerSignupMessage');
    if (footerEmailSignupForm && footerSignupMessage) {
        footerEmailSignupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('footerPromoEmail').value;
            footerSignupMessage.textContent = 'Submitting...';
            footerSignupMessage.className = 'mt-3 text-sm text-center text-blue-300';

            try {
                await addDoc(collection(db, "signed_up_emails"), {
                    email: email,
                    timestamp: new Date()
                });
                footerSignupMessage.textContent = 'Success! Thanks for signing up.';
                footerSignupMessage.className = 'mt-3 text-sm text-center text-green-300';
                footerEmailSignupForm.reset();
                trackButtonClick('Footer_Email_Signup');
            } catch (error) {
                console.error("Error adding document: ", error);
                footerSignupMessage.textContent = 'Error: Could not sign up.';
                footerSignupMessage.className = 'mt-3 text-sm text-center text-red-300';
            }
        });
    }

    // ===== CHAT WIDGET =====
    const chatWindow = document.getElementById('chat-window');
    if (!chatWindow) {
        console.debug('Chat widget disabled on this page.');
        // Scroll animations
        setupScrollAnimations();
        return;
    }

    const chatOpenBtn = document.getElementById('chat-open-btn');
    const chatCloseBtn = document.getElementById('chat-close-btn');
    const chatMinimizeBtn = document.getElementById('chat-minimize-btn');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatInputContainer = document.getElementById('chat-input-container');
    const guestPromptContainer = document.getElementById('guest-prompt-container');
    const guestLoginBtn = document.getElementById('guest-login-btn');
    const unreadCounter = document.getElementById('unread-counter');
    const typingIndicatorContainer = document.getElementById('typing-indicator-container');
    const surveyContainer = document.getElementById('chat-survey-container');
    const surveyForm = document.getElementById('chat-survey-form');
    const starRatingContainer = document.getElementById('star-rating');
    const friendlinessRating = document.getElementById('friendliness-rating');
    const friendlinessValue = document.getElementById('friendliness-value');
    const endChatConfirmModal = document.getElementById('end-chat-confirm-modal');
    const endChatYesBtn = document.getElementById('end-chat-yes');
    const endChatNoBtn = document.getElementById('end-chat-no');
    const orderSelectionContainer = document.getElementById('order-selection-container');
    const orderList = document.getElementById('order-list');
    const closeOrderSelectionBtn = document.getElementById('close-order-selection-btn');
    const sendMessageBtn = document.getElementById('send-message-btn');
    const globalTooltip = document.getElementById('globalTooltip');
    const orderSelectionPrompt = document.getElementById('order-selection-prompt');

    const CHAT_STORAGE_KEY = 'chatSessionState';

    const storeChatSession = (chatId) => {
        const user = auth.currentUser;
        if (!user || user.isAnonymous || !chatId) return;
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ chatId, uid: user.uid }));
    };

    const getStoredChatSession = () => {
        const raw = localStorage.getItem(CHAT_STORAGE_KEY);
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            const user = auth.currentUser;
            if (!user || user.isAnonymous || parsed.uid !== user.uid) return null;
            return parsed;
        } catch (error) {
            console.error('Failed to parse stored chat session', error);
            return null;
        }
    };

    const clearStoredChatSession = () => {
        localStorage.removeItem(CHAT_STORAGE_KEY);
    };

    let currentChatId = null;
    let unsubscribeFromMessages = null;
    let unsubscribeFromChatSession = null;
    let isChatMinimized = true;
    let unreadCount = 0;
    let userTypingTimeout = null;
    let initialWelcomeRendered = {};
    let isFirstMessageSent = false;

    const notificationSound = new Audio('https://cdn.freesound.org/previews/253/253887_3900531-lq.mp3');
    notificationSound.volume = 0.5;

    const ensureUserAuthenticatedForChat = () => {
        const user = auth.currentUser;
        const isAuthenticated = !!user && !user.isAnonymous;
        if (!isAuthenticated) {
            guestPromptContainer.classList.remove('hidden');
            chatInputContainer.classList.add('hidden');
            surveyContainer.classList.add('hidden');
            orderSelectionContainer.classList.add('hidden');
        } else {
            guestPromptContainer.classList.add('hidden');
            chatInputContainer.classList.remove('hidden');
        }
        return isAuthenticated;
    };

    const getOrCreateChatSession = async () => {
        const user = auth.currentUser;
        if (!user || user.isAnonymous) return null;

        const storedSession = getStoredChatSession();
        if (storedSession?.chatId) {
            return storedSession.chatId;
        }

        const chatSessionData = {
            createdAt: serverTimestamp(),
            ownerUid: user.uid,
            guestId: null,
            status: 'active',
            agentName: null,
            isAgentTyping: false,
            agentAskingForOrderId: false
        };
        const docRef = await addDoc(collection(db, "chats"), chatSessionData);
        const chatId = docRef.id;
        storeChatSession(chatId);
        return chatId;
    };

    const renderMessage = (msg) => {
        const messageDiv = document.createElement('div');
        const user = auth.currentUser;
        const isMyMessage = !!user && !user.isAnonymous && msg.sender === user.uid;

        let classes = 'p-3 rounded-lg max-w-[85%] mb-2 break-words';
        if (msg.type === 'system') {
            classes = 'text-center text-sm text-slate-500 my-2';
            messageDiv.innerHTML = `<span class="bg-white px-2 py-1 rounded-full">${msg.text}</span>`;
        } else {
            classes += isMyMessage ? ' bg-gray-200 text-slate-800 self-end' : ' bg-blue-100 text-blue-800 self-start';
            messageDiv.textContent = msg.text;
        }

        messageDiv.className = classes;
        if (msg.type === 'system' && msg.text.includes('has joined the chat.')) {
            messageDiv.id = `agent-joined-${currentChatId}`;
        }
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    };

    const listenForChatSessionChanges = (chatId) => {
        if (unsubscribeFromChatSession) unsubscribeFromChatSession();
        unsubscribeFromChatSession = onSnapshot(doc(db, "chats", chatId), async (docSnap) => {
            const data = docSnap.data();
            if (!data) return;

            const agentJoinedFlag = localStorage.getItem(`agentJoined_${chatId}`);
            if (data.agentName && data.agentHasJoined && !agentJoinedFlag) {
                const joinMsgText = `<i class="fa-solid fa-headset mr-2"></i>${data.agentName} has joined the chat.`;
                await addDoc(collection(db, `chats/${chatId}/messages`), {
                    text: joinMsgText,
                    timestamp: serverTimestamp(),
                    sender: 'system',
                    type: 'system'
                });
                localStorage.setItem(`agentJoined_${chatId}`, 'true');
            }

            typingIndicatorContainer.style.display = data.isAgentTyping ? 'block' : 'none';
            if (data.isAgentTyping) chatMessages.scrollTop = chatMessages.scrollHeight;
            if (data.status === 'ended_by_agent') {
                chatInputContainer.classList.add('hidden');
                guestPromptContainer.classList.add('hidden');
                surveyContainer.classList.remove('hidden');
                orderSelectionContainer.classList.add('hidden');
                clearStoredChatSession();
                localStorage.removeItem(`agentJoined_${chatId}`);
            }
            if (data.agentAskingForOrderId) {
                displayOrderSelectionUI();
            } else {
                orderSelectionContainer.classList.add('hidden');
            }
        });
    };

    const listenForMessages = (chatId) => {
        if (unsubscribeFromMessages) unsubscribeFromMessages();
        currentChatId = chatId;
        const messagesRef = collection(db, `chats/${chatId}/messages`);
        const q = query(messagesRef, orderBy("timestamp"));
        unsubscribeFromMessages = onSnapshot(q, (snapshot) => {
            chatMessages.innerHTML = '';
            if (!initialWelcomeRendered[chatId] && snapshot.empty) {
                const user = auth.currentUser;
                const userName = user?.displayName?.split(' ')[0] || 'there';
                renderMessage({ type: 'system', text: `Hi ${userName}, how can we help you today?` });
                initialWelcomeRendered[chatId] = true;
            }

            snapshot.forEach(doc => {
                const msgData = doc.data();
                renderMessage(msgData);
                const user = auth.currentUser;
                const isMyMessage = !!user && !user.isAnonymous && msgData.sender === user.uid;
                if (!isMyMessage && isChatMinimized) {
                    unreadCount++;
                    unreadCounter.textContent = unreadCount;
                    unreadCounter.classList.add('visible');
                    notificationSound.play().catch(e => console.log("Audio play failed:", e));
                }
            });
        });
    };

    const resetChatUI = () => {
        endChatConfirmModal.classList.add('hidden');
        endChatConfirmModal.classList.remove('flex');
        surveyContainer.classList.add('hidden');
        guestPromptContainer.classList.add('hidden');
        chatInputContainer.classList.remove('hidden');
        orderSelectionContainer.classList.add('hidden');
        typingIndicatorContainer.style.display = 'none';
        chatMessages.innerHTML = '';
        initialWelcomeRendered = {};
    };

    const openChat = async () => {
        resetChatUI();
        chatWindow.classList.add('is-visible');
        isChatMinimized = false;
        unreadCount = 0;
        unreadCounter.classList.remove('visible');

        if (!ensureUserAuthenticatedForChat()) {
            currentChatId = null;
            return;
        }

        // Get stored session first before creating new one
        const storedSession = getStoredChatSession();
        if (storedSession?.chatId) {
            currentChatId = storedSession.chatId;
        } else if (!currentChatId) {
            currentChatId = await getOrCreateChatSession();
            isFirstMessageSent = false;
        }

        if (currentChatId) {
            listenForMessages(currentChatId);
            listenForChatSessionChanges(currentChatId);
        }
    };

    chatOpenBtn.addEventListener('click', openChat);

    const minimizeChat = () => {
        chatWindow.classList.remove('is-visible');
        isChatMinimized = true;
    };
    chatMinimizeBtn.addEventListener('click', minimizeChat);

    chatCloseBtn.addEventListener('click', () => {
        endChatConfirmModal.classList.add('flex');
        endChatConfirmModal.classList.remove('hidden');
    });

    endChatNoBtn.addEventListener('click', () => {
        endChatConfirmModal.classList.add('hidden');
        endChatConfirmModal.classList.remove('flex');
    });

    endChatYesBtn.addEventListener('click', async () => {
        if (currentChatId) {
            await addDoc(collection(db, `chats/${currentChatId}/messages`), {
                text: "Chat ended by user.",
                timestamp: serverTimestamp(),
                sender: 'system',
                type: 'system'
            });
            await updateDoc(doc(db, "chats", currentChatId), { status: 'ended_by_user' });
        }
        clearStoredChatSession();
        if (currentChatId) {
            localStorage.removeItem(`agentJoined_${currentChatId}`);
        }
        currentChatId = null;
        chatMessages.innerHTML = '';
        endChatConfirmModal.classList.add('hidden');
        endChatConfirmModal.classList.remove('flex');
        minimizeChat();
    });

    const sendMessage = async (text) => {
        if (text.trim() === '') return;

        if (!ensureUserAuthenticatedForChat()) return;

        if (!currentChatId) {
            currentChatId = await getOrCreateChatSession();
            isFirstMessageSent = false;
            if (!currentChatId) return;
        }

        const user = auth.currentUser;
        if (!user || user.isAnonymous) return;

        if (!isFirstMessageSent) {
            isFirstMessageSent = true;
            try {
                const cloudFunctionUrl = 'https://us-central1-buyback-a0f05.cloudfunctions.net/api/email-support';
                const userEmail = user.email || 'Member';
                const userName = user.displayName || userEmail;
                const firstMessage = text;

                await fetch(cloudFunctionUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chatId: currentChatId,
                        userName: userName,
                        userEmail: userEmail,
                        firstMessage: firstMessage
                    })
                });
                console.log('Support email sent for new chat session.');
            } catch (error) {
                console.error("Error sending support email:", error);
            }
        }

        const messageData = { text, timestamp: serverTimestamp(), sender: user.uid };
        await addDoc(collection(db, `chats/${currentChatId}/messages`), messageData);
        chatInput.value = '';
        await updateDoc(doc(db, "chats", currentChatId), {
            userTypingText: '',
            lastMessage: `User: ${text}`,
            lastMessageTimestamp: serverTimestamp()
        });
    };

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage(chatInput.value);
        }
    });

    sendMessageBtn.addEventListener('click', () => {
        sendMessage(chatInput.value);
    });

    chatInput.addEventListener('keyup', () => {
        clearTimeout(userTypingTimeout);
        userTypingTimeout = setTimeout(async () => {
            const user = auth.currentUser;
            if (currentChatId && user && !user.isAnonymous) {
                await updateDoc(doc(db, "chats", currentChatId), { userTypingText: chatInput.value });
            }
        }, 300);
    });

    if (guestLoginBtn) {
        guestLoginBtn.addEventListener('click', () => {
            const loginModal = document.getElementById('loginModal');
            if (loginModal) {
                loginModal.classList.add('is-visible');
            }
        });
    }

    friendlinessRating.addEventListener('input', (e) => { friendlinessValue.textContent = e.target.value; });

    starRatingContainer.addEventListener('mouseover', e => {
        if (e.target.tagName === 'I') {
            const rating = e.target.dataset.value;
            Array.from(starRatingContainer.children).forEach(star => star.classList.toggle('selected', star.dataset.value <= rating));
        }
    });

    starRatingContainer.addEventListener('mouseout', () => {
        const currentRating = starRatingContainer.dataset.rating;
        Array.from(starRatingContainer.children).forEach(star => star.classList.toggle('selected', star.dataset.value <= currentRating));
    });

    starRatingContainer.addEventListener('click', e => {
        if (e.target.tagName === 'I') {
            starRatingContainer.dataset.rating = e.target.dataset.value;
        }
    });

    surveyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const surveyData = {
            overallRating: parseInt(starRatingContainer.dataset.rating, 10),
            friendliness: friendlinessRating.value,
            resolved: document.querySelector('input[name="issue-resolved"]:checked')?.value || null,
            comments: document.getElementById('survey-comments').value
        };
        await setDoc(doc(db, `chats/${currentChatId}/survey/feedback`), { ...surveyData, submittedAt: serverTimestamp() });
        try {
            const cloudFunctionUrl = 'https://us-central1-buyback-a0f05.cloudfunctions.net/api/submit-chat-feedback';
            const response = await fetch(cloudFunctionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId: currentChatId, surveyData: surveyData })
            });
            if (!response.ok) throw new Error(`Server responded with status: ${response.status}`);
            console.log('Feedback email sent successfully:', await response.json());
        } catch (error) {
            console.error("Error sending feedback email:", error);
        }
        surveyContainer.innerHTML = '<p class="text-center font-semibold text-green-600">Thank you for your feedback!</p>';
    });

    const fetchUserOrders = async () => {
        return new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, async (user) => {
                unsubscribe();
                if (!user || user.isAnonymous) {
                    console.log("fetchUserOrders: User not logged in, returning requiresLogin: true");
                    resolve({ requiresLogin: true });
                    return;
                }
                const userId = user.uid;
                console.log("fetchUserOrders: Current user ID:", userId);
                const ordersRef = collection(db, `users/${userId}/orders`);
                const q = query(ordersRef, orderBy("timestamp", "desc"));
                try {
                    await createDummyOrder(userId);
                    const snapshot = await getDocs(q);
                    console.log("fetchUserOrders: Orders snapshot size:", snapshot.size);
                    if (snapshot.empty) {
                        console.log("fetchUserOrders: No orders found for this user in Firestore path:", `users/${userId}/orders`);
                    }
                    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    console.log("fetchUserOrders: Fetched orders:", orders);
                    resolve(orders);
                } catch (error) {
                    console.error("fetchUserOrders: Error fetching user orders:", error);
                    resolve({ error: error.message });
                }
            });
        });
    };

    const createDummyOrder = async (userId) => {
        const ordersRef = collection(db, `users/${userId}/orders`);
        const existingOrders = await getDocs(ordersRef);
        if (existingOrders.empty) {
            console.log("Creating initial dummy orders for user:", userId);
            let lastOrderNum = parseInt(localStorage.getItem('lastOrderNum') || '0', 10);
            const generateSequentialOrderId = () => {
                lastOrderNum++;
                localStorage.setItem('lastOrderNum', lastOrderNum);
                return `SHC-${String(lastOrderNum).padStart(5, '0')}`;
            };
            await setDoc(doc(db, `users/${userId}/orders`, generateSequentialOrderId()), {
                orderId: `SHC-${String(lastOrderNum).padStart(5, '0')}`,
                deviceName: 'iPhone 15 Pro Max',
                storage: '256GB',
                price: 700,
                reoffer: null,
                imageUrl: 'https://secondhandcell.com/assets/iphone/assets/i15pm.webp',
                timestamp: serverTimestamp()
            });
            await setDoc(doc(db, `users/${userId}/orders`, generateSequentialOrderId()), {
                orderId: `SHC-${String(lastOrderNum).padStart(5, '0')}`,
                deviceName: 'Samsung Galaxy S24 Ultra',
                storage: '512GB',
                price: 600,
                reoffer: 550,
                imageUrl: 'https://secondhandcell.com/assets/samsung/assets/s24u.webp',
                timestamp: serverTimestamp()
            });
            await setDoc(doc(db, `users/${userId}/orders`, generateSequentialOrderId()), {
                orderId: `SHC-${String(lastOrderNum).padStart(5, '0')}`,
                deviceName: 'iPad Pro (M2)',
                storage: '128GB',
                price: 550,
                reoffer: null,
                imageUrl: 'https://secondhandcell.com/assets/assets/ipm2.webp',
                timestamp: serverTimestamp()
            });
        } else {
            console.log("Example orders already exist for user:", userId);
        }
    };

    const parseCurrencyValue = (value) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
    };

    const getDisplayPrice = (order) => {
        if (!order || typeof order !== 'object') {
            return 0;
        }
        const candidates = [
            order.reoffer,
            order.reOffer?.newPrice,
            order.reOffer,
            order.price,
            order.estimatedQuote,
        ];

        for (const candidate of candidates) {
            const numeric = parseCurrencyValue(candidate);
            if (numeric !== null) {
                return numeric;
            }
        }

        return 0;
    };

    const renderOrderSelection = (orders) => {
        orderList.innerHTML = '';
        if (orders.requiresLogin) {
            orderList.innerHTML = '<p class="text-center text-slate-500">Please <a href="#" id="orderLoginPromptLink" class="text-blue-600 font-semibold hover:underline">log in</a> to view and select your orders.</p>';
            const loginLink = document.getElementById('orderLoginPromptLink');
            if (loginLink) {
                loginLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    const loginModal = document.getElementById('loginModal');
                    if (loginModal) {
                        loginModal.classList.add('is-visible');
                    }
                    orderSelectionContainer.classList.add('hidden');
                });
            }
            if (orderSelectionPrompt) {
                orderSelectionPrompt.textContent = 'Login to access your orders:';
            }
            return;
        }

        if (orders.length === 0) {
            orderList.innerHTML = '<p class="text-center text-slate-500">No recent orders found.</p>';
            if (orderSelectionPrompt) {
                orderSelectionPrompt.textContent = 'Please select your order:';
            }
            return;
        }
        if (orderSelectionPrompt) {
            orderSelectionPrompt.textContent = 'Please select your order:';
        }
        orders.forEach(order => {
            const orderCard = document.createElement('div');
            orderCard.className = 'order-card';
            orderCard.dataset.orderId = order.orderId;
            const reofferAmount = parseCurrencyValue(order.reoffer ?? order.reOffer?.newPrice);
            const displayPriceValue = getDisplayPrice(order);
            const formattedPrice = displayPriceValue.toFixed(2);
            orderCard.innerHTML = `
                <img src="${order.imageUrl || 'https://placehold.co/48x48/e0e7ff/4338ca?text= '}" alt="${order.deviceName}" onerror="this.onerror=null;this.src='https://placehold.co/48x48/e0e7ff/4338ca?text= '}">
                <div class="order-card-details">
                    <strong>ID: ${order.orderId} - ${order.deviceName}</strong>
                    <span>${order.storage} | $${formattedPrice}</span>
                    ${reofferAmount !== null ? `<span class="reoffer">Reoffer: $${reofferAmount.toFixed(2)}</span>` : ''}
                </div>
            `;
            orderCard.addEventListener('click', () => handleOrderSelection(order));
            orderList.appendChild(orderCard);
        });
    };

    const displayOrderSelectionUI = async () => {
        guestPromptContainer.classList.add('hidden');
        orderSelectionContainer.classList.remove('hidden');
        orderList.innerHTML = '<p class="text-center text-blue-500">Loading your orders...</p>';
        const orders = await fetchUserOrders();
        renderOrderSelection(orders);
    };

    const handleOrderSelection = async (order) => {
        const reofferAmount = parseCurrencyValue(order.reoffer ?? order.reOffer?.newPrice);
        const displayPriceValue = getDisplayPrice(order);
        const formattedPrice = displayPriceValue.toFixed(2);
        const messageText = `Selected Order: ID: ${order.orderId}, Device: ${order.deviceName}, Storage: ${order.storage}, Price: $${formattedPrice}${reofferAmount !== null ? `, Reoffer: $${reofferAmount.toFixed(2)}` : ''}`;
        await sendMessage(messageText);
        orderSelectionContainer.classList.add('hidden');
        if (currentChatId) {
            await updateDoc(doc(db, "chats", currentChatId), { agentAskingForOrderId: false });
        }
    };

    closeOrderSelectionBtn.addEventListener('click', async () => {
        orderSelectionContainer.classList.add('hidden');
        if (currentChatId) {
            await updateDoc(doc(db, "chats", currentChatId), { agentAskingForOrderId: false });
        }
    });

    const chatOrderBtn = document.getElementById('chat-order-btn');
    if (chatOrderBtn) {
        chatOrderBtn.addEventListener('click', async () => {
            if (currentChatId) {
                await updateDoc(doc(db, "chats", currentChatId), { agentAskingForOrderId: true });
            } else {
                displayOrderSelectionUI();
            }
        });
    }

    const chatHeaderButtons = document.querySelectorAll('.chat-header-button');
    chatHeaderButtons.forEach(button => {
        let tooltipTimeout;

        button.addEventListener('mouseover', (e) => {
            clearTimeout(tooltipTimeout);
            const tooltipText = button.dataset.tooltipText;
            if (tooltipText) {
                globalTooltip.textContent = tooltipText;
                globalTooltip.style.visibility = 'visible';
                globalTooltip.style.opacity = '1';

                const rect = button.getBoundingClientRect();
                globalTooltip.style.top = `${rect.bottom + 8}px`;
                globalTooltip.style.left = `${rect.left + rect.width / 2}px`;
                globalTooltip.style.transform = `translateX(-50%)`;
            }
        });

        button.addEventListener('mouseout', () => {
            tooltipTimeout = setTimeout(() => {
                globalTooltip.style.visibility = 'hidden';
                globalTooltip.style.opacity = '0';
            }, 100);
        });

        button.addEventListener('mouseenter', () => {
            clearTimeout(tooltipTimeout);
        });
    });

    // Scroll animations
    setupScrollAnimations();

    // Customer Reviews Rotation
    const customerReviewsTrack = document.getElementById('customerReviewsTrack');
    if (customerReviewsTrack) {
        const testimonialData = [
            {
                name: 'Michael Rodriguez',
                role: 'iPhone 15 Pro Max Seller',
                rating: 5,
                review: 'SecondHandCell handled my iPhone trade-in in days. The shipping kit arrived quickly, inspection was honest, and the payout hit my account the same afternoon.',
                avatar: '/assets/faces/3.webp'
            },
            {
                name: 'Sarah Johnson',
                role: 'Galaxy S23 Ultra Seller',
                rating: 4.5,
                review: 'The $10 shipping kit deduction was worth it—everything I needed was in the box. Their portal kept me updated until the payout cleared the next morning.',
                avatar: '/assets/faces/5.webp'
            },
            {
                name: 'David Martinez',
                role: 'Software Engineer • Seattle, WA',
                rating: 5,
                review: 'I compared half a dozen services and this one actually paid what they quoted. The dashboard makes tracking each step effortless.',
                avatar: '/assets/faces/6.webp'
            },
            {
                name: 'Emily Thompson',
                role: 'Teacher • Chicago, IL',
                rating: 4.5,
                review: 'As a teacher with zero free time, I loved how transparent the process was. I chose an email label, shipped the same day, and had my Zelle transfer within 24 hours.',
                avatar: '/assets/faces/7.webp'
            },
            {
                name: 'Jessica Rivera',
                role: 'Nurse • Tampa, FL',
                rating: 5,
                review: 'Customer support answered my questions in minutes and the payout matched what I was promised. It felt like working with a friend instead of a company.',
                avatar: '/assets/faces/8.webp'
            },
            {
                name: 'Amanda Chen',
                role: 'Entrepreneur • Austin, TX',
                rating: 4.8,
                review: 'I recycle phones from my business upgrades. Every order with SecondHandCell has been smooth, and they always explain any adjustments before finalizing the quote.',
                avatar: '/assets/faces/9.webp'
            },
            {
                name: 'James Wilson',
                role: 'IT Consultant • Denver, CO',
                rating: 5,
                review: 'Best phone buyback experience I\'ve had. Fast payment, transparent pricing, and excellent customer service. Highly recommend!',
                avatar: '/assets/faces/10.webp'
            }
        ];

        const createStarMarkup = (rating) => {
            const stars = [];
            for (let i = 1; i <= 5; i += 1) {
                if (rating >= i) {
                    stars.push('<i class="fa-solid fa-star"></i>');
                } else if (rating >= i - 0.5) {
                    stars.push('<i class="fa-solid fa-star-half-stroke"></i>');
                } else {
                    stars.push('<i class="fa-regular fa-star"></i>');
                }
            }
            return stars.join('');
        };

        const renderReviewCard = (testimonial) => `
            <article class="testimonial-card testimonial-card-enter">
                <div>
                    <div class="testimonial-stars" aria-hidden="true">
                        ${createStarMarkup(testimonial.rating)}
                    </div>
                    <p class="mt-3 text-slate-600 leading-relaxed">"${testimonial.review}"</p>
                </div>
                <div class="testimonial-profile">
                    <img src="${testimonial.avatar}" alt="Portrait of ${testimonial.name}" class="testimonial-avatar">
                    <div>
                        <p class="testimonial-name">${testimonial.name}</p>
                        <p class="testimonial-role">${testimonial.role}</p>
                    </div>
                </div>
            </article>
        `;

        let carouselIndex = 0;
        const testimonialsPerSlide = 3;

        const renderTestimonials = () => {
            const cards = [];
            for (let offset = 0; offset < testimonialsPerSlide; offset += 1) {
                const data = testimonialData[(carouselIndex + offset) % testimonialData.length];
                cards.push(renderReviewCard(data));
            }
            customerReviewsTrack.innerHTML = cards.join('');
        };

        const advanceCarousel = () => {
            carouselIndex = (carouselIndex + testimonialsPerSlide) % testimonialData.length;
            renderTestimonials();
        };

        renderTestimonials();

        const intervalDelay = 5000;
        let carouselTimer = window.setInterval(advanceCarousel, intervalDelay);

        const pauseCarousel = () => {
            if (carouselTimer) {
                window.clearInterval(carouselTimer);
                carouselTimer = null;
            }
        };

        const startCarousel = () => {
            if (!carouselTimer) {
                carouselTimer = window.setInterval(advanceCarousel, intervalDelay);
            }
        };

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                pauseCarousel();
            } else {
                startCarousel();
            }
        });
    }
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
