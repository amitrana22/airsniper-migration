const firestoreBackup = require("@sgg10/firestore-backup");
const fs = require("fs");
const { mongoConnectionUri } = require("./config");
const { cNames, _j, array, toDateTime } = require("./utils");
const serviceAccount = require("./key.json");
var MongoClient = require("mongodb").MongoClient;

let logger = fs.createWriteStream(__dirname + "/debug.log", { flags: "w" });

let fsb = new firestoreBackup(serviceAccount, "https://air-sniper.firebaseio.com");
const client = new MongoClient(mongoConnectionUri);
const db = fsb.app.app.firestore();
const fbId = "fid";
const logLimit = 50;

async function run() {
  try {
    await client.connect();
    const database = client.db("airsniper-dev");

    logger.write(`Started at: ${new Date()} \n`);

    // await _usersGroupsMembers(database); // Import orgs, users, org_members and groups
    // await _devices(database); // Import devices and their logs
    // await _firmwares(database); // Import firmwares
    await _schedules(database); // Import schedules

    logger.write(`Completed at: ${new Date()}`);
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
    if (orgObject.createdAt != undefined) orgObject.createdAt = toDateTime(orgObject.createdAt._seconds);
    if (orgObject.updatedAt != undefined) orgObject.updatedAt = toDateTime(orgObject.updatedAt._seconds);
    const newOrgObject = await database.collection(cNames.orgs).insertOne(orgObject);
    const newOrgId = newOrgObject.insertedId.toString();

    // Add users
    const userSnap = await _j(db.collection(cNames.users).where("orgId", "==", orgObject[fbId]).get());
    for (let userIndex = 0; userIndex < userSnap.length; userIndex++) {
      const userObject = userSnap[userIndex];
      if (userObject != undefined) {
        userObject.orgId = newOrgId;
        userObject[fbId] = userObject.uid;
        if (userObject.createdAt != undefined) userObject.createdAt = toDateTime(userObject.createdAt._seconds);
        if (userObject.updatedAt != undefined) userObject.updatedAt = toDateTime(userObject.updatedAt._seconds);
        await database.collection(cNames.users).insertOne(userObject);
      }
    }

    // Add org members
    const membersSnap = await _j(db.collection(cNames.org_members).where("orgId", "==", orgObject[fbId]).get());
    for (let memberIndex = 0; memberIndex < membersSnap.length; memberIndex++) {
      const memberObject = membersSnap[memberIndex];
      if (memberObject != undefined) {
        memberObject.orgId = newOrgId;
        memberObject[fbId] = memberObject.id;
        delete memberObject.id;
        if (memberObject.createdAt != undefined) memberObject.createdAt = toDateTime(memberObject.createdAt._seconds);
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
        if (groupObject.createdAt != undefined) groupObject.createdAt = toDateTime(groupObject.createdAt._seconds);
        await database.collection(cNames.groups).insertOne(groupObject);
      }
    }
  }
}

async function _devices(database) {
  const devicesList = await _j(db.collection(cNames.devices).get());
  for (let deviceIndex = 0; deviceIndex <= devicesList.length; deviceIndex++) {
    const devObj = devicesList[deviceIndex];
    if (devObj != undefined) {
      // Update device org based on Mongo Org
      if (devObj.orgId != undefined) {
        const orgItem = await database.collection(cNames.orgs).findOne({ [fbId]: devObj.orgId });
        devObj.orgId = orgItem._id.toString();
      }

      // Update device group based on Mongo device
      if (devObj.groupName != undefined) {
        const groupItem = await database.collection(cNames.groups).findOne({ [fbId]: devObj.groupName });
        if (groupItem) devObj.groupName = groupItem._id.toString();
      }

      if (devObj.serial != undefined) devObj.serial[fbId] = devObj.serial;

      if (devObj.lastDisconnectedAt != undefined) devObj.lastDisconnectedAt = toDateTime(devObj.lastDisconnectedAt._seconds);

      if (devObj.deviceSwitchedOn != undefined) devObj.deviceSwitchedOn = toDateTime(devObj.deviceSwitchedOn._seconds);
      if (devObj.lastFwAt != undefined) devObj.lastFwAt = toDateTime(devObj.lastFwAt._seconds);
      if (devObj.lastConnectedAt != undefined) devObj.lastConnectedAt = toDateTime(devObj.lastConnectedAt._seconds);
      if (devObj.createdAt != undefined) devObj.createdAt = toDateTime(devObj.createdAt._seconds);
      if (devObj.linkedAt != undefined) devObj.linkedAt = toDateTime(devObj.linkedAt._seconds);

      await database.collection(cNames.devices).insertOne(devObj);
      await rotateLogs(database, cNames.stateLog, devObj.serial);
      await rotateLogs(database, cNames.connectionLog, devObj.serial);
      await rotateLogs(database, cNames.commandLog, devObj.serial);
      await rotateLogs(database, cNames.responseLog, devObj.serial);
    }
  }
}

