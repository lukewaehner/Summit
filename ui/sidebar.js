/**
 * Sidebar Management Functions
 * Handles creation and display of sidebar UIs for the Summit CRM.
 * @fileoverview Provides functions to open and manage different sidebar views
 */

/**
 * Opens the main Student Manager sidebar.
 * This is the primary entry point for the Summit CRM interface.
 * Displays a list of all students that can be clicked to view their meetings.
 *
 * Called by: Menu item "Send Meeting Notes" in the Summit menu
 *
 * @function
 * @see {@link getStudentManagerSidebarHtml} for the HTML template generator
 *
 * @example
 * // Typically called via the UI menu, or programmatically:
 * openSidebar();
 */
function openSidebar() {
  var html = getStudentManagerSidebarHtml();
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Opens the Student Meeting Notes sidebar for a specific student.
 * Displays all meetings for the selected student with date, time, and notes.
 *
 * @function
 * @param {Object} data - Data object containing student and meeting information
 * @param {string} data.studentName - The name of the student
 * @param {string} [data.studentEmail] - The student's email address (optional)
 * @param {Array<{date: string|Date, time: string|Date, notes: string}>} data.meetings - Array of meeting objects
 *
 * @see {@link StudentDataService.getStudentMeetings} for how meetings are fetched
 *
 * @example
 * openStudentMeetingSidebar({
 *   studentName: "John Doe",
 *   studentEmail: "john.doe@example.com",
 *   meetings: [
 *     { date: new Date("2024-01-15"), time: "10:00 AM", notes: "Discussed project progress" }
 *   ]
 * });
 */
function openStudentMeetingSidebar(data) {
  var template = HtmlService.createTemplateFromFile(
    "ui/sidebars/StudentMeetingNotesSidebar"
  );

  // Pass student name, email, and meetings array to template
  template.data = data; // { studentName: "...", studentEmail: "...", meetings: [...] }

  var html = template.evaluate().setTitle("Student Meetings");
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Generates the HTML for the Student Manager sidebar.
 * Creates an HtmlOutput from the StudentManagerSidebar.html template.
 *
 * @function
 * @returns {GoogleAppsScript.HTML.HtmlOutput} HTML output ready to be displayed in sidebar
 *
 * @example
 * var html = getStudentManagerSidebarHtml();
 * SpreadsheetApp.getUi().showSidebar(html);
 */
function getStudentManagerSidebarHtml() {
  return HtmlService.createHtmlOutputFromFile(
    "ui/sidebars/StudentManagerSidebar"
  ).setTitle("Summit Sidebar");
}

/**
 * Generates the HTML for the Student Meeting Notes sidebar with meeting data.
 * Creates a templated HTML output with meetings pre-populated.
 *
 * Note: This function is less commonly used than openStudentMeetingSidebar(),
 * which provides better data structure by including the student name.
 *
 * @function
 * @param {Array<{date: string|Date, time: string|Date, notes: string}>} meetings - Array of meeting objects
 * @returns {GoogleAppsScript.HTML.HtmlOutput} HTML output ready to be displayed in sidebar
 *
 * @deprecated Consider using openStudentMeetingSidebar() which includes student name
 *
 * @example
 * var meetings = StudentDataService.getStudentMeetings("https://...");
 * var html = getStudentMeetingSidebarHtml(meetings);
 * SpreadsheetApp.getUi().showSidebar(html);
 */
function getStudentMeetingSidebarHtml(meetings) {
  var template = HtmlService.createTemplateFromFile(
    "ui/sidebars/StudentMeetingNotesSidebar"
  );

  // Pass meetings data to template for server-side rendering
  template.meetings = meetings;

  // Evaluate template and return HTML output
  return template.evaluate().setTitle("Student Meetings");
}
