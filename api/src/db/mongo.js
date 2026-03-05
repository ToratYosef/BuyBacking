const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB_NAME || 'SHC';

let clientPromise;
let dbInstance;

function mongoCollectionFromFsDocPath(docPath = '') {
  const parts = String(docPath).split('/').filter(Boolean);
  const collectionNames = [];
  for (let i = 0; i < parts.length; i += 2) {
    collectionNames.push(parts[i]);
  }
  return collectionNames.join('__');
}

function fsDocIdToMongoId(docPath = '') {
  return String(docPath);
}

async function getDb() {
  if (dbInstance) return dbInstance;

  if (!clientPromise) {
    const client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      maxPoolSize: 20,
    });

    clientPromise = client.connect();
  }

  const connectedClient = await clientPromise;
  dbInstance = connectedClient.db(DB_NAME);
  return dbInstance;
}

async function collection(name) {
  const db = await getDb();
  return db.collection(name);
}

module.exports = {
  getDb,
  collection,
  mongoCollectionFromFsDocPath,
  fsDocIdToMongoId,
};
