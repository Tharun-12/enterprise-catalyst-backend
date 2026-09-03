// routes/specificationsRoutes.js
const express = require("express");
const router = express.Router();
const db = require("../db");

// Get all specifications with category info
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.id, s.category_id, c.category_name, 
              s.sub_category_id, sc.subcategory_name,
              s.spec_name, 
              s.product_specifications,
              s.created_at, s.updated_at 
       FROM specifications s
       LEFT JOIN product_categories c ON s.category_id = c.id
       LEFT JOIN category_subcategories sc ON s.sub_category_id = sc.id
       ORDER BY s.spec_name ASC`
    );
    
    const parsedRows = rows.map(row => ({
      ...row,
      product_specifications: row.product_specifications ? JSON.parse(row.product_specifications) : []
    }));
    
    res.json({
      success: true,
      data: parsedRows
    });
  } catch (error) {
    console.error("Error fetching specifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch specifications",
      error: error.message
    });
  }
});

// Get a single specification by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT s.id, s.category_id, c.category_name, 
              s.sub_category_id, sc.subcategory_name,
              s.spec_name, 
              s.product_specifications,
              s.created_at, s.updated_at 
       FROM specifications s
       LEFT JOIN product_categories c ON s.category_id = c.id
       LEFT JOIN category_subcategories sc ON s.sub_category_id = sc.id
       WHERE s.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Specification not found"
      });
    }

    const row = rows[0];
    const parsedRow = {
      ...row,
      product_specifications: row.product_specifications ? JSON.parse(row.product_specifications) : []
    };

    res.json({
      success: true,
      data: parsedRow
    });
  } catch (error) {
    console.error("Error fetching specification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch specification",
      error: error.message
    });
  }
});

// Create a new specification
router.post("/", async (req, res) => {
  try {
    const { 
      category_id, sub_category_id, spec_name, product_specifications
    } = req.body;

    console.log('Received data:', req.body);

    // Validate required fields
    if (!category_id) {
      return res.status(400).json({
        success: false,
        message: "Category is required"
      });
    }

    if (!sub_category_id) {
      return res.status(400).json({
        success: false,
        message: "Subcategory is required"
      });
    }

    if (!spec_name || !spec_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Specification name is required"
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

    // Check if subcategory exists and belongs to the category
    const [subCategoryExists] = await db.query(
      "SELECT id FROM category_subcategories WHERE id = ? AND category_id = ?",
      [sub_category_id, category_id]
    );

    if (subCategoryExists.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Selected subcategory does not exist or does not belong to the selected category"
      });
    }

    // Check if spec_name already exists for this category and subcategory
    const [existingSpec] = await db.query(
      "SELECT id FROM specifications WHERE spec_name = ? AND category_id = ? AND sub_category_id = ?",
      [spec_name.trim(), category_id, sub_category_id]
    );

    if (existingSpec.length > 0) {
      return res.status(400).json({
        success: false,
        message: "This specification already exists for the selected category and subcategory"
      });
    }

    // Prepare product specifications
    let specs = product_specifications || [];
    // Remove empty specifications
    specs = specs.filter(spec => spec.spec_name && spec.spec_name.trim() && spec.value && spec.value.trim());

    // Insert new specification
    const [result] = await db.query(
      `INSERT INTO specifications 
       (category_id, sub_category_id, spec_name, product_specifications) 
       VALUES (?, ?, ?, ?)`,
      [
        category_id,
        sub_category_id,
        spec_name.trim(),
        specs.length > 0 ? JSON.stringify(specs) : null
      ]
    );

    const [newSpec] = await db.query(
      `SELECT s.id, s.category_id, c.category_name, 
              s.sub_category_id, sc.subcategory_name,
              s.spec_name, 
              s.product_specifications,
              s.created_at, s.updated_at 
       FROM specifications s
       LEFT JOIN product_categories c ON s.category_id = c.id
       LEFT JOIN category_subcategories sc ON s.sub_category_id = sc.id
       WHERE s.id = ?`,
      [result.insertId]
    );

    const parsedSpec = {
      ...newSpec[0],
      product_specifications: newSpec[0].product_specifications ? JSON.parse(newSpec[0].product_specifications) : []
    };

    res.status(201).json({
      success: true,
      message: "Specification created successfully",
      data: parsedSpec
    });
  } catch (error) {
    console.error("Error creating specification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create specification",
      error: error.message
    });
  }
});

// Update a specification
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      category_id, sub_category_id, spec_name, product_specifications
    } = req.body;

    // Validate required fields
    if (!category_id) {
      return res.status(400).json({
        success: false,
        message: "Category is required"
      });
    }

    if (!sub_category_id) {
      return res.status(400).json({
        success: false,
        message: "Subcategory is required"
      });
    }

    if (!spec_name || !spec_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Specification name is required"
      });
    }

    // Check if specification exists
    const [spec] = await db.query(
      "SELECT id FROM specifications WHERE id = ?",
      [id]
    );

    if (spec.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Specification not found"
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

    // Check if subcategory exists and belongs to the category
    const [subCategoryExists] = await db.query(
      "SELECT id FROM category_subcategories WHERE id = ? AND category_id = ?",
      [sub_category_id, category_id]
    );

    if (subCategoryExists.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Selected subcategory does not exist or does not belong to the selected category"
      });
    }

    // Check if another spec has the same name (excluding current)
    const [existingSpec] = await db.query(
      "SELECT id FROM specifications WHERE spec_name = ? AND category_id = ? AND sub_category_id = ? AND id != ?",
      [spec_name.trim(), category_id, sub_category_id, id]
    );

    if (existingSpec.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Another specification with this name already exists for the selected category and subcategory"
      });
    }

    // Prepare product specifications
    let specs = product_specifications || [];
    specs = specs.filter(spec => spec.spec_name && spec.spec_name.trim() && spec.value && spec.value.trim());

    // Update specification
    await db.query(
      `UPDATE specifications SET 
        category_id = ?,
        sub_category_id = ?,
        spec_name = ?,
        product_specifications = ?
       WHERE id = ?`,
      [
        category_id,
        sub_category_id,
        spec_name.trim(),
        specs.length > 0 ? JSON.stringify(specs) : null,
        id
      ]
    );

    const [updatedSpec] = await db.query(
      `SELECT s.id, s.category_id, c.category_name, 
              s.sub_category_id, sc.subcategory_name,
              s.spec_name, 
              s.product_specifications,
              s.created_at, s.updated_at 
       FROM specifications s
       LEFT JOIN product_categories c ON s.category_id = c.id
       LEFT JOIN category_subcategories sc ON s.sub_category_id = sc.id
       WHERE s.id = ?`,
      [id]
    );

    const parsedSpec = {
      ...updatedSpec[0],
      product_specifications: updatedSpec[0].product_specifications ? JSON.parse(updatedSpec[0].product_specifications) : []
    };

    res.json({
      success: true,
      message: "Specification updated successfully",
      data: parsedSpec
    });
  } catch (error) {
    console.error("Error updating specification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update specification",
      error: error.message
    });
  }
});

// Delete a specification
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [spec] = await db.query(
      "SELECT id, spec_name FROM specifications WHERE id = ?",
      [id]
    );

    if (spec.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Specification not found"
      });
    }

    await db.query(
      "DELETE FROM specifications WHERE id = ?",
      [id]
    );

    res.json({
      success: true,
      message: `Specification "${spec[0].spec_name}" deleted successfully`
    });
  } catch (error) {
    console.error("Error deleting specification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete specification",
      error: error.message
    });
  }
});

module.exports = router;