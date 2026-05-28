const express = require("express");
const router = express.Router();
const db = require("../config/dbconfig");
const {
  requireRole,
  adminRoles,
  qaRoles,
  agentRoles,
} = require("../middlewares/authMiddleware");

// --------------- QA Audit Data --------------------
router.get(
  "/qaAuditData",
  requireRole(...adminRoles, ...qaRoles, ...agentRoles),
  async (req, res) => {
    try {
      if ([...adminRoles, ...qaRoles].includes(req.session.user.userLevel)) {
        [rows] = await db.execute(
          `SELECT * FROM 1003_cmx_appdata_qaportal_database_ph.db_cmxph_qa_audits`,
        );

        return res.json({
          success: true,
          data: rows,
        });
      } else {
        const [rows] = await db.execute(
          `
      SELECT * FROM 1003_cmx_appdata_qaportal_database_ph.db_cmxph_qa_audits WHERE AGENT_ID=?;`,
          [req.session.user.empId],
        );

        return res.json({
          success: true,
          data: rows,
        });
      }
    } catch (err) {
      console.error("QA Audit DB error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to load QA Audit Data.",
      });
    }
  },
);

//-------Save QA Audit---------
router.post(
  "/save_qa_audit",
  requireRole(...adminRoles, ...qaRoles),
  async (req, res) => {
    try {
      const data = req.body;

      if (!data.QA_FORM_NAME || !data.AGENT_ID) {
        return res.status(400).send({ error: "Missing required fields." });
      }

      const columns = Object.keys(data)
        .map((col) => `\`${col}\``)
        .join(", ");
      const placeholders = Object.keys(data)
        .map(() => "?")
        .join(", ");
      const values = Object.values(data);

      const sql = `
      INSERT INTO 1003_cmx_appdata_qaportal_database_ph.db_cmxph_qa_audits
      (${columns})
      VALUES (${placeholders})
    `;

      await db.execute(sql, values);

      res
        .status(200)
        .send({ message: "QA Audit entry inserted successfully." });
    } catch (err) {
      console.error("❌ Insert failed:", err.message);
      res.status(500).send({
        error: "Internal server error",
        details: "Error processing request",
      });
    }
  },
);

//Get QA Form by ID
router.get(
  "/audit_by_id/:id",
  requireRole(...adminRoles, ...qaRoles, ...agentRoles),
  async (req, res) => {
    const { id } = req.params;
    try {
      const [rows] = await db.query(
        `SELECT * FROM 1003_cmx_appdata_qaportal_database_ph.db_cmxph_qa_audits WHERE ID = ?`,
        [id],
      );

      if (rows.length === 0) {
        return res.status(404).json({ message: "Audit not found" });
      }

      res.status(200).json(rows[0]);
    } catch (error) {
      console.error("❌ Error fetching audit:", error);
      res.status(500).json({
        message: "Internal server error.",
        error: "Error processing request.",
      });
    }
  },
);

//Get Audit Status
router.post(
  "/audit_status",
  requireRole(...adminRoles, ...qaRoles),
  async (req, res) => {
    try {
      const { auditId, STATUS, DISPUTE_REASON } = req.body;

      if (!auditId) {
        return res.status(400).json({ error: "Missing audit ID" });
      }

      const sql = `
      UPDATE 1003_cmx_appdata_qaportal_database_ph.db_cmxph_qa_audits
      SET STATUS = ?, DISPUTEREASON = ?
      WHERE ID = ?
    `;

      await db.execute(sql, [STATUS, DISPUTE_REASON || "", auditId]);

      res.status(200).json({ message: "Acknowledged successfully." });
    } catch (err) {
      console.error("❌ Acknowledgement failed:", err);
      res.status(500).json({ error: "Acknowledgement update failed" });
    }
  },
);

router.post(
  "/dispute_disposition",
  requireRole(...adminRoles, ...qaRoles),
  async (req, res) => {
    try {
      const { auditId, STATUS, DISPUTE_DISPOSITION } = req.body;

      if (!auditId) {
        return res.status(400).json({ error: "Missing audit ID" });
      }

      const sql = `
      UPDATE 1003_cmx_appdata_qaportal_database_ph.db_cmxph_qa_audits
      SET STATUS = ?, DISPUTEDISPOSITION = ?
      WHERE ID = ?
    `;

      await db.execute(sql, [STATUS, DISPUTE_DISPOSITION || "", auditId]);

      res.status(200).json({ message: "Acknowledged successfully." });
    } catch (err) {
      console.error("❌ Acknowledgement failed:", err);
      res.status(500).json({ error: "Acknowledgement update failed" });
    }
  },
);

module.exports = router;
