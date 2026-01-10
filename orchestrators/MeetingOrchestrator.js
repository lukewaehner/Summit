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
 *
 * @returns {Object} Results object with counts and details
 */
function loadMeetings() {
  const startTime = Date.now();
  const verbose = CONFIG.debugMode;

  const results = {
    totalMeetings: 0,
    totalStudents: 0,
    studentsUpdated: 0,
    studentsSkipped: 0,
    meetingsWritten: 0,
    errors: [],
    executionTime: 0,
  };

  if (verbose) {
    Logger.log("═══════════════════════════════════════════════════════════");
    Logger.log("  MEETING SYNC - LOADING MEETINGS TO STUDENT SHEETS");
    Logger.log("═══════════════════════════════════════════════════════════");
  }

  try {
    // Step 1: Fetch and group meetings
    if (verbose) {
      Logger.log("Step 1: Fetching all meetings from Meeting Data sheet...");
    }

    const allMeetings = MeetingDataService.getAllMeetings();
    results.totalMeetings = allMeetings.length;

    if (verbose) {
      Logger.log(`  └─ Found ${allMeetings.length} total meetings`);
    }

    if (allMeetings.length === 0) {
      if (verbose) {
        Logger.log("WARNING: No meetings found in Meeting Data sheet!");
        Logger.log("  Check CONFIG.sheets.meetingData.id is correct");
        Logger.log(
          "═══════════════════════════════════════════════════════════"
        );
      }
      return results;
    }

    const studentsMeetings =
      MeetingDataService.groupMeetingsByStudent(allMeetings);

    if (verbose) {
      Logger.log(`  └─ Grouped into ${studentsMeetings.size} unique students`);
    }

    // Step 2: Fetch all students
    if (verbose) {
      Logger.log("Step 2: Fetching all students from Student Data sheet...");
    }

    const students = StudentDataService.getAllStudents();
    results.totalStudents = students.length;

    if (verbose) {
      Logger.log(`  └─ Found ${students.length} students`);
    }

    if (students.length === 0) {
      if (verbose) {
        Logger.log("WARNING: No students found in Student Data sheet!");
        Logger.log("  Run updateStudentDataSheet() first");
        Logger.log(
          "═══════════════════════════════════════════════════════════"
        );
      }
      return results;
    }

    // Step 3: Process each student
    if (verbose) {
      Logger.log("Step 3: Updating each student's Meetings sheet...");
      Logger.log("───────────────────────────────────────────────────────────");
    }

    const now = new Date();

    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const meetingsForStudent = studentsMeetings.get(student.name) || [];

      if (verbose) {
        Logger.log(
          `[${i + 1}/${students.length}] ${student.name}: ${
            meetingsForStudent.length
          } meetings`
        );
      }

      try {
        // Open the student's personal spreadsheet
        const studentSs = spreadsheetHelperFunctions.openSpreadsheetWithUrl(
          student.url
        );

        if (!studentSs) {
          if (verbose) {
            Logger.log(`  └─ ERROR: Failed to open spreadsheet`);
            Logger.log(`     URL: ${student.url}`);
          }
          results.errors.push({
            student: student.name,
            error: "Failed to open spreadsheet",
          });
          results.studentsSkipped++;
          continue;
        }

        const meetingsSheet = studentSs.getSheetByName("Meetings");
        if (!meetingsSheet) {
          if (verbose) {
            Logger.log(`  └─ ERROR: No "Meetings" sheet found`);
          }
          results.errors.push({
            student: student.name,
            error: "Meetings sheet not found",
          });
          results.studentsSkipped++;
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
          meetingsSheet.getRange(3, 2, existingLastRow - 2, 3).clearContent();
        }

        if (rowsToWrite.length > 0) {
          meetingsSheet
            .getRange(3, 2, rowsToWrite.length, 3)
            .setValues(rowsToWrite);
          results.meetingsWritten += rowsToWrite.length;
        }

        results.studentsUpdated++;

        if (verbose) {
          Logger.log(`  └─ SUCCESS: Wrote ${rowsToWrite.length} meeting rows`);
        }
      } catch (error) {
        if (verbose) {
          Logger.log(`  └─ EXCEPTION: ${error.message}`);
        }
        results.errors.push({
          student: student.name,
          error: error.message,
        });
        results.studentsSkipped++;
      }
    }

    results.executionTime = Date.now() - startTime;

    // Summary
    if (verbose) {
      Logger.log("═══════════════════════════════════════════════════════════");
      Logger.log("  MEETING SYNC SUMMARY");
      Logger.log("═══════════════════════════════════════════════════════════");
      Logger.log(`Total meetings in source: ${results.totalMeetings}`);
      Logger.log(`Total students: ${results.totalStudents}`);
      Logger.log(`Students updated: ${results.studentsUpdated}`);
      Logger.log(`Students skipped: ${results.studentsSkipped}`);
      Logger.log(`Meeting rows written: ${results.meetingsWritten}`);
      Logger.log(`Errors: ${results.errors.length}`);
      Logger.log(`Execution time: ${results.executionTime}ms`);

      if (results.errors.length > 0) {
        Logger.log(
          "───────────────────────────────────────────────────────────"
        );
        Logger.log("Error details:");
        results.errors.forEach((e, idx) => {
          Logger.log(`  ${idx + 1}. ${e.student}: ${e.error}`);
        });
      }

      Logger.log("═══════════════════════════════════════════════════════════");
    }
  } catch (error) {
    Logger.log("ERROR: Fatal error in loadMeetings: " + error.toString());
    results.errors.push({
      error: "Fatal error: " + error.message,
    });
  }

  return results;
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
