# Send-in communications playbook

This playbook consolidates the customer-facing messaging for device send-ins, including the order confirmation page/email, packaging instructions, and follow-up nudges.

## Order confirmation: page + email
- **Purpose:** clearly explain what happens next, present both shipping options, and reduce friction when packaging devices.
- **Primary message:**
  - Thank the customer and reiterate the locked-in payout and device details.
  - Present **two shipping options** side by side:
    1. **Email label + own packaging** (customer prints the label).
    2. **Prepaid shipping kit** (we mail a padded mailer with a prepaid return label).
  - Provide a **prep checklist** (backup, sign out of accounts/Find My/FRP, remove SIM/eSIM, factory reset) and a **packing checklist** (pad device, sturdy box/kit mailer, include order ID note or device sticker, seal all edges, attach label flat).
  - Encourage customers to **keep their USPS drop-off receipt** and reply to the email if they need help.

## Shipping option instructions

### Option 1: Email label + own packaging
1. Download and print the prepaid USPS label from the confirmation page or email.
2. Power off the device, remove SIM/eSIM, sign out of all accounts, and factory reset.
3. Wrap the device in bubble wrap/soft cloth and place it in a sturdy box with padding to prevent movement.
4. Add a note with the order number (or the device ID sticker, if provided).
5. Seal every edge with tape, place the label flat, drop at USPS, and keep the receipt.

### Option 2: Prepaid shipping kit (leaflet copy)
Inside the kit: padded mailer, protective device sleeve, prepaid USPS return label, adhesive strip/tape, and device ID sticker.

Steps for the leaflet:
1. Prepare the device: backup, remove SIM/eSIM, sign out of accounts, turn off Find My/FRP, and factory reset.
2. Place the device in the protective sleeve and add the padding provided.
3. Put the device and **device ID sticker** (or a note with the order number) inside the mailer.
4. Peel the adhesive strip, seal firmly, and attach the prepaid label so it’s flat.
5. Drop at any USPS location and keep your receipt for tracking.

## Chaser automations
Send nudges only while the order is still awaiting a device and no tracking has been logged.

### Chaser Email 1 (day 5–7)
- **Subject:** "Quick reminder: pop your device in the mail"
- **Body (outline):**
  - Friendly nudge that the order is still open and payout is reserved.
  - Reiterate chosen shipping option with the 3-step summary (print + pack + drop, or wait for/pack with kit).
  - Link back to the confirmation page and the label download (if applicable).
  - Restate the prep checklist (remove accounts/Find My/FRP, remove SIM/eSIM, factory reset).
  - Invite replies for help and remind to keep the USPS receipt.

### Chaser Email 2 (day ~10)
- **Subject:** "Still holding your payout — ship soon"
- **Body (outline):**
  - Emphasize the payout is pending receipt of the device.
  - Provide the most direct next step: print/attach the label or watch for the kit and pack as soon as it arrives.
  - Bullet the packing checklist and include the Trustpilot link to reinforce credibility.
  - Offer to resend the label or update the address if needed.

### Chaser SMS (day ~10 if no package in transit)
- **Template:**
  - "Hi <First Name>, we’re still holding your SecondHandCell payout. Print your USPS label or watch for your kit, pack your device, and drop at USPS. Need us to resend the label? Reply HELP." (short URL to confirmation/label)

### Chaser Call (after SMS if still no movement)
- **Call goals:**
  - Confirm they received the label/kit and whether they need replacements.
  - Ask if they’re unsure about wiping the phone or turning off Find My/FRP; offer to email steps.
  - Capture reasons for non-send (changed mind, address issue, lost kit, timing, device issue) and log them to improve the flow.

## Operational note
Even with strong follow-ups, send-in rates won’t reach 100%. Track your average conversion from quote to device received and **bake that rate into profit-margin calculations** so payouts stay profitable while you improve the journey.
