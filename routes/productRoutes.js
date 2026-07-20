

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db");


const productUploadDir = "uploads/products";
const pdfUploadDir = "uploads/pdfs";

if (!fs.existsSync(productUploadDir)) {
  fs.mkdirSync(productUploadDir, { recursive: true });
}

if (!fs.existsSync(pdfUploadDir)) {
  fs.mkdirSync(pdfUploadDir, { recursive: true });
}

// ====================================
// MULTER STORAGE
// ====================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Variant Images
    if (
      file.fieldname === "images" ||
      file.fieldname === "product_images"
    ) {
      cb(null, productUploadDir);
    }

    // Product PDF
    else if (
      file.fieldname === "product_details_pdf"
    ) {
      cb(null, pdfUploadDir);
    }

    // Default
    else {
      cb(null, productUploadDir);
    }
  },

  filename: (req, file, cb) => {
    const unique =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9);

    cb(
      null,
      unique + path.extname(file.originalname)
    );
  },
});

// ====================================
// MULTER
// ====================================

const upload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },

  fileFilter: (req, file, cb) => {
    // Validate Variant/Product Images
    if (
      file.fieldname === "images" ||
      file.fieldname === "product_images"
    ) {
      const allowed =
        /jpeg|jpg|png|webp|gif/;

      const ext = path
        .extname(file.originalname)
        .toLowerCase();

      if (
        allowed.test(ext) &&
        allowed.test(file.mimetype)
      ) {
        return cb(null, true);
      }

      return cb(
        new Error(
          "Only image files are allowed"
        )
      );
    }

    // PDF Validation
    if (
      file.fieldname === "product_details_pdf"
    ) {
      const ext = path
        .extname(file.originalname)
        .toLowerCase();

      if (ext === ".pdf") {
        return cb(null, true);
      }

      return cb(
        new Error(
          "Only PDF files are allowed"
        )
      );
    }

    cb(null, true);
  },
});

// ====================================
// SAVE VARIANT IMAGES
// ====================================

function saveImages(
  db,
  variantId,
  files,
  callback
) {
  if (!files || files.length === 0) {
    return callback(null);
  }

  const values = files.map(
    (file, index) => [
      variantId,
      `/uploads/products/${file.filename}`,
      index,
    ]
  );

  db.query(
    `
      INSERT INTO variant_images
      (
        variant_id,
        image_url,
        sort_order
      )
      VALUES ?
    `,
    [values],
    callback
  );
}


router.post(
  "/",
  upload.fields([
    { name: "product_details_pdf", maxCount: 1 },
  ]),
  (req, res) => {
    try {
      const {
        product_name,
        product_code,
        product_category_id,
        product_brand,
        price,
        dimensions,
        specifications,
        weight,
        discount,
        product_description,
        warranty,
      } = req.body;

      let pdfFile = "";

      if (req.files["product_details_pdf"]) {
        pdfFile =
          req.files["product_details_pdf"][0].filename;
      }

      const sql = `
        INSERT INTO products (
          product_name,
          product_code,
          product_category_id,
          product_brand,
          product_details_pdf,
          price,
          dimensions,
          specifications,
          weight,
          discount,
          product_description,
          warranty
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.query(
        sql,
        [
          product_name,
          product_code,
          product_category_id,
          product_brand,
          pdfFile,
          price,
          dimensions,
          specifications,
          weight,
          discount,
          product_description,
          warranty,
        ],
        (err, result) => {
          if (err) {
            return res.status(500).json(err);
          }

          res.json({
            message: "Product added successfully",
            id: result.insertId,
          });
        }
      );
    } catch (error) {
      res.status(500).json(error);
    }
  }
);


router.get("/only-products", (req, res) => {
  const sql = `
    SELECT * FROM products
    ORDER BY id DESC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      return res.status(500).json(err);
    }

    res.json(result);
  });
});


router.get("/products-with-variants", async (req, res) => {
  try {
    const sql = `
      SELECT
        p.*,
        c.category_name
      FROM products p
      LEFT JOIN product_categories c
      ON p.product_category_id = c.id
      ORDER BY p.id DESC
    `;

    db.query(sql, async (err, products) => {
      if (err) {
        return res.status(500).json(err);
      }

      for (const product of products) {
        const variants = await new Promise(
          (resolve, reject) => {
            db.query(
              `
              SELECT *
              FROM product_variants
              WHERE product_id = ?
            `,
              [product.id],
              (err, result) => {
                if (err) reject(err);
                else resolve(result);
              }
            );
          }
        );

        for (const variant of variants) {
          const images = await new Promise(
            (resolve, reject) => {
              db.query(
                `
                SELECT image_url
                FROM variant_images
                WHERE variant_id = ?
                ORDER BY sort_order
              `,
                [variant.id],
                (err, result) => {
                  if (err) reject(err);
                  else resolve(result);
                }
              );
            }
          );

          variant.images = images.map(
            (img) => img.image_url
          );
        }

        product.variants = variants;
      }

      res.json(products);
    });
  } catch (error) {
    res.status(500).json(error);
  }
});


