function resolveLabelServiceAndWeight(deviceCountInput) {
  const deviceCount = Math.max(1, Number(deviceCountInput) || 1);
  if (deviceCount <= 4) {
    return {
      deviceCount,
      chosenService: 'usps_first_class_mail',
      weightOz: 15.9,
      blocks: null,
    };
  }

  const blocks = Math.ceil(deviceCount / 4);
  return {
    deviceCount,
    chosenService: 'usps_priority_mail',
    weightOz: blocks * 16,
    blocks,
  };
}

module.exports = { resolveLabelServiceAndWeight };
