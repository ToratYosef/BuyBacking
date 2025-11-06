#!/bin/bash
set -euo pipefail

FILE="functions/index.js"
BACKUP="${FILE}.bak.$(date +%Y%m%d-%H%M%S)"

[ -f "$FILE" ] || { echo "❌ Not found: $FILE"; exit 1; }
cp -p "$FILE" "$BACKUP"
echo "📦 Backup created: $BACKUP"

# --- Fix COUNTDOWN_NOTICE_TEXT string ---
perl -0777 -pe '
  s/const\s+COUNTDOWN_NOTICE_TEXT\s*=\s*"\s*If we don.?t hear back, we may finalize your order at 75% less to keep your order moving\.?\s*(?:\r?\n|")+?\s*;?/const COUNTDOWN_NOTICE_TEXT = "If we don'\''t hear back, we may finalize your order at 75% less to keep your order moving.";/sig;
' -i "$FILE"

# --- Fix outstanding_balance steps array ---
perl -0777 -pe '
  s/steps\s*:\s*\[\s*"\s*Contact your carrier to clear the remaining balance on the device\.?\s*(?:(?:"\s*,\s*".*?)|\s*)(?=\])/steps: ["Contact your carrier to clear the remaining balance on the device.", "Reply to this email with confirmation so we can re-run the check and release your payout."]/sig;
' -i "$FILE"

# --- Replace broken Balance Due email HTML ---
perl -0777 -pe '
  s/const\s+BAL_DUE_EMAIL_HTML[\s\S]*?buildEmailLayout\([\s\S]*?bodyHtml[\s\S]*?`[\s\S]*?`\s*,?\s*\}\s*\)\s*;?/const BAL_DUE_EMAIL_HTML = buildEmailLayout({
    title: "Balance due with your carrier",
    accentColor: "#f97316",
    includeCountdownNotice: true,
    includeTrustpilot: false,
    bodyHtml: `
      <p>Hi **CUSTOMER_NAME**,</p>
      <p>When we ran your device for order <strong>#**ORDER_ID**</strong>, the carrier reported a status of <strong>**FINANCIAL_STATUS**</strong>.</p>
      <p>Please contact your carrier to clear the balance and then reply to this email so we can rerun the check and keep your payout on track.</p>
      <p style="color:#c2410c;">Need help figuring out the right department to call? Let us know and we'\''ll point you in the right direction.</p>
    `,
  });/sig;
' -i "$FILE"

# --- Add admin.initializeApp() if missing ---
if ! grep -Eq '\badmin\.initializeApp\s*\(' "$FILE"; then
  awk '
    BEGIN{done=0}
    /firebase-admin/ && done==0 {
      print; print ""; print "if (!admin.apps.length) { admin.initializeApp(); }"; print ""; done=1; next
    } {print}
  ' "$FILE" > "${FILE}.tmp" && mv "${FILE}.tmp" "$FILE"
fi

# --- Add exports.api = functions.https.onRequest(app) if missing ---
grep -Eq 'https\.onRequest\s*\(\s*app\s*\)\s*;' "$FILE" || cat >> "$FILE" <<'PATCH'

/** Export Express app over HTTPS (added by fixer) */
exports.api = functions.https.onRequest(app);
PATCH

# --- Syntax sanity check ---
node -e "new (require('vm').Script)(require('fs').readFileSync('$FILE','utf8')); console.log('✅ JS parses OK')"

echo "🎉 Done. Backup: $BACKUP"
echo "Commit if clean:"
echo "   git add '$FILE' && git commit -m 'Auto-fix syntax, countdown text, email steps, balance-due HTML'"
