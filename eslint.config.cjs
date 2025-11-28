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
        getStudentData: "writeable",
      },
    },
    rules: {
      // Allow unused vars for function params (Apps Script entry points)
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern:
            "^(CONFIG|Meeting|meetingHelpers|MeetingDataService|StudentDataService|loadMeetings|sendMeetingNotes|syncAllData|updateStudentDataSpreadhseet|grabAllMeetings|trackMeetingsToStudents|buildMeetingRowsForStudent|getMeetingTimestamp|spreadsheetHelperFunctions)$",
        },
      ],
      // Allow redeclaration for Apps Script backwards compatibility
      "no-redeclare": "off",
    },
  },
];
