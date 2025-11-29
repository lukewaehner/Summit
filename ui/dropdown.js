function startMenu() {
  SpreadsheetApp.getUi()
    .createMenu('Summit')
    .addItem('Send Meeting Notes', 'openSidebar')
    .addToUi();
}
