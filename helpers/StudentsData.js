function getStudentData() {
  const broadcast = spreadsheetHelperFunctions.openSpreadsheetWithId(
    CONFIG.sheets.broadcastSheet.id
  );
  const studentDataSheet = broadcast.getSheetByName(
    CONFIG.sheets.broadcastSheet.subSheets.studentData
  );

  const lastRow = studentDataSheet.getLastRow();
  if (lastRow < 2) return []; // No data early exit

  // A2:B<last>
  const values = studentDataSheet.getRange(2, 1, lastRow - 1, 2).getValues();

  return values
    .filter(([name, url]) => name && url)    // remove empty rows
    .map(([name, url]) => ({
      name: String(name).trim(),
      url: String(url).trim(),
    }));
}
