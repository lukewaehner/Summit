/**
 * Create a menu bar called "Summit Menu" with other submenus
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();

  ui.createMenu("Summit Menu")
    .addItem("Send Meeting Notes Email", "openEmailNotesDialogue")
    .addToUi();
}

/**
 * Opens the email notes dialog sidebar.
 * This function is called from the menu.
 */
function openEmailNotesDialogue() {
  try {
    const htmlOutput = HtmlService.createTemplateFromFile(
      "StudentMeetingNotesEmailer"
    )
      .evaluate()
      .setTitle("Send Meeting Notes")
      .setWidth(350);

    SpreadsheetApp.getUi().showSidebar(htmlOutput);

    if (CONFIG.debugMode) {
      Logger.log("[DEBUG] Sidebar opened successfully");
    }
  } catch (error) {
    Logger.log("[ERROR] Failed to open sidebar: " + error.toString());
    SpreadsheetApp.getUi().alert("Error opening sidebar: " + error.message);
  }
}

/**
 * Helper: Gets all students from the broadcast sheet.
 */
function getAllStudents() {
  try {
    Logger.log("[DEBUG] getAllStudents() START");
    Logger.log(
      "[DEBUG] CONFIG.sheets exists: " + (typeof CONFIG.sheets !== "undefined")
    );

    const broadcastSs = SpreadsheetApp.openById(
      CONFIG.sheets.broadcastSheet.id
    );
    Logger.log("[DEBUG] Opened broadcast spreadsheet");

    const studentDataSheet = broadcastSs.getSheetByName(
      CONFIG.sheets.broadcastSheet.subSheets.studentData
    );
    Logger.log(
      "[DEBUG] Got student data sheet: " + (studentDataSheet !== null)
    );

    const lastRow = studentDataSheet.getLastRow();
    Logger.log("[DEBUG] Last row: " + lastRow);

    if (lastRow < 2) {
      Logger.log("[DEBUG] No students found (lastRow < 2)");
      return [];
    }

    const studentRows = studentDataSheet
      .getRange(2, 1, lastRow - 1, 2)
      .getValues();

    Logger.log("[DEBUG] Raw student rows: " + studentRows.length);

    const students = studentRows
      .map(([name, url]) => ({
        name: String(name || "").trim(),
        url: String(url || "").trim(),
      }))
      .filter((student) => student.name && student.url);

    Logger.log("[DEBUG] Filtered students: " + students.length);
    Logger.log(
      "[DEBUG] getAllStudents() RETURNING: " + JSON.stringify(students)
    );

    return students;
  } catch (error) {
    Logger.log("[ERROR] getAllStudents() failed: " + error.toString());
    Logger.log("[ERROR] Stack: " + error.stack);
    return [];
  }
}

/**
 * Helper: Opens a spreadsheet by URL.
 */
function openSpreadsheetByUrl(url) {
  try {
    return SpreadsheetApp.openByUrl(url);
  } catch (err) {
    Logger.log("Error opening spreadsheet: " + err);
    return null;
  }
}

/**
 * Gets all students with their meetings that have notes.
 * Called from HTML sidebar.
 * @returns {Array<{name: string, url: string, meetings: Array}>}
 */
function getStudentsWithMeetings() {
  Logger.log("[DEBUG] ===== getStudentsWithMeetings START =====");

  try {
    Logger.log("[DEBUG] About to call getAllStudents()");
    const students = getAllStudents();

    Logger.log(
      "[DEBUG] getAllStudents() returned: " +
        (students ? students.length : "null/undefined")
    );
    Logger.log("[DEBUG] Students type: " + typeof students);
    Logger.log("[DEBUG] Students is array: " + Array.isArray(students));

    if (!students) {
      Logger.log("[ERROR] students is null or undefined!");
      return [];
    }

    Logger.log(`[DEBUG] Found ${students.length} students`);

    if (students.length === 0) {
      Logger.log("[DEBUG] No students to process, returning empty array");
      return [];
    }

    Logger.log("[DEBUG] Starting to map students");

    const result = students.map((student, index) => {
      try {
        Logger.log(
          `[DEBUG] Processing student ${index + 1}/${students.length}: ${
            student.name
          }`
        );

        const meetings = getStudentMeetingsWithNotes(student.name, student.url);
        Logger.log(`[DEBUG] ${student.name}: Got ${meetings.length} meetings`);

        // Format meetings for display
        const formattedMeetings = meetings.map((meeting) => {
          const dateStr =
            meeting.date instanceof Date
              ? Utilities.formatDate(
                  meeting.date,
                  Session.getScriptTimeZone(),
                  "MMM d, yyyy"
                )
              : String(meeting.date);

          const timeStr =
            meeting.time instanceof Date
              ? Utilities.formatDate(
                  meeting.time,
                  Session.getScriptTimeZone(),
                  "h:mm a"
                )
              : String(meeting.time);

          return {
            row: meeting.row,
            dateStr: dateStr,
            timeStr: timeStr,
            notes: meeting.notes,
            preview:
              meeting.notes.substring(0, 50) +
              (meeting.notes.length > 50 ? "..." : ""),
          };
        });

        Logger.log(
          `[DEBUG] ${student.name}: Formatted ${formattedMeetings.length} meetings`
        );

        const studentResult = {
          name: student.name,
          url: student.url,
          meetings: formattedMeetings,
        };

        Logger.log(
          `[DEBUG] ${student.name}: Returning result with ${formattedMeetings.length} meetings`
        );
        return studentResult;
      } catch (error) {
        Logger.log(
          `[ERROR] Error processing ${student.name}: ${error.toString()}`
        );
        Logger.log(`[ERROR] Stack: ${error.stack}`);
        return {
          name: student.name,
          url: student.url,
          meetings: [],
        };
      }
    });

    Logger.log("[DEBUG] Finished mapping all students");
    Logger.log("[DEBUG] Result length: " + result.length);
    Logger.log("[DEBUG] Result type: " + typeof result);
    Logger.log("[DEBUG] Result is array: " + Array.isArray(result));

    // Try to stringify to check if it's serializable
    try {
      const jsonTest = JSON.stringify(result);
      Logger.log("[DEBUG] JSON stringify SUCCESS, length: " + jsonTest.length);
      Logger.log("[DEBUG] First 500 chars: " + jsonTest.substring(0, 500));
    } catch (jsonError) {
      Logger.log("[ERROR] JSON stringify FAILED: " + jsonError.toString());
    }

    Logger.log("[DEBUG] ===== getStudentsWithMeetings END =====");
    Logger.log("[DEBUG] ABOUT TO RETURN: " + result.length + " students");

    // Force return as plain array - sometimes needed for Apps Script serialization
    const plainResult = result.map(function (student) {
      return {
        name: String(student.name),
        url: String(student.url),
        meetings: student.meetings.map(function (meeting) {
          return {
            row: Number(meeting.row),
            dateStr: String(meeting.dateStr),
            timeStr: String(meeting.timeStr),
            notes: String(meeting.notes),
            preview: String(meeting.preview),
          };
        }),
      };
    });

    Logger.log("[DEBUG] Created plain result");
    Logger.log("[DEBUG] Plain result length: " + plainResult.length);
    Logger.log("[DEBUG] Plain result type: " + typeof plainResult);

    return plainResult;
  } catch (error) {
    Logger.log(
      `[ERROR] Fatal error in getStudentsWithMeetings: ${error.toString()}`
    );
    Logger.log(`[ERROR] Stack: ${error.stack}`);
    Logger.log("[DEBUG] Returning empty array due to error");
    return [];
  }
}

