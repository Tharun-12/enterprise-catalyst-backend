const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db");

const productUploadDir = "uploads/products";
const pdfUploadDir = "uploads/pdfs";

// Ensure upload directories exist
if (!fs.existsSync(productUploadDir)) {
    fs.mkdirSync(productUploadDir, { recursive: true });
}
if (!fs.existsSync(pdfUploadDir)) {
    fs.mkdirSync(pdfUploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === "images" || file.fieldname === "product_images") {
            cb(null, productUploadDir);
        } else if (file.fieldname === "product_details_pdf") {
            cb(null, pdfUploadDir);
        } else {
            cb(null, productUploadDir);
        }
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === "images" || file.fieldname === "product_images") {
            const allowed = /jpeg|jpg|png|webp|gif/;
            const ext = path.extname(file.originalname).toLowerCase();
            if (allowed.test(ext) && allowed.test(file.mimetype)) {
                return cb(null, true);
            }
            return cb(new Error("Only image files are allowed"));
        }
        if (file.fieldname === "product_details_pdf") {
            const ext = path.extname(file.originalname).toLowerCase();
            if (ext === ".pdf") {
                return cb(null, true);
            }
            return cb(new Error("Only PDF files are allowed"));
        }
        cb(null, true);
    },
});

function uploadWithLogging(multerMiddleware, routeLabel) {
    return (req, res, next) => {
        multerMiddleware(req, res, (err) => {
            if (err) {
                console.error(`Multer error on ${routeLabel}:`, err.message);
                return res.status(400).json({ error: err.message });
            }
            next();
        });
    };
}

// ============================================
// PRODUCT CRUD OPERATIONS
// ============================================

