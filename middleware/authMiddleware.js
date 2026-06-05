import jwt from "jsonwebtoken";
import { query } from "../config/db.js";

export async function requireAuth(req, res, next) {
  try {
    const bearerToken = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null;
    const token = req.cookies?.carbon_go_token || bearerToken;
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const users = await query(
      "SELECT id, username, email, role, created_at, updated_at FROM users WHERE id = :id",
      { id: payload.id }
    );

    if (!users.length) return res.status(401).json({ message: "Unauthorized" });
    req.user = users[0];
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}
