CREATE DATABASE IF NOT EXISTS carbon_go
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE carbon_go;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(180) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL UNIQUE,
  full_name VARCHAR(160) NOT NULL,
  address TEXT NOT NULL,
  gender VARCHAR(40) NOT NULL,
  phone_number VARCHAR(40) NOT NULL,
  bio TEXT NULL,
  photo VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_profiles_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  name_en VARCHAR(180) NOT NULL,
  name_id VARCHAR(180) NOT NULL,
  category VARCHAR(80) NOT NULL,
  carbon_value INT NOT NULL DEFAULT 0,
  feedback_en TEXT NOT NULL,
  feedback_id TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_activity_name_category (name, category)
);

CREATE TABLE IF NOT EXISTS user_activity_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  activity_id BIGINT UNSIGNED NULL,
  other_activity VARCHAR(180) NULL,
  carbon_value INT NOT NULL DEFAULT 0,
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activity_logs_user_created (user_id, created_at),
  CONSTRAINT fk_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_logs_activity
    FOREIGN KEY (activity_id) REFERENCES activities(id)
    ON DELETE SET NULL
);

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

CREATE TABLE IF NOT EXISTS badges (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  icon VARCHAR(80) NOT NULL,
  requirement_type VARCHAR(80) NOT NULL,
  requirement_value INT NOT NULL,
  UNIQUE KEY uq_badge_name (name)
);

