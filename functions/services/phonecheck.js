const axios = require('axios');

const DEFAULT_PHONECHECK_BASE_URL = 'https://clientapiv2.phonecheck.com';

function getPhonecheckConfig() {
  const apiKey = process.env.IMEI_API;
  const username = process.env.IMEI_USERNAME;
  const baseUrl = process.env.IMEI_BASE_URL || DEFAULT_PHONECHECK_BASE_URL;

  if (!apiKey || !username) {
    const missing = [];
    if (!apiKey) missing.push('IMEI_API');
    if (!username) missing.push('IMEI_USERNAME');
    const error = new Error(`Missing required Phonecheck environment variables: ${missing.join(', ')}`);
    error.code = 'phonecheck/missing-config';
    throw error;
  }

  return { apiKey, username, baseUrl };
}

function normalizePhonecheckBoolean(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const collapsed = normalized.replace(/[^a-z0-9]+/g, ' ').trim();
    const tokens = collapsed ? collapsed.split(/\s+/) : [];

    const containsPhrase = (phrase) => collapsed.includes(phrase);
    const containsToken = (list) => list.some((token) => tokens.includes(token));

    if (
      containsToken([
        'bad',
        'barred',
        'blacklist',
        'blacklisted',
        'blocked',
        'lost',
        'stolen',
        'unpaid',
        'delinquent',
        'negative',
        'fail',
        'failed',
        'ub',
        'ob',
        'fraud',
        'financial',
        'stole',
        'theft',
      ]) ||
      containsPhrase('outstanding balance') ||
      containsPhrase('unpaid bill') ||
      containsPhrase('unpaid bills') ||
      containsPhrase('active payment') ||
      containsPhrase('payment plan') ||
      containsPhrase('finance') ||
      containsPhrase('financed') ||
      containsPhrase('ineligible') ||
      containsPhrase('not eligible') ||
      containsPhrase('not clean') ||
      containsPhrase('not clear') ||
      containsPhrase('not good') ||
      containsPhrase('not paid') ||
      containsPhrase('past due')
    ) {
      return true;
    }

    if (
      containsToken([
        'clean',
        'clear',
        'good',
        'eligible',
        'pass',
        'passed',
        'paid',
      ]) ||
      containsPhrase('no issues') ||
      containsPhrase('no issue') ||
      containsPhrase('device is eligible') ||
      containsPhrase('esn good') ||
      containsPhrase('status clean')
    ) {
      return false;
    }
  }
  return null;
}

function normalizePhonecheckResponse(raw = {}) {
  const remarks = typeof raw.Remarks === 'string' ? raw.Remarks.trim() : null;
  const carrier = typeof raw.Carrier === 'string' ? raw.Carrier.trim() : null;
  const api = typeof raw.API === 'string' ? raw.API.trim() : null;
  const reportedDeviceId = typeof raw.deviceid === 'string' ? raw.deviceid.trim() : null;

  let summary = null;
  if (typeof raw.RawResponse === 'string') {
    summary = raw.RawResponse.trim() || null;
  } else if (raw.RawResponse && typeof raw.RawResponse === 'object') {
    try {
      summary = JSON.stringify(raw.RawResponse);
    } catch (error) {
      summary = null;
    }
  }

  const normalized = {
    remarks,
    carrier,
    api,
    deviceId: reportedDeviceId,
    summary,
    raw
  };

  const derivedBlacklist = normalizePhonecheckBoolean(remarks) ?? normalizePhonecheckBoolean(summary);
  if (derivedBlacklist !== null) {
    normalized.blacklisted = derivedBlacklist;
  }

  if (raw.RawResponse && typeof raw.RawResponse === 'object') {
    const rawObject = raw.RawResponse;
    const brand = rawObject.brandname || rawObject.brand || rawObject.BrandName || rawObject.Brand || null;
    const model = rawObject.modelname || rawObject.model || rawObject.ModelName || rawObject.Model || rawObject.marketingname || rawObject.MarketingName || null;
    const color = rawObject.color || rawObject.Color || rawObject.FieldColor || null;
    const storage = rawObject.storage || rawObject.Storage || rawObject.memory || rawObject.Memory || null;
    const blacklistStatus = rawObject.blackliststatus || rawObject.BlacklistStatus || null;

    if (brand) {
      normalized.brand = brand;
    }
    if (model) {
      normalized.model = model;
    }
    if (color) {
      normalized.color = color;
    }
    if (storage) {
      normalized.storage = storage;
    }
    if (blacklistStatus && normalized.blacklisted === undefined) {
      normalized.blacklisted = normalizePhonecheckBoolean(blacklistStatus);
    }
  }

  return normalized;
}

