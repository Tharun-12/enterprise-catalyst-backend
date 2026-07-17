const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../db");

// Register a new user
router.post("/register", async (req, res) => {
    try {
        const { name, mobile, email, password } = req.body;

        // Validate input
        if (!name || !mobile || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters"
            });
        }

        // Check if user already exists
        const [existingUsers] = await db.query(
            "SELECT * FROM users WHERE email = ?",
            [email]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({
                success: false,
                message: "User with this email already exists"
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert new user
        const [result] = await db.query(
            "INSERT INTO users (name, mobile, email, password) VALUES (?, ?, ?, ?)",
            [name, mobile, email, hashedPassword]
        );

        // Get the created user (without password)
        const [newUser] = await db.query(
            "SELECT id, name, mobile, email, created_at FROM users WHERE id = ?",
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            user: newUser[0]
        });

    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});

// Login user
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        // Get user by email
        const [users] = await db.query(
            "SELECT * FROM users WHERE email = ?",
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const user = users[0];

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        // Return user info (without password)
        const { password: _, ...userWithoutPassword } = user;

        res.json({
            success: true,
            message: "Login successful",
            user: userWithoutPassword
        });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});

// Get all users (protected route - admin only)
router.get("/", async (req, res) => {
    try {
        const [users] = await db.query(
            "SELECT id, name, mobile, email, created_at FROM users ORDER BY created_at DESC"
        );

        res.json({
            success: true,
            users
        });

    } catch (error) {
        console.error("Get users error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});

// Get user by ID
router.get("/:id", async (req, res) => {
    try {
        const [users] = await db.query(
            "SELECT id, name, mobile, email, created_at FROM users WHERE id = ?",
            [req.params.id]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            user: users[0]
        });

    } catch (error) {
        console.error("Get user error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});

// Update user
router.put("/:id", async (req, res) => {
    try {
        const { name, mobile, email } = req.body;
        const userId = req.params.id;

        // Check if user exists
        const [existingUser] = await db.query(
            "SELECT * FROM users WHERE id = ?",
            [userId]
        );

        if (existingUser.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Check if email is taken by another user
        const [emailCheck] = await db.query(
            "SELECT * FROM users WHERE email = ? AND id != ?",
            [email, userId]
        );

        if (emailCheck.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Email already in use"
            });
        }

        // Update user
        await db.query(
            "UPDATE users SET name = ?, mobile = ?, email = ? WHERE id = ?",
            [name, mobile, email, userId]
        );

        // Get updated user
        const [updatedUser] = await db.query(
            "SELECT id, name, mobile, email, created_at FROM users WHERE id = ?",
            [userId]
        );

        res.json({
            success: true,
            message: "User updated successfully",
            user: updatedUser[0]
        });

    } catch (error) {
        console.error("Update user error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});

// Delete user
router.delete("/:id", async (req, res) => {
    try {
        const userId = req.params.id;

        // Check if user exists
        const [existingUser] = await db.query(
            "SELECT * FROM users WHERE id = ?",
            [userId]
        );

        if (existingUser.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Delete user
        await db.query("DELETE FROM users WHERE id = ?", [userId]);

        res.json({
            success: true,
            message: "User deleted successfully"
        });

    } catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});

module.exports = router;