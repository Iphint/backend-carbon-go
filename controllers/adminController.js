import { query } from "../config/db.js";
import { ensureDailySurveyTable, jakartaDate, nextJakartaSurveyReset, surveyWindow } from "../models/dailySurveyModel.js";
import { getQuestCatalog, syncUserAwards } from "../models/progressModel.js";

const PAGE_SIZE = 20;
const ADMIN_RANK_TYPES = ["Guest", "Explorer", "Guardian", "Hero"];

function pageInfo(req) {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || PAGE_SIZE)));
  return { page, limit, offset: (page - 1) * limit };
}

function totalPages(total, limit) {
  return Math.max(1, Math.ceil(Number(total || 0) / limit));
}

function dateRange(filter) {
  if (filter === "today") return "DATE(l.created_at) = CURDATE()";
  if (filter === "7days") return "l.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
  if (filter === "30days") return "l.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
  return "1 = 1";
}

function rankFromCounts({ questCount, badgeCount, milestoneCount }) {
  return ADMIN_RANK_TYPES[Math.min(Number(questCount), Number(badgeCount), Number(milestoneCount), 3)] || "Guest";
}

async function ensureRankTypesTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS rank_types (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(40) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`
  );

  for (const rankName of ADMIN_RANK_TYPES) {
    await query("INSERT IGNORE INTO rank_types (name) VALUES (:rankName)", { rankName });
  }
}

async function userAwardCounts(userId, totalCarbon) {
  const quests = await getQuestCatalog(totalCarbon);
  const [badgeRows, milestoneRows] = await Promise.all([
    query("SELECT COUNT(*) AS total FROM user_badges WHERE user_id = :userId", { userId }),
    query("SELECT COUNT(*) AS total FROM user_milestones WHERE user_id = :userId AND is_completed = 1", { userId })
  ]);
  const counts = {
    questCount: quests.filter((quest) => quest.is_completed).length,
    badgeCount: Number(badgeRows[0]?.total || 0),
    milestoneCount: Number(milestoneRows[0]?.total || 0)
  };
  return { counts, rank: rankFromCounts(counts) };
}

async function baseUserRows() {
  return query(
    `SELECT u.id, u.username, u.email, u.role, u.created_at, u.updated_at,
            p.id AS profile_id, p.full_name, p.address, p.gender, p.phone_number, p.bio, p.photo,
            COALESCE(SUM(l.carbon_value), 0) AS total_unit,
            COUNT(l.id) AS total_activity,
            SUM(CASE WHEN l.carbon_value > 0 THEN 1 ELSE 0 END) AS good_actions,
            SUM(CASE WHEN l.carbon_value < 0 THEN 1 ELSE 0 END) AS bad_actions,
            SUM(CASE WHEN l.activity_id IS NULL THEN 1 ELSE 0 END) AS total_custom_green_actions,
            MAX(l.created_at) AS last_daily_survey
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     LEFT JOIN user_activity_logs l ON l.user_id = u.id
     GROUP BY u.id, p.id
     ORDER BY u.created_at DESC`
  );
}

async function enrichUsers(rows) {
  const leaderboard = [...rows]
    .filter((user) => user.role !== "admin")
    .sort((a, b) => Number(b.total_unit) - Number(a.total_unit));
  const positions = new Map(leaderboard.map((user, index) => [Number(user.id), index + 1]));

  return Promise.all(rows.map(async (user) => {
    const totalUnit = Number(user.total_unit || 0);
    const { counts, rank } = await userAwardCounts(user.id, totalUnit);
    const totalActivity = Number(user.total_activity || 0);
    const goodActions = Number(user.good_actions || 0);
    return {
      ...user,
      total_unit: totalUnit,
      total_activity: totalActivity,
      good_actions: goodActions,
      bad_actions: Number(user.bad_actions || 0),
      total_custom_green_actions: Number(user.total_custom_green_actions || 0),
      eco_ratio: totalActivity ? Number(((goodActions / totalActivity) * 100).toFixed(1)) : 0,
      onboarding_complete: Boolean(user.profile_id),
      onboarding_completed_at: user.profile_id ? user.created_at : null,
      onboarding_last_step: user.profile_id ? "profile" : null,
      guidebook_viewed: Boolean(user.profile_id),
      total_quests_completed: counts.questCount,
      total_badges_earned: counts.badgeCount,
      total_milestones_completed: counts.milestoneCount,
      current_rank: rank,
      leaderboard_rank: positions.get(Number(user.id)) || null,
      leaderboard_position: positions.get(Number(user.id)) || null,
      joined_at: user.created_at,
      eco_score: totalUnit,
      total_score: totalUnit
    };
  }));
}

function filterLogsClause(req, userId = null) {
  const filters = ["1 = 1"];
  const params = {};
  if (userId) {
    filters.push("l.user_id = :userId");
    params.userId = userId;
  }
  if (req.query.filter === "good") filters.push("l.carbon_value > 0");
  if (req.query.filter === "bad") filters.push("l.carbon_value < 0");
  if (req.query.filter === "custom") filters.push("l.activity_id IS NULL");
  if (req.query.filter === "neutral") filters.push("l.activity_id IS NOT NULL AND l.carbon_value = 0");
  if (req.query.filter === "default") filters.push("l.activity_id IS NOT NULL AND l.carbon_value <> 0");
  if (req.query.date) {
    filters.push("DATE(l.created_at) = :date");
    params.date = req.query.date;
  }
  return { where: filters.join(" AND "), params };
}

async function getLogs(req, userId = null) {
  const { page, limit, offset } = pageInfo(req);
  const { where, params } = filterLogsClause(req, userId);
  const lang = String(req.query.lang || req.headers["x-language"] || "id").toLowerCase();
  const activityNameColumn = lang === "en" ? "a.name_en" : "a.name_id";
  const countRows = await query(`SELECT COUNT(*) AS total FROM user_activity_logs l WHERE ${where}`, params);
  const logs = await query(
    `SELECT l.id, l.user_id, u.username, l.created_at AS date,
            COALESCE(NULLIF(${activityNameColumn}, ''), a.name, l.other_activity, 'Other') AS name,
            CASE
              WHEN l.activity_id IS NULL THEN 'custom'
              WHEN l.carbon_value > 0 THEN 'good'
              WHEN l.carbon_value < 0 THEN 'bad'
              ELSE 'neutral'
            END AS type,
            l.carbon_value AS unit,
            a.category,
            GREATEST(l.carbon_value, 0) AS eco_point,
            CASE WHEN l.carbon_value > 0 THEN 1 ELSE 0 END AS is_good,
            CASE
              WHEN l.activity_id IS NULL THEN 'custom'
              WHEN l.carbon_value = 0 THEN 'neutral'
              ELSE 'default'
            END AS source,
            COALESCE(l.note, '') AS description
     FROM user_activity_logs l
     JOIN users u ON u.id = l.user_id
     LEFT JOIN activities a ON a.id = l.activity_id
     WHERE ${where}
     ORDER BY l.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);
  return { logs, page, total_pages: totalPages(total, limit), total };
}

