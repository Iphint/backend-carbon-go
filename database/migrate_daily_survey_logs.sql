USE carbon_go;

CREATE TABLE IF NOT EXISTS daily_survey_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  survey_date DATE NOT NULL,
  completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_daily_survey_user_date (user_id, survey_date),
  INDEX idx_daily_survey_date (survey_date),
  CONSTRAINT fk_daily_survey_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

INSERT INTO daily_survey_logs (user_id, survey_date, completed_at)
SELECT user_id, DATE(created_at) AS survey_date, MIN(created_at) AS completed_at
FROM user_activity_logs
GROUP BY user_id, DATE(created_at)
ON DUPLICATE KEY UPDATE completed_at = VALUES(completed_at);
