// Loads server/.env by its full path, because `npm start` runs from the project root while `npm run dev`
// runs from the server folder. (In Docker there is no .env file: docker-compose.yml sets the values.)

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(import.meta.dirname, '..', '.env'), quiet: true });