export async function dashboardSummary(req, res, next) {
  try {
    const filter = req.query.filter || "all";
    const range = dateRange(filter);
    const [userRows, logRows, customRows, badgeRows, milestoneRows, chartRows] = await Promise.all([
      query("SELECT COUNT(*) AS total FROM users WHERE role <> 'admin'"),
      query(
        `SELECT COUNT(*) AS total_activities,
                COALESCE(SUM(l.carbon_value), 0) AS total_unit,
                SUM(CASE WHEN l.carbon_value > 0 THEN 1 ELSE 0 END) AS good_actions,
                SUM(CASE WHEN l.carbon_value < 0 THEN 1 ELSE 0 END) AS bad_actions
         FROM user_activity_logs l
         JOIN users u ON u.id = l.user_id
         WHERE u.role <> 'admin' AND ${range}`
      ),
      query(
        `SELECT COUNT(*) AS total FROM user_activity_logs l
         JOIN users u ON u.id = l.user_id
         WHERE u.role <> 'admin' AND l.activity_id IS NULL AND ${range}`
      ),
      query("SELECT COUNT(*) AS total FROM user_badges ub JOIN users u ON u.id = ub.user_id WHERE u.role <> 'admin'"),
      query("SELECT COUNT(*) AS total FROM user_milestones um JOIN users u ON u.id = um.user_id WHERE u.role <> 'admin' AND um.is_completed = 1"),
      query(
        `SELECT DATE(l.created_at) AS date, COUNT(*) AS count
         FROM user_activity_logs l
         JOIN users u ON u.id = l.user_id
         WHERE u.role <> 'admin' AND ${range}
         GROUP BY DATE(l.created_at)
         ORDER BY DATE(l.created_at)`
      )
    ]);
    const totalActivities = Number(logRows[0]?.total_activities || 0);
    const goodActions = Number(logRows[0]?.good_actions || 0);
    const totalCarbonRows = await baseUserRows();
    const enriched = await enrichUsers(totalCarbonRows.filter((user) => user.role !== "admin"));

    res.json({
      total_users: Number(userRows[0]?.total || 0),
      total_unit: Number(logRows[0]?.total_unit || 0),
      total_activities: totalActivities,
      total_good_actions: goodActions,
      total_bad_actions: Number(logRows[0]?.bad_actions || 0),
      avg_eco_ratio: totalActivities ? Number(((goodActions / totalActivities) * 100).toFixed(1)) : 0,
      total_custom_green_actions: Number(customRows[0]?.total || 0),
      total_quests_completed: enriched.reduce((sum, user) => sum + user.total_quests_completed, 0),
      total_badges_earned: Number(badgeRows[0]?.total || 0),
      total_milestones_completed: Number(milestoneRows[0]?.total || 0),
      activity_chart: chartRows.map((row) => ({ date: row.date, count: Number(row.count || 0) }))
    });
  } catch (error) {
    next(error);
  }
}

