const firestoreBackup = require("@sgg10/firestore-backup");
const fs = require("fs");
const { mongoConnectionUri } = require("./config");
const { cNames, _j, array, toDateTime, threeLevels } = require("./utils");
const serviceAccount = require("./key.json");
var MongoClient = require("mongodb").MongoClient;

let logger = fs.createWriteStream(__dirname + "/debug.log", { flags: "w" });

let fsb = new firestoreBackup(serviceAccount, "https://air-sniper.firebaseio.com");
const client = new MongoClient(mongoConnectionUri);
const db = fsb.app.app.firestore();
const fbId = "fid";
const logLimit = 500;

const users = require("./users.json").users;

async function passwords() {
  try {
    await client.connect();
    const database = client.db("airsniper-dev");

    for (let user of users) {
      const updateObject = {};
      if (user.lastSignedInAt != undefined) updateObject.lastLoggedInAt = toDateTime(user.lastSignedInAt, true);
      else updateObject.createdAt = toDateTime(user.createdAt, true);
      if (user.createdAt != undefined) updateObject.createdAt = toDateTime(user.createdAt, true);
      await database.collection(cNames.users).updateOne(
        { email: user.email },
        {
          $set: updateObject,
          $unset: { passwordHash: user.passwordHash, salt: user.salt },
        }
      );
    }
  } catch (err) {
    logger.write(`Error at: ${new Date()} \n\n\n ================ \n\n\n ${err.stack} \n\n\n ============`);
  } finally {
    await client.close();
  }
}

async function run() {
  try {
    await client.connect();
    const database = client.db("airsniper-dev");

    logger.write(`Started at: ${new Date()} \n`);

    await _usersGroupsMembers(database); // Import orgs, users, org_members and groups
    await _devices(database); // Import devices and their logs
    await _firmwares(database); // Import firmwares
    await _schedules(database); // Import schedules
    await _notifications(database); // Import notifications

    logger.write(`Completed at: ${new Date()}`);
  } catch (err) {
    logger.write(`Error at: ${new Date()} \n\n\n ================ \n\n\n ${err.stack} \n\n\n ============`);
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
        const orgItem = await getOrg(database, devObj.orgId);
        devObj.orgId = orgItem._id.toString();
      }

      if (devObj.state != undefined) {
        let currentState = devObj.state;
        if (currentState.at != undefined) currentState.at = toDateTime(currentState.at._seconds);
        devObj.state = currentState;
      }

      if (devObj.maintenance != undefined && typeof maintenance == "object") {
        let updated = [];
        for (let mObject of devObj.maintenance) {
          if (mObject.at != undefined) mObject.at = toDateTime(mObject.at._seconds);
          updated.push(mObject);
        }
        devObj.maintenance = updated;
      }

      // Update device group based on Mongo device
      if (devObj.groupName != undefined) {
        const groupItem = await getGroup(database, devObj.groupName);
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
          const orgItem = await getOrg(database, item);
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

const getOrg = async (database, id) => await database.collection(cNames.orgs).findOne({ [fbId]: id });
const getGroup = async (database, id) => {
  let obj = await database.collection(cNames.groups).findOne({ [fbId]: id });
  if (!obj) obj = await database.collection(cNames.groups).findOne({ groupName: id });
  return obj;
};

const _schedules = async (database) => {
  const schedulesList = await _j(db.collection(cNames.schedules).get());
  for (let scheduleObject of schedulesList) {
    const sID = scheduleObject.id;
    delete scheduleObject.id;
    scheduleObject[fbId] = sID;
    if (scheduleObject.orgId) {
      const orgItem = await getOrg(database, scheduleObject.orgId);
      scheduleObject.orgId = orgItem._id.toString();
    }

    if (scheduleObject.start_date_time != undefined) scheduleObject.start_date_time = toDateTime(scheduleObject.start_date_time._seconds);
    if (scheduleObject.end_date_time != undefined) scheduleObject.end_date_time = toDateTime(scheduleObject.end_date_time._seconds);
    if (scheduleObject.updated_at != undefined) scheduleObject.updated_at = toDateTime(scheduleObject.updated_at._seconds);
    if (scheduleObject.createdAt != undefined) scheduleObject.createdAt = toDateTime(scheduleObject.createdAt._seconds);

    const newSchedule = await database.collection(cNames.schedules).insertOne(scheduleObject);

    // Insert schedule items
    const scheduleItems = await _j(db.collection(cNames.schedule_items).where("schedule_id", "==", sID).get());
    for (let sItem of scheduleItems) {
      if (sItem.org_id != undefined) sItem.org_id = (await getOrg(database, sItem.org_id))._id.toString();
      if (sItem.group_id != undefined) sItem.group_id = (await getGroup(database, sItem.group_id))._id.toString();
      delete sItem.id;
      sItem.schedule_id = newSchedule.insertedId.toString();
      await database.collection(cNames.schedule_items).insertOne(sItem);
    }
  }
};

const _notifications = async (database) => {
  const notificationList = await _j(db.collection(cNames.notifications).get());
  for (let notificationObject of notificationList) {
    const nID = notificationObject.id;
    delete notificationObject.id;
    notificationObject[fbId] = nID;

    if (notificationObject.updated_at != undefined) notificationObject.updated_at = toDateTime(notificationObject.updated_at._seconds);
    if (notificationObject.createdAt != undefined) notificationObject.createdAt = toDateTime(notificationObject.createdAt._seconds);
    if (notificationObject.orgId) notificationObject.orgId = (await getOrg(database, notificationObject.orgId))._id.toString();
    let updated = [];
    for (let createdId of notificationObject.notification_created_ids) {
      let id = createdId;
      switch (notificationObject.notification_for) {
        case threeLevels.org:
          id = (await getOrg(database, createdId))._id.toString();
          break;
        case threeLevels.group:
          id = (await getGroup(database, createdId))._id.toString();
          break;
      }
      updated.push(id);
    }
    notificationObject.notification_created_ids = updated;

    const newNotification = await database.collection(cNames.notifications).insertOne(notificationObject);
    const id = newNotification.insertedId.toString();

    await rotateSubItems(database, cNames.notifications_items, id, nID); // Insert notification items
    await rotateSubItems(database, cNames.notification_logs, id, nID); // Insert notification items
  }
};

const rotateSubItems = async (database, collectionName, id, nID) => {
  let items = await _j(db.collection(collectionName).where("notification_id", "==", nID).get());
  for (let item of items) {
    if (item.last_notification_sent_at && item.last_notification_sent_at != null)
      item.last_notification_sent_at = toDateTime(item.last_notification_sent_at._seconds);
    if (item.createdAt != undefined) item.createdAt = toDateTime(item.createdAt._seconds);
    item.notification_id = id;
    delete item.id;
    await database.collection(collectionName).insertOne(item);
  }
};

run();
