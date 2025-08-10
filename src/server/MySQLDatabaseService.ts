import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { Site, User, SITE_TYPES } from '../types'
import { createLogger } from './logger'
import { IDatabaseService } from './interfaces/IDatabaseService'

const logger = createLogger('mysql-database')

export class MySQLDatabaseService implements IDatabaseService {
  private pool: mysql.Pool
  private isInitialized = false

  constructor() {
    // Use mysql2/promise for native async support
    const mysqlConfig = {
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'one_api_hub',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    }

    this.pool = mysql.createPool(mysqlConfig)

    logger.info('MySQL connection pool created', {
      host: mysqlConfig.host,
      port: mysqlConfig.port,
      database: mysqlConfig.database
    })

    // Initialize asynchronously (non-blocking)
    this.initDatabase().catch(error => {
      logger.error('Failed to initialize database', { error: error.message })
    })
  }

  private async initDatabase() {
    if (this.isInitialized) return
    
    try {
      await this.initTables()
      await this.createDefaultUser()
      this.isInitialized = true
      logger.info('MySQL database initialization complete')
    } catch (error) {
      logger.error('Failed to initialize MySQL database', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  private async initTables() {
    logger.info('Initializing MySQL database tables')

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `)

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS sites (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        access_token TEXT NOT NULL,
        url VARCHAR(1000) NOT NULL,
        description TEXT,
        user_id VARCHAR(255) NOT NULL,
        type VARCHAR(100) DEFAULT '${SITE_TYPES.NEW_API}',
        username VARCHAR(255),
        used_quota BIGINT,
        quota BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `)

    logger.info('MySQL tables initialization complete')
  }

  private async createDefaultUser() {
    const adminUsername = 'admin'
    
    try {
      const [rows] = await this.pool.execute(
        'SELECT id FROM users WHERE username = ?',
        [adminUsername]
      ) as mysql.RowDataPacket[][]

      if (rows.length === 0) {
        logger.info('Creating default admin user')
        const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || 'admin123456'
        const passwordHash = await bcrypt.hash(initialPassword, 10)
        
        await this.pool.execute(
          'INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)',
          [adminUsername, adminUsername, passwordHash]
        )
        logger.info('Default admin user created successfully')
      } else {
        logger.debug('Default admin user already exists')
      }
    } catch (error) {
      logger.error('Error creating default user', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  async getUser(username: string): Promise<User | null> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT id, username, password_hash as passwordHash, created_at as createdAt, updated_at as updatedAt FROM users WHERE username = ?',
        [username]
      ) as mysql.RowDataPacket[][]

      if (rows.length === 0) return null
      
      const row = rows[0]
      return {
        id: row.id,
        username: row.username,
        passwordHash: row.passwordHash,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
      }
    } catch (error) {
      logger.error('Error getting user', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
      return null
    }
  }

  async verifyPassword(username: string, password: string): Promise<boolean> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT password_hash FROM users WHERE username = ?',
        [username]
      ) as mysql.RowDataPacket[][]

      if (rows.length === 0) return false
      
      return await bcrypt.compare(password, rows[0].password_hash)
    } catch (error) {
      logger.error('Error verifying password', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }

  async updatePassword(username: string, newPassword: string): Promise<boolean> {
    try {
      const passwordHash = await bcrypt.hash(newPassword, 10)
      const [result] = await this.pool.execute(
        'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE username = ?',
        [passwordHash, username]
      ) as mysql.ResultSetHeader[]

      logger.info('Password updated successfully', {
        username,
        affectedRows: result.affectedRows
      })

      return result.affectedRows > 0
    } catch (error) {
      logger.error('Failed to update password', {
        username,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }

  async getAllSites(): Promise<Site[]> {
    try {
      const [rows] = await this.pool.execute(`
        SELECT id, name, access_token as accessToken, url, description, 
               user_id as userId, type, username, used_quota as usedQuota, 
               quota, created_at as createdAt, updated_at as updatedAt
        FROM sites ORDER BY created_at DESC
      `) as mysql.RowDataPacket[][]

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        accessToken: row.accessToken,
        url: row.url,
        description: row.description,
        userId: row.userId,
        type: row.type,
        username: row.username,
        usedQuota: row.usedQuota,
        quota: row.quota,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
      }))
    } catch (error) {
      logger.error('Error getting all sites', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return []
    }
  }

  async getSite(id: string): Promise<Site | null> {
    try {
      const [rows] = await this.pool.execute(`
        SELECT id, name, access_token as accessToken, url, description, 
               user_id as userId, type, username, used_quota as usedQuota, 
               quota, created_at as createdAt, updated_at as updatedAt
        FROM sites WHERE id = ?
      `, [id]) as mysql.RowDataPacket[][]

      if (rows.length === 0) return null
      
      const row = rows[0]
      return {
        id: row.id,
        name: row.name,
        accessToken: row.accessToken,
        url: row.url,
        description: row.description,
        userId: row.userId,
        type: row.type,
        username: row.username,
        usedQuota: row.usedQuota,
        quota: row.quota,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
      }
    } catch (error) {
      logger.error('Error getting site', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return null
    }
  }

  async addSite(site: Omit<Site, 'id' | 'createdAt' | 'updatedAt'>): Promise<Site> {
    const id = crypto.randomUUID()
    const now = new Date()

    logger.info('Adding new site to MySQL database', {
      siteName: site.name,
      siteType: site.type
    })

    try {
      await this.pool.execute(`
        INSERT INTO sites (id, name, access_token, url, description, user_id, 
                          type, username, used_quota, quota, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [
        id,
        site.name,
        site.accessToken,
        site.url,
        site.description || '',
        site.userId,
        site.type || SITE_TYPES.NEW_API,
        site.username || null,
        site.usedQuota || null,
        site.quota || null
      ])
      
      logger.info('Site added to MySQL database successfully', {
        siteId: id,
        siteName: site.name
      })
    } catch (error) {
      logger.error('Error adding site', { error: error instanceof Error ? error.message : 'Unknown error' })
      throw error
    }

    return {
      ...site,
      id,
      type: site.type || SITE_TYPES.NEW_API,
      description: site.description || '',
      createdAt: now,
      updatedAt: now
    }
  }

  async updateSite(
    id: string,
    updates: Partial<Pick<Site, 'name' | 'accessToken' | 'url' | 'description' | 'userId' | 'type' | 'username' | 'usedQuota' | 'quota'>>
  ): Promise<void> {
    logger.debug('Updating site in MySQL', {
      siteId: id,
      updateFields: Object.keys(updates)
    })

    const setParts: string[] = []
    const values: unknown[] = []

    if (updates.name !== undefined) {
      setParts.push('name = ?')
      values.push(updates.name)
    }
    if (updates.accessToken !== undefined) {
      setParts.push('access_token = ?')
      values.push(updates.accessToken)
    }
    if (updates.url !== undefined) {
      setParts.push('url = ?')
      values.push(updates.url)
    }
    if (updates.description !== undefined) {
      setParts.push('description = ?')
      values.push(updates.description)
    }
    if (updates.userId !== undefined) {
      setParts.push('user_id = ?')
      values.push(updates.userId)
    }
    if (updates.type !== undefined) {
      setParts.push('type = ?')
      values.push(updates.type)
    }
    if (updates.username !== undefined) {
      setParts.push('username = ?')
      values.push(updates.username)
    }
    if (updates.usedQuota !== undefined) {
      setParts.push('used_quota = ?')
      values.push(updates.usedQuota)
    }
    if (updates.quota !== undefined) {
      setParts.push('quota = ?')
      values.push(updates.quota)
    }

    if (setParts.length === 0) {
      logger.debug('No updates to apply for site', { siteId: id })
      return
    }

    setParts.push('updated_at = NOW()')
    values.push(id)

    try {
      await this.pool.execute(
        `UPDATE sites SET ${setParts.join(', ')} WHERE id = ?`,
        values
      )
      
      logger.debug('Site updated successfully in MySQL', {
        siteId: id,
        updatedFields: setParts.length - 1
      })
    } catch (error) {
      logger.error('Error updating site', { error: error instanceof Error ? error.message : 'Unknown error' })
      throw error
    }
  }

  async deleteSite(id: string): Promise<void> {
    logger.info('Deleting site from MySQL database', { siteId: id })
    
    try {
      await this.pool.execute('DELETE FROM sites WHERE id = ?', [id])
      logger.info('Site deleted successfully from MySQL', { siteId: id })
    } catch (error) {
      logger.error('Error deleting site', { error: error instanceof Error ? error.message : 'Unknown error' })
      throw error
    }
  }

  close(): void {
    logger.info('Closing MySQL connection pool')
    this.pool.end()
  }
}
