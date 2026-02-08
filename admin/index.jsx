import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, Package, Truck, FileText, Settings, LogOut, 
  Search, Bell, Filter, RefreshCw, Plus, ChevronRight, CheckCircle, 
  AlertCircle, X, DollarSign, User, MapPin, Printer, Smartphone, 
  CreditCard, Mail, Phone, Calendar, Clock, Tag, Edit2, Save, 
  MoreHorizontal, ChevronDown, ExternalLink, ShieldCheck, 
  AlertTriangle, Play, Lock
} from 'lucide-react';
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { initializeApp, getApps, getApp } from 'firebase/app';

// --- CONFIGURATION & HELPERS ---

// 1. FIREBASE CONFIGURATION
// Replace the values below with your actual Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyAmUGWbpbJIWLrBMJpZb8iMpFt-uc24J0k",
  authDomain: "buyback-a0f05.firebaseapp.com",
  databaseURL: "https://buyback-a0f05-default-rtdb.firebaseio.com",
  projectId: "buyback-a0f05",
  storageBucket: "buyback-a0f05.firebasestorage.app",
  messagingSenderId: "876430429098",
  appId: "1:876430429098:web:f6dd64b1960d90461979d3",
  measurementId: "G-6WWQN44JHT"
};

// Initialize Firebase (Singleton Pattern)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Ensure this global is set in your index.html or environment
const API_BASE_URL = window.SHC_API_BASE_URL || "https://api.secondhandcell.com/server";

// Helper for API Calls (Replaces apiClient.js)
const apiCall = async (endpoint, method = 'GET', body = null, authInstance) => {
  try {
    const user = authInstance?.currentUser;
    const token = user ? await user.getIdToken() : null;
    
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    // Ensure endpoint starts with /
    const safeEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const response = await fetch(`${API_BASE_URL}${safeEndpoint}`, config);
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'API Request Failed');
    return data;
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
};

// Date Formatter
const formatDate = (timestamp) => {
  if (!timestamp) return 'N/A';
  // Handle Firestore Timestamp or Date string
  const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
  if (isNaN(date.getTime())) return 'Invalid Date';
  return new Intl.DateTimeFormat('en-US', { 
    month: 'short', day: 'numeric', year: 'numeric', 
    hour: 'numeric', minute: '2-digit' 
  }).format(date);
};

