const buildBasicAuthHeader = (auth = {}) => {
  const username =
    typeof auth.username === 'string' && auth.username.trim()
      ? auth.username.trim()
      : process.env.TOKENIZE_API_USERNAME
  const password =
    typeof auth.password === 'string' && auth.password.trim()
      ? auth.password.trim()
      : process.env.TOKENIZE_API_PASSWORD

  if (!username || !password) {
    throw new Error('Tokenization requires TOKENIZE_API_USERNAME and TOKENIZE_API_PASSWORD to be set.')
  }

  const encodedCredentials = Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
  return `Basic ${encodedCredentials}`
}

const getEndpoint = () => {
  const url = process.env.TOKENIZE_API_URL
  if (!url) {
    throw new Error('Missing TOKENIZE_API_URL for tokenization endpoint.')
  }
  return url
}

const getDetokenizeEndpoint = () => {
  const explicitUrl = process.env.DETOKENIZE_API_URL?.trim()
  if (explicitUrl) {
    return explicitUrl
  }

  const tokenizeUrl = process.env.TOKENIZE_API_URL
  if (tokenizeUrl) {
    return tokenizeUrl.replace(/tokenize$/i, 'detokenize')
  }

  throw new Error('Missing DETOKENIZE_API_URL for detokenization endpoint.')
}

const getGroupAndTemplates = () => {
  const group = process.env.TOKENIZE_API_GROUP || 'Test'
  const cardTemplate = process.env.TOKENIZE_CREDITCARD_TEMPLATE || 'CreditCardTemplate'
  const nameTemplate = process.env.TOKENIZE_NAME_TEMPLATE || 'NameTemplate'

  return { group, cardTemplate, nameTemplate }
}

const ensureFetchAvailable = () => {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch API not available. Please run on Node.js 18+ or install a compatible fetch polyfill.')
  }
}

const configureTls = () => {
  if (process.env.TOKENIZE_ALLOW_INSECURE_TLS === 'true') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  }
}

const getRequestTimeout = () => {
  const timeout = Number(process.env.TOKENIZE_TIMEOUT_MS)
  if (Number.isFinite(timeout) && timeout > 0) {
    return timeout
  }
  return 10000
}

const hasValue = (value) => value != null && String(value).trim().length > 0

const serializeBraceDelimitedList = (fieldsWithValues) => {
  if (!Array.isArray(fieldsWithValues) || !fieldsWithValues.length) {
    return '{}'
  }

  const serializedValues = fieldsWithValues.map(([, value]) => JSON.stringify(String(value ?? '')))
  return `{${serializedValues.join(',')}}`
}

const safeJsonParse = (value) => {
  if (typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const parseBraceDelimitedList = (value) => {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null
  }

  const inner = trimmed.slice(1, -1).trim()
  if (!inner) {
    return []
  }

  const parts = inner.match(/"([^"\\]|\\.)*"|[^,]+/g) || []
  return parts.map((segment) => {
    const part = segment.trim()
    if (!part) return ''
    try {
      return JSON.parse(part)
    } catch {
      return part.replace(/^"|"$/g, '')
    }
  })
}

const valuesFromSource = (fields, source) => {
  if (source == null) return []

  if (typeof source === 'object' && !Array.isArray(source)) {
    return fields.map((field) => source[field])
  }

  const parsed = safeJsonParse(source)
  if (typeof parsed === 'object' && !Array.isArray(parsed)) {
    return fields.map((field) => parsed[field])
  }

  if (Array.isArray(parsed)) {
    return parsed
  }

  const braceList = parseBraceDelimitedList(source)
  if (braceList !== null) {
    return braceList
  }

  return [source]
}

const assignFieldsFromSources = (target, fields, ...sources) => {
  if (!Array.isArray(fields) || !fields.length) return

  const sourceArrays = sources.map((source) => valuesFromSource(fields, source))

  fields.forEach((field, index) => {
    for (const values of sourceArrays) {
      const value = values?.[index]
      if (hasValue(value)) {
        target[field] = value
        return
      }
    }
  })
}

const ensureBraceDelimitedValue = (field, value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed
    }
  }

  return serializeBraceDelimitedList([[field, value]])
}

const buildFieldDefinitions = ({ Firstname, Lastname, Phone, Creditcard, IDcard }, templates) => [
  { field: 'Firstname', value: Firstname, template: templates.nameTemplate },
  { field: 'Lastname', value: Lastname, template: templates.nameTemplate },
  { field: 'Phone', value: Phone, template: templates.cardTemplate },
  { field: 'Creditcard', value: Creditcard, template: templates.cardTemplate },
  { field: 'IDcard', value: IDcard, template: templates.cardTemplate }
]

const buildRequestPayload = ({ Firstname, Lastname, Phone, Creditcard, IDcard }) => {
  const { group, cardTemplate, nameTemplate } = getGroupAndTemplates()

  const dataEntries = []
  const meta = []

  buildFieldDefinitions({ Firstname, Lastname, Phone, Creditcard, IDcard }, { cardTemplate, nameTemplate }).forEach(
    ({ field, value, template }) => {
      if (!hasValue(value)) return

      dataEntries.push({
        tokengroup: group,
        tokentemplate: template,
        data: serializeBraceDelimitedList([[field, value]])
      })

      meta.push({
        fields: [field]
      })
    }
  )

  if (!dataEntries.length) {
    throw new Error('No data provided to tokenize.')
  }

  return { dataEntries, meta }
}

