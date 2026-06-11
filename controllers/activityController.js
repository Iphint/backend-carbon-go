import { Activity } from "../models/activityModel.js";
import { getDailySurveyStatus, markDailySurveyComplete } from "../models/dailySurveyModel.js";
import { syncUserAwards } from "../models/progressModel.js";

export async function getActivities(req, res, next) {
  try {
    const activities = await Activity.all(req.query.lang);
    res.json({ activities });
  } catch (error) {
    next(error);
  }
}

export async function createActivityLog(req, res, next) {
  try {
    const { activity_id, other_activity, note, complete_daily_survey } = req.body;
    let carbonValue = 0;

    if (activity_id) {
      const activities = await Activity.findById(activity_id);
      if (!activities.length) return res.status(404).json({ message: "Activity not found" });
      carbonValue = Number(activities[0].carbon_value);
    } else {
      if (!other_activity) return res.status(400).json({ message: "Other activity name is required" });
      carbonValue = 0;
    }

    const id = await Activity.createLog(req.user.id, {
      activity_id,
      other_activity,
      carbon_value: carbonValue,
      note
    });
    await syncUserAwards(req.user.id);
    if (complete_daily_survey) {
      await markDailySurveyComplete(req.user.id);
    }
    res.status(201).json({ message: "Activity logged", id });
  } catch (error) {
    next(error);
  }
}

export async function submitDailySurvey(req, res, next) {
  try {
    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
    if (!entries.length) {
      return res.status(400).json({ message: "Survey entries are required" });
    }

    const createdLogIds = [];
    for (const entry of entries) {
      const { activity_id, other_activity, note } = entry;
      let carbonValue = 0;

      if (activity_id) {
        const activities = await Activity.findById(activity_id);
        if (!activities.length) return res.status(404).json({ message: "Activity not found" });
        carbonValue = Number(activities[0].carbon_value);
      } else {
        if (!other_activity) return res.status(400).json({ message: "Other activity name is required" });
        carbonValue = 0;
      }

      const id = await Activity.createLog(req.user.id, {
        activity_id,
        other_activity,
        carbon_value: carbonValue,
        note
      });
      createdLogIds.push(id);
    }

    await syncUserAwards(req.user.id);
    const status = await markDailySurveyComplete(req.user.id);

    res.status(201).json({
      message: "Daily survey submitted",
      log_ids: createdLogIds,
      survey: status
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyActivityLogs(req, res, next) {
  try {
    const logs = await Activity.logsByUser(req.user.id, req.query.lang);
    res.json({ logs });
  } catch (error) {
    next(error);
  }
}

export async function deleteActivityLog(req, res, next) {
  try {
    const deleted = await Activity.deleteLog(req.user.id, req.params.id);
    if (!deleted) return res.status(404).json({ message: "Activity log not found" });
    await syncUserAwards(req.user.id);
    res.json({ message: "Activity log deleted" });
  } catch (error) {
    next(error);
  }
}

export async function getDailySurvey(req, res, next) {
  try {
    res.json(await getDailySurveyStatus(req.user.id));
  } catch (error) {
    next(error);
  }
}

export async function completeDailySurvey(req, res, next) {
  try {
    const status = await markDailySurveyComplete(req.user.id);
    res.json(status);
  } catch (error) {
    next(error);
  }
}
