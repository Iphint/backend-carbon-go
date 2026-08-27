import { query, isBilingualReady } from "../config/db.js";
import { ensureDailySurveyTable, makassarDate, nextMakassarSurveyReset, surveyWindow } from "../models/dailySurveyModel.js";
import { getQuestCatalog, syncUserAwards } from "../models/progressModel.js";

const PAGE_SIZE = 20;
const ADMIN_RANK_TYPES = ["Guest", "Explorer", "Pioneer", "Guardian", "Hero"];

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
  return ADMIN_RANK_TYPES[Math.min(Number(questCount), Number(badgeCount), Number(milestoneCount), 4)] || "Guest";
}

async function ensureRankTypesTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS rank_types (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(40) NOT NULL UNIQUE,
      name_en VARCHAR(40) NULL,
      name_id VARCHAR(40) NULL,
      description_en TEXT NULL,
      description_id TEXT NULL,
      milestone_id BIGINT UNSIGNED NULL,
      badge_id BIGINT UNSIGNED NULL,
      quest_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`
  );

  for (const rankName of ADMIN_RANK_TYPES) {
    const bilingual = await isBilingualReady();
    if (bilingual) {
      await query(
        `INSERT INTO rank_types (name, name_en, name_id)
         VALUES (:rankName, :rankName, :rankName)
         ON DUPLICATE KEY UPDATE
           name_en = COALESCE(name_en, VALUES(name_en)),
           name_id = COALESCE(name_id, VALUES(name_id))`,
        { rankName }
      );
    } else {
      await query(
        `INSERT IGNORE INTO rank_types (name)
         VALUES (:rankName)`,
        { rankName }
      );
    }
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
  if (req.query.filter === "default") filters.push("l.activity_id IS NOT NULL");
  if (req.query.date) {
    filters.push("DATE(l.created_at + INTERVAL 8 HOUR) = :date");
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
               WHEN l.carbon_value > 0 THEN 'good'
               WHEN l.carbon_value < 0 THEN 'bad'
               ELSE 'neutral'
             END AS type,
             l.carbon_value AS unit,
             CASE
               WHEN l.activity_id IS NULL THEN 'custom'
               ELSE COALESCE(a.category, 'uncategorized')
             END AS category,
             CASE
               WHEN l.activity_id IS NULL THEN 'custom'
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

export async function dashboardPointSummary(req, res, next) {
  try {
    const group = req.query.group || "daily";

    let dateExpr, orderExpr;
    if (group === "monthly") {
      dateExpr = "DATE_FORMAT(l.created_at + INTERVAL 8 HOUR, '%Y-%m')";
      orderExpr = "MIN(l.created_at)";
    } else if (group === "yearly") {
      dateExpr = "YEAR(l.created_at + INTERVAL 8 HOUR)";
      orderExpr = "MIN(l.created_at)";
    } else {
      dateExpr = "DATE(l.created_at + INTERVAL 8 HOUR)";
      orderExpr = dateExpr;
    }

    const rows = await query(
      `SELECT ${dateExpr} AS date,
              SUM(CASE WHEN l.carbon_value > 0 THEN l.carbon_value ELSE 0 END) AS points_in,
              SUM(CASE WHEN l.carbon_value < 0 THEN ABS(l.carbon_value) ELSE 0 END) AS points_out,
              SUM(l.carbon_value) AS net_points,
              COUNT(l.id) AS total_activities
       FROM user_activity_logs l
       JOIN users u ON u.id = l.user_id
       WHERE u.role <> 'admin'
       GROUP BY ${dateExpr}
       ORDER BY ${orderExpr} ASC`
    );

    let runningTotal = 0;
    const logs = rows.map((row) => {
      runningTotal += Number(row.net_points || 0);
      return {
        date: String(row.date),
        points_in: Number(row.points_in || 0),
        points_out: Number(row.points_out || 0),
        net_points: Number(row.net_points || 0),
        cumulative: runningTotal,
        total_activities: Number(row.total_activities || 0),
      };
    });

    res.json({ logs });
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
    const date = req.query.date || makassarDate();
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
      next_reset_at: nextMakassarSurveyReset()
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
              completed_at AS first_entry_at,
              completed_at AS last_entry_at,
              1 AS entry_index
       FROM daily_survey_logs
       WHERE user_id = :userId
       ORDER BY survey_date DESC, completed_at DESC`,
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

export async function userPointLogs(req, res, next) {
  try {
    const userId = req.params.id;

    // Daily aggregated data (for charts)
    const dailyRows = await query(
      `SELECT
        DATE(l.created_at + INTERVAL 8 HOUR) AS date,
        SUM(CASE WHEN l.carbon_value > 0 THEN l.carbon_value ELSE 0 END) AS points_in,
        SUM(CASE WHEN l.carbon_value < 0 THEN ABS(l.carbon_value) ELSE 0 END) AS points_out,
        SUM(l.carbon_value) AS net_points,
        COUNT(l.id) AS total_activities
      FROM user_activity_logs l
      WHERE l.user_id = :userId
      GROUP BY DATE(l.created_at + INTERVAL 8 HOUR)
      ORDER BY date ASC`,
      { userId }
    );

    let runningTotal = 0;
    const logs = dailyRows.map((row) => {
      runningTotal += Number(row.net_points || 0);
      return {
        date: row.date,
        points_in: Number(row.points_in || 0),
        points_out: Number(row.points_out || 0),
        net_points: Number(row.net_points || 0),
        cumulative: runningTotal,
        total_activities: Number(row.total_activities || 0),
      };
    });

    // Individual entries with entry_index per date (for detail table)
    const entries = await query(
      `SELECT
        DATE(l.created_at + INTERVAL 8 HOUR) AS date,
        l.id,
        l.activity_id,
        l.carbon_value,
        COALESCE(NULLIF(a.name_en, ''), a.name, l.other_activity, 'Other') AS name_en,
        COALESCE(NULLIF(a.name_id, ''), a.name, l.other_activity, 'Other') AS name_id,
        CASE
          WHEN l.carbon_value > 0 THEN 'good'
          WHEN l.carbon_value < 0 THEN 'bad'
          ELSE 'neutral'
        END AS type,
        l.created_at,
        l.note
      FROM user_activity_logs l
      LEFT JOIN activities a ON a.id = l.activity_id
      WHERE l.user_id = :userId
      ORDER BY DATE(l.created_at + INTERVAL 8 HOUR) ASC, l.created_at ASC`,
      { userId }
    );

    // Add entry_index per date
    let prevDate = null;
    let idx = 0;
    const detailedEntries = entries.map((e) => {
      if (e.date !== prevDate) {
        prevDate = e.date;
        idx = 1;
      } else {
        idx++;
      }
      return {
        date: e.date,
        entry_index: idx,
        id: e.id,
        activity_id: e.activity_id || null,
        carbon_value: Number(e.carbon_value || 0),
        name_en: e.name_en,
        name_id: e.name_id,
        type: e.type,
        created_at: e.created_at,
        note: e.note,
      };
    });

    res.json({ logs, entries: detailedEntries, total_cumulative: runningTotal });
  } catch (error) {
    next(error);
  }
}

export async function pointLogs(req, res, next) {
  try {
    const { userId, search, type, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const params = {};
    if (userId) {
      conditions.push("l.user_id = :userId");
      params.userId = userId;
    }
    if (search) {
      conditions.push("u.username LIKE :search");
      params.search = `%${search}%`;
    }
    if (type) {
      if (type === "custom") {
        conditions.push("l.activity_id IS NULL");
      } else if (type === "good") {
        conditions.push("l.carbon_value > 0 AND l.activity_id IS NOT NULL");
      } else if (type === "bad") {
        conditions.push("l.carbon_value < 0 AND l.activity_id IS NOT NULL");
      } else if (type === "neutral") {
        conditions.push("l.carbon_value = 0");
      }
    }
    const whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const safeOffset = Math.max(0, parseInt(offset) || 0);

    // Count total entries
    const countResult = await query(
      `SELECT COUNT(*) AS total FROM user_activity_logs l
       JOIN users u ON u.id = l.user_id
       ${whereClause}`,
      params
    );
    const total = Number(countResult[0]?.total || 0);

    // Individual entries with username (paginated)
    const entries = await query(
      `SELECT
        l.id,
        DATE(l.created_at + INTERVAL 8 HOUR) AS date,
        u.username,
        u.id AS user_id,
        l.activity_id,
        l.carbon_value,
        COALESCE(NULLIF(a.name_en, ''), a.name, l.other_activity, 'Other') AS name_en,
        COALESCE(NULLIF(a.name_id, ''), a.name, l.other_activity, 'Other') AS name_id,
        CASE
          WHEN l.carbon_value > 0 THEN 'good'
          WHEN l.carbon_value < 0 THEN 'bad'
          ELSE 'neutral'
        END AS type,
        l.created_at,
        l.note
      FROM user_activity_logs l
      LEFT JOIN activities a ON a.id = l.activity_id
      JOIN users u ON u.id = l.user_id
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params
    );

    res.json({
      entries: entries.map((e) => ({
        id: e.id,
        date: e.date,
        username: e.username,
        user_id: e.user_id,
        activity_id: e.activity_id,
        carbon_value: Number(e.carbon_value || 0),
        name_en: e.name_en,
        name_id: e.name_id,
        type: e.type,
        created_at: e.created_at,
        note: e.note,
      })),
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      total_pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    next(error);
  }
}

export async function milestones(req, res, next) {
  try {
    const lang = String(req.query.lang || req.headers["x-language"] || "id").toLowerCase();
    const bilingual = await isBilingualReady();
    const rows = await query(
      `SELECT m.id, m.name, m.target_value AS target,
              ${bilingual ? "m.name_en, m.name_id, m.description_en, m.description_id," : ""}
              m.description,
              ${bilingual ? `CASE WHEN :lang = 'en' THEN COALESCE(m.name_en, m.name) ELSE COALESCE(m.name_id, m.name) END AS display_name,
              CASE WHEN :lang = 'en' THEN COALESCE(m.description_en, m.description) ELSE COALESCE(m.description_id, m.description) END AS display_description,` : ""}
              COUNT(um.id) AS achieved_count,
              MAX(um.completed_at) AS achieved_at,
              CASE WHEN COUNT(um.id) > 0 THEN 1 ELSE 0 END AS achieved
       FROM milestones m
       LEFT JOIN user_milestones um ON um.milestone_id = m.id AND um.is_completed = 1
       GROUP BY m.id
       ORDER BY m.target_value`,
      { lang }
    );
    res.json({ milestones: rows });
  } catch (error) {
    next(error);
  }
}

export async function rankLogs(req, res, next) {
  try {
    await ensureRankTypesTable();
    const bilingual = await isBilingualReady();

    const rankTypes = await query(
      `SELECT rt.id, rt.name
              ${bilingual ? ", rt.name_en, rt.name_id, rt.description_en, rt.description_id, rt.milestone_id, rt.badge_id, rt.quest_id, m.name AS milestone_name, b.name AS badge_name, q.name AS quest_name" : ""}
       FROM rank_types rt
       ${bilingual ? "LEFT JOIN milestones m ON m.id = rt.milestone_id LEFT JOIN badges b ON b.id = rt.badge_id LEFT JOIN quests q ON q.id = rt.quest_id" : ""}
       ORDER BY FIELD(rt.name, 'Guest', 'Explorer', 'Pioneer', 'Guardian', 'Hero'), rt.name ASC`
    );

    res.json({
      logs: rankTypes.map((row) => ({
        id: row.id,
        rank: row.name,
        rank_name: row.name,
        name_en: row.name_en,
        name_id: row.name_id,
        description_en: row.description_en,
        description_id: row.description_id,
        milestone_id: row.milestone_id,
        badge_id: row.badge_id,
        quest_id: row.quest_id,
        milestone_name: row.milestone_name,
        badge_name: row.badge_name,
        quest_name: row.quest_name,
        is_default: ADMIN_RANK_TYPES.includes(row.name)
      }))
    });
  } catch (error) {
    next(error);
  }
}

export async function createRankLog(req, res, next) {
  try {
    await ensureRankTypesTable();
    const { rank_name, name_en, name_id, description_en, description_id, milestone_id, badge_id, quest_id } = req.body;
    const rankName = String(rank_name || "").trim();

    if (!rankName || rankName.length > 40) {
      return res.status(400).json({ message: "rank_name is required and must be 40 characters or less" });
    }

    const bilingual = await isBilingualReady();
    if (bilingual) {
      await query(
        `INSERT INTO rank_types (name, name_en, name_id, description_en, description_id, milestone_id, badge_id, quest_id)
         VALUES (:rankName, :nameEn, :nameId, :descriptionEn, :descriptionId, :milestoneId, :badgeId, :questId)
         ON DUPLICATE KEY UPDATE
           name_en = VALUES(name_en), name_id = VALUES(name_id),
           description_en = VALUES(description_en), description_id = VALUES(description_id),
           milestone_id = VALUES(milestone_id), badge_id = VALUES(badge_id), quest_id = VALUES(quest_id),
           updated_at = CURRENT_TIMESTAMP`,
        {
          rankName,
          nameEn: name_en || null,
          nameId: name_id || null,
          descriptionEn: description_en || null,
          descriptionId: description_id || null,
          milestoneId: milestone_id || null,
          badgeId: badge_id || null,
          questId: quest_id || null
        }
      );
    } else {
      await query(
        `INSERT INTO rank_types (name)
         VALUES (:rankName)
         ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
        { rankName }
      );
    }
    res.status(201).json({ message: "Rank type saved" });
  } catch (error) {
    next(error);
  }
}

export async function updateRankLog(req, res, next) {
  try {
    await ensureRankTypesTable();
    const { rank_name, name_en, name_id, description_en, description_id, milestone_id, badge_id, quest_id } = req.body;
    const rankName = String(rank_name || "").trim();

    if (!rankName || rankName.length > 40) {
      return res.status(400).json({ message: "rank_name is required and must be 40 characters or less" });
    }

    const rows = await query("SELECT id, name FROM rank_types WHERE id = :id", { id: req.params.id });
    if (!rows.length) return res.status(404).json({ message: "Rank type not found" });

    const isDefaultRank = ADMIN_RANK_TYPES.includes(rows[0].name);
    // Preserve the original name for default ranks to prevent renaming
    const effectiveName = isDefaultRank ? rows[0].name : rankName;
    const bilingual = await isBilingualReady();
    if (bilingual) {
      await query(
        `UPDATE rank_types
         SET ${isDefaultRank ? "" : "name = :rankName,"} name_en = :nameEn, name_id = :nameId,
             description_en = :descriptionEn, description_id = :descriptionId,
             milestone_id = :milestoneId, badge_id = :badgeId, quest_id = :questId
         WHERE id = :id`,
        {
          id: req.params.id,
          ...(isDefaultRank ? {} : { rankName }),
          nameEn: name_en || null,
          nameId: name_id || null,
          descriptionEn: description_en || null,
          descriptionId: description_id || null,
          milestoneId: milestone_id || null,
          badgeId: badge_id || null,
          questId: quest_id || null
        }
      );
    } else if (!isDefaultRank) {
      await query(
        `UPDATE rank_types SET name = :rankName WHERE id = :id`,
        { id: req.params.id, rankName }
      );
    }
    if (!isDefaultRank) {
      await query(
        "UPDATE user_rank_achievements SET rank_name = :rankName WHERE rank_name = :oldRankName",
        { rankName, oldRankName: rows[0].name }
      );
    }

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
    const { user_id, activity_id, other_activity, carbon_value, note, date } = req.body;
    const existing = await query("SELECT user_id, created_at FROM user_activity_logs WHERE id = :id", { id: req.params.id });
    if (!existing.length) return res.status(404).json({ message: "Activity log not found" });

    let nextCarbonValue = Number(carbon_value || 0);
    if (activity_id && carbon_value === undefined) {
      const activities = await query("SELECT carbon_value FROM activities WHERE id = :activityId", { activityId: activity_id });
      if (!activities.length) return res.status(404).json({ message: "Activity not found" });
      nextCarbonValue = Number(activities[0].carbon_value);
    }

    const createdAt = date ? `${String(date).split("T")[0]} 12:00:00` : null;
    const originalDate = existing[0].created_at;
    const dateChanged = createdAt && String(date).split("T")[0] !== String(originalDate).split("T")[0];

    await query(
      `UPDATE user_activity_logs
       SET user_id = COALESCE(:userId, user_id),
           activity_id = :activityId,
           other_activity = :otherActivity,
           carbon_value = :carbonValue,
           note = :note
           ${createdAt ? ", created_at = :createdAt" : ""}
       WHERE id = :id`,
      {
        id: req.params.id,
        userId: user_id || null,
        activityId: activity_id || null,
        otherActivity: activity_id ? null : other_activity || null,
        carbonValue: nextCarbonValue,
        note: note || null,
        ...(createdAt ? { createdAt } : {})
      }
    );
    await syncUserAwards(user_id || existing[0].user_id);

    const response = { message: "Activity log updated" };
    if (dateChanged) {
      const fmt = (d) => {
        const dt = new Date(d);
        const day = String(dt.getDate()).padStart(2, "0");
        const month = String(dt.getMonth() + 1).padStart(2, "0");
        const year = dt.getFullYear();
        return `${day}/${month}/${year}`;
      };
      response.moved_from = `${fmt(originalDate)}, -`;
      response.moved_to = `${fmt(createdAt)}, -`;
    }
    res.json(response);
  } catch (error) {
    next(error);
  }
}

export async function createActivityLogAdmin(req, res, next) {
  try {
    const { user_id, activity_id, other_activity, carbon_value, note, date } = req.body;
    if (!user_id) return res.status(400).json({ message: "user_id is required" });

    let nextCarbonValue = Number(carbon_value || 0);
    if (activity_id) {
      const activities = await query("SELECT carbon_value FROM activities WHERE id = :activityId", { activityId: activity_id });
      if (!activities.length) return res.status(404).json({ message: "Activity not found" });
      nextCarbonValue = Number(activities[0].carbon_value);
    } else if (!other_activity) {
      return res.status(400).json({ message: "Activity name is required for custom entries" });
    }

    const createdAt = date ? `${String(date).split("T")[0]} 12:00:00` : new Date();

    const result = await query(
      `INSERT INTO user_activity_logs (user_id, activity_id, other_activity, carbon_value, note, created_at)
       VALUES (:userId, :activityId, :otherActivity, :carbonValue, :note, :createdAt)`,
      {
        userId: user_id,
        activityId: activity_id || null,
        otherActivity: activity_id ? null : other_activity || null,
        carbonValue: nextCarbonValue,
        note: note || null,
        createdAt
      }
    );
    await syncUserAwards(user_id);
    res.status(201).json({ message: "Activity log created", id: result.insertId });
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

export async function createMilestone(req, res, next) {
  try {
    const { name, name_en, name_id, description, description_en, description_id, target_value } = req.body;
    if (!name || !description || target_value == null) return res.status(400).json({ message: "Milestone fields are required" });
    const bilingual = await isBilingualReady();
    const result = await query(
      `INSERT INTO milestones (name, ${bilingual ? "name_en, name_id, description_en, description_id," : ""} description, target_value)
       VALUES (:name, ${bilingual ? ":nameEn, :nameId, :descriptionEn, :descriptionId, " : ""} :description, :targetValue)`,
      {
        name,
        nameEn: name_en || null,
        nameId: name_id || null,
        descriptionEn: description_en || null,
        descriptionId: description_id || null,
        description,
        targetValue: target_value
      }
    );
    res.status(201).json({ message: "Milestone created", id: result.insertId });
  } catch (error) {
    next(error);
  }
}

export async function updateMilestone(req, res, next) {
  try {
    const { name, name_en, name_id, description, description_en, description_id, target_value } = req.body;
    const bilingual = await isBilingualReady();
    const result = await query(
      `UPDATE milestones
       SET name = :name, ${bilingual ? "name_en = :nameEn, name_id = :nameId, description_en = :descriptionEn, description_id = :descriptionId," : ""}
           description = :description, target_value = :targetValue
       WHERE id = :id`,
      {
        id: req.params.id,
        name,
        nameEn: name_en || null,
        nameId: name_id || null,
        descriptionEn: description_en || null,
        descriptionId: description_id || null,
        description,
        targetValue: target_value
      }
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

export async function activityStats(req, res, next) {
  try {
    const lang = String(req.query.lang || req.headers["x-language"] || "id").toLowerCase();
    const activityNameColumn = lang === "en" ? "a.name_en" : "a.name_id";

    const [mostFrequent, mostPositive, mostNegative] = await Promise.all([
      query(
        `SELECT a.id,
                COALESCE(NULLIF(${activityNameColumn}, ''), a.name) AS name,
                a.category, a.carbon_value,
                COUNT(l.id) AS total_count
         FROM user_activity_logs l
         JOIN activities a ON a.id = l.activity_id
         JOIN users u ON u.id = l.user_id
         WHERE u.role <> 'admin'
         GROUP BY a.id, a.name, a.name_en, a.name_id, a.category, a.carbon_value
         ORDER BY total_count DESC
         LIMIT 10`
      ),
      query(
        `SELECT a.id,
                COALESCE(NULLIF(${activityNameColumn}, ''), a.name) AS name,
                a.category, a.carbon_value,
                COUNT(l.id) AS total_count,
                SUM(l.carbon_value) AS total_carbon
         FROM user_activity_logs l
         JOIN activities a ON a.id = l.activity_id
         JOIN users u ON u.id = l.user_id
         WHERE u.role <> 'admin' AND l.carbon_value > 0
         GROUP BY a.id, a.name, a.name_en, a.name_id, a.category, a.carbon_value
         ORDER BY total_carbon DESC
         LIMIT 10`
      ),
      query(
        `SELECT a.id,
                COALESCE(NULLIF(${activityNameColumn}, ''), a.name) AS name,
                a.category, a.carbon_value,
                COUNT(l.id) AS total_count,
                SUM(ABS(l.carbon_value)) AS total_carbon
         FROM user_activity_logs l
         JOIN activities a ON a.id = l.activity_id
         JOIN users u ON u.id = l.user_id
         WHERE u.role <> 'admin' AND l.carbon_value < 0
         GROUP BY a.id, a.name, a.name_en, a.name_id, a.category, a.carbon_value
         ORDER BY total_carbon DESC
         LIMIT 10`
      )
    ]);

    res.json({
      most_frequent: mostFrequent.map((r) => ({
        id: r.id, name: r.name, category: r.category,
        carbon_value: Number(r.carbon_value), total_count: Number(r.total_count)
      })),
      most_positive: mostPositive.map((r) => ({
        id: r.id, name: r.name, category: r.category,
        carbon_value: Number(r.carbon_value), total_count: Number(r.total_count),
        total_carbon: Number(r.total_carbon)
      })),
      most_negative: mostNegative.map((r) => ({
        id: r.id, name: r.name, category: r.category,
        carbon_value: Number(r.carbon_value), total_count: Number(r.total_count),
        total_carbon: Number(r.total_carbon)
      }))
    });
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
