/**
 * UI Menu Functions
 * Creates and manages the custom menu in Google Sheets.
 * @fileoverview Entry point for adding Summit CRM menu to the Google Sheets UI
 */

/**
 * Creates and adds the Summit CRM custom menu to the Google Sheets UI.
 * This function is typically called automatically by Apps Script when the spreadsheet opens.
 * The menu provides access to the main CRM features through the sidebar.
 *
 * Menu Structure:
 * - Summit (top-level menu)
 *   - Send Meeting Notes (opens the student manager sidebar)
 *
 * @function
 * @see {@link openSidebar} for the function called when menu item is clicked
 *
 * @example
 * // Called automatically on spreadsheet open, or manually:
 * startMenu();
 */
function startMenu() {
  SpreadsheetApp.getUi()
    .createMenu("Summit")
    .addItem("Send Meeting Notes", "openSidebar")
    .addToUi();
}
