const test = require('node:test');
const assert = require('node:assert/strict');

const { isStatusPastReceived } = require('../../helpers/order-status');

test('flags received/completed style statuses', () => {
  assert.equal(isStatusPastReceived('received'), true);
  assert.equal(isStatusPastReceived('Completed'), true);
  assert.equal(isStatusPastReceived({ status: 'device_received' }), true);
});

test('flags re-offer and return label variations', () => {
  assert.equal(isStatusPastReceived('re-offered-pending'), true);
  assert.equal(isStatusPastReceived('reoffer_accepted'), true);
  assert.equal(isStatusPastReceived('Return Label Sent'), true);
  assert.equal(isStatusPastReceived('return_label_requested'), true);
});

test('ignores active statuses that still need refreshes', () => {
  assert.equal(isStatusPastReceived('kit_sent'), false);
  assert.equal(isStatusPastReceived('kit_delivered'), false);
  assert.equal(isStatusPastReceived('phone_on_the_way_to_us'), false);
  assert.equal(isStatusPastReceived('emailed'), false);
});
