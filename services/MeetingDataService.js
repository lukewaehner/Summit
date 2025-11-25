/**
 * Service for fetching and managing meeting data from spreadsheets.
 */

const MeetingDataService = {
  /**
   * Fetches all meetings from the meeting data sheet.
   * @returns {Meeting[]} - An array of Meeting objects.
   */
  getAllMeetings() {
    const ss = spreadsheetHelperFunctions.openSpreadsheetWithId(
      CONFIG.sheets.meetingData.id
    );
    if (!ss) {
      if (CONFIG.debugMode) {
        Logger.log("Failed to open meeting data spreadsheet");
      }
      return [];
    }

    const meetingDataSheet = spreadsheetHelperFunctions
      .openSpreadsheetWithId(CONFIG.sheets.meetingData.id)
      .getActiveSheet();
    if (!meetingDataSheet) {
      if (CONFIG.debugMode) {
        Logger.log(
          "Meeting data sheet not found: " + CONFIG.sheets.meetingData.name
        );
      }
      return [];
    }

    const lastRow = meetingDataSheet.getLastRow();
    if (lastRow < 2) {
      return [];
    }

    const data = meetingDataSheet.getRange(1, 1, lastRow, 5).getValues();
    /** @type {Meeting[]} */
    const meetings = [];

    for (let i = 1; i < data.length; i++) {
      // skip header
      const row = data[i];
      const [name, advisor, description, date, time] = row;

      // Early break on first fully empty row
      if (row.every((cell) => cell === "" || cell === null)) {
        break;
      }

      // Adjust date for timezone - add 1 hour to compensate for timezone offset
      let adjustedDate = date;
      if (date instanceof Date) {
        adjustedDate = new Date(date.getTime() + 60 * 60 * 1000); // Add 1 hour in milliseconds
      }

      // Push all
      const meeting = new Meeting(
        name,
        "",
        adjustedDate,
        time,
        advisor,
        description
      );
      meetings.push(meeting);
    }

    return meetings;
  },

  /**
   * Groups meetings by student name.
   * @param {Meeting[]} meetings - Array of all meetings
   * @returns {Map<string, Meeting[]>}
   */
  groupMeetingsByStudent(meetings) {
    if (CONFIG.debugMode) {
      Logger.log(`Total meetings to group: ${meetings.length}`);
    }

    /** @type {Map<string, Meeting[]>} */
    const studentsMeetings = new Map();

    for (const meeting of meetings) {
      const list = studentsMeetings.get(meeting.name) ?? [];
      list.push(meeting);
      studentsMeetings.set(meeting.name, list);
    }

    return studentsMeetings;
  },
};
