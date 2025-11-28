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

function getStudentDataCheck() {
  var students = getStudentData();
  for (var i = 0; i < students.length; i++) {
    Logger.log(students[i]);
    Logger.log(students[i].name);
    Logger.log(students[i].url);
  }
}
