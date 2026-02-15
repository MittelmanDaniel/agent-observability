/**
 * Load .env.local before any other project imports (so process.env is set
 * before lib/analyze etc. read it at module load time).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
