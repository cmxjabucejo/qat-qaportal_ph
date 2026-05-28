const express = require("express");
const router = express.Router();
const db = require("../config/dbconfig");
const { requireRole, adminRoles } = require("../middlewares/authMiddleware");

router.get("/getAppUsers", requireRole(...adminRoles), async (req, res) => {
  const [rows] = await db.execute(`
    SELECT * FROM 0000_cmx_appdata_appusers.db_cmx_appusers_qaportal_ph
  `);

  res.json({ success: true, data: rows });
});

router.post("/addAppUser", requireRole(...adminRoles), async (req, res) => {
  const {
    empId,
    user_email,
    user_first_name,
    user_last_name,
    user_access_level,
  } = req.body;

  // ✅ VALIDATE EMAIL FORMAT
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(user_email)) {
    return res.status(400).json({
      success: false,
      message: "Invalid email format",
    });
  }

  // ✅ ALLOW ONLY COMPANY DOMAIN
  const domain = user_email.split("@")[1]?.toLowerCase();

  if (domain !== "callmaxsolutions.com") {
    return res.status(400).json({
      success: false,
      message: "Only @callmaxsolutions.com emails are allowed.",
    });
  }

  const sql = `
    INSERT INTO 0000_cmx_appdata_appusers.db_cmx_appusers_qaportal_ph
    (empId, user_email, user_last_name, user_first_name, user_full_name, user_access_level, user_status, user_registration_date)
    VALUES (?, ?, ?, ?, ?, ?, 'Active', CURDATE())
  `;

  await db.execute(sql, [
    empId,
    user_email,
    user_last_name,
    user_first_name,
    `${user_first_name} ${user_last_name}`,
    user_access_level,
  ]);

  res.json({ success: true });
});

router.post("/updateAppUser", requireRole(...adminRoles), async (req, res) => {
  const { empId, user_access_level, user_status } = req.body;

  if (!empId || !user_access_level || !user_status) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields",
    });
  }

  try {
    const sql = `
      UPDATE 0000_cmx_appdata_appusers.db_cmx_appusers_qaportal_ph
      SET
        user_access_level = ?,
        user_status = ?
      WHERE empId = ?
    `;

    const [result] = await db.execute(sql, [
      user_access_level,
      user_status,
      empId,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    return res.json({
      success: true,
      message: "User updated successfully",
    });
  } catch (err) {
    console.error("Update user error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

module.exports = router;
