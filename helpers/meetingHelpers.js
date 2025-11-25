/**
 * Helper functions for meeting-related operations.
 */

const meetingHelpers = {
  /**
   * Computes a numeric timestamp for a Meeting for sorting.
   * Uses date primarily; if date is not a Date, falls back to Date.parse.
   *
   * @param {Meeting} meeting
   * @param {Date} now
   * @returns {number}
   */
  getMeetingTimestamp(meeting, now) {
    const d =
      meeting.date instanceof Date
        ? meeting.date
        : new Date(meeting.date || now);

    // If needed you can incorporate time into this if time is a string or Date
    return d.getTime();
  },

  /**
   * Builds rows for a student's Meetings sheet.
   * Categorizes meetings as: Past Meeting, Current Meeting, Next Meeting, Future Meeting.
   *
   * @param {Meeting[]} meetings
   * @param {Date} now
   * @param {string} _studentName - Student name (unused, for future use)
   * @returns {any[][]} - Array of [status, date, time] rows
   */
  buildMeetingRows(meetings, now, _studentName) {
    if (!meetings || meetings.length === 0) {
      return [];
    }

    // Build list with timestamps for sorting
    const withTs = meetings.map((m) => ({
      meeting: m,
      ts: this.getMeetingTimestamp(m, now),
    }));

    const past = withTs.filter((x) => x.ts < now.getTime());
    const future = withTs.filter((x) => x.ts >= now.getTime());

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

    // Convert to sheet rows: B=status, C=date, D=time
    const rows = ordered.map((entry) => {
      const m = entry.meeting;
      return [entry.status, m.date, m.time];
    });

    return rows;
  },
};
