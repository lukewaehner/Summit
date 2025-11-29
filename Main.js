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
 * Creates a beautifully formatted HTML email using the EmailTemplate.
 *
 * @param {string} studentName - Name of the student
 * @param {string} datetime - Formatted date and time of the meeting
 * @param {string} notes - Meeting notes content
 * @param {string} recipientEmail - Student's email address
 * @returns {Object} Result object with success status and message
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
  try {
    // Validate inputs
    if (!recipientEmail || !recipientEmail.includes("@")) {
      throw new Error("Invalid email address");
    }

    if (!studentName || !datetime || !notes) {
      throw new Error(
        "Missing required fields: studentName, datetime, or notes"
      );
    }

    // Create HTML email from template
    var template = HtmlService.createTemplateFromFile("ui/EmailTemplate");
    template.studentName = studentName;
    template.datetime = datetime;
    template.notes = notes;

    // Evaluate template to get HTML content
    var htmlBody = template.evaluate().getContent();

    // Email subject line
    var subject = "Summit Meeting Notes - " + datetime;

    // Send email with HTML body
    // Using MailApp for compatibility, but GmailApp could also be used
    MailApp.sendEmail({
      to: recipientEmail,
      subject: subject,
      htmlBody: htmlBody,
      name: "Summit CRM",
    });

    if (CONFIG.debugMode) {
      Logger.log("Email sent successfully to: " + recipientEmail);
    }

    return {
      success: true,
      message: "Email sent successfully to " + recipientEmail,
    };
  } catch (error) {
    Logger.log("Error sending email: " + error.toString());
    return {
      success: false,
      message: "Failed to send email: " + error.message,
    };
  }
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
