/**
 * @typedef {Object} SheetRef
 * @property {string} id - The ID of the Google Sheet
 * @property {string} name - The name of the sheet within the Google Sheet
 * @property {{ [key: string]: string }} subSheets - Optional subsheets within the sheet
 */

/**
 * @typedef {Object} SummitConfig
 * @property {{ [key: string]: SheetRef}} sheets - The base URL for the Summit API
 * @property {boolean} debugMode - Whether debug mode is enabled
 */

/**
 * Global config for Summit
 * @type {Readonly<SummitConfig>}
 */

const CONFIG = Object.freeze({
  sheets: {
    meetingData: {
      id: "1P5RoKtaRaj6AXCnyZOqFr_hSZShFkj6kF8vT8SjGh6Q",
      name: "Meeting Data",
      subSheets: {},
    },
    broadcastSheet: {
      id: "1lLnHazBVkzL2ajKObtHqNCK0nEW3bCX3I8mDCquoEgw",
      name: "Broadcast Sheet",
      subSheets: {
        studentData: "StudentData",
        jackieData: "StudentStatusJacklyn",
        maggieData: "StudentStatusMaggie",
      },
    },
  },
  debugMode: true,
});
