
/**
 * Opens a spreadsheet by URL with error handling.
 * @param {string} url
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet | null}
 */
const spreadsheetHelperFunctions = {
  openSpreadsheetWithUrl(url) {
    try {
      return SpreadsheetApp.openByUrl(url);
    } catch (err) {
      console.error('Error opening spreadsheet:', err);
      return null;
    }
  },

  openSpreadsheetWithId(id) {
    try {
      return SpreadsheetApp.openById(id);
    }
    catch (err) {
      console.error('Error opening spreadsheet by ID:', err);
      return null;
    }
  }
}
