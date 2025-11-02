import { firebaseApp } from "/assets/js/firebase-app.js";
import { initializeBuyHeader } from "./buy-header.js";
import { brandGroupsFromInventory, loadInventory, syncInventoryFromRemote } from "./buy-shared.js";

initializeBuyHeader();

await syncInventoryFromRemote().catch(() => {});

const brandCards = document.getElementById("brandCards");
const inventory = loadInventory();
const groups = brandGroupsFromInventory(inventory);

const gradeBadge = (grade) => `
<span class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
${grade}
</span>
`;

brandCards.innerHTML = "";
if (!groups.size) {
brandCards.innerHTML = `
<div class="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
Upload wholesale inventory in the admin console to populate this catalog.
</div>
`;
}
Array.from(groups.entries()).forEach(([brand, devices]) => {
const card = document.createElement("article");
card.className = "flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg";
card.innerHTML = `
<div class="flex items-center justify-between">
<div>
<p class="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">${brand}</p>
<h3 class="mt-1 text-xl font-semibold text-slate-900">${devices.length} active ${(devices.length === 1 ? "model" : "models")}</h3>
</div>
<a href="/buy/buy-device.html#${brand.toLowerCase()}" class="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 transition hover:border-emerald-300 hover:text-emerald-600">
Browse
</a>
</div>
<div class="space-y-3 text-sm text-slate-600">
${devices
.slice(0, 3)
.map((device) => {
const storageVariants = device.storages.map((storage) => storage.variant.split("·")[0].trim());
const storageDisplay = Array.from(new Set(storageVariants)).join(", ");
return `
<div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
<p class="font-semibold text-slate-900">${device.model}</p>
<p class="mt-1 text-xs uppercase tracking-[0.3em] text-slate-400">${storageDisplay}</p>
<div class="mt-3 flex flex-wrap gap-2">
${Object.keys(device.storages[0].asking)
.map((grade) => gradeBadge(grade))
.join("")}
</div>
</div>
`;
})
.join("")}
</div>
${devices.length > 3 ? `<p class="text-xs text-slate-400">+${devices.length - 3} additional ${(devices.length - 3 === 1 ? "model" : "models")} ready for offers</p>` : ""}
`;
brandCards.appendChild(card);
});
