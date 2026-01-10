/**
 * Service for validating and renaming worksheet files in student spreadsheets.
 * Two-phase architecture:
 * 1. collectTasksWorksheets() - Scans Tasks sheets for improperly named files, writes to WorksheetQueue (slow, runs hourly)
 * 2. processTasksWorksheets() - Reads queue, copies/renames/moves files (fast, runs every 10 min)
 *
 * Validation Rule: Worksheet filenames must start with the student's last name.
 * If not, the file is copied, renamed with "{LastName} - {OriginalName}", moved to shared drive, and shared with student.
 *
 * @namespace WorksheetValidationService
 */

const WorksheetValidationService = {
  /**
   * Status constants for queue items
   * @enum {string}
   */
  STATUS: {
    PENDING: "pending",
    PROCESSED: "processed",
    ERROR: "error",
    SKIPPED: "skipped",
  },

  /**
   * Column indices in WorksheetQueue sheet (0-based after header)
   * Expected columns: A=Timestamp, B=StudentName, C=StudentEmail, D=LastName, E=OriginalFileId,
   *                   F=OriginalFileName, G=TargetFolderId, H=CellRow, I=StudentSpreadsheetId,
   *                   J=Status, K=ProcessedAt, L=NewFileUrl, M=ErrorMessage
   */
  COLUMNS: {
    TIMESTAMP: 0,
    STUDENT_NAME: 1,
    STUDENT_EMAIL: 2,
    LAST_NAME: 3,
    ORIGINAL_FILE_ID: 4,
    ORIGINAL_FILE_NAME: 5,
    TARGET_FOLDER_ID: 6,
    CELL_ROW: 7,
    STUDENT_SPREADSHEET_ID: 8,
    STATUS: 9,
    PROCESSED_AT: 10,
    NEW_FILE_URL: 11,
    ERROR_MESSAGE: 12,
  },

  /**
   * Maximum execution time buffer (4 minutes 40 seconds)
   * @private
   */
  _MAX_EXECUTION_TIME: 280000,

  /**
   * Configuration for where to find worksheets in student sheets
   */
  TASK_SHEET_CONFIG: {
    sheetName: "Tasks",
    startRow: 3, // First data row
    linkColumn: 8, // Column H = worksheet links
  },

  /**
   * Extracts the last name from a full name.
   * Takes everything after the first whitespace.
   * "John Smith" -> "Smith"
   * "Mary Jane Watson" -> "Jane Watson"
   * @private
   * @param {string} fullName - The full name
   * @returns {string} The last name portion
   */
  _extractLastName(fullName) {
    if (!fullName || typeof fullName !== "string") return "";
    const trimmed = fullName.trim();
    const spaceIndex = trimmed.indexOf(" ");
    if (spaceIndex === -1) return trimmed; // No space, return whole name
    return trimmed.substring(spaceIndex + 1).trim();
  },

  /**
   * Extracts file ID from a Google Drive/Docs URL.
   * @private
   * @param {string} url - The Google Drive URL
   * @returns {string|null} The file ID or null if not found
   */
  _extractFileId(url) {
    if (!url || typeof url !== "string") return null;

    // Handle various Google URL formats
    // https://docs.google.com/document/d/FILE_ID/edit
    // https://docs.google.com/spreadsheets/d/FILE_ID/edit
    // https://drive.google.com/file/d/FILE_ID/view
    // https://drive.google.com/open?id=FILE_ID
    const patterns = [
      /\/d\/([a-zA-Z0-9_-]+)/,
      /[?&]id=([a-zA-Z0-9_-]+)/,
      /\/folders\/([a-zA-Z0-9_-]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  },

  /**
   * Extracts folder ID from a Google Drive folder URL.
   * @private
   * @param {string} url - The Google Drive folder URL
   * @returns {string|null} The folder ID or null if not found
   */
  _extractFolderId(url) {
    return this._extractFileId(url); // Same logic works for folders
  },

  /**
   * Phase 1: Collects worksheet validation issues from all student spreadsheets.
   * Scans Tasks sheet column H for worksheet links, checks if filename starts with LastName.
   * Writes issues to WorksheetQueue sheet for later processing.
   *
   * @param {Object} options - Optional configuration
   * @param {number} options.batchSize - Number of students to process per run (default: 30)
   * @param {boolean} options.resetState - Force restart from beginning (default: false)
   * @returns {Object} Collection results with counts and timing
   */
  collectTasksWorksheets(options) {
    const startTime = Date.now();
    const opts = options || { batchSize: 30, resetState: false };
    const batchSize = typeof opts.batchSize === "number" ? opts.batchSize : 30;
    const resetState =
      typeof opts.resetState === "boolean" ? opts.resetState : false;
    const verbose = CONFIG.debugMode;

    const results = {
      scanned: 0,
      issuesFound: 0,
      skipped: 0,
      errors: [],
      executionTime: 0,
      completed: false,
    };

    if (verbose) {
      Logger.log("═══════════════════════════════════════════════════════════");
      Logger.log("  WORKSHEET VALIDATION - PHASE 1: COLLECTION");
      Logger.log("═══════════════════════════════════════════════════════════");
      Logger.log(`Batch size: ${batchSize}, Reset state: ${resetState}`);
    }

    try {
      // Get script properties for state persistence
      const scriptProps = PropertiesService.getScriptProperties();
      let lastProcessedIndex = resetState
        ? 0
        : parseInt(
            scriptProps.getProperty("lastProcessedWorksheetIndex") || "0"
          );

      // Open central sheets
      const broadcastSs = spreadsheetHelperFunctions.openSpreadsheetWithId(
        CONFIG.sheets.broadcastSheet.id
      );
      const worksheetQueue = broadcastSs.getSheetByName("WorksheetQueue");

      if (!worksheetQueue) {
        throw new Error(
          "WorksheetQueue sheet not found. Run setupWorksheetQueue() first."
        );
      }

      // Get all students
      const allStudents = StudentDataService.getAllStudents();

      if (verbose) {
        Logger.log(`Total students: ${allStudents.length}`);
        Logger.log(`Starting from index: ${lastProcessedIndex}`);
      }

      // Get existing queue items for duplicate checking
      const existingItems = this._getExistingQueueItems(worksheetQueue);

      if (verbose) {
        Logger.log(
          `Existing queue items (pending/processed): ${existingItems.size}`
        );
        Logger.log(
          "───────────────────────────────────────────────────────────"
        );
      }

      // Determine batch end
      const endIndex = Math.min(
        lastProcessedIndex + batchSize,
        allStudents.length
      );

      // Process batch of students
      for (let i = lastProcessedIndex; i < endIndex; i++) {
        // Check execution time before processing each student
        if (Date.now() - startTime > this._MAX_EXECUTION_TIME) {
          Logger.log(
            `WARNING: Approaching execution time limit. Processed ${results.scanned} students. Will resume next run.`
          );
          scriptProps.setProperty("lastProcessedWorksheetIndex", i.toString());
          results.executionTime = Date.now() - startTime;
          return results;
        }

        const student = allStudents[i];
        results.scanned++;

        if (verbose) {
          Logger.log(
            `[${i + 1}/${allStudents.length}] Scanning: ${student.name}`
          );
        }

        try {
          const issuesFound = this._scanStudentWorksheets(
            student,
            worksheetQueue,
            existingItems,
            verbose
          );
          results.issuesFound += issuesFound;

          if (verbose && issuesFound > 0) {
            Logger.log(`  └─ Found ${issuesFound} issue(s)`);
          }
        } catch (error) {
          Logger.log(`  └─ ERROR: ${error.toString()}`);
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
        scriptProps.setProperty("lastProcessedWorksheetIndex", "0");
        if (verbose) {
          Logger.log(
            "───────────────────────────────────────────────────────────"
          );
          Logger.log("SUCCESS: Completed full worksheet scan of all students");
        }
      } else {
        scriptProps.setProperty(
          "lastProcessedWorksheetIndex",
          endIndex.toString()
        );
        if (verbose) {
          Logger.log(
            "───────────────────────────────────────────────────────────"
          );
          Logger.log(
            `INFO: Batch complete. Will resume from index ${endIndex} on next run`
          );
        }
      }

      results.executionTime = Date.now() - startTime;

      if (verbose) {
        Logger.log(
          "═══════════════════════════════════════════════════════════"
        );
        Logger.log("  COLLECTION SUMMARY");
        Logger.log(
          "═══════════════════════════════════════════════════════════"
        );
        Logger.log(`Students scanned: ${results.scanned}`);
        Logger.log(`Issues found: ${results.issuesFound}`);
        Logger.log(`Errors: ${results.errors.length}`);
        Logger.log(`Execution time: ${results.executionTime}ms`);
        Logger.log(`Completed: ${results.completed}`);
        Logger.log(
          "═══════════════════════════════════════════════════════════"
        );
      }
    } catch (error) {
      Logger.log("ERROR: " + error.toString());
      results.errors.push({
        error: "Fatal error: " + error.message,
      });
    }

    return results;
  },

  /**
   * Gets existing queue items for duplicate checking.
   * @private
   */
  _getExistingQueueItems(worksheetQueue) {
    const lastRow = worksheetQueue.getLastRow();
    if (lastRow < 2) return new Set();

    const data = worksheetQueue.getRange(2, 1, lastRow - 1, 13).getValues();

    // Create a set of unique identifiers (studentName + fileId + cellRow)
    const existing = new Set();
    for (const row of data) {
      const studentName = row[this.COLUMNS.STUDENT_NAME];
      const fileId = row[this.COLUMNS.ORIGINAL_FILE_ID];
      const cellRow = row[this.COLUMNS.CELL_ROW];
      const status = row[this.COLUMNS.STATUS];

      // Only skip if pending or processed (not if error, allow retry)
      if (status === this.STATUS.PENDING || status === this.STATUS.PROCESSED) {
        existing.add(`${studentName}|${fileId}|${cellRow}`);
      }
    }
    return existing;
  },

  /**
   * Scans a single student's Tasks sheet for worksheet issues.
   * @private
   * @param {Object} student - Student object with name, email, url
   * @param {Sheet} worksheetQueue - The queue sheet to write to
   * @param {Set} existingItems - Set of existing queue items for dedup
   * @param {boolean} verbose - Whether to log verbose output
   */
  _scanStudentWorksheets(student, worksheetQueue, existingItems, verbose) {
    let issuesFound = 0;

    // Open student's spreadsheet
    const studentSs = spreadsheetHelperFunctions.openSpreadsheetWithUrl(
      student.url
    );
    const studentSpreadsheetId = studentSs.getId();

    // Get Tasks sheet
    const tasksSheet = studentSs.getSheetByName(
      this.TASK_SHEET_CONFIG.sheetName
    );
    if (!tasksSheet) {
      if (verbose) {
        Logger.log(`  └─ ⚠️ No Tasks sheet found`);
      }
      return 0;
    }

    // Get target folder from Home Page C6
    const homePage = studentSs.getSheetByName("Home Page");
    let targetFolderId = "";
    if (homePage) {
      const folderCell = homePage.getRange("C6");
      const folderRichText = folderCell.getRichTextValue();
      let folderUrl = "";

      if (folderRichText && folderRichText.getLinkUrl()) {
        folderUrl = folderRichText.getLinkUrl();
      } else {
        folderUrl = String(folderCell.getValue() || "").trim();
      }

      targetFolderId = this._extractFolderId(folderUrl);
    }

    if (!targetFolderId && verbose) {
      Logger.log(`  └─ WARNING: No target folder in Home Page C6`);
    }

    // Extract last name
    const lastName = this._extractLastName(student.name);

    if (verbose) {
      Logger.log(`  └─ Last name: "${lastName}"`);
    }

    // Get worksheet links from column H, starting at row 3
    const lastRow = tasksSheet.getLastRow();
    if (lastRow < this.TASK_SHEET_CONFIG.startRow) {
      if (verbose) {
        Logger.log(`  └─ No data rows in Tasks sheet`);
      }
      return 0;
    }

    const numRows = lastRow - this.TASK_SHEET_CONFIG.startRow + 1;
    const linkRange = tasksSheet.getRange(
      this.TASK_SHEET_CONFIG.startRow,
      this.TASK_SHEET_CONFIG.linkColumn,
      numRows,
      1
    );
    const richTextValues = linkRange.getRichTextValues();

    if (verbose) {
      Logger.log(`  └─ Scanning ${numRows} rows in column H`);
    }

    let filesChecked = 0;
    let filesSkipped = 0;
    let filesOk = 0;

    // Process each row
    for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
      const richText = richTextValues[rowIdx][0];
      if (!richText) continue;

      // Extract URL from rich text or plain text
      let fileUrl = richText.getLinkUrl();
      if (!fileUrl) {
        const plainText = richText.getText();
        if (plainText && plainText.includes("google.com")) {
          fileUrl = plainText.trim();
        }
      }

      if (!fileUrl) continue;

      // Extract file ID
      const fileId = this._extractFileId(fileUrl);
      if (!fileId) continue;

      filesChecked++;

      // Check if already in queue
      const actualRow = this.TASK_SHEET_CONFIG.startRow + rowIdx;
      const uniqueKey = `${student.name}|${fileId}|${actualRow}`;
      if (existingItems.has(uniqueKey)) {
        filesSkipped++;
        continue; // Skip duplicates
      }

      // Get the file and check its name
      try {
        const file = DriveApp.getFileById(fileId);
        const fileName = file.getName();

        // Check if filename starts with last name (case-insensitive)
        if (fileName.toLowerCase().startsWith(lastName.toLowerCase())) {
          filesOk++;
          continue; // Already properly named
        }

        // This file needs to be renamed - add to queue
        const timestamp = new Date();
        const nextRow = worksheetQueue.getLastRow() + 1;

        worksheetQueue.getRange(nextRow, 1, 1, 13).setValues([
          [
            timestamp, // Timestamp
            student.name, // StudentName
            student.email, // StudentEmail
            lastName, // LastName
            fileId, // OriginalFileId
            fileName, // OriginalFileName
            targetFolderId, // TargetFolderId
            actualRow, // CellRow
            studentSpreadsheetId, // StudentSpreadsheetId
            this.STATUS.PENDING, // Status
            "", // ProcessedAt
            "", // NewFileUrl
            "", // ErrorMessage
          ],
        ]);

        issuesFound++;
        existingItems.add(uniqueKey); // Add to set to prevent duplicates within same batch

        if (verbose) {
          Logger.log(
            `     ├─ INFO: Row ${actualRow}: "${fileName}" → needs "${lastName} - ${fileName}"`
          );
        }
      } catch (error) {
        // File might not be accessible
        if (verbose) {
          Logger.log(
            `     ├─ WARNING: Row ${actualRow}: Could not access file (${error.message})`
          );
        }
      }
    }

    if (verbose && filesChecked > 0) {
      Logger.log(
        `  └─ Files: ${filesChecked} checked, ${filesOk} OK, ${filesSkipped} skipped (in queue), ${issuesFound} need rename`
      );
    }

    return issuesFound;
  },

  /**
   * Phase 2: Processes pending worksheet issues from the queue.
   * For each issue: copies file, renames, moves to shared drive, shares with student, updates cell.
   *
   * @returns {Object} Processing results with counts and timing
   */
  processTasksWorksheets() {
    const startTime = Date.now();
    const verbose = CONFIG.debugMode;
    const results = {
      processed: 0,
      success: 0,
      errors: [],
      executionTime: 0,
    };

    if (verbose) {
      Logger.log("═══════════════════════════════════════════════════════════");
      Logger.log("  WORKSHEET VALIDATION - PHASE 2: PROCESSING");
      Logger.log("═══════════════════════════════════════════════════════════");
    }

    try {
      // Open WorksheetQueue sheet
      const broadcastSs = spreadsheetHelperFunctions.openSpreadsheetWithId(
        CONFIG.sheets.broadcastSheet.id
      );
      const worksheetQueue = broadcastSs.getSheetByName("WorksheetQueue");

      if (!worksheetQueue) {
        throw new Error("WorksheetQueue sheet not found.");
      }

      const lastRow = worksheetQueue.getLastRow();
      if (lastRow < 2) {
        if (verbose) {
          Logger.log("INFO: No worksheet issues in queue");
          Logger.log(
            "═══════════════════════════════════════════════════════════"
          );
        }
        return results;
      }

      // Read all rows at once
      const data = worksheetQueue.getRange(2, 1, lastRow - 1, 13).getValues();

      // Count pending items
      const pendingCount = data.filter(
        (row) => row[this.COLUMNS.STATUS] === this.STATUS.PENDING
      ).length;

      if (verbose) {
        Logger.log(`Total queue items: ${data.length}`);
        Logger.log(`Pending items to process: ${pendingCount}`);
        Logger.log(
          "───────────────────────────────────────────────────────────"
        );
      }

      // Process pending items
      for (let i = 0; i < data.length; i++) {
        // Check execution time
        if (Date.now() - startTime > this._MAX_EXECUTION_TIME) {
          Logger.log(
            "WARNING: Approaching execution time limit, stopping early"
          );
          break;
        }

        const row = data[i];
        const status = row[this.COLUMNS.STATUS];

        // Only process pending items
        if (status !== this.STATUS.PENDING) continue;

        const actualRow = i + 2; // Adjust for header and 0-based index
        const studentName = row[this.COLUMNS.STUDENT_NAME];
        const fileName = row[this.COLUMNS.ORIGINAL_FILE_NAME];
        results.processed++;

        if (verbose) {
          Logger.log(
            `[${results.processed}/${pendingCount}] Processing: ${studentName} - "${fileName}"`
          );
        }

        try {
          const result = this._processWorksheetItem(row, verbose);

          if (result.success) {
            // Update queue row with success
            worksheetQueue
              .getRange(actualRow, 10, 1, 4)
              .setValues([
                [this.STATUS.PROCESSED, new Date(), result.newFileUrl, ""],
              ]);
            results.success++;

            if (verbose) {
              Logger.log(`  └─ SUCCESS: ${result.newFileUrl}`);
            }
          } else {
            // Update queue row with error
            worksheetQueue
              .getRange(actualRow, 10, 1, 4)
              .setValues([[this.STATUS.ERROR, new Date(), "", result.error]]);
            results.errors.push({
              student: studentName,
              file: fileName,
              error: result.error,
            });

            if (verbose) {
              Logger.log(`  └─ ERROR: ${result.error}`);
            }
          }
        } catch (error) {
          worksheetQueue
            .getRange(actualRow, 10, 1, 4)
            .setValues([[this.STATUS.ERROR, new Date(), "", error.message]]);
          results.errors.push({
            student: studentName,
            file: fileName,
            error: error.message,
          });

          if (verbose) {
            Logger.log(`  └─ EXCEPTION: ${error.message}`);
          }
        }
      }

      results.executionTime = Date.now() - startTime;

      if (verbose) {
        Logger.log(
          "═══════════════════════════════════════════════════════════"
        );
        Logger.log("  PROCESSING SUMMARY");
        Logger.log(
          "═══════════════════════════════════════════════════════════"
        );
        Logger.log(`Items processed: ${results.processed}`);
        Logger.log(`Successful: ${results.success}`);
        Logger.log(`Errors: ${results.errors.length}`);
        Logger.log(`Execution time: ${results.executionTime}ms`);
        if (results.errors.length > 0) {
          Logger.log(
            "───────────────────────────────────────────────────────────"
          );
          Logger.log("Error details:");
          results.errors.forEach((e, idx) => {
            Logger.log(`  ${idx + 1}. ${e.student} - ${e.file}: ${e.error}`);
          });
        }
        Logger.log(
          "═══════════════════════════════════════════════════════════"
        );
      }
    } catch (error) {
      Logger.log("ERROR: " + error.toString());
      results.errors.push({
        error: "Fatal error: " + error.message,
      });
    }

    return results;
  },

  /**
   * Processes a single worksheet item from the queue.
   * @private
   * @param {Array} row - The queue row data
   * @param {boolean} verbose - Whether to log verbose output
   * @returns {Object} Result with success status and newFileUrl or error
   */
  _processWorksheetItem(row, verbose) {
    const studentName = row[this.COLUMNS.STUDENT_NAME];
    const studentEmail = row[this.COLUMNS.STUDENT_EMAIL];
    const lastName = row[this.COLUMNS.LAST_NAME];
    const originalFileId = row[this.COLUMNS.ORIGINAL_FILE_ID];
    const originalFileName = row[this.COLUMNS.ORIGINAL_FILE_NAME];
    const targetFolderId = row[this.COLUMNS.TARGET_FOLDER_ID];
    const cellRow = row[this.COLUMNS.CELL_ROW];
    const studentSpreadsheetId = row[this.COLUMNS.STUDENT_SPREADSHEET_ID];

    // Validate required fields
    if (!originalFileId) {
      return { success: false, error: "Missing original file ID" };
    }

    if (!targetFolderId) {
      return { success: false, error: "Missing target folder ID" };
    }

    // Step 1: Get the original file
    if (verbose) {
      Logger.log(`  ├─ Step 1: Getting original file...`);
    }
    const originalFile = DriveApp.getFileById(originalFileId);

    // Step 2: Create new filename with LastName prefix
    const newFileName = `${lastName} - ${originalFileName}`;
    if (verbose) {
      Logger.log(`  ├─ Step 2: New filename: "${newFileName}"`);
    }

    // Step 3: Get target folder
    if (verbose) {
      Logger.log(`  ├─ Step 3: Getting target folder...`);
    }
    const targetFolder = DriveApp.getFolderById(targetFolderId);

    // Step 4: Copy file to target folder with new name
    if (verbose) {
      Logger.log(`  ├─ Step 4: Copying file to target folder...`);
    }
    const newFile = originalFile.makeCopy(newFileName, targetFolder);
    const newFileUrl = newFile.getUrl();

    // Step 5: Share with student if email exists
    if (studentEmail) {
      if (verbose) {
        Logger.log(`  ├─ Step 5: Sharing with ${studentEmail}...`);
      }
      try {
        newFile.addEditor(studentEmail);
      } catch (shareError) {
        if (verbose) {
          Logger.log(`  │  └─ WARNING: Could not share: ${shareError.message}`);
        }
        // Continue even if sharing fails
      }
    } else if (verbose) {
      Logger.log(`  ├─ Step 5: No student email, skipping share`);
    }

    // Step 6: Update the cell in student's spreadsheet with new URL
    if (verbose) {
      Logger.log(`  ├─ Step 6: Updating spreadsheet cell H${cellRow}...`);
    }
    try {
      const studentSs = SpreadsheetApp.openById(studentSpreadsheetId);
      const tasksSheet = studentSs.getSheetByName(
        this.TASK_SHEET_CONFIG.sheetName
      );

      if (tasksSheet) {
        const cell = tasksSheet.getRange(
          cellRow,
          this.TASK_SHEET_CONFIG.linkColumn
        );

        // Create rich text with hyperlink
        const richText = SpreadsheetApp.newRichTextValue()
          .setText(newFileName)
          .setLinkUrl(newFileUrl)
          .build();

        cell.setRichTextValue(richText);
      }
    } catch (updateError) {
      if (verbose) {
        Logger.log(
          `  │  └─ WARNING: Could not update cell: ${updateError.message}`
        );
      }
      // File was created, so we still return success
    }

    return {
      success: true,
      newFileUrl: newFileUrl,
    };
  },

  /**
   * Creates the WorksheetQueue sheet with proper headers.
   * Run this once during setup.
   *
   * @returns {Object} Result object
   */
  setupWorksheetQueue() {
    try {
      const broadcastSs = spreadsheetHelperFunctions.openSpreadsheetWithId(
        CONFIG.sheets.broadcastSheet.id
      );

      // Check if WorksheetQueue already exists
      let worksheetQueue = broadcastSs.getSheetByName("WorksheetQueue");

      if (worksheetQueue) {
        return {
          success: true,
          message: "WorksheetQueue sheet already exists. No setup needed.",
        };
      }

      // Create new sheet
      worksheetQueue = broadcastSs.insertSheet("WorksheetQueue");

      // Set up headers
      const headers = [
        "Timestamp",
        "Student Name",
        "Student Email",
        "Last Name",
        "Original File ID",
        "Original File Name",
        "Target Folder ID",
        "Cell Row",
        "Student Spreadsheet ID",
        "Status",
        "Processed At",
        "New File URL",
        "Error Message",
      ];

      worksheetQueue.getRange(1, 1, 1, headers.length).setValues([headers]);

      // Format header row
      const headerRange = worksheetQueue.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#34a853"); // Green for worksheet service
      headerRange.setFontColor("#ffffff");

      // Set column widths
      worksheetQueue.setColumnWidth(1, 150); // Timestamp
      worksheetQueue.setColumnWidth(2, 150); // Student Name
      worksheetQueue.setColumnWidth(3, 200); // Student Email
      worksheetQueue.setColumnWidth(4, 100); // Last Name
      worksheetQueue.setColumnWidth(5, 200); // Original File ID
      worksheetQueue.setColumnWidth(6, 250); // Original File Name
      worksheetQueue.setColumnWidth(7, 200); // Target Folder ID
      worksheetQueue.setColumnWidth(8, 80); // Cell Row
      worksheetQueue.setColumnWidth(9, 200); // Student Spreadsheet ID
      worksheetQueue.setColumnWidth(10, 100); // Status
      worksheetQueue.setColumnWidth(11, 150); // Processed At
      worksheetQueue.setColumnWidth(12, 300); // New File URL
      worksheetQueue.setColumnWidth(13, 250); // Error Message

      // Freeze header row
      worksheetQueue.setFrozenRows(1);

      Logger.log("WorksheetQueue sheet created successfully");

      return {
        success: true,
        message: "WorksheetQueue sheet created successfully.",
      };
    } catch (error) {
      Logger.log("Error setting up WorksheetQueue: " + error.toString());
      return {
        success: false,
        message: error.message,
      };
    }
  },

  /**
   * Resets the collection state to start from the beginning.
   * Useful for forcing a full re-scan.
   *
   * @returns {Object} Result object
   */
  resetCollectionState() {
    try {
      const scriptProps = PropertiesService.getScriptProperties();
      scriptProps.deleteProperty("lastProcessedWorksheetIndex");

      return {
        success: true,
        message: "Collection state reset. Next run will start from beginning.",
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  },

  /**
   * Gets the current collection progress.
   *
   * @returns {Object} Progress information
   */
  getCollectionProgress() {
    try {
      const scriptProps = PropertiesService.getScriptProperties();
      const lastIndex = parseInt(
        scriptProps.getProperty("lastProcessedWorksheetIndex") || "0"
      );
      const allStudents = StudentDataService.getAllStudents();

      return {
        lastProcessedIndex: lastIndex,
        totalStudents: allStudents.length,
        percentComplete: Math.round((lastIndex / allStudents.length) * 100),
        isComplete: lastIndex === 0 || lastIndex >= allStudents.length,
      };
    } catch (error) {
      return {
        error: error.message,
      };
    }
  },
};
