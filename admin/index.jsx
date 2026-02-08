import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, Package, Truck, FileText, Settings, LogOut, 
  Search, Bell, Filter, RefreshCw, Plus, ChevronRight, CheckCircle, 
  AlertCircle, X, DollarSign, User, MapPin, Printer, Smartphone, 
  CreditCard, Mail, Phone, Calendar, Clock, Tag, Edit2, Save, 
  MoreHorizontal, ChevronDown, ExternalLink, ShieldCheck, 
  AlertTriangle, Play, Lock, Trash2, Ban, Copy, Send, RotateCcw,
  Menu // Added Menu icon for mobile sidebar
} from 'lucide-react';
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, updateDoc, query, orderBy } from 'firebase/firestore';
import { initializeApp, getApps, getApp } from 'firebase/app';

// --- CONFIGURATION & HELPERS ---

// 1. FIREBASE CONFIGURATION
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

// Helper for API Calls
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

// --- CONSTANTS & MAPS ---

// 11. Canonical Status Map
const STATUS = {
  ORDER_PENDING: 'order_pending',
  KIT_NEEDS_PRINTING: 'kit_needs_printing',
  NEEDS_PRINTING: 'needs_printing',
  SHIPPING_KIT_REQUESTED: 'shipping_kit_requested',
  LABEL_GENERATED: 'label_generated',
  EMAILED: 'emailed',
  KIT_SENT: 'kit_sent',
  KIT_TRANSIT: 'kit_on_the_way_to_us',
  KIT_DELIVERED: 'kit_delivered',
  PHONE_TRANSIT: 'phone_on_the_way',
  DELIVERED_US: 'delivered_to_us',
  RECEIVED: 'received',
  IMEI_CHECKED: 'imei_checked',
  REOFFER_PENDING: 're-offered-pending',
  REOFFER_ACCEPTED: 're-offered-accepted',
  REOFFER_DECLINED: 're-offered-declined',
  REQUOTE_ACCEPTED: 'requote_accepted',
  COMPLETED: 'completed',
  PAID: 'paid',
  CANCELLED: 'cancelled',
};

// Action Map (Strictly matched to OG HTML)
const ACTION_MAP = {
  // ─────────────────────────────
  // LABEL & SHIPPING
  // ─────────────────────────────
  generateLabel: {
    method: 'POST',
    endpoint: ({ orderId }) => `/generate-label/${orderId}`,
  },

  refreshTracking: {
    method: 'POST',
    endpoint: () => `/refresh-tracking`,
    body: ({ orderId, type }) => ({ orderId, type }) // type = 'kit' | 'email'
  },

  sendReturnLabel: {
    method: 'POST',
    endpoint: ({ orderId }) => `/orders/${orderId}/return-label`,
  },

  markKitSent: {
    method: 'POST',
    endpoint: ({ orderId }) => `/orders/${orderId}/mark-kit-sent`,
    body: ({ orderId }) => ({ orderId }),
  },

  markReceived: {
    method: 'PUT',
    endpoint: ({ orderId }) => `/orders/${orderId}/status`,
    body: () => ({ status: 'received' }),
  },

  // ─────────────────────────────
  // ORDER STATUS
  // ─────────────────────────────
  markCompleted: {
    method: 'PUT',
    endpoint: ({ orderId }) => `/orders/${orderId}/status`,
    body: () => ({ status: 'completed' }),
  },
  
  markManuallyFulfilled: {
     method: 'PUT',
     endpoint: ({ orderId }) => `/orders/${orderId}/status`,
     body: () => ({ status: 'shipping_kit_requested' }),
  },

  cancelOrder: {
    method: 'POST',
    endpoint: ({ orderId }) => `/orders/${orderId}/cancel`,
  },

  deleteOrder: {
    method: 'DELETE',
    endpoint: ({ orderId }) => `/orders/${orderId}`,
  },

  // ─────────────────────────────
  // QC / REQUOTE
  // ─────────────────────────────
  autoRequote: {
    method: 'POST',
    endpoint: ({ orderId }) => `/orders/${orderId}/auto-requote`,
    body: () => ({}),
  },

  proposeReoffer: {
    method: 'POST',
    endpoint: ({ orderId }) => `/orders/${orderId}/re-offer`,
    body: ({ newPrice, reasons, comments }) => ({
      newPrice,
      reasons,
      comments,
    }),
  },

  // ─────────────────────────────
  // EMAILS
  // ─────────────────────────────
  sendConditionEmail: {
    method: 'POST',
    endpoint: ({ orderId }) => `/orders/${orderId}/send-condition-email`,
    body: ({ reason, notes, label }) => ({
      reason,
      notes,
      label,
    }),
  },

  sendReviewRequest: {
    method: 'POST',
    endpoint: ({ orderId }) => `/orders/${orderId}/send-review-request`,
    body: ({ orderId }) => ({ orderId }), 
  },

  // ─────────────────────────────
  // ADMIN / MAINTENANCE
  // ─────────────────────────────
  clearData: {
    method: 'POST',
    endpoint: ({ orderId }) => `/orders/${orderId}/clear-data`,
    body: ({ selections }) => ({ selections }),
  },

  voidLabels: {
    method: 'POST',
    endpoint: ({ orderId }) => `/orders/${orderId}/void-label`,
    body: ({ labels }) => ({ labels }),
  },

  // ─────────────────────────────
  // REMINDERS (ADMIN)
  // ─────────────────────────────
  sendReminder: {
    method: 'POST',
    endpoint: () => `/admin/reminders/send`,
    body: ({ orderId }) => ({ orderId }),
  },

  sendExpiringReminder: {
    method: 'POST',
    endpoint: () => `/admin/reminders/send-expiring`,
    body: ({ orderId }) => ({ orderId }),
  },

  sendKitReminder: {
    method: 'POST',
    endpoint: () => `/admin/reminders/send-kit`,
    body: ({ orderId }) => ({ orderId }),
  },
};

