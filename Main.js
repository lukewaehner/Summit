/**
 * Main entry point for Summit CRM.
 * This file contains the public API functions that can be called from the Apps Script UI.
 */

/**
 * Updates student data and loads all meetings.
 * This is the main sync function that should be run periodically.
 */

function syncAllData() {
  try {
    if (CONFIG.debugMode) {
      Logger.log("Starting full data sync...");
    }

    // Step 1: Update student data from advisor sheets
    StudentDataService.updateStudentDataSheet();

    if (CONFIG.debugMode) {
      Logger.log("Student data updated successfully");
    }

    // Step 2: Load meetings to all student spreadsheets
    loadMeetings();

    if (CONFIG.debugMode) {
      Logger.log("Meeting data loaded successfully");
    }

    return true;
  } catch (error) {
    Logger.log("Error in syncAllData: " + error.toString());
    throw error;
  }
}

/**
 * Only updates the Student Data sheet from advisor sheets.
 * @deprecated Use StudentDataService.updateStudentDataSheet() or syncAllData()
 */

function updateStudentDataSpreadhseet() {
  StudentDataService.updateStudentDataSheet();
}

/**
 * Wrapper function that delegates to StudentDataService.getStudentData().
 * This function is called by the UI sidebar to fetch all students.
 *
 * @returns {Array<{name: string, url: string}>} Array of student objects
 * @see {@link StudentDataService.getStudentData}
 */
function getStudentData() {
  return StudentDataService.getStudentData();
}

/**
 * Wrapper function that delegates to StudentDataService.getStudentMeetings().
 * This function is called by the UI sidebar to fetch meetings for a specific student.
 *
 * @param {string} url - The full URL to the student's spreadsheet
 * @returns {Array<{date: string, time: string, notes: string}>} Array of meeting objects
 * @see {@link StudentDataService.getStudentMeetings}
 */
function getStudentMeetings(url) {
  return StudentDataService.getStudentMeetings(url);
}

/**
 * Sends meeting notes email to a student.
 * Wrapper function that delegates to EmailService.sendMeetingNotes().
 * This function is called by the UI sidebar when sending emails.
 *
 * @param {string} studentName - Name of the student
 * @param {string} datetime - Formatted date and time of the meeting
 * @param {string} notes - Meeting notes content
 * @param {string} recipientEmail - Student's email address
 * @returns {Object} Result object with success status and message
 * @see {@link EmailService.sendMeetingNotes}
 *
 * @example
 * sendMeetingNotesEmail(
 *   "John Doe",
 *   "Jan 15, 2024 (10:00 AM)",
 *   "Discussed project progress...",
 *   "john.doe@example.com"
 * );
 */
function sendMeetingNotesEmail(studentName, datetime, notes, recipientEmail) {
  return EmailService.sendMeetingNotes(
    studentName,
    datetime,
    notes,
    recipientEmail
  );
}

/**
 * Debug function to test student data retrieval.
 * Logs each student's data to the Apps Script logger.
 */
function getStudentDataCheck() {
  var students = getStudentData();
  for (var i = 0; i < students.length; i++) {
    Logger.log(students[i]);
    Logger.log(students[i].name);
    Logger.log(students[i].url);
  }
}

/**
 * Collects review requests from all student spreadsheets.
 * Phase 1: Data Collection - Scans student sheets and writes to central queue.
 * Wrapper function that delegates to ReviewNotificationService.collectReviewRequests().
 * This should be called by a time-based trigger (every hour).
 *
 * @returns {Object} Collection results
 * @see {@link ReviewNotificationService.collectReviewRequests}
 */
function collectReviewRequests() {
  return ReviewNotificationService.collectReviewRequests();
}

/**
 * Processes pending review requests and notifies advisors.
 * Phase 2: Notification - Reads central queue and sends batch emails (fast).
 * Wrapper function that delegates to ReviewNotificationService.processReviewRequests().
 * This should be called by a time-based trigger (every 10 minutes).
 *
 * @returns {Object} Processing results
 * @see {@link ReviewNotificationService.processReviewRequests}
 */
function processReviewRequests() {
  return ReviewNotificationService.processReviewRequests();
}

/**
 * Marks a student's review request as completed.
 * Wrapper function that delegates to ReviewNotificationService.markAsCompleted().
 *
 * @param {string} studentName - Name of the student
 * @returns {Object} Result object
 * @see {@link ReviewNotificationService.markAsCompleted}
 */

function markReviewAsCompleted(studentName) {
  return ReviewNotificationService.markAsCompleted(studentName);
}

/**
 * Sets up the ReviewQueue sheet with proper headers.
 * Run this once during initial setup.
 *
 * @returns {Object} Result object
 * @see {@link ReviewNotificationService.setupReviewQueue}
 */

function setupReviewQueue() {
  return ReviewNotificationService.setupReviewQueue();
}
