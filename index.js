const firestoreBackup = require("@sgg10/firestore-backup");
const { mongoConnectionUri } = require("./config");
const serviceAccount = require("./key.json");
var MongoClient = require("mongodb").MongoClient;

let fsb = new firestoreBackup(serviceAccount, "https://air-sniper.firebaseio.com");
const client = new MongoClient(mongoConnectionUri);

const cNames = {
  alertConditions: "alertConditions",
  alerts: "alerts",
  devices: "devices",
  firmware: "firmware",
  groups: "groups",
  notification_logs: "notification_logs",
  notifications: "notifications",
  notifications_items: "notifications_items",
  operatingManuals: "operatingManuals",
  org_members: "org_members",
  orgs: "orgs",
  schedule_items: "schedule_items",
  schedules: "schedules",
  socketLogs: "socketLogs",
  sockets: "sockets",
  terms_of_service: "terms_of_service",
  terms_of_service_compliance: "terms_of_service_compliance",
  users: "users",
  wifiErrors: "wifiErrors",
};

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
      const orgObject = orgList[orgIndex];
      const newOrgObject = await database.collection(cNames.orgs).insertOne(orgObject);
      const newOrgId = newOrgObject.insertedId.toString();

      // Add users
      const userSnap = await _j(db.collection(cNames.users).where("orgId", "==", orgObject.id).get());
      for (let userIndex = 0; userIndex < userSnap.length; userIndex++) {
        const userObject = userSnap[userIndex];
        if (userObject != undefined) {
          userObject.orgId = newOrgId;
          await database.collection(cNames.users).insertOne(userObject);
        }
      }

      // Add org members
      // TODO: UPDATE UID based on mongo ID
      const membersSnap = await _j(db.collection(cNames.org_members).where("orgId", "==", orgObject.id).get());
      for (let memberIndex = 0; memberIndex < membersSnap.length; memberIndex++) {
        const memberObject = membersSnap[memberIndex];
        if (memberObject != undefined) {
          memberObject.orgId = newOrgId;
          await database.collection(cNames.org_members).insertOne(memberObject);
        }
      }
    }
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
