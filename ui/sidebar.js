function openSidebar() {
  var html = getStudentManagerSidebarHtml();
  SpreadsheetApp.getUi()
    .showSidebar(html);
}

function openStudentMeetingSidebar(data) {
  var template = HtmlService.createTemplateFromFile('ui/StudentMeetingNotesSidebar');
  template.data = data;  // { studentName: "...", meetings: [...] }
  var html = template.evaluate().setTitle('Student Meetings');
  SpreadsheetApp.getUi().showSidebar(html);
}

function getStudentManagerSidebarHtml() {
  return HtmlService.createHtmlOutputFromFile('ui/StudentManagerSidebar')
    .setTitle('Summit Sidebar');
}

function getStudentMeetingSidebarHtml(meetings) {
  var template = HtmlService.createTemplateFromFile('ui/StudentMeetingNotesSidebar');
  // Push meetings through
  template.meetings = meetings;
  // Render html and return
  return template.evaluate().setTitle('Student Meetings');
}

