/**
 * Main entry point for Summit CRM.
 * This file contains the public API functions that can be called from the Apps Script UI.
 */

/**
 * Updates student data and loads all meetings.
 * This is the main sync function that should be run periodically.
 *
 * Verbose logging is enabled when CONFIG.debugMode = true
 *
 * @returns {Object} Results object with student and meeting sync details
 */
function syncAllData() {
  const verbose = CONFIG.debugMode;
  const results = {
    studentDataUpdated: false,
    meetingsLoaded: null,
    errors: [],
  };

  if (verbose) {
    Logger.log("═══════════════════════════════════════════════════════════");
    Logger.log("  SUMMIT CRM - FULL DATA SYNC");
    Logger.log("═══════════════════════════════════════════════════════════");
  }

  try {
    // Step 1: Update student data from advisor sheets
    if (verbose) {
      Logger.log("PHASE 1: Updating Student Data sheet...");
    }

    StudentDataService.updateStudentDataSheet();
    results.studentDataUpdated = true;

    if (verbose) {
      Logger.log("SUCCESS: Student data updated");
      Logger.log("");
    }

    // Step 2: Load meetings to all student spreadsheets
    if (verbose) {
      Logger.log("PHASE 2: Loading meetings to student sheets...");
    }

    results.meetingsLoaded = loadMeetings();

    if (verbose) {
      Logger.log("");
      Logger.log("═══════════════════════════════════════════════════════════");
      Logger.log("  FULL SYNC COMPLETE");
      Logger.log("═══════════════════════════════════════════════════════════");
    }

    return results;
  } catch (error) {
    Logger.log("ERROR in syncAllData: " + error.toString());
    results.errors.push(error.message);
    throw error;
  }
}

/**
 * Only updates the Student Data sheet from advisor sheets.
 * Fetches URLs and names from Maggie/Jackie sheets, looks up emails from each student's Home Page.
 *
 * @returns {Object} Result object
 */
function updateStudentDataSheet() {
  try {
    StudentDataService.updateStudentDataSheet();
    return { success: true, message: "Student data updated successfully" };
  } catch (error) {
    Logger.log("ERROR in updateStudentDataSheet: " + error.toString());
    return { success: false, message: error.message };
  }
}

/**
 * Only loads meetings to student spreadsheets.
 * Fetches meetings from Meeting Data sheet and distributes to each student's Meetings sheet.
 *
 * Verbose logging is enabled when CONFIG.debugMode = true
 *
 * @returns {Object} Results object with counts and details
 */
function syncMeetingsToStudents() {
  return loadMeetings();
}

/**
 * @deprecated Use updateStudentDataSheet() instead
 */
function updateStudentDataSpreadhseet() {
  StudentDataService.updateStudentDataSheet();
}

/**
 * Wrapper function that delegates to StudentDataService.getStudentData().
 * This function is called by the UI sidebar to fetch all students.
 * Uses caching to improve performance.
 *
 * @returns {Array<{name: string, url: string}>} Array of student objects
 * @see {@link StudentDataService.getStudentData}
 */
function getStudentData() {
  // Try cache first
  const cached = SummitCacheService.getCachedStudentList();
  if (cached) {
    if (CONFIG.debugMode) {
      Logger.log("Returning cached student list");
    }
    return cached;
  }

  // Cache miss - fetch from sheet
  const students = StudentDataService.getStudentData();

  // Sort students alphabetically by name
  students.sort((a, b) => a.name.localeCompare(b.name));

  // Cache for next time
  SummitCacheService.cacheStudentList(students);

  return students;
}

/**
 * Wrapper function that delegates to StudentDataService.getStudentMeetings().
 * This function is called by the UI sidebar to fetch meetings for a specific student.
 * Uses caching and limits results to improve performance.
 *
 * @param {string} url - The full URL to the student's spreadsheet
 * @param {number} limit - Optional limit on number of meetings to return (default: 50)
 * @returns {Array<{date: string, time: string, notes: string}>} Array of meeting objects
 * @see {@link StudentDataService.getStudentMeetings}
 */