// Order Age Calculator
const getOrderAge = (timestamp) => {
  if (!timestamp) return '0 days';
  const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
  const diffTime = Math.abs(new Date() - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  return `${diffDays} day${diffDays !== 1 ? 's' : ''} old`;
};

// Status Formatting
const formatStatusLabel = (status) => {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const getStatusColor = (status) => {
  const s = (status || '').toLowerCase();
  if (s.includes('pending') || s.includes('needs')) return 'bg-amber-100 text-amber-800 border-amber-200';
  if (s.includes('paid') || s.includes('completed') || s.includes('received')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (s.includes('cancel') || s.includes('void')) return 'bg-slate-100 text-slate-600 border-slate-200';
  if (s.includes('kit') || s.includes('label') || s.includes('transit')) return 'bg-blue-100 text-blue-800 border-blue-200';
  return 'bg-slate-100 text-slate-800 border-slate-200';
};

// --- COMPONENTS ---

// 1. Status Badge
const StatusBadge = ({ status }) => (
  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(status)}`}>
    {formatStatusLabel(status)}
  </span>
);

// 2. Sidebar Navigation
const Sidebar = ({ activeTab, setActiveTab, onLogout }) => {
  const navItems = [
    { id: 'orders', label: 'Orders', icon: Package },
    { id: 'analytics', label: 'Analytics', icon: LayoutDashboard },
    { id: 'print', label: 'Print Queue', icon: Printer },
    { id: 'settings', label: 'Pricing', icon: Tag },
  ];

  return (
    <div className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen fixed left-0 top-0 z-20 hidden lg:flex">
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md shadow-indigo-200">
          BB
        </div>
        <div>
          <h1 className="font-bold text-slate-900 leading-tight">BuyBacking</h1>
          <p className="text-xs text-slate-500 font-medium">Admin Console</p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1 mt-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2">Workspace</div>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === item.id 
                ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <item.icon size={18} className={activeTab === item.id ? 'text-indigo-600' : 'text-slate-400'} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-100">
        <button 
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );
};

// 3. Login Screen Component
const LoginScreen = ({ auth }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-200">
            BB
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-slate-900">
          Admin Sign In
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Access the Order Management Console
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200 border border-slate-100 sm:rounded-xl sm:px-10">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email address
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 sm:text-sm border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-2.5"
                  placeholder="admin@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 sm:text-sm border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-2.5"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-rose-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-rose-400" aria-hidden="true" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-rose-800">{error}</h3>
                  </div>
                </div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 transition-all"
              >
                {loading ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : (
                  'Sign in'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// 4. QC Intake Wizard Component
const QCModal = ({ isOpen, onClose, order, onSubmit, auth }) => {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    deviceMatch: 'yes',
    deviceName: order?.device || '',
    storage: order?.storage || '',
    imei: order?.imei || '',
    condition: 'good',
    isFunctional: 'yes',
    hasCracks: 'no',
    isLocked: 'no',
    hasBalance: 'no'
  });

  if (!isOpen) return null;

  const handleNext = () => setStep(prev => prev + 1);
  const handlePrev = () => setStep(prev => prev - 1);
  
  const handleFinalSubmit = () => {
    onSubmit(order.id, data);
    onClose();
  };

  const steps = [
    {
      title: "Device Verification",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Customer declared: <strong>{order.device} ({order.storage})</strong></p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Does the device match?</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 border p-3 rounded-lg flex-1 cursor-pointer hover:bg-slate-50">
                <input type="radio" name="deviceMatch" checked={data.deviceMatch === 'yes'} onChange={() => setData({...data, deviceMatch: 'yes'})} className="text-indigo-600" />
                <span className="text-sm font-medium">Yes, Match</span>
              </label>
              <label className="flex items-center gap-2 border p-3 rounded-lg flex-1 cursor-pointer hover:bg-slate-50">
                <input type="radio" name="deviceMatch" checked={data.deviceMatch === 'no'} onChange={() => setData({...data, deviceMatch: 'no'})} className="text-indigo-600" />
                <span className="text-sm font-medium">No, Mismatch</span>
              </label>
            </div>
          </div>
          {data.deviceMatch === 'no' && (
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 animate-in fade-in slide-in-from-top-2">
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Actual Device Name</label>
              <input 
                type="text" 
                value={data.deviceName} 
                onChange={(e) => setData({...data, deviceName: e.target.value})}
                className="w-full border-slate-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500" 
                placeholder="e.g. iPhone 14 Pro"
              />
            </div>
          )}
        </div>
      )
    },
    {
      title: "Condition Assessment",
      content: (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Functional Check</label>
            <div className="grid grid-cols-2 gap-3">
              <label className={`flex items-center justify-center p-3 border rounded-lg cursor-pointer ${data.isFunctional === 'yes' ? 'bg-green-50 border-green-200 text-green-700 ring-1 ring-green-500' : 'hover:bg-slate-50'}`}>
                <input type="radio" className="sr-only" checked={data.isFunctional === 'yes'} onChange={() => setData({...data, isFunctional: 'yes'})} />
                <span className="text-sm font-bold flex items-center gap-2"><CheckCircle size={16}/> Functional</span>
              </label>
              <label className={`flex items-center justify-center p-3 border rounded-lg cursor-pointer ${data.isFunctional === 'no' ? 'bg-red-50 border-red-200 text-red-700 ring-1 ring-red-500' : 'hover:bg-slate-50'}`}>
                <input type="radio" className="sr-only" checked={data.isFunctional === 'no'} onChange={() => setData({...data, isFunctional: 'no'})} />
                <span className="text-sm font-bold flex items-center gap-2"><X size={16}/> Issues</span>
              </label>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Physical Condition</label>
            <select 
              value={data.condition} 
              onChange={(e) => setData({...data, condition: e.target.value})}
              className="w-full border-slate-300 rounded-md text-sm py-2.5 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="flawless">Flawless (Mint)</option>
              <option value="good">Good (Normal Wear)</option>
              <option value="fair">Fair (Heavy Wear)</option>
              <option value="damaged">Damaged (Cracks/Broken)</option>
            </select>
          </div>

          <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer">
            <input type="checkbox" checked={data.hasCracks === 'yes'} onChange={(e) => setData({...data, hasCracks: e.target.checked ? 'yes' : 'no'})} className="h-4 w-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500" />
            <span className="text-sm text-slate-700">Cracked Screen or Back?</span>
          </label>
        </div>
      )
    },
    {
      title: "Locks & Security",
      content: (
        <div className="space-y-4">
           <label className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 cursor-pointer">
            <div className="flex items-center gap-3">
              <ShieldCheck className={data.isLocked === 'yes' ? "text-rose-500" : "text-slate-400"} />
              <span className="text-sm font-medium text-slate-900">iCloud / Google Locked?</span>
            </div>
            <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
              <input type="checkbox" name="toggle" checked={data.isLocked === 'yes'} onChange={(e) => setData({...data, isLocked: e.target.checked ? 'yes' : 'no'})} className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer border-slate-300 checked:right-0 checked:border-rose-600"/>
              <label className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${data.isLocked === 'yes' ? 'bg-rose-600' : 'bg-slate-300'}`}></label>
            </div>
          </label>

           <label className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 cursor-pointer">
            <div className="flex items-center gap-3">
              <DollarSign className={data.hasBalance === 'yes' ? "text-amber-500" : "text-slate-400"} />
              <span className="text-sm font-medium text-slate-900">Finance / Balance Owed?</span>
            </div>
            <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
              <input type="checkbox" name="toggle" checked={data.hasBalance === 'yes'} onChange={(e) => setData({...data, hasBalance: e.target.checked ? 'yes' : 'no'})} className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer border-slate-300 checked:right-0 checked:border-amber-500"/>
              <label className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${data.hasBalance === 'yes' ? 'bg-amber-500' : 'bg-slate-300'}`}></label>
            </div>
          </label>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Device IMEI (Optional)</label>
            <input 
              type="text" 
              value={data.imei} 
              onChange={(e) => setData({...data, imei: e.target.value})}
              className="w-full border-slate-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500 font-mono" 
              placeholder="Enter 15-digit IMEI"
            />
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-slate-900">QC Intake</h3>
            <p className="text-xs text-slate-500">Order {order.id}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={20}/></button>
        </div>
        
        <div className="px-6 py-6">
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              <span>Step {step} of {steps.length}</span>
              <span>{Math.round((step / steps.length) * 100)}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 transition-all duration-300 ease-out" style={{ width: `${(step / steps.length) * 100}%` }}></div>
            </div>
          </div>

          <h4 className="text-xl font-bold text-slate-900 mb-4">{steps[step-1].title}</h4>
          {steps[step-1].content}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
          <button 
            onClick={step === 1 ? onClose : handlePrev}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          
          {step < steps.length ? (
            <button 
              onClick={handleNext}
              className="px-6 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm shadow-indigo-200 transition-all"
            >
              Next Step
            </button>
          ) : (
            <button 
              onClick={handleFinalSubmit}
              className="px-6 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm shadow-emerald-200 transition-all flex items-center gap-2"
            >
              <Save size={16} /> Finish QC
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// 5. Main Admin Dashboard Component
const AdminDashboard = () => {
  // State
  const [activeTab, setActiveTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [qcModalOpen, setQcModalOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // 1. Auth Listener
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Orders Realtime Listener
  useEffect(() => {
    if (!db || !user) return;

    const ordersRef = collection(db, 'orders');
    // NOTE: Simple query for all orders. Indexing required for complex filtering.
    // We filter client-side for "All Orders" view to preserve flexibility.
    const unsubscribe = onSnapshot(ordersRef, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Normalize date for sorting
        createdAtMillis: doc.data().createdAt?.seconds ? doc.data().createdAt.seconds * 1000 : 0
      }));
      
      // Sort by newest first
      ordersData.sort((a, b) => b.createdAtMillis - a.createdAtMillis);
      
      setOrders(ordersData);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Filter Logic
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Status Filter
      if (statusFilter !== 'all') {
        // Simple mapping for demonstration
        if (statusFilter === 'pending' && order.status !== 'order_pending') return false;
        if (statusFilter === 'completed' && order.status !== 'completed') return false;
        if (statusFilter === 'cancelled' && order.status !== 'cancelled') return false;
      }

      // Search Filter
      if (searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        const matchesId = order.id.toLowerCase().includes(lowerTerm);
        const matchesCustomer = order.shippingInfo?.fullName?.toLowerCase().includes(lowerTerm);
        const matchesDevice = order.device?.toLowerCase().includes(lowerTerm);
        const matchesEmail = order.shippingInfo?.email?.toLowerCase().includes(lowerTerm);
        
        return matchesId || matchesCustomer || matchesDevice || matchesEmail;
      }

      return true;
    });
  }, [orders, statusFilter, searchTerm]);

  // 4. Actions
  const handleAction = async (orderId, actionType, payload = {}) => {
    if (!user) return;
    
    // Optimistic UI updates could go here
    try {
      let endpoint = '';
      let method = 'POST';

      switch (actionType) {
        case 'markReceived':
          endpoint = `/orders/${orderId}/status`;
          method = 'PUT';
          payload = { status: 'received' };
          break;
        case 'markCompleted':
          endpoint = `/orders/${orderId}/status`;
          method = 'PUT';
          payload = { status: 'completed' };
          break;
        case 'generateLabel':
          endpoint = `/generate-label/${orderId}`;
          break;
        case 'cancelOrder':
          endpoint = `/orders/${orderId}/cancel`;
          break;
        default:
          return;
      }

      await apiCall(endpoint, method, payload, auth);
      // Toast success here ideally
      console.log(`Action ${actionType} successful`);
    } catch (error) {
      alert(`Action failed: ${error.message}`);
    }
  };

  const handleQcSubmit = async (orderId, qcData) => {
    if (!db) return;
    try {
        const orderRef = doc(db, 'orders', orderId);
        // We update Firestore directly for QC data to be instant
        // The backend might also have a listener or we can call an endpoint
        await setDoc(orderRef, {
            qcData: qcData,
            status: 'received', // Auto-move to received if not already
            qcCompletedAt: new Date()
        }, { merge: true });
        
        // If there's a mismatch, maybe trigger a re-offer flow (API call)
        if (qcData.deviceMatch === 'no' || qcData.isFunctional === 'no') {
            // Trigger internal flag or backend process
        }
    } catch(e) {
        console.error("QC Save Failed", e);
        alert("Failed to save QC data");
    }
  };

  // --- RENDER HELPERS ---

  if (authLoading) return <div className="h-screen w-full flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
  if (!user) return <LoginScreen auth={auth} />;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex">
      {/* Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={() => signOut(auth)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:ml-64 transition-all duration-300">
        
        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-10 px-4 sm:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <Search className="text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="Search orders by ID, Customer, or Device..." 
              className="bg-transparent border-none outline-none text-sm w-full placeholder:text-slate-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-slate-400 hover:bg-slate-50 rounded-full transition-colors">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="h-8 w-8 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-xs font-bold text-indigo-700">
              {user.email ? user.email.charAt(0).toUpperCase() : 'A'}
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 p-4 sm:p-8 overflow-y-auto">
          
          {/* Header & Stats */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Order Management</h2>
              <p className="text-sm text-slate-500 mt-1">Overview of all buyback requests and fulfillment status.</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => handleAction(null, 'refreshKitTracking')} // Placeholder action
                className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-all"
              >
                <RefreshCw size={16} /> Refresh Tracking
              </button>
              <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-md shadow-indigo-200 transition-all">
                <Plus size={16} /> Create Order
              </button>
            </div>
          </div>

          {/* Quick Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500 uppercase">Pending</span>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold text-slate-900">{orders.filter(o => o.status === 'order_pending').length}</span>
                <span className="bg-amber-50 text-amber-700 text-xs px-2 py-1 rounded-full font-medium">Action Needed</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500 uppercase">Received Today</span>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold text-slate-900">
                  {orders.filter(o => {
                    if (o.status !== 'received') return false;
                    const date = o.lastStatusUpdateAt?.seconds ? new Date(o.lastStatusUpdateAt.seconds * 1000) : new Date();
                    return date.toDateString() === new Date().toDateString();
                  }).length}
                </span>
                <span className="bg-emerald-50 text-emerald-700 text-xs px-2 py-1 rounded-full font-medium">+12% vs yest</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500 uppercase">Payouts Pending</span>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold text-slate-900">$4,250</span>
                <span className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full font-medium">8 Orders</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500 uppercase">Total Completed</span>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold text-slate-900">{orders.filter(o => o.status === 'completed').length}</span>
                <span className="text-slate-400 text-xs">Lifetime</span>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
            {['all', 'pending', 'received', 'completed', 'cancelled'].map(filter => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  statusFilter === filter 
                    ? 'bg-slate-900 text-white shadow-md' 
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>

          {/* Orders Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold tracking-wider">
                    <th className="px-6 py-4">Order ID</th>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Device</th>
                    <th className="px-6 py-4">Payout</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan="7" className="px-6 py-8 text-center text-slate-500">Loading orders...</td></tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr><td colSpan="7" className="px-6 py-8 text-center text-slate-500">No orders found.</td></tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <tr 
                        key={order.id} 
                        className="hover:bg-slate-50 transition-colors cursor-pointer group"
                        onClick={() => setSelectedOrder(order)}
                      >
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">#{order.id}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-900">{order.shippingInfo?.fullName || 'Guest'}</span>
                            <span className="text-xs text-slate-500">{order.shippingInfo?.email}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                              <Smartphone size={16} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-slate-900">{order.device}</span>
                              <span className="text-xs text-slate-500">{order.storage} • {order.carrier}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-900">
                          ${parseFloat(order.totalPayout || order.price || 0).toFixed(2)}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={order.status} />
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">
                          {formatDate(order.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="text-slate-400 hover:text-indigo-600 p-2 rounded-full hover:bg-indigo-50 transition-all">
                            <ChevronRight size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Placeholder */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">Showing {filteredOrders.length} orders</span>
              <div className="flex gap-2">
                <button className="px-3 py-1 border border-slate-300 bg-white rounded text-xs font-medium hover:bg-slate-50 disabled:opacity-50" disabled>Prev</button>
                <button className="px-3 py-1 border border-slate-300 bg-white rounded text-xs font-medium hover:bg-slate-50">Next</button>
              </div>
            </div>
          </div>

        </main>
      </div>

      {/* Order Detail Modal / Drawer */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedOrder(null)}
          ></div>

          {/* Drawer Content */}
          <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300 flex flex-col">
            
            {/* Drawer Header */}
            <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 border-b border-slate-200 px-6 py-4 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-2xl font-bold text-slate-900">#{selectedOrder.id}</h2>
                  <StatusBadge status={selectedOrder.status} />
                </div>
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  <Clock size={14} /> Created {formatDate(selectedOrder.createdAt)} ({getOrderAge(selectedOrder.createdAt)})
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-8 flex-1">
              
              {/* Customer Info Card */}
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <User size={14} /> Customer Details
                </h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Name</label>
                    <div className="text-sm font-semibold text-slate-900">{selectedOrder.shippingInfo?.fullName}</div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Email</label>
                    <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
                      {selectedOrder.shippingInfo?.email}
                      <a href={`mailto:${selectedOrder.shippingInfo?.email}`} className="text-indigo-600 hover:text-indigo-800"><Mail size={12}/></a>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Phone</label>
                    <div className="text-sm font-medium text-slate-900">{selectedOrder.shippingInfo?.phone || 'N/A'}</div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Shipping Address</label>
                    <div className="text-sm text-slate-700 leading-snug">
                      {selectedOrder.shippingInfo?.streetAddress}<br/>
                      {selectedOrder.shippingInfo?.city}, {selectedOrder.shippingInfo?.state} {selectedOrder.shippingInfo?.zipCode}
                    </div>
                  </div>
                </div>
              </div>

              {/* Device Details */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Smartphone size={20} className="text-slate-400" /> Device
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-white p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                        <Smartphone size={24} />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-lg">{selectedOrder.device}</div>
                        <div className="text-sm text-slate-500 flex gap-2">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-medium border border-slate-200">{selectedOrder.storage}</span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-medium border border-slate-200">{selectedOrder.carrier}</span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-medium border border-slate-200 capitalize">{selectedOrder.condition}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400 uppercase font-medium">Payout</div>
                      <div className="text-xl font-bold text-green-600">${parseFloat(selectedOrder.totalPayout).toFixed(2)}</div>
                    </div>
                  </div>
                  
                  {/* Actions Bar inside Card */}
                  <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex gap-3">
                    <button 
                      onClick={() => setQcModalOpen(true)}
                      className="flex-1 bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-600 font-medium py-2 rounded-lg text-sm shadow-sm transition-all flex items-center justify-center gap-2"
                    >
                      <CheckCircle size={16} /> Start Inspection
                    </button>
                    <button className="flex-1 bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-600 font-medium py-2 rounded-lg text-sm shadow-sm transition-all flex items-center justify-center gap-2">
                      <Tag size={16} /> Print Label
                    </button>
                  </div>
                </div>
              </div>

              {/* Payment Info */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <CreditCard size={20} className="text-slate-400" /> Payment Method
                </h3>
                <div className="border border-slate-200 rounded-xl p-4 flex items-center justify-between bg-white">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-green-50 rounded-full flex items-center justify-center text-green-600">
                      <DollarSign size={20} />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 capitalize">{selectedOrder.paymentMethod}</div>
                      <div className="text-xs text-slate-500">
                        {selectedOrder.paymentMethod === 'cashapp' && selectedOrder.paymentDetails?.cashappTag}
                        {selectedOrder.paymentMethod === 'paypal' && selectedOrder.paymentDetails?.paypalEmail}
                        {selectedOrder.paymentMethod === 'zelle' && (selectedOrder.paymentDetails?.zelleIdentifier || selectedOrder.paymentDetails?.zellePhone)}
                        {selectedOrder.paymentMethod === 'check' && 'Check via Mail'}
                      </div>
                    </div>
                  </div>
                  {selectedOrder.status === 'completed' ? (
                    <span className="text-xs font-bold text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-100 flex items-center gap-1">
                      <CheckCircle size={12} /> PAID
                    </span>
                  ) : (
                    <button 
                      onClick={() => handleAction(selectedOrder.id, 'markCompleted')}
                      className="text-sm font-medium text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Mark Paid
                    </button>
                  )}
                </div>
              </div>

              {/* Internal Logs / Notes Placeholder */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <FileText size={20} className="text-slate-400" /> Activity Log
                </h3>
                <div className="border border-slate-200 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  {selectedOrder.activityLog ? (
                    <ul className="space-y-3">
                      {selectedOrder.activityLog.slice().reverse().map((log, idx) => (
                        <li key={idx} className="flex gap-3">
                          <div className="mt-1 min-w-[4px] h-4 bg-slate-300 rounded-full"></div>
                          <div>
                            <p className="text-slate-800 font-medium">{log.message}</p>
                            <p className="text-xs text-slate-400">{formatDate(log.at)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="italic text-center py-4">No activity recorded yet.</p>
                  )}
                </div>
              </div>

            </div>

            {/* Drawer Footer Actions */}
            <div className="border-t border-slate-200 p-6 bg-white flex gap-3 sticky bottom-0 z-10">
              <button 
                onClick={() => handleAction(selectedOrder.id, 'generateLabel')}
                disabled={selectedOrder.status === 'cancelled'}
                className="flex-1 bg-white border border-slate-300 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
              >
                Generate Label
              </button>
              <button 
                onClick={() => handleAction(selectedOrder.id, 'markReceived')}
                className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
              >
                <Package size={18} /> Mark Received
              </button>
            </div>

          </div>
        </div>
      )}

      {/* QC Modal Overlay */}
      {selectedOrder && (
        <QCModal 
          isOpen={qcModalOpen} 
          onClose={() => setQcModalOpen(false)} 
          order={selectedOrder}
          auth={auth}
          onSubmit={handleQcSubmit}
        />
      )}

    </div>
  );
};

export default AdminDashboard;