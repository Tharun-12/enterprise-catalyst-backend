const express = require("express");
const router = express.Router();
const db = require("../db");

// =======================================================
// Generate Quotation From Wishlist
// POST /api/quotations/generate
// =======================================================
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

        // Get Wishlist Products
        const [wishlist] = await connection.execute(`
            SELECT
                w.product_id,
                p.product_name,
                p.product_code,
                p.product_brand,
                p.price,
                p.discount
            FROM wishlist w
            INNER JOIN products p
                ON p.id=w.product_id
            WHERE w.user_id=?
        `, [user_id]);

        if (wishlist.length === 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Wishlist is empty."
            });
        }

        let totalAmount = 0;
        let totalDiscountAmount = 0;
        let grandTotal = 0;

        wishlist.forEach(item => {
            const price = Number(item.price);
            const discountPercent = Number(item.discount || 0);
            
            // Calculate discount as percentage of price
            const discountAmount = (price * discountPercent) / 100;
            const finalPrice = price - discountAmount;

            totalAmount += price;
            totalDiscountAmount += discountAmount;
            grandTotal += finalPrice;
        });

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
                wishlist.length,
                totalAmount,
                totalDiscountAmount,
                grandTotal,
                remarks
            ]
        );

        const quotationId = quotation.insertId;

        // Insert quotation items
        for (const item of wishlist) {
            const price = Number(item.price);
            const discountPercent = Number(item.discount || 0);
            const discountAmount = (price * discountPercent) / 100;
            const finalPrice = price - discountAmount;

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
                    discount,
                    discount_amount,
                    final_price,
                    subtotal
                )
                VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    quotationId,
                    item.product_id,
                    item.product_name,
                    item.product_code,
                    item.product_brand,
                    1,
                    price,
                    discountPercent,
                    discountAmount,
                    finalPrice,
                    finalPrice
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
// =======================================================
// Generate Single Product Quotation
// POST /api/quotations/single
// =======================================================
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
            discount = 0,
            quantity = 1, 
            remarks = "",
            customer_name,
            customer_mobile,
            customer_email
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
        if (product_name && product_code && product_brand && price !== undefined) {
            product = {
                id: product_id,
                product_name: product_name,
                product_code: product_code,
                product_brand: product_brand,
                price: price,
                discount: discount
            };
        } else {
            const [products] = await connection.execute(
                `SELECT 
                    id,
                    product_name,
                    product_code,
                    product_brand,
                    price,
                    discount
                FROM products 
                WHERE id=?`,
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
        }

        // Calculate amounts - discount is percentage
        const priceNum = Number(product.price);
        const discountPercent = Number(product.discount || 0);
        const discountAmount = (priceNum * discountPercent) / 100;
        const finalPrice = priceNum - discountAmount;
        const subtotal = finalPrice * quantity;

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

        // Insert quotation item
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
                discount,
                discount_amount,
                final_price,
                subtotal
            )
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [
                quotationId,
                product.id,
                product.product_name,
                product.product_code,
                product.product_brand,
                quantity,
                priceNum,
                discountPercent,
                discountAmount,
                finalPrice,
                subtotal
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
                    details: items  // Using 'details' key for consistency with frontend
                };
            })
        );

        res.json({
            success: true,
            data: quotationsWithDetails
        });

    } catch (err) {
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
                    details: items  // Using 'details' key for consistency with frontend
                };
            })
        );

        res.json({
            success: true,
            data: quotationsWithDetails
        });

    } catch (err) {
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

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});

module.exports = router;