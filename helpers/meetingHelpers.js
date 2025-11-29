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
    const d =
      meeting.date instanceof Date
        ? meeting.date
        : new Date(meeting.date || now);

    // Return Unix timestamp in milliseconds for precise sorting
    // NOTE: Currently only uses date; time could be incorporated here in the future
    return d.getTime();
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
   * @param {string} _studentName - Student name (unused, reserved for future use)
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
  buildMeetingRows(meetings, now, _studentName) {
    // Handle empty or null meeting arrays
    if (!meetings || meetings.length === 0) {
      return [];
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

    // Convert to sheet row format: [status, date, time]
    // These correspond to columns B, C, D in the spreadsheet
    const rows = ordered.map((entry) => {
      const m = entry.meeting;
      return [entry.status, m.date, m.time];
    });

    return rows;
  },
};
