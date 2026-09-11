// routes/brandRoutes.js
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

// Deletes every product (and its variants/images/PDFs) that belongs to this brand.
// brand_name is globally unique (enforced in POST /brands), so this is unambiguous.
// Specifications are NOT touched here — they aren't brand-specific.
async function deleteProductsByBrandName(brandName) {
    const [products] = await db.query(
        "SELECT id, product_details_pdf FROM products WHERE product_brand = ?",
        [brandName]
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

// Get all brands with category and subcategory information
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT pb.id, pb.brand_name,
              pb.category_id, pc.category_name,
              pb.sub_category_id, psc.subcategory_name as sub_category_name,
              pb.created_at, pb.updated_at 
       FROM product_brands pb
       LEFT JOIN product_categories pc ON pb.category_id = pc.id
       LEFT JOIN category_subcategories psc ON pb.sub_category_id = psc.id
       ORDER BY pb.brand_name ASC`
    );
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("Error fetching brands:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch brands",
      error: error.message
    });
  }
});

// Get a single brand by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT pb.id, pb.brand_name,
              pb.category_id, pc.category_name,
              pb.sub_category_id, psc.subcategory_name as sub_category_name,
              pb.created_at, pb.updated_at 
       FROM product_brands pb
       LEFT JOIN product_categories pc ON pb.category_id = pc.id
       LEFT JOIN category_subcategories psc ON pb.sub_category_id = psc.id
       WHERE pb.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Brand not found"
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error("Error fetching brand:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch brand",
      error: error.message
    });
  }
});

// Create a new brand
router.post("/", async (req, res) => {
  try {
    const { brand_name, category_id, sub_category_id } = req.body;

    if (!brand_name || !brand_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Brand name is required"
      });
    }

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

    const [existing] = await db.query(
      "SELECT id FROM product_brands WHERE brand_name = ?",
      [brand_name.trim()]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Brand with this name already exists"
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

    const [subcategoryExists] = await db.query(
      "SELECT id FROM category_subcategories WHERE id = ? AND category_id = ?",
      [sub_category_id, category_id]
    );

    if (subcategoryExists.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Selected subcategory does not exist or does not belong to the selected category"
      });
    }

    const [result] = await db.query(
      `INSERT INTO product_brands 
       (brand_name, category_id, sub_category_id) 
       VALUES (?, ?, ?)`,
      [brand_name.trim(), category_id, sub_category_id]
    );

    const [newBrand] = await db.query(
      `SELECT pb.id, pb.brand_name,
              pb.category_id, pc.category_name,
              pb.sub_category_id, psc.subcategory_name as sub_category_name,
              pb.created_at, pb.updated_at 
       FROM product_brands pb
       LEFT JOIN product_categories pc ON pb.category_id = pc.id
       LEFT JOIN category_subcategories psc ON pb.sub_category_id = psc.id
       WHERE pb.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: "Brand created successfully",
      data: newBrand[0]
    });
  } catch (error) {
    console.error("Error creating brand:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create brand",
      error: error.message
    });
  }
});

// Update a brand
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { brand_name, category_id, sub_category_id } = req.body;

    if (!brand_name || !brand_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Brand name is required"
      });
    }

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

    const [brand] = await db.query(
      "SELECT id FROM product_brands WHERE id = ?",
      [id]
    );

    if (brand.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Brand not found"
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

    const [subcategoryExists] = await db.query(
      "SELECT id FROM category_subcategories WHERE id = ? AND category_id = ?",
      [sub_category_id, category_id]
    );

    if (subcategoryExists.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Selected subcategory does not exist or does not belong to the selected category"
      });
    }

    const [existing] = await db.query(
      "SELECT id FROM product_brands WHERE brand_name = ? AND id != ?",
      [brand_name.trim(), id]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Another brand with this name already exists"
      });
    }

    await db.query(
      `UPDATE product_brands SET 
        brand_name = ?, 
        category_id = ?,
        sub_category_id = ?
       WHERE id = ?`,
      [brand_name.trim(), category_id, sub_category_id, id]
    );

    const [updatedBrand] = await db.query(
      `SELECT pb.id, pb.brand_name,
              pb.category_id, pc.category_name,
              pb.sub_category_id, psc.subcategory_name as sub_category_name,
              pb.created_at, pb.updated_at 
       FROM product_brands pb
       LEFT JOIN product_categories pc ON pb.category_id = pc.id
       LEFT JOIN category_subcategories psc ON pb.sub_category_id = psc.id
       WHERE pb.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: "Brand updated successfully",
      data: updatedBrand[0]
    });
  } catch (error) {
    console.error("Error updating brand:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update brand",
      error: error.message
    });
  }
});

// Delete a brand AND every product that uses it (plus their variants/images/PDFs).
// Specifications are intentionally left untouched — they're not brand-specific.
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const [brand] = await db.query(
            "SELECT id, brand_name FROM product_brands WHERE id = ?",
            [id]
        );

        if (brand.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Brand not found"
            });
        }

        await db.query('START TRANSACTION');

        await deleteProductsByBrandName(brand[0].brand_name);

        await db.query("DELETE FROM product_brands WHERE id = ?", [id]);

        await db.query('COMMIT');

        res.json({
            success: true,
            message: `Brand "${brand[0].brand_name}" and all its products deleted successfully`
        });
    } catch (error) {
        await db.query('ROLLBACK');
        console.error("Error deleting brand:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete brand",
            error: error.message
        });
    }
});

module.exports = router;