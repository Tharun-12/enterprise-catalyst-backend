

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db");

// Configure multer for image upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = "uploads/products/";
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
        cb(null, "product-" + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error("Only image files are allowed"));
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: fileFilter
});

// GET all products with pagination and filters
router.get("/", async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            search = "", 
            categoryId, 
            brandId, 
            status 
        } = req.query;
        
        const offset = (page - 1) * limit;
        let query = `
            SELECT 
                p.*,
                c.name as category_name,
                b.name as brand_name,
                (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as primary_image
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            WHERE 1=1
        `;
        
        const params = [];
        
        // Apply filters
        if (search) {
            query += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)`;
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam);
        }
        
        if (categoryId) {
            query += ` AND p.category_id = ?`;
            params.push(categoryId);
        }
        
        if (brandId) {
            query += ` AND p.brand_id = ?`;
            params.push(brandId);
        }
        
        if (status) {
            query += ` AND p.status = ?`;
            params.push(status);
        }
        
        // Get total count
        const countQuery = query.replace(
            /SELECT.*FROM/,
            "SELECT COUNT(*) as total FROM"
        );
        const [countResult] = await db.query(countQuery, params);
        const total = countResult.total;
        
        // Add pagination
        query += ` ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));
        
        const [products] = await db.query(query, params);
        
        // Get all images for each product
        for (let product of products) {
            const [images] = await db.query(
                "SELECT id, image_url, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC",
                [product.id]
            );
            product.images = images;
            product.image_count = images.length;
        }
        
        res.json({
            success: true,
            data: products,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch products",
            error: error.message
        });
    }
});

// GET product by ID
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        
        const [products] = await db.query(
            `SELECT 
                p.*,
                c.name as category_name,
                b.name as brand_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            WHERE p.id = ?`,
            [id]
        );
        
        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }
        
        const product = products[0];
        
        // Get product images
        const [images] = await db.query(
            "SELECT id, image_url, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC",
            [id]
        );
        product.images = images;
        
        res.json({
            success: true,
            data: product
        });
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch product",
            error: error.message
        });
    }
});

