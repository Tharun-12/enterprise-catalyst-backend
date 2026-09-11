// routes/specificationsRoutes.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const path = require("path");
const fs = require("fs");

/* =========================================================
   CASCADE-DELETE HELPERS
========================================================= */

function parseStoredImages(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [raw];
    } catch (e) {
        return [raw];
    }
}

function deleteFileIfExists(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (err) {
        console.error("Error deleting file:", filePath, err);
    }
}

// Deletes every product (and its variants/images/PDFs) under this category + subcategory,
// since that's the only link a specification has to products.
async function deleteProductsByCategoryAndSubCategory(categoryId, subCategoryId) {
    const [products] = await db.query(
        "SELECT id, product_details_pdf FROM products WHERE category_id = ? AND sub_category_id = ?",
        [categoryId, subCategoryId]
    );
    const productIds = products.map(p => p.id);
    if (productIds.length === 0) return;

    const [variants] = await db.query(
        "SELECT id, image_url FROM product_variants WHERE product_id IN (?)",
        [productIds]
    );

    for (const variant of variants) {
        parseStoredImages(variant.image_url).forEach(imgPath => {
            deleteFileIfExists(path.join(__dirname, '../uploads/products', path.basename(imgPath)));
        });
    }

    await db.query("DELETE FROM product_variants WHERE product_id IN (?)", [productIds]);

    products.forEach(p => {
        if (p.product_details_pdf) {
            deleteFileIfExists(path.join(__dirname, '../uploads/pdfs', p.product_details_pdf));
        }
    });

    await db.query("DELETE FROM products WHERE id IN (?)", [productIds]);
}

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
    const { category_id, sub_category_id, spec_name, product_specifications } = req.body;

    console.log('Received data:', req.body);

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

    let specs = product_specifications || [];
    specs = specs.filter(spec => spec.spec_name && spec.spec_name.trim() && spec.value && spec.value.trim());

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
    const { category_id, sub_category_id, spec_name, product_specifications } = req.body;

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

    let specs = product_specifications || [];
    specs = specs.filter(spec => spec.spec_name && spec.spec_name.trim() && spec.value && spec.value.trim());

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

// Delete a specification AND every product under its category + subcategory
// (plus their variants/images/PDFs).
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const [spec] = await db.query(
            "SELECT id, spec_name, category_id, sub_category_id FROM specifications WHERE id = ?",
            [id]
        );

        if (spec.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Specification not found"
            });
        }

        await db.query('START TRANSACTION');

        await deleteProductsByCategoryAndSubCategory(spec[0].category_id, spec[0].sub_category_id);

        await db.query("DELETE FROM specifications WHERE id = ?", [id]);

        await db.query('COMMIT');

        res.json({
            success: true,
            message: `Specification "${spec[0].spec_name}" and all related products deleted successfully`
        });
    } catch (error) {
        await db.query('ROLLBACK');
        console.error("Error deleting specification:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete specification",
            error: error.message
        });
    }
});

module.exports = router;