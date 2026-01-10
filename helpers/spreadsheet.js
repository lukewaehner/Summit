/**
 * Opens a spreadsheet by URL with error handling.
 * @param {string} url
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet | null}
 */
const spreadsheetHelperFunctions = {
  /**
   * Normalizes a Google Sheets URL by removing user-specific parts like /u/0/
   * @param {string} url - The URL to normalize
   * @returns {string} Normalized URL
   */
  _normalizeUrl(url) {
    if (!url) return url;
    // Remove /u/0/, /u/1/, etc. from URLs
    // Convert: https://docs.google.com/spreadsheets/u/0/d/ID/edit
    // To:      https://docs.google.com/spreadsheets/d/ID/edit
    return url.replace(/\/u\/\d+\//g, "/");
  },

  openSpreadsheetWithUrl(url) {
    try {
      const normalizedUrl = this._normalizeUrl(url);
      if (CONFIG.debugMode) {
        Logger.log("Opening URL: " + normalizedUrl);
      }
      return SpreadsheetApp.openByUrl(normalizedUrl);
    } catch (err) {
      Logger.log("Error opening spreadsheet: " + err.message);
      return null;
    }
  },

  /**
   * Opens a spreadsheet by ID with error handling.
   * @param {string} id
   * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet | null}
   */
  openSpreadsheetWithId(id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      console.error("Error opening spreadsheet by ID:", err);
      return null;
    }
  },
};