function getStudentMeetings(url, limit) {
  Logger.log("=== getStudentMeetings called ===");
  Logger.log("URL: " + url);
  Logger.log("Limit: " + limit);

  // Skip cache for debugging
  Logger.log("Fetching from spreadsheet (cache disabled for debug)...");

  // Fetch from spreadsheet
  const allMeetings = StudentDataService.getStudentMeetings(url);

  Logger.log("Fetched " + allMeetings.length + " meetings from spreadsheet");

  if (allMeetings.length > 0) {
    Logger.log("First meeting: " + JSON.stringify(allMeetings[0]));
  }

  // Limit results (most recent first)
  const limitedMeetings = limit ? allMeetings.slice(0, limit) : allMeetings;

  Logger.log("Returning " + limitedMeetings.length + " meetings");
  return limitedMeetings;
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
 * Opens the Student Meeting Notes sidebar for a specific student.
 * Wrapper function that delegates to openStudentMeetingSidebar from sidebar.js.
 * This function is called by the UI sidebar after fetching meetings.
 *
 * @param {Object} data - Data object containing student and meeting information
 * @param {string} data.studentName - The name of the student
 * @param {string} [data.studentEmail] - The student's email address
 * @param {Array} data.meetings - Array of meeting objects
 */
function openStudentMeetingSidebar(data) {
  // Delegate to the sidebar.js function
  return openStudentMeetingSidebar_impl(data);
}

/**
 * Opens the main Student Manager modal dialog.
 * Wrapper function that delegates to openSidebar_impl from sidebar.js.
 * This function is called by the UI menu and the meetings modal "Back" button.
 */
function openSidebar() {
  // Delegate to the sidebar.js function
  return openSidebar_impl();
}

/**
 * Debug function to test student data retrieval.
 * Logs each student's data to Apps Scripts.
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
  return ReviewNotificationService.collectReviewRequests(null);
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

/**
 * Collects outbound reviews from all student spreadsheets (Reviewed: status).
 * Phase 1: Data Collection - Scans student sheets for advisor feedback, writes to OutboundQueue.
 * Wrapper function that delegates to OutboundReviewService.collectOutboundReviews().
 * This should be called by a time-based trigger (every hour).
 *
 * @returns {Object} Collection results
 * @see {@link OutboundReviewService.collectOutboundReviews}
 */
function collectOutboundReviews() {
  return OutboundReviewService.collectOutboundReviews(null);
}

/**
 * Processes pending outbound reviews and notifies students.
 * Phase 2: Notification - Reads OutboundQueue and sends individual emails to students (fast).
 * Wrapper function that delegates to OutboundReviewService.processOutboundReviews().
 * This should be called by a time-based trigger (every 10 minutes).
 *
 * @returns {Object} Processing results
 * @see {@link OutboundReviewService.processOutboundReviews}
 */
function processOutboundReviews() {
  return OutboundReviewService.processOutboundReviews();
}

/**
 * Sets up the OutboundQueue sheet with proper headers.
 * Run this once during initial setup.
 *
 * @returns {Object} Result object
 * @see {@link OutboundReviewService.setupOutboundQueue}
 */
function setupOutboundQueue() {
  return OutboundReviewService.setupOutboundQueue();
}

// ============================================================================
// WORKSHEET VALIDATION SERVICE FUNCTIONS
// ============================================================================

/**
 * Collects worksheet validation issues from all student spreadsheets.
 * Phase 1: Data Collection - Scans Tasks sheets column H for improperly named files.
 * Files should start with student's last name. Issues are written to WorksheetQueue.
 * Wrapper function that delegates to WorksheetValidationService.collectTasksWorksheets().
 * This should be called by a time-based trigger (every hour).
 *
 * @returns {Object} Collection results
 * @see {@link WorksheetValidationService.collectWorksheetIssues}
 */
function collectTasksWorksheets() {
  return WorksheetValidationService.collectTasksWorksheets(null);
}

/**
 * Processes pending worksheet issues from the queue.
 * Phase 2: Processing - Copies, renames, moves files and updates spreadsheet cells.
 * Wrapper function that delegates to WorksheetValidationService.processTasksWorksheets().
 * This should be called by a time-based trigger (every 10 minutes).
 *
 * @returns {Object} Processing results
 * @see {@link WorksheetValidationService.processTasksWorksheets}
 */
function processTasksWorksheets() {
  return WorksheetValidationService.processTasksWorksheets();
}

/**
 * Sets up the WorksheetQueue sheet with proper headers.
 * Run this once during initial setup.
 *
 * @returns {Object} Result object
 * @see {@link WorksheetValidationService.setupWorksheetQueue}
 */
function setupWorksheetQueue() {
  return WorksheetValidationService.setupWorksheetQueue();
}

/**
 * Resets the worksheet collection state to start from the beginning.
 * Useful for forcing a full re-scan of all students.
 *
 * @returns {Object} Result object
 * @see {@link WorksheetValidationService.resetCollectionState}
 */
function resetWorksheetCollectionState() {
  return WorksheetValidationService.resetCollectionState();
}

/**
 * Gets the current worksheet collection progress.
 * Shows how many students have been scanned and percentage complete.
 *
 * @returns {Object} Progress information
 * @see {@link WorksheetValidationService.getCollectionProgress}
 */
function getWorksheetCollectionProgress() {
  return WorksheetValidationService.getCollectionProgress();
}
