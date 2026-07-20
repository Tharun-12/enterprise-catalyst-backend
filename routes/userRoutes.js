const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const crypto = require('crypto');
const db = require("../db");
const nodemailer = require('nodemailer');

// ==================== EMAIL CONFIGURATION ====================
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: 'iiiqbets01@gmail.com',
        pass: 'rava xoel gzai rkgx'
    },
    tls: {
        rejectUnauthorized: false
    }
});

transporter.verify((error, success) => {
    if (error) {
        console.error('❌ Email configuration error:', error);
    } else {
        console.log('✅ Email server is ready to send messages');
    }
});

// ==================== HELPER FUNCTIONS ====================

const generateOTP = () => {
    return crypto.randomInt(100000, 999999).toString();
};

// Send welcome email to user with credentials
const sendWelcomeEmail = async (user) => {
    try {
        const mailOptions = {
            from: `"${user.name || 'MVB'}" <tharunkumarreddy1212@gmail.com>`,
            to: user.email,
            subject: 'Welcome to MVB - Your Account Details',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
                    <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #2563eb; text-align: center; margin-bottom: 20px;">Welcome to MVB! 🎉</h2>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">Dear ${user.name},</p>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">Thank you for registering with MVB. Your account has been created successfully!</p>
                        
                        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0;">
                            <h3 style="color: #1e293b; margin-bottom: 15px; font-size: 16px;">Your Account Details:</h3>
                            <p style="margin: 8px 0; color: #475569;">
                                <strong>Name:</strong> ${user.name}
                            </p>
                            <p style="margin: 8px 0; color: #475569;">
                                <strong>Email:</strong> ${user.email}
                            </p>
                            <p style="margin: 8px 0; color: #475569;">
                                <strong>Mobile:</strong> ${user.mobile}
                            </p>
                            <p style="margin: 8px 0; color: #475569;">
                                <strong>Password:</strong> ${user.plainPassword || 'Your chosen password'}
                            </p>
                        </div>
                        
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">You can now log in to your account using your email and password.</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" 
                               style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                                Login to Your Account
                            </a>
                        </div>
                        <p style="color: #666; font-size: 14px; line-height: 1.5;">For security reasons, we recommend changing your password after your first login.</p>
                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                        <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message, please do not reply.</p>
                        <p style="color: #999; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} MVB. All rights reserved.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('✅ Welcome email sent to user:', user.email);
        return true;
    } catch (error) {
        console.error('❌ Welcome email error:', error);
        return false;
    }
};

// Send admin notification about new user registration
const sendAdminNotification = async (user) => {
    try {
        // Get admin email from database
        const [adminResults] = await db.query(
            'SELECT email FROM admin ORDER BY id LIMIT 1'
        );

        if (adminResults.length === 0) {
            console.log('⚠️ No admin found to send notification');
            return false;
        }

        const adminEmail = adminResults[0].email;

        const mailOptions = {
            from: `"MVB System" <tharunkumarreddy1212@gmail.com>`,
            to: adminEmail,
            subject: '🔔 New User Registration Alert',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
                    <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #2563eb; text-align: center; margin-bottom: 20px;">🔔 New User Registration</h2>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">A new user has registered on MVB.</p>
                        
                        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0;">
                            <h3 style="color: #1e293b; margin-bottom: 15px; font-size: 16px;">User Details:</h3>
                            <p style="margin: 8px 0; color: #475569;">
                                <strong>Name:</strong> ${user.name}
                            </p>
                            <p style="margin: 8px 0; color: #475569;">
                                <strong>Email:</strong> ${user.email}
                            </p>
                            <p style="margin: 8px 0; color: #475569;">
                                <strong>Mobile:</strong> ${user.mobile}
                            </p>
                            <p style="margin: 8px 0; color: #475569;">
                                <strong>Registered At:</strong> ${new Date().toLocaleString()}
                            </p>
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/users" 
                               style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                                View All Users
                            </a>
                        </div>
                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                        <p style="color: #999; font-size: 12px; text-align: center;">This is an automated notification from MVB System.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('✅ Admin notification sent to:', adminEmail);
        return true;
    } catch (error) {
        console.error('❌ Admin notification error:', error);
        return false;
    }
};

const sendOTPEmail = async (email, otp) => {
    try {
        const mailOptions = {
            from: `"Customer Panel" <tharunkumarreddy1212@gmail.com>`,
            to: email,
            subject: 'Password Reset OTP',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
                    <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #2563eb; text-align: center; margin-bottom: 20px;">Password Reset</h2>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello,</p>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">You have requested to reset your password.</p>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">Use the following OTP to verify your identity:</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <div style="display: inline-block; background-color: #2563eb; color: white; padding: 15px 40px; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 5px;">
                                ${otp}
                            </div>
                        </div>
                        <p style="color: #666; font-size: 14px; line-height: 1.5;">This OTP is valid for 5 minutes. If you didn't request this, please ignore this email.</p>
                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                        <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message, please do not reply.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('✅ OTP email sent successfully');
        return true;
    } catch (error) {
        console.error('❌ OTP email error:', error);
        return false;
    }
};

const sendConfirmationEmail = async (email) => {
    try {
        const mailOptions = {
            from: `"Customer Panel" <tharunkumarreddy1212@gmail.com>`,
            to: email,
            subject: 'Password Reset Successful',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
                    <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #10b981; text-align: center; margin-bottom: 20px;">✅ Password Reset Successful</h2>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello,</p>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">Your password has been successfully reset.</p>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">If you didn't perform this action, please contact support immediately.</p>
                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                        <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message, please do not reply.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('✅ Confirmation email sent');
        return true;
    } catch (error) {
        console.error('❌ Confirmation email error:', error);
        return false;
    }
};

// ==================== USER ROUTES ====================

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

        const userData = {
            ...newUser[0],
            plainPassword: password // Only for email, not stored
        };

        // Send welcome email to user
        await sendWelcomeEmail(userData);

        // Send admin notification
        await sendAdminNotification(userData);

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

// ==================== CUSTOMER PASSWORD RESET ROUTES ====================

// 1. Forgot Password - Send OTP
router.post('/forgot-password', async (req, res) => {
    console.log('📧 Customer forgot password request received');
    
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Check if user exists
        const [userResults] = await db.query(
            'SELECT id, email FROM users WHERE email = ?',
            [email]
        );

        if (userResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No account found with this email address'
            });
        }

        // Generate OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Delete any existing reset entries for this email
        await db.query('DELETE FROM user_password_resets WHERE email = ?', [email]);

        // Insert new reset entry
        await db.query(
            'INSERT INTO user_password_resets (email, otp, expires_at) VALUES (?, ?, ?)',
            [email, otp, expiresAt]
        );

        console.log(`✅ OTP generated for customer ${email}: ${otp}`);

        // Send OTP via email
        const emailSent = await sendOTPEmail(email, otp);

        if (!emailSent) {
            await db.query('DELETE FROM user_password_resets WHERE email = ?', [email]);
            return res.status(500).json({
                success: false,
                message: 'Failed to send OTP. Please try again later.'
            });
        }

        res.json({
            success: true,
            message: 'OTP sent successfully to your email'
        });

    } catch (error) {
        console.error('❌ Customer forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error: ' + error.message
        });
    }
});