router.get("/products-with-variants/:id", async (req, res) => {
  try {
    db.query(
      `
      SELECT
        p.*,
        c.category_name
      FROM products p
      LEFT JOIN product_categories c
      ON p.product_category_id = c.id
      WHERE p.id = ?
    `,
      [req.params.id],
      async (err, result) => {
        if (err) {
          return res.status(500).json(err);
        }

        if (!result.length) {
          return res
            .status(404)
            .json({ message: "Product not found" });
        }

        const product = result[0];

        const variants = await new Promise(
          (resolve, reject) => {
            db.query(
              `
              SELECT *
              FROM product_variants
              WHERE product_id = ?
            `,
              [product.id],
              (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
              }
            );
          }
        );

        for (const variant of variants) {
          const images = await new Promise(
            (resolve, reject) => {
              db.query(
                `
                SELECT image_url
                FROM variant_images
                WHERE variant_id = ?
                ORDER BY sort_order
              `,
                [variant.id],
                (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows);
                }
              );
            }
          );

          variant.images = images.map(
            (img) => img.image_url
          );
        }

        product.variants = variants;

        res.json(product);
      }
    );
  } catch (error) {
    res.status(500).json(error);
  }
});


router.put(
  "/:id",
  upload.fields([
    { name: "product_details_pdf", maxCount: 1 },
  ]),
  (req, res) => {
    try {
      const {
        product_name,
        product_code,
        product_category_id,
        product_brand,
        price,
        dimensions,
        specifications,
        weight,
        discount,
        product_description,
        warranty,
        existing_pdf,
      } = req.body;

      // =========================================
      // EXISTING IMAGES
      // =========================================

     
     
      // =========================================
      // PDF
      // =========================================

      let finalPdf = existing_pdf || "";

      if (req.files["product_details_pdf"]) {
        finalPdf =
          req.files["product_details_pdf"][0]
            .filename;
      }

      // =========================================
      // UPDATE QUERY
      // =========================================

      const sql = `
       UPDATE products
SET
product_name=?,
product_code=?,
product_category_id=?,
product_brand=?,
product_details_pdf=?,
price=?,
dimensions=?,
specifications=?,
weight=?,
discount=?,
product_description=?,
warranty=?
WHERE id=?
      `;

      db.query(
        sql,
        [
          product_name,
          product_code,
          product_category_id,
          product_brand,
          finalPdf,
          price,
          dimensions,
          specifications,
          weight,
          discount,
          product_description,
          warranty,
          req.params.id,
        ],
        (err) => {
          if (err) {
            return res.status(500).json(err);
          }

          res.json({
            message:
              "Product updated successfully",
          });
        }
      );
    } catch (error) {
      console.log(error);

      res.status(500).json(error);
    }
  }
);


router.delete("/:id", (req, res) => {
  const sql = `
    DELETE FROM products
    WHERE id = ?
  `;

  db.query(sql, [req.params.id], (err) => {
    if (err) {
      return res.status(500).json(err);
    }

    res.json({
      message: "Product deleted successfully",
    });
  });
});

// ════════════════════════════════════════════
//  VARIANTS
// ════════════════════════════════════════════

router.get("/variants/:productId", (req, res) => {
  db.query(
    `
    SELECT *
    FROM product_variants
    WHERE product_id = ?
    ORDER BY id
    `,
    [req.params.productId],
    (err, variants) => {
      if (err) {
        return res.status(500).json(err);
      }

      if (variants.length === 0) {
        return res.json([]);
      }

      let completed = 0;

      variants.forEach((variant, index) => {
        db.query(
          `
          SELECT image_url
          FROM variant_images
          WHERE variant_id = ?
          ORDER BY sort_order
          `,
          [variant.id],
          (err, images) => {
            if (err) {
              return res.status(500).json(err);
            }

            variants[index].images = images.map(
              (img) => img.image_url
            );

            variants[index].image_url =
              variants[index].images[0] || null;

            completed++;

            if (completed === variants.length) {
              res.json(variants);
            }
          }
        );
      });
    }
  );
});