// Date Formatter
const formatDate = (timestamp) => {
  if (!timestamp) return 'N/A';
  const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
  if (isNaN(date.getTime())) return 'Invalid Date';
  return new Intl.DateTimeFormat('en-US', { 
    month: 'short', day: 'numeric', year: 'numeric', 
    hour: 'numeric', minute: '2-digit' 
  }).format(date);
};

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
  if (s.includes('pending') || s.includes('requested') || s.includes('needs')) return 'bg-amber-100 text-amber-800 border-amber-200';
  if (s.includes('label') || s.includes('transit') || s.includes('sent') || s.includes('way')) return 'bg-blue-100 text-blue-800 border-blue-200';
  if (s.includes('received') || s.includes('qc') || s.includes('checked')) return 'bg-indigo-100 text-indigo-800 border-indigo-200';
  if (s.includes('paid') || s.includes('completed')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (s.includes('cancel') || s.includes('void')) return 'bg-slate-100 text-slate-600 border-slate-200';
  if (s.includes('re-offer') || s.includes('requote')) return 'bg-purple-100 text-purple-800 border-purple-200';
  return 'bg-slate-100 text-slate-800 border-slate-200';
};

// --- COMPONENTS ---

// 1. Status Badge
const StatusBadge = ({ status }) => (
  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(status)}`}>
    {formatStatusLabel(status)}
  </span>
);

// 2. Sidebar
const Sidebar = ({ activeTab, setActiveTab, onLogout, isOpen, setIsOpen }) => {
  const navItems = [
    { id: 'orders', label: 'Orders', icon: Package },
    { id: 'analytics', label: 'Analytics', icon: LayoutDashboard },
    { id: 'print', label: 'Print Queue', icon: Printer },
    { id: 'settings', label: 'Pricing', icon: Tag },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}
      
      {/* Sidebar Content */}
      <div className={`
        w-64 bg-white border-r border-slate-200 flex flex-col h-screen fixed left-0 top-0 z-40 transition-transform duration-300
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-6 flex items-center justify-between lg:justify-start gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md shadow-indigo-200">
              BB
            </div>
            <div>
              <h1 className="font-bold text-slate-900 leading-tight">BuyBacking</h1>
              <p className="text-xs text-slate-500 font-medium">Admin Console</p>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="lg:hidden text-slate-400">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2">Workspace</div>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setIsOpen(false);
              }}
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
    </>
  );
};

