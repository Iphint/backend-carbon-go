import bcrypt from "bcrypt";
import crypto from "crypto";
import { User } from "../models/userModel.js";
import { Profile } from "../models/profileModel.js";
import { clearAdminAuthCookie, clearAuthCookie, setAdminAuthCookie, setAuthCookie, signAdminToken, signToken } from "../utils/auth.js";
import { syncUserAwards } from "../models/progressModel.js";
import { query } from "../config/db.js";
import { sendPasswordResetEmail } from "../utils/email.js";

function cleanUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role || "user",
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

export async function register(req, res, next) {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email, and password are required" });
    }

    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).json({ message: "Username can only contain letters, numbers, and underscore (_)" });
    }

    const [byUsername, byEmail] = await Promise.all([
      User.findByUsername(username),
      User.findByEmail(email)
    ]);
    if (byUsername.length || byEmail.length) {
      return res.status(409).json({ message: "Username or email already exists" });
    }

    const hashed = await bcrypt.hash(password, 12);
    const userId = await User.create({ username, email, password: hashed });
    res.status(201).json({ message: "Register success. Please login.", userId });
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    const users = await User.findByUsername(username);
    const user = users[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const mainToken = signToken(user);
    const isAdmin = (user.role || "user") === "admin";
    const token = isAdmin ? signAdminToken(user) : mainToken;
    setAuthCookie(res, mainToken);
    if (isAdmin) {
      setAdminAuthCookie(res, token);
    }
    const profile = await Profile.findByUserId(user.id);
    if (!isAdmin) {
      await syncUserAwards(user.id);
    }

    res.json({
      message: "Login success",
      token,
      user: cleanUser(user),
      onboardingComplete: Boolean(profile.length)
    });
  } catch (error) {
    next(error);
  }
}

export async function adminLogin(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    const users = await User.findByUsername(username);
    const user = users[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid username or password" });
    }
    if ((user.role || "user") !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const token = signAdminToken(user);
    setAdminAuthCookie(res, token);

    res.json({
      message: "Admin login success",
      token,
      user: cleanUser(user),
      onboardingComplete: true
    });
  } catch (error) {
    next(error);
  }
}

export async function me(req, res, next) {
  try {
    const profile = await Profile.findByUserId(req.user.id);
    res.json({
      user: req.user,
      profile: profile[0] || null,
      onboardingComplete: Boolean(profile.length)
    });
  } catch (error) {
    next(error);
  }
}

export function adminMe(req, res) {
  res.json({
    user: req.user,
    onboardingComplete: true
  });
}

export async function forgotPassword(req, res, next) {
  try {
    const { username, email } = req.body;
    if (!username || !email) {
      return res.status(400).json({ message: "Username and email are required" });
    }

    const users = await query(
      "SELECT id, username, email FROM users WHERE username = :username AND email = :email",
      { username, email }
    );
    if (!users.length) {
      return res.status(404).json({ message: "Username and email do not match" });
    }

    const user = users[0];
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await query(
      `INSERT INTO password_reset_codes (user_id, email, code, expires_at)
       VALUES (:userId, :email, :code, :expiresAt)`,
      { userId: user.id, email: user.email, code, expiresAt }
    );

    await sendPasswordResetEmail(user.email, user.username, code);

    res.json({ message: "Reset code sent to your email" });
  } catch (error) {
    next(error);
  }
}

export async function verifyResetCode(req, res, next) {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ message: "Email and code are required" });
    }

    const rows = await query(
      `SELECT id, user_id, email, code, expires_at, used
       FROM password_reset_codes
       WHERE email = :email AND code = :code AND used = 0 AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      { email, code }
    );

    if (!rows.length) {
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    res.json({ message: "Code verified", userId: rows[0].user_id });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: "Email, code, and new password are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const rows = await query(
      `SELECT id, user_id, email, code, expires_at, used
       FROM password_reset_codes
       WHERE email = :email AND code = :code AND used = 0 AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      { email, code }
    );

    if (!rows.length) {
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await query("UPDATE users SET password = :password WHERE id = :id", {
      password: hashed,
      id: rows[0].user_id,
    });

    await query("UPDATE password_reset_codes SET used = 1 WHERE id = :id", {
      id: rows[0].id,
    });

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    next(error);
  }
}

export function logout(req, res) {
  clearAuthCookie(res);
  res.json({ message: "Logout success" });
}

export function adminLogout(req, res) {
  clearAdminAuthCookie(res);
  res.json({ message: "Admin logout success" });
}