/**
 * Helper: Gets meetings with notes from a student's spreadsheet.
 */
function getStudentMeetingsWithNotes(studentName, studentUrl) {
  try {
    if (CONFIG.debugMode) {
      Logger.log(`[DEBUG] Getting meetings for: ${studentName}`);
    }

    const ss = openSpreadsheetByUrl(studentUrl);
    if (!ss) {
      return [];
    }

    const meetingsSheet = ss.getSheetByName("Meetings");
    if (!meetingsSheet) {
      if (CONFIG.debugMode) {
        Logger.log(`[DEBUG] No Meetings sheet for ${studentName}`);
      }
      return [];
    }

    const lastRow = meetingsSheet.getLastRow();
    if (lastRow < 3) {
      return [];
    }

    // Read columns C (date), D (time), E (notes) starting from row 3
    const data = meetingsSheet.getRange(3, 3, lastRow - 2, 3).getValues();

    const meetings = [];
    for (let i = 0; i < data.length; i++) {
      const [date, time, notes] = data[i];

      if (date && time && notes) {
        meetings.push({
          row: i + 3,
          date: date,
          time: time,
          notes: String(notes).trim(),
        });
      }
    }

    return meetings;
  } catch (error) {
    Logger.log(`[ERROR] Error getting meetings: ${error.toString()}`);
    return [];
  }
}

/**
 * Sends meeting notes email for a specific meeting.
 * Called from HTML sidebar.
 */
function sendMeetingNotesEmail(
  studentName,
  studentUrl,
  rowNumber,
  dateStr,
  timeStr,
  notes
) {
  try {
    if (CONFIG.debugMode) {
      Logger.log(`[DEBUG] Sending email to ${studentName}`);
    }

    const studentEmail = getStudentEmailFromSpreadsheet(studentUrl);

    if (!studentEmail) {
      throw new Error(`No email found for ${studentName}`);
    }

    const subject = `Meeting Notes - ${dateStr}`;
    const body = `
Hi ${studentName},

Here are your meeting notes:

Date: ${dateStr}
Time: ${timeStr}

Notes:
${notes}

If you have any questions or need to reschedule, please don't hesitate to reach out.

Best regards,
Summit CRM Team
    `.trim();

    sendEmail(studentEmail, subject, body);

    Logger.log(`[SUCCESS] Email sent to ${studentName}`);
    return true;
  } catch (error) {
    Logger.log(`[ERROR] Error sending email: ${error.toString()}`);
    throw error;
  }
}

/**
 * Helper: Sends an email.
 */
function sendEmail(to, subject, body) {
  try {
    GmailApp.sendEmail(to, subject, body);
  } catch (err) {
    throw new Error("Failed to send email: " + err.message);
  }
}

/**
 * Helper: Gets student email from their spreadsheet.
 */
function getStudentEmailFromSpreadsheet(studentUrl) {
  try {
    const ss = openSpreadsheetByUrl(studentUrl);
    if (!ss) return null;

    const sheet = ss.getSheets()[0];
    const email = sheet.getRange("B2").getValue();

    return email ? String(email).trim() : null;
  } catch (error) {
    Logger.log(`[ERROR] Error getting email: ${error.toString()}`);
    return null;
  }
}
