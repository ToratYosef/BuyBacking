const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveLabelServiceAndWeight } = require('../../helpers/label-shipping-rule');

test('deviceCount=1 uses First Class and capped weight', () => {
  const out = resolveLabelServiceAndWeight(1);
  assert.equal(out.chosenService, 'usps_first_class_mail');
  assert.equal(out.weightOz, 15.9);
  assert.equal(out.blocks, null);
});

test('deviceCount=4 uses First Class and capped weight', () => {
  const out = resolveLabelServiceAndWeight(4);
  assert.equal(out.chosenService, 'usps_first_class_mail');
  assert.equal(out.weightOz, 15.9);
  assert.equal(out.blocks, null);
});

test('deviceCount=5 uses Priority and 32oz', () => {
  const out = resolveLabelServiceAndWeight(5);
  assert.equal(out.chosenService, 'usps_priority_mail');
  assert.equal(out.blocks, 2);
  assert.equal(out.weightOz, 32);
});

test('deviceCount=8 uses Priority and 32oz', () => {
  const out = resolveLabelServiceAndWeight(8);
  assert.equal(out.chosenService, 'usps_priority_mail');
  assert.equal(out.blocks, 2);
  assert.equal(out.weightOz, 32);
});

test('deviceCount=9 uses Priority and 48oz', () => {
  const out = resolveLabelServiceAndWeight(9);
  assert.equal(out.chosenService, 'usps_priority_mail');
  assert.equal(out.blocks, 3);
  assert.equal(out.weightOz, 48);
});

test('deviceCount=12 uses Priority and 48oz', () => {
  const out = resolveLabelServiceAndWeight(12);
  assert.equal(out.chosenService, 'usps_priority_mail');
  assert.equal(out.blocks, 3);
  assert.equal(out.weightOz, 48);
});

test('deviceCount=13 uses Priority and 64oz', () => {
  const out = resolveLabelServiceAndWeight(13);
  assert.equal(out.chosenService, 'usps_priority_mail');
  assert.equal(out.blocks, 4);
  assert.equal(out.weightOz, 64);
});
