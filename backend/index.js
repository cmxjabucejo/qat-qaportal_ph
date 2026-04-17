const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const AWS = require("aws-sdk");
const bcrypt = require("bcrypt");
const db = require("./config/dbconfig");
const multer = require("multer");
const fs = require("fs");
const upload = multer({ storage: multer.memoryStorage() });
const s3 = new AWS.S3();

dotenv.config();

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Nodemailer (SES)
const transporter = nodemailer.createTransport({
  host: "email-smtp.us-east-1.amazonaws.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const app = express();

// Middleware
const PORT = Number(process.env.SERVER_PORT) || 5010;

// Middleware
app.use(express.json());

app.use(
  cors({
    origin: ["http://localhost:3010", "https://qaportal.cmxph.com"],
    credentials: true,
  })
);

// ---------- User management ----------
// get all users
app.get("/api/getAppUsers", async (req, res) => {
  try {
    const [rows] = await db.execute(
      `
      SELECT * FROM 0000_cmx_appdata_appusers.db_cmx_appusers_qaportal_ph
      `
    );

    return res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("QA Audit DB error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to load QA Portal Users.",
    });
  }
});


//check email for login
app.post("/api/check-email", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      error: "Email is required",
    });
  }

  try {
    const [rows] = await db.execute(
      `SELECT empId, user_email, user_last_name, user_first_name, user_full_name, user_access_level, user_status 
       FROM 0000_cmx_appdata_appusers.db_cmx_appusers_qaportal_ph 
       WHERE user_email = ?`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Email not registered",
      });
    }

    const user = rows[0];

    if (user.user_status !== "Active") {
      return res.status(403).json({
        success: false,
        error: "Inactive user",
      });
    }

    // ✅ Unified response
    return res.json({
      success: true,
      user: {
        empId: user.empId,
        userid: user.user_email,
        userEmail: user.user_email,
        lastName: user.user_last_name,
        firstName: user.user_first_name,
        fullName: user.user_full_name,
        userLevel: user.user_access_level,
        userStatus: user.user_status,
      },
    });
  } catch (err) {
    console.error("Email check DB error:", err);
    return res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});


