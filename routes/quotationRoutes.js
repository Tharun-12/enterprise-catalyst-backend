// quotationRoutes.js - Fixed without JSON_ARRAYAGG

const express = require("express");
const router = express.Router();
const db = require("../db");

// =======================================================
// Generate Quotation From Wishlist
// POST /api/quotations/generate
// =======================================================
router.post("/quotations/generate", async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { user_id, remarks = "" } = req.body;

        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: "user_id is required"
            });
        }

        // Get User
        const [users] = await connection.execute(
            "SELECT * FROM users WHERE id=?",
            [user_id]
        );

        if (users.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const user = users[0];

        // Get Wishlist Products (without JSON_ARRAYAGG)
        const [wishlist] = await connection.execute(`
            SELECT
                w.product_id,
                p.product_name,
                p.product_code,
                p.product_brand,
                p.min_price,
                p.max_price,
                p.discount
            FROM wishlist w
            INNER JOIN products p
                ON p.id = w.product_id
            WHERE w.user_id = ?
        `, [user_id]);

        if (wishlist.length === 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Wishlist is empty."
            });
        }

        // Get variants for each product separately
        const wishlistWithVariants = [];
        for (const item of wishlist) {
            const [variants] = await connection.execute(
                `SELECT 
                    id,
                    variant_name,
                    part_code,
                    spec_type,
                    color,
                    size,
                    price,
                    image_url,
                    stock
                FROM product_variants 
                WHERE product_id = ?
                ORDER BY id`,
                [item.product_id]
            );
            
            wishlistWithVariants.push({
                ...item,
                variants: variants
            });
        }

        let totalAmount = 0;
        let totalDiscountAmount = 0;
        let grandTotal = 0;

        // Process each wishlist item
        for (const item of wishlistWithVariants) {
            // Use max_price if available, otherwise use min_price
            let price = Number(item.max_price) || Number(item.min_price) || 0;
            const discountPercent = Number(item.discount || 0);
            
            // Calculate discount as percentage of price
            const discountAmount = (price * discountPercent) / 100;
            const finalPrice = price - discountAmount;

            totalAmount += price;
            totalDiscountAmount += discountAmount;
            grandTotal += finalPrice;
        }

        const quotationNo = "QT-" + Date.now();

        // Insert quotation
        const [quotation] = await connection.execute(
            `INSERT INTO quotations
            (
                quotation_no,
                user_id,
                customer_name,
                customer_mobile,
                customer_email,
                total_items,
                total_amount,
                total_discount,
                grand_total,
                remarks
            )
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [
                quotationNo,
                user_id,
                user.name,
                user.mobile,
                user.email,
                wishlistWithVariants.length,
                totalAmount,
                totalDiscountAmount,
                grandTotal,
                remarks
            ]
        );

        const quotationId = quotation.insertId;

        // Insert quotation items with variant details
        for (const item of wishlistWithVariants) {
            let price = Number(item.max_price) || Number(item.min_price) || 0;
            const discountPercent = Number(item.discount || 0);
            const discountAmount = (price * discountPercent) / 100;
            const finalPrice = price - discountAmount;

            // Get first variant image if exists
            let variantImage = null;
            let variantDetails = null;
            
            if (item.variants && item.variants.length > 0) {
                // Get the first variant's image
                variantImage = item.variants[0].image_url || null;
                // Store all variant details as JSON
                variantDetails = JSON.stringify(item.variants);
            }

            await connection.execute(
                `INSERT INTO quotation_items
                (
                    quotation_id,
                    product_id,
                    product_name,
                    product_code,
                    brand,
                    quantity,
                    price,
                    min_price,
                    max_price,
                    discount,
                    discount_amount,
                    final_price,
                    subtotal,
                    variant_image,
                    variant_details
                )
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    quotationId,
                    item.product_id,
                    item.product_name,
                    item.product_code,
                    item.product_brand,
                    1,
                    price,
                    item.min_price || null,
                    item.max_price || null,
                    discountPercent,
                    discountAmount,
                    finalPrice,
                    finalPrice,
                    variantImage,
                    variantDetails
                ]
            );
        }

        // Clear Wishlist
        await connection.execute(
            "DELETE FROM wishlist WHERE user_id=?",
            [user_id]
        );

        await connection.commit();

        res.json({
            success: true,
            message: "Quotation generated successfully.",
            quotation_id: quotationId,
            quotation_no: quotationNo
        });

    } catch (err) {
        await connection.rollback();
        console.error('Error generating quotation:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    } finally {
        connection.release();
    }
});

