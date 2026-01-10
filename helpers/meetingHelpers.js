/**
 * Helper functions for meeting-related operations.
 * Provides utilities for processing, sorting, and categorizing meetings.
 * @namespace meetingHelpers
 */

const meetingHelpers = {
  /**
   * Computes a numeric timestamp for a Meeting for sorting purposes.
   * Uses the meeting's date property primarily; if date is not a Date object,
   * falls back to parsing it. If date is invalid, uses the current time.
   *
   * @param {Meeting} meeting - The meeting object containing date information
   * @param {Date} now - The current date/time to use as fallback
   * @returns {number} Unix timestamp in milliseconds
   *
   * @example
   * const meeting = { date: new Date('2024-01-15'), time: '10:00 AM' };
   * const timestamp = meetingHelpers.getMeetingTimestamp(meeting, new Date());
   */
  getMeetingTimestamp(meeting, now) {
    // Convert meeting date to Date object if it's not already
    // This handles both Date objects and string dates from the spreadsheet
    let d;

    if (meeting.date instanceof Date) {
      d = meeting.date;
    } else if (meeting.date) {
      d = new Date(meeting.date);
    } else {
      d = now;
    }

    // Check if the date is valid
    const timestamp = d.getTime();
    if (isNaN(timestamp)) {
      // Invalid date - return current time as fallback
      if (CONFIG.debugMode) {
        Logger.log(
          `     [getMeetingTimestamp] WARNING: Invalid date "${meeting.date}", using now`
        );
      }
      return now.getTime();
    }

    return timestamp;
  },

  /**
   * Builds categorized rows for a student's Meetings sheet.
   *
   * Meeting Status Logic:
   * - Past Meeting: Any meeting before the most recent past meeting
   * - Current Meeting: The most recent meeting that has already occurred
   * - Next Meeting: The earliest upcoming meeting
   * - Future Meeting: Any meeting after the next meeting
   *
   * @param {Meeting[]} meetings - Array of meeting objects to categorize
   * @param {Date} now - The current date/time used to determine past vs future
   * @param {string} studentName - Student name (used for verbose logging)
   * @returns {any[][]} Array of rows, each containing [status, date, time] for the sheet
   *
   * @example
   * const meetings = [
   *   { date: new Date('2024-01-10'), time: '10:00 AM' },
   *   { date: new Date('2024-01-20'), time: '2:00 PM' }
   * ];
   * const rows = meetingHelpers.buildMeetingRows(meetings, new Date('2024-01-15'));
   * // Returns: [['Current Meeting', Date, '10:00 AM'], ['Next Meeting', Date, '2:00 PM']]
   */
  buildMeetingRows(meetings, now, studentName) {
    const verbose = CONFIG.debugMode;

    // Handle empty or null meeting arrays
    if (!meetings || meetings.length === 0) {
      if (verbose) {
        Logger.log(
          `     [buildMeetingRows] No meetings provided for ${studentName}`
        );
      }
      return [];
    }

    if (verbose) {
      Logger.log(
        `     [buildMeetingRows] Processing ${meetings.length} meetings for ${studentName}`
      );
      Logger.log(`     [buildMeetingRows] Current time: ${now.toISOString()}`);
      // Log first meeting to debug date format
      const firstMeeting = meetings[0];
      Logger.log(`     [buildMeetingRows] First meeting sample:`);
      Logger.log(`       - name: ${firstMeeting.name}`);
      Logger.log(
        `       - date: ${
          firstMeeting.date
        } (type: ${typeof firstMeeting.date})`
      );
      Logger.log(
        `       - time: ${
          firstMeeting.time
        } (type: ${typeof firstMeeting.time})`
      );
      if (firstMeeting.date instanceof Date) {
        Logger.log(`       - date.getTime(): ${firstMeeting.date.getTime()}`);
      }
    }

    // Augment each meeting with its computed timestamp for efficient sorting
    const withTs = meetings.map((m) => ({
      meeting: m,
      ts: this.getMeetingTimestamp(m, now),
    }));

    // Split meetings into past (already occurred) and future (upcoming)
    const nowTs = now.getTime();
    const past = withTs.filter((x) => x.ts < nowTs);
    const future = withTs.filter((x) => x.ts >= nowTs);

    if (verbose) {
      Logger.log(`     [buildMeetingRows] nowTs: ${nowTs}`);
      Logger.log(
        `     [buildMeetingRows] Past meetings: ${past.length}, Future meetings: ${future.length}`
      );
      if (withTs.length > 0) {
        Logger.log(`     [buildMeetingRows] First timestamp: ${withTs[0].ts}`);
      }
    }

    // Sort both arrays chronologically (earliest to latest)
    past.sort((a, b) => a.ts - b.ts);
    future.sort((a, b) => a.ts - b.ts);

    /** @type {{meeting: Meeting, status: string}[]} */
    const ordered = [];

    // Process past meetings: all but the last are "Past Meeting",
    // the last one is "Current Meeting" (most recent completed meeting)
    if (past.length > 0) {
      // All meetings except the most recent are simple "Past Meeting"
      for (let i = 0; i < past.length - 1; i++) {
        ordered.push({ meeting: past[i].meeting, status: "Past Meeting" });
      }
      // The most recent past meeting is the "Current Meeting"
      ordered.push({
        meeting: past[past.length - 1].meeting,
        status: "Current Meeting",
      });
    }

    // Process future meetings: the first is "Next Meeting",
    // all others are "Future Meeting"
    if (future.length > 0) {
      // The earliest upcoming meeting is the "Next Meeting"
      ordered.push({
        meeting: future[0].meeting,
        status: "Next Meeting",
      });
      // All subsequent meetings are generic "Future Meeting"
      for (let i = 1; i < future.length; i++) {
        ordered.push({
          meeting: future[i].meeting,
          status: "Future Meeting",
        });
      }
    }

    if (verbose) {
      Logger.log(
        `     [buildMeetingRows] Ordered meetings to write: ${ordered.length}`
      );
    }

    // Convert to sheet row format: [status, date, time]
    // These correspond to columns B, C, D in the spreadsheet
    const rows = ordered.map((entry) => {
      const m = entry.meeting;
      return [entry.status, m.date, m.time];
    });

    return rows;
  },
};
