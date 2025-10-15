import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import sql from 'mssql'
import { tokenizeSensitiveData, detokenizeSensitiveData } from './tokenization.js'

dotenv.config()

const port = Number(process.env.SERVER_PORT) || 5000
const app = express()
let pool = null

const CUSTOMER_SERVICE_USERNAME = process.env.CUSTOMER_SERVICE_USERNAME || 'CustomerService_1'
const CUSTOMER_SERVICE_PASSWORD = process.env.CUSTOMER_SERVICE_PASSWORD || 'Thales123!'

app.use(cors())
app.use(express.json())

const initMsSql = async () => {
  if (pool && pool.connected) return pool
  try {
    const config = {
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      server: process.env.DATABASE_ADDRESS,
      database: process.env.DATABASE_NAME,
      options: {
        port: Number(process.env.DATABASE_PORT) || 1433,
        encrypt: false,
        trustServerCertificate: true
      },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
    }

    pool = await sql.connect(config)
    console.log('MSSQL Connection Successful!')
    return pool
  } catch (err) {
    console.log('MSSQL Connection Failed', err)
  }
}

const normalizeIdCard = (value) => String(value ?? '').replace(/\D/g, '')

const isValidIdCard = (value) => normalizeIdCard(value).length === 13

const validateUser = (body) => {
  const errors = []
  const { Firstname, Lastname, Phone, Creditcard, IDcard } = body || {}
  if (!Firstname) errors.push('Firstname is required')
  if (!Lastname) errors.push('Lastname is required')
  if (!Phone) errors.push('Phone number is required')
  if (!Creditcard) errors.push('Creditcard number is required')
  if (!IDcard) errors.push('ID card number is required')
  if (IDcard && !isValidIdCard(IDcard)) {
    errors.push('ID card number must contain exactly 13 digits')
  }

  return errors
}

const parseBasicAuthHeader = (header = '') => {
  if (typeof header !== 'string') return null
  const value = header.trim()
  if (!value.toLowerCase().startsWith('basic ')) return null
  const base64Credentials = value.slice(6).trim()
  if (!base64Credentials) return null

  let decoded
  try {
    decoded = Buffer.from(base64Credentials, 'base64').toString('utf8')
  } catch {
    return null
  }

  const separatorIndex = decoded.indexOf(':')
  if (separatorIndex === -1) return null

  const username = decoded.slice(0, separatorIndex)
  const password = decoded.slice(separatorIndex + 1)
  return { username, password }
}

const requireCustomerServiceAuth = (req, res, next) => {
  const credentials = parseBasicAuthHeader(req.headers.authorization)
  if (
    !credentials ||
    credentials.username !== CUSTOMER_SERVICE_USERNAME ||
    credentials.password !== CUSTOMER_SERVICE_PASSWORD
  ) {
    res.setHeader('WWW-Authenticate', 'Basic realm="CustomerService"')
    return res.status(401).json({ message: 'Unauthorized' })
  }
  return next()
}

const fetchDetokenizedUsers = async (detokenizeOptions = {}) => {
  const db = await initMsSql()
  const response = await db.request().query('SELECT * FROM users')

  const detokenizedRecords = await Promise.all(
    response.recordset.map(async (record) => {
      try {
        const detokenized = await detokenizeSensitiveData({
          Firstname: record.Firstname,
          Lastname: record.Lastname,
          Phone: record.Phone,
          Creditcard: record.Creditcard,
          IDcard: record.IDcard
        }, detokenizeOptions)

        return {
          id: record.id,
          Firstname: detokenized.Firstname ?? record.Firstname,
          Lastname: detokenized.Lastname ?? record.Lastname,
          Phone: detokenized.Phone ?? record.Phone,
          Creditcard: detokenized.Creditcard ?? record.Creditcard,
          IDcard: detokenized.IDcard ?? record.IDcard
        }
      } catch (err) {
        console.error(`Detokenization failed for user ${record.id}:`, err)
        return {
          id: record.id,
          Firstname: record.Firstname,
          Lastname: record.Lastname,
          Phone: record.Phone,
          Creditcard: record.Creditcard,
          IDcard: record.IDcard,
          detokenizationError: err.message
        }
      }
    })
  )

  return detokenizedRecords
}