export async function users(req, res, next) {
  try {
    const { page, limit, offset } = pageInfo(req);
    let rows = await enrichUsers(await baseUserRows());
    const search = String(req.query.search || "").toLowerCase();
    if (search) rows = rows.filter((user) => `${user.username} ${user.email}`.toLowerCase().includes(search));
    if (req.query.rank) rows = rows.filter((user) => user.current_rank === req.query.rank);
    if (req.query.onboarding === "complete") rows = rows.filter((user) => user.onboarding_complete);
    if (req.query.onboarding === "pending") rows = rows.filter((user) => !user.onboarding_complete);

    const sortField = req.query.sort;
    if (sortField) {
      const direction = req.query.order === "asc" ? 1 : -1;
      rows.sort((a, b) => (Number(a[sortField] || 0) - Number(b[sortField] || 0)) * direction);
    }

    const total = rows.length;
    res.json({ users: rows.slice(offset, offset + limit), page, total_pages: totalPages(total, limit), total });
  } catch (error) {
    next(error);
  }
}

export async function surveyLogs(req, res, next) {
  try {
    await ensureDailySurveyTable();
    const date = req.query.date || jakartaDate();
    const window = surveyWindow(date);
    const rows = await query(
      `SELECT u.id AS user_id,
              u.username,
              u.email,
              CASE WHEN daily_logs.id IS NOT NULL OR activity_logs.completed_at IS NOT NULL THEN 'completed' ELSE 'not_completed' END AS daily_survey_status,
              :date AS survey_date,
              COALESCE(daily_logs.completed_at, activity_logs.completed_at) AS completed_at
       FROM users u
       LEFT JOIN daily_survey_logs daily_logs
         ON daily_logs.user_id = u.id
        AND daily_logs.survey_date = :date
       LEFT JOIN (
         SELECT user_id, MIN(created_at) AS completed_at
         FROM user_activity_logs
         WHERE created_at >= :start
           AND created_at < :end
         GROUP BY user_id
       ) activity_logs ON activity_logs.user_id = u.id
       WHERE u.role <> 'admin'
       ORDER BY COALESCE(daily_logs.completed_at, activity_logs.completed_at) DESC, u.username ASC`,
      { date, start: window.start, end: window.end }
    );

    res.json({
      logs: rows,
      date,
      server_time: new Date().toISOString(),
      next_reset_at: nextJakartaSurveyReset()
    });
  } catch (error) {
    next(error);
  }
}

