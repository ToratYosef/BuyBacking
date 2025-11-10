const LOGO_URL = "https://raw.githubusercontent.com/ToratYosef/BuyBacking/refs/heads/main/assets/logo.png";
let cachedLogoBytes = null;

function ensurePdfLib() {
  if (!window.PDFLib) {
    throw new Error("PDFLib library is not loaded. Please include https://unpkg.com/pdf-lib/dist/pdf-lib.min.js before using order label helpers.");
  }
  return window.PDFLib;
}

async function fetchLogoBytes() {
  if (cachedLogoBytes) {
    return cachedLogoBytes;
  }
  try {
    const response = await fetch(LOGO_URL);
    if (!response.ok) {
      throw new Error(`Failed to load logo: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    cachedLogoBytes = new Uint8Array(buffer);
    return cachedLogoBytes;
  } catch (error) {
    console.warn("Unable to download logo asset for PDF labels:", error);
    cachedLogoBytes = null;
    return null;
  }
}

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "0.00";
  }
  return number.toFixed(2);
}

function wrapText(text, font, fontSize, maxWidth) {
  if (!text) {
    return ["—"];
  }
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : ["—"];
}

function formatBooleanish(value) {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const lower = String(value).trim().toLowerCase();
  if (!lower) return "—";
  if (["yes", "y", "true", "1"].includes(lower)) return "Yes";
  if (["no", "n", "false", "0"].includes(lower)) return "No";
  if (["na", "n/a", "null", "undefined"].includes(lower)) return "N/A";
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatValue(value) {
  if (value == null) return "—";
  if (typeof value === "number") {
    if (Number.isFinite(value)) return String(value);
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  const str = String(value).trim();
  if (!str) return "—";
  return str
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function resolvePayout(order = {}) {
  if (typeof order.estimatedQuote === "number" && Number.isFinite(order.estimatedQuote)) {
    return order.estimatedQuote;
  }
  if (typeof order.estimatedQuote === "string") {
    const parsed = Number(order.estimatedQuote);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (typeof order.quoteAmount === "number" && Number.isFinite(order.quoteAmount)) {
    return order.quoteAmount;
  }
  if (typeof order.quoteAmount === "string") {
    const parsed = Number(order.quoteAmount);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function resolvePhone(shippingInfo = {}) {
  const raw =
    shippingInfo.phone ||
    shippingInfo.phoneNumber ||
    shippingInfo.phone_number ||
    shippingInfo.contactPhone ||
    shippingInfo.phone1 ||
    shippingInfo.primaryPhone ||
    shippingInfo.telephone ||
    shippingInfo.mobile ||
    "";
  const digits = String(raw || "").replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw ? String(raw) : "—";
}

function buildDeviceLabel(order = {}) {
  const pieces = [];
  if (order.brand) pieces.push(String(order.brand));
  if (order.device) pieces.push(String(order.device));
  return pieces.join(" ").trim();
}

export async function createOrderInfoLabelPdf(order = {}) {
  const { PDFDocument, StandardFonts, rgb } = ensurePdfLib();
  const doc = await PDFDocument.create();
  const page = doc.addPage([288, 432]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 24;
  const lineHeight = 14;
  const sectionSpacing = 14;
  const keyValueSpacing = 8;
  let cursorY = page.getHeight() - margin;

  const drawHeading = (text) => {
    cursorY -= sectionSpacing;
    page.drawText(text, {
      x: margin,
      y: cursorY,
      size: 16,
      font: bold,
      color: rgb(0.07, 0.2, 0.47),
    });
    cursorY -= 8;
  };

  const drawSection = (title) => {
    cursorY -= sectionSpacing;
    page.drawText(title, {
      x: margin,
      y: cursorY,
      size: 12,
      font: bold,
      color: rgb(0.16, 0.18, 0.22),
    });
    cursorY -= 6;
  };

  const drawKeyValue = (label, value) => {
    const keyText = `${label}:`;
    const keyWidth = bold.widthOfTextAtSize(keyText, 10);
    const maxWidth = page.getWidth() - margin * 2 - keyWidth - 6;
    const lines = wrapText(value ?? "—", regular, 10, maxWidth);
    lines.forEach((line, index) => {
      page.drawText(index === 0 ? keyText : "", {
        x: margin,
        y: cursorY - index * lineHeight,
        size: 10,
        font: bold,
        color: rgb(0.12, 0.12, 0.14),
      });
      page.drawText(line, {
        x: margin + keyWidth + 6,
        y: cursorY - index * lineHeight,
        size: 10,
        font: regular,
        color: rgb(0.1, 0.1, 0.1),
      });
    });
    cursorY -= lineHeight * lines.length + keyValueSpacing;
  };

  const drawBulletList = (items) => {
    const bullet = "• ";
    const bulletWidth = regular.widthOfTextAtSize(bullet, 9);
    const maxWidth = page.getWidth() - margin * 2 - bulletWidth;
    items.forEach((item) => {
      const lines = wrapText(item, regular, 9, maxWidth);
      lines.forEach((line, index) => {
        const prefix = index === 0 ? bullet : "  ";
        page.drawText(`${prefix}${line}`, {
          x: margin,
          y: cursorY - index * lineHeight,
          size: 9,
          font: regular,
          color: rgb(0.22, 0.22, 0.24),
        });
      });
      cursorY -= lineHeight * lines.length + 6;
    });
  };

  drawHeading(`Order #${order.id || "—"}`);

  drawSection("Customer Information");
  const shippingInfo = order.shippingInfo || {};
  drawKeyValue("Customer Name", shippingInfo.fullName || shippingInfo.name || "—");
  drawKeyValue("Email", shippingInfo.email || "—");
  drawKeyValue("Phone", resolvePhone(shippingInfo));

  drawSection("Device Details");
  drawKeyValue("Item (Make/Model)", buildDeviceLabel(order) || "—");
  drawKeyValue("Storage", order.storage || order.memory || "—");
  drawKeyValue("Carrier", formatValue(order.carrier));
  drawKeyValue("Estimated Payout", `$${formatCurrency(resolvePayout(order))}`);

  drawSection("Conditions");
  drawKeyValue("Powers On?", formatBooleanish(order.condition_power_on));
  drawKeyValue("Fully Functional?", formatBooleanish(order.condition_functional));
  drawKeyValue("Any Cracks?", formatBooleanish(order.condition_cracks));
  drawKeyValue("Cosmetic Condition", formatBooleanish(order.condition_cosmetic));

  drawSection("Prep Checklist");
  drawBulletList([
    "Remove SIM cards and accessories from the device.",
    "Factory reset and sign out of Apple, Google, or Samsung accounts.",
    "Place the device in the protective sleeve and include this sheet in the box.",
  ]);

  return doc.save();
}

async function embedLogoImage(pdfDoc) {
  const logoBytes = await fetchLogoBytes();
  if (!logoBytes) {
    return null;
  }
  try {
    if (LOGO_URL.toLowerCase().endsWith(".png")) {
      return await pdfDoc.embedPng(logoBytes);
    }
    return await pdfDoc.embedJpg(logoBytes);
  } catch (error) {
    console.warn("Failed to embed logo in PDF:", error);
    return null;
  }
}

function normalizeConditionText(value) {
  if (value == null) return null;
  const formatted = formatBooleanish(value);
  if (formatted === "—") return null;
  return formatted;
}

export async function createBagLabelPdf(order = {}) {
  const { PDFDocument, StandardFonts, rgb } = ensurePdfLib();
  const doc = await PDFDocument.create();
  const page = doc.addPage([288, 432]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 18;
  let cursorY = page.getHeight() - margin;
  const maxWidth = page.getWidth() - margin * 2;

  const draw = (text, { font = regular, size = 11, color = rgb(0.12, 0.12, 0.14), spacing = 10 } = {}) => {
    const lines = wrapText(text, font, size, maxWidth);
    const lineStep = size + 2;
    lines.forEach((line, index) => {
      page.drawText(line, {
        x: margin,
        y: cursorY - index * lineStep,
        size,
        font,
        color,
      });
    });
    cursorY -= lines.length * lineStep + spacing;
  };

  const logoImage = await embedLogoImage(doc);
  if (logoImage) {
    const scaled = logoImage.scale(0.3);
    page.drawImage(logoImage, {
      x: margin,
      y: cursorY - scaled.height,
      width: scaled.width,
      height: scaled.height,
    });
    cursorY -= scaled.height + 16;
  }

  draw("SecondHandCell Bag Label", { font: bold, size: 14, spacing: 12 });
  draw(`Order #${order.id || "—"}`, { font: bold, size: 24, color: rgb(0.07, 0.2, 0.47), spacing: 14 });

  const deviceLabel = buildDeviceLabel(order);
  if (deviceLabel) {
    draw(`Device: ${deviceLabel}`, { size: 12, spacing: 8 });
  }

  if (order.storage) {
    draw(`Storage: ${String(order.storage)}`, { size: 11, spacing: 8 });
  }

  if (order.carrier) {
    draw(`Carrier: ${formatValue(order.carrier)}`, { size: 11, spacing: 8 });
  }

  const conditionParts = [];
  const powerText = normalizeConditionText(order.condition_power_on);
  if (powerText) conditionParts.push(`Powers On: ${powerText}`);
  const functionalText = normalizeConditionText(order.condition_functional);
  if (functionalText) conditionParts.push(`Functional: ${functionalText}`);
  const cosmeticText = normalizeConditionText(order.condition_cosmetic);
  if (cosmeticText) conditionParts.push(`Cosmetic: ${cosmeticText}`);
  const cracksText = normalizeConditionText(order.condition_cracks);
  if (cracksText) conditionParts.push(`Cracks: ${cracksText}`);

  if (conditionParts.length) {
    draw(`Condition: ${conditionParts.join(" • ")}`, { size: 11, spacing: 10 });
  }

  const payout = formatCurrency(resolvePayout(order));
  draw(`Quoted Price: $${payout}`, { font: bold, size: 13, color: rgb(0.1, 0.45, 0.2), spacing: 12 });

  draw("Attach this label to the device bag before shipping.", {
    size: 10,
    color: rgb(0.35, 0.35, 0.35),
    spacing: 10,
  });

  draw("Include this sheet with the device inside the return box.", {
    size: 10,
    color: rgb(0.35, 0.35, 0.35),
    spacing: 12,
  });

  return doc.save();
}

function pushOrderedUrl(list, seen, value) {
  if (!value) return;
  const stringValue = String(value).trim();
  if (!stringValue) return;
  if (!/^https?:\/\//i.test(stringValue)) return;
  if (seen.has(stringValue)) return;
  seen.add(stringValue);
  list.push(stringValue);
}

function addLabelObjectCandidates(list, seen, source) {
  if (!source || typeof source !== "object") {
    return;
  }

  const directKeys = ["downloadUrl", "download_url", "labelUrl", "label_url", "url", "href", "pdf"];
  directKeys.forEach((key) => {
    if (source[key]) {
      pushOrderedUrl(list, seen, source[key]);
    }
  });

  if (source.label_download && typeof source.label_download === "object") {
    Object.values(source.label_download).forEach((value) => pushOrderedUrl(list, seen, value));
  }
}

export function gatherOrderLabelUrls(order = {}) {
  const seen = new Set();
  const ordered = [];

  const outboundPrimaries = [
    order.outboundDownloadUrl,
    order.outboundDownloadURL,
    order.outboundLabelUrl,
    order.outboundLabel?.downloadUrl,
    order.outboundLabel?.download_url,
  ];
  outboundPrimaries.forEach((value) => pushOrderedUrl(ordered, seen, value));
  addLabelObjectCandidates(ordered, seen, order.outboundLabel);
  addLabelObjectCandidates(ordered, seen, order.shipEngineLabels?.outbound);
  addLabelObjectCandidates(ordered, seen, order.shipEngineLabels?.kit);
  addLabelObjectCandidates(ordered, seen, order.shipEngineLabels?.primary);

  const inboundPrimaries = [
    order.inboundDownloadUrl,
    order.inboundDownloadURL,
    order.inboundLabelUrl,
    order.inboundLabel?.downloadUrl,
    order.inboundLabel?.download_url,
    order.trackingLabelUrl,
  ];
  inboundPrimaries.forEach((value) => pushOrderedUrl(ordered, seen, value));
  addLabelObjectCandidates(ordered, seen, order.inboundLabel);
  addLabelObjectCandidates(ordered, seen, order.shipEngineLabels?.inbound);
  addLabelObjectCandidates(ordered, seen, order.shipEngineLabels?.customer);
  addLabelObjectCandidates(ordered, seen, order.shipEngineLabels?.return);

  const uspsPrimaries = [order.uspsDownloadUrl, order.uspsLabelUrl];
  uspsPrimaries.forEach((value) => pushOrderedUrl(ordered, seen, value));
  addLabelObjectCandidates(ordered, seen, order.uspsLabel);

  const labelRecords = order.labelRecords || {};
  Object.values(labelRecords).forEach((entry) => addLabelObjectCandidates(ordered, seen, entry));

  if (order.labels && typeof order.labels === "object" && !Array.isArray(order.labels)) {
    Object.values(order.labels).forEach((entry) => addLabelObjectCandidates(ordered, seen, entry));
  }

  if (Array.isArray(order.labelUrls)) {
    order.labelUrls.forEach((value) => pushOrderedUrl(ordered, seen, value));
  }

  if (Array.isArray(order.shipEngineLabels)) {
    order.shipEngineLabels.forEach((entry) => {
      if (entry && typeof entry === "object") {
        Object.values(entry).forEach((value) => pushOrderedUrl(ordered, seen, value));
      } else {
        pushOrderedUrl(ordered, seen, entry);
      }
    });
  }

  return ordered;
}

export function serialiseQueueOrder(doc) {
  if (!doc) return null;
  const data = typeof doc.data === "function" ? doc.data() : doc;
  if (!data) return null;
  const payload = { id: doc.id || data.id || null, ...data };
  payload.labelUrls = gatherOrderLabelUrls(payload);
  return payload;
}

