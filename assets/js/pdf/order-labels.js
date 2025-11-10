function ensurePdfLib() {
  if (!window.PDFLib) {
    throw new Error("PDFLib library is not loaded. Please include https://unpkg.com/pdf-lib/dist/pdf-lib.min.js before using order label helpers.");
  }
  return window.PDFLib;
}

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "0.00";
  }
  return number.toFixed(2);
}

/**
 * Wraps text based on max width and returns an array of lines.
 */
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
  // Standard Label Size: 4in x 6in (288pt x 432pt)
  const page = doc.addPage([288, 432]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 20;
  const lineSpacing = 14; // Space between text baselines
  let cursorY = page.getHeight() - margin; // cursorY tracks the TOP available Y position

  const drawHeading = (text) => {
    const size = 16;
    const paddingAfter = 8;
    cursorY -= size; // Move down by text size for baseline
    page.drawText(text, {
      x: margin,
      y: cursorY,
      size: size,
      font: bold,
      color: rgb(0.07, 0.2, 0.47), // Dark Blue Heading
    });
    cursorY -= paddingAfter; // Extra spacing after heading
  };

  const drawSection = (title) => {
    const size = 12;
    const paddingAfter = 6;
    cursorY -= size; // Move down by text size for baseline
    page.drawText(title, {
      x: margin,
      y: cursorY,
      size: size,
      font: bold,
      color: rgb(0.16, 0.18, 0.22), // Dark Gray Section
    });
    cursorY -= paddingAfter; // Extra spacing after section title
  };

  /**
   * Renders a Key: Value pair, handling multi-line value wrapping.
   * cursorY is decremented for each line to prevent overlap.
   */
  const drawKeyValue = (label, value) => {
    const textHeight = 10;
    const keyText = `${label}:`;
    const keyWidth = bold.widthOfTextAtSize(keyText, textHeight);
    const valueMaxWidth = page.getWidth() - margin * 2 - keyWidth - 6;
    const lines = wrapText(value ?? "—", regular, textHeight, valueMaxWidth);
    const paddingBottom = 8; // Spacing before the next item

    lines.forEach((line, index) => {
      // 1. Move the cursor down to the baseline of the new line.
      cursorY -= lineSpacing; 

      // 2. The new baseline Y is now `cursorY`.
      const baselineY = cursorY;

      // Draw Key (only on the first line)
      if (index === 0) {
        page.drawText(keyText, {
          x: margin,
          y: baselineY,
          size: textHeight,
          font: bold,
          color: rgb(0.12, 0.12, 0.14),
        });
      }
      
      // Draw Value
      page.drawText(line, {
        x: margin + keyWidth + 6,
        y: baselineY,
        size: textHeight,
        font: regular,
        color: rgb(0.1, 0.1, 0.1),
      });
    });
    
    // Add spacing after the entire key/value block
    cursorY -= paddingBottom;
  };

  drawHeading(`Order #${order.id || "—"}`);

  // --- Customer Information ---
  drawSection("Customer Information");
  const shippingInfo = order.shippingInfo || {};
  drawKeyValue("Customer Name", shippingInfo.fullName || shippingInfo.name || "—");
  drawKeyValue("Email", shippingInfo.email || "—");
  drawKeyValue("Phone", resolvePhone(shippingInfo));

  // --- Device Details ---
  drawSection("Device Details");
  drawKeyValue("Item (Make/Model)", buildDeviceLabel(order) || "—");
  drawKeyValue("Storage", order.storage || order.memory || "—");
  drawKeyValue("Carrier", formatValue(order.carrier));
  drawKeyValue("Estimated Payout", `$${formatCurrency(resolvePayout(order))}`);

  // --- Conditions ---
  drawSection("Conditions");
  drawKeyValue("Powers On?", formatBooleanish(order.condition_power_on));
  drawKeyValue("Fully Functional?", formatBooleanish(order.condition_functional));
  drawKeyValue("Any Cracks?", formatBooleanish(order.condition_cracks));
  drawKeyValue("Cosmetic Condition", formatBooleanish(order.condition_cosmetic));

  return doc.save();
}

export function gatherOrderLabelUrls(order = {}) {
  const urls = new Set();
  const push = (value) => {
    if (!value) return;
    const stringValue = String(value).trim();
    if (!stringValue) return;
    if (/^https?:\/\//i.test(stringValue)) {
      urls.add(stringValue);
    }
  };

  push(order.outboundLabelUrl);
  push(order.inboundLabelUrl);
  push(order.uspsLabelUrl);

  const labelRecords = order.labelRecords || {};
  Object.values(labelRecords).forEach((entry) => {
    if (!entry) return;
    push(entry.downloadUrl || entry.download_url || entry.labelUrl || entry.url);
    if (entry.label_download && typeof entry.label_download === "object") {
      Object.values(entry.label_download).forEach(push);
    }
  });

  if (Array.isArray(order.labelUrls)) {
    order.labelUrls.forEach(push);
  }

  if (Array.isArray(order.shipEngineLabels)) {
    order.shipEngineLabels.forEach((entry) => {
      if (entry && typeof entry === "object") {
        Object.values(entry).forEach(push);
      } else {
        push(entry);
      }
    });
  }

  return Array.from(urls);
}

export function serialiseQueueOrder(doc) {
  if (!doc) return null;
  const data = typeof doc.data === "function" ? doc.data() : doc;
  if (!data) return null;
  const payload = { id: doc.id || data.id || null, ...data };
  payload.labelUrls = gatherOrderLabelUrls(payload);
  return payload;
}