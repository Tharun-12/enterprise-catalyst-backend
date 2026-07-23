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
        let totalDiscount = 0;
        let grandTotal = 0;

        wishlist.forEach(item => {

            const price = Number(item.price);
            const discount = Number(item.discount || 0);

            totalAmount += price;
            totalDiscount += discount;
            grandTotal += (price - discount);

        });

        const quotationNo =
            "QT-" +
            Date.now();

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
                totalDiscount,
                grandTotal,
                remarks
            ]
        );

        const quotationId = quotation.insertId;

        // Insert quotation items
        for (const item of wishlist) {

            const price = Number(item.price);
            const discount = Number(item.discount || 0);

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
                    final_price,
                    subtotal
                )
                VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [
                    quotationId,
                    item.product_id,
                    item.product_name,
                    item.product_code,
                    item.product_brand,
                    1,
                    price,
                    discount,
                    price - discount,
                    price - discount
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