function normalizeCarrierForPhonecheck(carrier) {
  if (typeof carrier !== 'string') {
    return null;
  }
  const value = carrier.trim();
  if (!value) {
    return null;
  }
  const upper = value.toUpperCase();
  if (upper.includes('AT&T') || upper === 'ATT' || upper === 'AT&T' || upper.includes('AT T')) {
    return 'AT&T';
  }
  if (upper.includes('TMOBILE') || upper.includes('T-MOBILE') || upper.includes('T MOBILE')) {
    return 'T-Mobile';
  }
  if (upper.includes('SPRINT')) {
    return 'Sprint';
  }
  if (upper.includes('VERIZON') || upper === 'VZW') {
    return 'Verizon';
  }
  if (upper.includes('UNLOCK')) {
    return 'Unlocked';
  }
  if (upper.includes('BLACKLIST')) {
    return 'Blacklist';
  }
  return value;
}

function normalizeDeviceType(brand, providedType) {
  if (typeof providedType === 'string' && providedType.trim()) {
    const normalized = providedType.trim().toLowerCase();
    if (normalized.includes('apple') || normalized.includes('ios') || normalized.includes('iphone')) {
      return 'Apple';
    }
    if (normalized.includes('android') || normalized.includes('samsung') || normalized.includes('google')) {
      return 'Android';
    }
  }

  if (typeof brand === 'string' && brand.trim()) {
    const normalizedBrand = brand.trim().toLowerCase();
    if (normalizedBrand.includes('apple') || normalizedBrand.includes('iphone') || normalizedBrand.includes('ipad')) {
      return 'Apple';
    }
  }

  return null;
}

async function checkEsn({
  imei,
  carrier,
  deviceType,
  brand,
  checkAll = false,
  axiosInstance = axios,
} = {}) {
  if (!imei || typeof imei !== 'string') {
    const error = new Error('IMEI is required for Phonecheck.');
    error.code = 'phonecheck/invalid-imei';
    throw error;
  }

  const { apiKey, username, baseUrl } = getPhonecheckConfig();
  const url = new URL('/cloud/cloudDB/CheckEsn/', baseUrl).toString();

  const params = new URLSearchParams();
  params.append('apiKey', apiKey);
  params.append('username', username);
  params.append('IMEI', imei);

  const normalizedCarrier = normalizeCarrierForPhonecheck(carrier);
  if (normalizedCarrier) {
    params.append('carrier', normalizedCarrier);
  }

  const normalizedDeviceType = normalizeDeviceType(brand, deviceType);
  if (normalizedDeviceType) {
    params.append('devicetype', normalizedDeviceType);
  }

  if (checkAll !== undefined && checkAll !== null) {
    params.append('checkAll', checkAll ? '1' : '0');
  }

  const response = await axiosInstance({
    method: 'post',
    url,
    data: params.toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 20000,
    validateStatus: () => true,
  });

  const { status, data } = response;

  if (status >= 400) {
    let message = 'Phonecheck ESN request failed.';
    if (data) {
      if (typeof data === 'string') {
        message = data;
      } else if (typeof data === 'object' && data !== null) {
        message = data.message || data.error || message;
      }
    }
    const error = new Error(message || 'Phonecheck ESN request failed.');
    error.code = 'phonecheck/http-error';
    error.status = status;
    error.responseData = data;
    throw error;
  }

  if (!data || typeof data !== 'object') {
    const error = new Error('Phonecheck returned an unexpected response.');
    error.code = 'phonecheck/invalid-response';
    error.responseData = data;
    throw error;
  }

  return {
    raw: data,
    normalized: normalizePhonecheckResponse(data),
  };
}

module.exports = {
  checkEsn,
  normalizePhonecheckResponse,
  normalizeCarrierForPhonecheck,
  normalizeDeviceType,
};