// =======================================================
// Generate Single Product Quotation
// POST /api/quotations/single
// =======================================================
router.post("/quotations/single", async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { 
            user_id, 
            product_id, 
            product_name,
            product_code,
            product_brand,
            price,
            min_price,
            max_price,
            discount = 0,
            quantity = 1, 
            remarks = "",
            customer_name,
            customer_mobile,
            customer_email,
            variant_image,
            variant_details
        } = req.body;

        // Validate required fields
        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: "user_id is required"
            });
        }

        if (!product_id) {
            return res.status(400).json({
                success: false,
                message: "product_id is required"
            });
        }

        // Get User if not provided
        let user = null;
        if (customer_name && customer_mobile && customer_email) {
            user = {
                name: customer_name,
                mobile: customer_mobile,
                email: customer_email
            };
        } else {
            const [users] = await connection.execute(
                "SELECT * FROM users WHERE id=?",
                [user_id]
            );

            if (users.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }
            user = users[0];
        }

        // Get Product if not provided
        let product = null;
        let productVariants = null;
        
        if (product_name && product_code && product_brand && price !== undefined) {
            product = {
                id: product_id,
                product_name: product_name,
                product_code: product_code,
                product_brand: product_brand,
                price: price,
                min_price: min_price || null,
                max_price: max_price || null,
                discount: discount
            };
        } else {
            // Get product details
            const [products] = await connection.execute(
                `SELECT 
                    p.id,
                    p.product_name,
                    p.product_code,
                    p.product_brand,
                    p.min_price,
                    p.max_price,
                    p.discount
                FROM products p
                WHERE p.id = ?`,
                [product_id]
            );

            if (products.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }
            product = products[0];

            // Get variants separately
            const [variants] = await connection.execute(
                `SELECT 
                    id,
                    variant_name,
                    part_code,
                    spec_type,
                    color,
                    size,
                    price,
                    image_url,
                    stock
                FROM product_variants 
                WHERE product_id = ?
                ORDER BY id`,
                [product_id]
            );
            productVariants = variants;
        }

        // Calculate amounts - discount is percentage
        // Use max_price if available, otherwise use min_price
        let priceNum = Number(product.price) || Number(product.max_price) || Number(product.min_price) || 0;
        const discountPercent = Number(product.discount || 0);
        const discountAmount = (priceNum * discountPercent) / 100;
        const finalPrice = priceNum - discountAmount;
        const subtotal = finalPrice * quantity;

        // Get variant image if not provided
        let finalVariantImage = variant_image || null;
        let finalVariantDetails = variant_details || null;
        
        if (!finalVariantImage && productVariants && productVariants.length > 0) {
            finalVariantImage = productVariants[0].image_url || null;
            finalVariantDetails = JSON.stringify(productVariants);
        }

        // Generate quotation number
        const quotationNo = "QT-" + Date.now() + "-S";

        // Insert quotation
        const [quotation] = await connection.execute(
            `INSERT INTO quotations
            (
                quotation_no,
                user_id,
                customer_name,
                customer_mobile,
                customer_email,
                total_items,
                total_amount,
                total_discount,
                grand_total,
                remarks,
                status
            )
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [
                quotationNo,
                user_id,
                user.name,
                user.mobile,
                user.email,
                1, // Single product
                priceNum,
                discountAmount,
                finalPrice,
                remarks || `Quotation requested for ${product.product_name}`,
                'Pending'
            ]
        );

        const quotationId = quotation.insertId;

        // Insert quotation item with min_price, max_price, and variant image
        await connection.execute(
            `INSERT INTO quotation_items
            (
                quotation_id,
                product_id,
                product_name,
                product_code,
                brand,
                quantity,
                price,
                min_price,
                max_price,
                discount,
                discount_amount,
                final_price,
                subtotal,
                variant_image,
                variant_details
            )
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                quotationId,
                product.id,
                product.product_name,
                product.product_code,
                product.product_brand,
                quantity,
                priceNum,
                product.min_price || null,
                product.max_price || null,
                discountPercent,
                discountAmount,
                finalPrice,
                subtotal,
                finalVariantImage,
                finalVariantDetails
            ]
        );

        // Remove the product from wishlist after generating quotation
        await connection.execute(
            "DELETE FROM wishlist WHERE user_id=? AND product_id=?",
            [user_id, product_id]
        );

        await connection.commit();

        res.json({
            success: true,
            message: "Quotation generated successfully.",
            quotation_id: quotationId,
            quotation_no: quotationNo,
            product_name: product.product_name,
            quantity: quantity,
            final_price: finalPrice,
            grand_total: finalPrice
        });

    } catch (err) {
        await connection.rollback();
        console.error('Error generating quotation:', err);
        res.status(500).json({
            success: false,
            message: err.message || 'Failed to generate quotation'
        });
    } finally {
        connection.release();
    }
});