app.get('/api/healthcheck', async (req, res) => {
  try {
    const db = await initMsSql()
    const r = await db.request().query('SELECT 1 AS ok')
    return res.status(200).json({
      ServerStatus: 'Server online',
      DatabaseStatus: r.recordset?.[0]?.ok === 1 ? 'Database Connected' : 'Database Unhealthy'
    })
  } catch {
    return res.status(503).json({
      ServerStatus: 'Server online',
      DatabaseStatus: 'Database Disconnected'
    })
  }
})

app.post('/api/users', async (req, res) => {
  try {
    const { Firstname, Lastname, Phone, Creditcard, IDcard } = req.body
    const errors = validateUser(req.body)
    if (errors.length) {
      return res.status(400).json({ message: 'Verification failed', errors })
    }

    const normalizedIDcard = normalizeIdCard(IDcard)

    const tokenizedData = await tokenizeSensitiveData({
      Firstname,
      Lastname,
      Phone,
      Creditcard,
      IDcard: normalizedIDcard
    })

    const {
      Firstname: tokenizedFirstname,
      Lastname: tokenizedLastname,
      Phone: tokenizedPhone,
      Creditcard: tokenizedCreditcard,
      IDcard: tokenizedIDcard
    } = tokenizedData

    const db = await initMsSql()
    const result = await db
      .request()
      .input('Firstname', sql.NVarChar(50), tokenizedFirstname)
      .input('Lastname', sql.NVarChar(50), tokenizedLastname)
      .input('Phone', sql.VarChar(64), tokenizedPhone)
      .input('Creditcard', sql.VarChar(128), tokenizedCreditcard)
      .input('IDcard', sql.VarChar(128), tokenizedIDcard)
      .query(
        'INSERT INTO users (Firstname,Lastname,Phone,Creditcard,IDcard) VALUES (@Firstname,@Lastname,@Phone,@Creditcard,@IDcard); SELECT SCOPE_IDENTITY() AS id'
      )

    res.json({
      message: 'adding user successful',
      data: {
        id: result.recordset[0].id,
        Firstname: tokenizedFirstname,
        Lastname: tokenizedLastname,
        Phone: tokenizedPhone,
        Creditcard: tokenizedCreditcard,
        IDcard: tokenizedIDcard
      }
    })
  } catch (err) {
    console.error('Error adding user:', err)
    res.status(500).json({
      message: 'Cannot add user to server',
      error: err.message
    })
  }
})

app.get('/api/users', async (req,res) => {
    try{
    const db = await initMsSql()
    const response  = await db
                    .request()
                    .query('SELECT * FROM users')
    res.json({
        message: 'Get the users',
        result: response.recordset
    })
    }catch(err){
        console.error('cant fetch the data:', err)
        res.status(500).json({
            message:"cant fetch the data from the database",err
            
        })
  }

})

app.get('/api/users/detokenized', async (req, res) => {
  try {
    const detokenizedRecords = await fetchDetokenizedUsers()
    res.json({
      message: 'Get detokenized users',
      result: detokenizedRecords
    })
  } catch (err) {
    console.error('cant detokenize the data:', err)
    res.status(500).json({
      message: 'cant detokenize the data from the database',
      error: err.message
    })
  }
})

app.get('/api/customer-service/users/detokenized', requireCustomerServiceAuth, async (req, res) => {
  try {
    const detokenizedRecords = await fetchDetokenizedUsers({
      auth: {
        username: CUSTOMER_SERVICE_USERNAME,
        password: CUSTOMER_SERVICE_PASSWORD
      }
    })
    res.json({
      message: 'Get customer service detokenized users',
      result: detokenizedRecords
    })
  } catch (err) {
    console.error('cant detokenize the data for customer service:', err)
    res.status(500).json({
      message: 'cant detokenize the data from the database',
      error: err.message
    })
  }
})

app.use((req, res) => {
  res.status(404).json({
    message: 'Not found'
  })
})



app.listen(port, async () => {
  await initMsSql()
  console.log(`server running on port ${port}`)
})

process.on('SIGNIT', async () => {
  console.log('Server shutting down...')
  try {
    await pool?.close()
  } catch {}
  process.exit(0)
})