async function rotateLogs(database, collectionName, serial) {
  let atParamName = "sentAt";
  switch (collectionName) {
    case cNames.connectionLog:
      atParamName = "eventAt";
      break;
    case cNames.stateLog:
      atParamName = "at";
      break;
  }

  const logs = await _j(db.collection(`${cNames.devices}/${serial}/${collectionName}`).orderBy(atParamName, "desc").limit(logLimit).get());

  for (let logIndex = 0; logIndex < logs.length; logIndex++) {
    const logObject = logs[logIndex];
    if (logObject != undefined) {
      if (logObject[atParamName] != undefined) logObject[atParamName] = toDateTime(logObject[atParamName]._seconds);
      logObject.serial = serial;
      logObject.deviceId = serial;
      await database.collection(collectionName).insertOne(logObject);
    }
  }
}

async function _firmwares(database) {
  const firmwaresList = await _j(db.collection(cNames.firmware).get());
  for (let firmwareIndex = 0; firmwareIndex < firmwaresList.length; firmwareIndex++) {
    let firmwareObject = firmwaresList[firmwareIndex];
    if (firmwareObject != undefined) {
      if (firmwareObject.createdAt != undefined) firmwareObject.createdAt = toDateTime(firmwareObject.createdAt._seconds);

      if (firmwareObject.createdBy != undefined) {
        let userItem = await database.collection(cNames.users).findOne({ [fbId]: firmwareObject.createdBy });
        firmwareObject.createdBy = !userItem ? await adminUser(database) : userItem.uid;
      }

      const files = await _j(db.collection(`${cNames.firmware}/${firmwareObject.version}/files`).get());
      if (files.length) {
        firmwareObject.image1 = { file: files[0].file };
        firmwareObject.image2 = { file: files[1].file };
      }

      if (firmwareObject.orgId != "any") {
        let newOrgIds = [];
        for (let item of firmwareObject.orgId) {
          const orgItem = await database.collection(cNames.orgs).findOne({ [fbId]: item });
          newOrgIds.push(orgItem._id.toString());
        }
        firmwareObject.orgId = newOrgIds;
      }

      await database.collection("firmwares").insertOne(firmwareObject);
    }
  }
}

const adminUser = async (database) => {
  const admin = await database.collection(cNames.users).findOne({ email: "admin@yopmail.com" });
  return admin.uid;
};

const _schedules = async (database) => {
  const schedulesList = await _j(db.collection(cNames.schedules).get());
  for (let scheduleObject of schedulesList) {
    scheduleObject[fbId] = scheduleObject.id;
    if (scheduleObject.orgId) {
      const orgItem = await database.collection(cNames.orgs).findOne({ [fbId]: scheduleObject.orgId });
      scheduleObject.orgId = orgItem._id.toString();
    }

    if (scheduleObject.start_date_time != undefined) scheduleObject.start_date_time = toDateTime(scheduleObject.start_date_time._seconds);
    if (scheduleObject.end_date_time != undefined) scheduleObject.end_date_time = toDateTime(scheduleObject.end_date_time._seconds);
    if (scheduleObject.updated_at != undefined) scheduleObject.updated_at = toDateTime(scheduleObject.updated_at._seconds);
    if (scheduleObject.createdAt != undefined) scheduleObject.createdAt = toDateTime(scheduleObject.createdAt._seconds);

    console.log(scheduleObject);
  }
};

run().catch(console.dir);
