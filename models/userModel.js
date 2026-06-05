import { query } from "../config/db.js";

export const User = {
  findByUsername(username) {
    return query("SELECT * FROM users WHERE username = :username", { username });
  },
  findByEmail(email) {
    return query("SELECT * FROM users WHERE email = :email", { email });
  },
  async create({ username, email, password }) {
    const result = await query(
      "INSERT INTO users (username, email, password) VALUES (:username, :email, :password)",
      { username, email, password }
    );
    return result.insertId;
  },
  findPublicById(id) {
    return query("SELECT id, username, email, created_at, updated_at FROM users WHERE id = :id", { id });
  }
};
