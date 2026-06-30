import { query } from "../config/db.js";

export const Profile = {
  findByUserId(userId) {
    return query("SELECT * FROM user_profiles WHERE user_id = :userId", { userId });
  },
  async upsert(userId, data) {
    const existing = await this.findByUserId(userId);
    const params = {
      userId,
      fullName: data.full_name,
      address: data.address,
      gender: data.gender,
      phoneNumber: data.phone_number,
      bio: data.bio || null,
      photo: data.photo || null
    };

    if (existing.length) {
      await query(
        `UPDATE user_profiles
         SET full_name = :fullName, address = :address, gender = :gender,
             phone_number = :phoneNumber, bio = :bio, photo = :photo
         WHERE user_id = :userId`,
        params
      );
      return this.findByUserId(userId);
    }

    await query(
      `INSERT INTO user_profiles
       (user_id, full_name, address, gender, phone_number, bio, photo)
       VALUES (:userId, :fullName, :address, :gender, :phoneNumber, :bio, :photo)`,
      params
    );
    return this.findByUserId(userId);
  }
};
