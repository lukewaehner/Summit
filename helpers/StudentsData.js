function getStudentData() {
  const broadcast = spreadsheetHelperFunctions.openSpreadsheetWithId(
    CONFIG.sheets.broadcastSheet.id
  );
  const studentDataSheet = broadcast.getSheetByName(
    CONFIG.sheets.broadcastSheet.subSheets.studentData
  );

  if (CONFIG.debugMode) {
    Logger.log(`Opened Student Data sheet: ${studentDataSheet.getName()}`);
  }
  const lastRow = studentDataSheet.getLastRow();
  if (CONFIG.debugMode) {
    Logger.log(`Student Data sheet last row: ${lastRow}`);
  }
  if (lastRow < 2) return []; // No data early exit

  // A2:B<last>
  const values = studentDataSheet.getRange(2, 1, lastRow - 1, 2).getValues();
  Logger.log(`Fetched ${values.length} student data rows`);

  return values
    .filter(([name, url]) => name && url)    // remove empty rows
    .map(([name, url]) => ({
      name: String(name).trim(),
      url: String(url).trim(),
    }));
}

function getStudentMeetings(url) {
  const studentSheet = spreadsheetHelperFunctions.openSpreadsheetWithUrl(url).getSheetByName("Meetings");

  const lastRow = studentSheet.getLastRow();
  if (lastRow < 2) return []; // No data early exit

  const values = studentSheet.getRange(3, 3, lastRow - 1, 3).getValues();

}
