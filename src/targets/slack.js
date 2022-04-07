const request = require('phin-retry');
const { getUrl, getReportType, getPercentage, truncate, getReportPortalDefectsSummary, toHHMMSS } = require('../helpers/helper');
const { getLaunchDetails } = require('../helpers/report-portal');

function getRootPayload() {
  return {
    "attachments": []
  };
}

function getTitleText(result, options) {
  const title = options.title ? options.title : result.name;
  if (options.title_suffix) {
    return `*${title} ${options.title_suffix}*`;
  }
  return `*${title}*`;
}

function getMainSummary(result) {
  const color = result.status === 'PASS' ? 'good' : 'danger';
  const percentage = getPercentage(result.passed, result.total);
  return {
    "mrkdwn_in": ["text", "fields"],
    "color": color,
    "fields": [
      {
        "title": "Results",
        "value": `${result.passed} / ${result.total} Passed (${percentage}%)`,
        "short": true
      },
      {
        "title": "Duration",
        "value": `${toHHMMSS(result.duration)}`,
        "short": true
      }
    ]
  }
}

function getSuiteSummary(suite) {
  const color = suite.status === 'PASS' ? 'good' : 'danger';
  const percentage = getPercentage(suite.passed, suite.total);
  return {
    "text": `*${suite.name}*`,
    "mrkdwn_in": ["text", "fields"],
    "color": color,
    "fields": [
      {
        "title": "Results",
        "value": `${suite.passed} / ${suite.total} Passed (${percentage}%)`,
        "short": true
      },
      {
        "title": "Duration",
        "value": `${toHHMMSS(parseInt(suite.duration))}`,
        "short": true
      }
    ]
  }
}

async function getReportPortalAnalysisAttachment(opts) {
  try {
    const { statistics } = await getLaunchDetails(opts);
    if (statistics && statistics.defects) {
      const results = getReportPortalDefectsSummary(statistics.defects, '*');
      return {
        "mrkdwn_in": ["fields"],
        "fields": [
          {
            "title": "Report Portal Analysis",
            "value": results.join(' ｜ '),
            "short": false
          }
        ]
      }
    }
  } catch (error) {
    console.log('Failed to get report portal analysis');
    console.log(error);
  }
}

function getLinks(options) {
  const links = [];
  for (const link of options.links) {
    links.push(`<${link.url}|${link.text}>`);
  }
  return {
    "fallback": "links",
    "footer": links.join(' ｜ ')
  }
}

function getFailureDetailsFields(suite) {
  const fields = [];
  const cases = suite.cases;
  for (let i = 0; i < cases.length; i++) {
    const test_case = cases[i];
    if (test_case.status === 'FAIL') {
      const message = `*Test*: ${test_case.name}\n*Error*: ${truncate(test_case.failure, 150)}`;
      fields.push({ value: message });
    }
  }
  return fields;
}

async function attachReportPortalAnalysis(payload, testResult, opts) {
  if (testResult.status === 'PASS') {
    return;
  }
  if (!opts.report_portal_analysis) {
    return;
  }
  const att = await getReportPortalAnalysisAttachment(opts.report_portal_analysis);
  if (att) {
    payload.attachments.push(att);
  }
}

function attachLinks(payload, options) {
  if (options.links) {
    payload.attachments.push(getLinks(options));
  }
}

async function getTestSummaryMessage(results, options) {
  const result = results[0];
  const payload = getRootPayload();
  payload.text = getTitleText(result, options);
  payload.attachments.push(getMainSummary(result));
  if (result.suites.length > 1) {
    for (let i = 0; i < result.suites.length; i++) {
      const suite = result.suites[i];
      payload.attachments.push(getSuiteSummary(suite));
    }
  }
  await attachReportPortalAnalysis(payload, result, options);
  attachLinks(payload, options);
  return payload;
}

