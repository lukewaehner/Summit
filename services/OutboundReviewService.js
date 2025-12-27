/**
 * Service for managing outbound review notifications (Advisor → Student).
 * Two-phase architecture:
 * 1. collectOutboundReviews() - Scans all student sheets for "Reviewed:" status, writes to OutboundQueue (slow, runs hourly)
 * 2. processOutboundReviews() - Reads queue, sends individual emails to students (fast, runs every 10 min)
 * @namespace OutboundReviewService
 */

const OutboundReviewService = {
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
   * Column indices in OutboundQueue sheet (0-based after header)
   * Expected columns: A=Timestamp, B=StudentName, C=TaskTitle, D=FeedbackText, E=DocumentLink, F=Status, G=NotifiedAt
   */
  COLUMNS: {
    TIMESTAMP: 0,
    STUDENT_NAME: 1,
    TASK_TITLE: 2,
    FEEDBACK_TEXT: 3,
    DOCUMENT_LINK: 4,
    STATUS: 5,
    NOTIFIED_AT: 6,
  },

  /**
   * Maximum execution time buffer (4 minutes 40 seconds)
   * @private
   */
  _MAX_EXECUTION_TIME: 280000,

  /**
   * Prefix that indicates a reviewed status (case-insensitive)
   * @private
   */
  _REVIEWED_PREFIX: "reviewed:",

  /**
   * Configuration for where to find review status in student sheets
   * Reuses the same sheet configurations as inbound reviews
   */
  STUDENT_SHEET_CONFIGS: [
    {
      sheetName: "Tasks", // Sheet tab with tasks
      startRow: 3, // First data row (C3 onwards)
      statusColumn: 3, // Column C = status (A=1, B=2, C=3)
      titleColumn: 4, // Column D = task title/description
      linkColumn: 8, // Column H = document link
      hasLinks: true, // This sheet has document links
    },
    {
      sheetName: "ApplicationTracker", // Application tracking sheet
      startRow: 4, // First data row (E4 onwards)
      statusColumn: 5, // Column E = status (A=1, B=2, C=3, D=4, E=5)
      titleColumn: 4, // Column D = application title/description
      linkColumn: null, // No links in this sheet
      hasLinks: false, // No document links
    },
  ],

  /**
   * Collects outbound reviews from all student spreadsheets and writes to OutboundQueue.
   * This is Phase 1: Data Collection (slow, runs less frequently - e.g., hourly)
   *
   * **Strategy:**
   * - Opens each student spreadsheet sequentially
   * - Checks status columns for "Reviewed:" prefix
   * - Extracts feedback text after "Reviewed:"
   * - Writes new reviews to OutboundQueue sheet
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
   * // Function: collectOutboundReviews
   * // Event: Time-driven, Hour timer, Every hour
   */
  collectOutboundReviews(options) {
    const startTime = Date.now();
    const opts = options || { batchSize: 50, resetState: false };
    const batchSize = typeof opts.batchSize === "number" ? opts.batchSize : 50;
    const resetState =
      typeof opts.resetState === "boolean" ? opts.resetState : false;

    const results = {
      scanned: 0,
      newReviews: 0,
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
        : parseInt(
            scriptProps.getProperty("lastProcessedStudentIndexOutbound") || "0"
          );

      // Open central sheets
      const broadcastSs = spreadsheetHelperFunctions.openSpreadsheetWithId(
        CONFIG.sheets.broadcastSheet.id
      );
      const outboundQueue = broadcastSs.getSheetByName("OutboundQueue");

      if (!outboundQueue) {
        throw new Error(
          "OutboundQueue sheet not found. Run setupOutboundQueue() first."
        );
      }

      // Get all students
      const allStudents = StudentDataService.getAllStudents();

      if (CONFIG.debugMode) {
        Logger.log(
          `Starting outbound collection from index ${lastProcessedIndex} of ${allStudents.length} students`
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
          scriptProps.setProperty(
            "lastProcessedStudentIndexOutbound",
            i.toString()
          );
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
              `Opened spreadsheet for ${
                student.name
              }: ${studentSs.getName()} (ID: ${studentSs.getId()})`
            );
          }

          // Get existing reviews for duplicate checking (once per student)
          const existingReviews = outboundQueue
            .getRange(2, 1, Math.max(outboundQueue.getLastRow() - 1, 1), 7)
            .getValues();

          // Loop through all configured sheets (Tasks, ApplicationTracker, etc.)
          for (const sheetConfig of this.STUDENT_SHEET_CONFIGS) {
            if (CONFIG.debugMode) {
              Logger.log(
                `Looking for sheet: "${
                  sheetConfig.sheetName
                }" in ${studentSs.getName()}`
              );
            }
            const targetSheet = studentSs.getSheetByName(sheetConfig.sheetName);

            if (!targetSheet) {
              if (CONFIG.debugMode) {
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
              const linkRange = targetSheet.getRange(
                sheetConfig.startRow,
                sheetConfig.linkColumn,
                numRows,
                1
              );
              linkRichText = linkRange.getRichTextValues();
            }

            // Track stats for this sheet
            let reviewedCount = 0;
            let consecutiveEmptyRows = 0;
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
                      `  Stopping early at row ${
                        sheetConfig.startRow + rowIdx
                      } after ${MAX_CONSECUTIVE_EMPTY} consecutive empty rows`
                    );
                  }
                  break;
                }
                continue;
              } else {
                consecutiveEmptyRows = 0; // Reset counter when we find data
              }

              // Check if status starts with "Reviewed:" (case-insensitive)
              if (
                !status ||
                !status
                  .toString()
                  .trim()
                  .toLowerCase()
                  .startsWith(this._REVIEWED_PREFIX)
              ) {
                continue; // Skip rows that don't start with "Reviewed:"
              }

              reviewedCount++;

              // Skip if no title (empty task)
              if (!title) {
                if (CONFIG.debugMode) {
                  Logger.log(`      Skipping: no title`);
                }
                continue;
              }

              const taskTitle = title.toString().trim();

              // Extract feedback text after "Reviewed:"
              const statusText = status.toString().trim();
              const feedbackText = statusText
                .substring(this._REVIEWED_PREFIX.length)
                .trim();

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

              // Check if this specific review already exists in queue (avoid duplicates)
              const alreadyInQueue = existingReviews.some(
                (row) =>
                  row[this.COLUMNS.STUDENT_NAME] === student.name &&
                  row[this.COLUMNS.TASK_TITLE] === taskTitle &&
                  (row[this.COLUMNS.STATUS] === this.STATUS.PENDING ||
                    row[this.COLUMNS.STATUS] === this.STATUS.NOTIFIED)
              );

              if (alreadyInQueue) {
                if (CONFIG.debugMode) {
                  Logger.log(
                    `${student.name} - "${taskTitle}" (${sheetConfig.sheetName}) already in outbound queue, skipping`
                  );
                }
                continue;
              }

              // Add new review to queue
              const timestamp = new Date();
              const nextRow = outboundQueue.getLastRow() + 1;

              outboundQueue.getRange(nextRow, 1, 1, 7).setValues([
                [
                  timestamp,
                  student.name,
                  taskTitle, // Task Title
                  feedbackText, // Feedback text (stored but not used in email for Option B)
                  taskLink, // Document Link (or empty for ApplicationTracker)
                  this.STATUS.PENDING,
                  "", // notified_at will be filled when processed
                ],
              ]);

              results.newReviews++;

              if (CONFIG.debugMode) {
                Logger.log(
                  `Added outbound review for ${
                    student.name
                  } - "${taskTitle}" (${sheetConfig.sheetName})${
                    taskLink ? " (link: " + taskLink + ")" : ""
                  }`
                );
              }
            }

            // Log summary for this sheet
            if (CONFIG.debugMode) {
              Logger.log(
                `  "${sheetConfig.sheetName}" summary: ${reviewedCount} rows with "Reviewed:" status`
              );
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
        scriptProps.setProperty("lastProcessedStudentIndexOutbound", "0"); // Reset for next full scan
        if (CONFIG.debugMode) {
          Logger.log("Completed full outbound scan of all students");
        }
      } else {
        scriptProps.setProperty(
          "lastProcessedStudentIndexOutbound",
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
          `Outbound collection complete: Scanned ${results.scanned}, New reviews: ${results.newReviews}, Skipped: ${results.skipped}, Time: ${results.executionTime}ms`
        );
      }
    } catch (error) {
      Logger.log("Error in collectOutboundReviews: " + error.toString());
      results.errors.push({
        error: "Fatal error: " + error.message,
      });
    }

    return results;
  },

  /**
   * Processes all pending outbound reviews from the OutboundQueue sheet.
   * This is Phase 2: Notification (fast, runs frequently - e.g., every 10 minutes)
   *
   * **How it works:**
   * 1. Opens ONLY the OutboundQueue sheet (1 API call)
   * 2. Reads all pending reviews (1 range read)
   * 3. Sends individual email to each student
   * 4. Updates status to "notified"
   *
   * **Performance:**
   * - 50 reviews: ~15-25 seconds total
   * - Single spreadsheet operation
   * - Individual emails per student (not batched)
   *
   * @returns {Object} Processing results with counts and timing
   *
   * @example
   * // Set up time-based trigger:
   * // Apps Script Editor → Triggers → Add Trigger
   * // Function: processOutboundReviews
   * // Event: Time-driven, Minutes timer, Every 10 minutes
   */
  processOutboundReviews() {
    const startTime = Date.now();
    const results = {
      processed: 0,
      notified: 0,
      errors: [],
      executionTime: 0,
    };

    try {
      // Step 1: Open OutboundQueue sheet (single operation)
      const broadcastSs = spreadsheetHelperFunctions.openSpreadsheetWithId(
        CONFIG.sheets.broadcastSheet.id
      );
      const outboundQueue = broadcastSs.getSheetByName("OutboundQueue");

      if (!outboundQueue) {
        throw new Error(
          "OutboundQueue sheet not found. Please create it in the Broadcast Sheet."
        );
      }

      const lastRow = outboundQueue.getLastRow();
      if (lastRow < 2) {
        // No reviews (only header row or empty)
        if (CONFIG.debugMode) {
          Logger.log("No outbound reviews in queue");
        }
        return results;
      }

      // Step 2: Read all rows at once (efficient bulk read)
      const data = outboundQueue.getRange(2, 1, lastRow - 1, 7).getValues();

      // Step 3: Filter pending reviews (in-memory, very fast)
      const pendingReviews = [];
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const status = row[this.COLUMNS.STATUS];

        // Only process rows with "pending" status or empty status
        if (!status || status === this.STATUS.PENDING) {
          const studentName = row[this.COLUMNS.STUDENT_NAME];

          if (!studentName) continue; // Skip empty rows

          // Look up student email from StudentData or Home Page
          const studentEmail = this._getStudentEmail(studentName);

          if (!studentEmail) {
            if (CONFIG.debugMode) {
              Logger.log(`Warning: No email found for ${studentName}`);
            }
            continue;
          }

          pendingReviews.push({
            rowIndex: i,
            actualRow: i + 2, // Adjust for header and 0-based index
            timestamp: row[this.COLUMNS.TIMESTAMP],
            studentName: studentName,
            taskTitle: row[this.COLUMNS.TASK_TITLE] || "General",
            feedbackText: row[this.COLUMNS.FEEDBACK_TEXT] || "",
            documentLink: row[this.COLUMNS.DOCUMENT_LINK] || "",
            studentEmail: studentEmail,
          });
        }
      }

      if (CONFIG.debugMode) {
        Logger.log(`Found ${pendingReviews.length} pending outbound reviews`);
      }

      if (pendingReviews.length === 0) {
        return results;
      }

      // Step 4: Send notifications and update status
      const now = new Date();
      const rowsToUpdate = [];

      for (const review of pendingReviews) {
        // Check execution time before processing each review
        if (Date.now() - startTime > this._MAX_EXECUTION_TIME) {
          Logger.log("Approaching execution time limit, stopping early");
          break;
        }

        const emailResult = this._sendStudentNotification(review);

        if (emailResult.success) {
          // Mark this review as notified
          rowsToUpdate.push({
            row: review.actualRow,
            status: this.STATUS.NOTIFIED,
            notifiedAt: now,
          });
          results.notified++;
        } else {
          results.errors.push({
            student: review.studentName,
            error: emailResult.message,
          });
        }

        results.processed++;
      }

      // Step 5: Batch update status (write back to sheet)
      if (rowsToUpdate.length > 0) {
        for (const update of rowsToUpdate) {
          outboundQueue
            .getRange(update.row, 6, 1, 2)
            .setValues([[update.status, update.notifiedAt]]);
        }
      }

      results.executionTime = Date.now() - startTime;

      if (CONFIG.debugMode) {
        Logger.log(
          `Processed ${results.processed} reviews, notified ${results.notified} students in ${results.executionTime}ms`
        );
      }
    } catch (error) {
      Logger.log("Error processing outbound reviews: " + error.toString());
      results.errors.push({
        error: "Fatal error: " + error.message,
      });
    }

    return results;
  },

  /**
   * Gets the email address for a given student.
   * First tries StudentData sheet (column C), then fallback to Home Page F5.
   * @private
   * @param {string} studentName - Name of the student
   * @returns {string|null} Email address or null if not found
   */
  _getStudentEmail(studentName) {
    try {
      const students = StudentDataService.getAllStudents();
      const student = students.find((s) => s.name === studentName);

      // First try email from StudentData (column C)
      if (student && student.email && student.email.trim() !== "") {
        return student.email.trim();
      }

      // Fallback: Try to get email from student's Home Page F5
      if (student && student.url) {
        try {
          const studentSs = spreadsheetHelperFunctions.openSpreadsheetWithUrl(
            student.url
          );
          const homePage = studentSs.getSheetByName("Home Page");

          if (homePage) {
            const emailCell = homePage.getRange("F5").getValue();
            const email = String(emailCell || "").trim();
            if (email !== "") {
              if (CONFIG.debugMode) {
                Logger.log(
                  `Retrieved email from Home Page F5 for ${studentName}: ${email}`
                );
              }
              return email;
            }
          }
        } catch (error) {
          Logger.log(
            `Error fetching email from Home Page for ${studentName}: ${error.toString()}`
          );
        }
      }

      return null;
    } catch (error) {
      Logger.log(`Error looking up email for ${studentName}: ${error}`);
      return null;
    }
  },

  /**
   * Sends a notification email to a student about their reviewed work.
   * Uses HTML template for professional formatting.
   * @private
   * @param {Object} review - Review object with student info
   * @returns {Object} Result object
   */
  _sendStudentNotification(review) {
    try {
      if (!review.studentEmail) {
        return {
          success: false,
          message: `No email found for student: ${review.studentName}`,
        };
      }

      // Create HTML email from template
      const template = HtmlService.createTemplateFromFile(
        "ui/templates/OutboundReviewTemplate"
      );
      template.studentName = review.studentName;
      template.taskTitle = review.taskTitle;
      template.hasLink =
        review.documentLink && review.documentLink.trim() !== "";
      template.documentLink = review.documentLink || "";

      // Evaluate template to get HTML content
      const htmlBody = template.evaluate().getContent();

      const subject = `Your Submission Has Been Reviewed - Summit`;

      MailApp.sendEmail({
        // to: review.studentEmail,
        to: "luke.waehner@gmail.com", // TEST MODE - change to review.studentEmail for production
        subject: subject,
        htmlBody: htmlBody,
        name: "Summit CRM",
      });

      if (CONFIG.debugMode) {
        Logger.log(
          `Sent review notification to ${review.studentName} (${review.studentEmail}) for "${review.taskTitle}"`
        );
      }

      return {
        success: true,
        message: `Notified ${review.studentName}`,
      };
    } catch (error) {
      Logger.log(
        `Error sending notification to ${review.studentName}: ${error}`
      );
      return {
        success: false,
        message: error.message,
      };
    }
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
   * Creates the OutboundQueue sheet with proper headers.
   * Run this once during setup.
   *
   * @returns {Object} Result object
   *
   * @example
   * OutboundReviewService.setupOutboundQueue();
   */
  setupOutboundQueue() {
    try {
      const broadcastSs = spreadsheetHelperFunctions.openSpreadsheetWithId(
        CONFIG.sheets.broadcastSheet.id
      );

      // Check if OutboundQueue already exists
      let outboundQueue = broadcastSs.getSheetByName("OutboundQueue");

      if (outboundQueue) {
        return {
          success: true,
          message: "OutboundQueue sheet already exists. No setup needed.",
        };
      }

      // Create new sheet
      outboundQueue = broadcastSs.insertSheet("OutboundQueue");

      // Set up headers
      const headers = [
        "Timestamp",
        "Student Name",
        "Task Title",
        "Feedback Text",
        "Document Link",
        "Status",
        "Notified At",
      ];

      outboundQueue.getRange(1, 1, 1, headers.length).setValues([headers]);

      // Format header row
      const headerRange = outboundQueue.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#34a853"); // Green color to distinguish from ReviewQueue
      headerRange.setFontColor("#ffffff");

      // Set column widths
      outboundQueue.setColumnWidth(1, 150); // Timestamp
      outboundQueue.setColumnWidth(2, 150); // Student Name
      outboundQueue.setColumnWidth(3, 120); // Task Title
      outboundQueue.setColumnWidth(4, 300); // Feedback Text
      outboundQueue.setColumnWidth(5, 300); // Document Link
      outboundQueue.setColumnWidth(6, 100); // Status
      outboundQueue.setColumnWidth(7, 150); // Notified At

      // Freeze header row
      outboundQueue.setFrozenRows(1);

      Logger.log("OutboundQueue sheet created successfully");

      return {
        success: true,
        message: "OutboundQueue sheet created successfully.",
      };
    } catch (error) {
      Logger.log("Error setting up OutboundQueue: " + error.toString());
      return {
        success: false,
        message: error.message,
      };
    }
  },
};
