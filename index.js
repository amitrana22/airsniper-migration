const firestoreBackup = require("@sgg10/firestore-backup");
const { mongoConnectionUri } = require("./config");
const serviceAccount = require("./key.json");
var MongoClient = require("mongodb").MongoClient;

let fsb = new firestoreBackup(serviceAccount, "https://air-sniper.firebaseio.com");

const client = new MongoClient(mongoConnectionUri);

const excluded = ["devices", "wifiErrors"];
const collections = [
  "alertConditions",
  "alerts",
  "devices",
  "firmware",
  "groups",
  "notification_logs",
  "notifications",
  "notifications_items",
  "operatingManuals",
  "org_members",
  "orgs",
  "schedule_items",
  "schedules",
  "socketLogs",
  "sockets",
  "terms_of_service",
  "terms_of_service_compliance",
  "users",
  "wifiErrors",
];

const array = (records) => Object.values(records);
const db = fsb.app.app.firestore();
const _j = async (query) => (await query).docs.map((doc) => doc.data());

async function run() {
  try {
    await client.connect();
    const database = client.db("airsniper-dev");

    let orgs = await fsb.exportCustom(["orgs"]);
    let orgList = array(orgs.orgs);
    for (let orgIndex = 0; orgIndex < orgList.length; orgIndex++) {
      // for (let orgIndex = 0; orgIndex < 1; orgIndex++) {
      const orgObject = orgList[orgIndex];
      const newOrgObject = await database.collection("orgs").insertOne(orgObject);

      // Add users
      const userSnap = await _j(db.collection("users").where("orgId", "==", orgObject.id).get());
      for (let userIndex = 0; userIndex <= userSnap.length; userIndex++) {
        const userObject = userSnap[userIndex];
        if (userObject.uid) {
          userObject.orgId = newOrgObject.insertedId.toString();
          await database.collection("users").insertOne(userObject);
        }
      }
    }

    // let filteredList = list;
    // for (let i = 0; i < filteredList.length; i++) {
    //   let collectionName = filteredList[i];
    //   let records = await fsb.exportCustom([collectionName]);
    //   const items = Object.values(records[collectionName]);
    //   const table = database.collection(collectionName);
    //   const options = { ordered: true };
    //   const result = await table.insertMany(items, options);
    //   console.log(`${result.insertedCount} documents were inserted`);
    // }
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
