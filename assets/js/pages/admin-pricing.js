import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, updateDoc, doc, setDoc, deleteField } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Firebase Config (your provided credentials)

const app = firebaseApp;
const auth = getAuth(app);
const db = getFirestore(app);

// Global state
let allDevices = [];
let filteredDevices = [];
const supportedBrands = ['iphone', 'samsung', 'google_pixel', 'ipad', 'macbook', 'other'];
const conditions = ['flawless', 'good', 'fair', 'damaged', 'broken', 'noPower'];
const exportConditions = ['flawless', 'good', 'fair', 'broken'];
const conditionLabels = {
flawless: 'Flawless',
good: 'Good',
fair: 'Fair',
damaged: 'Damaged',
broken: 'Broken',
noPower: 'No Power'
};
const usdFormatter = new Intl.NumberFormat('en-US', {
style: 'currency',
currency: 'USD',
minimumFractionDigits: 0,
maximumFractionDigits: 2
});

let brandOptionsInitialized = false;
let slugManuallyEdited = false;
let xmlImportPayload = [];

// DOM elements
const loadingIndicator = document.getElementById('loadingIndicator');
const deviceTableContainer = document.getElementById('deviceTableContainer');
const deviceTableBody = document.getElementById('deviceTableBody');
const searchInput = document.getElementById('searchInput');
const brandFilter = document.getElementById('brandFilter');
const statusMessage = document.getElementById('statusMessage');
const importModal = document.getElementById('importModal');
const importBtn = document.getElementById('importBtn');
const importXmlBtn = document.getElementById('importXmlBtn');
const exportXmlBtn = document.getElementById('exportXmlBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const excelFile = document.getElementById('excelFile');
const excelPreview = document.getElementById('excelPreview');
const processImportBtn = document.getElementById('processImportBtn');
const cancelImportBtn = document.getElementById('cancelImportBtn');
const importStatus = document.getElementById('importStatus');

const xmlImportModal = document.getElementById('xmlImportModal');
const closeXmlModalBtn = document.getElementById('closeXmlModalBtn');
const cancelXmlImportBtn = document.getElementById('cancelXmlImportBtn');
const processXmlImportBtn = document.getElementById('processXmlImportBtn');
const xmlFileInput = document.getElementById('xmlFile');
const xmlPreview = document.getElementById('xmlPreview');
const xmlPreviewBody = document.getElementById('xmlPreviewBody');
const xmlImportFeedback = document.getElementById('xmlImportFeedback');

const addDeviceModal = document.getElementById('addDeviceModal');
const addDeviceBtn = document.getElementById('addDeviceBtn');
const closeAddDeviceBtn = document.getElementById('closeAddDeviceBtn');
const cancelAddDeviceBtn = document.getElementById('cancelAddDeviceBtn');
const addDeviceForm = document.getElementById('addDeviceForm');
const addStorageRowBtn = document.getElementById('addStorageRowBtn');
const storageRows = document.getElementById('storageRows');
const newDeviceBrand = document.getElementById('newDeviceBrand');
const newDeviceName = document.getElementById('newDeviceName');
const newDeviceSlug = document.getElementById('newDeviceSlug');
const mobileDeviceWrapper = document.getElementById('mobileDeviceWrapper');
const mobileDeviceList = document.getElementById('mobileDeviceList');
const mobilePricingModal = document.getElementById('mobilePricingModal');
const mobileModalBody = document.getElementById('mobileModalBody');
const mobileModalTitle = document.getElementById('mobileModalTitle');
const mobileModalMeta = document.getElementById('mobileModalMeta');
const closeMobileModalBtn = document.getElementById('closeMobileModal');

function showStatus(message, type) {
statusMessage.textContent = message;
statusMessage.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-blue-100', 'text-blue-700');
if (type === 'error') {
statusMessage.classList.add('bg-red-100', 'text-red-700');
} else if (type === 'success') {
statusMessage.classList.add('bg-green-100', 'text-green-700');
} else {
statusMessage.classList.add('bg-blue-100', 'text-blue-700');
}
statusMessage.classList.remove('hidden');
}

function showXmlImportFeedback(message, type = 'info') {
if (!xmlImportFeedback) return;
xmlImportFeedback.textContent = message;
xmlImportFeedback.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-blue-100', 'text-blue-700');
if (type === 'error') {
xmlImportFeedback.classList.add('bg-red-100', 'text-red-700');
} else if (type === 'success') {
xmlImportFeedback.classList.add('bg-green-100', 'text-green-700');
} else {
xmlImportFeedback.classList.add('bg-blue-100', 'text-blue-700');
}
}

const formatConnectivityLabel = (value) => {
if (!value) {
return '';
}
const normalized = String(value).toLowerCase();
if (normalized === 'unlocked') return 'Unlocked';
if (normalized === 'locked') return 'Carrier Locked';
return normalized
.replace(/_/g, ' ')
.replace(/\b\w/g, (char) => char.toUpperCase());
};

const collectAllPrices = (device = {}) => {
const values = [];
if (!device || !device.prices) {
return values;
}
Object.values(device.prices).forEach((connectivityMap) => {
Object.values(connectivityMap || {}).forEach((conditionMap) => {
Object.values(conditionMap || {}).forEach((price) => {
const numericPrice = Number(price);
if (!Number.isNaN(numericPrice)) {
values.push(numericPrice);
}
});
});
});
return values;
};

const getTopOffer = (device = {}) => {
const values = collectAllPrices(device);
if (!values.length) {
return null;
}
return Math.max(...values);
};

const closeMobileModal = () => {
if (mobilePricingModal) {
mobilePricingModal.classList.remove('is-visible');
}
};

const openMobileModal = (device) => {
if (!mobilePricingModal || !mobileModalBody) {
return;
}

const storages = Object.keys(device?.prices || {});
if (mobileModalTitle) {
mobileModalTitle.textContent = device?.name || device?.slug || 'Device Pricing';
}
if (mobileModalMeta) {
const brandLabel = device?.brand ? formatBrandLabel(device.brand) : 'Uncategorized';
const storageLabel = storages.length === 1 ? '1 storage option' : `${storages.length} storage options`;
mobileModalMeta.textContent = storages.length ? `${brandLabel} · ${storageLabel}` : brandLabel;
}

mobileModalBody.innerHTML = '';

if (!storages.length) {
const emptyState = document.createElement('p');
emptyState.className = 'text-sm text-slate-500';
emptyState.textContent = 'No pricing data yet for this device.';
mobileModalBody.appendChild(emptyState);
} else {
storages.forEach((storage) => {
const connectivityMap = device.prices[storage] || {};
const section = document.createElement('section');
section.className = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';

const sectionHeader = document.createElement('div');
sectionHeader.className = 'flex items-center justify-between gap-3';

const storageTitle = document.createElement('h4');
storageTitle.className = 'text-sm font-semibold text-slate-700';
storageTitle.textContent = storage;
sectionHeader.appendChild(storageTitle);

const connectivityCount = Object.keys(connectivityMap).length;
const lockCountBadge = document.createElement('span');
lockCountBadge.className = 'text-xs font-medium text-slate-500';
lockCountBadge.textContent = connectivityCount === 1 ? '1 lock option' : `${connectivityCount} lock options`;
sectionHeader.appendChild(lockCountBadge);
section.appendChild(sectionHeader);

const connectivityContainer = document.createElement('div');
connectivityContainer.className = 'mt-3 space-y-3';

if (!connectivityCount) {
const noPricing = document.createElement('p');
noPricing.className = 'text-sm text-slate-500';
noPricing.textContent = 'No connectivity pricing yet.';
connectivityContainer.appendChild(noPricing);
} else {
Object.entries(connectivityMap).forEach(([connectivity, priceSet]) => {
const card = document.createElement('div');
card.className = 'rounded-xl border border-slate-200 bg-slate-100/60 p-3';

const cardHeader = document.createElement('div');
cardHeader.className = 'flex items-center justify-between';

const connectivityLabel = document.createElement('span');
connectivityLabel.className = 'text-sm font-semibold text-slate-700';
connectivityLabel.textContent = formatConnectivityLabel(connectivity);
cardHeader.appendChild(connectivityLabel);

const deleteButton = document.createElement('button');
deleteButton.type = 'button';
deleteButton.className = 'text-xs font-semibold text-red-500 hover:text-red-600';
deleteButton.textContent = 'Remove';
deleteButton.dataset.docId = device.docId;
deleteButton.dataset.docPath = device.documentPath;
deleteButton.dataset.storage = storage;
deleteButton.dataset.connectivity = connectivity;
deleteButton.dataset.storageCount = String(storages.length);
deleteButton.dataset.connectivityCount = String(connectivityCount);
deleteButton.addEventListener('click', handleRowDeletion);
cardHeader.appendChild(deleteButton);

card.appendChild(cardHeader);

const fieldsGrid = document.createElement('div');
fieldsGrid.className = 'mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3';

let hasPricingField = false;
conditions.forEach((condition) => {
if (!priceSet || priceSet[condition] === undefined) {
return;
}
hasPricingField = true;
const field = document.createElement('label');
field.className = 'flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600';

const labelText = document.createElement('span');
labelText.textContent = conditionLabels[condition] || formatCondition(condition);
field.appendChild(labelText);

const inputWrapper = document.createElement('div');
inputWrapper.className = 'mt-1 flex items-center gap-1';

const dollar = document.createElement('span');
dollar.className = 'text-slate-400';
dollar.textContent = '$';
inputWrapper.appendChild(dollar);

const input = document.createElement('input');
input.type = 'number';
input.value = priceSet[condition] ?? 0;
input.className = 'w-full rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';
input.dataset.docId = device.docId;
input.dataset.docPath = device.documentPath;
input.dataset.storage = storage;
input.dataset.connectivity = connectivity;
input.dataset.condition = condition;
input.addEventListener('blur', (event) => window.handlePriceUpdate(event.target));
input.addEventListener('keypress', (event) => {
if (event.key === 'Enter') {
event.preventDefault();
event.target.blur();
}
});
inputWrapper.appendChild(input);

field.appendChild(inputWrapper);
fieldsGrid.appendChild(field);
});

if (!hasPricingField) {
const missing = document.createElement('p');
missing.className = 'text-xs text-slate-500';
missing.textContent = 'No condition pricing available.';
fieldsGrid.appendChild(missing);
}

card.appendChild(fieldsGrid);
connectivityContainer.appendChild(card);
});
}

section.appendChild(connectivityContainer);
mobileModalBody.appendChild(section);
});
}

mobilePricingModal.classList.add('is-visible');
};

const renderMobileCards = (devices = []) => {
if (!mobileDeviceList) {
return;
}

mobileDeviceList.innerHTML = '';
if (mobileDeviceWrapper) {
mobileDeviceWrapper.classList.toggle('hidden', devices.length === 0);
}

if (!devices.length) {
return;
}

devices.forEach((device) => {
const card = document.createElement('article');
card.className = 'rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm';

const storages = Object.keys(device.prices || {});
const totalPriceSets = storages.reduce((count, storage) => {
return count + Object.keys(device.prices[storage] || {}).length;
}, 0);
const topOffer = getTopOffer(device);
const topOfferText = typeof topOffer === 'number' ? usdFormatter.format(topOffer) : 'No pricing yet';

const header = document.createElement('div');
header.className = 'flex items-start justify-between gap-3';

const titleGroup = document.createElement('div');
const brandLabel = document.createElement('p');
brandLabel.className = 'text-xs uppercase tracking-wide text-slate-500';
brandLabel.textContent = device.brand ? formatBrandLabel(device.brand) : 'Uncategorized';
titleGroup.appendChild(brandLabel);

const deviceTitle = document.createElement('h2');
deviceTitle.className = 'text-lg font-semibold text-slate-800';
deviceTitle.textContent = device.name || device.slug;
titleGroup.appendChild(deviceTitle);

const summary = document.createElement('p');
summary.className = 'mt-1 text-sm text-slate-500';
const storageLabel = storages.length === 1 ? '1 storage option' : `${storages.length} storage options`;
const priceSetLabel = totalPriceSets === 1 ? '1 price set' : `${totalPriceSets} price sets`;
summary.textContent = `${storageLabel} · ${priceSetLabel}`;
titleGroup.appendChild(summary);

header.appendChild(titleGroup);

const badge = document.createElement('span');
badge.className = 'rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600';
badge.textContent = topOfferText;
header.appendChild(badge);

card.appendChild(header);

if (storages.length) {
const storageChips = document.createElement('div');
storageChips.className = 'mt-3 flex flex-wrap gap-2';
storages.slice(0, 3).forEach((storage) => {
const chip = document.createElement('span');
chip.className = 'inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600';
chip.textContent = storage;
storageChips.appendChild(chip);
});
if (storages.length > 3) {
const overflow = document.createElement('span');
overflow.className = 'text-xs text-slate-400';
overflow.textContent = `+${storages.length - 3} more`;
storageChips.appendChild(overflow);
}
card.appendChild(storageChips);
}

const actionBar = document.createElement('div');
actionBar.className = 'mt-4';
const manageButton = document.createElement('button');
manageButton.type = 'button';
manageButton.className = 'inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500';
manageButton.innerHTML = '<i class="fas fa-pen-to-square"></i> Manage Pricing';
manageButton.addEventListener('click', () => openMobileModal(device));
actionBar.appendChild(manageButton);
card.appendChild(actionBar);

mobileDeviceList.appendChild(card);
});
};

if (closeMobileModalBtn) {
closeMobileModalBtn.addEventListener('click', closeMobileModal);
}

if (mobilePricingModal) {
mobilePricingModal.addEventListener('click', (event) => {
if (event.target === mobilePricingModal) {
closeMobileModal();
}
});
}

document.addEventListener('keydown', (event) => {
if (event.key === 'Escape' && mobilePricingModal && mobilePricingModal.classList.contains('is-visible')) {
closeMobileModal();
}
});

function resetXmlImportModal() {
if (!xmlFileInput) return;
xmlFileInput.value = '';
xmlPreviewBody.innerHTML = '';
xmlPreview.classList.add('hidden');
xmlImportFeedback.classList.add('hidden');
xmlImportFeedback.textContent = '';
processXmlImportBtn.classList.add('hidden');
processXmlImportBtn.disabled = false;
processXmlImportBtn.textContent = 'Import XML';
xmlImportPayload = [];
}

function normalizeSlugSegment(value) {
return String(value || '')
.toLowerCase()
.replace(/[^a-z0-9]+/g, '-')
.replace(/^-+|-+$/g, '');
}

function computeDeeplink(device) {
const brandSegment = normalizeSlugSegment(device.brand || device.parentDevice);
const slugSource = device.slug || device.docId || device.modelID || device.name;
const slugSegment = normalizeSlugSegment(slugSource);

if (!brandSegment && !slugSegment) {
return null;
}

let deviceSegment = slugSegment;
if (brandSegment && deviceSegment && !deviceSegment.startsWith(`${brandSegment}-`)) {
deviceSegment = `${brandSegment}-${deviceSegment}`;
} else if (!deviceSegment) {
deviceSegment = brandSegment;
}

deviceSegment = deviceSegment.replace(/-+/g, '-');
if (!deviceSegment) {
return null;
}

return `https://secondhandcell.com/sell/?device=${deviceSegment}&storage={storage}&carrier={carrier}&power={power}&functionality={functionality}&quality={quality}`;
}

function formatXml(xmlString) {
const PADDING = '  ';
const reg = /(>)(<)(\/*)/g;
const xml = xmlString.replace(reg, '$1\n$2$3');
const lines = xml.split('\n').map(line => line.trim()).filter(Boolean);
let formatted = '';
let pad = 0;

lines.forEach((line) => {
if (/^<\//.test(line)) {
pad = Math.max(pad - 1, 0);
}

const indentation = PADDING.repeat(pad);
formatted += `${indentation}${line}\n`;

if (/^<[^!?][^>]*[^/]>$/.test(line)) {
pad += 1;
}
});

return formatted.trimEnd();
}

function buildXmlString(devices) {
const xmlDocument = document.implementation.createDocument('', 'models');
const root = xmlDocument.documentElement;

const sortedDevices = [...devices].sort((a, b) => {
const brandA = String(a.brand || a.parentDevice || '');
const brandB = String(b.brand || b.parentDevice || '');
const brandCompare = brandA.localeCompare(brandB, undefined, { sensitivity: 'base' });
if (brandCompare !== 0) return brandCompare;

const nameA = String(a.name || a.slug || a.docId || '');
const nameB = String(b.name || b.slug || b.docId || '');
return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
});

sortedDevices.forEach((device) => {
const modelNode = xmlDocument.createElement('model');
root.appendChild(modelNode);

const parentDeviceNode = xmlDocument.createElement('parentDevice');
parentDeviceNode.textContent = device.brand || device.parentDevice || '';
modelNode.appendChild(parentDeviceNode);

const modelIdNode = xmlDocument.createElement('modelID');
modelIdNode.textContent = device.slug || device.docId || device.modelID || '';
modelNode.appendChild(modelIdNode);

const prices = device.prices || {};
Object.keys(prices).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).forEach((storageSize) => {
const connectivityBands = prices[storageSize] || {};
const priceValueNode = xmlDocument.createElement('priceValue');
let hasConnectivity = false;

Object.keys(connectivityBands).sort().forEach((connectivity) => {
const conditionMap = connectivityBands[connectivity] || {};
const connectivityNode = xmlDocument.createElement(connectivity);
let hasCondition = false;

exportConditions.forEach((condition) => {
const value = conditionMap[condition];
if (value !== undefined && value !== null && value !== '') {
const conditionNode = xmlDocument.createElement(condition);
conditionNode.textContent = String(value);
connectivityNode.appendChild(conditionNode);
hasCondition = true;
}
});

if (hasCondition) {
priceValueNode.appendChild(connectivityNode);
hasConnectivity = true;
}
});

if (hasConnectivity) {
const pricesNode = xmlDocument.createElement('prices');
const storageNode = xmlDocument.createElement('storageSize');
storageNode.textContent = storageSize;
pricesNode.appendChild(storageNode);
pricesNode.appendChild(priceValueNode);
modelNode.appendChild(pricesNode);
}
});

if (device.slug) {
const slugNode = xmlDocument.createElement('slug');
slugNode.textContent = device.slug;
modelNode.appendChild(slugNode);
}

if (device.imageUrl) {
const imageNode = xmlDocument.createElement('imageUrl');
imageNode.textContent = device.imageUrl;
modelNode.appendChild(imageNode);
}

if (device.name) {
const nameNode = xmlDocument.createElement('name');
nameNode.textContent = device.name;
modelNode.appendChild(nameNode);
}

const brandNode = xmlDocument.createElement('brand');
brandNode.textContent = device.brand || device.parentDevice || '';
modelNode.appendChild(brandNode);

const deeplinkValue = device.deeplink || computeDeeplink(device);
if (deeplinkValue) {
const deeplinkNode = xmlDocument.createElement('deeplink');
deeplinkNode.textContent = deeplinkValue;
modelNode.appendChild(deeplinkNode);
}
});

const serializer = new XMLSerializer();
const rawXml = serializer.serializeToString(xmlDocument);
return `<?xml version="1.0" encoding="UTF-8"?>\n${formatXml(rawXml)}`;
}

function triggerXmlDownload(xmlString) {
const blob = new Blob([xmlString], { type: 'application/xml' });
const url = URL.createObjectURL(blob);
const anchor = document.createElement('a');
const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
anchor.href = url;
anchor.download = `device-prices-${timestamp}.xml`;
document.body.appendChild(anchor);
anchor.click();
document.body.removeChild(anchor);
URL.revokeObjectURL(url);
}

function parseXmlFeed(content) {
const parser = new DOMParser();
const xmlDocument = parser.parseFromString(content, 'application/xml');
const parserError = xmlDocument.querySelector('parsererror');
if (parserError) {
throw new Error('Invalid XML format.');
}

const models = [];
const warnings = [];

const modelNodes = xmlDocument.querySelectorAll('model');
modelNodes.forEach((modelNode, index) => {
const getText = (selector) => {
const node = modelNode.querySelector(selector);
return node ? node.textContent.trim() : '';
};

const brandRaw = getText('brand') || getText('parentDevice');
const slugRaw = getText('slug') || getText('modelID');

const brand = brandRaw ? brandRaw.trim().toLowerCase() : '';
const slug = normalizeSlugSegment(slugRaw);

if (!brand || !slug) {
warnings.push(`Skipped model at position ${index + 1} due to missing brand or slug.`);
return;
}

const prices = {};
let hasPricing = false;

modelNode.querySelectorAll('prices').forEach((pricesNode) => {
const storageSize = (pricesNode.querySelector('storageSize')?.textContent || '').trim();
if (!storageSize) {
return;
}

const priceValueNode = pricesNode.querySelector('priceValue');
if (!priceValueNode) {
return;
}

const connectivityMap = {};

Array.from(priceValueNode.children).forEach((connectivityNode) => {
const connectivityKey = connectivityNode.tagName.toLowerCase();
const conditionEntries = {};

Array.from(connectivityNode.children).forEach((conditionNode) => {
const conditionKey = conditionNode.tagName.toLowerCase();
const numericValue = parseFloat(conditionNode.textContent);
if (!Number.isNaN(numericValue)) {
conditionEntries[conditionKey] = numericValue;
}
});

if (Object.keys(conditionEntries).length > 0) {
connectivityMap[connectivityKey] = conditionEntries;
}
});

if (Object.keys(connectivityMap).length > 0) {
prices[storageSize] = connectivityMap;
hasPricing = true;
}
});

if (!hasPricing) {
warnings.push(`No pricing data found for ${brand}/${slug}.`);
return;
}

const modelData = {
brand,
slug,
name: getText('name'),
imageUrl: getText('imageUrl'),
deeplink: getText('deeplink'),
prices
};

models.push(modelData);
});

return { models, warnings };
}

function renderXmlPreview(models) {
xmlPreviewBody.innerHTML = '';
if (!models.length) {
xmlPreview.classList.add('hidden');
return;
}

models.forEach((model) => {
const row = document.createElement('tr');
const storages = Object.keys(model.prices)
.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
.join(', ');

row.innerHTML = `
<td class="py-2 px-3 text-sm text-gray-900">${formatBrandLabel(model.brand)}</td>
<td class="py-2 px-3 text-sm text-gray-600">${model.name || '—'}</td>
<td class="py-2 px-3 text-sm text-gray-600">${model.slug}</td>
<td class="py-2 px-3 text-sm text-gray-500">${storages || '—'}</td>
`;

xmlPreviewBody.appendChild(row);
});

xmlPreview.classList.remove('hidden');
}

async function handleXmlFileSelect(event) {
const file = event.target.files?.[0];
if (!file) {
return;
}

try {
const content = await file.text();
const { models, warnings } = parseXmlFeed(content);
xmlImportPayload = models;

if (!models.length) {
renderXmlPreview([]);
showXmlImportFeedback('No valid models were found in the XML file.', 'error');
xmlImportFeedback.classList.remove('hidden');
processXmlImportBtn.classList.add('hidden');
return;
}

renderXmlPreview(models);

let message = `Ready to import ${models.length} model${models.length === 1 ? '' : 's'}.`;
if (warnings.length) {
message += ` ${warnings.length} entr${warnings.length === 1 ? 'y was' : 'ies were'} skipped.`;
}

showXmlImportFeedback(message, warnings.length ? 'info' : 'success');
xmlImportFeedback.classList.remove('hidden');
processXmlImportBtn.classList.remove('hidden');
} catch (error) {
console.error('Failed to parse XML file:', error);
xmlImportPayload = [];
renderXmlPreview([]);
showXmlImportFeedback(error.message || 'Failed to read the XML file.', 'error');
xmlImportFeedback.classList.remove('hidden');
processXmlImportBtn.classList.add('hidden');
}
}

async function processXmlImport() {
if (!xmlImportPayload.length) {
showXmlImportFeedback('Select an XML file with device pricing before importing.', 'error');
xmlImportFeedback.classList.remove('hidden');
return;
}

const originalText = processXmlImportBtn.textContent;
processXmlImportBtn.textContent = 'Importing...';
processXmlImportBtn.disabled = true;

let successCount = 0;
let errorCount = 0;

for (const model of xmlImportPayload) {
try {
const collectionPath = `devices/${model.brand}/models`;
const docRef = doc(db, collectionPath, model.slug);
const payload = {
brand: model.brand,
slug: model.slug,
prices: model.prices
};

if (model.name) payload.name = model.name;
if (model.imageUrl) payload.imageUrl = model.imageUrl;
if (model.deeplink) payload.deeplink = model.deeplink;

await setDoc(docRef, payload, { merge: true });
successCount++;
} catch (error) {
console.error(`Failed to import ${model.brand}/${model.slug}:`, error);
errorCount++;
}
}

processXmlImportBtn.textContent = originalText;
processXmlImportBtn.disabled = false;

if (errorCount === 0) {
showXmlImportFeedback(`Successfully imported ${successCount} model${successCount === 1 ? '' : 's'}.`, 'success');
showStatus('XML pricing import completed successfully.', 'success');
} else {
showXmlImportFeedback(`Imported ${successCount} model${successCount === 1 ? '' : 's'} with ${errorCount} error${errorCount === 1 ? '' : 's'}. Check console for details.`, 'error');
showStatus('XML pricing import completed with some errors. Check console for details.', 'error');
}

xmlImportFeedback.classList.remove('hidden');

if (successCount && errorCount === 0) {
setTimeout(() => {
xmlImportModal.classList.remove('is-visible');
resetXmlImportModal();
}, 800);
}

await fetchDevices();
}

function handleExportXml() {
if (!allDevices.length) {
showStatus('Device data is still loading. Please try exporting once the table appears.', 'info');
return;
}

try {
const xmlString = buildXmlString(allDevices);
triggerXmlDownload(xmlString);
showStatus('XML export generated successfully.', 'success');
} catch (error) {
console.error('Failed to generate XML export:', error);
showStatus('Failed to create XML export. Check console for details.', 'error');
}
}

// --- AUTHENTICATION ---
onAuthStateChanged(auth, async (user) => {
if (user) {
console.log("User is authenticated:", user.uid);
await fetchDevices();
} else {
console.log("No user is signed in. Signing in anonymously...");
try {
await signInAnonymously(auth);
await fetchDevices();
} catch (error) {
console.error("Anonymous auth failed:", error);
showStatus("Authentication failed. Please check Firebase Auth settings.", "error");
}
}
});

// --- FETCH & RENDER DEVICES ---
const fetchDevices = async () => {
loadingIndicator.classList.remove('hidden');
deviceTableContainer.classList.add('hidden');
if (mobileDeviceList) {
mobileDeviceList.innerHTML = '';
}
if (mobileDeviceWrapper) {
mobileDeviceWrapper.classList.add('hidden');
}
allDevices = [];

try {
for (const brand of supportedBrands) {
const collectionPath = `devices/${brand}/models`;
const querySnapshot = await getDocs(collection(db, collectionPath));
querySnapshot.forEach((doc) => {
const data = doc.data();
allDevices.push({ ...data, brand: brand, docId: doc.id, documentPath: collectionPath });
});
}
} catch (error) {
console.error("Error fetching devices from Firestore:", error);
showStatus("Failed to load device data. Check console for details.", "error");
}
applyFilters();
};

const renderTable = (devices) => {
deviceTableBody.innerHTML = '';
loadingIndicator.classList.add('hidden');
if (devices.length > 0) {
deviceTableContainer.classList.remove('hidden');
} else {
deviceTableContainer.classList.add('hidden');
showStatus("No devices found.", "info");
return;
}

devices.forEach(device => {
const deviceData = device.prices;
for (const storage in deviceData) {
const storageData = deviceData[storage];
const storageCount = Object.keys(deviceData).length;
const connectivityTotal = Object.keys(storageData).length;
for (const connectivity in storageData) {
const prices = storageData[connectivity];
const row = `
<tr class="hover:bg-gray-50">
<td class="py-3 px-4 whitespace-nowrap text-sm text-gray-900 flex items-center">
${device.brand.includes('ipad') || device.brand.includes('macbook') ?
`<i class="fas fa-tablet-alt text-xl mr-2"></i>` :
`<i class="fas fa-mobile-alt text-xl mr-2"></i>`}
${device.name}
</td>
<td class="py-3 px-4 whitespace-nowrap text-sm text-gray-500">${storage}</td>
<td class="py-3 px-4 whitespace-nowrap text-sm font-semibold ${connectivity === 'unlocked' ? 'text-green-600' : 'text-red-600'}">${connectivity}</td>
${conditions.map(condition => `
<td class="py-3 px-4 whitespace-nowrap text-sm text-gray-900">
<div class="flex items-center">
<span>$</span>
<input type="number" value="${prices[condition] || 0}"
class="w-24 border rounded-lg px-2 py-1 text-center"
data-doc-id="${device.docId}"
data-doc-path="${device.documentPath}"
data-storage="${storage}"
data-connectivity="${connectivity}"
data-condition="${condition}"
onblur="handlePriceUpdate(this)"
onkeypress="if(event.key === 'Enter') this.blur();">
</div>
</td>
`).join('')}
<td class="py-3 px-4 whitespace-nowrap text-sm text-gray-900">
<button class="delete-row-btn text-red-500 hover:text-red-700"
data-doc-id="${device.docId}"
data-doc-path="${device.documentPath}"
data-storage="${storage}"
data-connectivity="${connectivity}"
data-storage-count="${storageCount}"
data-connectivity-count="${connectivityTotal}">
<i class="fas fa-trash"></i>
</button>
</td>
</tr>
`;
deviceTableBody.insertAdjacentHTML('beforeend', row);
}
}
});
attachDeleteHandlers();
};

const applyFilters = () => {
const searchText = searchInput.value.toLowerCase();
const brand = brandFilter.value;

filteredDevices = allDevices.filter(device => {
const matchesSearch = device.name.toLowerCase().includes(searchText) || (device.brand && device.brand.toLowerCase().includes(searchText));
const matchesBrand = brand === 'all' || (device.brand && device.brand.toLowerCase() === brand);
return matchesSearch && matchesBrand;
});

renderTable(filteredDevices);
renderMobileCards(filteredDevices);
    };

searchInput.addEventListener('input', applyFilters);
brandFilter.addEventListener('change', applyFilters);

// --- UPDATE PRICE LOGIC ---
window.handlePriceUpdate = async (element) => {
const newPrice = parseFloat(element.value);
if (isNaN(newPrice) || newPrice < 0) {
showStatus("Invalid price entered.", "error");
element.value = element.defaultValue; // Revert to old value
return;
}

const docId = element.dataset.docId;
const docPath = element.dataset.docPath;
const storage = element.dataset.storage;
const connectivity = element.dataset.connectivity;
const condition = element.dataset.condition;
const docRef = doc(db, docPath, docId);

try {
// Use a batched write to ensure atomicity and avoid race conditions
await setDoc(docRef, {
prices: {
[storage]: {
[connectivity]: {
[condition]: newPrice
}
}
}
}, { merge: true });

element.defaultValue = newPrice;
showStatus(`Price for ${docId} (${storage} - ${connectivity} - ${condition}) updated successfully!`, "success");
} catch (e) {
console.error("Failed to update price: ", e);
showStatus("Failed to update price. Check console for details.", "error");
element.value = element.defaultValue; // Revert on error
}
};

function attachDeleteHandlers() {
document.querySelectorAll('.delete-row-btn').forEach(button => {
button.addEventListener('click', handleRowDeletion);
});
}

async function handleRowDeletion(event) {
const button = event.currentTarget;
const docId = button.dataset.docId;
const docPath = button.dataset.docPath;
const storage = button.dataset.storage;
const connectivity = button.dataset.connectivity;
const storageCount = parseInt(button.dataset.storageCount || '0', 10);
const connectivityCount = parseInt(button.dataset.connectivityCount || '0', 10);

if (!docId || !docPath || !storage || !connectivity) {
showStatus('Missing metadata for deletion.', 'error');
return;
}

const deviceLabel = `${storage} (${connectivity})`;
if (!confirm(`Remove pricing for ${deviceLabel}?`)) {
return;
}

try {
const docRef = doc(db, docPath, docId);
const payload = {
[`prices.${storage}.${connectivity}`]: deleteField()
};

if (connectivityCount <= 1) {
payload[`prices.${storage}`] = deleteField();
}
if (storageCount <= 1 && connectivityCount <= 1) {
payload['prices'] = deleteField();
}

await updateDoc(docRef, payload);
showStatus(`Removed ${deviceLabel}.`, 'success');
fetchDevices();
} catch (error) {
console.error('Failed to delete pricing row:', error);
showStatus('Failed to delete pricing entry. Check console for details.', 'error');
}
}

function openAddDeviceModal() {
populateBrandOptions();
resetAddDeviceForm();
addDeviceModal.classList.add('is-visible');
}

function closeAddDeviceModal() {
addDeviceModal.classList.remove('is-visible');
}

function populateBrandOptions() {
if (brandOptionsInitialized) {
return;
}
newDeviceBrand.innerHTML = supportedBrands
.map(brand => `<option value="${brand}">${formatBrandLabel(brand)}</option>`)
.join('');
brandOptionsInitialized = true;
}

function resetAddDeviceForm() {
addDeviceForm.reset();
slugManuallyEdited = false;
storageRows.innerHTML = '';
storageRows.appendChild(createStorageRow({ connectivity: 'unlocked' }));
}

function formatBrandLabel(brand) {
return brand.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function formatCondition(condition) {
if (!condition) {
return '';
}
return String(condition)
.replace(/([A-Z])/g, ' $1')
.replace(/_/g, ' ')
.trim()
.replace(/^\w/, char => char.toUpperCase());
}

function createStorageRow(initial = {}) {
const row = document.createElement('div');
row.className = 'storage-row';
const storageValue = initial.storage || '';
const connectivityValue = initial.connectivity || 'unlocked';
const priceMap = initial.prices || {};
row.innerHTML = `
<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
<div>
<label class="block text-sm font-medium text-slate-600 mb-1">Storage</label>
<input type="text" class="storage-input w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g., 128GB" value="${storageValue}" required>
</div>
<div>
<label class="block text-sm font-medium text-slate-600 mb-1">Connectivity</label>
<input type="text" class="connectivity-input w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g., unlocked" value="${connectivityValue}" required>
</div>
</div>
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
${conditions.map(condition => `
<div>
<label class="block text-sm font-medium text-slate-600 mb-1">${formatCondition(condition)}</label>
<input type="number" min="0" step="1" class="price-input w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" data-condition="${condition}" value="${priceMap[condition] ?? ''}" required>
</div>
`).join('')}
</div>
<div class="text-right mt-4">
<button type="button" class="remove-storage-row text-sm">Remove storage</button>
</div>
`;
return row;
}

async function handleAddDeviceSubmit(event) {
event.preventDefault();

const brand = newDeviceBrand.value;
const name = newDeviceName.value.trim();
let slug = newDeviceSlug.value.trim();

if (!slug) {
slug = slugify(name);
}

if (!brand || !name || !slug) {
showStatus('Please complete all device fields before saving.', 'error');
return;
}

const pricingPayload = {};
let hasPricing = false;

storageRows.querySelectorAll('.storage-row').forEach(row => {
const storageInput = row.querySelector('.storage-input');
const connectivityInput = row.querySelector('.connectivity-input');
if (!storageInput || !connectivityInput) {
return;
}
const storageValue = storageInput.value.trim();
const connectivityValue = connectivityInput.value.trim().toLowerCase();
if (!storageValue || !connectivityValue) {
return;
}
if (!pricingPayload[storageValue]) {
pricingPayload[storageValue] = {};
}
const conditionPrices = {};
row.querySelectorAll('.price-input').forEach(input => {
const condition = input.dataset.condition;
const price = parseFloat(input.value);
conditionPrices[condition] = Number.isNaN(price) ? 0 : price;
});
pricingPayload[storageValue][connectivityValue] = conditionPrices;
hasPricing = true;
});

if (!hasPricing) {
showStatus('Add at least one storage row with pricing before saving.', 'error');
return;
}

const docPath = `devices/${brand}/models`;
const docRef = doc(db, docPath, slug);

try {
showStatus(`Saving pricing for ${name}…`, 'info');
await setDoc(docRef, {
name,
slug,
brand,
prices: pricingPayload
}, { merge: true });
showStatus(`Pricing for ${name} saved successfully.`, 'success');
closeAddDeviceModal();
fetchDevices();
} catch (error) {
console.error('Error saving pricing:', error);
showStatus('Failed to save pricing. Check console for details.', 'error');
}
}

function slugify(value) {
return value
.toLowerCase()
.trim()
.replace(/[^a-z0-9]+/g, '-')
.replace(/^-+|-+$/g, '');
}

addDeviceBtn.addEventListener('click', openAddDeviceModal);
closeAddDeviceBtn.addEventListener('click', closeAddDeviceModal);
cancelAddDeviceBtn.addEventListener('click', closeAddDeviceModal);
addDeviceModal.addEventListener('click', (event) => {
if (event.target === addDeviceModal) {
closeAddDeviceModal();
}
});
addStorageRowBtn.addEventListener('click', () => {
storageRows.appendChild(createStorageRow());
});
storageRows.addEventListener('click', (event) => {
const removeButton = event.target.closest('.remove-storage-row');
if (!removeButton) return;
const rows = storageRows.querySelectorAll('.storage-row');
if (rows.length === 1) {
rows[0].querySelectorAll('input').forEach(input => input.value = '');
} else {
removeButton.closest('.storage-row').remove();
}
});
newDeviceName.addEventListener('input', () => {
if (!slugManuallyEdited) {
newDeviceSlug.value = slugify(newDeviceName.value);
}
});
newDeviceSlug.addEventListener('input', () => {
slugManuallyEdited = newDeviceSlug.value.trim().length > 0;
});
addDeviceForm.addEventListener('submit', handleAddDeviceSubmit);

// --- XML IMPORT / EXPORT LOGIC ---
importXmlBtn.addEventListener('click', () => {
resetXmlImportModal();
xmlImportModal.classList.add('is-visible');
});

closeXmlModalBtn.addEventListener('click', () => {
xmlImportModal.classList.remove('is-visible');
resetXmlImportModal();
});

cancelXmlImportBtn.addEventListener('click', () => {
xmlImportModal.classList.remove('is-visible');
resetXmlImportModal();
});

xmlImportModal.addEventListener('click', (event) => {
if (event.target === xmlImportModal) {
xmlImportModal.classList.remove('is-visible');
resetXmlImportModal();
}
});

xmlFileInput.addEventListener('change', handleXmlFileSelect);
processXmlImportBtn.addEventListener('click', processXmlImport);
exportXmlBtn.addEventListener('click', handleExportXml);

// --- EXCEL IMPORT LOGIC ---
importBtn.addEventListener('click', () => importModal.classList.add('is-visible'));
closeModalBtn.addEventListener('click', () => importModal.classList.remove('is-visible'));
cancelImportBtn.addEventListener('click', () => {
excelFile.value = null;
excelPreview.classList.add('hidden');
importStatus.classList.add('hidden');
processImportBtn.classList.add('hidden');
importModal.classList.remove('is-visible');
});

excelFile.addEventListener('change', (e) => {
const file = e.target.files[0];
if (!file) {
return;
}
const reader = new FileReader();
reader.onload = (e) => {
const data = new Uint8Array(e.target.result);
const workbook = XLSX.read(data, { type: 'array' });
const firstSheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[firstSheetName];
const json = XLSX.utils.sheet_to_json(worksheet);

if (json.length > 0) {
renderExcelPreview(json);
importStatus.classList.add('hidden');
processImportBtn.classList.remove('hidden');
} else {
showImportStatus('No data found in the Excel file.', 'error');
processImportBtn.classList.add('hidden');
}
};
reader.readAsArrayBuffer(file);
});

const renderExcelPreview = (data) => {
const previewTable = excelPreview.querySelector('table');
const previewHeader = previewTable.querySelector('thead');
const previewBody = previewTable.querySelector('tbody');

previewHeader.innerHTML = '';
previewBody.innerHTML = '';

const headers = Object.keys(data[0]);
const headerRow = `<tr>${headers.map(h => `<th class="py-2 px-4 text-left text-xs font-semibold text-gray-600 uppercase">${h}</th>`).join('')}</tr>`;
previewHeader.insertAdjacentHTML('beforeend', headerRow);

data.forEach(row => {
const rowHTML = `<tr>${headers.map(h => `<td class="py-2 px-4 whitespace-nowrap text-sm text-gray-900">${row[h]}</td>`).join('')}</tr>`;
previewBody.insertAdjacentHTML('beforeend', rowHTML);
});
excelPreview.classList.remove('hidden');
};

const showImportStatus = (message, type) => {
importStatus.textContent = message;
importStatus.className = `mt-4 p-3 rounded-lg text-sm text-center ${type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`;
importStatus.classList.remove('hidden');
};

processImportBtn.addEventListener('click', async () => {
showImportStatus('Processing import...', 'info');
const file = excelFile.files[0];
if (!file) {
showImportStatus('No file selected.', 'error');
return;
}

const reader = new FileReader();
reader.onload = async (e) => {
const data = new Uint8Array(e.target.result);
const workbook = XLSX.read(data, { type: 'array' });
const firstSheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[firstSheetName];
const json = XLSX.utils.sheet_to_json(worksheet);

let updatedCount = 0;
let errorCount = 0;

// Map of column headers from the Excel file to Firestore fields
const conditionMap = {
'Flawless': 'flawless',
'Good': 'good',
'Fair': 'fair',
'Damaged': 'damaged',
'Broken': 'broken',
'No Power': 'noPower'
};
const conditionHeaders = Object.keys(conditionMap);

const deviceUpdates = {};

json.forEach((row, index) => {
// Normalize column values to match Firestore structure
const brand = row['Brand']?.toLowerCase() === 'iphones' ? 'iphone' : row['Brand']?.toLowerCase();
const slug = row['Slug'];
const storage = row['Storage'];
const connectivity = row['Lock Status']?.toLowerCase().replace(' ', ''); // Remove space

if (!brand || !slug || !storage || !connectivity) {
console.error(`Skipping row ${index + 2} due to missing primary identifiers (Brand, Slug, Storage, or Lock Status):`, row);
errorCount++;
return;
}

// Initialize update object for the device if it doesn't exist
if (!deviceUpdates[brand]) {
deviceUpdates[brand] = {};
}
if (!deviceUpdates[brand][slug]) {
deviceUpdates[brand][slug] = {
name: row['Device'] || slug,
slug: slug,
brand: brand,
prices: {}
};
}
if (!deviceUpdates[brand][slug].prices[storage]) {
deviceUpdates[brand][slug].prices[storage] = {};
}
if (!deviceUpdates[brand][slug].prices[storage][connectivity]) {
deviceUpdates[brand][slug].prices[storage][connectivity] = {};
}

// Map prices from the row to the update object
conditionHeaders.forEach(conditionHeader => {
const price = row[conditionHeader];
const condition = conditionMap[conditionHeader];
if (price !== undefined && price !== null && !isNaN(parseFloat(price))) {
deviceUpdates[brand][slug].prices[storage][connectivity][condition] = parseFloat(price);
}
});
});

// Process updates for each device
const updatePromises = [];
for (const brand in deviceUpdates) {
for (const slug in deviceUpdates[brand]) {
const updateData = deviceUpdates[brand][slug];
const collectionPath = `devices/${brand}/models`;
const docRef = doc(db, collectionPath, slug);

updatePromises.push(setDoc(docRef, updateData, { merge: true })
.then(() => {
updatedCount++;
})
.catch(e => {
console.error(`Failed to update document for slug '${slug}':`, e);
errorCount++;
})
);
}
}

await Promise.all(updatePromises);

if (errorCount === 0) {
showImportStatus(`Successfully updated ${updatedCount} prices!`, 'success');
} else {
showImportStatus(`Updated ${updatedCount} prices with ${errorCount} errors. See console for details.`, 'error');
}

importModal.classList.remove('is-visible');
fetchDevices(); // Refresh the main table
};
reader.readAsArrayBuffer(file);
});