export async function userSurveyLogs(req, res, next) {
  try {
    await ensureDailySurveyTable();
    const userRows = await query(
      "SELECT id, username, email FROM users WHERE id = :userId AND role <> 'admin'",
      { userId: req.params.id }
    );
    if (!userRows.length) return res.status(404).json({ message: "User not found" });

    const history = await query(
      `SELECT survey_date,
              'completed' AS status,
              MIN(first_entry_at) AS first_entry_at,
              MAX(last_entry_at) AS last_entry_at
       FROM (
         SELECT survey_date,
                completed_at AS first_entry_at,
                completed_at AS last_entry_at
         FROM daily_survey_logs
         WHERE user_id = :userId

         UNION ALL

         SELECT DATE(DATE_SUB(created_at, INTERVAL 5 HOUR)) AS survey_date,
                MIN(created_at) AS first_entry_at,
                MAX(created_at) AS last_entry_at
         FROM user_activity_logs
         WHERE user_id = :userId
         GROUP BY DATE(DATE_SUB(created_at, INTERVAL 5 HOUR))
       ) survey_history
       GROUP BY survey_date
       ORDER BY survey_date DESC`,
      { userId: req.params.id }
    );

    res.json({ user: userRows[0], history });
  } catch (error) {
    next(error);
  }
}

export async function userById(req, res, next) {
  try {
    const rows = await enrichUsers(await baseUserRows());
    const user = rows.find((item) => Number(item.id) === Number(req.params.id));
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    next(error);
  }
}

export async function activityLogs(req, res, next) {
  try {
    res.json(await getLogs(req));
  } catch (error) {
    next(error);
  }
}

export async function userActivityLogs(req, res, next) {
  try {
    res.json(await getLogs(req, req.params.id));
  } catch (error) {
    next(error);
  }
}

export async function customGreenActions(req, res, next) {
  try {
    const userFilter = req.params.id ? "AND l.user_id = :userId" : "";
    const lang = String(req.query.lang || req.headers["x-language"] || "id").toLowerCase();
    const rows = await query(
      `SELECT l.id, l.user_id, u.username,
              COALESCE(l.other_activity, 'Custom activity') AS name,
              COALESCE(l.note, '') AS description,
              'custom' AS category,
              0 AS eco_point,
              COALESCE(l.note, 'Recorded as a neutral custom action.') AS feedback,
              :recommendation AS recommendation,
              l.created_at
       FROM user_activity_logs l
       JOIN users u ON u.id = l.user_id
       WHERE l.activity_id IS NULL ${userFilter}
       ORDER BY l.created_at DESC`,
      {
        userId: req.params.id || null,
        recommendation: lang === "en"
          ? "Use standard activities when possible so Journey Points can be measured."
          : "Gunakan aktivitas standar jika memungkinkan agar Poin Perjalanan bisa dihitung."
      }
    );
    res.json({ actions: rows });
  } catch (error) {
    next(error);
  }
}

export async function createCustomGreenAction(req, res, next) {
  try {
    const { user_id, name, description } = req.body;
    if (!user_id || !name) return res.status(400).json({ message: "user_id and name are required" });
    const result = await query(
      `INSERT INTO user_activity_logs (user_id, activity_id, other_activity, carbon_value, note)
       VALUES (:userId, NULL, :name, 0, :description)`,
      { userId: user_id, name, description: description || null }
    );
    await syncUserAwards(user_id);
    res.status(201).json({ message: "Custom green action created", id: result.insertId });
  } catch (error) {
    next(error);
  }
}

export async function updateCustomGreenAction(req, res, next) {
  try {
    const { user_id, name, description } = req.body;
    if (!name) return res.status(400).json({ message: "name is required" });
    const existing = await query("SELECT user_id FROM user_activity_logs WHERE id = :id AND activity_id IS NULL", { id: req.params.id });
    if (!existing.length) return res.status(404).json({ message: "Custom green action not found" });
    await query(
      `UPDATE user_activity_logs
       SET user_id = COALESCE(:userId, user_id), other_activity = :name, note = :description
       WHERE id = :id AND activity_id IS NULL`,
      { id: req.params.id, userId: user_id || null, name, description: description || null }
    );
    await syncUserAwards(user_id || existing[0].user_id);
    res.json({ message: "Custom green action updated" });
  } catch (error) {
    next(error);
  }
}

