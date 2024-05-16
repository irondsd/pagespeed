const process = require('process')

/**
 * Fetches PageSpeed Insights data for a given URL using a specified strategy.
 * @param {string} url - The URL to test.
 * @param {string} strategy - The strategy to use for testing ('mobile' or 'desktop'). Defaults to 'mobile'.
 * @returns {Promise<object>} - A promise that resolves to the PageSpeed Insights data object.
 * @throws {Error} - If an error occurs during the fetch process.
 */
const runPagespeed = async (url, strategy = 'mobile') => {
  try {
    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed/?url=${url}&strategy=${strategy}&key=AIzaSyDhMi6I2IBKCm0kkLzmoo1Xb6tb92FpS6s`
    )

    const data = await res.json()
    return data
  } catch (error) {
    console.error(error)
  }
}

/**
 * Filters rules based on a specified group.
 * @param {array} rules - An array of rules objects.
 * @param {string} group - The group name to filter by.
 * @returns {array} - A new array containing only rules that belong to the specified group.
 */
const getRules = (rules, group) => rules.filter((rule) => rule.group === group)

/**
 * Extracts performance metrics data from a Lighthouse result object.
 * @param {object} lighthouseResult - The Lighthouse result object.
 * @returns {array} - An array of objects containing metric labels and values.
 */
const metrics = (lighthouseResult) => {
  const { audits, categories } = lighthouseResult
  const rules = getRules(categories.performance.auditRefs, 'metrics')

  const ret = rules.map((rule) => {
    const { title, displayValue } = audits[rule.id]
    return {
      label: title,
      value: displayValue.replace(/\s/g, ''),
    }
  })

  return ret
}

/**
 * Extracts and formats results from the PageSpeed Insights data.
 * @param {object} data - The PageSpeed Insights data object.
 * @returns {Array<{label: string; value: string | number}>} - An array of objects containing formatted results (including overall performance score and metrics).
 */
const getResults = (data) => {
  const lighthouseResult = data.lighthouseResult

  const results = metrics(lighthouseResult)
  results.unshift({
    label: 'Performance',
    value: Math.ceil(lighthouseResult.categories.performance.score * 100),
  })

  return results
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const arguments = process.argv.slice(2)
const options = {}

const defaults = {
  count: 1,
  strategy: 'mobile',
}

// Loop through arguments
for (let i = 0; i < arguments.length; i++) {
  const arg = arguments[i]

  // Check for flag
  if (arg.startsWith('-') && arg.length > 1) {
    const flag = arg.slice(1)
    const nextArg = arguments[i + 1]

    // Check for flag with value (e.g., --url=https://google.com)
    if (nextArg && !nextArg.startsWith('-')) {
      options[flag] = nextArg
      i++ // Skip next argument (value)
    } else {
      // Flag without value (e.g., -u)
      options[flag] = true
    }
  } else {
    // Handle positional arguments (if needed)
    // ... your logic here ...
  }
}

let runs = []
let runTimestamps = []

const url = options.url || options.u
const count = options.count || options.c || defaults.count
const strategy = options.strategy || options.s || defaults.strategy

if (strategy !== 'mobile' && strategy !== 'desktop') {
  console.error('Please provide a valid strategy: mobile or desktop.')
  process.exit(1)
}

if (!url) {
  console.error('Please provide a URL with --url or -u flag.')
  process.exit(1)
}

const run = async () => {
  process.stdout.write(`\rCollecting results: 0 of ${count}`)
  const startTime = performance.now()
  let skipped = 0
  while (runs.length < count) {
    const data = await runPagespeed(url, strategy)
    const endTime = performance.now()
    const execTime = (endTime - startTime) / 1000 // Convert to seconds

    if (!runTimestamps.includes(data.analysisUTCTimestamp)) {
      runTimestamps.push(data.analysisUTCTimestamp)
      const results = getResults(data)

      runs.push(results)

      process.stdout.write(`\rCollecting results: ${runs.length} of ${count}`)

      if (runs.length !== count) await sleep(1000)
    } else {
      skipped++
    }
  }

  const endTime = performance.now()
  const execTime = (endTime - startTime) / 1000 // Convert to seconds

  process.stdout.write(`\n${execTime.toFixed(1)}s | ${skipped} results skipped\n`)

  // get metric names
  const metrics = runs[0].map((run) => run.label)

  // Record<MetricName, string | undefined>
  const metricsSuffix = runs[0].reduce((acc, run) => {
    if (typeof run.value === 'number') acc[run.label] = undefined
    else if (run.value.endsWith('ms')) acc[run.label] = 'ms'
    else if (run.value.endsWith('s')) acc[run.label] = 's'

    return acc
  }, {})

  const data = runs.reduce((acc, run) => {
    run.forEach((metrics) => {
      if (acc[metrics.label] === undefined)
        acc[metrics.label] = { avg: undefined, min: undefined, max: undefined, list: [] }

      const value = parseFloat(typeof metrics.value === 'string' ? metrics.value.replace(',', '') : metrics.value)

      if (acc[metrics.label].min === undefined || value < acc[metrics.label].min) acc[metrics.label].min = value
      if (acc[metrics.label].max === undefined || value > acc[metrics.label].max) acc[metrics.label].max = value
      acc[metrics.label].list.push(value)
    })

    return acc
  }, {})

  Object.entries(data).forEach(([label, metric]) => {
    const suffix = metricsSuffix[label]
    metric.min = suffix ? metric.min.toLocaleString() + suffix : metric.min
    metric.max = suffix ? metric.max.toLocaleString() + suffix : metric.max
    metric.avg = Math.round((metric.list.reduce((acc, value) => acc + value, 0) / metric.list.length) * 100) / 100
    metric.avg = suffix ? metric.avg.toLocaleString() + suffix : metric.avg
    delete metric.list

    if (runs.length === 1) {
      delete metric.max
      delete metric.min
    }
  })

  console.log(data)
}

run()
