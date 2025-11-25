/**
 * Creates a meeting
 * @param {string} name - The name of the student.
 * @param {string} email - The email of the student. (**)
 * @param {Date} date - The date of the meeting.
 * @param {datetime} time - The time of the meeting.
 * @param {string} advisor - Which advisor the meeting is with
 * @param {string} description - A general description of the meeting.
 */
class Meeting {
  constructor(name, email, date, time, advisor, description) {
    this.name = name;
    this.email = email;
    this.date = date;
    this.time = time;
    this.advisor = advisor;
    this.description = description;
  }
}

// Send update meeting notes 
// https://docs.google.com/spreadsheets/d/1P5RoKtaRaj6AXCnyZOqFr_hSZShFkj6kF8vT8SjGh6Q/edit?gid=0#gid=0
/**
 * Sends an email with meeting notes
 * @param {string} studentSheetUrl - The student's spreadsheet to load meeting data
 * @param {Meeting} meetingData - The meeting to be used
 */
function sendMeetingNotes(studentSheetUrl, meetingData) {
  // Try to open students spreadsheet

  // 
}

/**
  * Creates a list of meeting objects from the meeting data sheet.
  * @returns {Meeting[]} - An array of Meeting objects.
  */
function grabAllMeetings() {
  let meetingDataSheet = null;
  let meetings = [];

  Logger.log(`Id: ${CONFIG.sheets.meetingDataSheet.id}`);

  // Open the meeting data sheet
  meetingDataSheet = spreadsheetHelperFunctions.openSpreadsheetWithId(CONFIG.sheets.meetingDataSheet.id).getActiveSheet();
  if (!meetingDataSheet) {
    return;
  }

  const lastRow = meetingDataSheet.getLastRow();
  const data = meetingDataSheet.getRange(1, 1, lastRow, 5).getValues();

  const currentDate = new Date();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const [name, advisor, description, date, time] = row;

    // Early break the first non valid meeting
    if (row.every(cell => cell === "" || cell === null)) {
      break;
    }

    Logger.log(`Row ${i + 1}: Name=${name}, Advisor=${advisor}, Description=${description}, Date=${date}, Time=${time}`);
  }

  // NOTE: Loop meetingDataSheet for information, append to meetings array

  return meetings;

}