// CREATE PRODUCT
router.post(
    "/",
    uploadWithLogging(upload.fields([{ name: "product_details_pdf", maxCount: 1 }]), "POST /api/products"),
    async (req, res) => {
        try {
            const {
                product_name,
                product_code,
                category_id,
                sub_category_id,
                product_brand,
                product_description,
                extra_information,
                warranty,
                product_series,
                specifications,
                discount
            } = req.body;

            if (!product_code) {
                return res.status(400).json({
                    success: false,
                    error: "Product code is required. Please enter a unique product code."
                });
            }

            let pdfFile = "";
            if (req.files && req.files["product_details_pdf"]) {
                pdfFile = req.files["product_details_pdf"][0].filename;
            }

            // Parse specifications if provided as string
            let specsJson = null;
            if (specifications) {
                try {
                    specsJson = typeof specifications === 'string' 
                        ? JSON.parse(specifications) 
                        : specifications;
                } catch (e) {
                    specsJson = null;
                }
            }

            const sql = `
                INSERT INTO products (
                    product_name, product_code, category_id, sub_category_id, product_brand,
                    product_details_pdf, product_description, extra_information, warranty,
                    product_series, specifications, discount
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const [result] = await db.query(sql, [
                product_name,
                product_code,
                category_id || null,
                sub_category_id || null,
                product_brand || null,
                pdfFile,
                product_description || null,
                extra_information || null,
                warranty || null,
                product_series || null,
                specsJson ? JSON.stringify(specsJson) : null,
                discount || null
            ]);

            res.status(201).json({
                success: true,
                message: "Product added successfully",
                id: result.insertId,
                product_code: product_code
            });
        } catch (error) {
            console.error("Error in product creation:", error);
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({
                    success: false,
                    error: "Product code already exists. Please enter a unique product code."
                });
            }
            res.status(500).json({ error: error.message });
        }
    }
);

// GET PRODUCTS WITH VARIANTS
router.get("/products-with-variants", async (req, res) => {
    try {
        const sql = `
            SELECT p.*, 
                   c.category_name,
                   cs.subcategory_name
            FROM products p
            LEFT JOIN product_categories c ON p.category_id = c.id
            LEFT JOIN category_subcategories cs ON p.sub_category_id = cs.id
            ORDER BY p.id DESC
        `;

        const [products] = await db.query(sql);

        for (const product of products) {
            // Parse specifications if stored as JSON string
            if (product.specifications && typeof product.specifications === 'string') {
                try {
                    product.specifications = JSON.parse(product.specifications);
                } catch (e) {
                    product.specifications = {};
                }
            }
            
            const [variants] = await db.query(
                "SELECT * FROM product_variants WHERE product_id = ? ORDER BY id",
                [product.id]
            );
            product.variants = variants;
        }

        res.json(products);
    } catch (error) {
        console.error("Error in products-with-variants:", error);
        res.status(500).json(error);
    }
});

// GET SINGLE PRODUCT WITH VARIANTS
router.get("/products-with-variants/:id", async (req, res) => {
    try {
        const [productResult] = await db.query(
            `
            SELECT p.*, 
                   c.category_name,
                   cs.subcategory_name
            FROM products p
            LEFT JOIN product_categories c ON p.category_id = c.id
            LEFT JOIN category_subcategories cs ON p.sub_category_id = cs.id
            WHERE p.id = ?
            `,
            [req.params.id]
        );

        if (!productResult.length) {
            return res.status(404).json({ message: "Product not found" });
        }

        const product = productResult[0];
        
        // Parse specifications if stored as JSON string
        if (product.specifications && typeof product.specifications === 'string') {
            try {
                product.specifications = JSON.parse(product.specifications);
            } catch (e) {
                product.specifications = {};
            }
        }
        
        const [variants] = await db.query(
            "SELECT * FROM product_variants WHERE product_id = ? ORDER BY id",
            [product.id]
        );

        product.variants = variants;
        res.json(product);
    } catch (error) {
        console.error("Error in single product-with-variants:", error);
        res.status(500).json(error);
    }
});

// UPDATE PRODUCT
router.put(
    "/:id",
    uploadWithLogging(upload.fields([{ name: "product_details_pdf", maxCount: 1 }]), "PUT /api/products/:id"),
    async (req, res) => {
        try {
            const {
                product_name,
                product_code,
                category_id,
                sub_category_id,
                product_brand,
                product_description,
                extra_information,
                warranty,
                existing_pdf,
                product_series,
                specifications,
                discount
            } = req.body;

            let finalPdf = existing_pdf || "";
            
            if (req.files && req.files["product_details_pdf"]) {
                if (existing_pdf) {
                    const oldPdfPath = path.join(pdfUploadDir, existing_pdf);
                    try {
                        if (fs.existsSync(oldPdfPath)) {
                            fs.unlinkSync(oldPdfPath);
                        }
                    } catch (err) {
                        console.error("Error deleting old PDF:", err);
                    }
                }
                finalPdf = req.files["product_details_pdf"][0].filename;
            }

            const [existingProduct] = await db.query(
                "SELECT product_code, category_id, sub_category_id, product_brand FROM products WHERE id = ?",
                [req.params.id]
            );
            
            if (existingProduct.length === 0) {
                return res.status(404).json({ error: "Product not found" });
            }

            const finalProductCode = product_code || existingProduct[0].product_code;
            const finalCategoryId = category_id !== undefined && category_id !== null && category_id !== '' 
                ? category_id 
                : existingProduct[0].category_id;
            const finalSubCategoryId = sub_category_id !== undefined && sub_category_id !== null && sub_category_id !== '' 
                ? sub_category_id 
                : existingProduct[0].sub_category_id;
            const finalBrand = product_brand !== undefined && product_brand !== null && product_brand !== '' 
                ? product_brand 
                : existingProduct[0].product_brand;

            // Parse specifications
            let specsJson = null;
            if (specifications) {
                try {
                    specsJson = typeof specifications === 'string' 
                        ? JSON.parse(specifications) 
                        : specifications;
                } catch (e) {
                    specsJson = null;
                }
            }

            const sql = `
                UPDATE products SET
                    product_name=?, product_code=?, category_id=?, sub_category_id=?,
                    product_brand=?, product_details_pdf=?, product_description=?,
                    extra_information=?, warranty=?, product_series=?, specifications=?,
                    discount=?
                WHERE id=?
            `;

            await db.query(sql, [
                product_name,
                finalProductCode,
                finalCategoryId,
                finalSubCategoryId,
                finalBrand,
                finalPdf,
                product_description || null,
                extra_information || null,
                warranty || null,
                product_series || null,
                specsJson ? JSON.stringify(specsJson) : null,
                discount || null,
                req.params.id,
            ]);

            res.json({ success: true, message: "Product updated successfully" });
        } catch (error) {
            console.error("Error in product update:", error);
            res.status(500).json(error);
        }
    }
);

// DELETE PRODUCT
router.delete("/:id", async (req, res) => {
    try {
        const productId = parseInt(req.params.id, 10);

        const [product] = await db.query(
            "SELECT product_details_pdf FROM products WHERE id = ?",
            [productId]
        );
        
        if (product.length > 0 && product[0].product_details_pdf) {
            const pdfPath = path.join(pdfUploadDir, product[0].product_details_pdf);
            try {
                if (fs.existsSync(pdfPath)) {
                    fs.unlinkSync(pdfPath);
                }
            } catch (err) {
                console.error("Error deleting PDF:", err);
            }
        }

        await db.query("DELETE FROM product_variants WHERE product_id = ?", [productId]);
        await db.query("DELETE FROM spec_comparison WHERE product_id = ?", [productId]);
        await db.query("DELETE FROM products WHERE id = ?", [productId]);

        res.json({ success: true, message: "Product deleted successfully" });
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json(error);
    }
});

// ============================================
// VARIANT OPERATIONS
// ============================================

// CREATE VARIANT
router.post(
    "/variants",
    uploadWithLogging(upload.array("images", 5), "POST /api/products/variants"),
    async (req, res) => {
        try {
            const {
                product_id,
                variant_name,
                part_code,
                description,
                spec_type,
                color,
                size,
                min_price,
                max_price,
                availability,
                datasheet_url,
                stock,
                category_id,
                sub_category_id,
                brand_name
            } = req.body;

            console.log("Creating variant with data:", req.body);

            if (!product_id || !variant_name || !part_code || !min_price || !max_price) {
                return res.status(400).json({
                    success: false,
                    error: "product_id, variant_name, part_code, min_price, and max_price are required"
                });
            }

            const firstImage = req.files && req.files.length > 0
                ? `/uploads/products/${req.files[0].filename}`
                : null;

            const insertSql = `
                INSERT INTO product_variants (
                    product_id, variant_name, part_code,
                    description, spec_type, color, size, min_price, max_price,
                    availability, datasheet_url, image_url, stock,
                    category_id, sub_category_id, brand
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const [insertResult] = await db.query(insertSql, [
                product_id,
                variant_name,
                part_code,
                description || null,
                spec_type || null,
                color || null,
                size || null,
                min_price,
                max_price,
                availability || null,
                datasheet_url || null,
                firstImage,
                stock || 100,
                category_id || null,
                sub_category_id || null,
                brand_name || null
            ]);

            res.status(201).json({
                success: true,
                message: "Variant added successfully",
                id: insertResult.insertId,
                image_url: firstImage
            });
        } catch (error) {
            console.error("Error in variant creation:", error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

// UPDATE VARIANT
router.put(
    "/variants/:id",
    uploadWithLogging(upload.array("images", 5), "PUT /api/products/variants/:id"),
    async (req, res) => {
        try {
            const variantId = parseInt(req.params.id, 10);
            const {
                product_id,
                variant_name,
                part_code,
                description,
                spec_type,
                color,
                size,
                min_price,
                max_price,
                availability,
                datasheet_url,
                stock,
                keep_image,
                category_id,
                sub_category_id,
                brand_name
            } = req.body;

            console.log("Updating variant:", variantId, req.body);

            const [variantResult] = await db.query(
                "SELECT * FROM product_variants WHERE id = ?",
                [variantId]
            );

            if (variantResult.length === 0) {
                return res.status(404).json({ success: false, error: "Variant not found" });
            }

            const existingVariant = variantResult[0];
            let imageUrl = existingVariant.image_url;

            if (req.files && req.files.length > 0) {
                if (existingVariant.image_url) {
                    const oldImagePath = path.join(productUploadDir, path.basename(existingVariant.image_url));
                    try {
                        if (fs.existsSync(oldImagePath)) {
                            fs.unlinkSync(oldImagePath);
                        }
                    } catch (err) {
                        console.error("Error deleting old image:", err);
                    }
                }
                imageUrl = `/uploads/products/${req.files[0].filename}`;
            } else if (keep_image === 'false' || keep_image === false) {
                imageUrl = null;
            }

            const updateSql = `
                UPDATE product_variants SET
                    product_id = ?,
                    variant_name = ?,
                    part_code = ?,
                    description = ?,
                    spec_type = ?,
                    color = ?,
                    size = ?,
                    min_price = ?,
                    max_price = ?,
                    availability = ?,
                    datasheet_url = ?,
                    image_url = ?,
                    stock = ?,
                    category_id = ?,
                    sub_category_id = ?,
                    brand = ?
                WHERE id = ?
            `;

            await db.query(updateSql, [
                product_id || existingVariant.product_id,
                variant_name || existingVariant.variant_name,
                part_code || existingVariant.part_code,
                description !== undefined ? description : existingVariant.description,
                spec_type !== undefined ? spec_type : existingVariant.spec_type,
                color !== undefined ? color : existingVariant.color,
                size !== undefined ? size : existingVariant.size,
                min_price !== undefined ? min_price : existingVariant.min_price,
                max_price !== undefined ? max_price : existingVariant.max_price,
                availability !== undefined ? availability : existingVariant.availability,
                datasheet_url !== undefined ? datasheet_url : existingVariant.datasheet_url,
                imageUrl,
                stock !== undefined ? stock : existingVariant.stock,
                category_id !== undefined ? category_id : existingVariant.category_id,
                sub_category_id !== undefined ? sub_category_id : existingVariant.sub_category_id,
                brand_name !== undefined ? brand_name : existingVariant.brand,
                variantId
            ]);

            res.json({
                success: true,
                message: "Variant updated successfully",
                id: variantId
            });
        } catch (error) {
            console.error("Error updating variant:", error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

// DELETE VARIANT
router.delete("/variants/:id", async (req, res) => {
    try {
        const variantId = parseInt(req.params.id, 10);
        
        const [variant] = await db.query(
            "SELECT image_url FROM product_variants WHERE id = ?",
            [variantId]
        );
        
        if (variant.length > 0 && variant[0].image_url) {
            const imagePath = path.join(productUploadDir, path.basename(variant[0].image_url));
            try {
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            } catch (err) {
                console.error("Error deleting variant image:", err);
            }
        }
        
        await db.query("DELETE FROM product_variants WHERE id = ?", [variantId]);
        res.json({ success: true, message: "Variant deleted successfully" });
    } catch (error) {
        console.error("Error deleting variant:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET VARIANTS BY PRODUCT
router.get("/variants/:productId", async (req, res) => {
    try {
        const productId = parseInt(req.params.productId, 10);
        const [variants] = await db.query(
            "SELECT * FROM product_variants WHERE product_id = ? ORDER BY id",
            [productId]
        );
        res.json(variants);
    } catch (error) {
        console.error("Error fetching variants:", error);
        res.status(500).json(error);
    }
});

// ============================================
// SPEC COMPARISON OPERATIONS
// ============================================

// CREATE/UPDATE SPEC COMPARISON
router.post("/spec-comparison", async (req, res) => {
    try {
        const {
            product_id,
            spec_type,
            bandwidth,
            max_data_rate,
            internal_design,
            typical_applications
        } = req.body;

        console.log("Saving spec comparison:", req.body);

        if (!spec_type || spec_type.trim() === '') {
            return res.status(400).json({
                success: false,
                error: "Spec type is required"
            });
        }

        const cleanSpecType = spec_type.trim();

        const [existing] = await db.query(
            "SELECT id FROM spec_comparison WHERE product_id = ? AND spec_type = ?",
            [product_id, cleanSpecType]
        );

        let result;
        if (existing.length > 0) {
            [result] = await db.query(
                `UPDATE spec_comparison SET
                    bandwidth = ?,
                    max_data_rate = ?,
                    internal_design = ?,
                    typical_applications = ?
                WHERE product_id = ? AND spec_type = ?`,
                [
                    bandwidth || null,
                    max_data_rate || null,
                    internal_design || null,
                    typical_applications || null,
                    product_id,
                    cleanSpecType
                ]
            );
        } else {
            [result] = await db.query(
                `INSERT INTO spec_comparison
                    (product_id, spec_type, bandwidth, max_data_rate, internal_design, typical_applications)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    product_id,
                    cleanSpecType,
                    bandwidth || null,
                    max_data_rate || null,
                    internal_design || null,
                    typical_applications || null
                ]
            );
        }

        res.json({
            success: true,
            message: "Spec comparison saved successfully",
            id: result.insertId || existing[0]?.id
        });
    } catch (error) {
        console.error("Error saving spec comparison:", error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                error: "A spec comparison for this product and spec type already exists. Please update the existing one instead."
            });
        }
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET SPEC COMPARISONS BY PRODUCT
router.get("/spec-comparison/:productId", async (req, res) => {
    try {
        const productId = parseInt(req.params.productId, 10);
        const [comparisons] = await db.query(
            "SELECT * FROM spec_comparison WHERE product_id = ?",
            [productId]
        );

        const result = {};
        comparisons.forEach(item => {
            result[item.spec_type] = item;
        });

        res.json(result);
    } catch (error) {
        console.error("Error fetching spec comparisons:", error);
        res.status(500).json(error);
    }
});

// DELETE SPEC COMPARISON
router.delete("/spec-comparison/:productId/:specType", async (req, res) => {
    try {
        const productId = parseInt(req.params.productId, 10);
        const { specType } = req.params;
        const decodedSpecType = decodeURIComponent(specType);
        
        await db.query(
            "DELETE FROM spec_comparison WHERE product_id = ? AND spec_type = ?",
            [productId, decodedSpecType]
        );
        res.json({ success: true, message: "Spec comparison deleted successfully" });
    } catch (error) {
        console.error("Error deleting spec comparison:", error);
        res.status(500).json(error);
    }
});

// DELETE ALL SPEC COMPARISONS FOR A PRODUCT
router.delete("/spec-comparison/:productId/all", async (req, res) => {
    try {
        const productId = parseInt(req.params.productId, 10);
        await db.query(
            "DELETE FROM spec_comparison WHERE product_id = ?",
            [productId]
        );
        res.json({ success: true, message: "All spec comparisons deleted successfully" });
    } catch (error) {
        console.error("Error deleting spec comparisons:", error);
        res.status(500).json(error);
    }
});

// ============================================
// SPECIFICATIONS OPERATIONS
// ============================================

// GET ALL SPECIFICATIONS
router.get("/specifications", async (req, res) => {
    try {
        const [specs] = await db.query(
            `SELECT s.*, 
                    c.category_name,
                    cs.subcategory_name
             FROM specifications s
             LEFT JOIN product_categories c ON s.category_id = c.id
             LEFT JOIN category_subcategories cs ON s.sub_category_id = cs.id`
        );
        
        // Parse product_specifications for each record
        for (const spec of specs) {
            if (spec.product_specifications && typeof spec.product_specifications === 'string') {
                try {
                    spec.product_specifications = JSON.parse(spec.product_specifications);
                } catch (e) {
                    spec.product_specifications = [];
                }
            }
        }
        
        res.json({
            success: true,
            data: specs
        });
    } catch (error) {
        console.error("Error fetching specifications:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET SPECIFICATION BY ID
router.get("/specifications/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        
        const [specs] = await db.query(
            `SELECT s.*, 
                    c.category_name,
                    cs.subcategory_name
             FROM specifications s
             LEFT JOIN product_categories c ON s.category_id = c.id
             LEFT JOIN category_subcategories cs ON s.sub_category_id = cs.id
             WHERE s.id = ?`,
            [id]
        );
        
        if (specs.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Specification not found"
            });
        }
        
        // Parse product_specifications if it's a string
        if (specs[0].product_specifications && typeof specs[0].product_specifications === 'string') {
            try {
                specs[0].product_specifications = JSON.parse(specs[0].product_specifications);
            } catch (e) {
                specs[0].product_specifications = [];
            }
        }
        
        res.json({
            success: true,
            data: specs[0]
        });
    } catch (error) {
        console.error("Error fetching specification:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET SPECIFICATIONS BY CATEGORY AND SUBCATEGORY
router.get("/specifications/category/:categoryId/subcategory/:subCategoryId", async (req, res) => {
    try {
        const categoryId = parseInt(req.params.categoryId, 10);
        const subCategoryId = parseInt(req.params.subCategoryId, 10);
        
        const [specs] = await db.query(
            `SELECT s.*, 
                    c.category_name,
                    cs.subcategory_name
             FROM specifications s
             LEFT JOIN product_categories c ON s.category_id = c.id
             LEFT JOIN category_subcategories cs ON s.sub_category_id = cs.id
             WHERE s.category_id = ? AND s.sub_category_id = ?`,
            [categoryId, subCategoryId]
        );
        
        if (specs.length === 0) {
            return res.json({
                success: true,
                data: null,
                message: "No specifications found for this category and subcategory"
            });
        }
        
        // Parse product_specifications if it's a string
        if (specs[0].product_specifications && typeof specs[0].product_specifications === 'string') {
            try {
                specs[0].product_specifications = JSON.parse(specs[0].product_specifications);
            } catch (e) {
                specs[0].product_specifications = [];
            }
        }
        
        res.json({
            success: true,
            data: specs[0]
        });
    } catch (error) {
        console.error("Error fetching specifications:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;