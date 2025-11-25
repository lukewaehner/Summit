/**
 * Updates the Student Data sheet so that:
 *  - Column A = student name
 *  - Column B = student URL
 * using data from Maggie/Jackie sheets, where:
 *  - Row 2 (B2 → …) = URLs
 *  - Row 3 (B3 → …) = names
 */
function updateStudentDataSpreadhseet() {
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
    const urlsRow = values[0];  // row 2
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
    dataSheet
      .getRange(2, 1, existingLastRow - 1, 2)
      .clearContent();
  }

  if (rowsToWrite.length === 0) {
    return; // nothing to write
  }

  // Write new data starting at row 2, columns A (name), B (URL)
  dataSheet
    .getRange(2, 1, rowsToWrite.length, 2)
    .setValues(rowsToWrite);
}
