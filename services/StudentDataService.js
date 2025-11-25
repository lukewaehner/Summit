/**
 * Service for managing student data across spreadsheets.
 */

const StudentDataService = {
  /**
   * Fetches all student data (name and URL pairs).
   * @returns {Array<{name: string, url: string}>}
   */
  getAllStudents() {
    const broadcastSs = spreadsheetHelperFunctions.openSpreadsheetWithId(
      CONFIG.sheets.broadcastSheet.id
    );
    if (!broadcastSs) {
      throw new Error("Failed to open broadcast spreadsheet");
    }

    const studentDataSheet = broadcastSs.getSheetByName(
      CONFIG.sheets.broadcastSheet.subSheets.studentData
    );
    if (!studentDataSheet) {
      throw new Error(
        "Student Data sheet not found: " +
          CONFIG.sheets.broadcastSheet.subSheets.studentData
      );
    }

    const lastRow = studentDataSheet.getLastRow();
    if (lastRow < 2) {
      return [];
    }

    // Read all name + URL pairs from Student Data sheet
    const studentRows = studentDataSheet
      .getRange(2, 1, lastRow - 1, 2) // A2:B(lastRow)
      .getValues();

    return studentRows
      .map(([name, url]) => ({
        name: String(name || "").trim(),
        url: String(url || "").trim(),
      }))
      .filter((student) => student.name && student.url);
  },

  /**
   * Updates the Student Data sheet by consolidating data from advisor sheets.
   * Extracts URLs (row 2) and names (row 3) from Maggie and Jackie sheets.
   */
  updateStudentDataSheet() {
    const broadcastSs = spreadsheetHelperFunctions.openSpreadsheetWithId(
      CONFIG.sheets.broadcastSheet.id
    );
    if (!broadcastSs) {
      throw new Error("Failed to open broadcast spreadsheet");
    }

    const dataSheet = broadcastSs.getSheetByName(
      CONFIG.sheets.broadcastSheet.subSheets.studentData
    );
    const maggieSheet = broadcastSs.getSheetByName(
      CONFIG.sheets.broadcastSheet.subSheets.maggieData
    );
    const jackieSheet = broadcastSs.getSheetByName(
      CONFIG.sheets.broadcastSheet.subSheets.jackieData
    );

    const studentMasterSheets = [maggieSheet, jackieSheet];

    /** @type {Array<[string, string]>} */
    const rowsToWrite = [];

    for (const sheet of studentMasterSheets) {
      if (!sheet) {
        continue;
      }

      const lastCol = sheet.getLastColumn();
      if (lastCol < 2) {
        continue; // nothing in row 2/3 beyond column A
      }

      const numCols = lastCol - 1; // starting at col 2 (B)
      // 2 rows (row 2 = URLs, row 3 = names), B → last used column
      const values = sheet.getRange(2, 2, 2, numCols).getValues();
      const urlsRow = values[0]; // row 2
      const namesRow = values[1]; // row 3

      for (let col = 0; col < numCols; col++) {
        const studentUrl = urlsRow[col];
        const studentName = namesRow[col];

        // Skip slots with no URL
        if (!studentUrl) continue;

        rowsToWrite.push([String(studentName || ""), String(studentUrl || "")]);
      }
    }

    if (!dataSheet) {
      throw new Error("Student Data sheet not found");
    }

    // Clear existing data from row 2 down in columns A:B
    const existingLastRow = dataSheet.getLastRow();
    if (existingLastRow > 1) {
      dataSheet.getRange(2, 1, existingLastRow - 1, 2).clearContent();
    }

    if (rowsToWrite.length === 0) {
      return; // nothing to write
    }

    // Write new data starting at row 2, columns A (name), B (URL)
    dataSheet.getRange(2, 1, rowsToWrite.length, 2).setValues(rowsToWrite);
  },
};
