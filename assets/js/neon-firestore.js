const baseHeaders = { 'Content-Type': 'application/json' };

function toPath(parts) {
  if (typeof parts === 'string') return parts;
  if (parts && typeof parts.path === 'string') return parts.path;
  return Array.isArray(parts) ? parts.filter(Boolean).join('/') : '';
}

function makeDoc(id, dataObj) {
  return {
    id: id || null,
    exists: () => !!dataObj,
    data: () => (dataObj ? { ...dataObj } : undefined),
  };
}

export function getFirestore() {
  return { kind: 'neon' };
}

export function setLogLevel() {}

export function serverTimestamp() {
  return new Date().toISOString();
}

export function doc(_dbOrRef, ...segments) {
  let path = '';
  if (_dbOrRef && _dbOrRef.path) {
    path = [_dbOrRef.path, ...segments].filter(Boolean).join('/');
  } else {
    path = segments.filter(Boolean).join('/');
  }
  return { type: 'doc', path };
}

export function collection(_dbOrRef, ...segments) {
  let path = '';
  if (_dbOrRef && _dbOrRef.path) {
    path = [_dbOrRef.path, ...segments].filter(Boolean).join('/');
  } else {
    path = segments.filter(Boolean).join('/');
  }
  return { type: 'collection', path };
}

export function where(field, op, value) {
  return { type: 'where', field, op, value };
}

export function orderBy(field, direction = 'asc') {
  return { type: 'orderBy', field, direction };
}

export function limit(count) {
  return { type: 'limit', count };
}

export function query(colRef, ...clauses) {
  return { type: 'query', path: toPath(colRef), clauses };
}

export async function getDoc(docRef) {
  const path = toPath(docRef);
  const res = await fetch(`/api/neon/doc?path=${encodeURIComponent(path)}`);
  if (res.status === 404) return makeDoc(null, null);
  const json = await res.json();
  const data = json?.data || null;
  return makeDoc(data?.id || null, data);
}

export async function getDocs(input) {
  const path = input?.type === 'query' ? input.path : toPath(input);
  const clauses = input?.type === 'query' ? input.clauses || [] : [];
  const body = {
    path,
    where: clauses.filter((c) => c.type === 'where').map((c) => ({ field: c.field, op: c.op, value: c.value })),
    orderBy: clauses.find((c) => c.type === 'orderBy') || null,
    limit: clauses.find((c) => c.type === 'limit')?.count ?? null,
  };

  const res = await fetch('/api/neon/query', { method: 'POST', headers: baseHeaders, body: JSON.stringify(body) });
  const json = await res.json();
  const docs = (json?.docs || []).map((row) => ({ id: row.id, data: () => ({ ...row }) }));
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach(cb) { docs.forEach(cb); },
  };
}

export async function addDoc(colRef, data) {
  const res = await fetch('/api/neon/add', {
    method: 'POST', headers: baseHeaders, body: JSON.stringify({ path: toPath(colRef), data }),
  });
  const json = await res.json();
  return { id: json.id };
}

export async function setDoc(docRef, data, options = {}) {
  await fetch('/api/neon/set', {
    method: 'POST', headers: baseHeaders,
    body: JSON.stringify({ path: toPath(docRef), data, merge: options?.merge === true }),
  });
}

export async function updateDoc(docRef, data) {
  await fetch('/api/neon/update', {
    method: 'POST', headers: baseHeaders,
    body: JSON.stringify({ path: toPath(docRef), data }),
  });
}

export function onSnapshot(ref, callback) {
  let alive = true;
  const poll = async () => {
    if (!alive) return;
    if (ref?.type === 'doc') {
      const snap = await getDoc(ref);
      callback(snap);
    } else {
      const snap = await getDocs(ref);
      callback(snap);
    }
  };
  poll();
  const id = setInterval(poll, 15000);
  return () => { alive = false; clearInterval(id); };
}
