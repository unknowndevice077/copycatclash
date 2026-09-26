import { config } from '../config';
import { migrate, openDb } from '../db';

const db = openDb();
const applied = migrate(db);
db.close();
console.log(applied ? `Applied ${applied} migration(s) to ${config.databasePath}` : `Database already up to date (${config.databasePath})`);
