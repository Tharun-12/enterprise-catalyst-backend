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

// Get all categories with subcategories
router.get("/", async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, category_name, description, category_image, created_at, updated_at 
             FROM product_categories 
             ORDER BY category_name ASC`
        );

        // Get subcategories for each category
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

        // Get subcategories
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

        // Validate required fields
        if (!category_name || !category_name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Category name is required"
            });
        }

        // Check if category with same name exists
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

        // Start transaction
        await db.query('START TRANSACTION');

        // Insert category
        const [result] = await db.query(
            "INSERT INTO product_categories (category_name, description, category_image) VALUES (?, ?, ?)",
            [category_name.trim(), description || null, category_image]
        );

        const categoryId = result.insertId;

        // Insert subcategories
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

        // Get the newly created category with subcategories
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

        // Validate required fields
        if (!category_name || !category_name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Category name is required"
            });
        }

        // Check if category exists
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

        // Check if another category has the same name
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

        // Handle image deletion
        let finalImage = category[0].category_image;
        if (delete_image === 'true') {
            if (category[0].category_image) {
                const oldImagePath = path.join(__dirname, '../uploads/categories', category[0].category_image);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
            finalImage = null;
        }
        if (category_image) {
            if (category[0].category_image) {
                const oldImagePath = path.join(__dirname, '../uploads/categories', category[0].category_image);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
            finalImage = category_image;
        }

        // Start transaction
        await db.query('START TRANSACTION');

        // Update category
        await db.query(
            "UPDATE product_categories SET category_name = ?, description = ?, category_image = ? WHERE id = ?",
            [category_name.trim(), description || null, finalImage, id]
        );

        // Update subcategories - Delete existing
        await db.query("DELETE FROM category_subcategories WHERE category_id = ?", [id]);

        // Insert new subcategories
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

        // Get the updated category
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

// Delete a category
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        // Check if category exists
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

        // Start transaction
        await db.query('START TRANSACTION');

        // Delete subcategories (will be automatically deleted due to ON DELETE CASCADE)
        await db.query("DELETE FROM category_subcategories WHERE category_id = ?", [id]);

        // Delete category image if exists
        if (category[0].category_image) {
            const imagePath = path.join(__dirname, '../uploads/categories', category[0].category_image);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        // Delete category
        await db.query("DELETE FROM product_categories WHERE id = ?", [id]);

        await db.query('COMMIT');

        res.json({
            success: true,
            message: `Category "${category[0].category_name}" deleted successfully`
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