//Add Users
app.post("/api/addAppUser", async (req, res) => {
  const {
    empId,
    user_email,
    user_first_name,
    user_last_name,
    user_access_level,
  } = req.body;

  const user_full_name = `${user_first_name} ${user_last_name}`;
  const user_status = "Active";

  try {
    const sql = `
      INSERT INTO 0000_cmx_appdata_appusers.db_cmx_appusers_qaportal_ph
      (
        empId,
        user_email,
        user_last_name,
        user_first_name,
        user_full_name,
        user_access_level,
        user_status,
        user_registration_date
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE())
    `;

    await db.execute(sql, [
      empId,
      user_email,
      user_last_name,
      user_first_name,
      user_full_name,
      user_access_level,
      user_status,
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error("Add user error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

//Update User
app.post("/api/updateAppUser", async (req, res) => {
  const {
    empId,
    user_access_level,
    user_status,
  } = req.body;

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

    res.json({
      success: true,
      message: "User updated successfully",
    });
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});



// ---------- OTP SENDING ----------
app.post("/api/sendOTP", async (req, res) => {
  try {
    const { emailAddress, requestedDateTime, expiryDateTime } = req.body;

    if (!emailAddress || !requestedDateTime || !expiryDateTime) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields." });
    }

    // ✅ Generate and hash OTP
    const otpPlain = String(
      Math.floor(100000 + Math.random() * 900000)
    ).padStart(6, "0");

    const salt = await bcrypt.genSalt(10);
    const otpHashed = await bcrypt.hash(otpPlain, salt);

    // ✅ Send OTP via email
    await transporter.sendMail({
      from: "noreply@callmaxsolutions.com",
      to: emailAddress,
      subject: "One-Time Password (OTP) - CMX Quality Portal - PH",
      html: `
        <p>Hi,</p>
        <p>Your One-Time Password (OTP) is:</p>
        <h2>${otpPlain}</h2>
        <p>This OTP will expire in <strong>3 minutes</strong>.</p>
        <p>Please do not share your OTP.</p>
        <p>If you did not request this code and suspect invalid use, report instance to dream-devops@callmaxsolutions.com</p>
        <hr>
        <p><strong>Confidentiality & Data Privacy</strong></p>
        <p>This email and its attachments are confidential, intended only for the specified recipient(s), and may contain legally privileged information. Unauthorized review, use, disclosure, or distribution is prohibited. If you received this email by mistake, please notify the sender and delete it and its attachments from your system.</p>
        <p>Opinions expressed are the sender's own and may not reflect those of Callmax Solutions International Inc. While precautions are taken to ensure virus-free emails, we accept no liability for any resulting damage.</p>
        <p>Data Privacy: We respect your data privacy and handle personal data in compliance with applicable laws. Personal data received via email is processed for intended purposes and protected as per our privacy policies. Unauthorized use or disclosure of this email or its contents is prohibited and may be illegal.</p>
      `,
    });

    // ✅ Return hashed OTP only
    res.status(200).json({
      success: true,
      message: "OTP sent successfully.",
      otpHashed,
    });
  } catch (error) {
    console.error("Error in /sendOTP:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while sending the OTP.",
      error: error.message,
    });
  }
});

// --------------- QA Audit Data --------------------
app.get("/api/qaAuditData", async (req, res) => {
  try {
    const [rows] = await db.execute(
      `
      SELECT * FROM 1003_cmx_appdata_qaportal_database_ph.db_cmxph_qa_audits
      `
    );

    return res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("QA Audit DB error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to load QA Audit Data.",
    });
  }
});

//Query
//Audits
app.get("/api/qa_form_list", async (req, res) => {
  try {
    const sqlQuery = `
      SELECT 
        fl.QA_FORM_NAME,
        fl.ACCOUNT,
        fl.LOB,
        fl.TASK,
        fl.CREATED_DATE,
        fl.CREATED_BY,
        fl.STATUS,
        ft.*
      FROM 1003_cmx_appdata_qaportal_database_ph.db_qa_forms_list AS fl
      LEFT JOIN 1003_cmx_appdata_qaportal_database_ph.db_qa_forms_table AS ft ON ft.QA_FORM_NAME = fl.QA_FORM_NAME
      WHERE fl.SITE = "PH" and fl.STATUS = "Active"
    `;

    const [rows] = await db.query(sqlQuery);
    res.status(200).json(rows);
  } catch (error) {
    console.error("❌ Error fetching QA form list:", error);
    res.status(500).json({ message: "Database error", error });
  }
});

// Catalog
app.get("/api/qa_form_list_catalog", async (req, res) => {
  try {
    const sqlQuery = `
      SELECT 
        fl.QA_FORM_NAME,
        fl.ACCOUNT,
        fl.LOB,
        fl.TASK,
        fl.CREATED_DATE,
        fl.CREATED_BY,
        fl.STATUS,
        ft.*
      FROM 1003_cmx_appdata_qaportal_database_ph.db_qa_forms_list AS fl
      LEFT JOIN 1003_cmx_appdata_qaportal_database_ph.db_qa_forms_table AS ft ON ft.QA_FORM_NAME = fl.QA_FORM_NAME
      WHERE fl.SITE = "PH"
    `;

    const [rows] = await db.query(sqlQuery);
    res.status(200).json(rows);
  } catch (error) {
    console.error("❌ Error fetching QA form list:", error);
    res.status(500).json({ message: "Database error", error });
  }
});

// get QA Form by Name
app.get("/api/qa_form_by_name/:qaFormName", async (req, res) => {
    const formName = decodeURIComponent(req.params.qaFormName);
  
    try {
      const sqlQuery = `
        SELECT 
          fl.QA_FORM_NAME,
          fl.ACCOUNT,
          fl.LOB,
          fl.TASK,
          fl.CREATED_DATE,
          fl.CREATED_BY,
          fl.STATUS,
          ft.*
        FROM 1003_cmx_appdata_qaportal_database_ph.db_qa_forms_list AS fl
        LEFT JOIN 1003_cmx_appdata_qaportal_database_ph.db_qa_forms_table AS ft 
          ON ft.QA_FORM_NAME = fl.QA_FORM_NAME
        WHERE fl.QA_FORM_NAME = ?
      `;
  
      const [rows] = await db.query(sqlQuery, [formName]);
  
      if (rows.length === 0) {
        return res.status(404).json({ message: "Form not found" });
      }
  
      const formHeader = {
        QA_FORM_NAME: rows[0].QA_FORM_NAME,
        ACCOUNT: rows[0].ACCOUNT,
        LOB: rows[0].LOB,
        TASK: rows[0].TASK,
        CREATED_DATE: rows[0].CREATED_DATE,
        CREATED_BY: rows[0].CREATED_BY,
        STATUS: rows[0].STATUS
      };
  
      const formDetails = {};
      rows.forEach(row => {
        Object.keys(row).forEach(key => {
          if (!(key in formHeader)) {
            formDetails[key] = row[key];
          }
        });
      });
  
      res.status(200).json({ header: formHeader, details: formDetails });
  
    } catch (error) {
      console.error("❌ Error fetching form by name:", error);
      res.status(500).json({ message: "Database error", error });
    }
  });


//Get QA Form by ID  
app.get("/api/audit_by_id/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const [rows] = await db.query(
        `SELECT * FROM 1003_cmx_appdata_qaportal_database_ph.db_cmxph_qa_audits WHERE ID = ?`,
        [id]
      );
  
      if (rows.length === 0) {
        return res.status(404).json({ message: "Audit not found" });
      }
  
      res.status(200).json(rows[0]);
    } catch (error) {
      console.error("❌ Error fetching audit:", error);
      res.status(500).json({ message: "Database error", error });
    }
  });

  //Get Audit Status
