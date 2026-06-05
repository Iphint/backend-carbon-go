import jwt from "jsonwebtoken";

const isProduction = process.env.NODE_ENV === "production";

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role || "user" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

export function setAuthCookie(res, token) {
  res.cookie("carbon_go_token", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export function clearAuthCookie(res) {
  res.clearCookie("carbon_go_token", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax"
  });
}
