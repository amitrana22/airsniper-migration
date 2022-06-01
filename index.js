const firestoreBackup = require("@sgg10/firestore-backup");
const { mongoConnectionUri } = require("./config");
const { cNames, _j, array } = require("./utils");
const serviceAccount = require("./key.json");
var MongoClient = require("mongodb").MongoClient;

let fsb = new firestoreBackup(serviceAccount, "https://air-sniper.firebaseio.com");
const client = new MongoClient(mongoConnectionUri);
const db = fsb.app.app.firestore();
const fbId = "fid";

async function run() {
  try {
    await client.connect();
    const database = client.db("airsniper-dev");
    await _usersGroupsMembers(database); // Import orgs, users, org_members and groups
    // await _devices(database); // Import devices
  } finally {
    await client.close();
  }
}

async function _usersGroupsMembers(database) {
  let orgs = await fsb.exportCustom(["orgs"]);
  let orgList = array(orgs.orgs);
  for (let orgIndex = 0; orgIndex < orgList.length; orgIndex++) {
    const orgObject = orgList[orgIndex];
    orgObject[fbId] = orgObject.id;
    delete orgObject.id;
    const newOrgObject = await database.collection(cNames.orgs).insertOne(orgObject);
    const newOrgId = newOrgObject.insertedId.toString();

    // Add users
    const userSnap = await _j(db.collection(cNames.users).where("orgId", "==", orgObject[fbId]).get());
    for (let userIndex = 0; userIndex < userSnap.length; userIndex++) {
      const userObject = userSnap[userIndex];
      if (userObject != undefined) {
        userObject.orgId = newOrgId;
        userObject[fbId] = userObject.uid;
        await database.collection(cNames.users).insertOne(userObject);
      }
    }

    // Add org members
    // TODO: UPDATE UID based on mongo ID
    const membersSnap = await _j(db.collection(cNames.org_members).where("orgId", "==", orgObject[fbId]).get());
    for (let memberIndex = 0; memberIndex < membersSnap.length; memberIndex++) {
      const memberObject = membersSnap[memberIndex];
      if (memberObject != undefined) {
        memberObject.orgId = newOrgId;
        memberObject[fbId] = memberObject.id;
        delete memberObject.id;
        await database.collection(cNames.org_members).insertOne(memberObject);
      }
    }

    // Add org groups
    const groupsSnap = await _j(db.collection(cNames.groups).where("orgId", "==", orgObject[fbId]).get());
    for (let groupIndex = 0; groupIndex < groupsSnap.length; groupIndex++) {
      const groupObject = groupsSnap[groupIndex];
      if (groupObject != undefined) {
        groupObject.orgId = newOrgId;
        groupObject[fbId] = groupObject.id;
        delete groupObject.id;
        await database.collection(cNames.groups).insertOne(groupObject);
      }
    }
  }
}

async function _devices(database) {
  const devicesList = await _j(db.collection(cNames.orgs).get());
  console.log(devicesList);
}

run().catch(console.dir);
