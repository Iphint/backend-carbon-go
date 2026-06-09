import dotenv from "dotenv";

let loaded = false;

export function loadEnv() {
  if (loaded) return;

  const nodeEnv = process.env.NODE_ENV || "development";

  dotenv.config({ path: `.env.${nodeEnv}` });
  dotenv.config();

  loaded = true;
}