async function getFailureSummaryMessage(results, options) {
  const result = results[0];
  if (result.status === 'PASS') {
    return null;
  }
  const payload = getRootPayload();
  payload.text = getTitleText(result, options);
  payload.attachments.push(getMainSummary(result));
  if (result.suites.length > 1) {
    for (let i = 0; i < result.suites.length; i++) {
      const suite = result.suites[i];
      if (suite.status === 'FAIL') {
        payload.attachments.push(getSuiteSummary(suite));
      }
    }
  }
  await attachReportPortalAnalysis(payload, result, options);
  attachLinks(payload, options);
  return payload;
}

async function getTestSummarySlimMessage(results, options) {
  const result = results[0];
  const payload = getRootPayload();
  payload.text = getTitleText(result, options);
  payload.attachments.push(getMainSummary(result));
  await attachReportPortalAnalysis(payload, result, options);
  attachLinks(payload, options);
  return payload;
}

async function getFailureSummarySlimMessage(results, options) {
  const result = results[0];
  if (result.status === 'PASS') {
    return null;
  }
  const payload = getRootPayload();
  payload.text = getTitleText(result, options);
  payload.attachments.push(getMainSummary(result));
  await attachReportPortalAnalysis(payload, result, options);
  attachLinks(payload, options);
  return payload;
}

async function getFailureDetailsMessage(results, options) {
  const result = results[0];
  if (result.status === 'PASS') {
    return null;
  }
  const payload = getRootPayload();
  payload.text = getTitleText(result, options);
  const mainSummary = getMainSummary(result);
  payload.attachments.push(mainSummary);
  if (result.suites.length > 1) {
    for (let i = 0; i < result.suites.length; i++) {
      const suite = result.suites[i];
      const suiteSummary = getSuiteSummary(suite);
      if (suite.status === 'FAIL') {
        suiteSummary.fields = suiteSummary.fields.concat(getFailureDetailsFields(suite));
      }
      payload.attachments.push(suiteSummary);
    }
  } else {
    const suite = result.suites[0];
    mainSummary.fields = mainSummary.fields.concat(getFailureDetailsFields(suite));
  }
  await attachReportPortalAnalysis(payload, result, options);
  attachLinks(payload, options);
  return payload;
}

async function getFailureDetailsSlimMessage(results, options) {
  const result = results[0];
  if (result.status === 'PASS') {
    return null;
  }
  const payload = getRootPayload();
  payload.text = getTitleText(result, options);
  const mainSummary = getMainSummary(result);
  payload.attachments.push(mainSummary);
  if (result.suites.length > 1) {
    for (let i = 0; i < result.suites.length; i++) {
      const suite = result.suites[i];
      if (suite.status === 'FAIL') {
        const suiteSummary = getSuiteSummary(suite);
        suiteSummary.fields = suiteSummary.fields.concat(getFailureDetailsFields(suite));
        payload.attachments.push(suiteSummary);
      }
    }
  } else {
    const suite = result.suites[0];
    mainSummary.fields = mainSummary.fields.concat(getFailureDetailsFields(suite));
  }
  await attachReportPortalAnalysis(payload, result, options);
  attachLinks(payload, options);
  return payload;
}

function getMessage(options, results) {
  const report = getReportType(options);
  switch (report) {
    case 'test-summary':
      return getTestSummaryMessage(results, options);
    case 'failure-summary':
      return getFailureSummaryMessage(results, options);
    case 'test-summary-slim':
      return getTestSummarySlimMessage(results, options);
    case 'failure-summary-slim':
      return getFailureSummarySlimMessage(results, options);
    case 'failure-details':
      return getFailureDetailsMessage(results, options);
    case 'failure-details-slim':
      return getFailureDetailsSlimMessage(results, options);
    default:
      console.log('UnSupported Report Type');
      break;
  }
}

async function send(options, results) {
  const message = await getMessage(options, results);
  if (message) {
    return request.post({
      url: getUrl(options),
      body: message
    });
  }
}

module.exports = {
  send
}