export async function deleteCustomGreenAction(req, res, next) {
  try {
    const existing = await query("SELECT user_id FROM user_activity_logs WHERE id = :id AND activity_id IS NULL", { id: req.params.id });
    if (!existing.length) return res.status(404).json({ message: "Custom green action not found" });
    await query("DELETE FROM user_activity_logs WHERE id = :id AND activity_id IS NULL", { id: req.params.id });
    await syncUserAwards(existing[0].user_id);
    res.json({ message: "Custom green action deleted" });
  } catch (error) {
    next(error);
  }
}

export async function userProgress(req, res, next) {
  try {
    const userId = req.params.id;
    const lang = String(req.query.lang || req.headers["x-language"] || "id").toLowerCase();
    const awards = await syncUserAwards(userId);
    const [badges, milestones] = await Promise.all([
      query(
        `SELECT b.id, b.name, b.description, b.icon,
                CASE
                  WHEN :lang = 'en' THEN CONCAT('Earn ', b.requirement_value, ' Carbon Unit (CU)')
                  ELSE CONCAT('Dapatkan ', b.requirement_value, ' Carbon Unit (CU)')
                END AS requirement,
                CASE WHEN ub.id IS NULL THEN 0 ELSE 1 END AS achieved,
                ub.earned_at AS achieved_at
         FROM badges b
         LEFT JOIN user_badges ub ON ub.badge_id = b.id AND ub.user_id = :userId
         WHERE b.name <> 'Earth Guardian'
         ORDER BY b.requirement_value`,
        { userId, lang }
      ),
      query(
        `SELECT m.id, m.name, m.description, m.target_value AS target,
                COALESCE(um.progress_value, 0) AS progress,
                COALESCE(um.is_completed, 0) AS achieved,
                um.completed_at AS achieved_at
         FROM milestones m
         LEFT JOIN user_milestones um ON um.milestone_id = m.id AND um.user_id = :userId
         ORDER BY m.target_value`,
        { userId }
      )
    ]);
    const quests = awards.quests.map((quest) => ({
      id: quest.id,
      name: quest.name,
      description: quest.description,
      progress: quest.progress_value,
      target: quest.requirement_value,
      active: !quest.is_completed && quest.progress_value > 0,
      completed: quest.is_completed,
      completed_at: quest.is_completed ? new Date() : null
    }));
    res.json({ milestones, badges, quests, current_rank: awards.currentRank });
  } catch (error) {
    next(error);
  }
}

export async function milestones(req, res, next) {
  try {
    const rows = await query(
      `SELECT m.id, m.name, m.description, m.target_value AS target,
              COUNT(um.id) AS achieved_count,
              MAX(um.completed_at) AS achieved_at,
              CASE WHEN COUNT(um.id) > 0 THEN 1 ELSE 0 END AS achieved
       FROM milestones m
       LEFT JOIN user_milestones um ON um.milestone_id = m.id AND um.is_completed = 1
       GROUP BY m.id
       ORDER BY m.target_value`
    );
    res.json({ milestones: rows });
  } catch (error) {
    next(error);
  }
}

export async function ecoBadges(req, res, next) {
  try {
    const lang = String(req.query.lang || req.headers["x-language"] || "id").toLowerCase();
    const rows = await query(
      `SELECT b.id, b.name, b.description, b.icon, b.requirement_type, b.requirement_value,
              CASE
                WHEN :lang = 'en' THEN CONCAT('Earn ', b.requirement_value, ' Carbon Unit (CU)')
                ELSE CONCAT('Dapatkan ', b.requirement_value, ' Carbon Unit (CU)')
              END AS requirement,
              COUNT(ub.id) AS achieved_count,
              MAX(ub.earned_at) AS achieved_at,
              CASE WHEN COUNT(ub.id) > 0 THEN 1 ELSE 0 END AS achieved
       FROM badges b
       LEFT JOIN user_badges ub ON ub.badge_id = b.id
       WHERE b.name <> 'Earth Guardian'
       GROUP BY b.id
       ORDER BY b.requirement_value`,
      { lang }
    );
    res.json({ badges: rows });
  } catch (error) {
    next(error);
  }
}

