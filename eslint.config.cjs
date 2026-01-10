/* eslint-env node */
const js = require("@eslint/js");
const googleappsscript = require("eslint-plugin-googleappsscript");

/** @type {import("eslint").Linter.FlatConfig[]} */
module.exports = [
  js.configs.recommended,
  {
    plugins: {
      googleappsscript,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script", // Apps Script is non-module
      globals: {
        // ES globals are already covered by js.configs.recommended;
        // here we add Apps Script globals:
        ...googleappsscript.environments.googleappsscript.globals,
        // Global configuration and utilities (defined across files)
        CONFIG: "writable",
        spreadsheetHelperFunctions: "writable",
        // Models
        Meeting: "writable",
        // Services
        MeetingDataService: "writable",
        StudentDataService: "writable",
        EmailService: "writable",
        ReviewNotificationService: "writable",
        OutboundReviewService: "writable",
        SummitCacheService: "writable",
        // Helpers
        meetingHelpers: "writable",
        // Orchestrators & Entry Points
        loadMeetings: "writable",
        sendMeetingNotes: "writable",
        syncAllData: "writable",
        updateStudentDataSpreadhseet: "writable",
        grabAllMeetings: "writable",
        trackMeetingsToStudents: "writable",
        buildMeetingRowsForStudent: "writable",
        getMeetingTimestamp: "writable",
        // UI Entry Points (wrapper functions for sidebars)
        getStudentData: "writable",
        getStudentMeetings: "writable",
        openSidebar: "writable",
        openSidebar_impl: "writable",
        openStudentMeetingSidebar: "writable",
        openStudentMeetingSidebar_impl: "writable",
        getStudentManagerSidebarHtml: "writable",
        getStudentMeetingSidebarHtml: "writable",
        startMenu: "writable",
        getStudentDataCheck: "writable",
        // Email Functions
        sendMeetingNotesEmail: "writable",
        // Review Notification Functions
        collectReviewRequests: "writable",
        processReviewRequests: "writable",
        markReviewAsCompleted: "writable",
        setupReviewQueue: "writable",
        // Outbound Review Notification Functions
        collectOutboundReviews: "writable",
        processOutboundReviews: "writable",
        setupOutboundQueue: "writable",
        debugOutboundNotifications: "writable",
        // Worksheet Validation Functions
        WorksheetValidationService: "writable",
        collectTasksWorksheets: "writable",
        processTasksWorksheets: "writable",
        setupWorksheetQueue: "writable",
        resetWorksheetCollectionState: "writable",
        getWorksheetCollectionProgress: "writable",
        // New Meeting/Student Data Functions
        updateStudentDataSheet: "writable",
        syncMeetingsToStudents: "writable",
      },
    },
    rules: {
      // Allow unused vars for function params (Apps Script entry points)
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern:
            "^(CONFIG|Meeting|meetingHelpers|MeetingDataService|StudentDataService|EmailService|ReviewNotificationService|OutboundReviewService|SummitCacheService|WorksheetValidationService|loadMeetings|sendMeetingNotes|syncAllData|updateStudentDataSpreadhseet|updateStudentDataSheet|syncMeetingsToStudents|grabAllMeetings|trackMeetingsToStudents|buildMeetingRowsForStudent|getMeetingTimestamp|spreadsheetHelperFunctions|getStudentData|getStudentMeetings|openSidebar|openSidebar_impl|openStudentMeetingSidebar|openStudentMeetingSidebar_impl|getStudentManagerSidebarHtml|getStudentMeetingSidebarHtml|startMenu|getStudentDataCheck|sendMeetingNotesEmail|collectReviewRequests|processReviewRequests|markReviewAsCompleted|setupReviewQueue|collectOutboundReviews|processOutboundReviews|setupOutboundQueue|debugOutboundNotifications|collectTasksWorksheets|processTasksWorksheets|setupWorksheetQueue|resetWorksheetCollectionState|getWorksheetCollectionProgress)$",
        },
      ],
      // Allow redeclaration for Apps Script backwards compatibility
      "no-redeclare": "off",
    },
  },
];
