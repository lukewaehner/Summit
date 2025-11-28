function startMenu() {
  SpreadsheetApp.getUi()
    .createMenu('Summit')
    .addItem('Send Meeting Notes', 'openSidebar')
    .addToUi();
}

function openSidebar() {
  var html = getSidebarHtml();
  SpreadsheetApp.getUi()
    .showSidebar(html);
}

function getSidebarHtml() {
  return HtmlService.createHtmlOutputFromFile('ui/StudentMeetingNotesSidebar')
    .setTitle('Summit Sidebar');

}
