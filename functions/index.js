const functions = require("firebase-functions/v1");
const {
  app,
  autoRefreshInboundTracking,
  autoVoidExpiredLabels,
  autoAcceptOffers,
  autoCancelDormantOrders,
  createUserRecord,
  sendReminderEmail,
  sendExpiringReminderEmail,
  sendKitReminderEmail,
  onChatTransferUpdate,
  onNewChatOpened,
  onNewChatCreated,
  notifyWholesaleOfferCreated,
  notifyWholesaleOfferUpdated,
} = require("./server/app");

exports.api = functions.https.onRequest(app);
exports.autoRefreshInboundTracking = autoRefreshInboundTracking;
exports.autoVoidExpiredLabels = autoVoidExpiredLabels;
exports.autoAcceptOffers = autoAcceptOffers;
exports.autoCancelDormantOrders = autoCancelDormantOrders;
exports.createUserRecord = createUserRecord;
exports.sendReminderEmail = sendReminderEmail;
exports.sendExpiringReminderEmail = sendExpiringReminderEmail;
exports.sendKitReminderEmail = sendKitReminderEmail;
exports.onChatTransferUpdate = onChatTransferUpdate;
exports.onNewChatOpened = onNewChatOpened;
exports.onNewChatCreated = onNewChatCreated;
exports.notifyWholesaleOfferCreated = notifyWholesaleOfferCreated;
exports.notifyWholesaleOfferUpdated = notifyWholesaleOfferUpdated;
