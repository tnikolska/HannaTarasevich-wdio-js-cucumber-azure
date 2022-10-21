const report = require('multiple-cucumber-html-reporter');

report.generate({
  jsonDir: './reports/cucumberJS/',
  reportPath: './reports/html-report/',
});
