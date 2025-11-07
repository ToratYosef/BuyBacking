const functions = require("firebase-functions/v1");
const { app } = require("./server/app");

exports.api = functions.https.onRequest(app);
