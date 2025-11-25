/**
 * Orchestrates the loading and distribution of meetings to student spreadsheets.
 * This is the main entry point for the meeting sync process.
 */

/**
 * Loads meetings into each student's individual spreadsheet.
 * Main orchestration function that:
 * 1. Fetches all meetings and groups by student
 * 2. Fetches all student data (names and spreadsheet URLs)
 * 3. For each student, opens their spreadsheet and updates the Meetings sheet
 */

function loadMeetings() {
  // Fetch and group meetings
  const allMeetings = MeetingDataService.getAllMeetings();

  const studentsMeetings =
    MeetingDataService.groupMeetingsByStudent(allMeetings);

  // Fetch all students
  const students = StudentDataService.getAllStudents();

  const now = new Date();

  for (const student of students) {
    const meetingsForStudent = studentsMeetings.get(student.name) || [];

    if (CONFIG.debugMode) {
      Logger.log(
        `Student: ${student.name} — meetings: ${meetingsForStudent.length}`
      );
    }

    // Open the student's personal spreadsheet
    const studentSs = spreadsheetHelperFunctions.openSpreadsheetWithUrl(
      student.url
    );
    if (!studentSs) {
      if (CONFIG.debugMode) {
        Logger.log("Failed to open student spreadsheet for: " + student.name);
      }
      continue;
    }

    const meetingsSheet = studentSs.getSheetByName("Meetings");
    if (!meetingsSheet) {
      if (CONFIG.debugMode) {
        Logger.log(
          "Meetings sheet not found in " + student.name + "'s spreadsheet"
        );
      }
      continue;
    }

    // Build rows for this student's Meetings sheet
    const rowsToWrite = meetingHelpers.buildMeetingRows(
      meetingsForStudent,
      now,
      student.name
    );

    // Clear existing B:D starting at row 3
    const existingLastRow = meetingsSheet.getLastRow();
    if (existingLastRow > 2) {
      meetingsSheet
        .getRange(3, 2, existingLastRow - 2, 3) // rows from 3 down, 3 cols (B-D)
        .clearContent();
    }

    if (rowsToWrite.length > 0) {
      meetingsSheet
        .getRange(3, 2, rowsToWrite.length, 3) // start B3, width 3 columns
        .setValues(rowsToWrite);
    }
  }
}

/**
 * Sends an email with meeting notes for selected student.
 * Only the most recent meeting is sent.
 * @param {string} _url - The URL of the student's spreadsheet (unused, for future use)
 * @returns {boolean} - True if the email was sent successfully, false otherwise
 */

function sendMeetingNotes(_url) {
  // NOTE: This must be called from the menu bar
  // TODO: Implement email functionality
  return true;
}
