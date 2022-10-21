const axios = require('axios').default;
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const { argv } = yargs(hideBin(process.argv));
const fs = require('fs');
const azureConfig = require('../azure-config.json');

const reportFileName = fs.readdirSync('./reports/cucumberJS');

const report = require(`../reports/cucumberJS/${reportFileName}`);

const azure = axios.create({
  baseURL: azureConfig.organizationUrl,
  timeout: 100 * 1000,
  headers: {
    Authorization: `Basic ${Buffer.from(`PAT:${argv.pat}`).toString('base64')}`,
    'Content-Type': 'application/json',
  },
});

const getTestCasesFromTestSuite = async function () {
  let items = [];
  const response = await azure.get(`testplan/Plans/${azureConfig.planId}/Suites/${azureConfig.suiteId}/TestPoint`);
  switch (response.status) {
    case 404:
      console.log(`Error: ${response.data.message}`);
      break;
    case 200:
      items = [...response.data.value];
      if (items.length === 0) {
        console.log(`Error: Suite ${azureConfig.suiteId} does not have Test Points`);
      }
      break;
    default:
      console.log('Error:', response.data);
  }

  return items;
};

const resetCasesStatusToActive = async function () {
  let items = await getTestCasesFromTestSuite();

  const requestBody = [];

  for (const elem of items) {
    requestBody.push({
      id: elem.id,
      isActive: true,
    });
  }

  const response = await azure.patch(`testplan/Plans/${azureConfig.planId}/Suites/${azureConfig.suiteId}/TestPoint?includePointDetails=true&returnIdentityRef=true&api-version=6.0`, requestBody);
  switch (response.status) {
    case 404:
      console.log(`Error: ${response.data.message}`);
      break;
    case 200:
      items = [...response.data.value];
      console.log(`Reset "${items.length}" Test Point(s) in Suite ${azureConfig.suiteId} to Active`);
      break;
    default:
      console.log('Error:', response.data);
  }
  return response;
};

const parseJsonReport = async function () {
  const testsResults = [];

  for (const elem of report[0].elements) {
    let scenarioStatus;
    let testCaseId;
    let screenshot;
    let errorMessage;
    let name;

    testCaseId = elem.tags[0].name.slice(2);
    name = elem.name;
    const isAnyStepFailed = elem.steps.some((step) => step.result.status === 'failed');

    if (isAnyStepFailed) {
      for (const step of elem.steps) {
        if (step.result.status === 'failed') {
          errorMessage = step.result.error_message;
        }
        if (step.hasOwnProperty('embeddings')) {
          screenshot = step.embeddings[0].data;
        }
      }
    }
    scenarioStatus = isAnyStepFailed ? 'failed' : 'passed';
    testsResults.push({
      id: testCaseId,
      name,
      scenarioStatus,
      screenshot,
      errorMessage,
    });
  }
  return testsResults;
};

const getRunID = async function () {
  const response = await azure.get('test/runs?api-version=6.0');
  const runId = response.data.value.filter((item) => item.name === azureConfig.runName);

  return runId[runId.length - 1].id;
};

const getRunTestResults = async function () {
  const runId = await getRunID();
  const response = await azure.get(`test/runs/${runId}/results?api-version=6.0`);

  return response;
};

const updateRunResultsWithErrors = async function () {
  const runId = await getRunID();
  const runResults = await parseJsonReport();
  const azureTestRunResult = (await getRunTestResults()).data.value;

  const requestBody = [];

  for (const item of azureTestRunResult) {
    for (const result of runResults) {
      if (item.testCase.name === result.name && result.errorMessage) {
        requestBody.push({
          id: item.id,
          errorMessage: result.errorMessage,
        });
      }
    }
  }

  const response = await azure.patch(`test/runs/${runId}/results?api-version=5.0`, requestBody);
  switch (response.status) {
    case 404:
      console.log(`Error: ${response.data.message}`);
      break;
    case 200:
      console.log(`Error messages in "${[...response.data.value].length}" Test Point(s) in Run ${runId} were updated`);
      break;
    default:
      console.log('Error:', response.data);
  }

  return response;
};

const updateRunResultsWithScreenshot = async function () {
  const runId = await getRunID();
  const runResults = await parseJsonReport();
  const azureTestRunResult = (await getRunTestResults()).data.value;
  let response;
  let requestBody;

  for (const item of azureTestRunResult) {
    for (const result of runResults) {
      if (item.testCase.name === result.name && result.screenshot) {
        requestBody = {
          fileName: 'screenshot.png',
          comment: 'Test attachment upload',
          attachmentType: 'GeneralAttachment',
          stream: `${result.screenshot}`,
        };

        response = await azure.post(`test/runs/${runId}/results/${item.id}/attachments?api-version=5.1-preview.1`, requestBody);

        if (response.status !== 200) {
          console.log(`Error: ${response.data}`);
        }
      }
    }
  }
};

const updateTestSuiteWithResults = async function () {
  const items = await getTestCasesFromTestSuite();
  const runResults = await parseJsonReport();

  const requestBody = [];

  for (const item of items) {
    const result = runResults.filter((result) => result.id == item.testCaseReference.id);

    if (result.length > 0) {
      requestBody.push({
        id: item.id,
        results: {
          outcome: result[0]?.scenarioStatus,
        },
      });
    } else {
      console.log(`@C${item.testCaseReference.id} case does not have the result. Probably, it does not exist in report.`);
    }
  }
  const response = await azure.patch(`testplan/Plans/${azureConfig.planId}/Suites/${azureConfig.suiteId}/TestPoint?includePointDetails=true&returnIdentityRef=true&api-version=6.0`, requestBody);
  switch (response.status) {
    case 404:
      console.log(`Error: ${response.data.message}`);
      break;
    case 200:
      console.log(`Statuses in Suite ${azureConfig.suiteId} were updated`);
      break;
    default:
      console.log('Error:', response.data);
  }
  return response;
};

const uploadReport = async function () {
  await resetCasesStatusToActive();
  await updateRunResultsWithErrors();
  await updateRunResultsWithScreenshot();
  await updateTestSuiteWithResults();
};

uploadReport();
