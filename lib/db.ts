import { neon } from "@neondatabase/serverless";

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Create a Neon/Vercel Postgres database and add the connection string to .env.local"
    );
  }
  return neon(url);
}
