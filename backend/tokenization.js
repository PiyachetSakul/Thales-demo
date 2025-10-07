const buildBasicAuthHeader = () => {
  const username = process.env.TOKENIZE_API_USERNAME
  const password = process.env.TOKENIZE_API_PASSWORD

  if (!username || !password) {
    throw new Error('Tokenization requires TOKENIZE_API_USERNAME and TOKENIZE_API_PASSWORD to be set.')
  }

  const credentials = Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
  return `Basic ${credentials}`
}

const getEndpoint = () => {
  const url = process.env.TOKENIZE_API_URL
  if (!url) {
    throw new Error('Missing TOKENIZE_API_URL for tokenization endpoint.')
  }
  return url
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

const buildRequestPayload = ({ Firstname, Lastname, Phone, Creditcard }) => {
  const { group, cardTemplate, nameTemplate } = getGroupAndTemplates()

  const dataEntries = []
  const meta = []

  if (Phone || Creditcard) {
    dataEntries.push({
      tokengroup: group,
      tokentemplate: cardTemplate,
      data: JSON.stringify({
        ...(Phone ? { Phone } : {}),
        ...(Creditcard ? { Creditcard } : {})
      })
    })
    meta.push('contact')
  }

  if (Firstname || Lastname) {
    dataEntries.push({
      tokengroup: group,
      tokentemplate: nameTemplate,
      data: JSON.stringify({
        ...(Firstname ? { Firstname } : {}),
        ...(Lastname ? { Lastname } : {})
      })
    })
    meta.push('name')
  }

  if (!dataEntries.length) {
    throw new Error('No data provided to tokenize.')
  }

  return { dataEntries, meta }
}

const parseTokenEntry = (entry) => {
  if (!entry || entry.status !== 'Succeed') {
    throw new Error(`Tokenization entry failed: ${JSON.stringify(entry)}`)
  }

  if (!entry.token) {
    throw new Error('Tokenization entry missing token payload.')
  }

  try {
    return JSON.parse(entry.token)
  } catch (err) {
    throw new Error(`Unable to parse token payload: ${err.message}`)
  }
}

const extractNameTokens = (tokenObj, rawToken) => {
  if (!tokenObj || typeof tokenObj !== 'object') {
    return {
      Firstname: rawToken,
      Lastname: rawToken
    }
  }

  const first = tokenObj.Firstname ?? tokenObj.firstname ?? tokenObj.firstName
  const last = tokenObj.Lastname ?? tokenObj.lastname ?? tokenObj.lastName

  if (first || last) {
    return {
      Firstname: first || last || rawToken,
      Lastname: last || first || rawToken
    }
  }

  const values = Object.values(tokenObj)
  if (!values.length) {
    return {
      Firstname: rawToken,
      Lastname: rawToken
    }
  }

  return {
    Firstname: values[0],
    Lastname: values[1] ?? values[0]
  }
}

const extractContactTokens = (tokenObj, rawToken) => {
  if (!tokenObj || typeof tokenObj !== 'object') {
    return {
      Phone: rawToken,
      Creditcard: rawToken
    }
  }

  return {
    Phone: tokenObj.Phone ?? tokenObj.phone ?? rawToken,
    Creditcard: tokenObj.Creditcard ?? tokenObj.creditcard ?? rawToken
  }
}

export const tokenizeSensitiveData = async (payload) => {
  ensureFetchAvailable()
  configureTls()

  const url = getEndpoint()
  const headers = {
    'Content-Type': 'application/json',
    Authorization: buildBasicAuthHeader()
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
    const tokenObj = parseTokenEntry(entry)
    const rawToken = entry.token
    const dataType = meta[index]

    if (dataType === 'contact') {
      const { Phone, Creditcard } = extractContactTokens(tokenObj, rawToken)
      if (Phone) result.Phone = Phone
      if (Creditcard) result.Creditcard = Creditcard
      return
    }

    if (dataType === 'name') {
      const { Firstname, Lastname } = extractNameTokens(tokenObj, rawToken)
      if (Firstname) result.Firstname = Firstname
      if (Lastname) result.Lastname = Lastname
    }
  })

  return result
}
