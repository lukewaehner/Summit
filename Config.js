
/**
 * @typedef {Object} SheetRef
 * @property {string} id - The ID of the Google Sheet
 * @property {string} name - The name of the sheet within the Google Sheet
 */

/**
 * @typedef {Object} SummitConfig
 * @property {{ [key: string]: SheetRef}} sheets - The base URL for the Summit API
 */

/**
 * Global config for Summit
 * @type {Readonly<SummitConfig>}
 */
const CONFIG = Object.freeze({
  sheets: {
    meetingData: {
      id: '1lLnHazBVkzL2ajKObtHqNCK0nEW3bCX3I8mDCquoEgw',
      name: 'Meeting Data'
    }

  }
})
