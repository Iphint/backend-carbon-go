import { query } from "../config/db.js";

const defaultQuests = [
  { slug: "first-green-step", icon: "🌱", name: "🌱 First Green Step", description: "Log your first eco-action", requirement_value: 50, reward: 25 },
  { slug: "energy-saver", icon: "💡", name: "💡 Energy Saver", description: "Save energy by turning off unused devices", requirement_value: 150, reward: 25 },
  { slug: "plastic-free", icon: "♻️", name: "♻️ Plastic Free", description: "Avoid single-use plastics consistently", requirement_value: 300, reward: 25 },
  { slug: "tree-guardian", icon: "🌳", name: "🌳 Tree Guardian", description: "Support reforestation efforts", requirement_value: 500, reward: 25 }
];

export async function getTotalCarbon(userId) {
  const rows = await query(
    "SELECT COALESCE(SUM(carbon_value), 0) AS total FROM user_activity_logs WHERE user_id = :userId",
    { userId }
  );
  return Number(rows[0]?.total || 0);
}

export async function getEcoPoints(userId) {
  const rows = await query(
    "SELECT COALESCE(SUM(GREATEST(carbon_value, 0)), 0) AS total FROM user_activity_logs WHERE user_id = :userId",
    { userId }
  );
  return Number(rows[0]?.total || 0);
}

export async function getTodayCarbon(userId) {
  const rows = await query(
    `SELECT COALESCE(SUM(carbon_value), 0) AS total
     FROM user_activity_logs
     WHERE user_id = :userId
       AND DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00'))`,
    { userId }
  );
  return Number(rows[0]?.total || 0);
}

export async function getJourneyPoints(userId) {
  const totalCarbon = await getTotalCarbon(userId);
  const quests = await getQuestCatalog(totalCarbon);
  return quests.reduce((sum, quest) => (
    quest.is_completed ? sum + quest.reward : sum
  ), 0);
}

export async function ensureQuestCatalog() {
  await query(
    `CREATE TABLE IF NOT EXISTS quests (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(120) NOT NULL UNIQUE,
      icon VARCHAR(80) NOT NULL DEFAULT '🌱',
      name VARCHAR(160) NOT NULL,
      description TEXT NOT NULL,
      requirement_value INT NOT NULL DEFAULT 0,
      reward INT NOT NULL DEFAULT 25,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`
  );

  const rows = await query("SELECT COUNT(*) AS total FROM quests");
  if (Number(rows[0]?.total || 0) > 0) return;

  for (const quest of defaultQuests) {
    await query(
      `INSERT INTO quests (slug, icon, name, description, requirement_value, reward, is_active)
       VALUES (:slug, :icon, :name, :description, :requirementValue, :reward, 1)
       ON DUPLICATE KEY UPDATE
         icon = VALUES(icon),
         name = VALUES(name),
         description = VALUES(description),
         requirement_value = VALUES(requirement_value),
         reward = VALUES(reward),
         is_active = VALUES(is_active)`,
      {
        slug: quest.slug,
        icon: quest.icon,
        name: quest.name,
        description: quest.description,
        requirementValue: quest.requirement_value,
        reward: quest.reward
      }
    );
  }
}

export async function getQuestCatalog(totalCarbon = 0) {
  await ensureQuestCatalog();
  const quests = await query(
    `SELECT id, slug, icon, name, description, requirement_value, reward, is_active, created_at, updated_at
     FROM quests
     WHERE is_active = 1
     ORDER BY requirement_value, id`
  );

  return quests.map((quest) => ({
    ...quest,
    id: quest.id,
    slug: quest.slug,
    progress_value: totalCarbon,
    is_completed: totalCarbon >= quest.requirement_value
  }));
}

const rankOrder = ["Guest", "Explorer", "Guardian", "Hero"];

export function rankFromCounts({ questCount, badgeCount, milestoneCount }) {
  const completedSets = Math.min(Number(questCount), Number(badgeCount), Number(milestoneCount), 3);
  return rankOrder[completedSets] || "Guest";
}

export async function ensureRankAchievementTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS user_rank_achievements (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      rank_name VARCHAR(40) NOT NULL,
      earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_rank (user_id, rank_name),
      CONSTRAINT fk_user_rank_achievements_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )`
  );
}

export async function syncRankAchievements(userId, currentRank) {
  await ensureRankAchievementTable();
  const targetIndex = rankOrder.indexOf(currentRank);
  const earnedRanks = rankOrder.slice(0, Math.max(targetIndex, 0) + 1);

  for (const rankName of earnedRanks) {
    await query(
      `INSERT IGNORE INTO user_rank_achievements (user_id, rank_name)
       VALUES (:userId, :rankName)`,
      { userId, rankName }
    );
  }

  return query(
    `SELECT id, rank_name, earned_at
     FROM user_rank_achievements
     WHERE user_id = :userId
     ORDER BY earned_at ASC, id ASC`,
    { userId }
  );
}

export async function syncUserAwards(userId) {
  const totalCarbon = await getTotalCarbon(userId);
  const ecoPoints = await getEcoPoints(userId);
  const todayCarbon = await getTodayCarbon(userId);
  const journeyPoints = await getJourneyPoints(userId);

  await query(
    `INSERT IGNORE INTO user_badges (user_id, badge_id)
     SELECT :userId, id FROM badges
     WHERE requirement_type IN ('carbon_points', 'carbon_total', 'eco_points') AND requirement_value <= :totalCarbon`,
    { userId, totalCarbon }
  );

  const milestones = await query("SELECT * FROM milestones ORDER BY target_value", {});
  for (const milestone of milestones) {
    const completed = journeyPoints >= Number(milestone.target_value);
    await query(
      `INSERT INTO user_milestones
       (user_id, milestone_id, progress_value, is_completed, completed_at)
       VALUES (:userId, :milestoneId, :progressValue, :isCompleted, :completedAt)
       ON DUPLICATE KEY UPDATE
         progress_value = VALUES(progress_value),
         is_completed = VALUES(is_completed),
         completed_at = IF(completed_at IS NULL AND VALUES(is_completed) = 1, VALUES(completed_at), completed_at)`,
      {
        userId,
        milestoneId: milestone.id,
        progressValue: journeyPoints,
        isCompleted: completed ? 1 : 0,
        completedAt: completed ? new Date() : null
      }
    );
  }

  const quests = await getQuestCatalog(totalCarbon);
  const questCount = quests.filter((quest) => quest.is_completed).length;
  const badgeRows = await query("SELECT COUNT(*) AS total FROM user_badges WHERE user_id = :userId", { userId });
  const milestoneRows = await query(
    "SELECT COUNT(*) AS total FROM user_milestones WHERE user_id = :userId AND is_completed = 1",
    { userId }
  );

  const rankCounts = {
    questCount,
    badgeCount: Number(badgeRows[0]?.total || 0),
    milestoneCount: Number(milestoneRows[0]?.total || 0)
  };
  const currentRank = rankFromCounts(rankCounts);
  const rankAchievements = await syncRankAchievements(userId, currentRank);

  return { totalCarbon, ecoPoints, todayCarbon, journeyPoints, quests, rankCounts, currentRank, rankAchievements };
}
