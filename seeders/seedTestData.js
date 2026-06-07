import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { pool, query } from "../config/db.js";
import { syncUserAwards } from "../models/progressModel.js";

dotenv.config();

const names = [
  "Alya Putri", "Bima Santoso", "Citra Lestari", "Dimas Pratama", "Eka Wibowo",
  "Fajar Ramadhan", "Gita Maharani", "Hana Salsabila", "Indra Saputra", "Jihan Aulia",
  "Kevin Wijaya", "Laras Permata", "Maya Kirana", "Nadia Fitri", "Oscar Mahendra",
  "Putri Amelia", "Qori Azizah", "Rafi Hidayat", "Salsa Nabila", "Tegar Nugraha",
  "Umaira Zahra", "Vino Ardian", "Wulan Pertiwi", "Yusuf Akbar", "Zahra Kamilah",
  "Ardi Kurnia", "Bella Anindya", "Chandra Surya", "Dewi Anggraini", "Elang Baskara"
];

const genders = ["female", "male"];
const notes = [
  "Daily school routine",
  "Weekend eco action",
  "Small change for today",
  "Trying to improve consistency",
  "Logged from test seed"
];

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPastDate(daysBack = 45) {
  const date = new Date();
  date.setDate(date.getDate() - randomInt(0, daysBack));
  date.setHours(randomInt(7, 21), randomInt(0, 59), randomInt(0, 59), 0);
  return date;
}

async function resetPreviousTestUsers() {
  await query("DELETE FROM users WHERE username LIKE 'testuser%'");
}

async function createUser(index, hashedPassword) {
  const username = `testuser${String(index).padStart(2, "0")}`;
  const email = `${username}@carbon-go.test`;

  const result = await query(
    `INSERT INTO users (username, email, password)
     VALUES (:username, :email, :password)`,
    { username, email, password: hashedPassword }
  );

  const userId = result.insertId;
  const fullName = names[index - 1];

  await query(
    `INSERT INTO user_profiles
     (user_id, full_name, address, gender, phone_number, bio)
     VALUES (:userId, :fullName, :address, :gender, :phoneNumber, :bio)`,
    {
      userId,
      fullName,
      address: `Jl. Hijau No. ${index}, Jakarta`,
      gender: genders[(index - 1) % genders.length],
      phoneNumber: `0812${String(70000000 + index).padStart(8, "0")}`,
      bio: "Seeded user for Carbon-Go testing."
    }
  );

  return userId;
}

async function seedActivityLogs(userId, activities, userIndex) {
  const logCount = randomInt(8, 25);

  for (let i = 0; i < logCount; i++) {
    const useOther = Math.random() < 0.08;
    const activity = randomItem(activities);
    const createdAt = randomPastDate();

    await query(
      `INSERT INTO user_activity_logs
       (user_id, activity_id, other_activity, carbon_value, note, created_at)
       VALUES (:userId, :activityId, :otherActivity, :carbonValue, :note, :createdAt)`,
      {
        userId,
        activityId: useOther ? null : activity.id,
        otherActivity: useOther ? randomItem(["Eco poster campaign", "Shared plant care", "Classroom cleanup"]) : null,
        carbonValue: useOther ? 0 : activity.carbon_value,
        note: randomItem(notes),
        createdAt
      }
    );
  }

  const positiveActivities = activities.filter((activity) => Number(activity.carbon_value) > 0);
  const bonusLogCount = userIndex <= 10 ? 30 : userIndex <= 20 ? 18 : 8;
  for (let i = 0; i < bonusLogCount; i++) {
    const activity = randomItem(positiveActivities);
    await query(
      `INSERT INTO user_activity_logs
       (user_id, activity_id, other_activity, carbon_value, note, created_at)
       VALUES (:userId, :activityId, NULL, :carbonValue, :note, :createdAt)`,
      {
        userId,
        activityId: activity.id,
        carbonValue: activity.carbon_value,
        note: "Guaranteed progress seed for admin monitoring",
        createdAt: randomPastDate()
      }
    );
  }

  await syncUserAwards(userId);
}

async function main() {
  const activities = await query("SELECT id, carbon_value FROM activities WHERE is_default = 1");
  if (!activities.length) {
    throw new Error("No default activities found. Run npm run seed first.");
  }

  await resetPreviousTestUsers();

  const hashedPassword = await bcrypt.hash("password123", 12);
  const userIds = [];

  for (let index = 1; index <= 30; index++) {
    const userId = await createUser(index, hashedPassword);
    userIds.push(userId);
  }

  for (const [index, userId] of userIds.entries()) {
    await seedActivityLogs(userId, activities, index + 1);
  }

  console.log("Seeded 30 test users with random activity logs.");
  console.log("Login examples: testuser01 / password123, testuser30 / password123");
}

try {
  await main();
} finally {
  await pool.end();
}