export async function quests(req, res, next) {
  try {
    const catalog = await getQuestCatalog(0);
    const achievementRows = await query(
      `SELECT q.id, COUNT(t.user_id) AS achieved_count
       FROM quests q
       LEFT JOIN (
         SELECT u.id AS user_id, COALESCE(SUM(l.carbon_value), 0) AS total_carbon
         FROM users u
         LEFT JOIN user_activity_logs l ON l.user_id = u.id
         WHERE u.role <> 'admin'
         GROUP BY u.id
       ) t ON t.total_carbon >= q.requirement_value
       WHERE q.is_active = 1
       GROUP BY q.id`
    );
    const achievedByQuestId = Object.fromEntries(
      achievementRows.map((row) => [String(row.id), Number(row.achieved_count || 0)])
    );
    const rows = catalog.map((quest) => ({
      id: quest.id,
      slug: quest.slug,
      icon: quest.icon,
      name: quest.name,
      description: quest.description,
      progress: 0,
      target: quest.requirement_value,
      requirement_value: quest.requirement_value,
      reward: quest.reward,
      is_active: quest.is_active,
      active: true,
      completed: false,
      achieved_count: achievedByQuestId[String(quest.id)] || 0
    }));
    res.json({ quests: rows });
  } catch (error) {
    next(error);
  }
}

export async function createQuest(req, res, next) {
  try {
    const { slug, icon, name, description, requirement_value, reward, is_active } = req.body;
    if (!slug || !name || !description || requirement_value == null) {
      return res.status(400).json({ message: "slug, name, description, and requirement_value are required" });
    }
    const result = await query(
      `INSERT INTO quests (slug, icon, name, description, requirement_value, reward, is_active)
       VALUES (:slug, :icon, :name, :description, :requirementValue, :reward, :isActive)`,
      {
        slug,
        icon: icon || "🌱",
        name,
        description,
        requirementValue: Number(requirement_value),
        reward: Number(reward || 25),
        isActive: is_active === false || is_active === 0 ? 0 : 1
      }
    );
    res.status(201).json({ message: "Quest created", id: result.insertId });
  } catch (error) {
    next(error);
  }
}

