/**
 * Helper functions for spreadsheet operations.
 * Provides utilities for opening and manipulating Google Sheets.
 * @namespace spreadsheetHelperFunctions
 */
const spreadsheetHelperFunctions = {
  /**
   * Normalizes a Google Sheets URL by removing user-specific parts like /u/0/
   *
   * @private
   * @param {string} url - The URL to normalize
   * @returns {string} Normalized URL
   *
   * @example
   * _normalizeUrl("https://docs.google.com/spreadsheets/u/0/d/ID/edit")
   * // Returns: "https://docs.google.com/spreadsheets/d/ID/edit"
   */
  _normalizeUrl(url) {
    if (!url) return url;
    // Remove /u/0/, /u/1/, etc. from URLs
    // Convert: https://docs.google.com/spreadsheets/u/0/d/ID/edit
    // To:      https://docs.google.com/spreadsheets/d/ID/edit
    return url.replace(/\/u\/\d+\//g, "/");
  },

  /**
   * Opens a spreadsheet by URL with error handling.
   * Normalizes the URL before opening to handle user-specific URL patterns.
   *
   * @param {string} url - The Google Sheets URL to open
   * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet|null} The spreadsheet object or null if error
   *
   * @example
   * const ss = spreadsheetHelperFunctions.openSpreadsheetWithUrl("https://docs.google.com/spreadsheets/d/ABC123/edit");
   * if (ss) {
   *   Logger.log("Opened: " + ss.getName());
   * }
   */
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
   * Useful when you have just the spreadsheet ID rather than the full URL.
   *
   * @param {string} id - The Google Sheets ID (the part between /d/ and /edit in URLs)
   * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet|null} The spreadsheet object or null if error
   *
   * @example
   * const ss = spreadsheetHelperFunctions.openSpreadsheetWithId("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms");
   * if (ss) {
   *   Logger.log("Opened: " + ss.getName());
   * }
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