// =======================================================
// Get All Quotations with Items
// GET /api/quotations
// =======================================================
router.get("/quotations", async (req, res) => {
    try {
        const [quotations] = await db.execute(`
            SELECT *
            FROM quotations
            ORDER BY id DESC
        `);

        // Fetch items for each quotation
        const quotationsWithDetails = await Promise.all(
            quotations.map(async (quotation) => {
                const [items] = await db.execute(
                    `SELECT *
                     FROM quotation_items
                     WHERE quotation_id = ?
                     ORDER BY id ASC`,
                    [quotation.id]
                );
                return {
                    ...quotation,
                    details: items
                };
            })
        );

        res.json({
            success: true,
            data: quotationsWithDetails
        });

    } catch (err) {
        console.error('Error fetching quotations:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// =======================================================
// Get Single Quotation
// GET /api/quotations/:id
// =======================================================
router.get("/quotations/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const [quotation] = await db.execute(
            "SELECT * FROM quotations WHERE id=?",
            [id]
        );

        if (quotation.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Quotation not found"
            });
        }

        const [items] = await db.execute(
            `SELECT *
             FROM quotation_items
             WHERE quotation_id=?`,
            [id]
        );

        res.json({
            success: true,
            quotation: quotation[0],
            items
        });

    } catch (err) {
        console.error('Error fetching quotation:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// =======================================================
// Get User Quotations with Items
// GET /api/quotations/user/:userId
// =======================================================
router.get("/quotations/user/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        const [quotations] = await db.execute(
            `SELECT *
             FROM quotations
             WHERE user_id = ?
             ORDER BY id DESC`,
            [userId]
        );

        // Fetch items for each quotation
        const quotationsWithDetails = await Promise.all(
            quotations.map(async (quotation) => {
                const [items] = await db.execute(
                    `SELECT *
                     FROM quotation_items
                     WHERE quotation_id = ?
                     ORDER BY id ASC`,
                    [quotation.id]
                );
                return {
                    ...quotation,
                    details: items
                };
            })
        );

        res.json({
            success: true,
            data: quotationsWithDetails
        });

    } catch (err) {
        console.error('Error fetching user quotations:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// =======================================================
// Update Status
// PUT /api/quotations/:id/status
// =======================================================
router.put("/quotations/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["Pending", "Approved", "Rejected"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status."
            });
        }

        const [result] = await db.execute(
            "UPDATE quotations SET status=? WHERE id=?",
            [status, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Quotation not found."
            });
        }

        res.json({
            success: true,
            message: "Quotation status updated."
        });

    } catch (err) {
        console.error('Error updating quotation status:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

module.exports = router;