// POST create product
router.post("/", upload.array("images", 10), async (req, res) => {
    let connection = null;
    try {
        console.log("Request body:", req.body);
        console.log("Files:", req.files);
        
        const {
            name,
            sku,
            categoryId,
            brandId,
            description,
            price,
            warranty
        } = req.body;
        
        // Validate required fields
        if (!name || !categoryId || !brandId || !price) {
            // Delete uploaded files if validation fails
            if (req.files) {
                req.files.forEach(file => {
                    try {
                        fs.unlinkSync(file.path);
                    } catch (err) {}
                });
            }
            return res.status(400).json({
                success: false,
                message: "Name, category, brand, and price are required"
            });
        }
        
        // Get a connection from the pool
        connection = await db.getConnection();
        
        // Start transaction
        await connection.beginTransaction();
        
        // Check if SKU already exists
        if (sku) {
            const [existing] = await connection.query(
                "SELECT id FROM products WHERE sku = ?",
                [sku]
            );
            if (existing.length > 0) {
                // Delete uploaded files
                if (req.files) {
                    req.files.forEach(file => {
                        try {
                            fs.unlinkSync(file.path);
                        } catch (err) {}
                    });
                }
                await connection.rollback();
                connection.release();
                return res.status(400).json({
                    success: false,
                    message: "SKU already exists"
                });
            }
        }
        
        // Insert product with default status 'active'
        const [result] = await connection.query(
            `INSERT INTO products 
            (name, sku, category_id, brand_id, description, price, warranty, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
            [name, sku || null, categoryId, brandId, description || null, price, warranty || null]
        );
        
        const productId = result.insertId;
        console.log("Product inserted with ID:", productId);
        
        // Handle image uploads
        const images = req.files || [];
        if (images.length > 0) {
            console.log(`Inserting ${images.length} images for product ${productId}`);
            
            // Insert images one by one to avoid promise.all issues
            for (let i = 0; i < images.length; i++) {
                const file = images[i];
                const imageUrl = `/uploads/products/${file.filename}`;
                const isPrimary = i === 0 ? 1 : 0;
                await connection.query(
                    "INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)",
                    [productId, imageUrl, isPrimary, i]
                );
                console.log(`Image ${i + 1} inserted: ${imageUrl}`);
            }
        }
        
        // Commit the transaction
        await connection.commit();
        connection.release();
        
        // Fetch the created product
        const [newProduct] = await db.query(
            `SELECT 
                p.*,
                c.name as category_name,
                b.name as brand_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            WHERE p.id = ?`,
            [productId]
        );
        
        // Get images
        const [productImages] = await db.query(
            "SELECT id, image_url, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC",
            [productId]
        );
        newProduct[0].images = productImages;
        
        res.status(201).json({
            success: true,
            message: "Product created successfully",
            data: newProduct[0]
        });
    } catch (error) {
        // Rollback transaction if connection exists
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("Error during rollback:", rollbackError);
            }
            connection.release();
        }
        
        // Delete uploaded files on error
        if (req.files) {
            req.files.forEach(file => {
                try {
                    if (fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                } catch (err) {
                    console.error("Error deleting file:", err);
                }
            });
        }
        
        console.error("Error creating product:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create product",
            error: error.message
        });
    }
});

// PUT update product
router.put("/:id", upload.array("images", 10), async (req, res) => {
    let connection = null;
    try {
        const { id } = req.params;
        const {
            name,
            sku,
            categoryId,
            brandId,
            description,
            price,
            warranty,
            status
        } = req.body;
        
        // Get a connection from the pool
        connection = await db.getConnection();
        
        // Start transaction
        await connection.beginTransaction();
        
        // Check if product exists
        const [existing] = await connection.query(
            "SELECT id FROM products WHERE id = ?",
            [id]
        );
        if (existing.length === 0) {
            // Delete uploaded files
            if (req.files) {
                req.files.forEach(file => {
                    try {
                        fs.unlinkSync(file.path);
                    } catch (err) {}
                });
            }
            await connection.rollback();
            connection.release();
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }
        
        // Check if SKU already exists (if changing)
        if (sku) {
            const [skuCheck] = await connection.query(
                "SELECT id FROM products WHERE sku = ? AND id != ?",
                [sku, id]
            );
            if (skuCheck.length > 0) {
                // Delete uploaded files
                if (req.files) {
                    req.files.forEach(file => {
                        try {
                            fs.unlinkSync(file.path);
                        } catch (err) {}
                    });
                }
                await connection.rollback();
                connection.release();
                return res.status(400).json({
                    success: false,
                    message: "SKU already exists"
                });
            }
        }
        
        // Update product
        await connection.query(
            `UPDATE products SET 
                name = ?,
                sku = ?,
                category_id = ?,
                brand_id = ?,
                description = ?,
                price = ?,
                warranty = ?,
                status = ?
            WHERE id = ?`,
            [name, sku || null, categoryId, brandId, description || null, price, warranty || null, status || 'active', id]
        );
        
        // Handle new image uploads
        const images = req.files || [];
        if (images.length > 0) {
            // Get current max sort order
            const [currentImages] = await connection.query(
                "SELECT MAX(sort_order) as max_order FROM product_images WHERE product_id = ?",
                [id]
            );
            let startOrder = (currentImages[0].max_order !== null ? currentImages[0].max_order : -1) + 1;
            
            // Insert images one by one
            for (let i = 0; i < images.length; i++) {
                const file = images[i];
                const imageUrl = `/uploads/products/${file.filename}`;
                const isPrimary = i === 0 && startOrder === 0 ? 1 : 0;
                await connection.query(
                    "INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)",
                    [id, imageUrl, isPrimary, startOrder + i]
                );
            }
        }
        
        // Commit the transaction
        await connection.commit();
        connection.release();
        
        // Fetch updated product
        const [updatedProduct] = await db.query(
            `SELECT 
                p.*,
                c.name as category_name,
                b.name as brand_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            WHERE p.id = ?`,
            [id]
        );
        
        // Get images
        const [productImages] = await db.query(
            "SELECT id, image_url, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC",
            [id]
        );
        updatedProduct[0].images = productImages;
        
        res.json({
            success: true,
            message: "Product updated successfully",
            data: updatedProduct[0]
        });
    } catch (error) {
        // Rollback transaction if connection exists
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("Error during rollback:", rollbackError);
            }
            connection.release();
        }
        
        // Delete uploaded files on error
        if (req.files) {
            req.files.forEach(file => {
                try {
                    if (fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                } catch (err) {
                    console.error("Error deleting file:", err);
                }
            });
        }
        
        console.error("Error updating product:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update product",
            error: error.message
        });
    }
});

// DELETE product
router.delete("/:id", async (req, res) => {
    let connection = null;
    try {
        const { id } = req.params;
        
        // Get a connection from the pool
        connection = await db.getConnection();
        
        // Start transaction
        await connection.beginTransaction();
        
        // Check if product exists
        const [product] = await connection.query(
            "SELECT id FROM products WHERE id = ?",
            [id]
        );
        if (product.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }
        
        // Get images to delete from filesystem
        const [images] = await connection.query(
            "SELECT image_url FROM product_images WHERE product_id = ?",
            [id]
        );
        
        // Delete product images from database
        await connection.query("DELETE FROM product_images WHERE product_id = ?", [id]);
        
        // Delete product
        await connection.query("DELETE FROM products WHERE id = ?", [id]);
        
        // Commit the transaction
        await connection.commit();
        connection.release();
        
        // Delete images from filesystem
        for (const image of images) {
            const filePath = path.join(__dirname, "..", image.image_url);
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (err) {
                console.error(`Failed to delete image ${image.image_url}:`, err);
            }
        }
        
        res.json({
            success: true,
            message: "Product deleted successfully"
        });
    } catch (error) {
        // Rollback transaction if connection exists
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("Error during rollback:", rollbackError);
            }
            connection.release();
        }
        console.error("Error deleting product:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete product",
            error: error.message
        });
    }
});

// PATCH update product status
router.patch("/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!status || !['active', 'draft', 'archived'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status. Must be 'active', 'draft', or 'archived'"
            });
        }
        
        const [result] = await db.query(
            "UPDATE products SET status = ? WHERE id = ?",
            [status, id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }
        
        res.json({
            success: true,
            message: "Product status updated successfully"
        });
    } catch (error) {
        console.error("Error updating product status:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update product status",
            error: error.message
        });
    }
});

// DELETE product image
router.delete("/:id/images/:imageId", async (req, res) => {
    let connection = null;
    try {
        const { id, imageId } = req.params;
        
        // Get a connection from the pool
        connection = await db.getConnection();
        
        // Start transaction
        await connection.beginTransaction();
        
        // Get image details
        const [images] = await connection.query(
            "SELECT image_url FROM product_images WHERE id = ? AND product_id = ?",
            [imageId, id]
        );
        
        if (images.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({
                success: false,
                message: "Image not found"
            });
        }
        
        // Delete from database
        await connection.query(
            "DELETE FROM product_images WHERE id = ? AND product_id = ?",
            [imageId, id]
        );
        
        // Commit the transaction
        await connection.commit();
        connection.release();
        
        // Delete from filesystem
        const filePath = path.join(__dirname, "..", images[0].image_url);
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (err) {
            console.error(`Failed to delete image ${images[0].image_url}:`, err);
        }
        
        res.json({
            success: true,
            message: "Image deleted successfully"
        });
    } catch (error) {
        // Rollback transaction if connection exists
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("Error during rollback:", rollbackError);
            }
            connection.release();
        }
        console.error("Error deleting image:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete image",
            error: error.message
        });
    }
});

module.exports = router;