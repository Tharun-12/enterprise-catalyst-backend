// routes/specializationRoutes.js
const express = require("express");
const router = express.Router();
const db = require("../db");

// Get all specializations with category info
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.id, s.category_id, c.category_name, s.spec_name, s.spec_value, 
              s.color_brand_mapping,
              s.created_at, s.updated_at 
       FROM specializations s
       LEFT JOIN product_categories c ON s.category_id = c.id
       ORDER BY s.spec_name ASC`
    );
    
    // Parse JSON fields before sending
    const parsedRows = rows.map(row => ({
      ...row,
      color_brand_mapping: row.color_brand_mapping ? JSON.parse(row.color_brand_mapping) : {}
    }));
    
    res.json({
      success: true,
      data: parsedRows
    });
  } catch (error) {
    console.error("Error fetching specializations:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch specializations",
      error: error.message
    });
  }
});

// Get a single specialization by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT s.id, s.category_id, c.category_name, s.spec_name, s.spec_value, 
              s.color_brand_mapping,
              s.created_at, s.updated_at 
       FROM specializations s
       LEFT JOIN product_categories c ON s.category_id = c.id
       WHERE s.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Specialization not found"
      });
    }

    // Parse JSON fields
    const row = rows[0];
    const parsedRow = {
      ...row,
      color_brand_mapping: row.color_brand_mapping ? JSON.parse(row.color_brand_mapping) : {}
    };

    res.json({
      success: true,
      data: parsedRow
    });
  } catch (error) {
    console.error("Error fetching specialization:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch specialization",
      error: error.message
    });
  }
});

// Create a new specialization
router.post("/", async (req, res) => {
  try {
    const { 
      category_id, spec_name, spec_value, color_brand_mapping
    } = req.body;

    // Validate required fields
    if (!category_id) {
      return res.status(400).json({
        success: false,
        message: "Category is required"
      });
    }

    if (!spec_name || !spec_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Specification name is required"
      });
    }

    if (!spec_value || !spec_value.trim()) {
      return res.status(400).json({
        success: false,
        message: "Specification value is required"
      });
    }

    // Check if category exists
    const [categoryExists] = await db.query(
      "SELECT id FROM product_categories WHERE id = ?",
      [category_id]
    );

    if (categoryExists.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Selected category does not exist"
      });
    }

    // Check if spec_name already exists for this category
    const [existingSpec] = await db.query(
      "SELECT id FROM specializations WHERE spec_name = ? AND category_id = ?",
      [spec_name.trim(), category_id]
    );

    if (existingSpec.length > 0) {
      return res.status(400).json({
        success: false,
        message: "This specification already exists for the selected category"
      });
    }

    // Insert new specialization
    const [result] = await db.query(
      `INSERT INTO specializations 
       (category_id, spec_name, spec_value, color_brand_mapping) 
       VALUES (?, ?, ?, ?)`,
      [
        category_id,
        spec_name.trim(),
        spec_value.trim(),
        color_brand_mapping ? JSON.stringify(color_brand_mapping) : null
      ]
    );

    // Get the newly created specialization
    const [newSpec] = await db.query(
      `SELECT s.id, s.category_id, c.category_name, s.spec_name, s.spec_value, 
              s.color_brand_mapping,
              s.created_at, s.updated_at 
       FROM specializations s
       LEFT JOIN product_categories c ON s.category_id = c.id
       WHERE s.id = ?`,
      [result.insertId]
    );

    // Parse JSON fields
    const parsedSpec = {
      ...newSpec[0],
      color_brand_mapping: newSpec[0].color_brand_mapping ? JSON.parse(newSpec[0].color_brand_mapping) : {}
    };

    res.status(201).json({
      success: true,
      message: "Specialization created successfully",
      data: parsedSpec
    });
  } catch (error) {
    console.error("Error creating specialization:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create specialization",
      error: error.message
    });
  }
});

// Update a specialization
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      category_id, spec_name, spec_value, color_brand_mapping
    } = req.body;

    // Validate required fields
    if (!category_id) {
      return res.status(400).json({
        success: false,
        message: "Category is required"
      });
    }

    if (!spec_name || !spec_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Specification name is required"
      });
    }

    if (!spec_value || !spec_value.trim()) {
      return res.status(400).json({
        success: false,
        message: "Specification value is required"
      });
    }

    // Check if specialization exists
    const [spec] = await db.query(
      "SELECT id FROM specializations WHERE id = ?",
      [id]
    );

    if (spec.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Specialization not found"
      });
    }

    // Check if category exists
    const [categoryExists] = await db.query(
      "SELECT id FROM product_categories WHERE id = ?",
      [category_id]
    );

    if (categoryExists.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Selected category does not exist"
      });
    }

    // Check if another spec has the same name (excluding current)
    const [existingSpec] = await db.query(
      "SELECT id FROM specializations WHERE spec_name = ? AND category_id = ? AND id != ?",
      [spec_name.trim(), category_id, id]
    );

    if (existingSpec.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Another specification with this name already exists for the selected category"
      });
    }

    // Update specialization
    await db.query(
      `UPDATE specializations SET 
        category_id = ?,
        spec_name = ?,
        spec_value = ?,
        color_brand_mapping = ?
       WHERE id = ?`,
      [
        category_id,
        spec_name.trim(),
        spec_value.trim(),
        color_brand_mapping ? JSON.stringify(color_brand_mapping) : null,
        id
      ]
    );

    // Get the updated specialization
    const [updatedSpec] = await db.query(
      `SELECT s.id, s.category_id, c.category_name, s.spec_name, s.spec_value, 
              s.color_brand_mapping,
              s.created_at, s.updated_at 
       FROM specializations s
       LEFT JOIN product_categories c ON s.category_id = c.id
       WHERE s.id = ?`,
      [id]
    );

    // Parse JSON fields
    const parsedSpec = {
      ...updatedSpec[0],
      color_brand_mapping: updatedSpec[0].color_brand_mapping ? JSON.parse(updatedSpec[0].color_brand_mapping) : {}
    };

    res.json({
      success: true,
      message: "Specialization updated successfully",
      data: parsedSpec
    });
  } catch (error) {
    console.error("Error updating specialization:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update specialization",
      error: error.message
    });
  }
});

// Delete a specialization
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Check if specialization exists
    const [spec] = await db.query(
      "SELECT id, spec_name FROM specializations WHERE id = ?",
      [id]
    );

    if (spec.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Specialization not found"
      });
    }

    // Delete specialization
    await db.query(
      "DELETE FROM specializations WHERE id = ?",
      [id]
    );

    res.json({
      success: true,
      message: `Specialization "${spec[0].spec_name}" deleted successfully`
    });
  } catch (error) {
    console.error("Error deleting specialization:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete specialization",
      error: error.message
    });
  }
});

module.exports = router;