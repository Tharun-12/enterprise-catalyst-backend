const express = require("express");
const router = express.Router();
const db = require("../db"); // Update path if required

// =======================
// Create Inquiry
// =======================
router.post("/inquiries", async (req, res) => {
  try {
    const {
      full_name,
      phone_number,
      email,
      company_name,
      product_interest,
      message
    } = req.body;

    if (!full_name || !phone_number || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Required fields are missing."
      });
    }

    const sql = `
      INSERT INTO inquiries
      (
        full_name,
        phone_number,
        email,
        company_name,
        product_interest,
        message
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.execute(sql, [
      full_name,
      phone_number,
      email,
      company_name,
      product_interest,
      message
    ]);

    res.status(201).json({
      success: true,
      message: "Inquiry submitted successfully.",
      id: result.insertId
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


// =======================
// Get All Inquiries
// =======================
router.get("/inquiries", async (req, res) => {
  try {

    const [rows] = await db.execute(`
      SELECT *
      FROM inquiries
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


// =======================
// Get Single Inquiry
// =======================
router.get("/inquiries/:id", async (req, res) => {
  try {

    const [rows] = await db.execute(
      "SELECT * FROM inquiries WHERE id=?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Inquiry not found."
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


// =======================
// Update Inquiry
// =======================
router.put("/inquiries/:id", async (req, res) => {
  try {

    const {
      full_name,
      phone_number,
      email,
      company_name,
      product_interest,
      message
    } = req.body;

    const sql = `
      UPDATE inquiries
      SET
        full_name=?,
        phone_number=?,
        email=?,
        company_name=?,
        product_interest=?,
        message=?
      WHERE id=?
    `;

    const [result] = await db.execute(sql, [
      full_name,
      phone_number,
      email,
      company_name,
      product_interest,
      message,
      req.params.id
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Inquiry not found."
      });
    }

    res.json({
      success: true,
      message: "Inquiry updated successfully."
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


// =======================
// Delete Inquiry
// =======================
router.delete("/inquiries/:id", async (req, res) => {
  try {

    const [result] = await db.execute(
      "DELETE FROM inquiries WHERE id=?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Inquiry not found."
      });
    }

    res.json({
      success: true,
      message: "Inquiry deleted successfully."
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;