const serverless = require('serverless-http');
const app = require('../../server/src/server');

module.exports.handler = serverless(app);