app.post("/api/audit_status", async (req, res) => {
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
});

app.post("/api/dispute_disposition", async (req, res) => {
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
});


//-------Save QA Audit---------
app.post("/api/save_qa_audit", async (req, res) => {
  try {
    const data = req.body;

    if (!data.QA_FORM_NAME || !data.AGENT_ID) {
      return res.status(400).send({ error: "Missing required fields." });
    }

    const columns = Object.keys(data).map(col => `\`${col}\``).join(", ");
    const placeholders = Object.keys(data).map(() => "?").join(", ");
    const values = Object.values(data);

    const sql = `
      INSERT INTO 1003_cmx_appdata_qaportal_database_ph.db_cmxph_qa_audits
      (${columns})
      VALUES (${placeholders})
    `;

    await db.execute(sql, values);

    res.status(200).send({ message: "QA Audit entry inserted successfully." });
  } catch (err) {
    console.error("❌ Insert failed:", err.message);
    res.status(500).send({ error: "Insert failed", details: err.message });
  }
});


//QA Form Designer
  //Designer
app.post("/api/qa_forms_list", async (req, res) => {
  try {
    const {
      QA_FORM_NAME,
      ACCOUNT,
      LOB,
      TASK,
      CREATED_DATE,
      CREATED_BY,
      STATUS,
    } = req.body;

    const sql = `
      INSERT INTO 1003_cmx_appdata_qaportal_database_ph.db_qa_forms_list
      (QA_FORM_NAME, ACCOUNT, LOB, TASK, CREATED_DATE, CREATED_BY, STATUS)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    await db.execute(sql, [
      QA_FORM_NAME,
      ACCOUNT,
      LOB,
      TASK,
      CREATED_DATE,
      CREATED_BY,
      STATUS,
    ]);

    res.status(200).send({ message: "Form list inserted." });
  } catch (err) {
    console.error("Insert failed:", err);
    res.status(500).send({ error: "Insert failed" });
  }
});


app.post("/api/qa_forms_table", async (req, res) => {
  try {
    const data = req.body;

    if (!data.QA_FORM_NAME) {
      return res.status(400).json({ error: "Missing QA_FORM_NAME." });
    }

    const columns = Object.keys(data).map(col => `\`${col}\``).join(", ");
    const placeholders = Object.keys(data).map(() => "?").join(", ");
    const values = Object.values(data);

    const sql = `
      INSERT INTO 1003_cmx_appdata_qaportal_database_ph.db_qa_forms_table
      (${columns})
      VALUES (${placeholders})
    `;

    await db.execute(sql, values);

    res.status(200).json({ message: "QA Form saved to db_qa_forms_table." });
  } catch (err) {
    console.error("❌ Error saving QA form:", err);
    res.status(500).json({ error: "Insert failed", details: err.message });
  }
});