CREATE TABLE IF NOT EXISTS user_badges (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  badge_id BIGINT UNSIGNED NOT NULL,
  earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_badge (user_id, badge_id),
  CONSTRAINT fk_user_badges_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_user_badges_badge
    FOREIGN KEY (badge_id) REFERENCES badges(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS milestones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  target_value INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_milestone_name (name)
);

CREATE TABLE IF NOT EXISTS quests (
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
);

CREATE TABLE IF NOT EXISTS user_milestones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  milestone_id BIGINT UNSIGNED NOT NULL,
  progress_value INT NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMP NULL,
  UNIQUE KEY uq_user_milestone (user_id, milestone_id),
  CONSTRAINT fk_user_milestones_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_user_milestones_milestone
    FOREIGN KEY (milestone_id) REFERENCES milestones(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_rank_achievements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  rank_name VARCHAR(40) NOT NULL,
  earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_rank (user_id, rank_name),
  CONSTRAINT fk_user_rank_achievements_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rank_types (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(40) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO rank_types (name) VALUES
('Guest'),
('Explorer'),
('Guardian'),
('Hero')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO activities (name, name_en, name_id, category, carbon_value, feedback_en, feedback_id, is_default) VALUES
('Walk / Bicycle', 'Walk / Bicycle', 'Jalan Kaki / Sepeda', 'transportation', 5, '🚶‍♂️ Amazing! Zero-carbon commuting sets a great example.', '🚶‍♂️ Luar biasa! Komuter nol karbon memberi contoh yang baik.', 1),
('Personal electric vehicle', 'Personal electric vehicle', 'Kendaraan listrik pribadi', 'transportation', 4, '🔋 Great choice! EVs reduce emissions significantly.', '🔋 Pilihan bagus! EV mengurangi emisi secara signifikan.', 1),
('Public transport / Carpool / Ride-sharing', 'Public transport / Carpool / Ride-sharing', 'Transportasi umum / Carpool / Berbagi tumpangan', 'transportation', 3, '🚌 Excellent! Shared transport cuts carbon per person.', '🚌 Bagus! Transportasi bersama mengurangi karbon per orang.', 1),
('Dropped off with more than 2 people', 'Dropped off with more than 2 people', 'Di antar dengan lebih dari 2 orang', 'transportation', 2, '👥 Carpooling helps — try walking for short distances.', '👥 Carpool membantu — coba jalan kaki untuk jarak dekat.', 1),
('Short distance gasoline vehicle', 'Short distance gasoline vehicle', 'Kendaraan bensin jarak pendek', 'transportation', 1, '🛵 Consider biking for nearby trips.', '🛵 Pertimbangkan bersepeda untuk perjalanan dekat.', 1),
('Neutral / No special activity', 'Neutral / No special activity', 'Netral / Tidak ada aktivitas khusus', 'transportation', 0, 'Neutral choice. Every small action counts.', 'Pilihan netral. Setiap tindakan kecil berarti.', 1),
('Short ride online taxi', 'Short ride online taxi', 'Taksi online jarak pendek', 'transportation', -1, 'Apps increase emissions — try public transport.', 'Aplikasi meningkatkan emisi — coba transportasi umum.', 1),
('Long ride online taxi', 'Long ride online taxi', 'Taksi online jarak jauh', 'transportation', -2, 'Long solo rides = higher carbon.', 'Perjalanan solo jarak jauh = karbon lebih tinggi.', 1),
('Gasoline motorcycle', 'Gasoline motorcycle', 'Sepeda motor bensin', 'transportation', -3, 'Motorcycles emit less than cars but still pollute.', 'Motor mengeluarkan emisi lebih sedikit dari mobil tetapi tetap polusi.', 1),
('Private gasoline car', 'Private gasoline car', 'Mobil bensin pribadi', 'transportation', -4, '🚗 Solo car trips are carbon-heavy. Try carpooling.', '🚗 Perjalanan mobil solo berat karbon. Coba carpool.', 1),
('Intensive gasoline vehicle (>2 trips/day)', 'Intensive gasoline vehicle (>2 trips/day)', 'Kendaraan bensin intensif (>2 perjalanan/hari)', 'transportation', -5, '⚠️ High emissions! Combine trips or walk.', '⚠️ Emisi tinggi! Gabungkan perjalanan atau jalan kaki.', 1),
('Home composting / reused grey water', 'Home composting / reused grey water', 'Kompos rumah / memakai ulang air bekas', 'home', 5, 'Excellent home habit! Waste and water are both reduced.', 'Kebiasaan rumah yang luar biasa! Sampah dan air sama-sama berkurang.', 1),
('Used natural light and ventilation at home', 'Used natural light and ventilation at home', 'Memakai cahaya dan ventilasi alami di rumah', 'home', 4, 'Smart home comfort without extra energy.', 'Kenyamanan rumah yang cerdas tanpa energi tambahan.', 1),
('Watered plants or cleaned responsibly', 'Watered plants or cleaned responsibly', 'Menyiram tanaman atau membersihkan dengan bertanggung jawab', 'home', 3, 'Responsible home care keeps the environment healthy.', 'Perawatan rumah yang bertanggung jawab menjaga lingkungan tetap sehat.', 1),
('Turned off unused home appliances', 'Turned off unused home appliances', 'Mematikan alat rumah yang tidak dipakai', 'home', 2, 'Good energy discipline at home.', 'Disiplin energi yang baik di rumah.', 1),
('Used reusable items at home', 'Used reusable items at home', 'Memakai barang pakai ulang di rumah', 'home', 1, 'Reuse is a small action with steady impact.', 'Pakai ulang adalah aksi kecil dengan dampak konsisten.', 1),
('Normal home activity', 'Normal home activity', 'Aktivitas rumah normal', 'home', 0, 'Neutral — try one home eco action today.', 'Netral — coba satu aksi eko di rumah hari ini.', 1),
('Left lights on at home', 'Left lights on at home', 'Membiarkan lampu menyala di rumah', 'home', -1, 'Switch lights off when not needed.', 'Matikan lampu saat tidak dibutuhkan.', 1),
('Long shower / excessive home water use', 'Long shower / excessive home water use', 'Mandi lama / boros air di rumah', 'home', -2, 'Water waste adds hidden energy use too.', 'Pemborosan air juga menambah penggunaan energi tersembunyi.', 1),
('Left appliances plugged in all day', 'Left appliances plugged in all day', 'Membiarkan alat listrik tersambung seharian', 'home', -3, 'Unplug unused devices to reduce standby power.', 'Cabut perangkat yang tidak dipakai untuk mengurangi daya siaga.', 1),
('AC or cooler used excessively at home', 'AC or cooler used excessively at home', 'AC atau pendingin dipakai berlebihan di rumah', 'home', -4, 'Try natural ventilation or a higher thermostat setting.', 'Coba ventilasi alami atau suhu termostat lebih tinggi.', 1),
('Wasted energy and water at home all day', 'Wasted energy and water at home all day', 'Boros energi dan air di rumah seharian', 'home', -5, 'High home impact. Reset with small habits tomorrow.', 'Dampak rumah tinggi. Perbaiki dengan kebiasaan kecil besok.', 1),
('Consistently saved energy all day', 'Consistently saved energy all day', 'Menghemat energi sepanjang hari', 'energy', 5, '💡 Energy champion! You inspire others.', '💡 Juara energi! Kamu menginspirasi orang lain.', 1),
('No AC/Cooler, used natural ventilation', 'No AC/Cooler, used natural ventilation', 'Tidak pakai AC/Pendingin, pakai ventilasi alami', 'energy', 4, 'Natural cooling saves huge energy.', 'Pendinginan alami menghemat banyak energi.', 1),
('No lift for ≤2 floors', 'No lift for ≤2 floors', 'Tidak pakai lift untuk ≤2 lantai', 'energy', 3, 'Stairs are healthy and green!', 'Tangga itu sehat dan hijau!', 1),
('Turned off cooler/fan before leaving', 'Turned off cooler/fan before leaving', 'Matikan pendingin/kipas sebelum pergi', 'energy', 2, 'Small habit, big impact.', 'Kebiasaan kecil, dampak besar.', 1),
('Turned off lights/devices after use', 'Turned off lights/devices after use', 'Matikan lampu/perangkat setelah pakai', 'energy', 1, 'Good! Keep it consistent.', 'Bagus! Tetap konsisten.', 1),
('Normal energy use', 'Normal energy use', 'Penggunaan energi normal', 'energy', 0, 'Neutral — try one green action tomorrow.', 'Netral — coba satu aksi hijau besok.', 1),
('Excessive gadget use', 'Excessive gadget use', 'Penggunaan gadget berlebihan', 'energy', -1, 'Reduce screen time to save energy.', 'Kurangi waktu layar untuk hemat energi.', 1),
('Left electronics on', 'Left electronics on', 'Meninggalkan elektronik menyala', 'energy', -2, 'Unplug to avoid vampire power.', 'Cabut untuk menghindari daya vampir.', 1),
('Used lift for 1 floor', 'Used lift for 1 floor', 'Pakai lift untuk 1 lantai', 'energy', -3, 'Take stairs next time!', 'Pakai tangga lain kali!', 1),
('AC used >6 hours', 'AC used >6 hours', 'AC digunakan >6 jam', 'energy', -4, 'Set thermostat 24°C + fan.', 'Atur termostat 24°C + kipas.', 1),
('Wasted energy consistently all day', 'Wasted energy consistently all day', 'Boros energi sepanjang hari', 'energy', -5, 'High waste! Turn off unused devices.', 'Pemborosan tinggi! Matikan perangkat yang tidak terpakai.', 1),
('Zero plastic waste produced', 'Zero plastic waste produced', 'Tidak menghasilkan sampah plastik', 'consumption', 5, '🌟 Zero waste hero! Inspiring.', '🌟 Pahlawan tanpa sampah! Menginspirasi.', 1),
('Brought full eco-friendly kit', 'Brought full eco-friendly kit', 'Membawa perlengkapan ramah lingkungan lengkap', 'consumption', 4, 'Reusable bottles/bags = perfect.', 'Botol/tas pakai ulang = sempurna.', 1),
('Brought homemade lunch', 'Brought homemade lunch', 'Membawa bekal makan siang', 'consumption', 3, 'Home meals avoid packaging.', 'Makanan rumahan menghindari kemasan.', 1),
('Brought own tumbler', 'Brought own tumbler', 'Membawa tumbler sendiri', 'consumption', 2, 'Refillable = less plastic.', 'Dapat diisi ulang = lebih sedikit plastik.', 1),
('Finished food with no leftovers', 'Finished food with no leftovers', 'Menghabiskan makanan tanpa sisa', 'consumption', 1, 'No waste = responsible.', 'Tanpa sampah = bertanggung jawab.', 1),
('Normal consumption', 'Normal consumption', 'Konsumsi normal', 'consumption', 0, 'Neutral — aim to reduce plastic.', 'Netral — bertujuan mengurangi plastik.', 1),
('Bought plastic bottled water', 'Bought plastic bottled water', 'Membeli air kemasan plastik', 'consumption', -1, 'Carry a reusable bottle!', 'Bawa botol pakai ulang!', 1),
('Used single-use plastic', 'Used single-use plastic', 'Menggunakan plastik sekali pakai', 'consumption', -2, 'Avoid straws/bags, bring own.', 'Hindari sedotan/tas, bawa sendiri.', 1),
('Ordered food in plastic packaging', 'Ordered food in plastic packaging', 'Memesan makanan dalam kemasan plastik', 'consumption', -3, 'Takeout creates waste. Dine-in or cook.', 'Bawa pulang menciptakan sampah. Makan di tempat atau masak.', 1),
('Generated lots of plastic waste', 'Generated lots of plastic waste', 'Menghasilkan banyak sampah plastik', 'consumption', -4, 'High plastic footprint. Reduce now.', 'Jejak plastik tinggi. Kurangi sekarang.', 1),
('Used styrofoam', 'Used styrofoam', 'Menggunakan styrofoam', 'consumption', -5, 'Styrofoam is terrible. Avoid completely!', 'Styrofoam sangat buruk. Hindari sepenuhnya!', 1),
('Recycled waste into useful items', 'Recycled waste into useful items', 'Mendaur ulang sampah menjadi barang berguna', 'waste', 5, '♻️ Upcycling genius!', '♻️ Jenius daur ulang!', 1),
('Reminded others to dispose properly', 'Reminded others to dispose properly', 'Mengingatkan orang lain untuk membuang dengan benar', 'waste', 4, 'Leadership for the planet!', 'Kepemimpinan untuk planet!', 1),
('Separated waste by type', 'Separated waste by type', 'Memisahkan sampah berdasarkan jenis', 'waste', 3, 'Great sorting habit!', 'Kebiasaan memilah yang bagus!', 1),
('Reused items still usable', 'Reused items still usable', 'Menggunakan kembali barang yang masih bisa dipakai', 'waste', 2, 'Reuse extends product life.', 'Penggunaan ulang memperpanjang umur produk.', 1),
('Threw trash in bin', 'Threw trash in bin', 'Membuang sampah ke tempat sampah', 'waste', 1, 'Basic but essential.', 'Dasar tapi penting.', 1),
('No special waste action', 'No special waste action', 'Tidak ada tindakan sampah khusus', 'waste', 0, 'Neutral — try sorting tomorrow.', 'Netral — coba memilah besok.', 1),
('Left trash scattered without action', 'Left trash scattered without action', 'Meninggalkan sampah berserakan tanpa tindakan', 'waste', -1, 'Pick it up! Every piece matters.', 'Ambil! Setiap potongan berarti.', 1),
('Littered improperly', 'Littered improperly', 'Membuang sampah sembarangan', 'waste', -2, 'Never litter. Use bins.', 'Jangan pernah buang sampah sembarangan. Pakai tempat sampah.', 1),
('Accumulated waste without management', 'Accumulated waste without management', 'Menumpuk sampah tanpa pengelolaan', 'waste', -3, 'Bad habit — start recycling.', 'Kebiasaan buruk — mulai daur ulang.', 1),
('Dumped waste into drains / buried trash', 'Dumped waste into drains / buried trash', 'Membuang sampah ke saluran air/mengubur sampah', 'waste', -4, 'Pollutes water/soil. Use proper disposal.', 'Mencemari air/tanah. Gunakan pembuangan yang tepat.', 1),
('Burned trash', 'Burned trash', 'Membakar sampah', 'waste', -5, '🔥 Burning releases toxins. Stop immediately!', '🔥 Membakar melepaskan racun. Hentikan segera!', 1),
('Consistently saved water', 'Consistently saved water', 'Menghemat air secara konsisten', 'environment', 5, '💧 Water saver = planet saver.', '💧 Penghemat air = penyelamat planet.', 1),
('Made a mini garden at home', 'Made a mini garden at home', 'Membuat kebun mini di rumah', 'environment', 4, '🌱 Gardening boosts biodiversity.', '🌱 Berkebun meningkatkan keanekaragaman hayati.', 1),
('Planted or cared for plants', 'Planted or cared for plants', 'Menanam atau merawat tanaman', 'environment', 3, 'Plants absorb CO₂!', 'Tanaman menyerap CO₂!', 1),
('Used water sparingly', 'Used water sparingly', 'Menggunakan air secukupnya', 'environment', 2, 'Smart water use saves energy too.', 'Penggunaan air cerdas menghemat energi juga.', 1),
('Cleaned green spaces nearby', 'Cleaned green spaces nearby', 'Membersihkan ruang hijau di sekitar', 'environment', 1, 'Community care = heroic.', 'Peduli komunitas = heroik.', 1),
('No special environmental action', 'No special environmental action', 'Tidak ada tindakan lingkungan khusus', 'environment', 0, 'Neutral — try planting a small seed.', 'Netral — coba menanam benih kecil.', 1),
('Let water run unused', 'Let water run unused', 'Membiarkan air mengalir tidak terpakai', 'environment', -1, 'Turn off tap while brushing.', 'Matikan keran saat menyikat gigi.', 1),
('Excessive water use', 'Excessive water use', 'Penggunaan air berlebihan', 'environment', -2, 'Long showers = waste.', 'Mandi lama = pemborosan.', 1),
('Littered green areas', 'Littered green areas', 'Membuang sampah di area hijau', 'environment', -3, 'Keep nature clean!', 'Jaga kebersihan alam!', 1),
('Damaged plants or green areas', 'Damaged plants or green areas', 'Merusak tanaman atau area hijau', 'environment', -4, 'Respect nature — don''t harm.', 'Hormati alam — jangan merusak.', 1),
('Let plants die / neglected', 'Let plants die / neglected', 'Membiarkan tanaman mati / terabaikan', 'environment', -5, 'Water plants! Every leaf matters.', 'Siram tanaman! Setiap daun berarti.', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  name_en = VALUES(name_en),
  name_id = VALUES(name_id),
  carbon_value = VALUES(carbon_value),
  feedback_en = VALUES(feedback_en),
  feedback_id = VALUES(feedback_id),
  is_default = VALUES(is_default);

INSERT INTO badges (name, description, icon, requirement_type, requirement_value) VALUES
('Green Thumb', 'Earn 100 CU', '🌿', 'carbon_points', 100),
('Recycling Guru', 'Earn 250 CU', '♻️', 'carbon_points', 250),
('Earth Buddy', 'Earn 500 CU', '🐼', 'carbon_points', 500),
('Climate Hero', 'Earn 1000 CU', '⚡', 'carbon_points', 1000)
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  icon = VALUES(icon),
  requirement_type = VALUES(requirement_type),
  requirement_value = VALUES(requirement_value);

DELETE ub FROM user_badges ub
JOIN badges b ON b.id = ub.badge_id
WHERE b.name = 'Earth Guardian';

DELETE FROM badges WHERE name = 'Earth Guardian';

INSERT INTO milestones (name, description, target_value) VALUES
('First Green Step', 'Reach 25 Journey Points', 25),
('Carbon Reducer', 'Reach 50 Journey Points', 50),
('Green Champion', 'Reach 75 Journey Points', 75),
('Earth Guardian', 'Reach 100 Journey Points', 100)
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  target_value = VALUES(target_value);

INSERT INTO quests (slug, icon, name, description, requirement_value, reward, is_active) VALUES
('first-green-step', '🌱', '🌱 First Green Step', 'Log your first eco-action', 50, 25, 1),
('energy-saver', '💡', '💡 Energy Saver', 'Save energy by turning off unused devices', 150, 25, 1),
('plastic-free', '♻️', '♻️ Plastic Free', 'Avoid single-use plastics consistently', 300, 25, 1),
('tree-guardian', '🌳', '🌳 Tree Guardian', 'Support reforestation efforts', 500, 25, 1)
ON DUPLICATE KEY UPDATE
  icon = VALUES(icon),
  name = VALUES(name),
  description = VALUES(description),
  requirement_value = VALUES(requirement_value),
  reward = VALUES(reward),
  is_active = VALUES(is_active);
