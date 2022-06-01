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
  stateLog: "stateLog",
  responseLog: "responseLog",
  connectionLog: "connectionLog",
  commandLog: "commandLog",
};

const array = (records) => Object.values(records);
const _j = async (query) => (await query).docs.map((doc) => doc.data());

const toDateTime = (secs) => {
  var t = new Date(1970, 0, 1);
  t.setSeconds(secs);
  return t;
};

module.exports = { cNames, array, _j, toDateTime };