app.put("/api/qa_form_list/:qaFormName/status", async (req, res) => {
  const { qaFormName } = req.params;
  const { status } = req.body;

  if (!["Active", "Disabled"].includes(status)) {
    return res.status(400).json({ message: "Invalid status value" });
  }

  try {
    const [result] = await db.query(
      `UPDATE 1003_cmx_appdata_qaportal_database_ph.db_qa_forms_list SET STATUS = ? WHERE QA_FORM_NAME = ?`,
      [status, qaFormName]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Form not found" });
    }

    // console.log(`✅ QA Form "${qaFormName}" updated to STATUS: ${status}`);
    res.status(200).json({ message: "Form status updated" });
  } catch (error) {
    console.error("❌ Error updating status:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

//------------ Employee Lookup --------------
app.get("/api/employees", async (req, res) => {
  try {
    const [employees] = await db.query(
      `SELECT EMPLOYEEID AS employeeId, CONCAT(FIRSTNAME, " ", LASTNAME) AS employee_name, L1_MANAGER_ID as supervisorId, L1_MANAGER_NAME as supervisorName, ACCOUNT as account
       FROM 0001_cmx_appdata_employeeroster.db_cmxph_employee_roster
       WHERE FULLNAME IS NOT NULL
       AND EMPLOYEESTATUS NOT IN ('Terminated', 'Resigned', 'End of Contract')
       ORDER BY FULLNAME ASC`
    );

    if (employees.length === 0) {
      return res.status(404).json({ message: "No active employees found" });
    }

    // console.log("✅ Active Employees Fetched:", employees.length);
    res.status(200).json(employees);
  } catch (error) {
    console.error("❌ Error fetching employees:", error);
    res.status(500).json({ message: "Database error", error });
  }
});

//--------------Account / LOB / TASK -------------------
//Accoount List
app.get('/api/accountList', async (req, res) => {
  const query = `
    SELECT ACCOUNTCODE, ACCOUNT, LOB, TASK
    FROM 1000_cmx_appdata_client_database.db_cmx_client_roster
     WHERE ID IN (
      SELECT MAX(ID) 
      FROM 1000_cmx_appdata_client_database.db_cmx_client_roster
      WHERE STATUS = 'Active' 
      GROUP BY ACCOUNTCODE
    )
    ORDER BY ID DESC;`;

  try {
    const [result] = await db.query(query);

    res.json(result);
  } catch (error) {
    console.error('Error fetching account list:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

//LOB List
app.get('/api/lobList', async (req, res) => {
  const { account } = req.query; // Get the selected ACCOUNT from query params

  const query = `
    SELECT DISTINCT LOB
    FROM 1000_cmx_appdata_client_database.db_cmx_client_roster
    WHERE ACCOUNT = ?
      AND ID IN (
        SELECT MAX(ID)
        FROM 1000_cmx_appdata_client_database.db_cmx_client_roster
        GROUP BY ACCOUNTCODE
      )
    ORDER BY LOB;`; 

  try {
    const [result] = await db.query(query, [account]);
    res.json(result);
  } catch (error) {
    console.error('Error fetching LOB list:', error);
    res.status(500).json({ error: 'Database error' });
  }
});


//Task List
app.get('/api/taskList', async (req, res) => {
  const { account, lob } = req.query;

  const query = `
    SELECT DISTINCT TASK
    FROM 1000_cmx_appdata_client_database.db_cmx_client_roster
    WHERE ACCOUNT = ? AND LOB = ?
      AND ID IN (
        SELECT MAX(ID)
        FROM 1000_cmx_appdata_client_database.db_cmx_client_roster
        GROUP BY ACCOUNTCODE
      )
    ORDER BY TASK;`;

  try {
    const [result] = await db.query(query, [account, lob]);
    res.json(result);
  } catch (error) {
    console.error('Error fetching Task list:', error);
    res.status(500).json({ error: 'Database error' });
  }
});


app.get('/api/accountCode', async (req, res) => {
  const { account, lob, task } = req.query;

  const query = `
    SELECT ACCOUNTCODE
    FROM 1000_cmx_appdata_client_database.db_cmx_client_roster
    WHERE ACCOUNT = ? AND LOB = ? AND TASK = ?
      AND ID IN (
        SELECT MAX(ID)
        FROM 1000_cmx_appdata_client_database.db_cmx_client_roster
        GROUP BY ACCOUNTCODE
      );`;

  try {
    const [result] = await db.query(query, [account, lob, task]);

    if (result.length > 0) {
      res.json(result[0]); // Return the first matching record
    } else {
      res.status(404).json({ error: "ACCOUNTCODE not found" });
    }
  } catch (error) {
    console.error('Error fetching ACCOUNTCODE:', error);
    res.status(500).json({ error: 'Database error' });
  }
});


// ---------- START SERVER ----------
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