// 2. Verify OTP
router.post('/verify-otp', async (req, res) => {
    console.log('🔐 Customer OTP verification request received');
    
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Email and OTP are required'
            });
        }

        // Get the reset entry
        const [results] = await db.query(
            'SELECT * FROM user_password_resets WHERE email = ? AND otp = ?',
            [email, otp]
        );

        if (results.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP'
            });
        }

        const resetEntry = results[0];

        // Check if OTP is expired
        const now = new Date();
        const expiresAt = new Date(resetEntry.expires_at);

        if (now > expiresAt) {
            await db.query('DELETE FROM user_password_resets WHERE id = ?', [resetEntry.id]);
            return res.status(400).json({
                success: false,
                message: 'OTP has expired. Please request a new one.'
            });
        }

        console.log(`✅ OTP verified for customer ${email}`);

        res.json({
            success: true,
            message: 'OTP verified successfully'
        });

    } catch (error) {
        console.error('❌ Customer verify OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error: ' + error.message
        });
    }
});

// 3. Reset Password
router.post('/reset-password', async (req, res) => {
    console.log('🔑 Customer reset password request received');
    
    try {
        const { email, newPassword } = req.body;

        if (!email || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Email and new password are required'
            });
        }

        // Check if there's a valid OTP entry for this email
        const [results] = await db.query(
            'SELECT * FROM user_password_resets WHERE email = ?',
            [email]
        );

        if (results.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No OTP verification found. Please request OTP again.'
            });
        }

        const resetEntry = results[0];

        // Check if OTP is still valid (not expired)
        const now = new Date();
        const expiresAt = new Date(resetEntry.expires_at);

        if (now > expiresAt) {
            await db.query('DELETE FROM user_password_resets WHERE id = ?', [resetEntry.id]);
            return res.status(400).json({
                success: false,
                message: 'OTP has expired. Please request a new one.'
            });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user password
        await db.query(
            'UPDATE users SET password = ? WHERE email = ?',
            [hashedPassword, email]
        );

        // Delete the reset entry after successful reset
        await db.query('DELETE FROM user_password_resets WHERE email = ?', [email]);

        console.log(`✅ Password reset successfully for customer ${email}`);

        // Send confirmation email
        sendConfirmationEmail(email).catch(err => console.error('Confirmation email error:', err));

        res.json({
            success: true,
            message: 'Password reset successfully'
        });

    } catch (error) {
        console.error('❌ Customer reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error: ' + error.message
        });
    }
});

// 4. Resend OTP
router.post('/resend-otp', async (req, res) => {
    console.log('🔄 Customer resend OTP request received');
    
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Check if user exists
        const [userResults] = await db.query(
            'SELECT id, email FROM users WHERE email = ?',
            [email]
        );

        if (userResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No account found with this email address'
            });
        }

        // Generate new OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        // Delete old entry and insert new one
        await db.query('DELETE FROM user_password_resets WHERE email = ?', [email]);
        await db.query(
            'INSERT INTO user_password_resets (email, otp, expires_at) VALUES (?, ?, ?)',
            [email, otp, expiresAt]
        );

        console.log(`🔄 New OTP generated for customer ${email}: ${otp}`);

        // Send OTP via email
        const emailSent = await sendOTPEmail(email, otp);

        if (!emailSent) {
            await db.query('DELETE FROM user_password_resets WHERE email = ?', [email]);
            return res.status(500).json({
                success: false,
                message: 'Failed to send OTP. Please try again later.'
            });
        }

        res.json({
            success: true,
            message: 'New OTP sent successfully'
        });

    } catch (error) {
        console.error('❌ Customer resend OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error: ' + error.message
        });
    }
});

module.exports = router;