import bcrypt from "bcrypt";
import { User } from "../models/userModel.js";
import { Profile } from "../models/profileModel.js";
import { clearAuthCookie, setAuthCookie, signToken } from "../utils/auth.js";
import { syncUserAwards } from "../models/progressModel.js";

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

export async function register(req, res, next) {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email, and password are required" });
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

    const token = signToken(user);
    setAuthCookie(res, token);
    const profile = await Profile.findByUserId(user.id);
    if ((user.role || "user") !== "admin") {
      await syncUserAwards(user.id);
    }

    res.json({
      message: "Login success",
      user: cleanUser(user),
      onboardingComplete: Boolean(profile.length)
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

export function logout(req, res) {
  clearAuthCookie(res);
  res.json({ message: "Logout success" });
}