const buildDetokenizePayload = ({ Firstname, Lastname, Phone, Creditcard, IDcard }) => {
  const { group, cardTemplate, nameTemplate } = getGroupAndTemplates()

  const entries = []
  const meta = []

  buildFieldDefinitions({ Firstname, Lastname, Phone, Creditcard, IDcard }, { cardTemplate, nameTemplate }).forEach(
    ({ field, value, template }) => {
      if (!hasValue(value)) return

      entries.push({
        tokengroup: group,
        tokentemplate: template,
        token: ensureBraceDelimitedValue(field, value)
      })

      meta.push({
        fields: [field]
      })
    }
  )

  if (!entries.length) {
    throw new Error('No tokens provided to detokenize.')
  }

  return { entries, meta }
}

const parseTokenEntry = (entry) => {
  if (!entry || entry.status !== 'Succeed') {
    throw new Error(`Tokenization entry failed: ${JSON.stringify(entry)}`)
  }

  if (!entry.token) {
    throw new Error('Tokenization entry missing token payload.')
  }

  const braceList = parseBraceDelimitedList(entry.token)
  if (braceList !== null) {
    return braceList
  }

  const parsed = safeJsonParse(entry.token)

  if (Array.isArray(parsed) || (parsed && typeof parsed === 'object')) {
    return parsed
  }

  try {
    return JSON.parse(entry.token)
  } catch {
    return entry.token
  }
}

const parseDetokenizeEntry = (entry) => {
  if (!entry || entry.status !== 'Succeed') {
    throw new Error(`Detokenization entry failed: ${JSON.stringify(entry)}`)
  }

  const payload = entry.data ?? entry.value ?? entry.token ?? entry.result

  if (payload == null) {
    throw new Error('Detokenization entry missing data payload.')
  }

  if (typeof payload === 'object') {
    return payload
  }

  const braceList = parseBraceDelimitedList(payload)
  if (braceList !== null) {
    return braceList
  }

  const parsed = safeJsonParse(payload)
  if (Array.isArray(parsed) || (parsed && typeof parsed === 'object')) {
    return parsed
  }

  try {
    return JSON.parse(payload)
  } catch {
    return payload
  }
}

export const tokenizeSensitiveData = async (payload, options = {}) => {
  ensureFetchAvailable()
  configureTls()

  const url = getEndpoint()
  const headers = {
    'Content-Type': 'application/json',
    Authorization: buildBasicAuthHeader(options.auth)
  }

  const { dataEntries, meta } = buildRequestPayload(payload)
  const timeoutMs = getRequestTimeout()

  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(dataEntries),
      signal: controller.signal
    })
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`Tokenization API request timed out after ${timeoutMs}ms`)
    }
    throw new Error(`Tokenization API request failed: ${err.message || err}`)
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `Tokenization API failed with status ${response.status}: ${errorText || response.statusText}`
    )
  }

  const tokens = await response.json()
  if (!Array.isArray(tokens) || !tokens.length) {
    throw new Error('Tokenization API returned an unexpected payload.')
  }

  if (tokens.length !== meta.length) {
    throw new Error('Tokenization API response length does not match the request.')
  }

  const result = { ...payload }

  tokens.forEach((entry, index) => {
    const tokenValue = parseTokenEntry(entry)
    const metaEntry = meta[index]
    const fields = Array.isArray(metaEntry?.fields) ? metaEntry.fields : []
    assignFieldsFromSources(result, fields, tokenValue, entry.token)
  })

  return result
}

export const detokenizeSensitiveData = async (tokens, options = {}) => {
  ensureFetchAvailable()
  configureTls()

  const url = getDetokenizeEndpoint()
  const headers = {
    'Content-Type': 'application/json',
    Authorization: buildBasicAuthHeader(options.auth)
  }

  const { entries, meta } = buildDetokenizePayload(tokens)
  const timeoutMs = getRequestTimeout()

  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(entries),
      signal: controller.signal
    })
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`Detokenization API request timed out after ${timeoutMs}ms`)
    }
    throw new Error(`Detokenization API request failed: ${err.message || err}`)
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `Detokenization API failed with status ${response.status}: ${errorText || response.statusText}`
    )
  }

  const entriesResponse = await response.json()
  if (!Array.isArray(entriesResponse) || !entriesResponse.length) {
    throw new Error('Detokenization API returned an unexpected payload.')
  }

  if (entriesResponse.length !== meta.length) {
    throw new Error('Detokenization API response length does not match the request.')
  }

  const result = {}

  entriesResponse.forEach((entry, index) => {
    const metaEntry = meta[index]
    const parsedValue = parseDetokenizeEntry(entry)
    const fallbackMap =
      metaEntry && Array.isArray(metaEntry.fields)
        ? metaEntry.fields.reduce((acc, field) => {
            acc[field] = tokens?.[field]
            return acc
          }, {})
        : {}
    const fields = Array.isArray(metaEntry?.fields) ? metaEntry.fields : []
    assignFieldsFromSources(result, fields, parsedValue, fallbackMap, entry.data ?? entry.value ?? entry.token)
  })

  return result
}