router.get("/all-variants", (req, res) => {
  const sql = `
    SELECT
      pv.*,
      p.product_name
    FROM product_variants pv
    LEFT JOIN products p
      ON pv.product_id = p.id
    ORDER BY pv.id DESC
  `;

  db.query(sql, (err, variants) => {
    if (err) {
      return res.status(500).json(err);
    }

    if (variants.length === 0) {
      return res.json([]);
    }

    let completed = 0;

    variants.forEach((variant, index) => {
      db.query(
        `
        SELECT image_url
        FROM variant_images
        WHERE variant_id = ?
        ORDER BY sort_order
        `,
        [variant.id],
        (err, images) => {
          if (err) {
            return res.status(500).json(err);
          }

          variants[index].images = images.map(
            (img) => img.image_url
          );

          variants[index].image_url =
            variants[index].images[0] || null;

          completed++;

          if (completed === variants.length) {
            res.json(variants);
          }
        }
      );
    });
  });
});

router.get("/variant/:id", (req, res) => {
  db.query(
    `
    SELECT *
    FROM product_variants
    WHERE id = ?
    `,
    [req.params.id],
    (err, result) => {
      if (err) return res.status(500).json(err);

      if (!result.length)
        return res.status(404).json({
          message: "Variant not found",
        });

      db.query(
        `
        SELECT image_url
        FROM variant_images
        WHERE variant_id = ?
        `,
        [req.params.id],
        (err2, images) => {
          if (err2)
            return res.status(500).json(err2);

          res.json({
            ...result[0],
            images: images.map(
              (img) => img.image_url
            ),
          });
        }
      );
    }
  );
});


router.post(
  "/variants",
  upload.array("images", 5),
  (req, res) => {
    const {
      product_id,
      color_name,
      color_hex,
      price,
      stock,
    } = req.body;

    if (
      !product_id ||
      !color_name ||
      !color_hex ||
      !price
    ) {
      return res.status(400).json({
        error:
          "product_id, color_name, color_hex and price are required",
      });
    }

    const firstImage =
      req.files?.[0]
        ? `/uploads/products/${req.files[0].filename}`
        : null;

    db.query(
      `
      INSERT INTO product_variants
      (
        product_id,
        color_name,
        color_hex,
        price,
        stock,
        image_url
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        product_id,
        color_name,
        color_hex,
        price,
        stock || 100,
        firstImage,
      ],
      (err, result) => {
        if (err) {
          return res.status(500).json(err);
        }

        saveImages(
          db,
          result.insertId,
          req.files,
          (err) => {
            if (err) {
              return res.status(500).json(err);
            }

            res.status(201).json({
              message:
                "Variant added successfully",
              id: result.insertId,
            });
          }
        );
      }
    );
  }
);


router.put(
  "/variants/:id",
  upload.array("images", 5),
  (req, res) => {
    const {
      color_name,
      color_hex,
      price,
      stock,
    } = req.body;

    db.query(
      `
      UPDATE product_variants
      SET
        color_name = ?,
        color_hex = ?,
        price = ?,
        stock = ?
      WHERE id = ?
      `,
      [
        color_name,
        color_hex,
        price,
        stock,
        req.params.id,
      ],
      (err) => {
        if (err) {
          return res.status(500).json(err);
        }

        if (
          !req.files ||
          req.files.length === 0
        ) {
          return res.json({
            message:
              "Variant updated successfully",
          });
        }

        db.query(
          `
          DELETE FROM variant_images
          WHERE variant_id = ?
          `,
          [req.params.id],
          (err) => {
            if (err) {
              return res.status(500).json(err);
            }

            saveImages(
              db,
              req.params.id,
              req.files,
              (err) => {
                if (err) {
                  return res.status(500).json(
                    err
                  );
                }

                db.query(
                  `
                  UPDATE product_variants
                  SET image_url = ?
                  WHERE id = ?
                  `,
                  [
                    `/uploads/products/${req.files[0].filename}`,
                    req.params.id,
                  ],
                  (err) => {
                    if (err) {
                      return res
                        .status(500)
                        .json(err);
                    }

                    res.json({
                      message:
                        "Variant updated successfully",
                    });
                  }
                );
              }
            );
          }
        );
      }
    );
  }
);

router.delete(
  "/variants/:id",
  (req, res) => {
    db.query(
      `
      DELETE FROM variant_images
      WHERE variant_id = ?
      `,
      [req.params.id],
      (err) => {
        if (err) {
          return res.status(500).json(err);
        }

        db.query(
          `
          DELETE FROM product_variants
          WHERE id = ?
          `,
          [req.params.id],
          (err) => {
            if (err) {
              return res.status(500).json(err);
            }

            res.json({
              message:
                "Variant deleted successfully",
            });
          }
        );
      }
    );
  }
);

router.get("/:id", (req, res) => {
  const sql = `
    SELECT 
      p.*,
      c.category_name
    FROM products p
    LEFT JOIN product_categories c
    ON p.product_category_id = c.id
    WHERE p.id = ?
  `;

  db.query(sql, [req.params.id], (err, result) => {
    if (err) {
      return res.status(500).json(err);
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(result[0]);
  });
});


module.exports = router;