// 3. Login Screen
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
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200 border border-slate-100 sm:rounded-xl sm:px-10">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm font-medium text-slate-700">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full pl-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full pl-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>

            {error && (
              <div className="rounded-md bg-rose-50 p-4">
                <p className="text-sm font-medium text-rose-800">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 transition-all"
            >
              {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

// 4. QC Intake Wizard
const QCModal = ({ isOpen, onClose, order, onSubmit }) => {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    deviceMatch: order?.qcData?.deviceMatch || 'yes',
    deviceName: order?.qcData?.deviceName || order?.device || '',
    storage: order?.qcData?.storage || order?.storage || '',
    imei: order?.qcData?.imei || order?.imei || '',
    condition: order?.qcData?.condition || 'good',
    isFunctional: order?.qcData?.isFunctional || 'yes',
    hasCracks: order?.qcData?.hasCracks || 'no',
    isLocked: order?.qcData?.isLocked || 'no',
    hasBalance: order?.qcData?.hasBalance || 'no',
    notes: order?.qcData?.notes || ''
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
           {/* Recreated Toggle CSS logic with Tailwind since classes were missing */}
           <label className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 cursor-pointer group">
            <div className="flex items-center gap-3">
              <ShieldCheck className={data.isLocked === 'yes' ? "text-rose-500" : "text-slate-400"} />
              <span className="text-sm font-medium text-slate-900">iCloud / Google Locked?</span>
            </div>
            <div className="relative inline-flex items-center cursor-pointer">
               <input type="checkbox" className="sr-only peer" checked={data.isLocked === 'yes'} onChange={(e) => setData({...data, isLocked: e.target.checked ? 'yes' : 'no'})} />
               <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-rose-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
            </div>
          </label>

           <label className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 cursor-pointer group">
            <div className="flex items-center gap-3">
              <DollarSign className={data.hasBalance === 'yes' ? "text-amber-500" : "text-slate-400"} />
              <span className="text-sm font-medium text-slate-900">Finance / Balance Owed?</span>
            </div>
            <div className="relative inline-flex items-center cursor-pointer">
               <input type="checkbox" className="sr-only peer" checked={data.hasBalance === 'yes'} onChange={(e) => setData({...data, hasBalance: e.target.checked ? 'yes' : 'no'})} />
               <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-amber-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
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
          
           <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Internal Notes</label>
            <textarea 
              value={data.notes} 
              onChange={(e) => setData({...data, notes: e.target.value})}
              className="w-full border-slate-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500 h-20" 
              placeholder="Any additional details..."
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

// 5. Re-Offer Modal
const ReofferModal = ({ isOpen, onClose, order, onSubmit }) => {
  const [newPrice, setNewPrice] = useState('');
  const [reasons, setReasons] = useState('');
  const [comments, setComments] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(order.id, 'proposeReoffer', {
      newPrice: parseFloat(newPrice),
      reasons: reasons.split(',').map(s => s.trim()), // Simple CSV parsing for now
      comments
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
         <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900">Propose Re-offer</h3>
            <button onClick={onClose}><X size={20} className="text-slate-400"/></button>
         </div>
         <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Offer Amount ($)</label>
              <input type="number" step="0.01" required value={newPrice} onChange={e => setNewPrice(e.target.value)} className="w-full border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reasons (comma separated)</label>
              <input type="text" placeholder="Cracked Screen, Bad LCD..." required value={reasons} onChange={e => setReasons(e.target.value)} className="w-full border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Customer Comments</label>
              <textarea value={comments} onChange={e => setComments(e.target.value)} className="w-full border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 h-24"></textarea>
            </div>
            <div className="pt-2">
              <button type="submit" className="w-full bg-purple-600 text-white font-bold py-2.5 rounded-lg hover:bg-purple-700 transition-colors">Send Re-offer</button>
            </div>
         </form>
      </div>
    </div>
  );
};

// 6. Workflow Stepper
const WorkflowStepper = ({ status, hasLabel, hasQc }) => {
  let activeStep = 0;
  
  if ([STATUS.COMPLETED, STATUS.PAID, STATUS.REQUOTE_ACCEPTED].includes(status)) {
    activeStep = 4;
  } else if (hasQc || [STATUS.RECEIVED, STATUS.IMEI_CHECKED].includes(status)) {
    activeStep = 2; 
  } else if (hasLabel || [STATUS.KIT_SENT, STATUS.KIT_TRANSIT, STATUS.KIT_DELIVERED, STATUS.PHONE_TRANSIT, STATUS.DELIVERED_US].includes(status)) {
    activeStep = 1;
  } else if (status === STATUS.ORDER_PENDING || status === STATUS.SHIPPING_KIT_REQUESTED) {
    activeStep = 0;
  } else if (status === STATUS.CANCELLED) {
    activeStep = -1;
  }

  const steps = [
    { label: 'Pending', icon: Clock },
    { label: 'Label / Transit', icon: Truck },
    { label: 'Received / QC', icon: ShieldCheck },
    { label: 'Paid & Done', icon: CheckCircle }
  ];

  if (activeStep === -1) {
    return (
      <div className="px-6 py-3 bg-rose-50 border-b border-rose-100 flex items-center justify-center gap-2 text-rose-700 font-medium text-sm">
        <Ban size={16} /> This order has been cancelled.
      </div>
    );
  }

  return (
    <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-200">
      <div className="relative flex items-center justify-between w-full max-w-sm mx-auto">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-slate-200 -z-0"></div>
        <div 
          className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-indigo-600 -z-0 transition-all duration-500"
          style={{ width: `${(activeStep / (steps.length - 1)) * 100}%` }}
        ></div>

        {steps.map((step, index) => {
           const isActive = index <= activeStep;
           const isCurrent = index === activeStep;
           
           return (
             <div key={index} className="relative z-10 flex flex-col items-center gap-2">
               <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                 isActive 
                  ? 'bg-indigo-600 border-indigo-600 text-white' 
                  : 'bg-white border-slate-300 text-slate-400'
               }`}>
                 <step.icon size={14} />
               </div>
               <span className={`text-[10px] uppercase font-bold tracking-wider absolute -bottom-6 whitespace-nowrap ${
                 isCurrent ? 'text-indigo-700' : 'text-slate-400'
               }`}>
                 {step.label}
               </span>
             </div>
           );
        })}
      </div>
      <div className="h-4"></div> 
    </div>
  );
};

// 7. Drawer Component (Order Details)
const OrderDrawer = ({ order, onClose, onAction, onOpenQc, onOpenReoffer }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const isCancelled = order.status === STATUS.CANCELLED;
  const status = order.status || '';

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'shipping', label: 'Shipping & Tracking', icon: Truck },
    { id: 'qc', label: 'QC & Intake', icon: ShieldCheck },
    { id: 'logs', label: 'Activity Logs', icon: FileText },
  ];

  // --- BUTTON RENDER LOGIC (BASED ON STEPS) ---
  const renderActionButtons = () => {
    const btnPrimary = "flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 text-sm";
    const btnSecondary = "flex-1 bg-white border border-slate-300 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-50 transition-colors shadow-sm flex items-center justify-center gap-2 text-sm";
    const btnDanger = "px-4 py-3 bg-white border border-rose-200 text-rose-600 font-bold rounded-xl hover:bg-rose-50 transition-colors shadow-sm text-sm";

    // STEP 1: Pending
    if ([STATUS.ORDER_PENDING, STATUS.KIT_NEEDS_PRINTING, STATUS.NEEDS_PRINTING].includes(status)) {
      return (
        <div className="flex flex-col gap-3 w-full">
           <div className="flex gap-3 w-full">
            {!order.trackingNumber && (
              <button onClick={() => onAction(order.id, 'generateLabel')} className={btnPrimary}>
                <Tag size={16} /> Generate Label
              </button>
            )}
             <button onClick={() => onAction(order.id, 'markManuallyFulfilled')} className={btnSecondary}>
               <CheckCircle size={16} /> Mark Fulfilled
             </button>
           </div>
           <div className="flex gap-3 w-full">
             <button onClick={() => onAction(order.id, 'printPackingSlip')} className={btnSecondary}>
               <Printer size={16} /> Packing Slip
             </button>
             <button onClick={() => onAction(order.id, 'cancelOrder')} className={btnDanger}>
               Cancel
             </button>
             <button onClick={() => onAction(order.id, 'deleteOrder')} className={btnDanger}>
               <Trash2 size={16} />
             </button>
           </div>
        </div>
      );
    }

    // STEP 2: Shipping Kit Requested
    if (status === STATUS.SHIPPING_KIT_REQUESTED) {
      return (
        <div className="flex flex-col gap-3 w-full">
           <div className="flex gap-3 w-full">
             <button onClick={() => onAction(order.id, 'generateLabel')} className={btnPrimary}>
                <Tag size={16} /> Generate Label
             </button>
             <button onClick={() => onAction(order.id, 'markKitSent')} className={btnSecondary}>
               <Truck size={16} /> Mark I Sent
             </button>
           </div>
           <div className="flex gap-3 w-full">
             <button onClick={() => onAction(order.id, 'markReceived')} className={btnSecondary}>
               <Package size={16} /> Mark Received
             </button>
             <button onClick={() => onAction(order.id, 'printPackingSlip')} className={btnSecondary}>
               <Printer size={16} /> Slip
             </button>
             <button onClick={() => onAction(order.id, 'cancelOrder')} className={btnDanger}>
               Cancel
             </button>
           </div>
        </div>
      );
    }

    // STEP 3: Label Generated
    if ([STATUS.LABEL_GENERATED, STATUS.EMAILED].includes(status)) {
      const isKit = order.shippingMethod === 'kit' || order.shippingPreference === 'Shipping Kit';
      return (
        <div className="flex flex-col gap-3 w-full">
           <div className="flex gap-3 w-full">
             {isKit && (
               <button onClick={() => onAction(order.id, 'markKitSent')} className={btnSecondary}>
                 <Truck size={16} /> Mark I Sent
               </button>
             )}
             <button onClick={() => onAction(order.id, 'markReceived')} className={btnPrimary}>
               <Package size={16} /> Mark Received
             </button>
           </div>
           <div className="flex gap-3 w-full">
             <button onClick={() => onAction(order.id, 'printPackingSlip')} className={btnSecondary}>
               <Printer size={16} /> Print Slip
             </button>
             <button onClick={() => onAction(order.id, 'cancelOrder')} className={btnDanger}>
               Cancel
             </button>
           </div>
        </div>
      );
    }

    // STEP 4: In Transit
    if ([STATUS.KIT_TRANSIT, STATUS.KIT_DELIVERED, STATUS.PHONE_TRANSIT, STATUS.DELIVERED_US, STATUS.KIT_SENT].includes(status)) {
       return (
        <div className="flex flex-col gap-3 w-full">
           <button onClick={() => onAction(order.id, 'markReceived')} className={btnPrimary}>
             <Package size={16} /> Mark Received
           </button>
           <div className="flex gap-3 w-full">
             <button onClick={() => onAction(order.id, 'printPackingSlip')} className={btnSecondary}>
               <Printer size={16} /> Slip
             </button>
             <button onClick={() => onAction(order.id, 'cancelOrder')} className={btnDanger}>
               Cancel
             </button>
           </div>
        </div>
      );
    }

    // STEP 5: Received / Processing
    if ([STATUS.RECEIVED, STATUS.IMEI_CHECKED].includes(status)) {
      return (
        <div className="flex flex-col gap-3 w-full">
           <div className="flex gap-3 w-full">
              <button onClick={onOpenQc} className={btnPrimary}>
                <ShieldCheck size={16} /> {order.qcData ? 'Re-Do QC' : 'Start QC'}
              </button>
              <button onClick={() => onAction(order.id, 'markCompleted')} className={btnSecondary}>
                 <DollarSign size={16} /> Mark Completed
              </button>
           </div>
           
           <div className="grid grid-cols-2 gap-2">
              <button onClick={() => onAction(order.id, 'sendConditionEmail', { reason: 'balance', label: 'Balance Owed' })} className="px-2 py-2 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100 border border-amber-200">
                Email Balance Notice
              </button>
              <button onClick={() => onAction(order.id, 'sendConditionEmail', { reason: 'locked', label: 'Device Locked' })} className="px-2 py-2 bg-rose-50 text-rose-700 rounded-lg text-xs font-medium hover:bg-rose-100 border border-rose-200">
                Email Lock Notice
              </button>
               <button onClick={onOpenReoffer} className="px-2 py-2 bg-purple-50 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-100 border border-purple-200">
                Propose Re-offer
              </button>
              <button onClick={() => onAction(order.id, 'autoRequote')} className="px-2 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 border border-blue-200">
                Auto-Requote (75%)
              </button>
           </div>

           <div className="flex gap-3 w-full mt-2">
             <button onClick={() => onAction(order.id, 'printPackingSlip')} className={btnSecondary}>
               <Printer size={16} /> Slip
             </button>
             <button onClick={() => onAction(order.id, 'deleteOrder')} className={btnDanger}>
               <Trash2 size={16} />
             </button>
           </div>
        </div>
      );
    }

    // STEP 6: Re-Offer Steps
    if (status === STATUS.REOFFER_PENDING) {
      return (
         <div className="flex gap-3 w-full">
            <button onClick={() => onAction(order.id, 'autoRequote')} className={btnPrimary}>
              Finalize Reduced Payout (Auto)
            </button>
         </div>
      );
    }

    if (status === STATUS.REOFFER_ACCEPTED) {
       return (
         <div className="flex gap-3 w-full">
            <button onClick={() => onAction(order.id, 'markCompleted')} className={btnPrimary}>
               <DollarSign size={16} /> Pay Now
            </button>
         </div>
      );
    }
    
    if (status === STATUS.REOFFER_DECLINED) {
       return (
         <div className="flex gap-3 w-full">
            <button onClick={() => onAction(order.id, 'sendReturnLabel')} className={btnPrimary}>
               <RotateCcw size={16} /> Send Return Label
            </button>
         </div>
      );
    }

    // STEP 7: Completed
    if ([STATUS.COMPLETED, STATUS.REQUOTE_ACCEPTED, STATUS.PAID].includes(status)) {
      return (
        <div className="flex flex-col gap-3 w-full">
           <div className="w-full bg-emerald-50 text-emerald-700 font-bold py-3 rounded-xl border border-emerald-100 flex items-center justify-center gap-2">
             <CheckCircle size={18} /> Order Completed
           </div>
           <div className="flex gap-3 w-full">
             <button onClick={() => onAction(order.id, 'sendReviewRequest')} className={btnSecondary}>
               <CheckCircle size={16} /> Send Review Request
             </button>
             <button onClick={() => onAction(order.id, 'printPackingSlip')} className={btnSecondary}>
               <Printer size={16} /> Print Slip
             </button>
             <button onClick={() => onAction(order.id, 'deleteOrder')} className={btnDanger}>
               <Trash2 size={16} />
             </button>
           </div>
        </div>
      );
    }

    if (isCancelled) {
      return (
        <div className="w-full bg-slate-100 text-slate-500 font-medium py-3 rounded-xl text-center flex items-center justify-center gap-2">
           <Ban size={18} /> Order Cancelled
        </div>
      );
    }

    return <div className="text-center text-slate-400">Status unknown</div>;
  };

  // --- Universal Buttons (Conditional) ---
  const renderUniversalActions = () => {
    return (
       <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2">
          {/* Tracking Refresh */}
          {(order.shippingPreference === 'Shipping Kit' && order.trackingNumber) && (
            <button onClick={() => onAction(order.id, 'refreshTracking')} className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1 justify-center py-2">
              <RefreshCw size={12} /> Refresh Kit Tracking
            </button>
          )}
          {(order.shippingPreference === 'Email Label' && order.trackingNumber) && (
            <button onClick={() => onAction(order.id, 'refreshTracking')} className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1 justify-center py-2">
              <RefreshCw size={12} /> Refresh Label Tracking
            </button>
          )}
          
          {/* Admin Tools */}
          <button onClick={() => onAction(order.id, 'clearData', { selections: ['shipping'] })} className="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1 justify-center py-2">
            <Ban size={12} /> Clear Shipping Data
          </button>
           <button onClick={() => onAction(order.id, 'voidLabels', { labels: ['all'] })} className="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1 justify-center py-2">
            <Trash2 size={12} /> Void Labels
          </button>
          
          {/* Reminders */}
           <button onClick={() => onAction(order.id, 'sendReminder')} className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1 justify-center py-2">
            <Bell size={12} /> Standard Reminder
          </button>
           <button onClick={() => onAction(order.id, 'sendExpiringReminder')} className="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1 justify-center py-2">
            <AlertTriangle size={12} /> Expiring Notice
          </button>
           <button onClick={() => onAction(order.id, 'sendKitReminder')} className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1 justify-center py-2">
            <Truck size={12} /> Kit Reminder
          </button>
       </div>
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div 
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>

      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        
        <div className="bg-white z-10 px-6 py-4 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold text-slate-900">#{order.id}</h2>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-sm text-slate-500 flex items-center gap-2">
              <Clock size={14} /> Created {formatDate(order.createdAt)} ({getOrderAge(order.createdAt)})
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
            <X size={24} />
          </button>
        </div>

        <WorkflowStepper status={order.status} hasLabel={!!order.trackingNumber} hasQc={!!order.qcData} />

        <div className="px-6 border-b border-slate-200 bg-slate-50/50 flex space-x-6 overflow-x-auto scrollbar-hide">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-6 flex-1 overflow-y-auto bg-slate-50/30">
          
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
                   <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                     <Smartphone size={18} className="text-slate-400" /> Device
                   </h3>
                </div>
                <div className="p-5 flex items-start gap-4">
                  <div className="h-16 w-16 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 flex-shrink-0">
                    <Smartphone size={32} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-slate-900">{order.device}</h4>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="bg-slate-100 px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200">{order.storage}</span>
                      <span className="bg-slate-100 px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 uppercase">{order.carrier}</span>
                      <span className="bg-slate-100 px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 capitalize">{order.condition}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Offer</div>
                    <div className="text-2xl font-bold text-green-600">${parseFloat(order.totalPayout || 0).toFixed(2)}</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                    <User size={18} className="text-slate-400" /> Customer Info
                  </h3>
                </div>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs font-medium text-slate-400 uppercase block mb-1">Full Name</label>
                    <div className="text-sm font-medium text-slate-900">{order.shippingInfo?.fullName}</div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-400 uppercase block mb-1">Email Address</label>
                    <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
                      {order.shippingInfo?.email}
                      <a href={`mailto:${order.shippingInfo?.email}`} className="text-indigo-600 hover:text-indigo-800"><Mail size={14}/></a>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-400 uppercase block mb-1">Phone Number</label>
                    <div className="text-sm font-medium text-slate-900">{order.shippingInfo?.phone || 'N/A'}</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                   <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                     <CreditCard size={18} className="text-slate-400" /> Payment Details
                   </h3>
                </div>
                <div className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                     <div className="h-10 w-10 bg-green-50 rounded-full flex items-center justify-center text-green-600">
                        <DollarSign size={20} />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 capitalize">{order.paymentMethod}</div>
                        <div className="text-xs text-slate-500">
                          {order.paymentMethod === 'cashapp' && order.paymentDetails?.cashappTag}
                          {order.paymentMethod === 'paypal' && order.paymentDetails?.paypalEmail}
                          {order.paymentMethod === 'zelle' && (order.paymentDetails?.zelleIdentifier || order.paymentDetails?.zellePhone)}
                          {order.paymentMethod === 'check' && 'Check via Mail'}
                        </div>
                      </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'shipping' && (
            <div className="space-y-6 animate-in fade-in duration-300">
               <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                    <MapPin size={18} className="text-slate-400" /> Shipping Address
                  </h3>
                   <button className="text-xs text-indigo-600 font-medium hover:underline">Edit</button>
                </div>
                <div className="p-5">
                   <div className="text-sm text-slate-700 leading-relaxed">
                      <p className="font-medium text-slate-900">{order.shippingInfo?.fullName}</p>
                      <p>{order.shippingInfo?.streetAddress}</p>
                      <p>{order.shippingInfo?.city}, {order.shippingInfo?.state} {order.shippingInfo?.zipCode}</p>
                      <p className="text-slate-500 mt-1">United States</p>
                   </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                 <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                    <Truck size={18} className="text-slate-400" /> Tracking & Label
                  </h3>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="text-xs font-medium text-slate-400 uppercase block mb-1">Tracking Number</label>
                    <div className="flex gap-2">
                       <input 
                        type="text" 
                        readOnly 
                        value={order.trackingNumber || 'Pending Generation'} 
                        className="flex-1 bg-slate-50 border-slate-300 rounded-md text-sm text-slate-600 focus:ring-0"
                       />
                       {order.trackingNumber && (
                         <a 
                          href={`https://www.google.com/search?q=${order.trackingNumber}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-600 hover:bg-slate-50 flex items-center justify-center"
                         >
                           <ExternalLink size={16} />
                         </a>
                       )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'qc' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                    <ShieldCheck size={18} className="text-slate-400" /> QC Status
                  </h3>
                  {order.qcData && (
                     <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full font-medium">Completed</span>
                  )}
                </div>
                
                <div className="p-5">
                  {!order.qcData ? (
                    <div className="text-center py-8">
                       <div className="h-12 w-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                         <Search size={24} />
                       </div>
                       <h4 className="text-slate-900 font-medium mb-1">Inspection Required</h4>
                       <p className="text-sm text-slate-500 mb-4">No quality control data has been recorded for this order yet.</p>
                       {!isCancelled && (
                         <button 
                          onClick={onOpenQc}
                          className="bg-indigo-600 text-white font-medium py-2 px-6 rounded-lg text-sm shadow-sm hover:bg-indigo-700 transition-colors"
                         >
                           Start Inspection Wizard
                         </button>
                       )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                         <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                           <span className="text-xs text-slate-400 uppercase block">Device Match</span>
                           <span className={`text-sm font-bold ${order.qcData.deviceMatch === 'yes' ? 'text-emerald-600' : 'text-rose-600'}`}>
                             {order.qcData.deviceMatch === 'yes' ? 'Match' : 'Mismatch'}
                           </span>
                         </div>
                         <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                           <span className="text-xs text-slate-400 uppercase block">Functional</span>
                           <span className={`text-sm font-bold ${order.qcData.isFunctional === 'yes' ? 'text-emerald-600' : 'text-rose-600'}`}>
                             {order.qcData.isFunctional === 'yes' ? 'Yes' : 'No'}
                           </span>
                         </div>
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                           <span className="text-xs text-slate-400 uppercase block">Locks</span>
                           <span className={`text-sm font-bold ${order.qcData.isLocked === 'no' ? 'text-emerald-600' : 'text-rose-600'}`}>
                             {order.qcData.isLocked === 'no' ? 'None' : 'Locked'}
                           </span>
                         </div>
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                           <span className="text-xs text-slate-400 uppercase block">Cracks</span>
                           <span className={`text-sm font-bold ${order.qcData.hasCracks === 'no' ? 'text-emerald-600' : 'text-rose-600'}`}>
                             {order.qcData.hasCracks === 'no' ? 'None' : 'Present'}
                           </span>
                         </div>
                      </div>
                      
                      {order.qcData.notes && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <label className="text-xs font-medium text-slate-400 uppercase block mb-1">Inspector Notes</label>
                          <p className="text-sm text-slate-700 bg-amber-50 p-3 rounded-lg border border-amber-100">{order.qcData.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
             <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm animate-in fade-in duration-300">
               <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                    <FileText size={18} className="text-slate-400" /> Activity History
                  </h3>
                </div>
                <div className="p-5">
                   {order.activityLog ? (
                    <ul className="space-y-6">
                      {order.activityLog.slice().reverse().map((log, idx) => (
                        <li key={idx} className="relative pl-6 border-l-2 border-slate-200 last:border-0 pb-1">
                          <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-slate-200 border-2 border-white ring-1 ring-slate-100"></div>
                          <div className="flex flex-col">
                             <span className="text-sm font-medium text-slate-900">{log.message}</span>
                             <span className="text-xs text-slate-500 mt-0.5">{formatDate(log.at)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="italic text-center py-4 text-slate-500 text-sm">No activity recorded yet.</p>
                  )}
                </div>
             </div>
          )}

        </div>

        <div className="border-t border-slate-200 p-6 bg-white z-10">
          {renderActionButtons()}
          {renderUniversalActions()}
        </div>

      </div>
    </div>
  );
};

// 8. Main Dashboard
const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [qcModalOpen, setQcModalOpen] = useState(false);
  const [reofferModalOpen, setReofferModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  // 2. Orders Listener
  useEffect(() => {
    if (!db || !user) return;

    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAtMillis: doc.data().createdAt?.seconds ? doc.data().createdAt.seconds * 1000 : 0
      }));
      setOrders(ordersData);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Filter Logic (Using STATUS constant)
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'pending' && !(order.status === STATUS.ORDER_PENDING || order.status === STATUS.KIT_NEEDS_PRINTING)) return false;
        if (statusFilter === 'completed' && !(order.status === STATUS.COMPLETED || order.status === STATUS.PAID)) return false;
        if (statusFilter === 'cancelled' && order.status !== STATUS.CANCELLED) return false;
        if (statusFilter === 'received' && order.status !== STATUS.RECEIVED) return false;
      }
      if (searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        return (
          order.id.toLowerCase().includes(lowerTerm) ||
          order.shippingInfo?.fullName?.toLowerCase().includes(lowerTerm) ||
          order.device?.toLowerCase().includes(lowerTerm) ||
          order.shippingInfo?.email?.toLowerCase().includes(lowerTerm)
        );
      }
      return true;
    });
  }, [orders, statusFilter, searchTerm]);

  // 4. ACTION HANDLER (Refactored to use ACTION_MAP)
  const handleAction = async (orderId, actionType, payload = {}) => {
    if (!user) return;

    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    if (actionType === 'printPackingSlip') {
        window.open(`${API_BASE_URL}/orders/${orderId}/packing-slip`, '_blank');
        return;
    }

    const actionConfig = ACTION_MAP[actionType];
    if (!actionConfig) {
      console.warn("Unknown Action Type:", actionType);
      return;
    }

    try {
      const { method, endpoint, body } = actionConfig;

      // Resolve endpoint
      const url = typeof endpoint === 'function' 
        ? endpoint({ orderId, ...payload }) 
        : endpoint;

      // Resolve body
      let bodyData = null;
      if (body) {
        // Special logic for refreshTracking which needs order object context
        if (actionType === 'refreshTracking') {
             const type = (order.shippingPreference === 'Shipping Kit' || order.shippingMethod === 'kit') ? 'kit' : 'email';
             bodyData = { orderId, type };
        } else {
             bodyData = typeof body === 'function' ? body({ orderId, ...payload }) : body;
        }
      }

      await apiCall(url, method, bodyData, auth);
      console.log(`Action ${actionType} successful`);
      
    } catch (error) {
      alert(`Action failed: ${error.message}`);
    }
  };

  const handleQcSubmit = async (orderId, qcData) => {
    if (!db) return;
    try {
        const orderRef = doc(db, 'orders', orderId);
        await setDoc(orderRef, {
            qcData: qcData,
            status: 'received',
            qcCompletedAt: new Date()
        }, { merge: true });
        
        // Removed backend call as per request "QC should update Firestore (instant)"
    } catch(e) {
        console.error("QC Save Failed", e);
        alert("Failed to save QC data");
    }
  };

  if (authLoading) return <div className="h-screen w-full flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
  if (!user) return <LoginScreen auth={auth} />;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onLogout={() => signOut(auth)} 
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
      />

      <div className="flex-1 flex flex-col lg:ml-64 transition-all duration-300">
        
        <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-10 px-4 sm:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <button className="lg:hidden text-slate-500 hover:text-slate-700" onClick={() => setSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <Search className="text-slate-400 hidden sm:block" size={20} />
            <input 
              type="text" 
              placeholder="Search orders..." 
              className="bg-transparent border-none outline-none text-sm w-full placeholder:text-slate-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-slate-400 hover:bg-slate-50 rounded-full transition-colors">
              <Bell size={20} />
            </button>
            <div className="h-8 w-8 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-xs font-bold text-indigo-700">
              {user.email ? user.email.charAt(0).toUpperCase() : 'A'}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 overflow-y-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Order Management</h2>
              <p className="text-sm text-slate-500 mt-1">Overview of all buyback requests and fulfillment status.</p>
            </div>
          </div>

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
                          <ChevronRight size={18} className="text-slate-400" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {selectedOrder && (
        <OrderDrawer 
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onAction={handleAction}
          onOpenQc={() => setQcModalOpen(true)}
          onOpenReoffer={() => setReofferModalOpen(true)}
        />
      )}

      {selectedOrder && (
        <QCModal 
          isOpen={qcModalOpen} 
          onClose={() => setQcModalOpen(false)} 
          order={selectedOrder}
          onSubmit={handleQcSubmit}
        />
      )}

      {selectedOrder && (
        <ReofferModal
          isOpen={reofferModalOpen}
          onClose={() => setReofferModalOpen(false)}
          order={selectedOrder}
          onSubmit={handleAction}
        />
      )}

    </div>
  );
};

export default AdminDashboard;