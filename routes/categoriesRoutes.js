// routes/categoriesRoutes.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for image upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads/categories';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'category-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'));
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: fileFilter
});

/* =========================================================
   CASCADE-DELETE HELPERS
========================================================= */

// Normalize image_url (null | single path | JSON array) into an array
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

// Get all specifications with category info
router.get("/", async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, category_name, description, category_image, created_at, updated_at 
             FROM product_categories 
             ORDER BY category_name ASC`
        );

        for (let category of rows) {
            const [subcategories] = await db.query(
                "SELECT id, subcategory_name, created_at FROM category_subcategories WHERE category_id = ?",
                [category.id]
            );
            category.subcategories = subcategories;
        }

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch categories",
            error: error.message
        });
    }
});

// Get a single category by ID with subcategories
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            "SELECT id, category_name, description, category_image, created_at, updated_at FROM product_categories WHERE id = ?",
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        const [subcategories] = await db.query(
            "SELECT id, subcategory_name, created_at FROM category_subcategories WHERE category_id = ?",
            [id]
        );

        const category = rows[0];
        category.subcategories = subcategories;

        res.json({
            success: true,
            data: category
        });
    } catch (error) {
        console.error("Error fetching category:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch category",
            error: error.message
        });
    }
});

// Create a new category with subcategories
router.post("/", upload.single('category_image'), async (req, res) => {
    try {
        const { category_name, description, subcategories } = req.body;
        const category_image = req.file ? req.file.filename : null;

        if (!category_name || !category_name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Category name is required"
            });
        }

        const [existing] = await db.query(
            "SELECT id FROM product_categories WHERE category_name = ?",
            [category_name.trim()]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Category with this name already exists"
            });
        }

        await db.query('START TRANSACTION');

        const [result] = await db.query(
            "INSERT INTO product_categories (category_name, description, category_image) VALUES (?, ?, ?)",
            [category_name.trim(), description || null, category_image]
        );

        const categoryId = result.insertId;

        let subcategoryList = [];
        if (subcategories) {
            try {
                if (typeof subcategories === 'string') {
                    subcategoryList = JSON.parse(subcategories);
                } else if (Array.isArray(subcategories)) {
                    subcategoryList = subcategories;
                }
            } catch (e) {
                subcategoryList = [];
            }
        }

        if (subcategoryList.length > 0) {
            const subcategoryValues = subcategoryList
                .filter(s => s && s.trim())
                .map(s => [categoryId, s.trim()]);

            if (subcategoryValues.length > 0) {
                await db.query(
                    "INSERT INTO category_subcategories (category_id, subcategory_name) VALUES ?",
                    [subcategoryValues]
                );
            }
        }

        await db.query('COMMIT');

        const [newCategory] = await db.query(
            "SELECT id, category_name, description, category_image, created_at, updated_at FROM product_categories WHERE id = ?",
            [categoryId]
        );

        const [subcategoriesResult] = await db.query(
            "SELECT id, subcategory_name, created_at FROM category_subcategories WHERE category_id = ?",
            [categoryId]
        );

        newCategory[0].subcategories = subcategoriesResult;

        res.status(201).json({
            success: true,
            message: "Category created successfully",
            data: newCategory[0]
        });
    } catch (error) {
        await db.query('ROLLBACK');
        console.error("Error creating category:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create category",
            error: error.message
        });
    }
});

// Update a category
router.put("/:id", upload.single('category_image'), async (req, res) => {
    try {
        const { id } = req.params;
        const { category_name, description, subcategories, delete_image } = req.body;
        const category_image = req.file ? req.file.filename : null;

        if (!category_name || !category_name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Category name is required"
            });
        }

        const [category] = await db.query(
            "SELECT id, category_image FROM product_categories WHERE id = ?",
            [id]
        );

        if (category.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        const [existing] = await db.query(
            "SELECT id FROM product_categories WHERE category_name = ? AND id != ?",
            [category_name.trim(), id]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Another category with this name already exists"
            });
        }

        let finalImage = category[0].category_image;
        if (delete_image === 'true') {
            if (category[0].category_image) {
                deleteFileIfExists(path.join(__dirname, '../uploads/categories', category[0].category_image));
            }
            finalImage = null;
        }
        if (category_image) {
            if (category[0].category_image) {
                deleteFileIfExists(path.join(__dirname, '../uploads/categories', category[0].category_image));
            }
            finalImage = category_image;
        }

        await db.query('START TRANSACTION');

        await db.query(
            "UPDATE product_categories SET category_name = ?, description = ?, category_image = ? WHERE id = ?",
            [category_name.trim(), description || null, finalImage, id]
        );

        await db.query("DELETE FROM category_subcategories WHERE category_id = ?", [id]);

        let subcategoryList = [];
        if (subcategories) {
            try {
                if (typeof subcategories === 'string') {
                    subcategoryList = JSON.parse(subcategories);
                } else if (Array.isArray(subcategories)) {
                    subcategoryList = subcategories;
                }
            } catch (e) {
                subcategoryList = [];
            }
        }

        if (subcategoryList.length > 0) {
            const subcategoryValues = subcategoryList
                .filter(s => s && s.trim())
                .map(s => [id, s.trim()]);

            if (subcategoryValues.length > 0) {
                await db.query(
                    "INSERT INTO category_subcategories (category_id, subcategory_name) VALUES ?",
                    [subcategoryValues]
                );
            }
        }

        await db.query('COMMIT');

        const [updatedCategory] = await db.query(
            "SELECT id, category_name, description, category_image, created_at, updated_at FROM product_categories WHERE id = ?",
            [id]
        );

        const [subcategoriesResult] = await db.query(
            "SELECT id, subcategory_name, created_at FROM category_subcategories WHERE category_id = ?",
            [id]
        );

        updatedCategory[0].subcategories = subcategoriesResult;

        res.json({
            success: true,
            message: "Category updated successfully",
            data: updatedCategory[0]
        });
    } catch (error) {
        await db.query('ROLLBACK');
        console.error("Error updating category:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update category",
            error: error.message
        });
    }
});

// Delete a category AND everything that depends on it
// (brands, specifications, products, product variants, and their files)
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const [category] = await db.query(
            "SELECT id, category_name, category_image FROM product_categories WHERE id = ?",
            [id]
        );

        if (category.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        await db.query('START TRANSACTION');

        // 1) Find all products under this category
        const [products] = await db.query(
            "SELECT id, product_details_pdf FROM products WHERE category_id = ?",
            [id]
        );
        const productIds = products.map(p => p.id);

        if (productIds.length > 0) {
            // 1a) Delete variant image files from disk
            const [variants] = await db.query(
                "SELECT id, image_url FROM product_variants WHERE product_id IN (?)",
                [productIds]
            );

            for (const variant of variants) {
                parseStoredImages(variant.image_url).forEach(imgPath => {
                    deleteFileIfExists(path.join(__dirname, '../uploads/products', path.basename(imgPath)));
                });
            }

            // 1b) Delete the variants themselves
            await db.query("DELETE FROM product_variants WHERE product_id IN (?)", [productIds]);

            // 1c) Delete product PDF files from disk
            products.forEach(p => {
                if (p.product_details_pdf) {
                    deleteFileIfExists(path.join(__dirname, '../uploads/pdfs', p.product_details_pdf));
                }
            });

            // 1d) Delete the products themselves
            await db.query("DELETE FROM products WHERE id IN (?)", [productIds]);
        }

        // 2) Delete specifications tied to this category
        await db.query("DELETE FROM specifications WHERE category_id = ?", [id]);

        // 3) Delete brands tied to this category
        await db.query("DELETE FROM product_brands WHERE category_id = ?", [id]);

        // 4) Delete subcategories tied to this category
        await db.query("DELETE FROM category_subcategories WHERE category_id = ?", [id]);

        // 5) Delete category image from disk
        if (category[0].category_image) {
            deleteFileIfExists(path.join(__dirname, '../uploads/categories', category[0].category_image));
        }

        // 6) Finally delete the category itself
        await db.query("DELETE FROM product_categories WHERE id = ?", [id]);

        await db.query('COMMIT');

        res.json({
            success: true,
            message: `Category "${category[0].category_name}" and all related brands, specifications, and products deleted successfully`
        });
    } catch (error) {
        await db.query('ROLLBACK');
        console.error("Error deleting category:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete category",
            error: error.message
        });
    }
});

module.exports = router;