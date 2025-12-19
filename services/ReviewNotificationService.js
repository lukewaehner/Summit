/**
 * Service for managing review request notifications via a centralized queue.
 * Two-phase architecture:
 * 1. collectReviewRequests() - Scans all student sheets, writes to central queue (slow, runs hourly)
 * 2. processReviewRequests() - Reads queue, sends emails (fast, runs every 10 min)
 * @namespace ReviewNotificationService
 */

const ReviewNotificationService = {
  /**
   * Review status constants
   * @enum {string}
   */
  STATUS: {
    PENDING: "pending",
    NOTIFIED: "notified",
    COMPLETED: "completed",
  },

  /**
   * Column indices in ReviewQueue sheet (0-based after header)
   * Expected columns: A=Timestamp, B=StudentName, C=ReviewType, D=Notes, E=Status, F=NotifiedAt
   */
  COLUMNS: {
    TIMESTAMP: 0,
    STUDENT_NAME: 1,
    REVIEW_TYPE: 2,
    NOTES: 3,
    STATUS: 4,
    NOTIFIED_AT: 5,
  },

  /**
   * Maximum execution time buffer (4 minutes 40 seconds)
   * @private
   */
  _MAX_EXECUTION_TIME: 280000,

  GLOBAL_LINKS: {
    SUPPLEMENTAL_ESSAY_DOC: "C8",
  },

  /**
   * Configuration for where to find review status in student sheets
   * Students can have multiple tasks across multiple sheets
   * Each config defines one sheet to scan
   */
  STUDENT_SHEET_CONFIGS: [
    {
      sheetName: "Tasks", // Sheet tab with tasks
      startRow: 3, // First data row (C3 onwards)
      statusColumn: 3, // Column C = status (A=1, B=2, C=3)
      titleColumn: 4, // Column D = task title/description
      linkColumn: 8, // Column H = document link
      needsReviewValue: "needs review", // Lowercase for case-insensitive comparison
      hasLinks: true, // This sheet has document links
    },
    // This is for total application review
    {
      sheetName: "ApplicationTracker", // Application tracking sheet
      startRow: 4, // First data row (E4 onwards)
      statusColumn: 5, // Column E = status (A=1, B=2, C=3, D=4, E=5)
      titleColumn: 4, // Column D = application title/description
      linkColumn: null, // No links in this sheet
      needsReviewValue: "needs review", // Lowercase for case-insensitive comparison
      hasLinks: false, // No document links
    },
    // This is for supplemental essay review
    {
      sheetName: "ApplicationTracker", // Application tracking sheet
      startRow: 14, // Only focus on actual schools 
      statusColumn: 38, // Column AL = Supplemental (A=1, B=2, C=3, D=4, E=5)
      titleColumn: 4, // Column D = application title/description
      linkColumn: -1, // Special code to grab globals outside -1 = Home page, Supplemental Tracker 
      needsReviewValue: "needs review", // Lowercase for case-insensitive comparison
      hasLinks: true, // No document links
    }
  ],

  /**
   * Collects review requests from all student spreadsheets and writes to ReviewQueue.
   * This is Phase 1: Data Collection (slow, runs less frequently - e.g., hourly)
   *
   * **Strategy:**
   * - Opens each student spreadsheet sequentially
   * - Checks specific cell for "Needs Review" status
   * - Writes new requests to ReviewQueue sheet
   * - Uses chunked processing to handle timeouts gracefully
   *
   * **Performance:**
   * - 50 students: ~60-150 seconds (1-3s per sheet)
   * - 100 students: ~120-300 seconds (2-5 minutes)
   * - Uses state persistence to resume if timeout occurs
   *
   * @param {Object} options - Optional configuration
   * @param {number} options.batchSize - Number of students to process per run (default: 50)
   * @param {boolean} options.resetState - Force restart from beginning (default: false)
   * @returns {Object} Collection results with counts and timing
   *
   * @example
   * // Set up time-based trigger:
   * // Apps Script Editor → Triggers → Add Trigger
   * // Function: collectReviewRequests
   * // Event: Time-driven, Hour timer, Every hour
   */
  collectReviewRequests(options) {
    const startTime = Date.now();
    const opts = options || { batchSize: 50, resetState: false };
    const batchSize = typeof opts.batchSize === "number" ? opts.batchSize : 50;
    const resetState =
      typeof opts.resetState === "boolean" ? opts.resetState : false;

    const results = {
      scanned: 0,
      newRequests: 0,
      skipped: 0,
      errors: [],
      executionTime: 0,
      completed: false,
    };

    try {
      // Get script properties for state persistence
      const scriptProps = PropertiesService.getScriptProperties();
      let lastProcessedIndex = resetState
        ? 0
        : parseInt(scriptProps.getProperty("lastProcessedStudentIndex") || "0");

      // Open central sheets
      const broadcastSs = spreadsheetHelperFunctions.openSpreadsheetWithId(
        CONFIG.sheets.broadcastSheet.id
      );
      const reviewQueue = broadcastSs.getSheetByName("ReviewQueue");

      if (!reviewQueue) {
        throw new Error(
          "ReviewQueue sheet not found. Run setupReviewQueue() first."
        );
      }

      // Get all students
      const allStudents = StudentDataService.getAllStudents();

      if (CONFIG.debugMode) {
        Logger.log(
          `Starting collection from index ${lastProcessedIndex} of ${allStudents.length} students`
        );
      }

      // Determine batch end (don't exceed array bounds)
      const endIndex = Math.min(
        lastProcessedIndex + batchSize,
        allStudents.length
      );

      // Process batch of students
      for (let i = lastProcessedIndex; i < endIndex; i++) {
        // Check execution time before processing each student
        if (Date.now() - startTime > this._MAX_EXECUTION_TIME) {
          Logger.log(
            `Approaching execution time limit. Processed ${results.scanned} students. Will resume next run.`
          );
          scriptProps.setProperty("lastProcessedStudentIndex", i.toString());
          return results;
        }

        const student = allStudents[i];
        results.scanned++;

        try {
          // Open student's spreadsheet once
          const studentSs = spreadsheetHelperFunctions.openSpreadsheetWithUrl(
            student.url
          );

          if (CONFIG.debugMode) {
            Logger.log(
              `Opened spreadsheet for ${student.name
              }: ${studentSs.getName()} (ID: ${studentSs.getId()})`
            );
          }

          // Get existing requests for duplicate checking (once per student)
          const existingRequests = reviewQueue
            .getRange(2, 1, Math.max(reviewQueue.getLastRow() - 1, 1), 6)
            .getValues();

          // Loop through all configured sheets (Tasks, ApplicationTracker, etc.)
          for (const sheetConfig of this.STUDENT_SHEET_CONFIGS) {
            if (CONFIG.debugMode) {
              Logger.log(
                `Looking for sheet: "${sheetConfig.sheetName
                }" in ${studentSs.getName()}`
              );
            }
            const targetSheet = studentSs.getSheetByName(sheetConfig.sheetName);

            if (!targetSheet) {
              if (CONFIG.debugMode) {
                // List all available sheet names for debugging
                const allSheets = studentSs
                  .getSheets()
                  .map((s) => s.getName())
                  .join(", ");
                Logger.log(
                  `Warning: Sheet "${sheetConfig.sheetName}" not found for ${student.name}`
                );
                Logger.log(`Available sheets: ${allSheets}`);
              }
              continue; // Skip this sheet, try next one
            }

            // Read all rows from the sheet
            const lastRow = targetSheet.getLastRow();
            if (lastRow < sheetConfig.startRow) {
              // No data rows in this sheet
              if (CONFIG.debugMode) {
                Logger.log(
                  `  Sheet "${sheetConfig.sheetName}" has no data rows (lastRow: ${lastRow}, startRow: ${sheetConfig.startRow})`
                );
              }
              continue;
            }

            const numRows = lastRow - sheetConfig.startRow + 1;

            if (CONFIG.debugMode) {
              Logger.log(
                `  Processing ${numRows} rows from "${sheetConfig.sheetName}" (rows ${sheetConfig.startRow} to ${lastRow})`
              );
            }

            // Read status column (always needed)
            const statusData = targetSheet
              .getRange(
                sheetConfig.startRow,
                sheetConfig.statusColumn,
                numRows,
                1
              )
              .getValues();

            // Read title column (always needed)
            const titleData = targetSheet
              .getRange(
                sheetConfig.startRow,
                sheetConfig.titleColumn,
                numRows,
                1
              )
              .getValues();

            // Read links if this sheet has them
            let linkRichText = null;
            if (sheetConfig.hasLinks && sheetConfig.linkColumn) {
              let linkRange = null;
              if (sheetConfig.linkColumn === -1) {
                // Go get home page supplemental link
                const homeSheet = studentSs.getSheetByName("Home Page");
                linkRange = homeSheet.getRange(this.GLOBAL_LINKS.SUPPLEMENTAL_ESSAY_DOC); // Fixed for supplemental links
              } else {
                linkRange = targetSheet.getRange(
                  sheetConfig.startRow,
                  sheetConfig.linkColumn,
                  numRows,
                  1
                );
              }
              linkRichText = linkRange.getRichTextValues();
            }

            // Track stats for this sheet
            let needsReviewCount = 0;
            let emptyStatusCount = 0;
            let consecutiveEmptyRows = 0;
            let firstNeedsReviewRow = null;
            const MAX_CONSECUTIVE_EMPTY = 20; // Stop after 20 consecutive empty rows

            // Process each row
            for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
              const status = statusData[rowIdx][0];
              const title = titleData[rowIdx][0];

              // Stop if we hit too many consecutive empty rows (optimization)
              if (!status && !title) {
                consecutiveEmptyRows++;
                if (consecutiveEmptyRows >= MAX_CONSECUTIVE_EMPTY) {
                  if (CONFIG.debugMode) {
                    Logger.log(
                      `  Stopping early at row ${sheetConfig.startRow + rowIdx
                      } after ${MAX_CONSECUTIVE_EMPTY} consecutive empty rows`
                    );
                  }
                  break;
                }
                continue;
              } else {
                consecutiveEmptyRows = 0; // Reset counter when we find data
              }

              // Count rows with "Needs Review" for summary (case-insensitive)
              if (
                status &&
                status.toString().trim().toLowerCase() ===
                sheetConfig.needsReviewValue
              ) {
                needsReviewCount++;
                if (!firstNeedsReviewRow && title) {
                  firstNeedsReviewRow = {
                    row: sheetConfig.startRow + rowIdx,
                    status: status,
                    title: title,
                  };
                }
              }
              if (!status) emptyStatusCount++;

              // Only log first 5 rows to avoid spam
              if (CONFIG.debugMode && rowIdx < 5) {
                Logger.log(
                  `    Row ${sheetConfig.startRow + rowIdx
                  }: Status="${status}", Title="${title}"`
                );
              }

              // Check if this row needs review (case-insensitive)
              if (
                !status ||
                status.toString().trim().toLowerCase() !==
                sheetConfig.needsReviewValue
              ) {
                if (CONFIG.debugMode && status && rowIdx < 5) {
                  Logger.log(
                    `      Skipping: status="${status
                      .toString()
                      .trim()}" doesn't match "${sheetConfig.needsReviewValue
                    }" (case-insensitive)`
                  );
                }
                continue; // Skip rows that don't need review
              }

              // Skip if no title (empty task)
              if (!title) {
                if (CONFIG.debugMode) {
                  Logger.log(`      Skipping: no title`);
                }
                continue;
              }

              const taskTitle = title.toString().trim();

              // Extract link if this sheet has links
              let taskLink = "";
              if (sheetConfig.hasLinks && linkRichText) {
                const richText = linkRichText[rowIdx][0];
                if (richText && richText.getLinkUrl()) {
                  taskLink = richText.getLinkUrl();
                } else if (richText && richText.getText()) {
                  taskLink = richText.getText().trim();
                }
              }

              // Check if this specific task already exists in queue (avoid duplicates)
              const alreadyInQueue = existingRequests.some(
                (row) =>
                  row[this.COLUMNS.STUDENT_NAME] === student.name &&
                  row[this.COLUMNS.REVIEW_TYPE] === taskTitle &&
                  (row[this.COLUMNS.STATUS] === this.STATUS.PENDING ||
                    row[this.COLUMNS.STATUS] === this.STATUS.NOTIFIED)
              );

              if (alreadyInQueue) {
                if (CONFIG.debugMode) {
                  Logger.log(
                    `${student.name} - "${taskTitle}" (${sheetConfig.sheetName}) already in queue, skipping`
                  );
                }
                continue;
              }

              // Add new request to queue
              const timestamp = new Date();
              const nextRow = reviewQueue.getLastRow() + 1;

              reviewQueue.getRange(nextRow, 1, 1, 6).setValues([
                [
                  timestamp,
                  student.name,
                  taskTitle, // Review Type = Task Title
                  taskLink, // Notes = Document Link (or empty for ApplicationTracker)
                  this.STATUS.PENDING,
                  "", // notified_at will be filled when processed
                ],
              ]);

              results.newRequests++;

              if (CONFIG.debugMode) {
                Logger.log(
                  `Added review request for ${student.name} - "${taskTitle}" (${sheetConfig.sheetName
                  })${taskLink ? " (link: " + taskLink + ")" : ""}`
                );
              }
            }

            // Log summary for this sheet
            if (CONFIG.debugMode) {
              Logger.log(
                `  "${sheetConfig.sheetName}" summary: ${needsReviewCount} rows with "Needs Review", ${emptyStatusCount} empty statuses`
              );
              if (firstNeedsReviewRow) {
                Logger.log(
                  `    First "Needs Review" at row ${firstNeedsReviewRow.row}: "${firstNeedsReviewRow.title}"`
                );
              } else if (needsReviewCount > 0) {
                Logger.log(`    All "Needs Review" rows are missing titles`);
              }
            }
          }
        } catch (error) {
          Logger.log(
            `Error processing student ${student.name}: ${error.toString()}`
          );
          results.errors.push({
            student: student.name,
            error: error.message,
          });
          results.skipped++;
        }
      }

      // Check if we completed all students
      if (endIndex >= allStudents.length) {
        results.completed = true;
        scriptProps.setProperty("lastProcessedStudentIndex", "0"); // Reset for next full scan
        if (CONFIG.debugMode) {
          Logger.log("Completed full scan of all students");
        }
      } else {
        scriptProps.setProperty(
          "lastProcessedStudentIndex",
          endIndex.toString()
        );
        if (CONFIG.debugMode) {
          Logger.log(
            `Batch complete. Will resume from index ${endIndex} on next run`
          );
        }
      }

      results.executionTime = Date.now() - startTime;

      if (CONFIG.debugMode) {
        Logger.log(
          `Collection complete: Scanned ${results.scanned}, New requests: ${results.newRequests}, Skipped: ${results.skipped}, Time: ${results.executionTime}ms`
        );
      }
    } catch (error) {
      Logger.log("Error in collectReviewRequests: " + error.toString());
      results.errors.push({
        error: "Fatal error: " + error.message,
      });
    }

    return results;
  },

  /**
   * Processes all pending review requests from the ReviewQueue sheet.
   * This is Phase 2: Notification (fast, runs frequently - e.g., every 10 minutes)
   *
   * **How it works:**
   * 1. Opens ONLY the ReviewQueue sheet (1 API call)
   * 2. Reads all pending requests (1 range read)
   * 3. Groups by advisor (in-memory, fast)
   * 4. Sends one email per advisor with list of students
   * 5. Updates status to "notified"
   *
   * **Performance:**
   * - 100 students: ~5-15 seconds total
   * - Single spreadsheet operation
   * - No individual student sheet access needed
   *
   * @returns {Object} Processing results with counts and timing
   *
   * @example
   * // Set up time-based trigger:
   * // Apps Script Editor → Triggers → Add Trigger
   * // Function: processReviewRequests
   * // Event: Time-driven, Minutes timer, Every 10 minutes
   */
  processReviewRequests() {
    const startTime = Date.now();
    const results = {
      processed: 0,
      notified: 0,
      errors: [],
      executionTime: 0,
    };

    try {
      // Step 1: Open ReviewQueue sheet (single operation)
      const broadcastSs = spreadsheetHelperFunctions.openSpreadsheetWithId(
        CONFIG.sheets.broadcastSheet.id
      );
      const reviewQueue = broadcastSs.getSheetByName("ReviewQueue");

      if (!reviewQueue) {
        throw new Error(
          "ReviewQueue sheet not found. Please create it in the Broadcast Sheet."
        );
      }

      const lastRow = reviewQueue.getLastRow();
      if (lastRow < 2) {
        // No requests (only header row or empty)
        if (CONFIG.debugMode) {
          Logger.log("No review requests in queue");
        }
        return results;
      }

      // Step 2: Read all rows at once (efficient bulk read)
      const data = reviewQueue.getRange(2, 1, lastRow - 1, 6).getValues();

      // Step 3: Filter pending requests (in-memory, very fast)
      const pendingRequests = [];
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const status = row[this.COLUMNS.STATUS];

        // Only process rows with "pending" status or empty status
        if (!status || status === this.STATUS.PENDING) {
          const studentName = row[this.COLUMNS.STUDENT_NAME];

          if (!studentName) continue; // Skip empty rows

          // Look up advisor from StudentData sheet
          const advisor = this._getAdvisorForStudent(studentName);

          if (!advisor) {
            if (CONFIG.debugMode) {
              Logger.log(`Warning: No advisor found for ${studentName}`);
            }
            continue;
          }

          pendingRequests.push({
            rowIndex: i,
            actualRow: i + 2, // Adjust for header and 0-based index
            timestamp: row[this.COLUMNS.TIMESTAMP],
            studentName: studentName,
            reviewType: row[this.COLUMNS.REVIEW_TYPE] || "General",
            notes: row[this.COLUMNS.NOTES] || "",
            advisor: advisor,
          });
        }
      }

      if (CONFIG.debugMode) {
        Logger.log(`Found ${pendingRequests.length} pending review requests`);
      }

      if (pendingRequests.length === 0) {
        return results;
      }

      // Step 4: Group by advisor (minimize emails)
      const byAdvisor = this._groupByAdvisor(pendingRequests);

      // Step 5: Send notifications and update status
      const now = new Date();
      const rowsToUpdate = [];

      for (const advisor in byAdvisor) {
        if (!Object.prototype.hasOwnProperty.call(byAdvisor, advisor)) continue;
        const requests = byAdvisor[advisor];

        // Check execution time before processing each advisor
        if (Date.now() - startTime > this._MAX_EXECUTION_TIME) {
          Logger.log("Approaching execution time limit, stopping early");
          break;
        }

        const emailResult = this._sendAdvisorNotification(advisor, requests);

        if (emailResult.success) {
          // Mark these requests as notified
          for (const request of requests) {
            rowsToUpdate.push({
              row: request.actualRow,
              status: this.STATUS.NOTIFIED,
              notifiedAt: now,
            });
          }
          results.notified += requests.length;
        } else {
          results.errors.push({
            advisor: advisor,
            error: emailResult.message,
          });
        }

        results.processed += requests.length;
      }

      // Step 6: Batch update status (write back to sheet)
      if (rowsToUpdate.length > 0) {
        for (const update of rowsToUpdate) {
          reviewQueue
            .getRange(update.row, 5, 1, 2)
            .setValues([[update.status, update.notifiedAt]]);
        }
      }

      results.executionTime = Date.now() - startTime;

      if (CONFIG.debugMode) {
        Logger.log(
          `Processed ${results.processed} requests, notified advisors about ${results.notified} students in ${results.executionTime}ms`
        );
      }
    } catch (error) {
      Logger.log("Error processing review requests: " + error.toString());
      results.errors.push({
        error: "Fatal error: " + error.message,
      });
    }

    return results;
  },

  /**
   * Gets the advisor name for a given student by looking up StudentData sheet.
   * @private
   * @param {string} studentName - Name of the student
   * @returns {string|null} Advisor name or null if not found
   */
  _getAdvisorForStudent(studentName) {
    try {
      const students = StudentDataService.getAllStudents();
      const student = students.find((s) => s.name === studentName);
      return student ? student.advisor : null;
    } catch (error) {
      Logger.log(`Error looking up advisor for ${studentName}: ${error}`);
      return null;
    }
  },

  /**
   * Groups review requests by advisor.
   * @private
   * @param {Array<Object>} requests - Array of request objects
   * @returns {Object} Requests grouped by advisor name
   */
  _groupByAdvisor(requests) {
    const grouped = {};

    for (const request of requests) {
      const advisor = request.advisor || "Unknown";
      if (!grouped[advisor]) {
        grouped[advisor] = [];
      }
      grouped[advisor].push(request);
    }

    return grouped;
  },

  /**
   * Sends a notification email to an advisor about pending review requests.
   * @private
   * @param {string} advisorName - Name of the advisor
   * @param {Array<Object>} requests - Review requests for this advisor
   * @returns {Object} Result object
   */
  _sendAdvisorNotification(advisorName, requests) {
    try {
      const advisorEmail = this._getAdvisorEmail(advisorName);

      if (!advisorEmail) {
        return {
          success: false,
          message: `No email found for advisor: ${advisorName}`,
        };
      }

      // Build email content with grouped requests
      const requestList = requests
        .map((r) => {
          const timestamp = this._formatTimestamp(r.timestamp);
          // Only show link line if there's actually a link
          const link =
            r.notes && r.notes.trim() !== "" ? `\n  Link: ${r.notes}` : "";
          return `• ${r.studentName} - ${r.reviewType}\n  Submitted: ${timestamp}${link}`;
        })
        .join("\n\n");

      const subject = `${requests.length} Task${requests.length > 1 ? "s" : ""
        } Need${requests.length === 1 ? "s" : ""} Review - Summit CRM`;

      const body = `Hi ${advisorName},

The following task${requests.length > 1 ? "s need" : " needs"} review:

${requestList}

You can access each student's spreadsheet from the Student Data sheet.

—
Summit CRM Automated Notification`;

      MailApp.sendEmail({
        // to: advisorEmail,
        to: "luke.waehner@gmail.com",
        subject: subject,
        body: body,
        name: "Summit CRM",
      });

      if (CONFIG.debugMode) {
        Logger.log(
          `Sent notification to ${advisorName} (${advisorEmail}) for ${requests.length} review requests`
        );
      }

      return {
        success: true,
        message: `Notified ${advisorName}`,
      };
    } catch (error) {
      Logger.log(`Error sending notification to ${advisorName}: ${error}`);
      return {
        success: false,
        message: error.message,
      };
    }
  },

  /**
   * Gets advisor email address from name.
   * @private
   */
  _getAdvisorEmail(advisorName) {
    // Map advisor names to email addresses
    const advisorEmails = {
      Maggie: "maggie@summitacademicsupport.com",
      Jackie: "jackie@summitacademicsupport.com",
    };

    return advisorEmails[advisorName] || null;
  },

  /**
   * Formats a timestamp for display in emails.
   * @private
   */
  _formatTimestamp(timestamp) {
    if (!timestamp || !(timestamp instanceof Date)) {
      return "Unknown time";
    }

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

    const month = months[timestamp.getMonth()];
    const day = timestamp.getDate();
    const hours = timestamp.getHours();
    const minutes = timestamp.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes < 10 ? "0" + minutes : minutes;

    return `${month} ${day}, ${displayHours}:${displayMinutes} ${ampm}`;
  },

  /**
   * Marks a review request as completed.
   * Advisors can call this after reviewing a student's work.
   *
   * @param {string} studentName - Name of the student
   * @returns {Object} Result object
   *
   * @example
   * ReviewNotificationService.markAsCompleted("John Doe");
   */
  markAsCompleted(studentName) {
    try {
      const broadcastSs = spreadsheetHelperFunctions.openSpreadsheetWithId(
        CONFIG.sheets.broadcastSheet.id
      );
      const reviewQueue = broadcastSs.getSheetByName("ReviewQueue");

      if (!reviewQueue) {
        throw new Error("ReviewQueue sheet not found");
      }

      const lastRow = reviewQueue.getLastRow();
      if (lastRow < 2) {
        return {
          success: false,
          message: "No review requests found",
        };
      }

      const data = reviewQueue.getRange(2, 1, lastRow - 1, 6).getValues();

      // Find the most recent pending/notified request for this student
      let foundRow = -1;
      for (let i = data.length - 1; i >= 0; i--) {
        // Search backwards (most recent first)
        if (
          data[i][this.COLUMNS.STUDENT_NAME] === studentName &&
          (data[i][this.COLUMNS.STATUS] === this.STATUS.PENDING ||
            data[i][this.COLUMNS.STATUS] === this.STATUS.NOTIFIED)
        ) {
          foundRow = i + 2; // Adjust for header and 0-based
          break;
        }
      }

      if (foundRow === -1) {
        return {
          success: false,
          message: `No pending review found for ${studentName}`,
        };
      }

      // Update status to completed
      reviewQueue.getRange(foundRow, 5).setValue(this.STATUS.COMPLETED);

      if (CONFIG.debugMode) {
        Logger.log(`Marked review as completed for ${studentName}`);
      }

      return {
        success: true,
        message: `Review completed for ${studentName}`,
      };
    } catch (error) {
      Logger.log("Error marking as completed: " + error.toString());
      return {
        success: false,
        message: error.message,
      };
    }
  },

  /**
   * Creates the ReviewQueue sheet with proper headers.
   * Run this once during setup.
   *
   * @returns {Object} Result object
   *
   * @example
   * ReviewNotificationService.setupReviewQueue();
   */
  setupReviewQueue() {
    try {
      const broadcastSs = spreadsheetHelperFunctions.openSpreadsheetWithId(
        CONFIG.sheets.broadcastSheet.id
      );

      // Check if ReviewQueue already exists
      let reviewQueue = broadcastSs.getSheetByName("ReviewQueue");

      if (reviewQueue) {
        return {
          success: true,
          message: "ReviewQueue sheet already exists. No setup needed.",
        };
      }

      // Create new sheet
      reviewQueue = broadcastSs.insertSheet("ReviewQueue");

      // Set up headers
      const headers = [
        "Timestamp",
        "Student Name",
        "Review Type",
        "Notes",
        "Status",
        "Notified At",
      ];

      reviewQueue.getRange(1, 1, 1, headers.length).setValues([headers]);

      // Format header row
      const headerRange = reviewQueue.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#4285f4");
      headerRange.setFontColor("#ffffff");

      // Set column widths
      reviewQueue.setColumnWidth(1, 150); // Timestamp
      reviewQueue.setColumnWidth(2, 150); // Student Name
      reviewQueue.setColumnWidth(3, 120); // Review Type
      reviewQueue.setColumnWidth(4, 300); // Notes
      reviewQueue.setColumnWidth(5, 100); // Status
      reviewQueue.setColumnWidth(6, 150); // Notified At

      // Freeze header row
      reviewQueue.setFrozenRows(1);

      Logger.log("ReviewQueue sheet created successfully");

      return {
        success: true,
        message:
          "ReviewQueue sheet created successfully. Now create the Google Form.",
      };
    } catch (error) {
      Logger.log("Error setting up ReviewQueue: " + error.toString());
      return {
        success: false,
        message: error.message,
      };
    }
  },
};
