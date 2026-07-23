const express = require("express");
const router = express.Router();
const db = require("../db");


// ========================================
// Add Product To Wishlist
// ========================================
router.post("/wishlist", async (req, res) => {
    try {

        const { user_id, product_id } = req.body;

        if (!user_id || !product_id) {
            return res.status(400).json({
                success: false,
                message: "user_id and product_id are required."
            });
        }

        // Check if already exists
        const [exists] = await db.execute(
            "SELECT * FROM wishlist WHERE user_id=? AND product_id=?",
            [user_id, product_id]
        );

        if (exists.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Product already exists in wishlist."
            });
        }

        const [result] = await db.execute(
            "INSERT INTO wishlist(user_id, product_id) VALUES(?,?)",
            [user_id, product_id]
        );

        res.status(201).json({
            success: true,
            message: "Product added to wishlist.",
            wishlistId: result.insertId
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});


// ========================================
// Get User Wishlist
// ========================================
// ========================================
// Get User Wishlist with Variants
// ========================================
router.get("/wishlist/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        const [rows] = await db.execute(
            `SELECT
                w.id AS wishlist_id,
                p.id,
                p.product_name,
                p.product_code,
                p.product_brand,
                p.product_details_pdf,
                p.price,
                p.dimensions,
                p.specifications,
                p.weight,
                p.discount,
                p.product_description,
                p.warranty,
                p.created_at,
                p.updated_at,
                c.category_name
            FROM wishlist w
            INNER JOIN products p ON w.product_id = p.id
            LEFT JOIN product_categories c ON p.product_category_id = c.id
            WHERE w.user_id = ?
            ORDER BY w.created_at DESC`,
            [userId]
        );

        // Get variants for each product
        for (const product of rows) {
            const [variants] = await db.execute(
                `SELECT 
                    id, 
                    product_id, 
                    color_name, 
                    color_hex, 
                    price, 
                    stock, 
                    image_url 
                FROM product_variants 
                WHERE product_id = ?`,
                [product.id]
            );
            product.variants = variants;
        }

        res.json({
            success: true,
            data: rows
        });

    } catch (err) {
        console.error('Error fetching wishlist:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});


// ========================================
// Check Wishlist
// ========================================
router.get("/wishlist/check/:userId/:productId", async (req, res) => {

    try {

        const { userId, productId } = req.params;

        const [rows] = await db.execute(
            "SELECT * FROM wishlist WHERE user_id=? AND product_id=?",
            [userId, productId]
        );

        res.json({
            success: true,
            isWishlisted: rows.length > 0
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});


// ========================================
// Wishlist Count
// ========================================
router.get("/wishlist/count/:userId", async (req, res) => {

    try {

        const { userId } = req.params;

        const [rows] = await db.execute(
            "SELECT COUNT(*) AS total FROM wishlist WHERE user_id=?",
            [userId]
        );

        res.json({
            success: true,
            total: rows[0].total
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});


// ========================================
// Remove by Wishlist Id
// ========================================
router.delete("/wishlist/:wishlistId", async (req, res) => {

    try {

        const { wishlistId } = req.params;

        const [result] = await db.execute(
            "DELETE FROM wishlist WHERE id=?",
            [wishlistId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Wishlist item not found."
            });
        }

        res.json({
            success: true,
            message: "Removed from wishlist."
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});


// ========================================
// Remove by Product Id
// ========================================
router.delete("/wishlist/user/:userId/product/:productId", async (req, res) => {

    try {

        const { userId, productId } = req.params;

        const [result] = await db.execute(
            "DELETE FROM wishlist WHERE user_id=? AND product_id=?",
            [userId, productId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Wishlist item not found."
            });
        }

        res.json({
            success: true,
            message: "Product removed from wishlist."
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});

// ========================================
// Clear Wishlist By User ID
// ========================================
router.delete("/wishlist/clear/:userId", async (req, res) => {
    try {

        const { userId } = req.params;

        const [result] = await db.execute(
            "DELETE FROM wishlist WHERE user_id = ?",
            [userId]
        );

        res.status(200).json({
            success: true,
            message: "Wishlist cleared successfully.",
            deletedItems: result.affectedRows
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});


module.exports = router;