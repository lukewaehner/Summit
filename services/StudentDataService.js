/**
 * Service for managing student data across spreadsheets.
 * Provides methods for fetching and updating student information and their meetings.
 * @namespace StudentDataService
 */

const StudentDataService = {
  /**
   * Fetches all student data (name, URL, and email) from the Student Data sheet.
   * This reads from the broadcast spreadsheet's Student Data tab.
   *
   * @returns {Array<{name: string, url: string, email: string}>} Array of student objects with name, spreadsheet URL, and email
   * @throws {Error} If broadcast spreadsheet or Student Data sheet cannot be opened
   *
   * @example
   * const students = StudentDataService.getAllStudents();
   * // Returns: [{ name: "John Doe", url: "https://docs.google.com/...", email: "john@example.com" }, ...]
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

    // Read name (A), URL (B), and email (C) from Student Data sheet
    const studentRows = studentDataSheet
      .getRange(2, 1, lastRow - 1, 3) // A2:C(lastRow)
      .getValues();

    return studentRows
      .map(([name, url, email]) => ({
        name: String(name || "").trim(),
        url: String(url || "").trim(),
        email: String(email || "").trim(),
      }))
      .filter((student) => student.name && student.url);
  },

  /**
   * Alias for getAllStudents() to maintain backward compatibility.
   * Used by UI components that call getStudentData().
   *
   * @returns {Array<{name: string, url: string, email: string}>} Array of student objects with email
   * @see {@link getAllStudents}
   */
  getStudentData() {
    return this.getAllStudents();
  },

  /**
   * Fetches all meetings for a specific student from their individual spreadsheet.
   * Reads from the "Meetings" sheet, columns C:E (date, time, notes), starting from row 3.
   * Formats dates and times into human-readable strings before returning.
   *
   * @param {string} url - The full URL to the student's spreadsheet
   * @returns {Array<{date: string, time: string, datetime: string, notes: string}>} Array of formatted meeting objects
   * @throws {Error} If the spreadsheet cannot be opened or Meetings sheet doesn't exist
   *
   * @example
   * const meetings = StudentDataService.getStudentMeetings("https://docs.google.com/...");
   * // Returns: [{ date: "Nov 24, 2025", time: "9:00 AM", datetime: "Nov 24, 2025 (9:00 AM)", notes: "..." }, ...]
   */
  getStudentMeetings(url) {
    // Open the student's individual spreadsheet using the provided URL
    const studentSheet = spreadsheetHelperFunctions
      .openSpreadsheetWithUrl(url)
      .getSheetByName("Meetings");

    const lastRow = studentSheet.getLastRow();
    // Early exit if no data (header only or empty sheet)
    if (lastRow < 2) return [];

    // Read columns C, D, E (date, time, notes) starting from row 3
    // Note: Row 2 might be headers, row 3 is first data row
    const values = studentSheet.getRange(3, 3, lastRow - 2, 3).getValues();

    // Month names for formatting
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    // Filter out empty rows and format dates/times into strings
    return values
      .filter(([date, time, notes]) => date && time && notes)
      .map(([date, time, notes]) => {
        // Format date as "Nov 24, 2025"
        let formattedDate = "";
        if (date instanceof Date) {
          const mon = months[date.getMonth()];
          const day = date.getDate();
          const year = date.getFullYear();
          formattedDate = `${mon} ${day}, ${year}`;
        } else {
          formattedDate = String(date).trim();
        }

        // Format time as "9:00 AM"
        let formattedTime = "";
        if (time instanceof Date) {
          // Use hours and subtract 1 to correct timezone offset
          // Google Sheets stores times with timezone that needs adjustment
          let hours = time.getHours() - 1;
          let minutes = time.getMinutes();

          // Handle negative hours (wrap to previous day)
          if (hours < 0) {
            hours = 23;
          }

          const ampm = hours >= 12 ? "PM" : "AM";
          hours = hours % 12;
          hours = hours ? hours : 12; // Convert 0 to 12
          const minutesStr = minutes < 10 ? "0" + minutes : String(minutes);
          formattedTime = `${hours}:${minutesStr} ${ampm}`;
        } else {
          formattedTime = String(time).trim();
        }

        // Combine into datetime string
        const datetime = `${formattedDate} (${formattedTime})`;

        return {
          date: formattedDate,
          time: formattedTime,
          datetime: datetime,
          notes: String(notes).trim(),
        };
      });
  },

  /**
   * Updates the Student Data sheet by consolidating data from advisor sheets.
   * Extracts URLs (row 2) and names (row 3) from Maggie and Jackie sheets,
   * fetches email addresses from each student's 'Home Page' sheet (cell F5),
   * then writes them to the Student Data sheet for centralized access.
   *
   * This function:
   * 1. Reads URLs and names from advisor sheets (Maggie's Data, Jackie's Data)
   * 2. For each student URL, opens their spreadsheet and reads email from Home Page!F5
   * 3. Clears existing data in Student Data sheet
   * 4. Writes consolidated name/URL/email triplets
   *
   * @throws {Error} If broadcast spreadsheet or required sheets cannot be accessed
   *
   * @example
   * StudentDataService.updateStudentDataSheet();
   * // Student Data sheet now contains all students with emails from both advisors
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

    /** @type {Array<[string, string, string, string]>} Array of [name, url, email, advisor] quad to write */
    const rowsToWrite = [];

    // Iterate through each advisor's sheet to extract student data
    for (const sheet of studentMasterSheets) {
      if (!sheet) {
        continue; // Skip if advisor sheet doesn't exist
      }

      const lastCol = sheet.getLastColumn();
      if (lastCol < 2) {
        continue; // No data in columns beyond A
      }

      // Calculate number of student columns (starting from column B)
      const numCols = lastCol - 1;

      // Read 2 rows: row 2 contains URLs, row 3 contains student names
      // Starting from column B (column 2) through the last used column
      const values = sheet.getRange(2, 2, 2, numCols).getValues();
      const urlsRow = values[0]; // Row 2: Student spreadsheet URLs
      const namesRow = values[1]; // Row 3: Student names

      // Process each column (each student)
      for (let col = 0; col < numCols; col++) {
        const studentUrl = urlsRow[col];
        const studentName = namesRow[col];

        // Skip columns with no URL (empty student slot)
        if (!studentUrl) continue;

        // Fetch email from student's individual spreadsheet (Home Page, cell F5)
        let studentEmail = "";
        try {
          const studentSs =
            spreadsheetHelperFunctions.openSpreadsheetWithUrl(studentUrl);
          const homePage = studentSs.getSheetByName("Home Page");

          if (homePage) {
            // Read email from cell F5
            const emailCell = homePage.getRange("F5").getValue();
            studentEmail = String(emailCell || "").trim();

            if (CONFIG.debugMode) {
              Logger.log(`Fetched email for ${studentName}: ${studentEmail}`);
            }
          } else {
            Logger.log(
              `Warning: 'Home Page' sheet not found for ${studentName}`
            );
          }
        } catch (error) {
          Logger.log(
            `Error fetching email for ${studentName}: ${error.toString()}`
          );
          // Continue with empty email rather than failing entire sync
        }

        // Render jackie / maggie
        const advisorTag = sheet === maggieSheet ? "Maggie" : "Jackie";

        // Add [name, url, email] triplet to write list
        rowsToWrite.push([
          String(studentName || ""),
          String(studentUrl || ""),
          studentEmail,
          advisorTag
        ]);
      }
    }

    if (!dataSheet) {
      throw new Error("Student Data sheet not found");
    }

    // Clear existing data from row 2 downward in columns A:C (name, URL, email)
    // This ensures we start with a clean slate
    const existingLastRow = dataSheet.getLastRow();
    if (existingLastRow > 1) {
      dataSheet.getRange(2, 1, existingLastRow - 1, 4).clearContent();
    }

    // Early exit if no students were found
    if (rowsToWrite.length === 0) {
      return;
    }

    // Write consolidated student data: Column A = name, Column B = URL, Column C = email
    // Starting at row 2 (row 1 is headers)
    dataSheet.getRange(2, 1, rowsToWrite.length, 4).setValues(rowsToWrite);

    if (CONFIG.debugMode) {
      Logger.log(
        `Updated Student Data sheet with ${rowsToWrite.length} students including emails`
      );
    }
  },
};
