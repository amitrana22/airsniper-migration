const firestoreBackup = require('@sgg10/firestore-backup');
const { mongoConnectionUri } = require('./config');
const serviceAccount = require('./key.json');
var MongoClient = require('mongodb').MongoClient;

let fsb = new firestoreBackup(
  serviceAccount,
  'https://air-sniper.firebaseio.com'
);

const client = new MongoClient(mongoConnectionUri);

const excluded = ['devices', 'wifiErrors'];

async function run() {
  try {
    await client.connect();
    const database = client.db('airsniper-dev');

    let list = await fsb.exportObj.getCollectionList();
    let filteredList = list.filter((i) => !excluded.includes(i));
    for (let i = 0; i < filteredList.length; i++) {
      let collectionName = filteredList[i];
      let records = await fsb.exportCustom([collectionName]);
      const items = Object.values(records[collectionName]);
      const table = database.collection(collectionName);
      const options = { ordered: true };
      const result = await table.insertMany(items, options);
      console.log(`${result.insertedCount} documents were inserted`);
    }
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
