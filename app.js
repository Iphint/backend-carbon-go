import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { loadEnv } from "./config/loadEnv.js";
import authRoutes from "./routes/authRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import progressRoutes from "./routes/progressRoutes.js";
import rankingRoutes from "./routes/rankingRoutes.js";
import badgeRoutes from "./routes/badgeRoutes.js";
import milestoneRoutes from "./routes/milestoneRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

loadEnv();

const envOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

  // Config allowed origins for CORS, including localhost, private LAN IPs, and production domains
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://202.10.44.139:5173",
  "http://202.10.44.139:5174",
  "http://carbongo.site",
  "https://carbongo.site",
  "http://admin.carbongo.site",
  "https://admin.carbongo.site",
  process.env.FRONTEND_URL,
  process.env.DASHBOARD_URL,
  ...envOrigins,
].filter(Boolean));

function isPrivateLanHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "202.10.44.139" ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;

  try {
    const url = new URL(origin);
    if (url.hostname === "admin.carbongo.site") return true;
    const isDev = process.env.NODE_ENV !== "production";
    const isViteDevPort = Number(url.port) >= 5173 && Number(url.port) <= 5199;
    return isDev && isPrivateLanHost(url.hostname) && isViteDevPort;
  } catch {
    return false;
  }
}

const app = express();

app.use(helmet());
app.use(cors({
  origin: function (origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api", activityRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/rankings", rankingRoutes);
app.use("/api/badges", badgeRoutes);
app.use("/api/milestones", milestoneRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