export async function updateQuest(req, res, next) {
  try {
    const { slug, icon, name, description, requirement_value, reward, is_active } = req.body;
    const result = await query(
      `UPDATE quests
       SET slug = :slug, icon = :icon, name = :name, description = :description,
           requirement_value = :requirementValue, reward = :reward, is_active = :isActive
       WHERE id = :id`,
      {
        id: req.params.id,
        slug,
        icon: icon || "🌱",
        name,
        description,
        requirementValue: Number(requirement_value),
        reward: Number(reward || 25),
        isActive: is_active === false || is_active === 0 ? 0 : 1
      }
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Quest not found" });
    res.json({ message: "Quest updated" });
  } catch (error) {
    next(error);
  }
}

export async function deleteQuest(req, res, next) {
  try {
    const result = await query("DELETE FROM quests WHERE id = :id", { id: req.params.id });
    if (!result.affectedRows) return res.status(404).json({ message: "Quest not found" });
    res.json({ message: "Quest deleted" });
  } catch (error) {
    next(error);
  }
}

export async function rankLogs(req, res, next) {
  try {
    await ensureRankTypesTable();

    if (req.params.id) {
      await syncUserAwards(req.params.id);
      const rows = await query(
        `SELECT r.id, r.user_id, u.username, r.rank_name AS \`rank\`, r.earned_at AS achieved_at
         FROM user_rank_achievements r
         JOIN users u ON u.id = r.user_id
         WHERE r.user_id = :userId
         ORDER BY r.earned_at ASC, r.id ASC`,
        { userId: req.params.id }
      );
      return res.json({ logs: rows });
    } else {
      const users = await query("SELECT id FROM users WHERE role <> 'admin'");
      await Promise.all(users.map((user) => syncUserAwards(user.id)));
    }

    const counts = await query(
      `SELECT r.rank_name AS \`rank\`, COUNT(DISTINCT r.user_id) AS achieved_count
       FROM user_rank_achievements r
       JOIN users u ON u.id = r.user_id
       WHERE u.role <> 'admin'
       GROUP BY r.rank_name`
    );
    const countByRank = Object.fromEntries(
      counts.map((row) => [row.rank, Number(row.achieved_count || 0)])
    );
    const rankTypes = await query(
      `SELECT id, name
       FROM rank_types
       ORDER BY FIELD(name, 'Guest', 'Explorer', 'Guardian', 'Hero'), name ASC`
    );

    res.json({
      logs: rankTypes.map((row) => ({
        id: row.id,
        rank: row.name,
        rank_name: row.name,
        is_default: ADMIN_RANK_TYPES.includes(row.name),
        achieved_count: countByRank[row.name] || 0
      }))
    });
  } catch (error) {
    next(error);
  }
}

export async function createRankLog(req, res, next) {
  try {
    await ensureRankTypesTable();
    const rankName = String(req.body.rank_name || "").trim();

    if (!rankName || rankName.length > 40) {
      return res.status(400).json({ message: "rank_name is required and must be 40 characters or less" });
    }

    await query(
      `INSERT INTO rank_types (name)
       VALUES (:rankName)
       ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
      { rankName }
    );
    res.status(201).json({ message: "Rank type saved" });
  } catch (error) {
    next(error);
  }
}

export async function updateRankLog(req, res, next) {
  try {
    await ensureRankTypesTable();
    const rankName = String(req.body.rank_name || "").trim();

    if (!rankName || rankName.length > 40) {
      return res.status(400).json({ message: "rank_name is required and must be 40 characters or less" });
    }

    const rows = await query("SELECT id, name FROM rank_types WHERE id = :id", { id: req.params.id });
    if (!rows.length) return res.status(404).json({ message: "Rank type not found" });
    if (ADMIN_RANK_TYPES.includes(rows[0].name)) {
      return res.status(400).json({ message: "Default rank types cannot be edited" });
    }

    await query(
      "UPDATE rank_types SET name = :rankName WHERE id = :id",
      { id: req.params.id, rankName }
    );
    await query(
      "UPDATE user_rank_achievements SET rank_name = :rankName WHERE rank_name = :oldRankName",
      { rankName, oldRankName: rows[0].name }
    );

    res.json({ message: "Rank type updated" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Rank type already exists" });
    }
    next(error);
  }
}

export async function deleteRankLog(req, res, next) {
  try {
    await ensureRankTypesTable();
    const rows = await query("SELECT id, name FROM rank_types WHERE id = :id", { id: req.params.id });
    if (!rows.length) return res.status(404).json({ message: "Rank type not found" });
    if (ADMIN_RANK_TYPES.includes(rows[0].name)) {
      return res.status(400).json({ message: "Default rank types cannot be deleted" });
    }

    await query("DELETE FROM rank_types WHERE id = :id", { id: req.params.id });
    await query("DELETE FROM user_rank_achievements WHERE rank_name = :rankName", { rankName: rows[0].name });

    res.json({ message: "Rank type deleted" });
  } catch (error) {
    next(error);
  }
}

export async function updateActivityLog(req, res, next) {
  try {
    const { user_id, activity_id, other_activity, carbon_value, note } = req.body;
    const existing = await query("SELECT user_id FROM user_activity_logs WHERE id = :id", { id: req.params.id });
    if (!existing.length) return res.status(404).json({ message: "Activity log not found" });

    let nextCarbonValue = Number(carbon_value || 0);
    if (activity_id) {
      const activities = await query("SELECT carbon_value FROM activities WHERE id = :activityId", { activityId: activity_id });
      if (!activities.length) return res.status(404).json({ message: "Activity not found" });
      nextCarbonValue = Number(activities[0].carbon_value);
    }

    await query(
      `UPDATE user_activity_logs
       SET user_id = COALESCE(:userId, user_id),
           activity_id = :activityId,
           other_activity = :otherActivity,
           carbon_value = :carbonValue,
           note = :note
       WHERE id = :id`,
      {
        id: req.params.id,
        userId: user_id || null,
        activityId: activity_id || null,
        otherActivity: activity_id ? null : other_activity || null,
        carbonValue: nextCarbonValue,
        note: note || null
      }
    );
    await syncUserAwards(user_id || existing[0].user_id);
    res.json({ message: "Activity log updated" });
  } catch (error) {
    next(error);
  }
}

export async function deleteActivityLogAdmin(req, res, next) {
  try {
    const existing = await query("SELECT user_id FROM user_activity_logs WHERE id = :id", { id: req.params.id });
    if (!existing.length) return res.status(404).json({ message: "Activity log not found" });
    await query("DELETE FROM user_activity_logs WHERE id = :id", { id: req.params.id });
    await syncUserAwards(existing[0].user_id);
    res.json({ message: "Activity log deleted" });
  } catch (error) {
    next(error);
  }
}

export async function createBadge(req, res, next) {
  try {
    const { name, description, icon, requirement_type, requirement_value } = req.body;
    if (!name || !description || !icon || !requirement_type || requirement_value == null) {
      return res.status(400).json({ message: "Badge fields are required" });
    }
    const result = await query(
      `INSERT INTO badges (name, description, icon, requirement_type, requirement_value)
       VALUES (:name, :description, :icon, :requirementType, :requirementValue)`,
      { name, description, icon, requirementType: requirement_type, requirementValue: requirement_value }
    );
    res.status(201).json({ message: "Badge created", id: result.insertId });
  } catch (error) {
    next(error);
  }
}

export async function updateBadge(req, res, next) {
  try {
    const { name, description, icon, requirement_type, requirement_value } = req.body;
    const result = await query(
      `UPDATE badges
       SET name = :name, description = :description, icon = :icon,
           requirement_type = :requirementType, requirement_value = :requirementValue
       WHERE id = :id`,
      { id: req.params.id, name, description, icon, requirementType: requirement_type, requirementValue: requirement_value }
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Badge not found" });
    res.json({ message: "Badge updated" });
  } catch (error) {
    next(error);
  }
}

export async function deleteBadge(req, res, next) {
  try {
    const result = await query("DELETE FROM badges WHERE id = :id", { id: req.params.id });
    if (!result.affectedRows) return res.status(404).json({ message: "Badge not found" });
    res.json({ message: "Badge deleted" });
  } catch (error) {
    next(error);
  }
}

export async function createMilestone(req, res, next) {
  try {
    const { name, description, target_value } = req.body;
    if (!name || !description || target_value == null) return res.status(400).json({ message: "Milestone fields are required" });
    const result = await query(
      "INSERT INTO milestones (name, description, target_value) VALUES (:name, :description, :targetValue)",
      { name, description, targetValue: target_value }
    );
    res.status(201).json({ message: "Milestone created", id: result.insertId });
  } catch (error) {
    next(error);
  }
}

export async function updateMilestone(req, res, next) {
  try {
    const { name, description, target_value } = req.body;
    const result = await query(
      "UPDATE milestones SET name = :name, description = :description, target_value = :targetValue WHERE id = :id",
      { id: req.params.id, name, description, targetValue: target_value }
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Milestone not found" });
    res.json({ message: "Milestone updated" });
  } catch (error) {
    next(error);
  }
}

export async function deleteMilestone(req, res, next) {
  try {
    const result = await query("DELETE FROM milestones WHERE id = :id", { id: req.params.id });
    if (!result.affectedRows) return res.status(404).json({ message: "Milestone not found" });
    res.json({ message: "Milestone deleted" });
  } catch (error) {
    next(error);
  }
}

export async function leaderboard(req, res, next) {
  try {
    const rows = (await enrichUsers(await baseUserRows()))
      .filter((user) => user.role !== "admin")
      .sort((a, b) => b.total_unit - a.total_unit)
      .map((user, index) => ({ ...user, leaderboard_rank: index + 1, leaderboard_position: index + 1 }));
    res.json({ leaderboard: rows });
  } catch (error) {
    next(error);
  }
}

export async function deleteUser(req, res, next) {
  try {
    if (Number(req.params.id) === Number(req.user.id)) {
      return res.status(400).json({ message: "Admin cannot delete the active account" });
    }
    const result = await query("DELETE FROM users WHERE id = :id AND role <> 'admin'", { id: req.params.id });
    if (!result.affectedRows) return res.status(404).json({ message: "User not found or protected" });
    res.json({ message: "User deleted" });
  } catch (error) {
    next(error);
  }
}
