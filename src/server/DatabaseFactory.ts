import { IDatabaseService } from './interfaces/IDatabaseService'
import { SQLiteDatabaseService } from './SQLiteDatabaseService'
import { MySQLDatabaseService } from './MySQLDatabaseService'
import { createLogger } from './logger'

const logger = createLogger('database-factory')

export enum DatabaseType {
  SQLITE = 'sqlite',
  MYSQL = 'mysql'
}

export class DatabaseFactory {
  static createDatabase(): IDatabaseService {
    const dbType = process.env.DATABASE_TYPE as DatabaseType || DatabaseType.SQLITE

    logger.info('Creating database service', { type: dbType })

    switch (dbType) {
      case DatabaseType.MYSQL:
        logger.info('Initializing MySQL database service')
        return new MySQLDatabaseService()
      
      case DatabaseType.SQLITE:
      default:
        logger.info('Initializing SQLite database service')
        return new SQLiteDatabaseService()
    }
  }
}
