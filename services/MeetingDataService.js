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

    // Read 6 columns: A=name, B=email, C=advisor, D=description, E=date
    const data = meetingDataSheet.getRange(1, 1, lastRow, 5).getValues();
    /** @type {Meeting[]} */
    const meetings = [];

    // Log headers to debug column mapping
    if (CONFIG.debugMode && data.length > 0) {
      const headers = data[0];
      Logger.log("Meeting Data columns:");
      Logger.log(
        `  A: "${headers[0]}", B: "${headers[1]}", C: "${headers[2]}", D: "${headers[3]}", E: "${headers[4]}"}"`
      );
    }

    for (let i = 1; i < data.length; i++) {
      // skip header
      const row = data[i];
      // Columns: A=name, B=email, C=advisor, D=meeting title, E=date
      const [name, email, advisor, description, date] = row;

      // Early break on first fully empty row
      if (row.every((cell) => cell === "" || cell === null)) {
        break;
      }


      // Create Meeting with correct column mapping
      const meeting = new Meeting(
        name,
        email || "",
        date,
        advisor,
        description
      );
      meetings.push(meeting);
    }

    // Meeting object -> name, email, date, advisor, description
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
