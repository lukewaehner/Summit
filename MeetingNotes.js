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

// https://docs.google.com/spreadsheets/d/1P5RoKtaRaj6AXCnyZOqFr_hSZShFkj6kF8vT8SjGh6Q/edit?gid=0#gid=0

/**
 * Sends an email with for selected student, most recent meeting only sent 
 * @param {string} url - The URL of the student's spreadsheet
 * @returns {boolean} - True if the email was sent successfully, false otherwise
 */
function sendMeetingNotes(url) {
  // NOTE: This must be called from the menu bar
  return true;
}

/**
 * Load meetings into each student's individual spreadsheet.
 * Uses:
 *  - trackMeetingsToStudents(): Map<studentName, Meeting[]>
 *  - studentDataSheet: name in col A, URL in col B
 *  - Student sheet "Meetings": A=name, B=status, C=date, D=time
 */
function loadMeetings() {
  // Map student -> list of meetings
  const studentsMeetings = trackMeetingsToStudents();

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
      "Student Data sheet not found: " + CONFIG.sheets.broadcastSheet.subSheets.studentData
    );
  }

  const lastRow = studentDataSheet.getLastRow();
  if (lastRow < 2) {
    if (CONFIG.debugMode) {
      Logger.log("No student rows found in Student Data sheet.");
    }
    return;
  }

  // Read all name + URL pairs from Student Data sheet
  const studentRows = studentDataSheet
    .getRange(2, 1, lastRow - 1, 2) // A2:B(lastRow)
    .getValues();

  const now = new Date();

  for (let i = 0; i < studentRows.length; i++) {
    const [studentNameRaw, studentUrl] = studentRows[i];
    const studentName = String(studentNameRaw || "").trim();

    if (!studentName || !studentUrl) {
      continue; // skip incomplete rows
    }

    const meetingsForStudent = studentsMeetings.get(studentName) || [];

    if (CONFIG.debugMode) {
      Logger.log(
        `Student: ${studentName} — meetings: ${meetingsForStudent.length}`
      );
    }

    // Open the student's personal spreadsheet
    const studentSs = spreadsheetHelperFunctions.openSpreadsheetWithUrl(
      studentUrl
    );
    if (!studentSs) {
      if (CONFIG.debugMode) {
        Logger.log("Failed to open student spreadsheet for: " + studentName);
      }
      continue;
    }

    const meetingsSheet = studentSs.getSheetByName("Meetings");
    if (!meetingsSheet) {
      if (CONFIG.debugMode) {
        Logger.log('Meetings sheet not found in ' + studentName + "'s spreadsheet");
      }
      continue;
    }

    // Compute rows for this student's Meetings sheet
    const rowsToWrite = buildMeetingRowsForStudent(meetingsForStudent, now, studentName);


    // Clear existing B:D starting at row 3
    const existingLastRow = meetingsSheet.getLastRow();
    if (existingLastRow > 2) {
      meetingsSheet
        .getRange(3, 2, existingLastRow - 2, 3) // rows from 3 down, 3 cols (B-D)
        .clearContent();
    }

    if (rowsToWrite.length > 0) {
      meetingsSheet
        .getRange(3, 2, rowsToWrite.length, 3)  // start B3, width 3 columns
        .setValues(rowsToWrite);
    }
  }
}

/**
 * Given a list of Meeting objects for a single student,
 * build rows [name, status, date, time] for Meetings sheet.
 *
 * @param {Meeting[]} meetings
 * @param {Date} now
 * @param {string} studentName
 * @returns {any[][]}
 */
function buildMeetingRowsForStudent(meetings, now, studentName) {
  if (!meetings || meetings.length === 0) {
    return [];
  }

  // Build list with timestamps for sorting
  const withTs = meetings.map(m => ({
    meeting: m,
    ts: getMeetingTimestamp(m, now),
  }));

  const past = withTs.filter(x => x.ts < now.getTime());
  const future = withTs.filter(x => x.ts >= now.getTime());

  // Sort: past ascending by time, future ascending by time
  past.sort((a, b) => a.ts - b.ts);
  future.sort((a, b) => a.ts - b.ts);

  /** @type {{meeting: Meeting, status: string}[]} */
  const ordered = [];

  // Past meetings: last one is "Current Meeting", others "Past Meeting"
  if (past.length > 0) {
    for (let i = 0; i < past.length - 1; i++) {
      ordered.push({ meeting: past[i].meeting, status: "Past Meeting" });
    }
    ordered.push({
      meeting: past[past.length - 1].meeting,
      status: "Current Meeting",
    });
  }

  // Future meetings: earliest is "Next Meeting", others "Future Meeting"
  if (future.length > 0) {
    ordered.push({
      meeting: future[0].meeting,
      status: "Next Meeting",
    });
    for (let i = 1; i < future.length; i++) {
      ordered.push({
        meeting: future[i].meeting,
        status: "Future Meeting",
      });
    }
  }

  // Convert to sheet rows: A=name, B=status, C=date, D=time
  const rows = ordered.map(entry => {
    const m = entry.meeting;
    return [entry.status, m.date, m.time];
  });

  return rows;
}

/**
 * Compute a numeric timestamp for a Meeting for sorting.
 * Uses date primarily; if date is not a Date, falls back to Date.parse.
 *
 * @param {Meeting} meeting
 * @param {Date} now
 * @returns {number}
 */
function getMeetingTimestamp(meeting, now) {
  const d = meeting.date instanceof Date
    ? meeting.date
    : new Date(meeting.date || now);

  // If needed you can incorporate time into this if time is a string or Date
  return d.getTime();
}

/**
 * @returns {Map<string, Meeting[]>}
 */
function trackMeetingsToStudents() {
  const meetings = grabAllMeetings() || [];

  if (CONFIG.debugMode) {
    Logger.log(`Total meetings grabbed: ${meetings.length}`);
  }

  /** @type {Map<string, Meeting[]>} */
  const studentsMeetings = new Map();

  for (const meeting of meetings) {
    const list = studentsMeetings.get(meeting.name) ?? [];
    list.push(meeting);
    studentsMeetings.set(meeting.name, list);
  }

  return studentsMeetings;
}

/**
  * Creates a list of meeting objects from the meeting data sheet.
  * @returns {Meeting[]} - An array of Meeting objects.
  */
function grabAllMeetings() {
  const ss = spreadsheetHelperFunctions.openSpreadsheetWithId(
    CONFIG.sheets.meetingData.id
  );
  if (!ss) {
    if (CONFIG.debugMode) {
      Logger.log("Failed to open meeting data spreadsheet");
    }
    return [];
  }

  const meetingDataSheet = ss.getSheetByName(CONFIG.sheets.meetingData.name);
  if (!meetingDataSheet) {
    if (CONFIG.debugMode) {
      Logger.log("Meeting data sheet not found: " + CONFIG.sheets.meetingData.name);
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

  const today = new Date();

  for (let i = 1; i < data.length; i++) { // skip header
    const row = data[i];
    const [name, advisor, description, date, time] = row;

    // Early break on first fully empty row
    if (row.every(cell => cell === "" || cell === null)) {
      break;
    }

    // Push all
    const meeting = new Meeting(name, "", date, time, advisor, description);
    meetings.push(meeting);
  }

  return meetings;
}
