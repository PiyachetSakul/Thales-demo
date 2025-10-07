import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import sql from 'mssql'
import { tokenizeSensitiveData } from './tokenization.js'

dotenv.config()

const port = Number(process.env.SERVER_PORT) || 5000
const app = express()
let pool = null

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

const validateUser = (body) => {
  const errors = []
  const { Firstname, Lastname, Phone, Creditcard } = body || {}
  if (!Firstname) errors.push('Firstname is required')
  if (!Lastname) errors.push('Lastname is required')
  if (!Phone) errors.push('Phone number is required')
  if (!Creditcard) errors.push('Creditcard number is required')

  return errors
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
    const { Firstname, Lastname, Phone, Creditcard } = req.body
    const errors = validateUser(req.body)
    if (errors.length) {
      return res.status(400).json({ message: 'Verification failed', errors })
    }

    const tokenizedData = await tokenizeSensitiveData({ Firstname, Lastname, Phone, Creditcard })

    const {
      Firstname: tokenizedFirstname,
      Lastname: tokenizedLastname,
      Phone: tokenizedPhone,
      Creditcard: tokenizedCreditcard
    } = tokenizedData

    const db = await initMsSql()
    const result = await db
      .request()
      .input('Firstname', sql.NVarChar(50), tokenizedFirstname)
      .input('Lastname', sql.NVarChar(50), tokenizedLastname)
      .input('Phone', sql.VarChar(64), tokenizedPhone)
      .input('Creditcard', sql.VarChar(128), tokenizedCreditcard)
      .query(
        'INSERT INTO users (Firstname,Lastname,Phone,Creditcard) VALUES (@Firstname,@Lastname,@Phone,@Creditcard); SELECT SCOPE_IDENTITY() AS id'
      )

    res.json({
      message: 'adding user successful',
      data: {
        id: result.recordset[0].id,
        Firstname: tokenizedFirstname,
        Lastname: tokenizedLastname,
        Phone: tokenizedPhone,
        Creditcard: tokenizedCreditcard
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
